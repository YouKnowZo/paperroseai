# PaperRoseAI — by Paperbagexpress

**AI-powered Terms & Conditions reader** — paste a link, text, or upload a file and get an
instant **fairness grade (A–F)**, **safety levels per category**, **red flags with quotes**,
and a **plain-English summary**.

## How it works

1. **Heuristic engine** (always on, zero cost): 16 deterministic rules catch known predatory
   clauses — forced arbitration, class-action waivers, data selling, auto-renewals,
   liability caps, unilateral changes, and more — plus positive signals (GDPR refs,
   deletion rights, opt-outs) and readability stats.

   Two details decide whether the grade is worth trusting:
   * **Matching is sentence-scoped, with explicit exclusions.** A clause only counts when the
     whole clause says it — "we will *never* sell your data", "this licence does not permit…",
     "trade secrets", and "cur*rent* *data*" are not findings. Window-based matching used to
     flag data-selling on Google, Mozilla and GitHub, which flattened every score into one bucket.
   * **Penalties are weighted and saturating.** Ubiquitous boilerplate (a liability cap, a
     termination clause) costs little; what actually harms you (selling data, a perpetual
     rights grab) costs a lot, and the total runs through a decaying curve so documents stay
     distinguishable instead of all hitting the floor. A verified high-harm clause caps the
     score at "caution" regardless of how friendly the rest reads.
2. **AI layer** (optional): local development can use OpenAI (`gpt-4o-mini`) or Gemini (`gemini-3.1-flash-lite`). Public deployment can use Cloudflare Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) for a website scan only after user consent and operator configuration. Pasted/uploaded text always stays on the deterministic rules path. The deterministic engine cross-checks AI flags and clamps its score if it is too generous. Public users never need to enter API keys.
3. **Graceful fallback**: no key or a failed call? The app still grades, flags and summarizes.
   Keys the settings page has already verified as *rejected* are skipped rather than retried on
   every scan, so a dead key in `.env` costs nothing (0.01s instead of ~55s of timeouts).
   A page that only renders in JavaScript is reported honestly — after trying the legal pages
   that site itself links to.

## Does the rating actually mean anything?

The scores are calibrated against real agreements, not invented. Spread across 16 live
terms/privacy pages: **39–98**, eight distinct grades — from DuckDuckGo 98/A+ and Google 92/A
to Spotify 39/D (forced arbitration + class-action waiver + content licence), with
non-contracts (a Wikipedia article) rejected outright rather than graded. A deliberately
predatory pasted contract scores 23/F against a user-friendly one at 98/A+.

Grades reflect **what the document says**, not the company's reputation. Run it yourself:

```bash
backend/venv/Scripts/python backend/app.py       # start the local API
# In another terminal, from the repository root:
backend/venv/Scripts/python -X utf8 scratch/test_real_scans.py
backend/venv/Scripts/python -X utf8 scratch/test_detection_precision.py   # no server needed
```

`test_detection_precision.py` pins 28 cases: real sentences harvested from live pages that must
**not** raise a finding (curly-apostrophe negations, negated licences, the feedback clause,
beta previews, your own right to cancel), and real clauses that must. `test_settings_api.py`
and `test_keys_concurrency.py` cover the key store.

### What it refuses to do — on purpose

A scanner that guesses is worse than one that says "I can't read this":

* **Not a legal document** → refused, not graded. (A Wikipedia article *about* terms of service
  used to come back as an F; now the page is rejected for lacking contract framing.)
* **JavaScript-only page** → says so, and first tries the legal pages the site itself links to
  (that's how a JS-heavy site's policy still gets read). The buggy alternative — grading the
  navigation boilerplate — is how a site scored D because of its menu.
* **A pasted fragment shorter than a sentence or two** → refused with the character count.
  One sentence is not enough to grade safely, and a false A+ is the worst possible output.
* **Nothing readable fetched** → the honest message plus the alternatives: a direct URL, paste,
  upload, browser extension, or (local only) bookmarklet.

## 🔍 Click any red flag to see the evidence

Each flagged clause opens into a small case file instead of asking you to take a grade on
faith:

* **Why it was flagged** — the exact wording that triggered the detector, quoted.
* **What the document says** — the full sentence, with that wording highlighted inside it, so
  you can read the clause in context and judge for yourself.
* **What it costs you** — one practical sentence: the money, data, time or right you give up.
* **Where it lives** — the section heading, when the document has one.

The payload behind this is `why`, `cost`, `matched` and `quote` on every flag. AI-supplied
flags get the same detail: the model is asked for its own `cost`, and anything it leaves out
is backfilled from the detector table by clause id (a model flag called `arbitration` still
explains what arbitration costs you).

