"""
PaperRoseAI API — Flask backend.

Endpoints:
  GET  /api/health                 — engine + key status
  POST /api/analyze/url            — { url } -> fetch a live T&C/privacy page and analyze
  POST /api/analyze/text           — { text, doc_kind? } -> analyze pasted text
  POST /api/analyze/upload         — multipart file (txt, pdf, docx, md, html) -> analyze
  GET  /api/settings/keys          — provider key status (masked, never raw)
  POST /api/settings/keys          — { provider, key, force? } -> verify live + save
  DELETE /api/settings/keys/<p>    — forget a saved key (falls back to .env)
  POST /api/settings/keys/check    — live-test every configured key

CORS is fully permissive on /api/* because the PaperRose bookmarklet runs on
arbitrary websites (origin null) and talks to this local API. Private Network
Access headers let https pages call http://127.0.0.1 in Chrome.
"""
import io
import json
import logging
import os
import re
import threading

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from urllib.parse import urljoin, urlparse
from werkzeug.utils import secure_filename

import keys_store
from analyzer import analyze_text, doc_fingerprint

# .env first, then any keys saved through the UI (those win — they're newer).
load_dotenv()
keys_store.init()


def _verify_keys_in_background():
    """Check the configured keys on startup so the UI can be honest about
    whether AI mode actually works. Expired keys used to look identical to
    working ones until an analysis quietly fell back to the rules engine.
    Runs in a daemon thread: never delays boot, never blocks a request.
    Set PAPERROSE_SKIP_KEY_CHECK=1 to disable (used by tests).
    """
    if os.getenv("PAPERROSE_SKIP_KEY_CHECK"):
        return

    def run():
        try:
            results = keys_store.check_all()
            for provider, r in results.items():
                if r.get("kind") != "missing":
                    log.info("Key check - %s: %s", provider, r.get("message"))
        except Exception:
            log.warning("Startup key verification failed", exc_info=True)

    threading.Thread(target=run, name="key-check", daemon=True).start()


_verify_keys_in_background()

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("paperrose.api")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB cap

# The bookmarklet runs on arbitrary sites (origin null) and calls this local
# API, so CORS must be fully permissive. Private Network Access preflight
# support lets https pages talk to http://127.0.0.1 in Chrome.
CORS(app, resources={r"/api/*": {"origins": "*"}}, supports_credentials=False)


@app.after_request
def _pna_headers(resp):
    origin = request.headers.get("Origin")
    if origin is not None:
        resp.headers.setdefault("Access-Control-Allow-Origin", origin or "*")
    resp.headers.setdefault("Access-Control-Allow-Headers", "Content-Type")
    resp.headers.setdefault("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    if request.headers.get("Access-Control-Request-Private-Network"):
        resp.headers["Access-Control-Allow-Private-Network"] = "true"
    return resp


ALLOWED_EXTENSIONS = {"txt", "pdf", "docx", "md", "html", "htm"}

UA_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
}

# A bare User-Agent is not enough any more: sites like Amazon answer 403 to a
# header set that doesn't look like a real navigation. Sending the full set a
# browser would send gets the real page. Verified: Amazon went 403 -> 200.
BROWSER_HEADERS = {
    **UA_HEADERS,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,"
              "image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "no-cache",
}

# Pages that ship an empty shell and fill it in with JavaScript. We can't run
# their scripts from here, so we say so instead of grading the boilerplate.
JS_SHELL_MARKERS = (
    "__next_data__", "window.__nuxt__", "ng-version=", "data-reactroot",
    "enable javascript", "please enable js", "id=\"root\"></div>",
    "id=\"app\"></div>",
)


def _follow_legal_links(links: list[dict]):
    """Try the legal pages this site links to when the target itself has no text.

    Returns (text, title, html, sub_links) for the first link that yields real
    content, or None. Reddit's own /policies/user-agreement is a script shell,
    but the same site's plain legal pages are one hop away.
    """
    for link in links[:4]:
        try:
            text, title, status, sub_links, html = extract_from_url(link["url"])
        except requests.exceptions.RequestException:
            continue
        if status < 400 and not _looks_like_js_shell(html, text) and len(text.split()) >= 150:
            log.info("Following %s for readable legal text", link["url"])
            return text, title, html, sub_links
    return None


def _looks_like_js_shell(html: str, text: str) -> bool:
    """True when the page clearly needs scripts to render its content."""
    if len(text.split()) >= 300:
        return False                      # plenty of real text came through
    low = html.lower()
    return any(marker in low for marker in JS_SHELL_MARKERS)

