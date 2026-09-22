import Mascot from "./Mascot.jsx";

export default function Header({ theme, onToggleTheme, aiReady, onOpenSettings }) {
  return (
    <header className="header">
      <div className="header-inner">
        <div className="brand">
          <Mascot />
          <div>
            <span className="grad-text">PaperRose</span>AI
            <div className="brand-sub">AI fine-print reader</div>
          </div>
        </div>
        <div className="header-spacer" />
        <button
          className={`btn btn-ghost btn-icon ${aiReady === false ? "needs-attention" : ""}`}
          onClick={onOpenSettings}
          title={aiReady ? "AI settings" : "Add an API key to turn on AI mode"}
          aria-label="AI settings"
        >
          ⚙️
          {aiReady === false && <span className="icon-dot" />}
        </button>
        <button className="btn btn-ghost btn-icon" onClick={onToggleTheme} title="Toggle theme">
          {theme === "dark" ? "☀️" : "🌙"}
        </button>
      </div>
    </header>
  );
}
