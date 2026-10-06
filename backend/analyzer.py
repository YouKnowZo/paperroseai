"""
PaperRoseAI — analysis engine.

Two layers:
  1. Heuristic scanner: deterministic regex pass that detects known predatory
     clauses (arbitration, auto-renewal, data selling, unilateral changes...),
     readability stats and category scores. Always available, zero cost.
  2. AI layer (local OpenAI -> Gemini fallback; public Cloudflare Workers AI): plain-English summary, per-category
     verdicts and a 0-100 fairness score. When no key is configured the
     heuristic result is normalized into the same shape, so the API contract
     never changes.
"""
import hashlib
import json
import logging
import math
import os
import re
from datetime import datetime, timezone

import requests
from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger("paperrose.analyzer")


def _is_public_mode() -> bool:
    default = "1" if os.getenv("VERCEL") else "0"
    return os.getenv("PAPERROSE_PUBLIC_MODE", default).strip().lower() in {"1", "true", "yes"}


MAX_AI_CHARS = 60_000

# --------------------------------------------------------------------------
# Grade + safety level mapping
# --------------------------------------------------------------------------

GRADES = [
    (93, "A+"), (85, "A"), (78, "B+"), (70, "B"),
    (62, "C+"), (55, "C"), (45, "D+"), (35, "D"), (0, "F"),
]


def letter_for(score: int) -> str:
    for floor, letter in GRADES:
        if score >= floor:
            return letter
    return "F"


def safety_level_for(score: int) -> str:
    if score >= 75:
        return "safe"
    if score >= 55:
        return "moderate"
    if score >= 35:
        return "caution"
    return "dangerous"


SAFETY_COPY = {
    "safe": {
        "headline": "This document largely respects your rights",
        "blurb": "No major red flags detected. Standard terms with fair user protections.",
    },
    "moderate": {
        "headline": "Mostly fair, with a few things to know",
        "blurb": "Generally standard terms, but skim the flagged clauses before agreeing.",
    },
    "caution": {
        "headline": "Some rights you'd expect are waived here",
        "blurb": "Several clauses tilt in the company's favor. Review the red flags below.",
    },
    "dangerous": {
        "headline": "Heavy user-side risk detected",
        "blurb": "This agreement takes a lot from you. Read the flags carefully before accepting.",
    },
}

# --------------------------------------------------------------------------
# Heuristic engine
# --------------------------------------------------------------------------

