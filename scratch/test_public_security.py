"""Public-mode security tests. Run with: python scratch/test_public_security.py"""

import ipaddress
import os
import sys
import unittest
from datetime import datetime, timezone
from unittest.mock import Mock, patch
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(HERE, "..", "backend")
sys.path.insert(0, BACKEND)
os.environ["PAPERROSE_PUBLIC_MODE"] = "1"
os.environ["PAPERROSE_SKIP_KEY_CHECK"] = "1"
os.environ["PAPERROSE_KEYS_PATH"] = os.path.join(HERE, "public_security_keys.json")
os.environ["PAPERROSE_ALLOWED_ORIGINS"] = "https://app.example.test"
os.environ["TURNSTILE_SITE_KEY"] = "test-site-key"
os.environ["TURNSTILE_SECRET_KEY"] = "test-secret-key"
os.environ["TURNSTILE_ALLOWED_HOSTNAMES"] = "app.example.test"

import app as backend  # noqa: E402
import analyzer  # noqa: E402


class PublicSecurityTests(unittest.TestCase):
    def setUp(self):
        self.client = backend.app.test_client()

    def test_public_analysis_fails_closed_without_turnstile_token(self):
        response = self.client.post(
            "/api/analyze/text",
            json={"text": "x" * 200},
            headers={"Origin": "https://app.example.test"},
        )
        self.assertEqual(response.status_code, 403)

    def test_public_analysis_requires_an_allowlisted_origin(self):
        with patch.object(backend.requests, "post") as siteverify:
            response = self.client.post(
                "/api/analyze/text",
                json={"text": "x" * 200, "turnstile_token": "valid-token"},
                headers={"Origin": "https://attacker.example"},
            )
        self.assertEqual(response.status_code, 403)
        siteverify.assert_not_called()

    def test_public_analysis_accepts_a_fresh_matching_turnstile_token(self):
        siteverify = Mock()
        siteverify.raise_for_status.return_value = None
        siteverify.json.return_value = {
            "success": True,
            "action": "paperrose_scan",
            "hostname": "app.example.test",
            "challenge_ts": datetime.now(timezone.utc).isoformat(),
        }
        result = {"meta": {}, "score": 80}
        text = "Terms of Service. " + "This agreement describes service terms. " * 10
        with patch.object(backend.requests, "post", return_value=siteverify) as verify, patch.object(
            backend, "analyze_text", return_value=result
        ) as scan:
            response = self.client.post(
                "/api/analyze/text",
                json={"text": text, "turnstile_token": "valid-token"},
                headers={"Origin": "https://app.example.test"},
            )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["Access-Control-Allow-Origin"], "https://app.example.test")
        self.assertEqual(verify.call_args.kwargs["data"]["response"], "valid-token")
        self.assertFalse(scan.call_args.kwargs["allow_free_ai"])

    def test_turnstile_rejects_missing_action_and_stale_challenge(self):
        for fields in (
            {"success": True, "hostname": "app.example.test", "challenge_ts": datetime.now(timezone.utc).isoformat()},
            {"success": True, "action": "paperrose_scan", "hostname": "app.example.test", "challenge_ts": "2000-01-01T00:00:00+00:00"},
        ):
            response = Mock()
            response.raise_for_status.return_value = None
            response.json.return_value = fields
            with self.subTest(fields=fields), backend.app.test_request_context("/api/analyze/text"), patch.object(
                backend.requests, "post", return_value=response
            ):
                self.assertFalse(backend._verify_turnstile("valid-token"))

    def test_malformed_and_non_object_json_returns_400(self):
        for payload in ("[]", "null", '"text"', "{broken"):
            with self.subTest(payload=payload):
                response = self.client.post("/api/analyze/text", data=payload,
                    content_type="application/json", headers={"Origin": "https://app.example.test"})
                self.assertEqual(response.status_code, 400)
                self.assertIn("error", response.get_json())

    def test_oversized_request_returns_json_413(self):
        response = self.client.post("/api/analyze/text", data=b"x" * (4 * 1024 * 1024 + 1),
            content_type="application/json", headers={"Origin": "https://app.example.test"})
        self.assertEqual(response.status_code, 413)
        self.assertIn("error", response.get_json())

    def test_public_buddy_settings_cannot_be_changed(self):
        self.assertEqual(self.client.post("/api/buddy/config", json={"muted": True}).status_code, 403)

    def test_public_key_management_is_disabled(self):
        self.assertEqual(self.client.post("/api/settings/keys", json={}).status_code, 403)
        self.assertEqual(self.client.delete("/api/settings/keys/openai").status_code, 403)
        self.assertEqual(self.client.post("/api/settings/keys/check").status_code, 403)

    def test_public_health_does_not_expose_provider_status_or_key_path(self):
        health = self.client.get("/api/health").get_json()
        self.assertTrue(health["public_mode"])
        self.assertNotIn("provider_status", health)
        self.assertNotIn("keys_path", health)

    def test_cors_rejects_unconfigured_origin(self):
        response = self.client.options(
            "/api/health",
            headers={
                "Origin": "https://attacker.example",
                "Access-Control-Request-Method": "GET",
            },
        )
        self.assertNotIn("Access-Control-Allow-Origin", response.headers)

    def test_ssrf_blocks_loopback_private_and_credentials(self):
        for url in ("http://127.0.0.1/", "http://10.0.0.1/", "http://localhost/", "https://user@public.example/"):
            with self.subTest(url=url), self.assertRaises(backend.UnsafeUrlError):
                backend._validate_public_url(url)

    def test_ssrf_rejects_private_dns_answers(self):
        answers = [(2, 1, 6, "", ("192.168.1.12", 443))]
        with patch.object(backend.socket, "getaddrinfo", return_value=answers):
            with self.assertRaises(backend.UnsafeUrlError):
                backend._validate_public_url("https://internal.example/")

    def test_redirect_is_revalidated_before_connecting(self):
        class Response:
            status = 302

            @staticmethod
            def getheader(name, default=None):
                return "http://127.0.0.1/admin" if name.lower() == "location" else default

        connection = Mock()
        public_target = (urlparse("https://public.example/start"), ipaddress.ip_address("93.184.216.34"), 443)
        real_validate = backend._validate_public_url

        def validate(url):
            if url == "https://public.example/start":
                return public_target
            return real_validate(url)

        with patch.object(backend, "_validate_public_url", side_effect=validate), patch.object(
            backend, "_fetch_pinned_response", return_value=(connection, Response())
        ) as fetch:
            with self.assertRaises(backend.UnsafeUrlError):
                backend._fetch_public_page("https://public.example/start")
        fetch.assert_called_once()
        connection.close.assert_called_once()

    def test_pasted_text_cannot_opt_in_to_hosted_ai(self):
        result = {"meta": {}, "score": 50}
        with backend.app.app_context(), patch.object(backend, "analyze_text", return_value=result) as scan:
            backend._do_analysis("Terms " + "word " * 40, "Terms", "text", allow_free_ai=True)
        self.assertFalse(scan.call_args.kwargs["allow_free_ai"])

    def test_cloudflare_request_keeps_token_in_header_and_parses_json(self):
        payload = {"plain_summary": ["Mock summary"], "flags": [], "categories": []}
        response = Mock()
        response.json.return_value = {"result": {"response": __import__("json").dumps(payload)}}
        response.raise_for_status.return_value = None
        with patch.dict(os.environ, {"CLOUDFLARE_ACCOUNT_ID": "a" * 32, "CLOUDFLARE_API_TOKEN": "test-token"}), patch.object(
            analyzer.requests, "post", return_value=response
        ) as post:
            result = analyzer._call_cloudflare("Terms content", "Terms")
        self.assertEqual(result["plain_summary"], ["Mock summary"])
        args, kwargs = post.call_args
        self.assertIn("/accounts/" + "a" * 32 + "/ai/run/@cf/meta/llama-3.3-70b-instruct-fp8-fast", args[0])
        self.assertEqual(kwargs["headers"]["Authorization"], "Bearer test-token")
        self.assertNotIn("test-token", str(kwargs["json"]))


if __name__ == "__main__":
    unittest.main(verbosity=2)
