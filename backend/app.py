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
import http.client
import io
import ipaddress
import json
import logging
import os
import re
import socket
import ssl
import threading
import time
from collections import defaultdict, deque

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from urllib.parse import urljoin, urlparse
from werkzeug.middleware.proxy_fix import ProxyFix
from werkzeug.utils import secure_filename
from werkzeug.exceptions import HTTPException

import keys_store
from analyzer import CLOUDFLARE_MODEL, analyze_text, doc_fingerprint

# .env first, then any keys saved through the UI (those win — they're newer).
load_dotenv()
PUBLIC_MODE = os.getenv("PAPERROSE_PUBLIC_MODE", "0").strip().lower() in {"1", "true", "yes"}
keys_store.init()


def _verify_keys_in_background():
    """Check the configured keys on startup so the UI can be honest about
    whether AI mode actually works. Expired keys used to look identical to
    working ones until an analysis quietly fell back to the rules engine.
    Runs in a daemon thread: never delays boot, never blocks a request.
    Set PAPERROSE_SKIP_KEY_CHECK=1 to disable (used by tests).
    """
    if os.getenv("PAPERROSE_SKIP_KEY_CHECK") or PUBLIC_MODE:
        return

    def run():
        try:
            results = keys_store.check_all()
            for provider, r in results.items():
                if r.get("kind") != "missing":
                    log_key_check(provider, r.get("message", "ok"))
        except Exception:
            log.warning("Startup key verification failed", exc_info=True)

    threading.Thread(target=run, name="key-check", daemon=True).start()


_verify_keys_in_background()

class _JsonFormatter(logging.Formatter):
    def format(self, record):
        base = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S") + ("Z" if record.created is not None else ""),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        if record.exc_info and record.exc_info[1] is not None:
            base["error"] = str(record.exc_info[1])
            base["exc"] = self.formatException(record.exc_info)
        for k in ("scan_url", "scan_status", "scan_error", "key_provider", "key_message"):
            v = getattr(record, k, None)
            if v is not None:
                base[k] = v
        return json.dumps(base, ensure_ascii=False)

_handler = logging.StreamHandler()
_handler.setFormatter(_JsonFormatter())
logging.root.addHandler(_handler)
logging.root.setLevel(logging.INFO)
log = logging.getLogger("paperrose.api")

# Structured logging helpers used by request + scan paths.
def log_scan(status, url=None, error=None):
    log.info("scan", extra={"scan_status": status, "scan_url": url, "scan_error": error})

def log_key_check(provider, message):
    log.info("key_check", extra={"key_provider": provider, "key_message": message})

app = Flask(__name__)
application = app  # WSGI alias for deployment platforms
app.config["MAX_CONTENT_LENGTH"] = 4 * 1024 * 1024 if PUBLIC_MODE else 16 * 1024 * 1024
MAX_SCAN_REQUESTS_PER_MINUTE = 8
MAX_SCAN_REQUESTS_PER_DAY = 120
TURNSTILE_SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify"

if PUBLIC_MODE:
    app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=0, x_prefix=0)

allowed_origins = [o.strip().rstrip("/") for o in os.getenv("PAPERROSE_ALLOWED_ORIGINS", "").split(",") if o.strip()]
if PUBLIC_MODE:
    CORS(app, resources={r"/api/*": {"origins": allowed_origins}}, supports_credentials=False)
else:
    # The local bookmarklet runs on arbitrary pages. Keep its local-only routes
    # permissive while the rest of the development API stays same-origin/local.
    CORS(app, resources={
        r"/api/analyze/text": {"origins": "*"},
        r"/api/buddy/config": {"origins": "*"},
        r"/api/*": {"origins": ["http://localhost:3001", "http://127.0.0.1:3001"]},
    }, supports_credentials=False)

_rate_lock = threading.Lock()
_scan_events = defaultdict(deque)


