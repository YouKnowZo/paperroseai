import Mascot from "../Mascot.jsx";
import Icon from "../Icon.jsx";

export default function ContentPage({ title, children, back = true }) {
  return (
    <article className="content-page">
      <header className="content-header">
        <div className="content-brand">
          <Mascot size={34} mood="happy" />
          <div>
            <span className="grad-text">PaperRose</span><span>AI</span>
            <div className="brand-sub">by Paperbagexpress</div>
          </div>
        </div>
        <button
          className="btn btn-ghost btn-icon"
          onClick={() => window.history.back()}
          aria-label="Back"
        >
          <Icon name="back" size={18} />
        </button>
      </header>

      <main className="content-main">
        <div className="content-body">
          <h1 className="content-title">{title}</h1>
          <hr className="content-rule" />
          {children}
        </div>
      </main>

      <footer className="content-footer">
        <p>
          <Icon name="shield" size={12} /> PaperRoseAI is an automated reading aid. It is not legal advice.
        </p>
      </footer>
    </article>
  );
}