# (id, title, severity, explanation, regex patterns)
FLAG_RULES = [
    {
        "id": "arbitration",
        "title": "Forced arbitration",
        "severity": "high",
        "explanation": "You give up your right to sue in court or join a class action. Disputes go to a private arbitrator chosen under terms the company controls.",
        "cost": "If the company breaks its own rules you can't take it to court — and private arbitration rarely ends in the kind of damages a jury would award.",
        "patterns": [
            r"binding arbitrat(?:ion|e)",
            r"waive.{0,40}right to (?:a )?(?:jury trial|sue|class action)",
            r"class action waiver",
            r"small claims.{0,30}sole exception",
        ],
    },
    {
        "id": "jury_waiver",
        "title": "Jury trial waiver",
        "severity": "medium",
        "explanation": "Even when court is possible, a judge decides alone — no jury of your peers.",
        "cost": "A judge decides alone. Juries are the ones who hand down serious penalties when a company has behaved badly.",
        "patterns": [r"waive.{0,30}jury trial", r"trial by jury.{0,40}waiv"],
    },
    {
        "id": "class_action_waiver",
        "title": "Class action waiver",
        "severity": "high",
        "explanation": "You can't team up with other users in a group lawsuit. Small claims are often the only exception.",
        "cost": "Going it alone, your claim is usually too small to be worth suing over — which is exactly why this clause is written into so many agreements.",
        "patterns": [
            r"\bclass[- ]action (?:waiver|lawsuits?|claims?|actions?)\b",
            r"\bwaiv\w+\b[^.;]{0,50}\bclass[- ]action\b",
            r"\bclass[- ]action\b[^.;]{0,40}\b(?:waiv\w+|prohibit\w*|not (?:be )?(?:available|permitted))",
            r"\bclass[- ]wide arbitr",
        ],
        "reject": [
            r"\b(?:may (?:still )?(?:participate|join)|nothing .{0,25}prevents|does not waive|no waiver)\b",
        ],
    },
    {
        "id": "unilateral_changes",
        "title": "Terms can change anytime",
        "severity": "medium",
        "explanation": "The company can rewrite this agreement at any time, and continued use counts as accepting the new version — even the parts you never saw.",
        "cost": "Your rights can shrink after you've signed up, and the only warning may be a banner or an email you never read.",
        "patterns": [
            r"(?:reserv\w+ the right|may) (?:at any time|to )?(?:change|modify|amend|update) (?:these|this) (?:terms|agreement|t&c)",
            r"\b(?:may|can|reserve\w*)\b[^.;]{0,40}\b(?:modify|amend|change|update)\b[^.;]{0,50}\b(?:terms|agreement|conditions|policy|contract)\b[^.;]{0,30}\bat any time\b",
            r"continued use.{0,80}accept",
        ],
        "reject": [
            # "Beta Previews may change at any time" is about a feature, not the
            # contract, and must not read as "these terms can change anytime".
            r"\bbeta\b|\bpreview\b|\b(?:api|feature|product|app|plan|price|fee)s?\b|\bsoftware\b|\bservice levels?\b",
            # Promising notice before changes is the friendly version of this
            # clause, not the hostile one.
            r"\b(?:\d+|thirty|sixty|ninety) days?['’]? (?:prior |advance )?notice\b",
            r"\bwill (?:give|provide|notify) you\b[^.;]{0,30}\bnotice\b",
        ],
    },
    {
        "id": "data_selling",
        "title": "Your data can be sold",
        "severity": "high",
        "explanation": "Personal information may be sold, rented or traded to other companies — often with no opt-out and no way to get it back.",
        "cost": "Your data can end up with brokers and list buyers you never chose, and once it's sold there's no recalling it.",
        "patterns": [
            # The seller has to be the company and the object has to be personal
            # data, in the same sentence and close together. The old loose
            # version matched "cur[rent] [data]", "trade secrets" and GitHub's
            # rule forbidding *users* from selling data — flagging every major
            # site as selling data, which is what flattened every score.
            r"\b(?:sell|sells|selling|sold|rent|rents|renting|leased?|trades?|traded|trading)\b"
            r"[^.;]{0,45}\b(?:personal (?:information|data)|your (?:personal )?(?:information|data)|"
            r"user(?:s')? (?:personal )?(?:information|data)|customer (?:personal )?(?:information|data)|members' personal information)\b",
            r"\b(?:personal (?:information|data)|your (?:personal )?(?:information|data))\b"
            r"[^.;]{0,45}\b(?:can be|may be|is|are|were|has been|have been) (?:sold|rented|leased|traded|sublicensed)\b",
        ],
        "reject": [
            r"\b(?:trade secrets?|secrets?|resale|wholesale|retail store|trademark|sell(?:ing)? (?:goods|products|services|merchandise|tickets|cars)|seller|for sale)\b",
            r"\b(?:we|we'll|we will|company) (?:do not|does not|never|will not|won't|shall not) (?:sell|rent|trade)\b",
            r"\b(?:may not|must not|not permitted|prohibited|forbidden|not allowed) (?:to )?(?:sell|rent|trade)\b|\bno (?:personal )?(?:information|data) (?:is|will be) sold\b",
            r"\bsell(?:ing)? (?:personal )?(?:information|data)[^.;]{0,40}\b(?:with|only with) (?:your|prior|explicit) (?:consent|permission|opt-in)\b",
            r"\bnot use github for (?:spamming|illegal)|spamming purposes\b",
        ],
    },
    {
        "id": "data_sharing_ads",
        "title": "Data shared with advertisers and partners",
        "severity": "medium",
        "explanation": "Your information is shared with advertising and business partners — which in practice usually means data brokers too.",
        "cost": "Your activity feeds advertising networks, and what they learn about you gets passed on to other buyers.",
        "patterns": [
            # "third-party service providers" is ordinary outsourcing, not
            # advertising, so it is excluded in the pattern itself.
            # The thing being shared must be *your data*: "we provide you with
            # controls to manage third party apps" is not a disclosure clause.
            r"\b(?:share|shares|shared|sharing|disclose|discloses|disclosed|disclosing|provide|provided|transfer|transferred)\w*\b"
            r"[^.;]{0,30}\b(?:your|users['’]|customers['’]|personal|information|data)\b"
            r"[^.;]{0,30}\b(?:with|to)\b[^.;]{0,25}(?:advertis\w+|(?:marketing|business|advertising|commercial|data) partners?|"
            r"third[- ]part(?:y|ies)(?!\s+(?:service\s+)?(?:provider|processor|vendor|contractor|supplier|subprocessor|app|site|website|link|integration|developer))|"
            r"data brokers?|social media platforms)",
            r"\b(?:advertis\w+|partners?)\b[^.;]{0,25}\b(?:receive|access|use)\b[^.;]{0,25}\byour (?:personal )?(?:information|data)\b",
        ],
        "reject": [
            r"\b(?:we|we'll|we will|company) (?:do not|does not|never|will not|won't) (?:share|sell|disclose)\b",
            r"\b(?:only with|with) your (?:consent|permission|opt-in)\b|\bdo not share\b",
            # "this licence does not permit GitHub to share your Inputs with
            # third parties" is the opposite of a finding.
            r"\b(?:does not|do not|will not|shall not|is not permitted to|is not allowed to)\s+(?:permit|allow|authorize|license)\w*\b",
            r"\bnot use (?:the )?(?:api|service|site)\b|\bspamming purposes\b",
            # "This licence does not, however, permit GitHub to share..." — the
            # negation is not adjacent to the verb, so allow a short gap.
            r"\b(?:does not|do not|will not|shall not|is not|are not)[^.;]{0,20}\b(?:permit|allow|authorize|entitle|include)\b",
        ],
    },
    {
        "id": "tracking",
        "title": "Extensive cross-site tracking",
        "severity": "medium",
        "explanation": "Cookies, pixels, device fingerprinting or SDKs follow you across sites and apps to build an advertising profile.",
        "cost": "A profile follows you onto other sites and apps, and it can outlive the account you're about to create.",
        "patterns": [
            r"third[- ]party (?:cookies|trackers?|analytics)",
            r"device fingerprint",
            r"cross[- ](?:site|app|device) track",
            r"web beacons?|tracking pixels?",
        ],
    },
    {
        "id": "content_license",
        "title": "Broad license to your content",
        "severity": "medium",
        "explanation": "Anything you post grants the company a wide, often perpetual and royalty-free license to use, modify and even sublicense your content.",
        "cost": "Your work can be reused, modified, resold or shown elsewhere — and you may not be able to take it back even after deleting it.",
        "patterns": [
            # A license is normal; a *perpetual, irrevocable or sublicensable*
            # one is the rights grab. The old pattern also fired on plain
            # "license ... distribute", which is every ordinary T&C.
            r"\b(?:perpetual|irrevocable|sublicens\w+|transferable|perpetuity|in perpetuity)\b[^.;]{0,70}\blicen[cs]\w*\b",
            r"\blicen[cs]\w*\b[^.;]{0,70}\b(?:sublicens\w+|sell|resell|commerciali[sz]e|in perpetuity)\b",
            r"\bwaive\b[^.;]{0,40}\bmoral rights\b",
            r"\b(?:grant|hereby assign)\w*\b[^.;]{0,40}\bownership of your content\b",
        ],
        "reject": [
            r"\byou (?:retain|own|keep)\b|\bnonexclusive,? (?:and )?royalty[- ]free,? (?:worldwide )?licen[cs]e to (?:use|host|display) your content (?:solely )?(?:to|for) (?:provide|operate|improve)",
            # The feedback clause ("if you send us ideas or suggestions, you grant
            # a perpetual licence to use them") is in nearly every agreement and
            # is about voluntary suggestions, not the content you post.
            r"\b(?:feedback|ideas|suggestions?|enhancement requests?|recommendations?|know-how|bug reports?)\b",
        ],
    },
    {
        "id": "auto_renewal",
        "title": "Auto-renewing subscription",
        "severity": "medium",
        "explanation": "Paid plans renew automatically until you cancel — cancellation windows or notice periods may apply.",
        "cost": "Money leaves your account on a schedule, and missing the cancellation window can cost you another full period.",
        "patterns": [
            r"automatically renew",
            r"renew\w*.{0,30}automatically",
            r"auto[- ]renew",
            r"recur(?:ring|s) (?:payment|subscription|billing)",
            r"until (?:you|it is) cancel",
        ],
    },
    {
        "id": "no_refund",
        "title": "Payments are non-refundable",
        "severity": "medium",
        "explanation": "Fees you've paid generally can't be recovered, even if you stop using the service mid-cycle.",
        "cost": "Cancel late, change your mind, or watch the service break — the money already paid stays with them.",
        "patterns": [
            r"non[- ]refundable",
            r"no refunds?",
            r"not entitled to a refund",
            r"fees (?:are|shall be) non[- ]refundable",
        ],
    },
    {
        "id": "liability_cap",
        "title": "Liability capped (or excluded)",
        "severity": "medium",
        "explanation": "If something goes wrong, the company's maximum obligation is tiny (often the last month's fee) or zero — even for damages caused by its own negligence.",
        "cost": "If their mistake loses your data, takes the service down, or costs you real money, they owe you little or nothing back.",
        "patterns": [
            r"(?:IN NO EVENT|UNDER NO CIRCUMSTANCES).{0,120}(?:LIABLE|RESPONSIBLE)",
            r"shall (?:not )?be liable",
            r"limitation of liability",
            r"disclaim(?:s|er)?(?:s)? all warranties",
            r"AS IS.{0,20}AS AVAILABLE",
        ],
    },
    {
        "id": "indemnify",
        "title": "You cover their legal costs",
        "severity": "medium",
        "explanation": "You agree to pay for the company's legal fees if it gets sued because of something you did on the platform.",
        "cost": "You foot their lawyers' bill if a claim touches your account — it's uncapped, and can dwarf anything you ever paid them.",
        "patterns": [
            r"indemnif\w+",
            r"defend.{0,30}harmless",
            r"hold.{0,20}harmless",
        ],
    },
    {
        "id": "account_termination",
        "title": "Account can be terminated anytime",
        "severity": "low",
        "explanation": "The company can suspend or delete your account, for any or no reason, without prior warning.",
        "cost": "Your account and everything in it can vanish without warning, sometimes with no export and no way to appeal.",
        "patterns": [
            r"(?:suspend|terminate|delete).{0,60}(?:at any time|without (?:prior )?notice|for any reason)",
            r"terminate.{0,40}sole discretion",
        ],
        "reject": [
            # "You have a right to terminate this agreement at any time" is a right
            # *you* keep — flagging it as a termination risk inverts its meaning.
            r"\byou (?:have|may|can|are (?:free|entitled))\b[^.;]{0,40}\b(?:terminat|cancel|delete|deactivat|close|stop using)",
            r"\beither party (?:may|can)\b|\byou (?:and|or) \w+ may\b|\bnotification of termination\b",
        ],
    },
    {
        "id": "ip_assignment",
        "title": "Company owns feedback & suggestions",
        "severity": "low",
        "explanation": "Ideas, feedback or suggestions you send become the company's property, free to use forever.",
        "cost": "You hand over your ideas for nothing, and you get no share if they build a product from them.",
        "patterns": [
            r"(?:feedback|suggestions).{0,60}(?:assign|property of|belong)",
            r"assign.{0,40}(?:all right|intellectual property)",
        ],
    },
    {
        "id": "third_party_ads",
        "title": "Targeted advertising",
        "severity": "low",
        "explanation": "Your activity is used to target ads to you — the business model of many 'free' services.",
        "cost": "Your interests and activity are used to sell ads, and the profile built from them is shared with the buyers.",
        "patterns": [
            r"target(?:ed)? (?:advertis|ads)",
            r"interest[- ]based (?:ads|advertising)",
            r"personalized (?:ads|advertising|offers)",
        ],
    },
    {
        "id": "data_retention",
        "title": "Data kept after you leave",
        "severity": "low",
        "explanation": "Your information is retained after account closure, sometimes indefinitely or in backups.",
        "cost": "Copies stay on their servers after you leave, so a later breach can still expose data you thought you'd deleted.",
        "patterns": [
            r"retain.{0,60}(?:after|following) (?:account )?(?:closure|deletion|termination)",
            # "archive ... and make copies of Your Content" is a licence grant, not
            # retention, so a retention context is now required.
            r"(?:retain|keep|store|hold)\w*[^.;]{0,70}\b(?:backup|archiv\w+)[^.;]{0,30}\bcopies\b",
        ],
        "reject": [
            r"\byou (?:hereby )?grant\b|\bmake copies of your content\b|\bto provide,? develop",
        ],
    },
]