# --------------------------------------------------------------------------
# Text extraction
# --------------------------------------------------------------------------

def _extract_html(soup) -> str:
    """Strip boilerplate from a parsed soup and return readable text."""
    for tag in soup(["script", "style", "noscript", "nav", "header", "footer", "aside", "form", "svg", "iframe"]):
        tag.decompose()
    return re.sub(r"\n{3,}", "\n\n", soup.get_text(separator="\n").strip())


def _extract_pdf(data: bytes) -> str:
    import pymupdf
    parts = []
    with pymupdf.open(stream=data, filetype="pdf") as doc:
        for page in doc:
            parts.append(page.get_text())
    return "\n\n".join(parts).strip()


def _extract_docx(data: bytes) -> str:
    import docx
    doc = docx.Document(io.BytesIO(data))
    return "\n\n".join(p.text for p in doc.paragraphs if p.text.strip())


def extract_from_file(data: bytes, filename: str) -> str:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    if ext == "pdf":
        return _extract_pdf(data)
    if ext == "docx":
        return _extract_docx(data)
    raw = data.decode("utf-8", errors="replace")
    if ext in ("html", "htm"):
        return _extract_html(BeautifulSoup(raw, "html.parser"))
    return raw


def _discover_legal_links(soup, base_url: str) -> list[dict]:
    """Find related legal-page links (privacy policy, cookie policy, etc.)
    on the scraped page so the user can scan them with one click.
    Takes a parsed soup — call BEFORE _extract_html strips navs/footers,
    since that's exactly where these links usually live."""
    # Most specific first — "cookie settings" should label as cookie, not privacy
    KEYWORDS = {
        "cookie": ("Cookie Policy", "🍪"),
        "eula": ("EULA", "📜"),
        "dpa": ("Data Processing Addendum", "🛡️"),
        "disclaimer": ("Disclaimer", "⚠️"),
        "terms of service": ("Terms of Service", "📜"),
        "terms of use": ("Terms of Use", "📜"),
        "terms & conditions": ("Terms & Conditions", "📜"),
        "terms and conditions": ("Terms & Conditions", "📜"),
        "/tos": ("Terms of Service", "📜"),
        "/terms": ("Terms of Service", "📜"),
        "conditions": ("Terms & Conditions", "📜"),
        "privacy policy": ("Privacy Policy", "🕶️"),
        "/privacy": ("Privacy Policy", "🕶️"),
        "privacy": ("Privacy Policy", "🕶️"),
    }
    EXCLUDE = ("mailto:", "tel:", "javascript:", "#")

    found, seen = [], set()
    base_norm = base_url.rstrip("/").lower()
    for a in soup.find_all("a", href=True):
        href = a["href"]
        if href.startswith(EXCLUDE):
            continue
        label = re.sub(r"\s+", " ", a.get_text(" ", strip=True)).lower()
        target = href.lower()
        kind = None
        # Pass 1: match visible link text (most reliable), Pass 2: URL
        for source in (label, target):
            for kw, (name, emoji) in KEYWORDS.items():
                if kw in source:
                    kind = (name, emoji)
                    break
            if kind:
                break
        if not kind:
            continue
        abs_url = urljoin(base_url, href)
        if urlparse(abs_url).scheme not in ("http", "https"):
            continue
        if abs_url.rstrip("/").lower() == base_norm:
            continue  # the page linking to itself
        if abs_url in seen:
            continue
        seen.add(abs_url)
        found.append({"url": abs_url, "label": kind[0], "emoji": kind[1]})
    return found[:8]


def extract_from_url(url: str) -> tuple[str, str, int, list[dict], str]:
    """Fetch a page and pull out the legal text.

    Returns (text, title, status, related_legal_links, raw_html). The raw HTML
    is handed back so the guard rail can spot page shells (an encyclopedia
    article, a JavaScript app) that the extracted text alone can't distinguish.
    """
    r = requests.get(url, headers=BROWSER_HEADERS, timeout=25)
    # Some sites block on the first look and answer on the second, or block this
    # particular UA. One retry with the plain UA is cheap and recovers real
    # pages; a genuine 404 still comes back as 404.
    if r.status_code in (403, 429):
        try:
            retry = requests.get(url, headers=UA_HEADERS, timeout=25)
            if retry.status_code < r.status_code:
                r = retry
        except requests.RequestException:
            pass
    # requests falls back to ISO-8859-1 for text/* when the response carries no
    # charset, which turns every curly quote into mojibake ("don’t" -> "donâ€™t")
    # and quietly breaks sentence matching against words like don’t / can’t.
    if not r.encoding or r.encoding.lower() in ("iso-8859-1", "latin-1", "ascii"):
        r.encoding = r.apparent_encoding or "utf-8"
    soup = BeautifulSoup(r.text, "html.parser")
    # get_text() instead of .string — .string is None when <title> has nested tags
    title = soup.title.get_text(strip=True) if soup.title else ""
    try:
        links = _discover_legal_links(soup, str(r.url))
    except Exception:
        log.warning("Legal-link discovery failed for %s", url, exc_info=True)
        links = []
    text = _extract_html(soup)
    return text, title, r.status_code, links, r.text


