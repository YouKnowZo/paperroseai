import Mascot from "./Mascot.jsx";
import Icon from "./Icon.jsx";

export default function NotFound() {
  return (
    <div className="not-found">
      <div className="not-found-inner">
        <Mascot size={120} mood="quiet" />
        <h1>Page not found</h1>
        <p>This page doesn't exist on PaperRoseAI. It may have moved, or the link is wrong.</p>
        <div className="not-found-actions">
          <a href="/" className="btn btn-primary">Go home</a>
          <a href="/how-it-works" className="btn btn-ghost">See how it works</a>
        </div>
        <small className="not-found-hint">
          <Icon name="shield" size={12} /> This is an automated reading aid, not legal advice.
        </small>
      </div>
    </div>
  );
}