# Clauses that actually work in the user's favour. These carry real weight:
# they both lift the score and fill the "in your favour" section of the summary,
# so under-matching here makes the tool look harsher than the document is.
# Stems, not whole words — "deletion" must match "delete".
POSITIVE_PATTERNS = [
    (r"(?:data portability|export\w*.{0,25}(?:your )?data|download\w*.{0,25}(?:your )?data)",
     "You can take your data with you"),
    (r"(?:right to (?:access|know)).{0,50}(?:data|information)", "You can request the data held about you"),
    (r"(?:delet\w*|eras\w*).{0,40}(?:account|data|personal information)", "You can request deletion of your data"),
    (r"opt[- ]out.{0,50}(?:marketing|emails?|communications|targeted)", "Marketing opt-out is offered"),
    (r"(?:GDPR|CCPA|data protection regulation)", "References modern data-protection law (GDPR/CCPA)"),
    (r"(?:encryption|TLS|SSL).{0,60}(?:transmi|protect)", "Data is encrypted in transit"),
    (r"(?:\d{2})?[- ]?day(?:s)? (?:money[- ]back|refund)", "Money-back guarantee window"),
    (r"(?:do not|don't|never|will not|won't) (?:sell|share|rent).{0,30}(?:personal|your|user)",
     "Commitment not to sell personal data"),
    (r"(?:you|users?) (?:own|retain|keep)\w*.{0,40}(?:your|their) (?:content|data|intellectual property|work)",
     "You keep ownership of your content"),
    (r"(?:either party|you|subscriber\w*) (?:may|can) (?:cancel|terminate|close).{0,30}(?:at any time|anytime|whenever)",
     "You can cancel at any time"),
    (r"(?:\d{2}|thirty|sixty|ninety) days?.{0,30}notice.{0,60}(?:chang|modif|amend|terminat)",
     "Advance notice before terms change"),
    (r"small claims (?:court|tribunal)", "Small-claims court carve-out"),
]

