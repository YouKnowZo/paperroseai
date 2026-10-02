import { useEffect, useRef, useState } from "react";
import Mascot from "./Mascot.jsx";
import buildBookmarklet from "../lib/bookmarklet.js";
import { API_BASE, checkHealth } from "../lib/api.js";

export default function BuddyInstaller() {
  const [copied, setCopied] = useState(false);
  const [backendUp, setBackendUp] = useState(null);
  const linkRef = useRef(null);

  const [apiBase, setApiBase] = useState(API_BASE || "http://127.0.0.1:5000");
  const bookmarkletUrl = buildBookmarklet(apiBase);

  useEffect(() => {
    checkHealth()
      .then((health) => {
        setBackendUp(true);
        if (health.public_mode && API_BASE) setApiBase(API_BASE);
      })
      .catch(() => setBackendUp(false));
  }, []);

  async function copy() {
    try {
      await navigator.clipboard.writeText(bookmarkletUrl);
    } catch {
      // clipboard API can be blocked on http; fallback
      const ta = document.createElement("textarea");
      ta.value = bookmarkletUrl;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  }

  return (
    <div className="card installer-card" id="install-buddy">
      <div className="installer-head">
        <Mascot size={46} className="" />
        <div>
          <h3>Take the Buddy anywhere</h3>
          <p className="installer-sub">
            One drag and the little robot can scan the fine print on <strong>any website</strong> —
            without leaving it.
          </p>
        </div>
      </div>

      <ol className="installer-steps">
        <li>
          <span className="step-num">1</span>
          <span>
            Drag this robot to your bookmarks bar:
            <a
              ref={linkRef}
              href={bookmarkletUrl}
              className="bookmarklet-drag"
              onClick={(e) => e.preventDefault()}
              title="Drag me to your bookmarks bar!"
            >
              <Mascot size={22} className="" /> PaperRose Buddy
            </a>
          </span>
        </li>
        <li>
          <span className="step-num">2</span>
          <span>
            Or copy it and add a bookmark manually:
            <button className="btn btn-ghost btn-copy" onClick={copy}>
              {copied ? "✅ Copied!" : "📋 Copy bookmarklet"}
            </button>
          </span>
        </li>
        <li>
          <span className="step-num">3</span>
          <span>
            Visit any site's terms or privacy page and <strong>click the bookmark</strong> — the buddy
            appears, scrapes the page, and grades it right there.
          </span>
        </li>
      </ol>

      <div className={`installer-status ${backendUp ? "ok" : backendUp === false ? "down" : ""}`}>
        {backendUp === null && "⏳ Checking backend…"}
        {backendUp === true && `✅ Backend detected at ${apiBase} — bookmarklet ready to use`}
        {backendUp === false && "⚠️ Backend offline — start it with: cd backend && PORT=5000 venv/Scripts/python app.py"}
      </div>

      <p className="installer-note">
        The bookmarklet reads the current page in your browser and sends that text to {apiBase} for analysis. The configured service receives the page text; it is not kept as an uploaded document.
      </p>
    </div>
  );
}
