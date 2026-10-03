import { useEffect, useRef, useState } from "react";
import Mascot from "./Mascot.jsx";
import Icon from "./Icon.jsx";
import { getVoicePreferences, isMuted, isVoiceSupported, onMuteChange, onVoiceChange, onVoicesChange, setMuted, setVoiceByName, setVoiceRate, setVoiceStyle, speak, stopSpeaking, VOICE_STYLES } from "../lib/voice.js";

function clampPosition(pos) {
  return { x: Math.max(12, Math.min(pos.x, window.innerWidth - 88)), y: Math.max(12, Math.min(pos.y, window.innerHeight - 100)) };
}
function initialPosition() {
  try {
    const saved = JSON.parse(localStorage.getItem("pr-buddy-pos"));
    if (Number.isFinite(saved?.x) && Number.isFinite(saved?.y)) return clampPosition(saved);
  } catch { /* stale or unavailable storage */ }
  return clampPosition({ x: window.innerWidth - 108, y: window.innerHeight - 116 });
}

export default function FloatingBuddy({ result, busy, onNewScan }) {
  const [pos, setPos] = useState(initialPosition);
  const [expanded, setExpanded] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [muted, setMutedState] = useState(isMuted);
  const [preferences, setPreferences] = useState(getVoicePreferences);
  const [voices, setVoices] = useState([]);
  const drag = useRef(null);
  const closeRef = useRef(null);
  const launcherRef = useRef(null);
  const supported = isVoiceSupported();

  useEffect(() => onMuteChange(setMutedState), []);
  useEffect(() => onVoiceChange(setPreferences), []);
  useEffect(() => onVoicesChange(setVoices), []);
  useEffect(() => {
    const resize = () => setPos((current) => clampPosition(current));
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    if (!expanded) return;
    closeRef.current?.focus();
    const escape = (event) => { if (event.key === "Escape") { event.stopPropagation(); closePanel(); } };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [expanded]);

  function closePanel() { setExpanded(false); launcherRef.current?.focus(); }
  function toggleMuted() { setMuted(!muted); }
  function pointerDown(event) {
    if (event.button !== 0) return;
    drag.current = { x: event.clientX, y: event.clientY, origin: pos, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function pointerMove(event) {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    if (Math.abs(dx) + Math.abs(dy) > 6) drag.current.moved = true;
    if (!drag.current.moved) return;
    setDragging(true);
    setPos(clampPosition({ x: drag.current.origin.x + dx, y: drag.current.origin.y + dy }));
  }
  function pointerUp(event) {
    if (!drag.current) return;
    const moved = drag.current.moved;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (!moved) setExpanded((value) => !value);
    try { localStorage.setItem("pr-buddy-pos", JSON.stringify(pos)); } catch { /* noop */ }
  }
  function previewVoice() {
    setMuted(false);
    speak("This is a preview of your selected voice. Use Read my report to hear your analysis.");
  }
  function readReport() {
    if (!result) return;
    setMuted(false);
    speak(`Your fairness grade is ${result.grade}. ${(result.plain_summary || []).slice(0, 4).join(" ")} ${result.flags?.length ? `The main issue to review is ${result.flags[0].title}.` : "No known red flags were found, but please review the agreement yourself."}`);
  }

  const panelWidth = Math.min(360, window.innerWidth - 24);
  const panelLeft = Math.max(12, Math.min(pos.x - panelWidth - 12, window.innerWidth - panelWidth - 12));
  const panelTop = Math.max(12, Math.min(pos.y - 400, window.innerHeight - Math.min(600, window.innerHeight - 24) - 12));
  const narration = busy ? "Reading the fine print…" : result ? `Your report is ready. Grade ${result.grade}.` : "Small print. Big clarity.";
  const selectedVoice = voices.some((voice) => voice.voiceURI === preferences.voice || voice.name === preferences.voice) ? preferences.voice : "";

  return <>
    {expanded && <section className="buddy-panel" style={{ left: panelLeft, top: panelTop }} role="dialog" aria-label="Report assistant">
      <div className="buddy-panel-head">
        <div className="buddy-identity"><Mascot size={48} className="" /><div><strong>Report assistant</strong><small>Fine-print analysis</small></div></div>
        <button ref={closeRef} className="buddy-close" onClick={closePanel} aria-label="Close assistant"><Icon name="close" size={16} /></button>
      </div>
      <div className="buddy-intro"><span className="buddy-online-dot" />{narration}</div>
      {result ? <div className="buddy-report-preview">
        <span className={`buddy-report-grade level-${result.safety_level}`}>{result.grade}</span>
        <div><strong>{result.flags?.length || 0} flags to review</strong><p>{result.plain_summary?.[0]}</p></div>
      </div> : <p className="buddy-description">Start with a link, pasted text, or a document. Audio plays only when you press Preview voice or Read my report.</p>}
      <div className="buddy-actions">
        {result && supported && <button className="btn btn-primary" onClick={readReport}><Icon name="volume" size={17} /> Read my report</button>}
        <button className="btn btn-ghost" disabled={busy} onClick={() => { closePanel(); onNewScan(); }}><Icon name="sparkles" size={17} /> {result ? "New scan" : "Start a scan"}</button>
      </div>
      <div className="voice-settings">
        <h3><Icon name="volume" size={18} /> Voice settings</h3>
        {supported ? <>
          <label htmlFor="buddy-voice">Voice</label>
          <select id="buddy-voice" value={selectedVoice} onChange={(event) => setVoiceByName(event.target.value)}>
            <option value="">Automatic · best available</option>
            {voices.map((voice) => <option key={`${voice.voiceURI}-${voice.lang}`} value={preferences.voice === voice.name ? voice.name : voice.voiceURI}>{voice.name} · {voice.lang}{voice.localService ? " · on-device" : ""}</option>)}
          </select>
          <label htmlFor="buddy-style">Personality</label>
          <select id="buddy-style" value={preferences.style} onChange={(event) => setVoiceStyle(event.target.value)}>
            {Object.entries(VOICE_STYLES).map(([key, style]) => <option key={key} value={key}>{style.label}</option>)}
          </select>
          <label htmlFor="buddy-speed">Speaking speed <span>{preferences.rate.toFixed(1)}×</span></label>
          <input id="buddy-speed" type="range" min="0.7" max="1.3" step="0.1" value={preferences.rate} onChange={(event) => setVoiceRate(event.target.value)} />
          <div className="voice-preview-actions">
            <button className="btn btn-ghost btn-sm" onClick={previewVoice}><Icon name="play" size={15} /> Preview voice</button>
            <button className="btn btn-ghost btn-sm" onClick={stopSpeaking}><Icon name="stop" size={15} /> Stop</button>
            <button className="btn btn-ghost btn-sm" onClick={toggleMuted}>{muted ? "Unmute" : "Mute"}</button>
          </div>
          <p className="voice-note">Voices depend on your browser and device. {voices.length ? "Settings are saved on this device." : "Device voices are loading. Playback is always manual."} Some system voices use your browser’s speech service.</p>
        </> : <p className="voice-note">Speech isn’t available in this browser. Report viewing and scanning still work.</p>}
      </div>
      <div className="buddy-credit">PaperRoseAI <strong>by Paperbagexpress</strong></div>
    </section>}
    <div className="buddy-anchor" style={{ left: pos.x, top: pos.y }}>
      {supported && <button className={`buddy-mute ${muted ? "muted" : ""}`} onClick={toggleMuted} title={muted ? "Unmute report audio" : "Mute report audio"} aria-label={muted ? "Unmute report audio" : "Mute report audio"}><Icon name={muted ? "mute" : "volume"} size={16} /></button>}
      <button ref={launcherRef} className={`buddy-bot ${dragging ? "dragging" : ""} ${busy ? "busy" : ""}`} onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { drag.current = null; setDragging(false); }} onClick={(event) => { if (event.detail === 0) setExpanded((value) => !value); }} aria-label="Open report assistant and voice settings" aria-expanded={expanded} title="Report assistant · drag to move">
        <Mascot size={76} mood={busy ? "thinking" : "happy"} className="" />
        {busy && <div className="buddy-scanline" />}
      </button>
    </div>
  </>;
}