CATEGORY_MAP = {
    "privacy": ["data_selling", "data_sharing_ads", "tracking", "third_party_ads", "data_retention"],
    "legal": ["arbitration", "jury_waiver", "class_action_waiver", "unilateral_changes", "indemnify", "ip_assignment"],
    "content": ["content_license"],
    "billing": ["auto_renewal", "no_refund"],
    "account": ["liability_cap", "account_termination"],
}

# --- Scoring model -------------------------------------------------------
#
# What each finding costs, in "concern points". The ordering here is the whole
# opinion of this tool, so it is worth being explicit about why the numbers are
# uneven.
#
# Cheap, because they are in essentially every commercial contract ever
# written: forced arbitration, a liability cap, an indemnity clause, a clause
# letting them change the terms. Charging these heavily is what made every
# real-world agreement score an identical 2/100 — the grade carried no
# information, so a user could not tell Spotify from a payday lender.
#
# Expensive, because they change what actually happens to you: your personal
# data being sold, a perpetual licence over what you post, money that renews
# without you noticing, bills you cannot get back, and the class-action waiver
# that removes your only realistic way to fight any of it.
FINDING_WEIGHTS = {
    "data_selling": 26,
    "data_sharing_ads": 8,
    "arbitration": 18,
    "class_action_waiver": 8,
    "content_license": 7,
    "tracking": 6,
    "third_party_ads": 6,
    "unilateral_changes": 6,
    "liability_cap": 5,
    "indemnify": 5,
    "auto_renewal": 5,
    "no_refund": 5,
    "data_retention": 4,
    "jury_waiver": 3,
    "account_termination": 3,
    "ip_assignment": 2,
}
DEFAULT_FINDING_WEIGHT = 5     # an unknown/new detector is treated as middling
DEFAULT_FINDING_COST = (
    "This clause shifts risk or rights away from you — read the full sentence before you agree."
)
CONTENT_GRAB_EXTRA = 8         # "perpetual, irrevocable, worldwide" wording

# Some findings are bad on their own: no amount of user-friendly clauses
# elsewhere should buy them off. Selling personal data must never coexist with
# a "safe to proceed" badge, however tidy the rest of the document reads.
SEVERITY_CAPS = {
    "data_selling": 40,        # caps the score at caution
}

# Penalty -> score uses a saturating curve rather than a straight subtraction.
# Linear subtraction drove anything with more than a handful of findings
# straight through the floor; diminishing returns keeps the first findings the
# most consequential while leaving the scale room to distinguish documents.
PENALTY_DECAY = 70.0           # larger = more forgiving curve
NO_PROTECTIONS_PENALTY = 6     # nothing at all in your favour is itself a signal
PROTECTION_BONUS = 3           # per user-friendly clause found, capped below
MAX_PROTECTION_BONUS = 9
MIN_SCORE, MAX_SCORE = 2, 98

# Wording that turns a normal content licence into a rights grab.
RIGHTS_GRAB = re.compile(
    r"perpetual|irrevocable|sublicens|royalty[- ]free|transferable|in perpetuity|waive.{0,20}moral rights",
    re.IGNORECASE,
)

RECOMMENDATIONS = {
    "safe": "Safe to proceed. Nothing in here should stop you from using this service.",
    "moderate": "Fine to proceed for most people — skim the flagged clauses first.",
    "caution": "Proceed with caution. Several clauses work against you; read the red flags before accepting.",
    "dangerous": "Don't accept blindly. This agreement gives away a lot — read the red flags and weigh the alternatives.",
}

# Sections of a typical T&C, for the per-category deep dive
CATEGORY_PROMPT_BITS = {
    "privacy": "data collection, sharing with third parties, tracking, retention",
    "legal": "arbitration, class actions, changes to terms, indemnification",
    "content": "ownership and licensing of user content",
    "billing": "payments, renewals, refunds",
    "account": "liability, warranties, termination",
}


def _first_sentence(text: str, limit: int = 170) -> str:
    text = re.sub(r"\s+", " ", text or "").strip()
    if not text:
        return ""
    m = re.match(r"(.+?[.!?])(?:\s|$)", text)
    sentence = m.group(1) if m else text
    if len(sentence) > limit:
        sentence = sentence[: limit - 1].rstrip(" ,;:") + "…"
    return sentence


def concern_penalty(flags: list) -> int:
    """Sum the weight of every finding. See FINDING_WEIGHTS for the reasoning."""
    penalty = 0
    for f in flags:
        penalty += FINDING_WEIGHTS.get(f["id"], DEFAULT_FINDING_WEIGHT)
        if f["id"] == "content_license" and RIGHTS_GRAB.search(f.get("quote", "")):
            penalty += CONTENT_GRAB_EXTRA
    return penalty


def score_from_penalty(penalty: float, positives: list, apply_nudges: bool = True) -> int:
    """Penalty -> 0-100 fairness score.

    `100 * exp(-penalty / PENALTY_DECAY)` is the whole curve. Anchor points:
    no findings -> 100, one high concern (~20) -> ~75, a typical industry
    agreement (~50) -> ~49, and a genuinely predatory stack (~100) -> ~24.
    """
    score = 100.0 * math.exp(-max(0.0, penalty) / PENALTY_DECAY)
    if apply_nudges:
        score += min(len(positives) * PROTECTION_BONUS, MAX_PROTECTION_BONUS)
        if not positives:
            score -= NO_PROTECTIONS_PENALTY
    return int(round(max(MIN_SCORE, min(MAX_SCORE, score))))


