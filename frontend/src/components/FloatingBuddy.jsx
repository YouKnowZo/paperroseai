import { useEffect, useRef, useState } from "react";
import Mascot from "./Mascot.jsx";
import { analyzeUrl } from "../lib/api.js";
import { speak, speakOrQueue, isMuted, setMuted, isVoiceSupported, hasUnlocked, onFirstUnlock, onMuteChange } from "../lib/voice.js";
import { playEarcon } from "../lib/chimes.js";

/**
 * FloatingBuddy — a little robot that lives in the corner of the screen.
 * - Draggable anywhere; click to expand its mini-report panel
 * - Narrates what it's doing via speech bubble
 * - Auto-scrapes: ?url=... query param or "Analyze current page" button
 *   (bookmarklet mode: ?url= automatically runs on load)
 */

const NARRATION = {
  idle: "Hey! I read the fine print so you don't have to.",
  working: "Scanning this page for you…",
  reading: "Reading every clause…",
  done_safe: "Good news — this one looks pretty fair!",
  done_moderate: "Mostly fair, but there are things you should know.",
  done_caution: "Careful — this agreement waives some of your rights.",
  done_dangerous: "⚠️ Red flags everywhere! Read this before you agree.",
  error: "Ouch — I couldn't read that page. Try pasting the URL instead.",
};

const LEVELS = {
  safe: { emoji: "🟢", label: "Safe", color: "#10b981" },
  moderate: { emoji: "🟡", label: "Moderate", color: "#f59e0b" },
  caution: { emoji: "🟠", label: "Caution", color: "#f97316" },
  dangerous: { emoji: "🔴", label: "High Risk", color: "#ef4444" },
};

function gradeColor(score) {
  if (score >= 75) return "#10b981";
  if (score >= 55) return "#f59e0b";
  if (score >= 35) return "#f97316";
  return "#ef4444";
}

