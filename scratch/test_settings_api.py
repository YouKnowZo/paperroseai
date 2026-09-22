"""End-to-end settings/keys API test against the mock-backed instance.

Covers: expired .env keys detected as dead -> pasted key flips the app to AI
mode -> analysis runs through the AI engine -> removing the key falls back to
the rules engine.

Run:  python scratch/test_settings_api.py          (instance must be on :5055)
"""

import json

import requests

BASE = "http://127.0.0.1:5055"
GOOD = "sk-test-good-key-123456"
BOGUS = "sk-proj-bogus-key-000000000000"

SAMPLE = (
    "These Terms of Service govern your use of the service. By accessing or using the service you "
    "agree to be bound by these terms and our privacy policy. All disputes arising out of or relating "
    "to these terms shall be resolved exclusively by binding arbitration on an individual basis, and "
    "you waive any right to participate in a class action or class-wide arbitration. You grant us a "
    "worldwide, perpetual license to use, reproduce and display any content you submit. We may sell "
    "aggregated data to third-party partners. Subscriptions renew automatically unless cancelled at "
    "least thirty days before the renewal date. We may modify these terms at any time at our sole "
    "discretion, and continued use constitutes acceptance. Our total liability shall not exceed the "
    "amounts paid by you in the three months preceding the claim."
)

results = []


def check(label, ok, detail=""):
    results.append(ok)
    print(f"  {'PASS' if ok else 'FAIL'}  {label}{'  — ' + detail if detail else ''}")


def brief(d):
    return {
        p: {"cfg": v["configured"], "src": v["source"], "valid": v["valid"], "kind": v["kind"]}
        for p, v in d["providers"].items()
    }


print("\n1. baseline — engine matches the keys it actually has")
h = requests.get(f"{BASE}/api/health", timeout=20).json()
st = requests.get(f"{BASE}/api/settings/keys", timeout=20).json()["providers"]
print("   health:", h["engine"], "| ai_available:", h["ai_available"], "|", brief({"providers": st}))
# Invariant: AI mode iff some provider is configured and not proven dead.
# (A cached verdict survives restarts by design, so this holds on any run.)
expect_ai = any(p["configured"] and p["valid"] is not False for p in st.values())
check("engine agrees with configured/verified keys", (h["engine"] == "ai") == expect_ai)
check("ai_available mirrors the engine", h["ai_available"] == expect_ai)

print("\n2. live check — expired keys must be marked invalid")
d = requests.post(f"{BASE}/api/settings/keys/check", timeout=60).json()
print("   providers:", json.dumps(brief(d)))
check("expired openai key marked invalid", d["providers"]["openai"]["valid"] is False)
check("engine falls back to heuristic once keys proven dead", d["engine"] == "heuristic")
check("message explains why", "Incorrect API key" in (d["providers"]["openai"]["message"] or ""))

print("\n3. paste a bad key — must be rejected, not saved")
r = requests.post(f"{BASE}/api/settings/keys", json={"provider": "openai", "key": BOGUS}, timeout=60).json()
print("   ->", {k: r.get(k) for k in ("ok", "valid", "kind")})
check("bad key rejected", r["ok"] is False and r["kind"] == "invalid")
after = requests.get(f"{BASE}/api/settings/keys", timeout=20).json()
check("nothing saved", after["providers"]["openai"]["source"] == "env")

print("\n4. paste the good key — saves, verifies, flips to AI mode")
r = requests.post(f"{BASE}/api/settings/keys", json={"provider": "openai", "key": GOOD}, timeout=60).json()
print("   ->", {k: r.get(k) for k in ("ok", "valid", "kind")}, "| engine:", r.get("engine"))
check("key verified live", r["ok"] is True and r["valid"] is True)
check("app flipped to AI mode", r["engine"] == "ai")
check("reported as saved (not env)", r["providers"]["openai"]["source"] == "saved")
check("key masked, never raw", GOOD not in json.dumps(r) and "…" in r["providers"]["openai"]["masked"])

print("\n5. analysis now runs through the AI engine")
a = requests.post(f"{BASE}/api/analyze/text", json={"text": SAMPLE}, timeout=120).json()
print("   meta:", a["meta"]["engine"], "|", a["meta"]["model"], "| grade", a["grade"])
check("engine == ai", a["meta"]["engine"] == "ai")
check("mock model used", a["meta"]["model"] == "gpt-4o-mini")
check("AI summary landed", any("mock provider" in s for s in a["plain_summary"]))
check("AI category verdicts merged", any("Reasonable" in (c.get("verdict") or "") for c in a["categories"]))

print("\n6. remove the saved key — falls back to the .env key and rules engine")
r = requests.delete(f"{BASE}/api/settings/keys/openai", timeout=30).json()
print("   -> fell_back_to_env:", r["fell_back_to_env"], "| engine:", r["engine"])
check("reported fallback to .env", r["fell_back_to_env"] is True)
check("engine back to heuristic (that key is dead)", r["engine"] == "heuristic")
a = requests.post(f"{BASE}/api/analyze/text", json={"text": SAMPLE}, timeout=120).json()
check("analysis back on the rules engine", a["meta"]["engine"] == "heuristic")

print("\n7. bad input handling")
bad_provider = requests.post(f"{BASE}/api/settings/keys", json={"provider": "nope", "key": GOOD}, timeout=20)
short = requests.post(f"{BASE}/api/settings/keys", json={"provider": "openai", "key": "abc"}, timeout=20)
check("unknown provider -> 400", bad_provider.status_code == 400)
check("too-short key -> 400", short.status_code == 400)

print(f"\n{sum(results)}/{len(results)} checks passed")
raise SystemExit(0 if all(results) else 1)