NEGATION = re.compile(
    r"\b(?:not|never|no|without|won['’]?t|will not|do not|does not|don['’]?t|doesn['’]?t|isn['’]?t|aren['’]?t|"
    r"refuse[sd]? to|cannot|can['’]?t|may not|must not|shall not|nothing|neither|nor)\b"
    r"[\w\s,]{0,16}$",
    re.IGNORECASE,
)

SENTENCE_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9(\"'])|(?<=;)\s+")


def _sentences(text: str) -> list:
    """Sentence-level windows to match against. See _match_rule for why."""
    parts = (s.strip() for s in SENTENCE_SPLIT.split(text))
    return [s for s in parts if 15 <= len(s) <= 1200]


def _clip_quote(sentence: str, limit: int = 240) -> str:
    s = re.sub(r"\s+", " ", sentence).strip()
    return s if len(s) <= limit else s[: limit - 1].rstrip(" ,;:") + "…"


def _match_rule(rule: dict, sentences: list):
    """First sentence that asserts this rule and isn't excluded by it.

    Matching per sentence — rather than anywhere in the document — is the single
    biggest correctness fix in this engine. A pattern that merely *co-occurred*
    with the right words used to be enough, so "cur[rent] data" matched "rent",
    "trade secrets" matched "trade", GitHub's rule *forbidding* users from
    selling data was reported as GitHub selling data, and every major site
    picked up a false high-risk "your data can be sold" flag. A wrong red flag
    is worse than a missing one: the whole point is trusting the verdict.
    """
    patterns = [re.compile(p, re.IGNORECASE | re.DOTALL) for p in rule["patterns"]]
    rejects = [re.compile(p, re.IGNORECASE) for p in rule.get("reject", ())]
    for sent in sentences:
        if any(r.search(sent) for r in rejects):
            continue
        for pat in patterns:
            for m in pat.finditer(sent):
                # "We will never sell your data" is not a finding.
                if NEGATION.search(sent[max(0, m.start() - 30):m.start()]):
                    continue
                # The match itself is the evidence the UI shows the user, so they
                # can check the scanner's work rather than take its word for it.
                matched = re.sub(r"\s+", " ", m.group(0)).strip()
                return _clip_quote(sent), _clip_phrase(matched)
    return None


def _clip_phrase(phrase: str, limit: int = 140) -> str:
    return phrase if len(phrase) <= limit else phrase[: limit - 1].rstrip() + "…"


def _why_flagged(matched: str | None) -> str:
    """Plain-English answer to "why did you flag this?".

    A user clicking a clause is checking the scanner's work, so the answer names
    the exact wording that triggered it — or says plainly that no fixed pattern
    matched and an AI did the reading.
    """
    if matched:
        return f'The scanner matched this wording in the document: “{matched}”.'
    return "Flagged by the AI reading this passage — no fixed wording pattern matched."


# Typographic punctuation is normalised before matching. Real pages are full of
# curly quotes: Google's privacy policy says "we don’t share information", and
# with a straight-apostrophe regex the negation was invisible — so a promise NOT
# to share was reported as sharing.
SMART_CHARS = {
    "’": "'", "‘": "'", "“": '"', "”": '"',
    "—": "-", "–": "-", "…": "...",
    "\u00a0": " ", "\u2009": " ", "\u202f": " ", "\ufeff": "",
}


def _normalise(text: str) -> str:
    for src, dst in SMART_CHARS.items():
        if src in text:
            text = text.replace(src, dst)
    return text


def heuristic_scan(text: str) -> dict:
    """Deterministic pass: flags, positives, stats, category scores, score."""
    compact = _normalise(re.sub(r"\s+", " ", text))
    lower = compact.lower()

    sentences = _sentences(compact)
    flags = []
    for rule in FLAG_RULES:
        hit = _match_rule(rule, sentences)
        if not hit:
            continue
        quote, matched = hit
        flags.append({
            "id": rule["id"],
            "title": rule["title"],
            "severity": rule["severity"],
            "explanation": rule["explanation"],
            "cost": rule.get("cost") or DEFAULT_FINDING_COST,
            "why": _why_flagged(matched),
            "matched": matched,
            "quote": quote,
        })

    positives = []
    for pat, label in POSITIVE_PATTERNS:
        if re.search(pat, lower, re.IGNORECASE):
            positives.append(label)

    # Score: charge each real-world concern once, then map through the curve.
    penalty = concern_penalty(flags)
    score = score_from_penalty(penalty, positives)

    # ...then let the worst individual clauses put a ceiling on it.
    caps = [cap for fid, cap in SEVERITY_CAPS.items() if any(f["id"] == fid for f in flags)]
    if caps:
        score = min(score, min(caps))

    # Readability adjustment: walls of text correlate with worse terms.
    words = len(compact.split())
    sentences = max(1, len(re.findall(r"[.!?]+", compact)))
    avg_sentence = words / sentences
    if avg_sentence > 28:
        score -= 4
    elif avg_sentence < 18:
        score += 2

    score = max(MIN_SCORE, min(MAX_SCORE, int(round(score))))

    categories = []
    for cat_id, meta in {
        "privacy": ("Data Privacy", "What they collect and who they share it with"),
        "legal": ("Legal Traps", "Arbitration, waivers and one-sided terms"),
        "content": ("Your Content", "Ownership and licensing of what you post"),
        "billing": ("Billing & Refunds", "Payments, renewals and getting money back"),
        "account": ("Account & Liability", "Termination, warranties and damage caps"),
    }.items():
        cat_flags = [f for f in flags if f["id"] in CATEGORY_MAP[cat_id]]
        cat_score = max(MIN_SCORE, min(100, score_from_penalty(concern_penalty(cat_flags), [], apply_nudges=False)))
        level = safety_level_for(cat_score)
        if cat_flags:
            worst = sorted(cat_flags, key=lambda f: {"high": 0, "medium": 1, "low": 2}[f["severity"]])
            verdict = "Watch out: " + ", ".join(f["title"].lower() for f in worst[:3]) + "."
        elif cat_score >= 75:
            verdict = "Nothing alarming found in this area."
        else:
            verdict = "No explicit red-flag language, but the section is vague."
        categories.append({
            "id": cat_id,
            "name": meta[0],
            "description": meta[1],
            "score": cat_score,
            "level": level,
            "verdict": verdict,
        })

    return {
        "flags": flags,
        "positives": positives,
        "categories": categories,
        "score": score,
        "penalty": penalty,
        "stats": {
            "words": words,
            "sentences": sentences,
            "avg_sentence_len": round(avg_sentence, 1),
            "reading_time_min": max(1, round(words / 220)),
        },
    }