def _verify_turnstile(token: str) -> bool:
    secret = os.getenv("TURNSTILE_SECRET_KEY", "").strip()
    if not secret or not token or len(token) > 2048:
        return False
    try:
        response = requests.post(
            TURNSTILE_SITEVERIFY_URL,
            data={"secret": secret, "response": token, "remoteip": request.remote_addr},
            timeout=6,
        )
        response.raise_for_status()
        result = response.json()
    except (requests.RequestException, ValueError):
        log.warning("Turnstile verification unavailable", exc_info=True)
        return False
    if not isinstance(result, dict) or result.get("success") is not True:
        return False
    if result.get("action") != "paperrose_scan":
        return False
    configured_hosts = {
        host.strip().lower().rstrip(".")
        for host in os.getenv("TURNSTILE_ALLOWED_HOSTNAMES", "").split(",")
        if host.strip()
    }
    token_host = str(result.get("hostname", "")).lower().rstrip(".")
    token_challenge = result.get("challenge_ts")
    if not token_host or token_host not in configured_hosts or not token_challenge:
        return False
    try:
        from datetime import datetime, timezone
        challenged_at = datetime.fromisoformat(token_challenge.replace("Z", "+00:00"))
        if challenged_at.tzinfo is None:
            challenged_at = challenged_at.replace(tzinfo=timezone.utc)
        age_seconds = (datetime.now(timezone.utc) - challenged_at).total_seconds()
        return 0 <= age_seconds <= 300
    except (TypeError, ValueError):
        return False


@app.before_request
def limit_public_scans():
    if request.method in {"POST", "PUT", "PATCH"} and request.is_json:
        if not isinstance(request.get_json(silent=True), dict):
            return _error("Send a valid JSON object.", 400)
    if not PUBLIC_MODE or not request.path.startswith("/api/analyze/") or request.method == "OPTIONS":
        return None
    turnstile_configured = bool(
        os.getenv("TURNSTILE_SITE_KEY")
        and os.getenv("TURNSTILE_SECRET_KEY")
        and os.getenv("TURNSTILE_ALLOWED_HOSTNAMES")
        and os.getenv("PAPERROSE_ALLOWED_ORIGINS")
    )
    if not allowed_origins:
        log_scan("unavailable", url=None, error="no_allowed_origins")
        return _error("Public scans are temporarily unavailable until the frontend origin is configured.", 503)
    if request.headers.get("Origin", "").rstrip("/") not in allowed_origins:
        log_scan("rejected", url=None, error="origin_not_allowed")
        return _error("This origin is not permitted to use the public scan service.", 403)
    if request.is_json:
        scan_data = request.get_json(silent=True) or {}
        turnstile_token = str(scan_data.get("turnstile_token", "")) if isinstance(scan_data, dict) else ""
    else:
        turnstile_token = str(request.form.get("turnstile_token", ""))
    if turnstile_configured and not _verify_turnstile(turnstile_token):
        log_scan("rejected", url=None, error="turnstile_failed")
        return _error("Human verification failed or expired. Please verify and try again.", 403)
    now = time.monotonic()
    client = request.remote_addr or "unknown"
    with _rate_lock:
        if len(_scan_events) > 10000:
            cutoff = now - 86400
            for addr in [addr for addr, events in _scan_events.items() if not events or events[-1] < cutoff]:
                _scan_events.pop(addr, None)
        events = _scan_events[client]
        while events and events[0] <= now - 86400:
            events.popleft()
        recent = sum(event > now - 60 for event in events)
        if recent >= MAX_SCAN_REQUESTS_PER_MINUTE or len(events) >= MAX_SCAN_REQUESTS_PER_DAY:
            retry_after = 60 if recent >= MAX_SCAN_REQUESTS_PER_MINUTE else 86400
            response = jsonify({"error": "Scan limit reached. Please wait before trying again."})
            response.status_code = 429
            response.headers["Retry-After"] = str(retry_after)
            log_scan("rate_limited", url=None, error="limit")
            return response
        events.append(now)
    return None


