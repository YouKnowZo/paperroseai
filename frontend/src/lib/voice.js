/**
 * Buddy voice — Web Speech API wrapper.
 *
 * Design notes:
 * - User-gesture gated: browsers refuse speech before any interaction, and a
 *   robot that talks on page load is creepy. We track the first real
 *   pointer/key interaction and stay silent until then.
 * - Mute state lives in localStorage (`pr-buddy-muted`) and survives reloads.
 * - Chrome occasionally keeps a speech utterance alive after unload, holding
 *   audio session state; cancelling on `pagehide` avoids that.
 * - One utterance at a time: new narration cancels the previous line, so the
 *   buddy never talks over itself.
 */

const MUTE_KEY = "pr-buddy-muted";
const VOICE_KEY = "pr-buddy-voice";

let unlocked = false;
let supported = typeof window !== "undefined" && "speechSynthesis" in window;
const unlockListeners = new Set();
let queued = null; // { text, opts } — line blocked by the gesture gate

if (supported) {
  const unlock = () => {
    const first = !unlocked;
    unlocked = true;
    if (first && queued) {
      const q = queued;
      queued = null;
      speak(q.text, q.opts);
    }
    if (first) {
      unlockListeners.forEach((cb) => cb());
      unlockListeners.clear();
    }
  };
  window.addEventListener("pointerdown", unlock);
  window.addEventListener("keydown", unlock);

  // Adopt the backend's shared mute setting on load (set from any other
  // website via the bookmarklet). LocalStorage wins if it was set locally.
  fetch("/api/buddy/config")
    .then((r) => (r.ok ? r.json() : null))
    .then((c) => {
      if (!c || typeof c.muted !== "boolean") return;
      if (c.muted && !localStorage.getItem(MUTE_KEY)) {
        localStorage.setItem(MUTE_KEY, "1");
        muteListeners.forEach((cb) => cb(true));
      }
    })
    .catch(() => {});
}

const muteListeners = new Set();

/** Subscribe to external mute changes (e.g. adopted from the backend). */
export function onMuteChange(cb) {
  muteListeners.add(cb);
  return () => muteListeners.delete(cb);
}

if (supported) {
  window.addEventListener("pagehide", () => {
    try { window.speechSynthesis.cancel(); } catch { /* noop */ }
  });
}

export function isVoiceSupported() {
  return supported;
}

export function isMuted() {
  return localStorage.getItem(MUTE_KEY) === "1";
}

let syncing = false;

export function setMuted(muted) {
  if (muted) {
    localStorage.setItem(MUTE_KEY, "1");
    stopSpeaking();
  } else {
    localStorage.removeItem(MUTE_KEY);
  }
  // Mirror to the backend so the bookmarklet buddy (and other open tabs)
  // picks up the change. Best-effort: if the backend is down, still mute locally.
  if (syncing) return;
  syncing = true;
  fetch("/api/buddy/config", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ muted: !!muted }),
  })
    .catch(() => {})
    .finally(() => { syncing = false; });
}

/** Pick a decent English voice once voices load; preference is persisted. */
export function listVoices() {
  if (!supported) return [];
  return window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
}

function pickVoice() {
  const voices = listVoices();
  if (!voices.length) return null;
  const savedName = localStorage.getItem(VOICE_KEY);
  if (savedName) {
    const saved = voices.find((v) => v.name === savedName);
    if (saved) return saved;
  }
  // Prefer natural-sounding voices if the browser has them
  const preferred =
    voices.find((v) => /natural|neural|premium|enhanced/i.test(v.name)) ||
    voices.find((v) => /google/i.test(v.name)) ||
    voices.find((v) => /samantha|zira|aria|jenny/i.test(v.name)) ||
    voices[0];
  return preferred;
}

export function setVoiceByName(name) {
  localStorage.setItem(VOICE_KEY, name);
}

export function stopSpeaking() {
  if (!supported) return;
  try { window.speechSynthesis.cancel(); } catch { /* noop */ }
}

export function hasUnlocked() {
  return unlocked;
}

/** Run cb immediately if already unlocked, else on first user gesture. */
export function onFirstUnlock(cb) {
  if (unlocked) cb();
  else unlockListeners.add(cb);
}

/**
 * Speak a line as the buddy. Respects mute + gesture gating.
 * Returns true if it actually spoke.
 */
export function speak(text, { rate = 1.02, pitch = 1.25 } = {}) {
  if (!supported || isMuted() || !unlocked || !text) return false;
  try {
    window.speechSynthesis.cancel(); // never talk over ourselves
    const u = new SpeechSynthesisUtterance(String(text));
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.rate = rate;
    u.pitch = pitch;
    u.volume = 0.9;
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    return false;
  }
}

/**
 * Like speak(), but if the gesture gate blocks us, remember the line and
 * say it the moment the user first interacts. Muted lines are dropped.
 */
export function speakOrQueue(text, opts) {
  if (!supported || isMuted() || !text) return false;
  if (!unlocked) {
    queued = { text, opts };
    return false;
  }
  return speak(text, opts);
}
