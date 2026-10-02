import Mascot from "./Mascot.jsx";
import Icon from "./Icon.jsx";

export default function Header({ theme, onToggleTheme, aiReady, publicMode, onOpenSettings, children }) {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="brand">
          <Mascot />
          <div>
            <span className="grad-text">PaperRose</span><span>AI</span>
            <div className="brand-sub">by Paperbagexpress</div>
          </div>
        </div>
        <div className="header-spacer" />
        <button
          className={`btn btn-ghost btn-icon ${aiReady === false ? "needs-attention" : ""}`}
          onClick={onOpenSettings}
          title={publicMode ? "Privacy and analysis settings" : "AI settings"}
          aria-label={publicMode ? "Privacy and analysis settings" : "AI settings"}
        >
          <Icon name="settings" />
          {!publicMode && aiReady === false && <span className="icon-dot" />}
        </button>
        <button className="btn btn-ghost btn-icon" onClick={onToggleTheme} title="Toggle theme" aria-label="Toggle theme">
          <Icon name={theme === "dark" ? "sun" : "moon"} />
        </button>
      </div>
      {/* The nav row lives inside the sticky header, so it rides along with it
          and stays reachable while a long report scrolls past. */}
      {children}
    </header>
  );
}