@app.after_request
def _security_headers(resp):
    resp.headers.setdefault("X-Content-Type-Options", "nosniff")
    resp.headers.setdefault("Referrer-Policy", "no-referrer")
    resp.headers.setdefault("X-Frame-Options", "DENY")
    if not PUBLIC_MODE and request.headers.get("Access-Control-Request-Private-Network") == "true":
        resp.headers["Access-Control-Allow-Private-Network"] = "true"
    if PUBLIC_MODE and request.is_secure:
        resp.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
    return resp


ALLOWED_EXTENSIONS = {"txt", "pdf", "docx", "md", "html", "htm"}
UA_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
}
BROWSER_HEADERS = {
    **UA_HEADERS,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "no-cache",
}
JS_SHELL_MARKERS = (
    "__next_data__", "window.__nuxt__", "ng-version=", "data-reactroot",
    "enable javascript", "please enable js", "id=\"root\"></div>",
    "id=\"app\"></div>",
)
NON_CONTRACT_SHELL = re.compile(
    r"mw-parser-output|id=[\"']mw-content-text|class=[\"'][^\"']*\bmw-body|"
    r"class=[\"'][^\"']*\breflist|id=[\"'](?:References|External_links|See_also)|citelink|wikimediafoundation",
    re.IGNORECASE,
)
EDITORIAL_MARKERS = (
    r"\bwikipedia\b", r"\bwikimedia\b", r"\bcitation needed\b", r"\bretrieved from\b",
    r"\barchived from the original\b", r"\bexternal links\b", r"\bfurther reading\b",
    r"\bencyclopedia\b", r"\bedit this page\b", r"\bmain article\b", r"\bdisambiguation\b",
    r"\bsee also\b", r"\bbibliography\b", r"\bisbn\b", r"\bdoi:", r"\baccording to\b",
    r"\bthis article\b", r"\bthe term (?:is|refers)\b", r"\bcriticism of\b", r"\bcontrovers(?:y|ies)\b",
)
MIN_FETCH_CHARS = 200
MIN_PASTE_CHARS = 80
MAX_PAGE_BYTES = 5 * 1024 * 1024
MAX_REDIRECTS = 5


class UnsafeUrlError(ValueError):
    pass


def _follow_legal_links(links: list[dict]):
    """Try same-site legal links if the requested URL is only a JS shell."""
    for link in links[:4]:
        try:
            text, title, status, sub_links, html = extract_from_url(link["url"])
        except (requests.exceptions.RequestException, UnsafeUrlError, OSError, http.client.HTTPException):
            continue
        if status < 400 and not _looks_like_js_shell(html, text) and len(text.split()) >= 150:
            log.info("Following %s for readable legal text", link["url"])
            return text, title, html, sub_links
    return None


def _looks_like_js_shell(html: str, text: str) -> bool:
    if len(text.split()) >= 300:
        return False
    low = html.lower()
    return any(marker in low for marker in JS_SHELL_MARKERS)


def _extract_html(soup) -> str:
    for tag in soup(["script", "style", "noscript", "nav", "header", "footer", "aside", "form", "svg", "iframe"]):
        tag.decompose()
    return re.sub(r"\n{3,}", "\n\n", soup.get_text(separator="\n").strip())


def _extract_pdf(data: bytes) -> str:
    import pymupdf
    with pymupdf.open(stream=data, filetype="pdf") as doc:
        return "\n\n".join(page.get_text() for page in doc).strip()