## Safety levels

| Score | Level | Meaning |
|-------|-------|---------|
| 75–100 | 🟢 Safe | Largely respects your rights |
| 55–74 | 🟡 Moderate | Mostly fair, skim the flags |
| 35–54 | 🟠 Caution | Several rights waived |
| 0–34 | 🔴 High Risk | Heavy user-side risk |

## Run it locally

**Backend** (Python 3.10+, uses `backend/venv`):

```bash
backend/venv/Scripts/python backend/app.py       # from repository root; API on port 5000
```

**Frontend** (Vite + React 19):

```bash
cd frontend
npm install
npm run dev        # http://localhost:3001 — proxies /api to the Flask backend
```

## Deploy to Vercel

Deploy this monorepo as **one Vercel Services project**. The root [vercel.json](vercel.json)
builds the Vite frontend and Flask backend as separate services, then routes `/api/*` to Flask
and all other paths to the frontend under one domain. In Vercel, connect the repository with its
root directory set to `.` and project framework set to **Services**; this requires both the
dashboard setting and the `services` configuration in `vercel.json`. API requests use the same
origin, so leave `VITE_API_URL` unset. Configure `PAPERROSE_PUBLIC_MODE=1`, the exact
`PAPERROSE_ALLOWED_ORIGINS`, Turnstile settings, `VITE_SITE_URL` (the production HTTPS origin),
and (if enabling AI) Cloudflare Workers AI settings as project Environment Variables. Never
commit secrets. Deploy production branch `main`.

The hosted Python function body limit is 4.5 MB, so the public backend caps uploads/requests at
4 MiB (local mode remains 16 MiB). Serverless functions have ephemeral writable storage; public
mode disables key CRUD and does not rely on local JSON persistence. Scan throttling is
process-local and resets with new function instances, so a hard per-IP/day cap can
reset between invocations on serverless hosts. Turnstile and the exact
origin allowlist are required public-gate mechanisms; the rate cap is a soft
backstop, not a strict abuse fence. Public scans fail closed if either gate is not
fully configured.

### Public deployment privacy and provider choice

