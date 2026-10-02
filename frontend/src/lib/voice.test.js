import { test } from "node:test";
import assert from "node:assert/strict";

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

test("speech waits for a trusted interaction and uses the selected voice", () => {
  voices = [{ name: "Rose English", voiceURI: "rose-en", lang: "en-US", localService: true }, { name: "French", voiceURI: "fr", lang: "fr-FR" }];
  assert.equal(voice.listVoices().length, 1);
  voice.setVoiceByName("rose-en");
  assert.equal(voice.speakOrQueue("Ready"), false);
  events.get("pointerdown")({ isTrusted: false });
  assert.equal(utterances.length, 0);
  events.get("pointerdown")({ isTrusted: true });
  assert.equal(utterances[0].voice.voiceURI, "rose-en");
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
test("preferences work when local storage is unavailable", () => {
  const previous = globalThis.localStorage;
  globalThis.localStorage = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); }, removeItem: () => { throw new Error("denied"); } };
  assert.equal(voice.getVoicePreferences().style, "calm");
  assert.doesNotThrow(() => voice.setMuted(false));
  globalThis.localStorage = previous;
});
