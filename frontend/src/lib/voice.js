/** Manual browser speech only: no autoplay, queued narration, or scan sounds. */
const MUTE_KEY = "pr-buddy-muted";
const VOICE_KEY = "pr-buddy-voice";
const STYLE_KEY = "pr-buddy-style";
const RATE_KEY = "pr-buddy-rate";
const supported = typeof window !== "undefined" && "speechSynthesis" in window;
const muteListeners = new Set();
const preferenceListeners = new Set();

function read(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key, value) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { /* private browsing */ }
}

export const VOICE_STYLES = {
  calm: { label: "Calm guide", pitch: 1, rate: 0.94 },
  bright: { label: "Bright buddy", pitch: 1.2, rate: 1.02 },
  clear: { label: "Clear narrator", pitch: 0.92, rate: 0.98 },
};

export function isVoiceSupported() { return supported; }
export function isMuted() { return read(MUTE_KEY) === "1"; }
export function getVoicePreferences() {
  const savedRate = Number(read(RATE_KEY) || 1);
  return {
    voice: read(VOICE_KEY) || "",
    style: VOICE_STYLES[read(STYLE_KEY)] ? read(STYLE_KEY) : "calm",
    rate: Number.isFinite(savedRate) ? Math.min(1.3, Math.max(0.7, savedRate)) : 1,
  };
}
export function onMuteChange(cb) { muteListeners.add(cb); return () => muteListeners.delete(cb); }
export function onVoiceChange(cb) { preferenceListeners.add(cb); return () => preferenceListeners.delete(cb); }
function notifyPreferences() { preferenceListeners.forEach((cb) => cb(getVoicePreferences())); }
export function setVoiceByName(name) { write(VOICE_KEY, name); notifyPreferences(); }
export function setVoiceStyle(style) { if (VOICE_STYLES[style]) { write(STYLE_KEY, style); notifyPreferences(); } }
export function setVoiceRate(rate) {
  if (!Number.isFinite(Number(rate))) return;
  write(RATE_KEY, String(Math.min(1.3, Math.max(0.7, Number(rate)))));
  notifyPreferences();
}
export function stopSpeaking() {
  if (supported) { try { window.speechSynthesis.cancel(); } catch { /* noop */ } }
}
export function setMuted(muted) {
  write(MUTE_KEY, muted ? "1" : null);
  if (muted) stopSpeaking();
  muteListeners.forEach((cb) => cb(!!muted));
}
export function listVoices() {
  if (!supported) return [];
  return window.speechSynthesis.getVoices().filter((v) => /^en(?:-|_)/i.test(v.lang))
    .sort((a, b) => a.name.localeCompare(b.name));
}
export function onVoicesChange(cb) {
  if (!supported) return () => {};
  const update = () => cb(listVoices());
  window.speechSynthesis.addEventListener("voiceschanged", update);
  update();
  return () => window.speechSynthesis.removeEventListener("voiceschanged", update);
}
function pickVoice() {
  const voices = listVoices();
  const saved = getVoicePreferences().voice;
  return voices.find((v) => v.voiceURI === saved || v.name === saved)
    || voices.find((v) => /natural|neural|premium|enhanced/i.test(v.name))
    || voices.find((v) => /google|samantha|zira|aria|jenny/i.test(v.name))
    || voices[0];
}
export function speak(text, opts = {}) {
  if (!supported || isMuted() || !text || window.navigator?.userActivation?.isActive === false) return false;
  try {
    window.speechSynthesis.cancel();
    const preferences = getVoicePreferences();
    const style = VOICE_STYLES[preferences.style];
    const utterance = new window.SpeechSynthesisUtterance(String(text));
    const voice = pickVoice();
    if (voice) { utterance.voice = voice; utterance.lang = voice.lang; }
    utterance.rate = opts.rate ?? style.rate * preferences.rate;
    utterance.pitch = opts.pitch ?? style.pitch;
    utterance.volume = 0.9;
    window.speechSynthesis.speak(utterance);
    return true;
  } catch { return false; }
}
if (supported) {
  // Stop any narration still running from a previous page/session.
  stopSpeaking();
  window.addEventListener("pagehide", stopSpeaking);
}
if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key === MUTE_KEY || event.key === null) {
      if (isMuted()) stopSpeaking();
      muteListeners.forEach((cb) => cb(isMuted()));
    }
    if ([VOICE_KEY, STYLE_KEY, RATE_KEY, null].includes(event.key)) notifyPreferences();
  });
}
