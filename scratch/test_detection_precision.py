"""Detection-precision regression battery.

Every sentence marked REAL BELOW was harvested from a live terms/privacy page
that previously produced a WRONG verdict, or that must keep producing a RIGHT
one. A false red flag ("your data can be sold" on a page promising the
opposite) destroys trust in the whole rating, so these cases are pinned here.

Usage:  python scratch/test_detection_precision.py     (no server needed)
"""

import sys

sys.path.insert(0, "backend")

import analyzer  # noqa: E402

# (label, sentence, finding that MUST appear — or None meaning "nothing at all")
CASES = [
    # --- Real sentences that must NOT raise a finding -----------------------
    ("Google privacy: curly apostrophe",
     "We don’t share information that personally identifies you with advertisers, such as your name or email, unless you ask us to.", None),
    ("Google privacy: connected apps",
     "We also provide you with controls to review and manage third party apps and sites you have given access to data.", None),
    ("GitHub: negated licence grant",
     "This license does not, however, permit GitHub or its Affiliates to share your Inputs or Outputs with third parties.", None),
    ("GitHub: beta preview caveat",
     "Beta Previews may not be supported or may change at any time.", None),
    ("GitHub: content licence (ordinary)",
     "License Grant to Us You grant GitHub and our Affiliates the right to store, host, archive, parse, display, and make copies of Your Content as necessary to provide, develop, and improve the Service.", None),
    ("Feedback clause (ubiquitous)",
     "If you choose to give us any ideas, suggestions, enhancement requests or feedback, you grant GitHub a perpetual, irrevocable licence to use them.", None),
    ("X: the user's own right to leave",
     "You have a right to terminate this agreement at any time by deactivating your account and discontinuing use of the Services.", None),
    ("Ordinary outsourcing",
     "We share your personal information with third-party service providers who process it for us.", None),
    ("Never-sell promise",
     "We will never sell your personal information, and we do not rent your data.", None),
    ("Trade secrets (word 'trade')",
     "You agree not to disclose our trade secrets or confidential information.", None),
    ("'current data' (substring 'rent')",
     "We retain current data about your account for as long as it is needed.", None),
    ("Ordinary hosting licence",
     "You grant us a non-exclusive, worldwide licence to use, display and distribute your content solely to operate the Services.", None),
    ("Terms change WITH notice",
     "We may modify this agreement, but we will give you 30 days' notice of material changes.", None),
    ("Anti-spam rule (site forbids selling)",
     "You may not use the API to download data for spamming purposes, including for the purposes of selling GitHub users' personal information.", None),

    # --- Real clauses that MUST be caught ----------------------------------
    ("Data sold outright",
     "We may sell your personal information to third parties for commercial purposes.", "data_selling"),
    ("Data rented",
     "We rent your personal data to marketing companies.", "data_selling"),
    ("Data 'may be sold' (passive)",
     "Your personal information may be sold or transferred to third parties.", "data_selling"),
    ("Shared with advertisers",
     "We may share your personal information with advertisers and marketing partners.", "data_sharing_ads"),
    ("Disclosed for marketing",
     "We disclose information to third parties for marketing purposes.", "data_sharing_ads"),
    ("Retention after closure",
     "We retain your personal information for 7 years after account deletion.", "data_retention"),
    ("Backup copies retained",
     "We retain encrypted backup copies of your data for 90 days.", "data_retention"),
    ("Terms change anytime",
     "We reserve the right to modify these terms at any time.", "unilateral_changes"),
    ("Account terminated anytime",
     "We may suspend or terminate your account at any time without notice.", "account_termination"),
    ("Binding arbitration",
     "Any dispute will be resolved by binding arbitration and you agree to a class action waiver.", "arbitration"),
    ("Perpetual rights grab",
     "You grant us a perpetual, irrevocable, worldwide, royalty-free, sublicensable licence to use your content for any purpose.", "content_license"),
    ("Non-refundable fees",
     "All fees paid are non-refundable.", "no_refund"),
    ("Auto-renewing plan",
     "Your subscription will automatically renew at the end of each billing period.", "auto_renewal"),
]


def main():
    failures = []
    for label, text, expect in CASES:
        found = [f["id"] for f in analyzer.heuristic_scan(text)["flags"]]
        if expect is None:
            ok = not found
            detail = f"expected no finding, got {found}"
        else:
            ok = expect in found
            detail = f"expected {expect}, got {found}"
        if not ok:
            failures.append(f"  ! {label}: {detail}")
        print(f"{'ok  ' if ok else 'FAIL'} {label}")

    # The two ends of the scale must be far apart, or the rating means nothing.
    hostile = ("We may sell your personal information to third parties. You agree to binding arbitration and "
               "waive your right to a class action and a jury trial. You grant us a perpetual, irrevocable, "
               "royalty-free licence to sublicense your content. Your subscription renews automatically and all "
               "fees are non-refundable. We may modify these terms at any time.")
    friendly = ("You own your content and retain all rights to it. We will never sell your personal data. You can "
                "export or delete your data at any time. We will give you 30 days notice before we change these "
                "terms. You can cancel at any time and we will refund unused time.")
    h = analyzer.heuristic_scan(hostile)["score"]
    f = analyzer.heuristic_scan(friendly)["score"]
    gap = f - h
    print(f"\nhostile={h} friendly={f} separation={gap}")
    if not (h < 35 <= f and gap >= 55):
        failures.append(f"  ! separation too small: hostile={h} friendly={f}")

    print(f"\n{len(CASES) + 1 - len(failures)}/{len(CASES) + 1} passed")
    for line in failures:
        print(line)
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
