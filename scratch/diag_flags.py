"""Inspect what the rules engine actually detects on real sites.

Prints each finding with the sentence it matched, so a missing arbitration
clause or a bogus flag is visible rather than guessed at.

Usage:  python scratch/diag_flags.py [label=url ...]
"""

import re
import sys

sys.path.insert(0, "backend")

import app  # noqa: E402
import analyzer  # noqa: E402

DEFAULT = [
    ("GitHub ToS", "https://docs.github.com/en/site-policy/github-terms/github-terms-of-service"),
    ("Slack ToS", "https://slack.com/terms-of-service/user"),
    ("Google Privacy", "https://policies.google.com/privacy"),
    ("Spotify EULA", "https://www.spotify.com/us/legal/end-user-agreement/"),
    ("X Terms", "https://x.com/en/tos"),
]

# Recall expectations deliberately live in test_detection_precision.py, pinned to
# sentences verified against the fetched text. (Guessing here wasted a cycle:
# GitHub's terms genuinely contain no arbitration, jury or class-action clause,
# and Slack's user terms have none either — so "0 high flags" was correct.)
EXPECT: dict = {}

def main():
    targets = DEFAULT
    if len(sys.argv) > 1:
        targets = [(a, b) for a, b in (arg.split("=", 1) for arg in sys.argv[1:])]

    for label, url in targets:
        text, title, status, _related, _html = app.extract_from_url(url)
        print("=" * 100)
        print(f"{label}  [{status}] {len(text.split())} words  title={title[:60]!r}")
        result = analyzer.analyze_text(text, "Terms & Conditions")
        found = [f["id"] for f in result["flags"]]
        for f in result["flags"]:
            print(f"  {f['severity']:<6} {f['id']:<22} {f['quote'][:110]}")
        missing = [e for e in EXPECT.get(label, []) if e not in found]
        print(f"  -> score={result['score']} {result['safety_level']}  found={found}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