The public deployment scans with rules-only analysis by default. Optional website-only AI uses a
Cloudflare Workers AI token held exclusively in backend environment variables. Visitors must opt
in on each URL scan; pasted/uploaded text never reaches hosted AI. Cloudflare states Workers AI
customer content is not used to train models or improve services. Free allocation is shared at the
account level and does not guarantee quota or uptime. See the current [pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
and [data-use terms](https://developers.cloudflare.com/workers-ai/platform/data-usage/) before enabling it.

For production, enable `PAPERROSE_PUBLIC_MODE=1`, set the exact public origin, and configure
`TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, and `TURNSTILE_ALLOWED_HOSTNAMES`. Set
`VITE_SITE_URL` to the canonical HTTPS origin so canonical metadata and the sitemap contain
absolute public URLs. Enable
`CLOUDFLARE_FREE_TIER_CONSENT=1` only after reviewing provider terms; set `CLOUDFLARE_ACCOUNT_ID`
and `CLOUDFLARE_API_TOKEN` server-side if using hosted AI. Keep all secrets out of Git and
browser `VITE_*` variables. Public scans fail closed without Siteverify.

## Easy settings

The public app works without an API key. Visitors cannot store provider keys in hosted public
settings. For local, private use, the settings panel can verify OpenAI or Gemini keys. These are
stored locally in `backend/keys.json` or can be set in ignored `backend/.env`; never commit either.

## Simple navigation

The main navbar points to **How it works**, **Browser extension**, and **Start a free review**.
Within a report it offers **Overview**, **Risk areas**, and **Important clauses**. Normal browser
Back/Forward remain available through the browser controls.

## Browser extension: Chrome, Edge, Brave, Firefox

Use the extension section on the homepage to download the **Chrome / Edge / Brave** or **Firefox**
ZIP, extract it, and load the matching folder as an unpacked (Chromium) or temporary (Firefox)
extension. Chromium steps: open `chrome://extensions` (or equivalent), enable Developer mode,
choose **Load unpacked**, select `chromium`. Firefox steps: visit
`about:debugging#/runtime/this-firefox`, choose **Load Temporary Add-on…**, select the `firefox`
`manifest.json`.

Click the extension on an agreement page. It copies up to 60,000 characters of *visible* text to
the clipboard and opens PaperRoseAI; you review/paste and submit manually. No background scans,
auto-submit, cookie access, hidden-field reading, or broad host permissions. Public Turnstile
verification still applies.

**Not yet store-listed/signed:** currently provided as unpacked/test extension source, not in the
Chrome Web Store, Edge Add-ons, AMO, or other browser stores. Firefox temporary extensions are
removed on restart. Opera may support the Chromium package. Safari requires separate signed
Safari Web Extension packaging and is not included. Source and production files are in `frontend/public/browser-extension/`.
That folder is the single source of truth for the browser extension.

## Affiliate income (optional, off until approved)

No ad network, subscription, or checkout provider is connected. Affiliate recommendations stay
hidden unless you have an approved, relevant partner referral URL. LegalZoom’s official
[partner program](https://www.legalzoom.com/partner-programs) accepts applications from publishers,
influencers, and partners providing education or end-customer need; it requires an application and
approval. Apply before configuring any referral offer. Then configure public Vercel build variables
`VITE_AFFILIATE_PARTNER_NAME` and `VITE_AFFILIATE_URL` with the approved program name and secure
HTTPS referral URL. Beneath completed reports, the optional offer is marked sponsored and clearly
discloses possible commission at no extra cost. Missing, invalid, insecure, and placeholder links
remain hidden. Respect the program's terms and applicable affiliate disclosure rules; never fake a
partner or call ordinary clicks income.

## Legal

The hosted product is provided by PaperBagExpress and is meant to be usable immediately, without
per-user setup. The public app displays its legal terms in-product: the footer links to the Terms of
Service, Privacy Policy, and Disclaimer, and there is a short "By using PaperRoseAI, you agree to our
terms" section on the homepage. Those pages are static views of the source files in
[`backend/legal/`](backend/legal/): [`terms_of_service.md`](backend/legal/terms_of_service.md),
[`privacy_policy.md`](backend/legal/privacy_policy.md), and
[`disclaimer.txt`](backend/legal/disclaimer.txt).

Those files are drafts. They are written to reduce the chance of misuse and to make the limits of the
Service clear, but they are not a substitute for advice from a qualified lawyer. Before relying on them
for a real public launch, have a lawyer review them for the jurisdictions, data practices, and business
model you actually run. In particular, the limiting liability, arbitration, and governing-law language
should be checked against local law.

The product itself is informational. It is an automated reading aid, not a lawyer and not legal advice.
Results can be wrong, incomplete, or outdated. Do not sign, pay, or litigate based only on what it says.

## Verification

From repository root:

```bash
backend/venv/Scripts/python scratch/test_browser_extension.py
backend/venv/Scripts/python scratch/test_public_security.py
backend/venv/Scripts/python scratch/test_detection_precision.py
backend/venv/Scripts/python -X utf8 scratch/test_keys_concurrency.py
cd frontend && npm test && npm run build
```
The frontend is JavaScript/JSX (no TypeScript typecheck); the build checks compilation. Before launch,
confirm that the public app shows the Terms of Service, Privacy Policy, and Disclaimer in the footer and
on the homepage legal section, and that each legal page renders from `backend/legal/`. Production public
scanning should be tested with a fresh, valid Turnstile challenge on the assigned production domain.

## 🤖 Local PaperRose Buddy bookmarklet

For local use only, the optional bookmarklet can be dragged to the bookmarks bar and opened on a
terms/privacy page. It reads the visible page in that browser and sends text to the local backend.
Local backend routes allow its CORS/private-network workflow; public hosted mode disables the
bookmarklet because it cannot satisfy hosted Turnstile. The bookmarklet stays silent during scans;
use its explicit **Read report aloud** button if you want audio.

## API

| Endpoint | Method | Body | Description |
|----------|--------|------|-------------|
| `/api/health` | GET | — | Engine status; never returns provider secrets |
| `/api/analyze/url` | POST | `{ "url": "https://…" }` | Fetch and analyze a public page (Turnstile required in public mode) |
| `/api/analyze/text` | POST | `{ "text": "…" }` | Analyze pasted text; rules-only in public mode |
| `/api/analyze/upload` | POST | multipart `file` | PDF/DOCX/TXT/MD/HTML (≤16 MB local; ≤4 MB hosted) |
| `/api/settings/keys` | GET/POST | — | Local provider status/manage; public key writes disabled |
| `/api/settings/keys/<provider>` | DELETE | — | Local mode only: remove a saved key |
| `/api/settings/keys/check` | POST | — | Local mode only: re-test configured keys |
| `/api/buddy/config` | GET/POST | `{ "muted": true }` | Local bookmarklet settings; public writes disabled |

*Not legal advice — automated reading can miss context.*
