import ContentPage from "./ContentPage.jsx";
import Icon from "../Icon.jsx";

const STEPS = [
  {
    icon: "link",
    n: "1",
    title: "Give it a document",
    body: "Paste a Terms of Service or Privacy Policy link, paste the text yourself, or upload a PDF, DOCX, TXT, MD, or HTML file.",
  },
  {
    icon: "shield",
    n: "2",
    title: "We read it",
    body: "For a website scan, the server fetches the public page for you. For pasted text and uploads, the text is sent to the analysis engine. Nothing is sent to hosted AI unless you choose to enable it for that website scan.",
  },
  {
    icon: "scales",
    n: "3",
    title: "You get a grade",
    body: "An A–F fairness grade, safety scores for privacy, legal, content, billing, and account risk, the red flags worth a second look, a plain-English summary, and a voice that can read it aloud.",
  },
  {
    icon: "message",
    n: "4",
    title: "Check the work",
    body: "Click any red flag to see the exact wording that triggered it and what it costs you. The scanner quotes its evidence; you decide what it means.",
  },
];

const COLUMNS = [
  {
    icon: "flag",
    title: "Deterministic rules engine",
    body: "Sixteen rules catch known predatory clauses — forced arbitration, class-action waivers, data selling, auto-renewals, liability caps, unilateral changes, and more — plus positive signals like deletion rights and GDPR references. Matching is sentence-scoped and explicit negations are excluded, so boilerplate does not flatten every score.",
  },
  {
    icon: "sparkles",
    title: "Optional AI, website scans only",
    body: "Local development can use OpenAI or Gemini. Public scans can use Cloudflare Workers AI, but only for website scans and only after you choose to enable it for that scan. Pasted and uploaded text stays on the rules-only path. The deterministic engine cross-checks AI flags and clamps the score if the model is too generous.",
  },
  {
    icon: "message",
    title: "Plain English, with evidence",
    body: "Legal jargon is translated into words a 12-year-old could read. Each flag names why it was flagged, the sentence it came from, and what it costs you — the money, data, time, or right you give up.",
  },
];

const REFUSALS = [
  { icon: "shield", title: "Not a legal document", body: "A Wikipedia article about terms of service is refused, not graded." },
  { icon: "file", title: "JavaScript-only pages", body: "If a page builds itself with JavaScript and has no readable text, the tool says so honestly, and first tries the legal pages the site itself links to." },
  { icon: "message", title: "Too short to grade", body: "A pasted fragment shorter than a sentence or two is refused with the character count. One sentence is not enough to grade safely." },
  { icon: "link", title: "Nothing readable fetched", body: "The honest message plus the alternatives: a direct URL, paste, upload, the browser extension, or (local only) the bookmarklet." },
];

export default function HowItWorks() {
  return (
    <ContentPage title="How it works">
      <p className="content-lead">
        PaperRoseAI turns a Terms of Service, privacy policy, or agreement into a fairness grade, red flags with
        quotes, plain-English takeaways, and a voice that reads the report aloud. Here is what happens behind the
        scenes.
      </p>

      <section className="content-block">
        <h2>The flow</h2>
        <ol className="content-steps">
          {STEPS.map((s) => (
            <li key={s.n} className="content-step">
              <div className="content-step-num"><Icon name="scales" size={18} /></div>
              <div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="content-block">
        <h2>Two engines, one grade</h2>
        <div className="content-cols">
          {COLUMNS.map((c) => (
            <div key={c.title} className="content-col">
              <div className="content-col-icon"><Icon name={c.icon} size={24} /></div>
              <h3>{c.title}</h3>
              <p>{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="content-block">
        <h2>What it refuses to do — on purpose</h2>
        <p className="content-note">
          A scanner that guesses is worse than one that says “I can’t read this.”
        </p>
        <div className="content-cols">
          {REFUSALS.map((r) => (
            <div key={r.title} className="content-col">
              <div className="content-col-icon"><Icon name={r.icon} size={24} /></div>
              <h3>{r.title}</h3>
              <p>{r.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="content-block">
        <h2>The score</h2>
        <p>
          Safety levels come from the grade: 75–100 is safe, 55–74 is moderate, 35–54 is caution, and 0–34 is
          high risk. The numbers are calibrated against real agreements, not invented. The tool is designed to
          distinguish documents from each other rather than flatten them all into one bucket.
        </p>
      </section>
    </ContentPage>
  );
}
