// Navigation for an app that had none.
//
// Back/Forward drive *real* browser history entries rather than a private stack,
// so the browser's own buttons and these agree, and each screen you visit is a
// place you can genuinely return to. The section chips solve the other half of
// the complaint: a finished report is long, and there was no way to move around
// inside it without scrolling.

const SECTIONS = [
  { id: "summary", label: "Summary", icon: "💬" },
  { id: "categories", label: "Categories", icon: "🧭" },
  { id: "flags", label: "Red flags", icon: "🚩" },
];

export default function NavBar({
  canGoBack,
  canGoForward,
  reportOpen,
  onBack,
  onForward,
  onHome,
  onExit,
  onJump,
}) {
  return (
    <nav className="nav-row" aria-label="Navigation">
      <div className="nav-inner">
        <button
          type="button"
          className="nav-btn"
          onClick={onBack}
          disabled={!canGoBack}
          title={canGoBack ? "Back to the previous screen (Alt+←)" : "Nothing to go back to"}
          aria-label="Go back"
        >
          <span aria-hidden="true">←</span>
          <span className="nav-label">Back</span>
        </button>
        <button
          type="button"
          className="nav-btn"
          onClick={onForward}
          disabled={!canGoForward}
          title={canGoForward ? "Forward to the next screen (Alt+→)" : "Nothing to go forward to"}
          aria-label="Go forward"
        >
          <span aria-hidden="true">→</span>
          <span className="nav-label">Forward</span>
        </button>

        <span className="nav-divider" aria-hidden="true" />

        <button
          type="button"
          className="nav-btn"
          onClick={onHome}
          title="Start a new scan — this report stays in your history"
          aria-label="Start a new scan"
        >
          <span aria-hidden="true">⌂</span>
          <span className="nav-label">New scan</span>
        </button>

        {reportOpen && (
          <>
            <span className="nav-divider" aria-hidden="true" />
            <div className="nav-jumps">
              {SECTIONS.map((s) => (
                <button
                  type="button"
                  key={s.id}
                  className="nav-chip"
                  onClick={() => onJump(s.id)}
                  title={`Jump to ${s.label.toLowerCase()}`}
                >
                  <span aria-hidden="true">{s.icon}</span>
                  <span>{s.label}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="nav-btn nav-exit"
              onClick={onExit}
              title="Close this report and forget it (Esc)"
              aria-label="Close this report"
            >
              <span aria-hidden="true">✕</span>
              <span className="nav-label">Exit</span>
            </button>
          </>
        )}
      </div>
    </nav>
  );
}
