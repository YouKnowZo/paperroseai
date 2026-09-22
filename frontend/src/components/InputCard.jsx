import { useRef, useState } from "react";

export default function InputCard({ busy, onAnalyze }) {
  const [mode, setMode] = useState("url"); // url | paste | upload
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [drag, setDrag] = useState(false);
  const fileInput = useRef(null);

  const canSubmit =
    !busy &&
    ((mode === "url" && url.trim().length > 3) ||
      (mode === "paste" && text.trim().length > 100) ||
      (mode === "upload" && file));

  function submit() {
    if (mode === "url") onAnalyze({ type: "url", value: url.trim() });
    else if (mode === "paste") onAnalyze({ type: "text", value: text });
    else if (file) onAnalyze({ type: "file", value: file });
  }

  const tabs = [
    { id: "url", label: "🔗 Website URL" },
    { id: "paste", label: "📋 Paste text" },
    { id: "upload", label: "📄 Upload file" },
  ];

  return (
    <div className="input-card">
      <div className="mode-tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            className={`mode-tab ${mode === t.id ? "active" : ""}`}
            onClick={() => setMode(t.id)}
            type="button"
          >
            {t.label}
          </button>
        ))}
      </div>

      {mode === "url" && (
        <div className="input-row">
          <input
            type="url"
            placeholder="Paste a Terms of Service or Privacy Policy link…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && canSubmit && submit()}
            autoFocus
          />
          <div className="input-divider" />
          <button className="btn btn-primary" onClick={submit} disabled={!canSubmit}>
            {busy ? "Analyzing…" : "Analyze"}
          </button>
        </div>
      )}

      {mode === "paste" && (
        <>
          <div className="textarea-wrap">
            <textarea
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
        </>
      )}

      {mode === "upload" && (
        <>
          <div
            className={`dropzone ${drag ? "drag" : ""}`}
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
            <div className="big-icon">{file ? "✅" : "⬆️"}</div>
            {file ? (
              <strong>{file.name}</strong>
            ) : (
              <span><strong>Click to choose</strong> or drag &amp; drop</span>
            )}
            <div className="hint">PDF · DOCX · TXT · MD · HTML — up to 16 MB</div>
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
        </>
      )}
    </div>
  );
}