# --------------------------------------------------------------------------
# Validation helpers
# --------------------------------------------------------------------------

def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _error(msg: str, code: int = 400):
    return jsonify({"error": msg}), code


# --------------------------------------------------------------------------
# Buddy settings (voice/mute shared across every site the bookmarklet runs on)
# --------------------------------------------------------------------------

# Cross-origin pages can't share localStorage, so the bookmarklet keeps its
# mute preference here. One tiny JSON blob, kept in memory + file so it
# survives restarts.
SETTINGS_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "buddy_settings.json")


def _load_settings() -> dict:
    try:
        with open(SETTINGS_PATH, "r", encoding="utf-8") as fh:
            data = json.load(fh)
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def _save_settings(settings: dict):
    try:
        with open(SETTINGS_PATH, "w", encoding="utf-8") as fh:
            json.dump(settings, fh)
    except Exception:
        log.warning("Could not persist buddy settings", exc_info=True)


@app.get("/api/buddy/config")
def get_buddy_config():
    s = _load_settings()
    return jsonify({"muted": bool(s.get("muted", False))})


@app.post("/api/buddy/config")
def set_buddy_config():
    data = request.get_json(silent=True) or {}
    if "muted" in data:
        s = _load_settings()
        s["muted"] = bool(data["muted"])
        _save_settings(s)
        return jsonify({"ok": True, "muted": s["muted"]})
    return _error("Nothing to update — send {\"muted\": true|false}")


# --------------------------------------------------------------------------
# Routes
# --------------------------------------------------------------------------

@app.get("/api/health")
def health():
    status = keys_store.all_status()
    return jsonify({
        "status": "ok",
        "engine": status["engine"],
        "ai_available": status["ai_available"],
        "active_model": status["active"],
        # bool per provider kept for older clients; details live in provider_status
        "providers": {
            p: bool(st["configured"]) for p, st in status["providers"].items()
        },
        "provider_status": status["providers"],
        "version": "2.0",
    })


# --------------------------------------------------------------------------
# AI settings — paste a provider key instead of editing .env by hand
# --------------------------------------------------------------------------

@app.get("/api/settings/keys")
def get_keys():
    status = keys_store.all_status()
    return jsonify({
        "ok": True,
        "config": keys_store.public_config(),
        "providers": status["providers"],
        "engine": status["engine"],
        "active_model": status["active"],
        "keys_path": keys_store.KEYS_PATH,
    })


@app.post("/api/settings/keys")
def post_key():
    data = request.get_json(silent=True) or {}
    provider = str(data.get("provider", "")).strip().lower()
    if provider not in keys_store.PROVIDERS:
        return _error(f"Unknown provider '{provider}'. Use 'openai' or 'gemini'.")
    key = str(data.get("key", "")).strip()
    if len(key) < 12:
        return _error("That key looks too short — paste the whole thing.")

    result = keys_store.verify_and_save(provider, key, force=bool(data.get("force")))
    status = keys_store.all_status()
    return jsonify({
        **result,
        "provider": provider,
        "providers": status["providers"],
        "engine": status["engine"],
        "active_model": status["active"],
    })


@app.delete("/api/settings/keys/<provider>")
def delete_key(provider: str):
    provider = provider.strip().lower()
    if provider not in keys_store.PROVIDERS:
        return _error(f"Unknown provider '{provider}'.")
    fallback = keys_store.delete_key(provider)
    status = keys_store.all_status()
    return jsonify({
        "ok": True,
        "fell_back_to_env": bool(fallback),
        "providers": status["providers"],
        "engine": status["engine"],
        "active_model": status["active"],
    })


@app.post("/api/settings/keys/check")
def check_keys():
    """Live-test every configured key (model-list calls, no tokens spent)."""
    keys_store.check_all()
    status = keys_store.all_status()
    return jsonify({
        "ok": True,
        "providers": status["providers"],
        "engine": status["engine"],
        "active_model": status["active"],
    })


