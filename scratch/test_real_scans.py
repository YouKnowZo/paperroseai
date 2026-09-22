"""Scan real, live terms/privacy pages and report what the app actually produces.

Usage:  python scratch/test_real_scans.py [--only N] [--url URL]
Requires the backend on :5000 (rules-engine mode is fine).
"""

import json
import sys
import time
import urllib.error
import urllib.request

BASE = "http://127.0.0.1:5000"

URLS = [
    ("Google Terms", "https://policies.google.com/terms"),
    ("Google Privacy", "https://policies.google.com/privacy"),
    ("GitHub ToS", "https://docs.github.com/en/site-policy/github-terms/github-terms-of-service"),
    ("Apple iTunes ToS", "https://www.apple.com/legal/internet-services/itunes/us/terms.html"),
    ("Amazon ToS", "https://www.amazon.com/gp/help/customer/display.html?nodeId=508088"),
    ("Microsoft Services Agreement", "https://www.microsoft.com/en-us/servicesagreement"),
    ("OpenAI Terms", "https://openai.com/policies/terms-of-use/"),
    ("Reddit User Agreement", "https://www.reddit.com/policies/user-agreement"),
    ("Spotify EULA", "https://www.spotify.com/us/legal/end-user-agreement/"),
    ("Zoom Terms", "https://zoom.us/terms"),
    ("Slack ToS", "https://slack.com/terms-of-service/user"),
    ("Shopify Terms", "https://www.shopify.com/legal/terms"),
    ("PayPal User Agreement", "https://www.paypal.com/us/legalhub/useragreement-full"),
    ("TikTok ToS", "https://www.tiktok.com/legal/page/us/terms-of-service/en"),
    ("X Terms", "https://x.com/en/tos"),
    # Deliberately user-friendly anchors: these should NOT come back scary.
    ("ANCHOR: Mozilla ToS", "https://www.mozilla.org/en-US/about/legal/terms/services/"),
    ("ANCHOR: DuckDuckGo Privacy", "https://duckduckgo.com/privacy"),
    # Controls — these are NOT terms documents, so the guard should reject them.
    ("CONTROL: Wikipedia", "https://en.wikipedia.org/wiki/Terms_of_service"),
    ("CONTROL: example.com", "https://example.com"),
]

# Predatory agreement, submitted as pasted text (this is the real-world case the
# rules engine must catch regardless of any AI key).
HOSTILE = (
    "We may sell your personal information to third parties for commercial purposes. "
    "You agree that all disputes will be resolved by binding individual arbitration and you waive "
    "your right to a class action and to a trial by jury. "
    "By posting content you grant us a worldwide, perpetual, irrevocable, royalty-free license to "
    "sublicense and distribute it. Your subscription renews automatically until you cancel and all "
    "fees are non-refundable. We may modify these terms at any time and your continued use "
    "constitutes acceptance of the new terms. Our liability is limited to the amount you paid. "
    "You agree to indemnify us against all claims. We may terminate your account at any time "
    "without notice."
)

FRIENDLY = (
    "You own your content and retain all rights to it. We will never sell your personal data. "
    "You can export or delete your data at any time. We will give you 30 days notice before we "
    "change these terms. You can cancel at any time and we will refund unused time. Disputes may "
    "be resolved in small claims court."
)