# --------------------------------------------------------------------------
# AI layer
# --------------------------------------------------------------------------

AI_SYSTEM_PROMPT = """You are PaperRoseAI, an expert consumer-rights analyst. You read Terms & Conditions / Privacy Policies and explain them to everyday people.

Respond with ONLY valid JSON matching this schema (no markdown fences):
{
  "plain_summary": [4-6 short strings, each one plain-English takeaway a 12-year-old could understand],
  "safety_headline": "one punchy sentence describing the overall deal",
  "score": <integer 0-100, how fair this agreement is TO THE USER>,
  "flags": [
    {
      "id": "<snake_case_unique_id>",
      "title": "<short clause name>",
      "severity": "high" | "medium" | "low",
      "explanation": "<1-2 sentences: what it means for the user in plain English>",
      "cost": "<1 sentence, concrete: what this clause costs the user in practice — money, data, time, or a right they give up>",
      "quote": "<exact short quote from the document, max 200 chars>",
      "section": "<best-guess section heading>"
    }
  ],
  "positives": ["<good things the agreement does for users>"],
  "categories": [
    {"id": "privacy", "verdict": "<1 sentence plain-English verdict>", "score": <0-100 fairness to user>},
    {"id": "legal", "verdict": "...", "score": <0-100>},
    {"id": "content", "verdict": "...", "score": <0-100>},
    {"id": "billing", "verdict": "...", "score": <0-100>},
    {"id": "account", "verdict": "...", "score": <0-100>}
  ],
  "did_you_know": [1-2 surprising facts a user would want to know]
}

Scoring guidance: 90+ = genuinely user-friendly; 75+ = fair standard terms; 55-74 = normal industry terms with some sharp edges; 35-54 = user-unfriendly, several rights waived; below 35 = predatory. Severity "high" = thing most users would refuse if they understood it. Always find the actual red flags; do not invent ones that aren't in the text."""

AI_USER_TMPL = """Analyze this {doc_kind} and return the JSON described.

Category focus:
- privacy: {privacy}
- legal: {legal}
- content: {content}
- billing: {billing}
- account: {account}

DOCUMENT:
---
{text}
---"""


def _clip_for_ai(text: str) -> str:
    if len(text) <= MAX_AI_CHARS:
        return text
    head = text[: MAX_AI_CHARS - 20000]
    tail = text[-18000:]
    return head + "\n\n[... middle of document omitted for length ...]\n\n" + tail


def _call_openai(text: str, doc_kind: str) -> dict | None:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None
    try:
        from openai import OpenAI
        # OPENAI_BASE_URL lets you point at a proxy, a gateway (Azure, LiteLLM,
        # OpenRouter) or a local OpenAI-compatible server.
        base_url = os.getenv("OPENAI_BASE_URL") or None
        # 30s, not 90s: the document is clipped to a summary-sized window, so a
        # call that hasn't answered in half a minute is not going to. A scan
        # that appears to hang is worse than one that falls back to rules.
        client = OpenAI(api_key=api_key, base_url=base_url, timeout=AI_TIMEOUT, max_retries=1)
        resp = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.2,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": AI_SYSTEM_PROMPT},
                {"role": "user", "content": AI_USER_TMPL.format(
                    doc_kind=doc_kind,
                    privacy=CATEGORY_PROMPT_BITS["privacy"],
                    legal=CATEGORY_PROMPT_BITS["legal"],
                    content=CATEGORY_PROMPT_BITS["content"],
                    billing=CATEGORY_PROMPT_BITS["billing"],
                    account=CATEGORY_PROMPT_BITS["account"],
                    text=_clip_for_ai(text),
                )},
            ],
        )
        return json.loads(resp.choices[0].message.content)
    except Exception as e:
        log.warning("OpenAI analysis failed: %s", e)
        return None


CLOUDFLARE_MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast"


def _call_cloudflare(text: str, doc_kind: str) -> dict | None:
    """Use Cloudflare Workers AI; the API token remains server-side."""
    api_token = os.getenv("CLOUDFLARE_API_TOKEN", "").strip()
    account_id = os.getenv("CLOUDFLARE_ACCOUNT_ID", "").strip()
    if not api_token or not re.fullmatch(r"[a-fA-F0-9]{32}", account_id):
        return None
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{CLOUDFLARE_MODEL}"
    user_prompt = AI_USER_TMPL.format(
        doc_kind=doc_kind,
        privacy=CATEGORY_PROMPT_BITS["privacy"],
        legal=CATEGORY_PROMPT_BITS["legal"],
        content=CATEGORY_PROMPT_BITS["content"],
        billing=CATEGORY_PROMPT_BITS["billing"],
        account=CATEGORY_PROMPT_BITS["account"],
        text=_clip_for_ai(text),
    )
    try:
        resp = requests.post(
            url,
            headers={"Authorization": f"Bearer {api_token}"},
            json={
                "messages": [
                    {"role": "system", "content": AI_SYSTEM_PROMPT},
                    {"role": "user", "content": user_prompt},
                ],
                "temperature": 0.2,
                "max_tokens": 4096,
            },
            timeout=AI_TIMEOUT,
        )
        resp.raise_for_status()
        result = resp.json().get("result") or {}
        raw = result.get("response") or ""
        raw = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
        return json.loads(raw) if raw else None
    except Exception as e:
        log.warning("Cloudflare Workers AI analysis failed: %s", e)
        return None


