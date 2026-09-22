"""
Provider key store — lets you paste an OpenAI or Gemini key in the UI instead
of hand-editing .env.

How it works:
  * Keys live in `keys.json` next to this file (override with the env var
    PAPERROSE_KEYS_PATH — handy for tests so they can't touch real keys).
  * `init()` snapshots whatever .env provided, then overlays any saved key on
    os.environ. Saved keys win because they are the most recent, explicit
    intent; removing a saved key falls back to the .env value.
  * `probe()` validates a key live against the provider (cheap model-list call,
    no tokens spent) so you learn a key is dead while you're pasting it, not
    twenty seconds into an analysis.
  * Validation results are cached in keys.json, so the UI can still show
    "last checked: rejected" after a restart.

The analyzer reads keys from os.environ at call time, so saving a key flips the
app to AI mode immediately — no restart.
"""

import hashlib
import json
import logging
import os
import threading
import time

import requests

log = logging.getLogger("paperrose.keys")

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
KEYS_PATH = os.environ.get("PAPERROSE_KEYS_PATH") or os.path.join(BASE_DIR, "keys.json")

PROVIDERS = {
    "openai": {
        "label": "OpenAI",
        "env": "OPENAI_API_KEY",
        "base_env": "OPENAI_BASE_URL",
        "default_base": "https://api.openai.com/v1",
        "model": "gpt-4o-mini",
        "hint": "sk-proj-…",
        "console": "https://platform.openai.com/api-keys",
    },
    "gemini": {
        "label": "Google Gemini",
        "env": "GEMINI_API_KEY",
        "base_env": "GEMINI_BASE_URL",
        "default_base": "https://generativelanguage.googleapis.com/v1beta",
        "model": "gemini-2.0-flash",
        "hint": "AIza…",
        "console": "https://aistudio.google.com/app/apikey",
    },
}

PROBE_TIMEOUT = 15

_env_fallback: dict[str, str | None] = {}
_initialized = False


# --------------------------------------------------------------------------
# Storage
# --------------------------------------------------------------------------

# Flask serves requests on threads, and the settings modal can save a key while
# a live key-check is still running. Read-modify-write on a single JSON file
# therefore has to be serialized, and writes must be atomic — otherwise a
# reader can catch a half-written file, fall back to {}, and the next write
# silently wipes a saved key. (That bug ate exactly that: a verified key
# vanished because the auto-check was mid-write.)
_lock = threading.RLock()


def _read_unlocked() -> dict:
    try:
        with open(KEYS_PATH, "r", encoding="utf-8") as fh:
            data = json.load(fh)
        return data if isinstance(data, dict) else {}
    except FileNotFoundError:
        return {}
    except Exception:
        # Never let an unreadable file lead to a clobbering write: quarantine it.
        log.error("Key store at %s is unreadable — quarantining it", KEYS_PATH, exc_info=True)
        try:
            os.replace(KEYS_PATH, f"{KEYS_PATH}.corrupt-{int(time.time())}")
        except Exception:
            pass
        return {}


def _read() -> dict:
    with _lock:
        return _read_unlocked()


def _write_unlocked(data: dict):
    tmp = f"{KEYS_PATH}.tmp"
    try:
        # 0600 where the platform honours it — this file holds secrets.
        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=2)
        os.replace(tmp, KEYS_PATH)  # atomic swap: readers never see a partial file
        try:
            os.chmod(KEYS_PATH, 0o600)
        except Exception:
            pass  # Windows: ACLs, not POSIX bits
    except Exception:
        log.warning("Could not persist key store", exc_info=True)
        try:
            if os.path.exists(tmp):
                os.remove(tmp)
        except Exception:
            pass


def _mutate(change):
    """One atomic read-modify-write transaction."""
    with _lock:
        data = _read_unlocked()
        change(data)
        _write_unlocked(data)
        return data


def saved_keys() -> dict[str, str]:
    keys = _read().get("keys")
    if not isinstance(keys, dict):
        return {}
    return {p: str(k) for p, k in keys.items() if p in PROVIDERS and k}