# Shells of reference/encyclopedia sites and anything else that is *about* a
# document rather than *being* one.
# Deliberately narrow. A bare "wiki/" would reject any ordinary site that
# links to one; these markers only appear in MediaWiki-style article shells.
NON_CONTRACT_SHELL = re.compile(
    r"mw-parser-output|id=[\"']mw-content-text|class=[\"'][^\"']*\bmw-body|"
    r"class=[\"'][^\"']*\breflist|id=[\"'](?:References|External_links|See_also)|citelink|"
    r"wikimediafoundation",
    re.IGNORECASE,
)

EDITORIAL_MARKERS = (
    r"\bwikipedia\b", r"\bwikimedia\b", r"\bcitation needed\b", r"\bretrieved from\b",
    r"\barchived from the original\b", r"\bexternal links\b", r"\bfurther reading\b",
    r"\bencyclopedia\b", r"\bedit this page\b", r"\bmain article\b", r"\bdisambiguation\b",
    r"\bsee also\b", r"\bbibliography\b", r"\bisbn\b", r"\bdoi:", r"\baccording to\b",
    r"\bthis article\b", r"\bthe term (?:is|refers)\b", r"\bcriticism of\b", r"\bcontrovers(?:y|ies)\b",
)


# Minimum characters worth grading: a fetched page must look like a real
# document, a pasted snippet only has to be a clause.
MIN_FETCH_CHARS = 200
MIN_PASTE_CHARS = 80


def _is_tnc_like(text: str, title: str = "", html: str | None = None) -> bool:
    """Guard rail: reject pages that clearly aren't legal documents.

    A legal document is defined less by its heading than by *contract language*:
    second-person obligations ("you agree", "we may") at high density. An article
    that merely discusses terms of service quotes that language heavily, so
    density alone is not enough — we also require contract framing and reject
    anything wearing the shell or vocabulary of a reference work.
    """
    hay = (title + " \n" + text[:30000]).lower()
    words = max(1, len(hay.split()))

    # A wiki/encyclopedia shell in the raw HTML is decisive.
    if html and NON_CONTRACT_SHELL.search(html[:120000]):
        return False

    # Editorial / encyclopedic vocabulary — and it only takes a couple of these
    # to out a page that isn't a contract.
    if sum(1 for pat in EDITORIAL_MARKERS if re.search(pat, hay)) >= 2:
        return False

    # Second-person contract language, measured per 1000 words.
    contract_hits = len(re.findall(
        r"\b(?:you agree|you must|you may not|you will not|we may|we will|we reserve|"
        r"your account|your content|shall be|agrees to|hereby|notwithstanding|in no event|"
        r"at our sole discretion|you represent|you warrant)\b", hay))
    density = contract_hits / words * 1000

    # Contract framing must be present for a document to count, no matter how
    # dense the contract-ish language is.
    framing = re.search(
        r"terms (?:of|and) (?:service|use|conditions)\b|privacy (?:policy|notice)\b|user agreement\b|"
        r"legal (?:terms|notice)\b|end user licen[cs]e\b|\beula\b|cookie policy\b|"
        r"acceptable use policy\b|(?:this|these) (?:agreement|terms|policy)\b", hay)
    if not framing:
        return False

    if density >= 3:            # typical for a real terms page
        return True
    if density < 2:
        return False

    strong = re.search(
        r"terms (?:of|and) (?:service|use|conditions)|privacy (?:policy|notice)|user agreement|"
        r"legal (?:terms|notice)|end user licen[cs]e|eula|cookie policy|"
        r"master (?:subscription|services) agreement|acceptable use policy|"
        r"(?:this|these) (?:agreement|terms)", hay)
    weak = sum(1 for s in (
        r"\blicen[cs]e\w*\b", r"\bwarrant(?:y|ies)\b", r"governing law",
        r"\bdisclaimer\w*\b", r"\bindemnif\w+\b", r"\barbitrat\w+\b",
        r"by (?:accessing|using)\b", r"\bthird[- ]part\w+\b",
    ) if re.search(s, hay))
    return bool(strong) and weak >= 2


