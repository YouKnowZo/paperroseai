import Icon from "./Icon.jsx";

const SECTIONS = [
  { id: "summary", label: "Overview", icon: "message" },
  { id: "categories", label: "Risk areas", icon: "shield" },
  { id: "flags", label: "Important clauses", icon: "flag" },
];

export default function NavBar({ reportOpen, onHome, onNewScan, onJump }) {
  return (
    <nav className="nav-row" aria-label="Main navigation">
      <div className="nav-inner">
        {!reportOpen ? <>
          <div className="nav-links">
            <button type="button" className="nav-link" onClick={() => onJump("features")}>How it works</button>
            <button type="button" className="nav-link" onClick={() => onJump("browser-extension")}>Browser extension</button>
          </div>
          <button type="button" className="nav-start" onClick={onHome}>
            <Icon name="scales" size={17} /> Start a free review
          </button>
        </> : <>
          <button type="button" className="nav-home" onClick={onNewScan} aria-label="Start a new review">
            <Icon name="back" size={17} /> <span>New review</span>
          </button>
          <span className="nav-divider" aria-hidden="true" />
          <div className="nav-jumps" aria-label="Report sections">
            {SECTIONS.map((section) => (
              <button type="button" key={section.id} className="nav-chip" onClick={() => onJump(section.id)}>
                <Icon name={section.icon} size={16} /><span>{section.label}</span>
              </button>
            ))}
          </div>
        </>}
      </div>
    </nav>
  );
}