def _fingerprint(key: str) -> str:
    """Short hash so a cached verdict can't be shown next to a different key."""
    return hashlib.sha256((key or "").encode("utf-8")).hexdigest()[:12]


def _set_status(provider: str, valid: bool, kind: str, message: str, key: str = ""):
    def change(data):
        data.setdefault("keys", {})
        data.setdefault("status", {})
        data["status"][provider] = {
            "valid": bool(valid),
            "kind": kind,
            "message": message[:400],
            "checked_at": time.time(),
            "fp": _fingerprint(key) if key else None,
        }

    _mutate(change)


def _cached_status(provider: str) -> dict:
    st = _read().get("status") or {}
    entry = st.get(provider)
    return entry if isinstance(entry, dict) else {}


# --------------------------------------------------------------------------
# Environment wiring
# --------------------------------------------------------------------------

def init():
    """Snapshot .env values once, then overlay saved keys. Safe to call twice."""
    global _initialized
    if not _initialized:
        _env_fallback.update({p: os.environ.get(cfg["env"]) for p, cfg in PROVIDERS.items()})
        _initialized = True
    apply_to_env()


def apply_to_env():
    """Saved key wins; otherwise fall back to whatever .env supplied."""
    keys = saved_keys()
    for provider, cfg in PROVIDERS.items():
        value = keys.get(provider) or _env_fallback.get(provider)
        if value:
            os.environ[cfg["env"]] = value
        else:
            os.environ.pop(cfg["env"], None)


def save_key(provider: str, key: str):
    key = key.strip()

    def change(data):
        data.setdefault("keys", {})
        data["keys"][provider] = key

    _mutate(change)
    apply_to_env()


def delete_key(provider: str) -> str | None:
    """Remove a saved key. Returns the .env value it now falls back to, if any.

    The fallback key is re-probed so the returned status is honest — otherwise
    the UI would keep claiming "AI mode" on the strength of a dead .env key.
    """
    def change(data):
        data.setdefault("keys", {})
        data["keys"].pop(provider, None)
        data.setdefault("status", {}).pop(provider, None)

    _mutate(change)
    fallback = _env_fallback.get(provider)
    apply_to_env()
    if fallback:
        result = probe(provider, fallback)
        _set_status(provider, result["valid"], result["kind"], result["message"], fallback)
    return fallback


# --------------------------------------------------------------------------
# Probing
# --------------------------------------------------------------------------

def _base_url(provider: str) -> str:
    cfg = PROVIDERS[provider]
    return (os.environ.get(cfg["base_env"]) or cfg["default_base"]).rstrip("/")


def _provider_message(resp) -> str:
    """Best-effort human-readable error from a provider response."""
    try:
        body = resp.json()
    except Exception:
        return (resp.text or "").strip()[:300] or f"HTTP {resp.status_code}"
    if isinstance(body, dict):
        err = body.get("error")
        if isinstance(err, dict) and err.get("message"):
            return str(err["message"])
        if isinstance(err, str):
            return err
        if body.get("message"):
            return str(body["message"])
    return f"HTTP {resp.status_code}"


def probe(provider: str, key: str) -> dict:
    """Check a key live. Returns {valid, kind, message}.

    kind: "ok" | "invalid" (provider rejected it) | "unreachable" (network /
    unexpected response — the key may still be fine, so the UI offers
    "save anyway").
    """
    cfg = PROVIDERS.get(provider)
    key = (key or "").strip()
    if not cfg or not key:
        return {"valid": False, "kind": "invalid", "message": "No key provided."}
    base = _base_url(provider)
    try:
        if provider == "openai":
            resp = requests.get(
                f"{base}/models",
                headers={"Authorization": f"Bearer {key}"},
                timeout=PROBE_TIMEOUT,
            )
        else:
            resp = requests.get(f"{base}/models", params={"key": key}, timeout=PROBE_TIMEOUT)
    except requests.exceptions.RequestException as e:
        return {
            "valid": False,
            "kind": "unreachable",
            "message": f"Couldn't reach the provider ({e.__class__.__name__}). Check your connection.",
        }

    if resp.status_code == 200:
        return {"valid": True, "kind": "ok", "message": "Key accepted."}
    if resp.status_code in (400, 401, 403):
        return {"valid": False, "kind": "invalid", "message": _provider_message(resp)}
    return {
        "valid": False,
        "kind": "unreachable",
        "message": f"Unexpected response from the provider (HTTP {resp.status_code}).",
    }