def paste(text, doc_kind="Terms & Conditions"):
    req = urllib.request.Request(
        f"{BASE}/api/analyze/text",
        data=json.dumps({"text": text, "doc_kind": doc_kind}).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return r.status, json.load(r)
    except urllib.error.HTTPError as e:
        return e.code, json.load(e)


def check_samples():
    """The rules engine must separate a predatory contract from a fair one."""
    print("\nsample contracts (pasted text, no AI key needed):")
    results = {}
    for name, body in (("FRIENDLY", FRIENDLY), ("HOSTILE", HOSTILE)):
        status, res = paste(body)
        if status != 200:
            print(f"  ! {name}: HTTP {status} {res}")
            continue
        results[name] = res["score"]
        flags = res.get("flags") or []
        print(f"  {name:8} score={res['score']:>3} grade={res['grade']:3} level={res['safety_level']:10} "
              f"flags={len(flags):>2}  '{res['plain_summary'][0][:74]}'")
    if len(results) == 2:
        gap = results["FRIENDLY"] - results["HOSTILE"]
        ok = gap >= 45 and results["HOSTILE"] < 35 and results["FRIENDLY"] >= 75
        print(f"  separation = {gap} points -> {'OK' if ok else 'TOO CLOSE: the rating is not discriminating'}")
        return ok
    return False


def scan(url, timeout=180):
    req = urllib.request.Request(
        f"{BASE}/api/analyze/url",
        data=json.dumps({"url": url}).encode(),
        headers={"Content-Type": "application/json"},
    )
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return round(time.time() - t0, 1), r.status, json.load(r)
    except urllib.error.HTTPError as e:
        try:
            body = json.load(e)
        except Exception:
            body = {"error": (e.read() or b"")[:200].decode("utf-8", "replace")}
        return round(time.time() - t0, 1), e.code, body
    except Exception as e:
        return round(time.time() - t0, 1), 0, {"error": f"{type(e).__name__}: {e}"}


def main():
    only = None
    if "--only" in sys.argv:
        only = int(sys.argv[sys.argv.index("--only") + 1])
    url_override = None
    if "--url" in sys.argv:
        url_override = sys.argv[sys.argv.index("--url") + 1]
        urls = [("custom", url_override)]
    else:
        urls = URLS[:only] if only else URLS

    ok, bad = [], []
    print(f"\n{'site':32} {'st':>3} {'t':>5}  {'grade':5} {'score':5} {'level':10} {'words':>6} {'flags':>5}  summary[0]")
    print("-" * 150)
    for name, url in urls:
        dt, status, body = scan(url)
        if status == 200 and "grade" in body:
            flags = body.get("flags") or []
            highs = sum(1 for f in flags if f["severity"] == "high")
            summ = (body.get("plain_summary") or [""])[0][:58]
            print(f"{name:32} {status:>3} {dt:>4}s  {body['grade']:5} {body['score']:<5} {body['safety_level']:10} "
                  f"{body['meta']['words']:>6} {len(flags):>3}({highs}h)  {summ}")
            ok.append((name, body))
            if body["meta"]["words"] < 400:
                bad.append((name, f"only {body['meta']['words']} words extracted"))
        else:
            err = (body.get("error") or str(body))[:90]
            print(f"{name:32} {status:>3} {dt:>4}s  {err}")
            bad.append((name, f"HTTP {status}: {err}"))

    print(f"\n{len(ok)}/{len(urls)} scanned, {len(bad)} needing attention")
    for name, why in bad:
        print(f"  ! {name}: {why}")

    # Sanity checks on the graded results
    print("\nverdict sanity:")
    for name, b in ok:
        lvl, sc = b["safety_level"], b["score"]
        expect = ("safe" if sc >= 75 else "moderate" if sc >= 55 else "caution" if sc >= 35 else "dangerous")
        mark = "ok " if lvl == expect else "MISMATCH"
        if lvl != expect:
            print(f"  ! {name}: level={lvl} but score={sc} implies {expect}")
    print("  (no output above = every level matches its score band)")

    samples_ok = check_samples()

    # The headline question: are the ratings actually distinguishable?
    if ok:
        scores = sorted(b["score"] for _, b in ok)
        grades = sorted({b["grade"] for _, b in ok})
        print(f"\nscore spread: {scores[0]} .. {scores[-1]} across {len(scores)} documents"
              f" -> {'spread OK' if scores[-1] - scores[0] >= 40 else 'TOO FLAT'}")
        print(f"distinct grades: {len(grades)} ({', '.join(grades)})")

    return 0 if not bad and samples_ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
