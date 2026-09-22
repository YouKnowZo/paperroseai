"""Mock OpenAI/Gemini provider for testing the API-key settings flow.

The real keys in .env are expired, so this stands in for the providers and
lets us verify the whole happy path: paste key -> "key accepted" -> app flips
to AI mode -> analysis actually runs through the AI engine.

Run:  python scratch/mock_provider.py [port]      (default 8766)
Then start the backend with:
  OPENAI_BASE_URL=http://127.0.0.1:8766/v1
  GEMINI_BASE_URL=http://127.0.0.1:8766/v1beta
  OPENAI_API_KEY=  GEMINI_API_KEY=            (blank: nothing preconfigured)
  PAPERROSE_KEYS_PATH=scratch/test_keys.json  (don't touch real keys)
"""

import json
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

GOOD_KEY = "sk-test-good-key-123456"

# A minimal but shape-correct analysis payload (same contract analyzer.py reads).
AI_PAYLOAD = {
    "score": 72,
    "safety_headline": "Mostly fair, with a few clauses worth knowing about.",
    "plain_summary": [
        "The mock provider generated this summary.",
        "You keep ownership of your content.",
        "Disputes go to arbitration, so you waive court in most cases.",
    ],
    "categories": [
        {"id": "privacy", "score": 78, "verdict": "Reasonable data practices."},
        {"id": "legal", "score": 60, "verdict": "Arbitration clause is broad."},
        {"id": "content", "score": 80, "verdict": "You keep your content."},
        {"id": "billing", "score": 74, "verdict": "Renews yearly, cancels anytime."},
        {"id": "account", "score": 70, "verdict": "Termination is at their discretion."},
    ],
    "flags": [
        {
            "id": "ai_forced_arbitration",
            "title": "Forced arbitration",
            "severity": "high",
            "explanation": "Disputes must go to private arbitration instead of court.",
            "quote": "any dispute shall be resolved by binding arbitration",
        }
    ],
    "positives": ["Clear cancellation path", "You keep your content"],
    "did_you_know": ["Arbitration waivers are common in US terms."],
}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, fmt, *args):  # quieter test output
        sys.stderr.write("mock %s\n" % (fmt % args))

    def _json(self, code, body):
        raw = json.dumps(body).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def _bearer(self):
        auth = self.headers.get("Authorization", "")
        return auth[7:] if auth.lower().startswith("bearer ") else ""

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/v1/models":
            if self._bearer() != GOOD_KEY:
                return self._json(401, {"error": {"message": "Incorrect API key provided (mock)."}})
            return self._json(200, {"object": "list", "data": [{"id": "gpt-4o-mini"}]})
        if path == "/v1beta/models":
            query = self.path.split("?", 1)[1] if "?" in self.path else ""
            if f"key={GOOD_KEY}" not in query:
                return self._json(400, {"error": {"message": "API key not valid. Please pass a valid API key. (mock)"}})
            return self._json(200, {"models": [{"name": "models/gemini-2.0-flash"}]})
        return self._json(404, {"error": {"message": "not found (mock)"}})

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        self.rfile.read(length) if length else None
        path = self.path.split("?")[0]
        payload = json.dumps(AI_PAYLOAD)
        if path == "/v1/chat/completions":
            if self._bearer() != GOOD_KEY:
                return self._json(401, {"error": {"message": "Incorrect API key provided (mock)."}})
            return self._json(200, {
                "choices": [{"message": {"role": "assistant", "content": payload}}],
            })
        if path.endswith("gemini-2.0-flash:generateContent"):
            query = self.path.split("?", 1)[1] if "?" in self.path else ""
            if f"key={GOOD_KEY}" not in query:
                return self._json(400, {"error": {"message": "API key not valid. (mock)"}})
            return self._json(200, {
                "candidates": [{"content": {"parts": [{"text": payload}]}}],
            })
        return self._json(404, {"error": {"message": "not found (mock)"}})


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8766
    print(f"mock provider on http://127.0.0.1:{port} (good key: {GOOD_KEY})", flush=True)
    ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