/** Spoken lines: emoji stripped, contractions expanded for better TTS. */
function spoken(line) {
  return line
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, "")
    .replace(/[\u{FE0F}]/gu, "")
    .replace(/\bdon't\b/g, "do not")
    .replace(/\bcan't\b/g, "cannot")
    .replace(/\bwon't\b/g, "will not")
    .replace(/\s+/g, " ")
    .trim();
}

/** Verdict line for a finished scan — grade, worst clause, flag counts. */
function verdictLine(data) {
  const highs = (data.flags || []).filter((f) => f.severity === "high");
  const worst = highs[0]?.title || (data.flags || [])[0]?.title;
  const gradeWord = { A: "an A", B: "a B", C: "a C", D: "a D", F: "an F" }[data.grade?.[0]] || data.grade;
  let line = `I give this ${gradeWord}`;
  if (data.grade?.startsWith("A") && !data.grade.endsWith("+")) line = `I give this a straight ${data.grade}`;
  line += worst ? `. Biggest thing to know: ${worst}.` : ". Nothing alarming jumped out.";
  if (highs.length > 1) line += ` Plus ${highs.length - 1} more high-severity ${highs.length === 2 ? "issue" : "issues"}.`;
  return line;
}

export default function FloatingBuddy({ autoScanUrl }) {
  const [pos, setPos] = useState(() => {
    const saved = JSON.parse(localStorage.getItem("pr-buddy-pos") || "null");
    return saved || { x: window.innerWidth - 110, y: window.innerHeight - 130 };
  });
  const [dragging, setDragging] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [mood, setMood] = useState("idle");
  const [result, setResult] = useState(null);
  const [progress, setProgress] = useState(0);
  const [zappedUrl, setZappedUrl] = useState("");
  const dragOffset = useRef({ x: 0, y: 0 });
  const didAutoScan = useRef(false);
  const [muted, setMutedState] = useState(isMuted());
  const [voiceReady, setVoiceReady] = useState(false);
  const lastSpoken = useRef("");

  const voiceSupported = isVoiceSupported();

  // If mute was set from another website (bookmarklet) or tab, follow it here.
  useEffect(() => {
    if (!voiceSupported) return;
    return onMuteChange(setMutedState);
  }, [voiceSupported]);

  // Give the TTS engine a moment to populate voices, then allow speech.
  useEffect(() => {
    if (!voiceSupported) return;
    const t = setTimeout(() => setVoiceReady(true), 800);
    return () => clearTimeout(t);
  }, [voiceSupported]);

  // ---------- auto-scrape on load (?url=...) ----------
  useEffect(() => {
    if (autoScanUrl && !didAutoScan.current) {
      didAutoScan.current = true;
      runScan(autoScanUrl, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoScanUrl]);

  // ---------- dragging ----------
  useEffect(() => {
    if (!dragging) return;
    function move(e) {
      const x = Math.min(Math.max(8, e.clientX - dragOffset.current.x), window.innerWidth - 84);
      const y = Math.min(Math.max(8, e.clientY - dragOffset.current.y), window.innerHeight - 84);
      setPos({ x, y });
    }
    function up() {
      setDragging(false);
      setPos((p) => {
        localStorage.setItem("pr-buddy-pos", JSON.stringify(p));
        return p;
      });
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [dragging]);

  function onDragStart(e) {
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    setDragging(true);
  }

  // ---------- scanning ----------
  async function runScan(url, auto = false) {
    setZappedUrl(url);
    setResult(null);
    setProgress(10);
    if (!auto) setExpanded(true);
    const timer = setInterval(() => setProgress((p) => (p < 85 ? p + 9 : p)), 400);
    try {
      const data = await analyzeUrl(url);
      setResult(data);
      setProgress(100);
      setMood(`done_${data.safety_level}`);
      if (auto) setExpanded(true);
      playEarcon(data.safety_level);
      speak(spoken(verdictLine(data)), { pitch: data.safety_level === "dangerous" ? 1.35 : 1.25 });
    } catch {
      setMood("error");
      playEarcon("error");
      speak("Sorry, I could not read that page. Try pasting the URL instead.");
    } finally {
      clearInterval(timer);
      setTimeout(() => setProgress(0), 1200);
    }
  }

  const busy = progress > 0 && progress < 100;
  const narrating = mood.startsWith("done") || mood === "error";
  const level = result ? LEVELS[result.safety_level] : null;
  const narration = busy
    ? progress < 50 ? NARRATION.working : NARRATION.reading
    : NARRATION[mood] || NARRATION.idle;

  // Speak whenever the narration line changes (and we're allowed to).
  // If the gesture gate blocked us, retry the same line on first unlock.
  useEffect(() => {
    if (!voiceSupported || !voiceReady) return;
    const line = spoken(narration);
    if (!line || line === lastSpoken.current) return;
    lastSpoken.current = line;
    if (!speakOrQueue(line)) {
      onFirstUnlock(() => {
        if (!isMuted() && lastSpoken.current === line) speak(line);
      });
    }
  }, [narration, voiceReady, voiceSupported]);

  return (
    <>
      {/* ------- expanded panel ------- */}
      {expanded && (() => {
        const panelW = Math.min(320, window.innerWidth - 24);
        const panelH = Math.min(560, window.innerHeight - 24);
        // Prefer sitting beside the buddy; flip to the other side if cramped.
        const leftIfRight = pos.x + 80;
        const leftIfLeft = pos.x - panelW - 16;
        const left = leftIfLeft >= 12 ? leftIfLeft
          : leftIfRight + panelW <= window.innerWidth - 12 ? leftIfRight
          : Math.max(12, (window.innerWidth - panelW) / 2);
        const top = Math.max(12, Math.min(pos.y - 60, window.innerHeight - panelH - 12));
        return (
        <div
          className="buddy-panel"
          style={{ left, top }}
        >
          <div className="buddy-panel-head">
            <strong>Buddy report</strong>
            <button className="buddy-close" onClick={() => setExpanded(false)}>×</button>
          </div>

          {busy && (
            <div className="buddy-scan">
              <div className="buddy-mini-bot"><Mascot size={44} mood="thinking" className="" /></div>
              <p>{narration}</p>
              <div className="progress-track"><div className="progress-fill" style={{ width: `${progress}%` }} /></div>
            </div>
          )}

          {!busy && result && (
            <>
              <div className="buddy-verdict">
                <div className="buddy-grade" style={{ color: gradeColor(result.score) }}>{result.grade}</div>
                <div>
                  <span className="buddy-level" style={{ color: level.color }}>{level.emoji} {level.label}</span>
                  <div className="buddy-url">{zappedUrl.replace(/^https?:\/\//, "").slice(0, 42)}</div>
                </div>
              </div>
              <ul className="buddy-summary">
                {result.plain_summary.slice(0, 3).map((s, i) => <li key={i}>{s}</li>)}
              </ul>
              {result.flags?.length > 0 && (
                <div className="buddy-flags">
                  <strong>Top red flags</strong>
                  {result.flags.slice(0, 3).map((f, i) => (
                    <div className="buddy-flag" key={i}>
                      <span className={`sev-badge sev-${f.severity}`}>{f.severity}</span> {f.title}
                    </div>
                  ))}
                </div>
              )}
              <button
                className="btn btn-primary buddy-open-full"
                onClick={() => {
                  // Ask the main app to render the full report for this URL
                  window.dispatchEvent(new CustomEvent("pr:analyze", { detail: { type: "url", value: zappedUrl } }));
                  setExpanded(false);
                }}
              >
                Open full report ↗
              </button>
            </>
          )}

          {!busy && !result && (
            <div className="buddy-scan">
              <p>Give me a page to read — or zap the current website with the button below.</p>
            </div>
          )}

          <button
            className="btn btn-ghost buddy-zap"
            disabled={busy}
            onClick={() => {
              const u = window.prompt("Which page should I scan?", window.location.href.startsWith("http") && !window.location.href.includes("localhost") ? window.location.href : "https://");
              if (u && u !== "https://") runScan(u);
            }}
          >
            ⚡ Zap current page
          </button>
        </div>
        );
      })()}

      {/* ------- the buddy itself ------- */}
      <div className="buddy-anchor" style={{ left: pos.x, top: pos.y }}>
        {!expanded && narrating && !busy && (
          <div className="buddy-bubble">{narration}</div>
        )}
        {busy && <div className="buddy-bubble buddy-bubble-think">{narration}</div>}
        {voiceSupported && (
          <button
            className={`buddy-mute ${muted ? "muted" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              const next = !muted;
              setMutedState(next);
              setMuted(next);
              if (!next) {
                // audible confirmation that the buddy can hear/speak again
                speak("Voice on!");
              }
            }}
            title={muted ? "Buddy is muted — click to hear me" : "Buddy voice on — click to mute"}
            aria-label={muted ? "Unmute buddy voice" : "Mute buddy voice"}
          >
            {muted ? "🔇" : "🔊"}
          </button>
        )}
        <div
          className={`buddy-bot ${dragging ? "dragging" : ""} ${busy ? "busy" : ""}`}
          onMouseDown={onDragStart}
          onClick={() => !dragging && setExpanded((v) => !v)}
          onContextMenu={(e) => {
            if (voiceSupported) {
              e.preventDefault();
              const next = !muted;
              setMutedState(next);
              setMuted(next);
              if (!next) speak("Voice on!");
            }
          }}
          title="Drag me anywhere · click for my report"
        >
          <Mascot size={64} mood={busy ? "thinking" : "happy"} className="" />
          {busy && <div className="buddy-scanline" />}
        </div>
      </div>
    </>
  );
}