def _extract_docx(data: bytes) -> str:
    import docx
    document = docx.Document(io.BytesIO(data))
    return "\n\n".join(paragraph.text for paragraph in document.paragraphs if paragraph.text.strip())


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
    keywords = {
        "cookie": ("Cookie Policy", "🍪"), "eula": ("EULA", "📜"),
        "dpa": ("Data Processing Addendum", "🛡️"), "disclaimer": ("Disclaimer", "⚠️"),
        "terms of service": ("Terms of Service", "📜"), "terms of use": ("Terms of Use", "📜"),
        "terms & conditions": ("Terms & Conditions", "📜"), "terms and conditions": ("Terms & Conditions", "📜"),
        "/tos": ("Terms of Service", "📜"), "/terms": ("Terms of Service", "📜"),
        "conditions": ("Terms & Conditions", "📜"), "privacy policy": ("Privacy Policy", "🕶️"),
        "/privacy": ("Privacy Policy", "🕶️"), "privacy": ("Privacy Policy", "🕶️"),
    }
    found, seen = [], set()
    base_norm = base_url.rstrip("/").lower()
    for anchor in soup.find_all("a", href=True, limit=2000):
        href = anchor["href"]
        if href.startswith(("mailto:", "tel:", "javascript:", "#")):
            continue
        label = re.sub(r"\s+", " ", anchor.get_text(" ", strip=True)).lower()
        target = href.lower()
        kind = next((value for source in (label, target) for keyword, value in keywords.items() if keyword in source), None)
        if not kind:
            continue
        abs_url = urljoin(base_url, href)
        if urlparse(abs_url).scheme not in ("http", "https") or abs_url.rstrip("/").lower() == base_norm:
            continue
        try:
            _validate_public_url(abs_url)
        except UnsafeUrlError:
            continue
        if abs_url not in seen:
            seen.add(abs_url)
            found.append({"url": abs_url, "label": kind[0], "emoji": kind[1]})
            if len(found) >= 8:
                break
    return found[:8]


def _validate_public_url(url: str):
    try:
        parsed = urlparse(url)
        port = parsed.port
    except ValueError as exc:
        raise UnsafeUrlError("That URL has an invalid host or port.") from exc
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise UnsafeUrlError("Only public http:// and https:// website URLs are allowed.")
    if port not in (None, 80, 443):
        raise UnsafeUrlError("Only standard website ports (80 and 443) are allowed.")
    host = parsed.hostname.rstrip(".")
    if not host or host.lower() == "localhost" or host.lower().endswith(".localhost"):
        raise UnsafeUrlError("Local and private network addresses cannot be scanned.")
    service_port = port or (443 if parsed.scheme == "https" else 80)
    try:
        try:
            addresses = {ipaddress.ip_address(host)}
        except ValueError:
            if "." not in host:
                raise UnsafeUrlError("Local and private network addresses cannot be scanned.")
            addresses = {ipaddress.ip_address(info[4][0]) for info in socket.getaddrinfo(host, service_port, type=socket.SOCK_STREAM)}
    except (OSError, ValueError) as exc:
        raise UnsafeUrlError("That website's host could not be resolved.") from exc
    if not addresses or any(not address.is_global for address in addresses):
        raise UnsafeUrlError("Local and private network addresses cannot be scanned.")
    pinned_ip = sorted(addresses, key=lambda address: (address.version, int(address)))[0]
    return parsed, pinned_ip, service_port


def _fetch_pinned_response(parsed, pinned_ip, port):
    hostname, timeout = parsed.hostname, 15
    raw_socket = socket.create_connection((str(pinned_ip), port), timeout=6)
    raw_socket.settimeout(timeout)
    if parsed.scheme == "https":
        try:
            raw_socket = ssl.create_default_context().wrap_socket(raw_socket, server_hostname=hostname)
        except Exception:
            raw_socket.close()
            raise
        connection = http.client.HTTPSConnection(hostname, port, timeout=timeout)
    else:
        connection = http.client.HTTPConnection(hostname, port, timeout=timeout)
    connection.sock = raw_socket
    path = parsed.path or "/"
    if parsed.query:
        path += "?" + parsed.query
    headers = dict(BROWSER_HEADERS)
    host_header = f"[{hostname}]" if ":" in hostname else hostname
    default_port = 443 if parsed.scheme == "https" else 80
    headers["Host"] = host_header if port == default_port else f"{host_header}:{port}"
    try:
        connection.request("GET", path, headers=headers)
        return connection, connection.getresponse()
    except Exception:
        connection.close()
        raise


