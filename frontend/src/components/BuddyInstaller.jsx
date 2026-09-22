import { useEffect, useRef, useState } from "react";
import Mascot from "./Mascot.jsx";
import buildBookmarklet from "../lib/bookmarklet.js";
import { checkHealth } from "../lib/api.js";

export default function BuddyInstaller() {
  const [copied, setCopied] = useState(false);
  const [backendUp, setBackendUp] = useState(null);
  const linkRef = useRef(null);

  const bookmarkletUrl = buildBookmarklet("http://127.0.0.1:5000");

  useEffect(() => {
    checkHealth().then(() => setBackendUp(true)).catch(() => setBackendUp(false));
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
        {backendUp === true && "✅ Backend detected at 127.0.0.1:5000 — bookmarklet ready to use"}
        {backendUp === false && "⚠️ Backend offline — start it with: cd backend && PORT=5000 venv/Scripts/python app.py"}
      </div>

      <p className="installer-note">
        The bookmarklet runs entirely in your browser and only talks to your local PaperRoseAI —
        nothing is sent anywhere else. Keep the backend running while you use it.
      </p>
    </div>
  );
}