def _call_gemini(text: str, doc_kind: str, allow_free_ai: bool = False) -> dict | None:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None
    if _is_public_mode():
        if not allow_free_ai:
            log.info("Gemini call skipped: no per-scan consent")
            return None
        if os.getenv("GEMINI_FREE_TIER_CONSENT", "0").strip().lower() not in {"1", "true", "yes"}:
            log.warning("Gemini call skipped: public free-tier processing is not operator-enabled")
            return None
    base = (os.getenv("GEMINI_BASE_URL") or "https://generativelanguage.googleapis.com/v1beta").rstrip("/")
    url = f"{base}/models/gemini-3.1-flash-lite:generateContent"
    prompt = AI_SYSTEM_PROMPT + "\n\n" + AI_USER_TMPL.format(
        doc_kind=doc_kind,
        privacy=CATEGORY_PROMPT_BITS["privacy"],
        legal=CATEGORY_PROMPT_BITS["legal"],
        content=CATEGORY_PROMPT_BITS["content"],
        billing=CATEGORY_PROMPT_BITS["billing"],
        account=CATEGORY_PROMPT_BITS["account"],
        text=_clip_for_ai(text),
    )
    try:
        resp = requests.post(
            url,
            headers={"x-goog-api-key": api_key},
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {"responseMimeType": "application/json", "temperature": 0.2},
            },
            timeout=AI_TIMEOUT,
        )
        resp.raise_for_status()
        parts = resp.json()["candidates"][0]["content"]["parts"]
        raw = "".join(p.get("text", "") for p in parts)
        raw = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.MULTILINE).strip()
        return json.loads(raw)
    except Exception as e:
        log.warning("Gemini analysis failed: %s", e)
        return None


# --------------------------------------------------------------------------
# Normalization + public entry point
# --------------------------------------------------------------------------

VALID_SEVERITIES = {"high", "medium", "low"}


def _norm_flag(f: dict) -> dict | None:
    try:
        fid = str(f.get("id") or re.sub(r"[^a-z0-9]+", "_", str(f.get("title", ""))).strip("_")).lower()[:60]
        title = str(f.get("title") or fid.replace("_", " ").title())[:120]
        sev = str(f.get("severity", "medium")).lower()
        sev = sev if sev in VALID_SEVERITIES else "medium"
        explanation = str(f.get("explanation") or "")[:600]
        quote = str(f.get("quote") or "")[:300]
        section = str(f.get("section") or "")[:120]
        cost = str(f.get("cost") or "")[:400]
        if not explanation:
            return None
        return {"id": fid, "title": title, "severity": sev,
                "explanation": explanation, "cost": cost,
                "quote": quote, "section": section}
    except Exception:
        return None


# Lookup for filling in detail the AI left out — the model often reuses the
# collector's ids ("arbitration"), and its flags must not expand to less
# information than a purely rules-based one does.
RULE_META = {r["id"]: r for r in FLAG_RULES}


def _explain_flag(flag: dict) -> dict:
    """Guarantee every flag carries why-it-was-flagged and what-it-costs detail."""
    rule = RULE_META.get(flag.get("id")) or {}
    if not flag.get("cost"):
        flag["cost"] = rule.get("cost") or DEFAULT_FINDING_COST
    flag.setdefault("quote", "")
    flag.setdefault("matched", "")
    flag["why"] = flag.get("why") or _why_flagged(flag.get("matched"))
    return flag


def _merge_flags(ai_flags: list, heuristic_flags: list) -> list:
    """AI flags win; deterministic scanner adds anything AI missed (safety net)."""
    merged, seen = [], set()
    for f in ai_flags:
        n = _norm_flag(f)
        if n and n["id"] not in seen:
            seen.add(n["id"])
            merged.append(n)
    for f in heuristic_flags:
        if f["id"] not in seen:
            seen.add(f["id"])
            merged.append(f)
    order = {"high": 0, "medium": 1, "low": 2}
    merged.sort(key=lambda x: order.get(x["severity"], 1))
    return [_explain_flag(f) for f in merged]


# Cap on a single provider call. See the note at the OpenAI client below.
AI_TIMEOUT = 30


def _live_keys() -> dict:
    """Provider keys worth calling, per the settings store's verdicts.

    Keys the last check proved the provider rejects are skipped. Without this,
    every analysis of an app with a dead key sitting in .env paid the full
    provider timeout before quietly falling back to the rules engine — around a
    minute of dead latency per scan, for a call that could never succeed.
    """
    try:
        import keys_store
    except Exception:
        return {
            "openai": os.getenv("OPENAI_API_KEY"),
            "gemini": os.getenv("GEMINI_API_KEY"),
        }
    try:
        return {p: keys_store.live_key(p) for p in ("openai", "gemini")}
    except Exception:
        return {"openai": os.getenv("OPENAI_API_KEY"), "gemini": os.getenv("GEMINI_API_KEY")}


