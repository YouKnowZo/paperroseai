import GradeDial from "./GradeDial.jsx";
import Icon from "./Icon.jsx";

const SEV_ORDER = { high: "High", medium: "Medium", low: "Low" };

function SummaryCard({ result }) {
  return (
    <div className="card summary-card" id="summary">
      <h3><Icon name="message" /> In plain English</h3>
      <ul className="summary-list">
        {result.plain_summary.map((s, i) => (
          <li key={i}>
            <span className="bullet"><Icon name={["check", "file", "scales", "flag", "shield", "sparkles"][i % 6]} size={15} /></span>
            {s}
          </li>
        ))}
      </ul>
      {result.positives?.length > 0 && (
        <div className="positives-row">
          {result.positives.map((p, i) => (
            <span className="positive-chip" key={i}>✓ {p}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function CategoryTile({ cat }) {
  const color =
    cat.score >= 75 ? "#10b981" : cat.score >= 55 ? "#f59e0b" : cat.score >= 35 ? "#f97316" : "#ef4444";
  return (
    <div className="category-tile">
      <div className="cat-head">
        <span className="cat-name">{cat.name}</span>
        <span className="cat-score" style={{ color, background: `${color}1a` }}>{cat.score}</span>
      </div>
      <div className="cat-bar">
        <div className="cat-bar-fill" style={{ width: `${cat.score}%`, background: color }} />
      </div>
      <div className="cat-verdict">{cat.verdict}</div>
    </div>
  );
}

// Highlights the exact wording that triggered the detector inside the sentence
// it came from, so the user can check the scanner's work instead of trusting it.
function HighlightedQuote({ quote, matched }) {
  if (!quote) return null;
  const at = matched ? quote.toLowerCase().indexOf(matched.toLowerCase()) : -1;
  if (at === -1) return <>“{quote}”</>;
  return (
    <>
      “{quote.slice(0, at)}
      <mark className="flag-hit">{quote.slice(at, at + matched.length)}</mark>
      {quote.slice(at + matched.length)}”
    </>
  );
}

function FlagItem({ flag, index }) {
  const quote = flag.quote?.trim();
  return (
    <details className="flag-item" open={index === 0}>
      <summary>
        <span className={`sev-badge sev-${flag.severity}`}>{SEV_ORDER[flag.severity] || "Note"}</span>
        <span className="flag-title">{flag.title}</span>
        <span className="chev">▼</span>
      </summary>
      <div className="flag-body">
        <div className="flag-block">
          <span className="flag-label">Why it was flagged</span>
          <p className="flag-why">{flag.why || "Flagged by the scanner reading this passage."}</p>
        </div>

        {quote && (
          <div className="flag-block">
            <span className="flag-label">What the document says</span>
            <blockquote className="flag-quote">
              <HighlightedQuote quote={quote} matched={flag.matched} />
            </blockquote>
          </div>
        )}

        {flag.cost && (
          <div className="flag-block flag-cost-block">
            <span className="flag-label">What it costs you</span>
            <p className="flag-cost">{flag.cost}</p>
          </div>
        )}

        {flag.explanation && <p className="flag-plain">{flag.explanation}</p>}
        {flag.section && <span className="flag-section">📍 {flag.section}</span>}
      </div>
    </details>
  );
}

function FlagsCard({ flags }) {
  if (!flags?.length) {
    return (
      <div className="card flags-card" id="flags">
        <h3><Icon name="flag" /> Red flags <span className="count">0</span></h3>
        <div className="no-flags">
          <span className="big"><Icon name="shield" size={30} /></span>
          No known predatory clauses found. Still skim it yourself — automation misses nuance.
        </div>
      </div>
    );
  }
  const high = flags.filter((f) => f.severity === "high").length;
  return (
    <div className="card flags-card" id="flags">
      <h3>
        <Icon name="flag" /> Red flags <span className="count">{flags.length}{high ? ` · ${high} serious` : ""}</span>
      </h3>
      <div className="flag-list">
        {flags.map((f, i) => (
          <FlagItem flag={f} index={i} key={`${f.id}-${i}`} />
        ))}
      </div>
      <p className="flag-hint">Click any clause to see the wording that triggered it and what it costs you.</p>
    </div>
  );
}

export default function Results({ result, publicMode = false }) {
  const m = result.meta || {};
  return (
    <div className="results">
      <div className="results-top">
        <GradeDial result={result} />
        <SummaryCard result={result} />
      </div>

      <div className="card categories-card" id="categories">
        <h3><Icon name="shield" /> Category safety levels</h3>
        <div className="categories-grid">
          {result.categories.map((c) => (
            <CategoryTile key={c.id} cat={c} />
          ))}
        </div>
      </div>

      <FlagsCard flags={result.flags} />

      {!publicMode && result.related_pages?.length > 0 && (
        <div className="card related-card">
          <h3><Icon name="link" /> More fine print on this site</h3>
          <div className="related-row">
            {result.related_pages.map((p) => (
              <button
                key={p.url}
                className="related-chip"
                title={`Analyze ${p.url}`}
                onClick={() => window.dispatchEvent(
                  new CustomEvent("pr:analyze", { detail: { type: "url", value: p.url } })
                )}
              >
                {p.emoji} {p.label} <span className="related-arrow">→</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {result.did_you_know?.length > 0 && (
        <div className="card dyk-card">
          <h3><Icon name="sparkles" /> Did you know?</h3>
          {result.did_you_know.map((d, i) => (
            <p key={i}>{d}</p>
          ))}
        </div>
      )}

      <div className="results-meta">
        <span className="engine-chip">{m.engine === "ai" ? `🤖 ${m.model}` : "📐 rules engine"}</span>
        {m.words && <span>{m.words.toLocaleString()} words</span>}
        {m.reading_time_min && <span>~{m.reading_time_min} min read</span>}
        {m.chars && <span>{m.chars.toLocaleString()} chars analyzed</span>}
      </div>
    </div>
  );
}