def _fetch_public_page(url: str) -> tuple[bytes, int, str]:
    current = url
    for hop in range(MAX_REDIRECTS + 1):
        parsed, pinned_ip, port = _validate_public_url(current)
        connection, response = _fetch_pinned_response(parsed, pinned_ip, port)
        try:
            if response.status in (301, 302, 303, 307, 308):
                location = response.getheader("Location")
                if not location or hop >= MAX_REDIRECTS:
                    raise UnsafeUrlError("Too many or invalid redirects while reading that page.")
                current = urljoin(current, location)
                continue
            try:
                content_length = int(response.getheader("Content-Length", "0") or 0)
            except ValueError as exc:
                raise UnsafeUrlError("That web page returned an invalid size.") from exc
            if content_length > MAX_PAGE_BYTES:
                raise UnsafeUrlError("That web page is too large to scan safely.")
            if response.status == 206:
                raise UnsafeUrlError("Partial web-page responses cannot be scanned safely.")
            content_type = (response.getheader("Content-Type", "") or "").lower()
            if content_type and not any(kind in content_type for kind in ("text/html", "application/xhtml+xml", "text/plain")):
                raise UnsafeUrlError("That URL did not return a readable web page.")
            body = bytearray()
            while True:
                chunk = response.read(64 * 1024)
                if not chunk:
                    break
                if len(body) + len(chunk) > MAX_PAGE_BYTES:
                    raise UnsafeUrlError("That web page is too large to scan safely.")
                body.extend(chunk)
            return bytes(body), response.status, current
        finally:
            connection.close()
    raise UnsafeUrlError("Could not safely follow that page's redirects.")


def extract_from_url(url: str) -> tuple[str, str, int, list[dict], str]:
    body, status, final_url = _fetch_public_page(url)
    raw_html = body.decode("utf-8", errors="replace")
    soup = BeautifulSoup(body, "html.parser")
    title = soup.title.get_text(strip=True) if soup.title else ""
    try:
        links = _discover_legal_links(soup, final_url)
    except Exception:
        log.warning("Legal-link discovery failed for %s", final_url, exc_info=True)
        links = []
    return _extract_html(soup), title, status, links, raw_html


def allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _error(msg: str, code: int = 400):
    return jsonify({"error": msg}), code


@app.errorhandler(HTTPException)
def handle_http_error(exc):
    message = "The request is too large for this deployment." if exc.code == 413 else exc.description
    return _error(message, exc.code or 500)


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


@app.get("/api/status/public")
def public_status():
    # A tiny, public-only status signal for an external monitor / status page.
    # It deliberately exposes nothing secret: no keys, no account ids, no tokens.
    turnstile_configured = bool(
        os.getenv("TURNSTILE_SITE_KEY") and os.getenv("TURNSTILE_SECRET_KEY")
        and os.getenv("TURNSTILE_ALLOWED_HOSTNAMES") and os.getenv("PAPERROSE_ALLOWED_ORIGINS")
    )
    ai_configured = bool(
        PUBLIC_MODE and os.getenv("CLOUDFLARE_API_TOKEN")
        and re.fullmatch(r"[a-fA-F0-9]{32}", os.getenv("CLOUDFLARE_ACCOUNT_ID", ""))
        and os.getenv("CLOUDFLARE_FREE_TIER_CONSENT", "0").strip().lower() in {"1", "true", "yes"}
    )
    return jsonify({
        "status": "ok",
        "public_mode": PUBLIC_MODE,
        "engine": "ai" if ai_configured else ("heuristic" if PUBLIC_MODE else "local"),
        "turnstile": {"configured": turnstile_configured},
        "version": "2.0",
    })

@app.get("/api/buddy/config")
def get_buddy_config():
    if PUBLIC_MODE:
        return jsonify({"muted": False})
    return jsonify({"muted": bool(_load_settings().get("muted", False))})


@app.post("/api/buddy/config")
def set_buddy_config():
    if PUBLIC_MODE:
        return _error("Shared buddy settings are disabled on the public service.", 403)
    data = request.get_json(silent=True) or {}
    if "muted" in data:
        settings = _load_settings()
        settings["muted"] = bool(data["muted"])
        _save_settings(settings)
        return jsonify({"ok": True, "muted": settings["muted"]})
    return _error("Nothing to update — send {\"muted\": true|false}")


