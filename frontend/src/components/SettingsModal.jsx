import { useEffect, useRef, useState } from "react";
import { getKeys, saveKey, removeKey, checkKeys } from "../lib/api.js";

/** Turn a provider status object into a pill the user can read at a glance. */
function describe(p) {
  if (!p.configured) {
    return { tone: "off", icon: "○", text: "Not set" };
  }
  if (p.valid === true) {
    return { tone: "ok", icon: "✓", text: "Verified working" };
  }
  if (p.valid === false && p.kind === "invalid") {
    return { tone: "bad", icon: "✕", text: "Key rejected" };
  }
  if (p.valid === false) {
    return { tone: "warn", icon: "⚠", text: "Couldn't verify" };
  }
  return { tone: "unknown", icon: "◌", text: "Not tested yet" };
}

function sourceLabel(p) {
  if (!p.configured) return null;
  const where = p.source === "saved" ? "saved in the app" : "read from .env";
  return `${p.masked} · ${where}`;
}

function ProviderRow({ status, meta, onChanged, onNote }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState(null); // { tone, text, canForce }
  const inputRef = useRef(null);
  const pill = describe(status);

  async function submit(force = false) {
    const key = draft.trim();
    if (!key) return;
    setBusy(true);
    setFeedback(null);
    try {
      const data = await saveKey(status.id, key, force);
      if (data.ok) {
        setDraft("");
        setFeedback(
          data.valid
            ? { tone: "ok", text: data.engine === "ai" ? "Saved — AI mode is on." : "Saved and verified." }
            : { tone: "warn", text: "Saved without verification — it may still be rejected." }
        );
        onNote(`${meta.label} key saved ✓`);
        onChanged(data);
      } else {
        setFeedback({
          tone: "bad",
          text: data.message || "The provider rejected that key.",
          canForce: true,
        });
      }
    } catch (e) {
      setFeedback({ tone: "bad", text: e.message || "Couldn't save that key." });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    setFeedback(null);
    try {
      const data = await removeKey(status.id);
      setFeedback({
        tone: "warn",
        text: data.fell_back_to_env
          ? "Removed — falling back to the key in backend/.env."
          : "Removed — this provider is now off.",
      });
      onNote(`${meta.label} key removed`);
      onChanged(data);
    } catch (e) {
      setFeedback({ tone: "bad", text: e.message || "Couldn't remove that key." });
    } finally {
      setBusy(false);
    }
  }

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setDraft(text.trim());
        setFeedback(null);
        return;
      }
    } catch {
      /* clipboard blocked — user can paste manually */
    }
    inputRef.current?.focus();
  }

  return (
    <div className={`provider provider-${pill.tone}`}>
      <div className="provider-head">
        <div className="provider-name">
          <strong>{meta.label}</strong>
          <span className="chip">{meta.model}</span>
        </div>
        <span className={`pill pill-${pill.tone}`}>
          {pill.icon} {pill.text}
        </span>
      </div>

      {status.configured && (
        <div className="provider-current">
          <code>{sourceLabel(status)}</code>
          {status.valid === false && status.message && (
            <div className="provider-why">{status.message}</div>
          )}
        </div>
      )}

      <div className="provider-form">
        <input
          ref={inputRef}
          type="password"
          className="key-input"
          placeholder={status.configured ? "Paste a new key to replace it…" : `${meta.hint} paste your key`}
          value={draft}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setDraft(e.target.value);
            setFeedback(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit(false);
          }}
          disabled={busy}
        />
        <button className="btn btn-ghost" onClick={paste} disabled={busy} title="Paste from clipboard">
          Paste
        </button>
        <button
          className="btn btn-primary"
          onClick={() => submit(false)}
          disabled={busy || !draft.trim()}
        >
          {busy ? "Testing…" : "Save & test"}
        </button>
        {status.source === "saved" && (
          <button className="btn btn-ghost btn-danger" onClick={remove} disabled={busy}>
            Remove
          </button>
        )}
      </div>

      <div className="provider-foot">
        <a href={meta.console} target="_blank" rel="noreferrer">
          Get a {meta.label} key ↗
        </a>
        {feedback && (
          <div className={`provider-feedback tone-${feedback.tone}`}>
            <span>{feedback.text}</span>
            {feedback.canForce && (
              <button className="btn btn-ghost btn-sm" onClick={() => submit(true)} disabled={busy}>
                Save anyway
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function SettingsModal({ onClose, onNote }) {
  const [data, setData] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");

  async function load({ verify = false } = {}) {
    try {
      const base = await getKeys();
      setData(base);
      // Verify configured keys — an expired key should be visible immediately,
      // not twenty seconds into an analysis.
      if (verify && Object.values(base.providers).some((p) => p.configured)) {
        setChecking(true);
        const checked = await checkKeys();
        setData((prev) => ({ ...prev, ...checked, config: prev?.config || checked.config }));
        setChecking(false);
      }
    } catch (e) {
      setError(e.message || "Couldn't reach the backend.");
    }
  }

  useEffect(() => {
    load({ verify: true });
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, []);

  const ai = data?.engine === "ai";

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="AI settings" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <div>
            <h2>AI settings</h2>
            <p className="modal-sub">
              Paste a provider key to unlock real AI summaries. No .env editing, no restart.
            </p>
          </div>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Close settings">
            ✕
          </button>
        </div>

        <div className={`engine-strip ${ai ? "is-ai" : ""}`}>
          <span className="dot" />
          {error ? (
            <span>Backend unreachable — {error}</span>
          ) : !data ? (
            <span>Checking your keys…</span>
          ) : ai ? (
            <span>
              <strong>AI mode on</strong> — analysing with {data.active_model}
            </span>
          ) : (
            <span>
              <strong>Rules engine</strong> — works offline and free, but no AI summaries yet
            </span>
          )}
          {checking && <span className="engine-checking">testing saved keys…</span>}
        </div>

        {data && (
          <div className="providers">
            {["openai", "gemini"].map((id) => (
              <ProviderRow
                key={id}
                status={data.providers[id]}
                meta={data.config[id]}
                onChanged={(next) => {
                  setData((prev) => ({ ...prev, ...next }));
                  // let the app refresh its health badge
                  window.dispatchEvent(new CustomEvent("pr:settings-changed"));
                }}
                onNote={onNote || (() => {})}
              />
            ))}
          </div>
        )}

        <div className="modal-foot">
          <p>
            Keys are stored on this machine only (<code>{data?.keys_path || "backend/keys.json"}</code>) and are
            sent to nobody but the provider you picked. Everything else stays local.
          </p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => load({ verify: true })} disabled={checking}>
              {checking ? "Testing…" : "Test my keys"}
            </button>
            <button className="btn btn-primary" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
