# PaperRoseAI v2 🤖📄

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
2. **AI layer** (optional): OpenAI (`gpt-4o-mini`) or Gemini (`gemini-2.0-flash`) adds a
   real plain-English summary, per-category verdicts and a 0–100 fairness score.
   The deterministic engine cross-checks the AI and clamps its score if it gets too
   generous with high-severity findings.
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
cd backend && venv/Scripts/python app.py          # scan live terms pages end to end
venv/Scripts/python -X utf8 ../scratch/test_real_scans.py
venv/Scripts/python -X utf8 ../scratch/test_detection_precision.py   # no server needed
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
npm run dev        # http://localhost:3000 — proxies /api to the Flask backend
```

## 🔑 Turning on AI mode

Click the **⚙️ gear** in the header (or the *“Add an API key →”* link under the hero
when AI is off) and paste a key. That's it — **no `.env` editing, no restart**:

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

## 🤖 The Buddy bookmarklet

Drag the **PaperRose Buddy** robot from the install card (bottom of the homepage)
to your bookmarks bar. Then, on **any website's** terms/privacy page, click the
bookmark — a robot appears on that page, scrapes the visible text in-browser,
and grades it via your local backend **without navigating away**.

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
- **One mute everywhere**: the 🔊/🔇 toggle on the injected buddy syncs to the
  backend (`/api/buddy/config`), so mute state is shared across every website
  and with the in-app buddy (they share the same `pr-buddy-muted` setting).
- Regenerate the bookmarklet with a different API base via
  `buildBookmarklet(apiBase)` in `frontend/src/lib/bookmarklet.js`.

## API

| Endpoint | Method | Body | Description |
|----------|--------|------|-------------|
| `/api/health` | GET | — | Engine + per-provider key status |
| `/api/analyze/url` | POST | `{ "url": "https://…" }` | Fetch a live T&C/privacy page and analyze |
| `/api/analyze/text` | POST | `{ "text": "…" }` | Analyze pasted text |
| `/api/settings/keys` | GET | — | Provider status (masked keys, source, validity) |
| `/api/settings/keys` | POST | `{ "provider": "openai", "key": "sk-…", "force?": true }` | Verify live, then save |
| `/api/settings/keys/<p>` | DELETE | — | Forget a saved key (falls back to `.env`) |
| `/api/settings/keys/check` | POST | — | Re-test every configured key |
| `/api/analyze/upload` | POST | multipart `file` | PDF, DOCX, TXT, MD, HTML (≤16 MB) |
| `/api/buddy/config` | GET / POST | `{ "muted": true }` | Shared buddy settings (mute sync across sites) |

*Not legal advice — an AI reading aid.*