@app.get("/api/health")
def health():
    status = keys_store.all_status()
    free_ai_available = bool(
        PUBLIC_MODE and os.getenv("CLOUDFLARE_API_TOKEN")
        and re.fullmatch(r"[a-fA-F0-9]{32}", os.getenv("CLOUDFLARE_ACCOUNT_ID", ""))
        and os.getenv("TURNSTILE_SECRET_KEY") and os.getenv("TURNSTILE_SITE_KEY")
        and os.getenv("TURNSTILE_ALLOWED_HOSTNAMES") and os.getenv("PAPERROSE_ALLOWED_ORIGINS")
        and os.getenv("CLOUDFLARE_FREE_TIER_CONSENT", "0").strip().lower() in {"1", "true", "yes"}
    )
    turnstile_ready = bool(
        os.getenv("TURNSTILE_SITE_KEY") and os.getenv("TURNSTILE_SECRET_KEY")
        and os.getenv("TURNSTILE_ALLOWED_HOSTNAMES") and os.getenv("PAPERROSE_ALLOWED_ORIGINS")
    )
    return jsonify({
        "status": "ok",
        "engine": "ai" if free_ai_available else ("heuristic" if PUBLIC_MODE else status["engine"]),
        "ai_available": free_ai_available if PUBLIC_MODE else status["ai_available"],
        "free_ai_available": free_ai_available,
        "public_mode": PUBLIC_MODE,
        "turnstile_site_key": os.getenv("TURNSTILE_SITE_KEY") if PUBLIC_MODE else None,
        "turnstile_ready": turnstile_ready,
        "active_model": CLOUDFLARE_MODEL if free_ai_available else ("rules-engine v2" if PUBLIC_MODE else status["active"]),
        "providers": {"cloudflare": free_ai_available} if PUBLIC_MODE else {
            provider: bool(details["configured"]) for provider, details in status["providers"].items()
        },
        **({} if PUBLIC_MODE else {"provider_status": status["providers"]}),
        "version": "2.0",
    })


@app.get("/api/settings/keys")
def get_keys():
    status = keys_store.all_status()
    if PUBLIC_MODE:
        free_ai_configured = bool(
            os.getenv("CLOUDFLARE_API_TOKEN")
            and re.fullmatch(r"[a-fA-F0-9]{32}", os.getenv("CLOUDFLARE_ACCOUNT_ID", ""))
            and os.getenv("TURNSTILE_SECRET_KEY") and os.getenv("TURNSTILE_SITE_KEY")
            and os.getenv("TURNSTILE_ALLOWED_HOSTNAMES")
            and os.getenv("CLOUDFLARE_FREE_TIER_CONSENT", "0").strip().lower() in {"1", "true", "yes"}
        )
        public_providers = {"cloudflare": {
            "id": "cloudflare", "label": "Cloudflare Workers AI",
            "model": CLOUDFLARE_MODEL,
            "configured": bool(os.getenv("CLOUDFLARE_API_TOKEN") and os.getenv("CLOUDFLARE_ACCOUNT_ID")),
        }}
        public_config = {"cloudflare": {
            "label": "Cloudflare Workers AI",
            "model": CLOUDFLARE_MODEL,
            "console": "https://dash.cloudflare.com/?to=/:account/workers/ai",
        }}
        return jsonify({
            "ok": True, "public_mode": True, "free_ai_configured": free_ai_configured,
            "turnstile_site_key": os.getenv("TURNSTILE_SITE_KEY"),
            "turnstile_ready": bool(
                os.getenv("TURNSTILE_SITE_KEY") and os.getenv("TURNSTILE_SECRET_KEY")
                and os.getenv("TURNSTILE_ALLOWED_HOSTNAMES") and os.getenv("PAPERROSE_ALLOWED_ORIGINS")
            ),
            "config": public_config, "providers": public_providers,
            "engine": "ai" if free_ai_configured else "heuristic",
            "active_model": CLOUDFLARE_MODEL if free_ai_configured else "rules-engine v2",
        })
    return jsonify({
        "ok": True, "public_mode": False, "config": keys_store.public_config(),
        "providers": status["providers"], "engine": status["engine"],
        "active_model": status["active"], "keys_path": keys_store.KEYS_PATH,
    })


