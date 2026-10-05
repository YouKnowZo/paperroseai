import ContentPage from "./ContentPage.jsx";
import Icon from "../Icon.jsx";

const Q = {
  what: "What is PaperRoseAI?",
  how: "How does it decide a fairness grade?",
  accurate: "Can I trust the grade?",
  ai: "Is my text sent to AI?",
  data: "What happens to the text I paste or upload?",
  url: "What happens when I scan a website URL?",
  legal: "Is this legal advice?",
  api: "Can I use PaperRoseAI as an API?",
  accounts: "Do I need an account?",
  keys: "Do I need to enter API keys?",
  extension: "What does the browser extension do?",
  limits: "What will PaperRoseAI refuse to scan?",
  price: "Is PaperRoseAI free?",
};

export default function Faq() {
  const items = [
    {
      q: Q.what,
      a: "PaperRoseAI is an automated reading aid for Terms of Service, privacy policies, and other agreements. You give it a document and it returns a fairness grade (A–F), safety scores for privacy, legal, content, billing, and account risk, red flags with the exact wording that triggered them, a plain-English summary, and a voice that can read the report aloud.",
    },
    {
      q: Q.how,
      a: "A deterministic rules engine looks for known predatory clauses — forced arbitration, class-action waivers, data selling, auto-renewals, liability caps, unilateral changes, and more — and for positive signals like deletion rights and GDPR references. Penalties are weighted and saturating, so boilerplate costs little and harmful clauses cost a lot. Optional AI can add a plain-English summary, but the rules engine cross-checks it and clamps the score if the model is too generous.",
    },
    {
      q: Q.accurate,
      a: "The scores are calibrated against real agreements, not invented, but the tool can still be wrong, incomplete, or outdated. It can miss nuance and misunderstand context. Do not sign, spend, or litigate based only on what it says. Read the document yourself and consult a qualified attorney for anything that matters.",
    },
    {
      q: Q.ai,
      a: "Only if you choose to. For website scans, optional AI can summarize the fetched page text, but you must opt in on that scan. Pasted text and uploaded documents are always analyzed on the rules-only path. Public users never enter API keys.",
    },
    {
      q: Q.data,
      a: "Text you paste or upload is processed to generate your result and is deleted from temporary processing as soon as the service no longer needs it to return that result. Fetched webpages are retrieved at your request and are not stored as part of your personal profile. Because the public service runs on hosted serverless infrastructure, processing is temporary and the service does not maintain a personal file of your analyses.",
    },
    {
      q: Q.url,
      a: "For a website scan, the server fetches the public page for you, extracts the readable text, and analyzes it. If the page blocks automated readers or renders only with JavaScript, the tool says so honestly and suggests alternatives: a direct URL to the legal page, pasting the text, uploading a PDF, or using the browser extension.",
    },
    {
      q: Q.legal,
      a: "No. PaperRoseAI is not a lawyer and not legal advice. It is an automated reading aid. Results are informational and may be wrong, incomplete, or outdated. Do not sign, pay, or litigate based only on what it says.",
    },
    {
      q: Q.api,
      a: "The backend exposes a small API for the web app and the bookmarklet. There is no public API key program or documented third-party API surface yet. The app is designed as a self-contained tool first.",
    },
    {
      q: Q.accounts,
      a: "No. The basic public service does not ask for an account, password, or payment information. Optional AI for a website scan is offered only after you choose to enable it for that scan.",
    },
    {
      q: Q.keys,
      a: "No. Public users never enter API keys. Local, private use can verify and store an OpenAI or Gemini key through the settings panel, but that is optional and local-only.",
    },
    {
      q: Q.extension,
      a: "The browser extension copies the visible text of a page when you click it, then opens PaperRoseAI with the text ready to review. Nothing runs until you click. The extension does not access passwords, cookies, browsing history, or hidden page data, and it does not auto-submit anything.",
    },
    {
      q: Q.limits,
      a: "PaperRoseAI refuses to grade pages that are not legal documents, pages that build themselves with JavaScript and have no readable text, pasted fragments that are too short to grade safely, and anything where nothing readable could be fetched. A scanner that guesses is worse than one that says it cannot read the page.",
    },
    {
      q: Q.price,
      a: "PaperRoseAI is free to use. There is no subscription and no pay-per-scan. An optional, clearly disclosed partner offer may appear beneath some completed reports, and if you choose to sign up through it the service may earn a commission at no extra cost to you.",
    },
  ];

  return (
    <ContentPage title="FAQ">
      <p className="content-lead">
        Common questions about how PaperRoseAI works, what it can and cannot do, and how it handles your text.
      </p>

      <div className="faq-list">
        {items.map((item, i) => (
          <details key={i} className="faq-item" open={i < 3}>
            <summary>
              <span className="faq-q">{item.q}</span>
              <span className="faq-chev">▼</span>
            </summary>
            <div className="faq-a">{item.a}</div>
          </details>
        ))}
      </div>

      <section className="content-block">
        <h2>Still have a question?</h2>
        <p>
          If something here is unclear, or you have a concern about how a scan was handled, the public contact
          point is{" "}
          <a href="mailto:paperbagexpress@gmail.com" className="content-email">paperbagexpress@gmail.com</a>.
        </p>
      </section>
    </ContentPage>
  );
}
