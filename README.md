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
2. **AI layer** (optional): local development can use OpenAI (`gpt-4o-mini`) or Gemini (`gemini-3.1-flash-lite`). Public deployment can use Cloudflare Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) for a website scan only after the user opts in for that scan. Pasted/uploaded text always stays on the deterministic rules path. The deterministic engine cross-checks AI flags and clamps its score if it is too generous.
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
* **Nothing readable fetched** → the honest message plus the three ways around it
  (bookmarklet, paste, upload).

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

## Run it

**Backend** (Python 3.10+, uses `backend/venv`):
```bash
cd backend
python -m venv venv                     # first time only
venv/Scripts/pip install -r requirements.txt   # or pip3 on mac/linux
PORT=5000 venv/Scripts/python app.py    # or: venv/bin/python app.py
```

**Frontend** (Vite + React 19):
```bash
cd frontend
npm install
npm run dev        # http://localhost:3001 — proxies /api to the Flask backend
```

## Deploy to Vercel

Deploy this monorepo as **one Vercel Services project**. The root [vercel.json](vercel.json) builds the Vite frontend and Flask backend as separate services, then routes `/api/*` to Flask and all other paths to the frontend under one domain. In Vercel, connect the repository with its root directory set to `.` and the project framework set to **Services**; a Services project requires both that dashboard framework setting and the `services` configuration in `vercel.json`. Since API requests use the same origin, leave `VITE_API_URL` unset. Add `PAPERROSE_PUBLIC_MODE=1`, the exact production `PAPERROSE_ALLOWED_ORIGINS`, Turnstile settings, and (if enabling AI) Cloudflare Workers AI settings as project Environment Variables; do not commit secrets. Deploy the production branch `main`.

The hosted Python function body limit is 4.5 MB, so the public backend caps uploads/requests at 4 MiB (local mode remains 16 MiB). Serverless functions have ephemeral writable storage; public mode therefore disables key CRUD and does not rely on local JSON persistence. Scan throttling is process-local and resets with new function instances, so Turnstile is required for public scans.

### Public deployment privacy and provider choice

The public deployment can keep scanning without any provider secret: rules-only analysis works by default. Optional website-only AI uses a Cloudflare Workers AI token held exclusively in backend environment variables. Visitors must opt in on each URL scan; pasted/uploaded text never reaches hosted AI. Cloudflare's Workers AI data-usage documentation states that customer content is not used to train models or improve Cloudflare/third-party services. The free account allocation is limited to 10,000 Neurons per day and is shared for that Cloudflare account. See the current [pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) and [data-use terms](https://developers.cloudflare.com/workers-ai/platform/data-usage/) before enabling it.