@app.post("/api/settings/keys")
def post_key():
    if PUBLIC_MODE:
        return _error("AI provider keys are managed securely by the site owner, not through the public app.", 403)
    data = request.get_json(silent=True) or {}
    provider = str(data.get("provider", "")).strip().lower()
    if provider not in keys_store.PROVIDERS:
        return _error(f"Unknown provider '{provider}'. Use 'openai' or 'gemini'.")
    key = str(data.get("key", "")).strip()
    if len(key) < 12:
        return _error("That key looks too short — paste the whole thing.")
    result = keys_store.verify_and_save(provider, key, force=bool(data.get("force")))
    status = keys_store.all_status()
    return jsonify({**result, "provider": provider, "providers": status["providers"], "engine": status["engine"], "active_model": status["active"]})


@app.delete("/api/settings/keys/<provider>")
def delete_key(provider: str):
    if PUBLIC_MODE:
        return _error("AI provider keys are managed securely by the site owner, not through the public app.", 403)
    provider = provider.strip().lower()
    if provider not in keys_store.PROVIDERS:
        return _error(f"Unknown provider '{provider}'.")
    fallback = keys_store.delete_key(provider)
    status = keys_store.all_status()
    return jsonify({"ok": True, "fell_back_to_env": bool(fallback), "providers": status["providers"], "engine": status["engine"], "active_model": status["active"]})


@app.post("/api/settings/keys/check")
def check_keys():
    if PUBLIC_MODE:
        return _error("AI provider keys are managed securely by the site owner.", 403)
    keys_store.check_all()
    status = keys_store.all_status()
    return jsonify({"ok": True, "providers": status["providers"], "engine": status["engine"], "active_model": status["active"]})


def _is_tnc_like(text: str, title: str = "", html: str | None = None) -> bool:
    hay = (title + " \n" + text[:30000]).lower()
    words = max(1, len(hay.split()))
    if html and NON_CONTRACT_SHELL.search(html[:120000]):
        return False
    if sum(1 for pat in EDITORIAL_MARKERS if re.search(pat, hay)) >= 2:
        return False
    contract_hits = len(re.findall(
        r"\b(?:you agree|you must|you may not|you will not|we may|we will|we reserve|your account|your content|shall be|agrees to|hereby|notwithstanding|in no event|at our sole discretion|you represent|you warrant)\b", hay))
    density = contract_hits / words * 1000
    framing = re.search(
        r"terms (?:of|and) (?:service|use|conditions)\b|privacy (?:policy|notice)\b|user agreement\b|legal (?:terms|notice)\b|end user licen[cs]e\b|\beula\b|cookie policy\b|acceptable use policy\b|(?:this|these) (?:agreement|terms|policy)\b", hay)
    if not framing:
        return False
    if density >= 3:
        return True
    if density < 2:
        return False
    strong = re.search(
        r"terms (?:of|and) (?:service|use|conditions)|privacy (?:policy|notice)|user agreement|legal (?:terms|notice)|end user licen[cs]e|eula|cookie policy|master (?:subscription|services) agreement|acceptable use policy|(?:this|these) (?:agreement|terms)", hay)
    weak = sum(1 for pattern in (
        r"\blicen[cs]e\w*\b", r"\bwarrant(?:y|ies)\b", r"governing law", r"\bdisclaimer\w*\b",
        r"\bindemnif\w+\b", r"\barbitrat\w+\b", r"by (?:accessing|using)\b", r"\bthird[- ]part\w+\b",
    ) if re.search(pattern, hay))
    return bool(strong) and weak >= 2