def analyze_text(text: str, doc_kind: str = "Terms & Conditions", allow_free_ai: bool = False) -> dict:
    """Run deterministic rules and, when authorized, an optional AI summary."""
    text = re.sub(r"\r\n", "\n", text)
    heur = heuristic_scan(text)

    # Track which provider actually answered — reporting "gpt-4o-mini" just
    # because an OpenAI key exists would be a lie when Gemini did the work.
    ai, provider_used, model_used = None, None, None
    keys = _live_keys()
    public_mode = _is_public_mode()
    if public_mode:
        operator_opt_in = os.getenv("CLOUDFLARE_FREE_TIER_CONSENT", "0").strip().lower() in {"1", "true", "yes"}
        cloudflare_ready = bool(
            os.getenv("CLOUDFLARE_API_TOKEN")
            and re.fullmatch(r"[a-fA-F0-9]{32}", os.getenv("CLOUDFLARE_ACCOUNT_ID", ""))
            and os.getenv("TURNSTILE_SECRET_KEY")
            and os.getenv("TURNSTILE_SITE_KEY")
            and os.getenv("TURNSTILE_ALLOWED_HOSTNAMES")
        )
        if allow_free_ai and operator_opt_in and cloudflare_ready:
            ai = _call_cloudflare(text, doc_kind)
            if ai:
                provider_used, model_used = "cloudflare", CLOUDFLARE_MODEL
    else:
        if keys.get("openai"):
            ai = _call_openai(text, doc_kind)
            if ai:
                provider_used, model_used = "openai", "gpt-4o-mini"
        # Preserve the local OpenAI -> Gemini fallback. Cloudflare's public
        # opt-in path is deliberately unavailable to pasted/uploaded content.
        if not ai and keys.get("gemini"):
            ai = _call_gemini(text, doc_kind)
            if ai:
                provider_used, model_used = "gemini", "gemini-3.1-flash-lite"

    flags = _merge_flags((ai or {}).get("flags") or [], heur["flags"])
    categories = heur["categories"]
    if ai:
        verdicts = {c.get("id"): c for c in (ai.get("categories") or []) if isinstance(c, dict)}
        for cat in categories:
            v = verdicts.get(cat["id"]) or {}
            if v.get("verdict"):
                cat["verdict"] = str(v["verdict"])[:300]
            try:
                cat["score"] = max(1, min(100, int(v.get("score", cat["score"]))))
            except (TypeError, ValueError):
                pass

    if ai:
        try:
            score = max(1, min(100, int(ai.get("score", heur["score"]))))
        except (TypeError, ValueError):
            score = heur["score"]
        # Keep the AI honest: it may read a document more generously than the
        # regex pass, but only by a bounded margin — otherwise a model that
        # doesn't notice an arbitration clause can hand out an A.
        ceiling = min(MAX_SCORE, heur["score"] + 15)
        score = min(score, ceiling)
        engine, model = "ai", model_used
    else:
        score = heur["score"]
        engine, model = "heuristic", "rules-engine v2"

    level = safety_level_for(score)

    plain_summary = [str(s)[:280] for s in (ai or {}).get("plain_summary") or []][:6]
    if not plain_summary:
        plain_summary = _fallback_summary(heur, flags, level, score)

    positives = [str(p)[:200] for p in (ai or {}).get("positives") or heur["positives"]][:6]
    did_you_know = [str(d)[:300] for d in (ai or {}).get("did_you_know") or []][:3]

    headline = str((ai or {}).get("safety_headline") or SAFETY_COPY[level]["headline"])[:200]

    stats = heur["stats"]

    return {
        "meta": {
            "engine": engine,
            "model": model,
            "provider": provider_used,
            "doc_kind": doc_kind,
            "words": stats["words"],
            "reading_time_min": stats["reading_time_min"],
            "avg_sentence_len": stats["avg_sentence_len"],
        },
        "score": score,
        "grade": letter_for(score),
        "safety_level": level,
        "safety_headline": headline,
        "safety_blurb": SAFETY_COPY[level]["blurb"],
        "recommendation": RECOMMENDATIONS[level],
        "concern_penalty": heur.get("penalty"),
        "plain_summary": plain_summary,
        "flags": flags,
        "positives": positives,
        "categories": categories,
        "did_you_know": did_you_know,
        "analyzed_at": datetime.now(timezone.utc).isoformat(),
    }


# The first bullet is always the answer to the only question a user actually
# has: is this safe to sign? Everything after it is supporting evidence.
VERDICT_LINE = {
    "safe": "Verdict: safe to proceed — this agreement is fairer than most and nothing here is designed to trap you.",
    "moderate": "Verdict: safe to proceed for most people, but read the flagged clauses before you agree.",
    "caution": "Verdict: proceed with caution — several clauses in here work against you.",
    "dangerous": "Verdict: do not accept this blindly — you would be signing away significant rights.",
}

# A "caution" rating with no serious finding shouldn't be phrased like a warning;
# overstating the evidence is how a scanner loses the user's trust.
VERDICT_CAUTION_MILD = (
    "Verdict: mostly standard terms with a few sharp edges — safe to use, but skim the points below."
)


def _fallback_summary(heur: dict, flags: list, level: str, score: int = 50) -> list:
    """Rules-engine summary: the verdict first, then what it costs you, then the upside.

    Written as real sentences with the consequence spelled out, so the result is
    usable with no API key at all.
    """
    stats = heur["stats"]
    highs = [f for f in flags if f["severity"] == "high"]
    meds = [f for f in flags if f["severity"] == "medium"]
    lows = [f for f in flags if f["severity"] == "low"]

    # 1. The verdict — the user's actual question, answered up front.
    if level == "caution" and not highs:
        out = [VERDICT_CAUTION_MILD]
    else:
        out = [VERDICT_LINE[level]]

    if not flags:
        out.append("No known predatory clause patterns matched at all — nothing in the text looks designed to take advantage of you.")

    # 2. The most serious findings, in plain English, not just clause names.
    for f in (highs + meds + lows)[:3]:
        sentence = _first_sentence(f["explanation"])
        if sentence:
            out.append(f"{f['title']} — {sentence}")
        else:
            out.append(f"{f['title']}.")

    if flags and not highs:
        out.append("Nothing critical stood out; the flagged clauses above are still worth a skim before you agree.")

    # 3. What's actually in your favour, if anything.
    if heur["positives"]:
        out.append("In your favour: " + "; ".join(p.lower() for p in heur["positives"][:3]) + ".")
    elif flags:
        out.append("No user-friendly protections were found in the text — no clear right to export, delete or opt out.")

    # 4. Provenance, so it's clear this was a rules scan and not an AI reading.
    if _is_public_mode():
        ai_enabled = bool(os.getenv("CLOUDFLARE_API_TOKEN")) and os.getenv("CLOUDFLARE_FREE_TIER_CONSENT", "0").strip().lower() in {"1", "true", "yes"}
        ai_tip = "Opt in to the optional AI summary on a website scan for a fuller walkthrough." if ai_enabled else "Review the quoted clauses before making a decision; automated scans may miss nuance."
    else:
        ai_tip = "Add an API key in settings for a full plain-English walkthrough."
    out.append(
        f"{stats['words']:,} words, about {stats['reading_time_min']} min of reading. "
        f"Rules-based scan ({score}/100) — {ai_tip}"
    )
    return out[:6]


def doc_fingerprint(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8", "ignore")).hexdigest()[:12]