For public launch, enable `PAPERROSE_PUBLIC_MODE=1`, set `PAPERROSE_ALLOWED_ORIGINS` to the exact public app origin, configure `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY`, and `TURNSTILE_ALLOWED_HOSTNAMES`, then enable `CLOUDFLARE_FREE_TIER_CONSENT=1` only after reviewing the provider terms. Add `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in the Vercel project's secret settings. Keep all secret values out of Git and browser `VITE_*` variables. Turnstile must be configured first; public scan endpoints fail closed without server-side Siteverify validation. Cloudflare free AI responses do not imply a guaranteed quota or uptime.

## 🔑 Turning on local AI mode

For local, private use, click the **⚙️ gear** in the header and paste an OpenAI or Gemini key; hosted public mode intentionally does not accept user-supplied provider secrets.

1. Paste an OpenAI (`sk-…`) or Google Gemini key and hit **Save & test**.
2. The key is verified live against the provider *before* it's saved, so a typo is
   caught while you're still looking at the box. If the provider rejects it, the
   real error message is shown and you can still **Save anyway** (useful offline).
3. The header badge flips to **AI engine online** and the next analysis runs through
   the AI layer.

Where keys live:

- **`backend/keys.json`** — saved from the UI, file mode `0600` where the OS allows,
  masked everywhere it's shown (`sk-proj-…sjYA`). Never sent anywhere except the
  provider you chose. **Saved keys win over `.env`**; removing one falls back to the
  `.env` value if present. Override the location with `PAPERROSE_KEYS_PATH`.
- **`backend/.env`** — still supported, for people who prefer it:
  ```
  OPENAI_API_KEY=sk-...
  GEMINI_API_KEY=...
  ```

Honest status, always: configured keys are checked at startup and whenever you open
the settings modal, so an **expired key can't masquerade as a working one** — the app
reports *Rules engine* with the provider's own rejection message instead of silently
falling back mid-analysis. "Test my keys" re-runs the check on demand.

Pointing at a gateway or local model? Set `OPENAI_BASE_URL` (Azure, LiteLLM,
OpenRouter, Ollama, vLLM…) or `GEMINI_BASE_URL` and the AI layer plus key checks
follow it.

## Rose: your floating fine-print guide

Rose is available in both public and local mode. Open the floating robot to select an English voice installed in your browser/device, choose Calm guide, Bright buddy, or Clear narrator, adjust speaking speed, preview speech, or read the current report aloud. Voice availability depends on the operating system/browser; some system voices use a browser speech service. Preferences stay in browser storage and never mutate shared public backend settings. The assistant sends all scans through the main form, preserving human verification and per-scan AI consent.

## Verification

From the repository root:
```bash
backend/venv/Scripts/python scratch/test_public_security.py
backend/venv/Scripts/python scratch/test_detection_precision.py
backend/venv/Scripts/python -X utf8 scratch/test_keys_concurrency.py
cd frontend && npm test && npm run build
```
The frontend is JavaScript/JSX (no TypeScript typecheck); the production build checks compilation. Public scan protection is fail-closed: a deployment is not launch-ready until a real Turnstile-protected scan succeeds on the assigned production domain. Do not reuse exposed secrets or put secret values in chat.

## 🤖 The Buddy bookmarklet

For local use, drag the **PaperRose Buddy** robot from the install card (bottom of the homepage)
to your bookmarks bar. Then, on **any website's** terms/privacy page, click the
bookmark — a robot appears on that page, scrapes the visible text in-browser,
and grades it via your local backend **without navigating away**. The hosted public
app hides the bookmarklet because scans there require a Turnstile challenge.

- Works on any site; the injected widget is isolated in a Shadow DOM so it
  can't clash with the host page's styles.
- The backend serves permissive CORS + Private Network Access headers so
  even `https://` pages can talk to `http://127.0.0.1:5000` (Chrome may ask
  you to allow the "local network access" once per site).
- **Speaks out loud**: the injected buddy narrates scans and announces verdicts
  ("I give this an F. Biggest thing to know: Forced arbitration…") via the
  browser's speech synthesis, with the same earcon chimes as the in-app buddy
  (safe arpeggio → dangerous alarm). Speech starts immediately — the bookmark
  click itself provides the required user activation.
- **Local bookmarklet mute** syncs to the local backend (`/api/buddy/config`) across injected website buddies. The in-app Rose assistant keeps its mute/voice preferences private in this browser; hosted writes to shared buddy settings are disabled.
- Regenerate the bookmarklet with a different API base via
  `buildBookmarklet(apiBase)` in `frontend/src/lib/bookmarklet.js`.

## API

| Endpoint | Method | Body | Description |
|----------|--------|------|-------------|
| `/api/health` | GET | — | Engine status; never returns provider secrets |
| `/api/analyze/url` | POST | `{ "url": "https://…" }` | Fetch a public T&C/privacy page and analyze (Turnstile required in public mode) |
| `/api/analyze/text` | POST | `{ "text": "…" }` | Analyze pasted text (rules-only in public mode) |
| `/api/settings/keys` | GET | — | Local provider status; public mode returns minimal configuration only |
| `/api/settings/keys` | POST | `{ "provider": "openai", "key": "sk-…", "force?": true }` | Local mode only: verify live, then save |
| `/api/settings/keys/<p>` | DELETE | — | Local mode only: forget a saved key |
| `/api/settings/keys/check` | POST | — | Local mode only: re-test configured keys |
| `/api/analyze/upload` | POST | multipart `file` | PDF, DOCX, TXT, MD, HTML (≤16 MB local; ≤4 MB hosted) |
| `/api/buddy/config` | GET / POST | `{ "muted": true }` | Local shared buddy settings; disabled for hosted writes |

*Not legal advice — an AI reading aid.*