def _do_analysis(text: str, doc_kind: str, source: str, related_pages: list | None = None,
                 raw_html: str | None = None, allow_free_ai: bool = False):
    min_chars = MIN_FETCH_CHARS if source == "url" else MIN_PASTE_CHARS
    if not text or len(text.strip()) < min_chars:
        if source == "url":
            return {"error": "Almost no readable text came back from that page — it likely renders its content with JavaScript (common for Reddit, Instagram, banks). Use a PaperRose Buddy bookmarklet, paste text yourself, or upload a PDF."}, 422
        return {"error": f"That's too short to grade ({len(text.strip())} characters) — paste at least a sentence or two, or upload the whole document."}, 422
    if source == "url" and not _is_tnc_like(text, html=raw_html):
        return {"error": "This page doesn't look like a Terms & Conditions or Privacy Policy document. Try the site's privacy policy or terms URL directly."}, 422
    may_use_free_ai = source == "url" and allow_free_ai and PUBLIC_MODE
    result = analyze_text(text, doc_kind, allow_free_ai=may_use_free_ai)
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
    except UnsafeUrlError as exc:
        log_scan("rejected", url=url, error=str(exc))
        return _error(str(exc), 400)
    except (requests.exceptions.Timeout, TimeoutError, socket.timeout):
        log_scan("fetch_timeout", url=url)
        return _error("The site took too long to respond.", 504)
    except requests.exceptions.RequestException as exc:
        log_scan("fetch_error", url=url, error=f"{exc.__class__.__name__}")
        return _error(f"Couldn't fetch that page ({exc.__class__.__name__}).", 502)
    except (OSError, ssl.SSLError, http.client.HTTPException) as exc:
        log_scan("fetch_error", url=url, error=f"{exc.__class__.__name__}")
        return _error(f"Couldn't fetch that page ({exc.__class__.__name__}).", 502)
    if status >= 400:
        if status in (401, 403, 429):
            return _error(f"That site blocks automated readers (HTTP {status}). Open the page in your browser and use the Buddy bookmarklet, copy the text into Paste text, or upload the PDF.", 502)
        return _error(f"The site returned HTTP {status}. Check the URL, or paste the text instead.", 502)
    if len(text.strip()) < 200 or _looks_like_js_shell(raw_html, text):
        picked = _follow_legal_links(links)
        if picked:
            text, title, raw_html, links = picked
        elif _looks_like_js_shell(raw_html, text):
            return _error("That page builds itself with JavaScript, so there's no text to read. Use the Buddy bookmarklet or paste the text yourself.", 422)
    result, code = _do_analysis(
        text, str(data.get("doc_kind") or "Terms & Conditions"), "url",
        related_pages=links, raw_html=raw_html, allow_free_ai=data.get("allow_free_ai") is True,
    )
    log_scan("ok", url=url)
    return result, code


@app.post("/api/analyze/text")
def analyze_text_route():
    data = request.get_json(silent=True) or {}
    text = str(data.get("text", "")).strip()
    result, code = _do_analysis(text, str(data.get("doc_kind") or "Terms & Conditions"), "text")
    if code == 200:
        log_scan("ok", url=None)
    return result, code


@app.post("/api/analyze/upload")
def analyze_upload():
    if "file" not in request.files:
        return _error("No file part in request")
    file = request.files["file"]
    if not file or not file.filename:
        return _error("No file selected")
    if not allowed_file(file.filename):
        return _error("Unsupported file type. Use PDF, DOCX, TXT, MD or HTML.")
    if request.content_length and request.content_length > app.config["MAX_CONTENT_LENGTH"]:
        return _error("The uploaded file is too large for this deployment.", 413)
    filename = secure_filename(file.filename)
    try:
        text = extract_from_file(file.read(), filename)
    except Exception as exc:
        log.exception("Extraction failed for %s", filename)
        log_scan("extract_error", url=None, error=f"{exc.__class__.__name__}")
        return _error(f"Couldn't read that file ({exc.__class__.__name__}). Is it a valid document?", 422)
    ext_kind = {"pdf": "Terms & Conditions (PDF)", "docx": "Terms & Conditions (DOCX)"}.get(filename.rsplit(".", 1)[-1].lower(), "Terms & Conditions")
    result, code = _do_analysis(text, ext_kind, "upload")
    if code == 200:
        log_scan("ok", url=None)
    return result, code


if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="127.0.0.1", port=port, debug=False)