def _do_analysis(text: str, doc_kind: str, source: str, related_pages: list | None = None,
                 raw_html: str | None = None):
    # A fetched page has to clear a higher bar — boilerplate isn't worth grading.
    # Pasted or uploaded text is the user's explicit choice, and people routinely
    # paste a single suspicious clause, so it gets a much lower one. (The same
    # 200-character floor used to reject a one-paragraph paste with a message
    # about JavaScript rendering, which made no sense for text they typed.)
    min_chars = MIN_FETCH_CHARS if source == "url" else MIN_PASTE_CHARS
    if not text or len(text.strip()) < min_chars:
        if source == "url":
            return {"error": "Almost no readable text came back from that page — it likely renders its "
                             "content with JavaScript (common for Reddit, Instagram, banks). Use the "
                             "PaperRose buddy bookmarklet on that page, or copy the text into "
                             "Paste text yourself."}, 422
        return {"error": f"That's too short to grade ({len(text.strip())} characters) — paste at least "
                         "a sentence or two, or upload the whole document."}, 422

    if source == "url" and not _is_tnc_like(text, html=raw_html):
        return {"error": "This page doesn't look like a Terms & Conditions or Privacy Policy document. "
                         "Tip: try the page's privacy policy or terms URL directly."}, 422

    result = analyze_text(text, doc_kind)
    result["meta"]["fingerprint"] = doc_fingerprint(text)
    result["meta"]["chars"] = len(text)
    result["related_pages"] = related_pages or []
    return jsonify(result), 200


@app.post("/api/analyze/url")
def analyze_url():
    data = request.get_json(silent=True) or {}
    url = str(data.get("url", "")).strip()
    if not url:
        return _error("Missing 'url'")
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    if not re.match(r"^https?://[^\s/$.?#].[^\s]*$", url):
        return _error("That doesn't look like a valid URL")

    try:
        text, title, status, links, raw_html = extract_from_url(url)
    except requests.exceptions.Timeout:
        return _error("The site took too long to respond.", 504)
    except requests.exceptions.RequestException as e:
        return _error(f"Couldn't fetch that page ({e.__class__.__name__}).", 502)

    if status >= 400:
        if status in (401, 403, 429):
            return _error(
                f"That site blocks automated readers (HTTP {status}). Open the page in your browser and "
                "use the PaperRose buddy bookmarklet, copy the text into Paste text, or upload the PDF.",
                502,
            )
        return _error(f"The site returned HTTP {status}. Check the URL, or paste the text instead.", 502)

    # A JavaScript app hands us an empty shell, and grading the boilerplate would
    # be worse than refusing. But plenty of JS-heavy sites serve the real policy
    # as a plain page one click away, so follow the links the shell advertises
    # before telling the user to go elsewhere.
    if len(text.strip()) < 200 or _looks_like_js_shell(raw_html, text):
        picked = _follow_legal_links(links)
        if picked:
            text, title, raw_html, links = picked
        elif _looks_like_js_shell(raw_html, text):
            return _error(
                "That page builds itself with JavaScript, so there's no text to read from here. "
                "Use the PaperRose buddy bookmarklet on that page (it reads what your browser has already "
                "rendered), or paste the text in yourself.",
                422,
            )
        # Otherwise fall through — _do_analysis explains the thin-text case.

    result, code = _do_analysis(text, str(data.get("doc_kind") or "Terms & Conditions"), "url",
                                related_pages=links, raw_html=raw_html)
    return result, code


@app.post("/api/analyze/text")
def analyze_text_route():
    data = request.get_json(silent=True) or {}
    text = str(data.get("text", "")).strip()
    doc_kind = str(data.get("doc_kind") or "Terms & Conditions")
    return _do_analysis(text, doc_kind, "text")


@app.post("/api/analyze/upload")
def analyze_upload():
    if "file" not in request.files:
        return _error("No file part in request")
    f = request.files["file"]
    if not f or f.filename == "":
        return _error("No file selected")
    if not allowed_file(f.filename):
        return _error("Unsupported file type. Use PDF, DOCX, TXT, MD or HTML.")

    filename = secure_filename(f.filename)
    data = f.read()
    try:
        text = extract_from_file(data, filename)
    except Exception as e:
        log.exception("Extraction failed for %s", filename)
        return _error(f"Couldn't read that file ({e.__class__.__name__}). Is it a valid document?", 422)

    ext_kind = {
        "pdf": "Terms & Conditions (PDF)", "docx": "Terms & Conditions (DOCX)",
    }.get(filename.rsplit(".", 1)[-1].lower(), "Terms & Conditions")
    return _do_analysis(text, ext_kind, "upload")


# --------------------------------------------------------------------------
# Dev server
# --------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="127.0.0.1", port=port, debug=False)
