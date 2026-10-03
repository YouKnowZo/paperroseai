import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import buildBookmarklet from "./bookmarklet.js";

const storage = new Map();
const events = new Map();
const speechEvents = new Map();
let voices = [];
let utterances = [];
let cancelled = 0;
globalThis.localStorage = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key),
};
globalThis.window = {
  addEventListener: (name, callback) => events.set(name, callback),
  navigator: { userActivation: { isActive: false } },
  SpeechSynthesisUtterance: class { constructor(text) { this.text = text; } },
  speechSynthesis: {
    getVoices: () => voices,
    speak: (utterance) => utterances.push(utterance),
    cancel: () => { cancelled++; },
    addEventListener: (name, callback) => speechEvents.set(name, callback),
    removeEventListener: (name) => speechEvents.delete(name),
  },
};
globalThis.fetch = () => { throw new Error("Voice preferences must not call the public backend"); };
const voice = await import("./voice.js");

test("loading, preferences, and generic interactions never autoplay speech", () => {
  voices = [{ name: "English voice", voiceURI: "test-en", lang: "en-US", localService: true }, { name: "French", voiceURI: "fr", lang: "fr-FR" }];
  assert.equal(voice.listVoices().length, 1);
  voice.setVoiceByName("test-en");
  voice.setMuted(false);
  assert.equal(utterances.length, 0);
  assert.equal(voice.speak("No active playback request"), false);
  assert.equal(events.has("pointerdown"), false);
  assert.equal(events.has("keydown"), false);
  assert.equal("speakOrQueue" in voice, false);
  assert.equal(utterances.length, 0);
});
test("explicit playback uses the selected voice", () => {
  window.navigator.userActivation.isActive = true;
  assert.equal(voice.speak("Requested report playback"), true);
  assert.equal(utterances[0].voice.voiceURI, "test-en");
});
test("styles and speed persist and affect narration", () => {
  voice.setVoiceStyle("bright");
  voice.setVoiceRate(1.2);
  voice.speak("Hello");
  assert.equal(utterances.at(-1).pitch, 1.2);
  assert.equal(utterances.at(-1).rate, 1.02 * 1.2);
  assert.equal(voice.getVoicePreferences().style, "bright");
  voice.setVoiceRate(10);
  assert.equal(voice.getVoicePreferences().rate, 1.3);
});
test("mute stays local and stops speech", () => {
  let notification;
  const unsubscribe = voice.onMuteChange((value) => { notification = value; });
  voice.setMuted(true);
  assert.equal(notification, true);
  assert.equal(voice.speak("Muted"), false);
  assert.ok(cancelled > 0);
  voice.setMuted(false);
  assert.equal(notification, false);
  unsubscribe();
});
test("late-loaded voices update subscribers and missing selection falls back", () => {
  let count;
  const unsubscribe = voice.onVoicesChange((available) => { count = available.length; });
  voices = [{ name: "Another English", voiceURI: "other-en", lang: "en-GB" }];
  speechEvents.get("voiceschanged")();
  assert.equal(count, 1);
  voice.speak("Fallback");
  assert.equal(utterances.at(-1).voice.voiceURI, "other-en");
  unsubscribe();
});
test("scan completion and bookmarklet scanning have no automatic audio calls", async () => {
  const main = await readFile(new URL("../main.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(main, /speakOrQueue|playEarcon|\bspeak\s*\(/);
  const assistant = await readFile(new URL("../components/FloatingBuddy.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(assistant, /\bRose\b|speakOrQueue/);
  assert.equal((assistant.match(/\bspeak\(/g) || []).length, 2);
  const bookmarklet = decodeURIComponent(buildBookmarklet().slice("javascript:".length));
  assert.doesNotMatch(bookmarklet, /sayOrQueue|PENDING_SPEECH|say\("Voice on/);
  assert.equal((bookmarklet.match(/playChime\(/g) || []).length, 1); // definition only
  assert.match(bookmarklet, /Read report aloud/);
});

test("preferences work when local storage is unavailable", () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => { throw new Error("denied"); } };
  assert.equal(voice.getVoicePreferences().style, "calm");
  assert.doesNotThrow(() => voice.setMuted(false));
  globalThis.localStorage = previous;
});
