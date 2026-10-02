export const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

function withTurnstile(payload, token) {
  return { ...payload, turnstile_token: token || "" };
}

async function handle(res) {
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON error */
  }
  if (!res.ok) {
    throw new Error(data?.error || `Request failed (HTTP ${res.status})`);
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("The analysis service returned an unexpected response. Please try again.");
  }
  return data;
}

export async function checkHealth() {
  const res = await fetch(`${API_BASE}/api/health`);
  const data = await handle(res);
  if (data.status !== "ok" || typeof data.public_mode !== "boolean") {
    throw new Error("The analysis service is not ready.");
  }
  return data;
}

export async function analyzeUrl(url, { allowFreeAI = false, turnstileToken = "" } = {}) {
  const res = await fetch(`${API_BASE}/api/analyze/url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withTurnstile({ url, allow_free_ai: allowFreeAI }, turnstileToken)),
  });
  return handle(res);
}

export async function analyzeText(text, { turnstileToken = "" } = {}) {
  const res = await fetch(`${API_BASE}/api/analyze/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(withTurnstile({ text }, turnstileToken)),
  });
  return handle(res);
}

// ---------- AI settings (paste provider keys) ----------

export async function getKeys() {
  const res = await fetch(`${API_BASE}/api/settings/keys`);
  return handle(res);
}

/** Save a key. Resolves with { ok: false, kind, message } when the provider
 * rejects it — the caller can retry with force to stage it anyway. */
export async function saveKey(provider, key, force = false) {
  const res = await fetch(`${API_BASE}/api/settings/keys`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ provider, key, force }),
  });
  return handle(res);
}

export async function removeKey(provider) {
  const res = await fetch(`${API_BASE}/api/settings/keys/${provider}`, { method: "DELETE" });
  return handle(res);
}

/** Live-test every configured key (no tokens spent). */
export async function checkKeys() {
  const res = await fetch(`${API_BASE}/api/settings/keys/check`, { method: "POST" });
  return handle(res);
}

export async function analyzeFile(file, { turnstileToken = "" } = {}) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("turnstile_token", turnstileToken);
  const res = await fetch(`${API_BASE}/api/analyze/upload`, {
    method: "POST",
    body: formData,
  });
  return handle(res);
}
