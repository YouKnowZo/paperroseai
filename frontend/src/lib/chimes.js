/**
 * Buddy earcons — a tiny Web Audio synth language for verdicts.
 *
 * The motifs are chosen so you can tell the result without looking:
 *   safe      🟢  C5→E5→G5 bright ascending arpeggio (resolution)
 *   moderate  🟡  two soft identical blips on G4 (neutral "hmm")
 *   caution   🟠  E4→C4 descending pair (uneasy settle)
 *   dangerous 🔴  A2/C3 alternating saw two-tone alarm (pay attention!)
 *   error         quick descending thud (something went wrong)
 *
 * Follows the same rules as the voice: silenced by the buddy mute toggle,
 * deferred until the first user gesture (autoplay policies), lazily creates
 * one shared AudioContext. Dispatches a `pr:earcon` event whenever a chime
 * plays — handy for testing and for future visualizers.
 */

const MOTIFS = {
  safe: [
    { freq: 523.25, start: 0.0, dur: 0.16, type: "triangle", gain: 0.14 },
    { freq: 659.25, start: 0.11, dur: 0.16, type: "triangle", gain: 0.14 },
    { freq: 783.99, start: 0.22, dur: 0.26, type: "triangle", gain: 0.15 },
  ],
  moderate: [
    { freq: 392.0, start: 0.0, dur: 0.11, type: "sine", gain: 0.15 },
    { freq: 392.0, start: 0.17, dur: 0.13, type: "sine", gain: 0.12 },
  ],
  caution: [
    { freq: 329.63, start: 0.0, dur: 0.15, type: "triangle", gain: 0.14 },
    { freq: 261.63, start: 0.16, dur: 0.24, type: "triangle", gain: 0.14 },
  ],
  dangerous: [
    { freq: 110.0, start: 0.0, dur: 0.11, type: "sawtooth", gain: 0.1 },
    { freq: 130.81, start: 0.14, dur: 0.11, type: "sawtooth", gain: 0.1 },
    { freq: 110.0, start: 0.28, dur: 0.11, type: "sawtooth", gain: 0.1 },
    { freq: 130.81, start: 0.42, dur: 0.2, type: "sawtooth", gain: 0.11 },
  ],
  error: [
    { freq: 196.0, start: 0.0, dur: 0.18, type: "sine", gain: 0.13, glideTo: 98.0 },
  ],
};

let ctx = null;

function ensureCtx() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

function tone(ac, { freq, start, dur, type, gain, glideTo }) {
  const t0 = ac.currentTime + start;
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function actuallyPlay(level) {
  const motif = MOTIFS[level] || MOTIFS.moderate;
  const ac = ensureCtx();
  if (!ac) return false;
  try {
    motif.forEach((n) => tone(ac, n));
    window.dispatchEvent(new CustomEvent("pr:earcon", { detail: { level } }));
    return true;
  } catch {
    return false;
  }
}

/**
 * Play the verdict chime for a safety level ("safe", "moderate", "caution",
 * "dangerous") or "error". Respects mute; if the page hasn't had its first
 * user gesture yet, the chime is held and plays on first interaction.
 */
export function playEarcon(level) {
  if (isChimeMuted()) return false;
  if (!hasUnlocked()) {
    onFirstUnlock(() => actuallyPlay(level));
    return false;
  }
  return actuallyPlay(level);
}

// Imported late to avoid a circular import — voice.js owns the mute flag.
import { isMuted as isChimeMuted, hasUnlocked, onFirstUnlock } from "./voice.js";