def verify_and_save(provider: str, key: str, force: bool = False) -> dict:
    """Probe a key, then persist it unless the provider rejected it.

    `force=True` saves even a rejected/unreachable key, so an offline user can
    still stage a key they trust.
    """
    result = probe(provider, key)
    if not result["valid"] and not force:
        return {"ok": False, **result}
    save_key(provider, key)
    _set_status(provider, result["valid"], result["kind"], result["message"], key)
    return {"ok": True, **result}


def live_key(provider: str) -> str | None:
    """The key worth actually calling the provider with, or None.

    A key the last check proved the provider *rejects* is skipped: retrying it
    on every analysis costs tens of seconds of timeout and can never succeed.
    Keys that are merely unverified, or that failed because the network was
    down, are still attempted — those can work again.
    """
    cfg = PROVIDERS.get(provider)
    if not cfg:
        return None
    keys = saved_keys()
    key = keys.get(provider) or os.environ.get(cfg["env"])
    if not key:
        return None
    cached = _cached_status(provider)
    rejected = cached.get("kind") == "invalid" and cached.get("fp") == _fingerprint(key)
    return None if rejected else key


def check_all() -> dict[str, dict]:
    """Probe every configured provider and cache the results."""
    out = {}
    keys = saved_keys()
    for provider, cfg in PROVIDERS.items():
        key = keys.get(provider) or os.environ.get(cfg["env"])
        if not key:
            out[provider] = {"valid": False, "kind": "missing", "message": "No key configured."}
            continue
        result = probe(provider, key)
        _set_status(provider, result["valid"], result["kind"], result["message"], key)
        out[provider] = result
    return out


# --------------------------------------------------------------------------
# Status for the UI
# --------------------------------------------------------------------------

def mask(key: str) -> str:
    if not key:
        return ""
    key = key.strip()
    if len(key) <= 12:
        return "•" * len(key)
    return f"{key[:8]}…{key[-4:]}"


def provider_status(provider: str) -> dict:
    cfg = PROVIDERS[provider]
    keys = saved_keys()
    key = keys.get(provider) or os.environ.get(cfg["env"])
    source = "saved" if keys.get(provider) else ("env" if os.environ.get(cfg["env"]) else None)
    cached = _cached_status(provider)
    # Only trust a cached verdict if it was reached with the key we have now.
    stale = cached.get("fp") != (_fingerprint(key) if key else None)
    valid = None if (source is None or stale or "valid" not in cached) else cached.get("valid")
    if stale:
        cached = {}
    return {
        "id": provider,
        "label": cfg["label"],
        "model": cfg["model"],
        "hint": cfg["hint"],
        "console": cfg["console"],
        "configured": bool(key),
        "source": source,
        "masked": mask(key or ""),
        "valid": valid,
        "kind": cached.get("kind"),
        "message": cached.get("message"),
        "checked_at": cached.get("checked_at"),
    }


def all_status() -> dict[str, dict]:
    """Per-provider status plus the aggregate engine view used by /api/health."""
    providers = {p: provider_status(p) for p in PROVIDERS}
    usable = [p for p, st in providers.items() if st["configured"] and st["valid"] is not False]
    return {
        "providers": providers,
        "ai_available": bool(usable),
        "engine": "ai" if usable else "heuristic",
        "active": PROVIDERS[usable[0]]["model"] if usable else "rules-engine v2",
    }


def public_config() -> dict:
    """Metadata the settings UI needs (no secrets)."""
    return {
        p: {
            "label": cfg["label"],
            "model": cfg["model"],
            "hint": cfg["hint"],
            "console": cfg["console"],
            "base_url_override": bool(os.environ.get(cfg["base_env"])),
        }
        for p, cfg in PROVIDERS.items()
    }
