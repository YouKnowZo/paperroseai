import { useEffect, useRef, useState } from "react";
import TurnstileWidget from "./TurnstileWidget.jsx";
import Icon from "./Icon.jsx";

export default function InputCard({ busy, onAnalyze, publicMode = false, freeAIAvailable = false, turnstileSiteKey = "", turnstileReady = false, initialUrl = "", backendReady = false }) {
  const [mode, setMode] = useState("url"); // url | paste | upload
  const [url, setUrl] = useState(initialUrl);
  const [allowFreeAI, setAllowFreeAI] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileError, setTurnstileError] = useState("");
  const turnstileRef = useRef(null);
  const tokenRef = useRef("");
  const setToken = (token) => {
    tokenRef.current = token;
    window.__paperroseTurnstileExpiresAt = token ? Date.now() + 300000 : 0;
    setTurnstileToken(token);
  };
  const setModeAndReset = (nextMode) => {
    turnstileRef.current?.reset();
    setToken("");
    setTurnstileError("");
    if (nextMode !== "url") setAllowFreeAI(false);
    setMode(nextMode);
  };

  useEffect(() => {
    if (!publicMode) {
      setToken("");
      setAllowFreeAI(false);
      return undefined;
    }
    if (!turnstileReady) {
      setToken("");
      return undefined;
    }
    const timer = window.setInterval(() => {
      const expiresAt = window.__paperroseTurnstileExpiresAt;
      if (expiresAt && Date.now() >= expiresAt && tokenRef.current) setToken("");
    }, 1000);
    return () => window.clearInterval(timer);
  }, [publicMode, turnstileReady]);
  useEffect(() => {
    const prefill = (event) => {
      if (event.detail?.type !== "url") return;
      setMode("url");
      setUrl(event.detail.value || "");
      setAllowFreeAI(false);
      turnstileRef.current?.reset();
      setToken("");
    };
    window.addEventListener("pr:prefill", prefill);
    return () => window.removeEventListener("pr:prefill", prefill);
  }, []);
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const fileInput = useRef(null);

  const canSubmit =
    !busy && backendReady &&
    (!publicMode || (turnstileReady && Boolean(turnstileToken))) &&
    ((mode === "url" && url.trim().length > 3) ||
      (mode === "paste" && text.trim().length > 100) ||
      (mode === "upload" && file));

  async function submit() {
    if (!canSubmit) return;
    const token = turnstileToken;
    if (publicMode) setToken("");
    const consentForThisScan = allowFreeAI;
    if (publicMode && mode === "url") setAllowFreeAI(false);
    try {
      if (mode === "url") await onAnalyze({ type: "url", value: url.trim(), allowFreeAI: consentForThisScan, turnstileToken: token });
      else if (mode === "paste") await onAnalyze({ type: "text", value: text, turnstileToken: token });
      else if (file) await onAnalyze({ type: "file", value: file, turnstileToken: token });
    } finally {
      if (publicMode) {
        tokenRef.current = "";
        window.__paperroseTurnstileExpiresAt = 0;
        turnstileRef.current?.reset();
      }
    }
  }

  const tabs = [
    { id: "url", label: "Website URL", icon: "link" },
    { id: "paste", label: "Paste text", icon: "paste" },
    { id: "upload", label: "Upload file", icon: "file" },
  ];

  return (
    <div className="input-card">
      <div className="input-card-heading"><div><span className="section-kicker">THE CLARITY DESK</span><h2>What are we reading today?</h2></div><span className="input-private"><Icon name="shield" size={15} /> No account needed</span></div>
      {!backendReady && <p className="input-privacy-note" role="status">Connecting to the analysis service. If this continues, please reload the page.</p>}
      <div className="mode-tabs" aria-label="Input method">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`mode-tab ${mode === t.id ? "active" : ""}`}
            onClick={() => setModeAndReset(t.id)}
            disabled={busy}
            type="button"
          >
            <Icon name={t.icon} size={18} /> {t.label}
          </button>
        ))}
      </div>

      {mode === "url" && (
        <div className="input-row">
          <input
            type="url"
            aria-label="Agreement website URL"
            placeholder="Paste a Terms of Service or Privacy Policy link…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canSubmit && submit()}
          />
          <div className="input-divider" />
          <button className="btn btn-primary" onClick={submit} disabled={!canSubmit}>
            {busy ? "Analyzing…" : "Analyze"}
          </button>
        </div>
      )}

      {mode === "url" && publicMode && turnstileReady && (
        <TurnstileWidget
          key={mode}
          ref={turnstileRef}
          siteKey={turnstileSiteKey}
          onToken={(token) => {
            setToken(token);
            setTurnstileError("");
          }}
          onError={setTurnstileError}
        />
      )}
      {publicMode && turnstileError && <div className="input-privacy-note turnstile-status-error" role="alert">{turnstileError}</div>}
      {mode === "url" && publicMode && !turnstileReady && (
        <div className="input-privacy-note turnstile-status-error">Public scanning is temporarily unavailable while bot protection is being configured.</div>
      )}
      {mode === "url" && publicMode && (
        <div className="input-privacy-note">
          Website text is fetched by the PaperRoseAI server. Pasted text and uploads are sent to the server for rules-based analysis only; they are never sent to hosted AI.
        </div>
      )}

      {mode === "url" && publicMode && freeAIAvailable && (
        <label className="input-ai-consent">
          <input
            type="checkbox"
            checked={allowFreeAI}
            onChange={(e) => setAllowFreeAI(e.target.checked)}
          />
          <span>
            <strong>Optional AI summary:</strong> I agree to send this website’s fetched terms text to Cloudflare Workers AI. Cloudflare says it does not use customer content to train or improve models. Leave unchecked for rules-only analysis.
          </span>
        </label>
      )}

      {mode === "paste" && (
        <>
          {publicMode && turnstileReady && <TurnstileWidget key={mode} ref={turnstileRef} siteKey={turnstileSiteKey} onToken={setToken} onError={setTurnstileError} />}
          {publicMode && !turnstileReady && <div className="input-privacy-note turnstile-status-error">Public scanning is temporarily unavailable while bot protection is being configured.</div>}
          <div className="textarea-wrap">
            <textarea
              aria-label="Agreement text"
              placeholder="Paste the full text of the agreement here…"
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </div>
          <div className="textarea-meta">
            <span>{text.trim() ? `${text.trim().split(/\s+/).length.toLocaleString()} words` : " "}</span>
            <button className="btn btn-primary" onClick={submit} disabled={!canSubmit}>
              {busy ? "Analyzing…" : "Analyze text"}
            </button>
          </div>
          {publicMode && <div className="input-privacy-note">Pasted text is sent to the PaperRoseAI server for rules-based analysis only. It is not sent to hosted AI.</div>}
        </>
      )}

      {mode === "upload" && (
        <>
          {publicMode && turnstileReady && <TurnstileWidget key={mode} ref={turnstileRef} siteKey={turnstileSiteKey} onToken={setToken} onError={setTurnstileError} />}
          {publicMode && !turnstileReady && <div className="input-privacy-note turnstile-status-error">Public scanning is temporarily unavailable while bot protection is being configured.</div>}
          <div
            className={`dropzone ${drag ? "drag" : ""}`}
            role="button"
            tabIndex={0}
            aria-label="Choose an agreement file"
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); fileInput.current?.click(); } }}
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files?.[0];
              if (f) setFile(f);
            }}
          >
            <div className="big-icon"><Icon name={file ? "check" : "upload"} size={32} /></div>
            {file ? (
              <strong>{file.name}</strong>
            ) : (
              <span><strong>Click to choose</strong> or drag &amp; drop</span>
            )}
            <div className="hint">PDF · DOCX · TXT · MD · HTML — up to {publicMode ? "4" : "16"} MB</div>
          </div>
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.docx,.txt,.md,.html,.htm"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFile(f);
            }}
          />
          <div className="analyze-row">
            <button className="btn btn-primary" onClick={submit} disabled={!canSubmit}>
              {busy ? "Analyzing…" : "Analyze file"}
            </button>
          </div>
          {publicMode && <div className="input-privacy-note">Uploaded documents are sent to the PaperRoseAI server for rules-based analysis only. They are not sent to hosted AI.</div>}
        </>
      )}
    </div>
  );
}
