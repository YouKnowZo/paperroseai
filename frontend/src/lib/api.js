const API_BASE = import.meta.env.VITE_API_URL || "";

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
  return data;
}

export async function checkHealth() {
  const res = await fetch(`${API_BASE}/api/health`);
  return handle(res);
}

export async function analyzeUrl(url) {
  const res = await fetch(`${API_BASE}/api/analyze/url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  return handle(res);
}

export async function analyzeText(text) {
  const res = await fetch(`${API_BASE}/api/analyze/text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
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

export async function analyzeFile(file) {
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch(`${API_BASE}/api/analyze/upload`, {
    method: "POST",
    body: formData,
  });
  return handle(res);
}
