"""Regression tests for response headers and sensitive-data-safe logging."""

import os
import sys
import unittest
from unittest.mock import patch

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.join(HERE, "..", "backend")
sys.path.insert(0, BACKEND)
os.environ["PAPERROSE_PUBLIC_MODE"] = "1"
os.environ["PAPERROSE_SKIP_KEY_CHECK"] = "1"
os.environ["PAPERROSE_KEYS_PATH"] = os.path.join(HERE, "security_headers_keys.json")
os.environ["PAPERROSE_ALLOWED_ORIGINS"] = "https://app.example.test"

import app as backend  # noqa: E402
import analyzer  # noqa: E402


class SecurityHeaderTests(unittest.TestCase):
    def test_api_responses_set_safe_headers_and_public_cors_is_allowlisted(self):
        response = backend.app.test_client().get(
            "/api/status/public",
            base_url="https://app.example.test",
            headers={"Origin": "https://app.example.test", "X-Forwarded-Proto": "https"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["X-Content-Type-Options"], "nosniff")
        self.assertEqual(response.headers["X-Frame-Options"], "DENY")
        self.assertEqual(response.headers["Referrer-Policy"], "no-referrer")
        self.assertIn("max-age=31536000", response.headers["Strict-Transport-Security"])
        self.assertEqual(response.headers["Access-Control-Allow-Origin"], "https://app.example.test")

    def test_log_url_discards_path_query_fragment_and_credentials(self):
        self.assertEqual(
            backend._safe_log_url("https://alice:password@example.test/account?token=secret#private"),
            "https://example.test/",
        )
        self.assertIsNone(backend._safe_log_url(None))

    def test_scan_logging_does_not_retain_sensitive_url_parts(self):
        with patch.object(backend.log, "info") as log_info:
            backend.log_scan("ok", "https://example.test/path?access_token=secret")
        logged_fields = log_info.call_args.kwargs["extra"]
        self.assertEqual(logged_fields["scan_url"], "https://example.test/")
        self.assertNotIn("secret", str(logged_fields))

    def test_provider_logs_keep_error_class_but_not_sensitive_message(self):
        secret = "test-secret-123456"
        error = RuntimeError(f"request failed with Authorization: Bearer {secret}")
        with patch.dict(os.environ, {"CLOUDFLARE_API_TOKEN": secret}), patch.object(
            analyzer.log, "warning"
        ) as warning:
            analyzer.log.warning("Cloudflare analysis failed: %s", analyzer._safe_log_error(error))
        logged = str(warning.call_args)
        self.assertIn("RuntimeError", logged)
        self.assertNotIn(secret, logged)


if __name__ == "__main__":
    unittest.main(verbosity=2)
