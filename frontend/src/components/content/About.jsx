import ContentPage from "./ContentPage.jsx";
import Icon from "../Icon.jsx";

const POINTS = [
  {
    icon: "scales",
    title: "Built to tilt the reading balance",
    body: "Fine print is written by people with lawyers and time. Most of us have neither. PaperRoseAI exists so a person can open a terms page, a privacy policy, or an agreement and actually understand what they are being asked to accept before they click yes.",
  },
  {
    icon: "flag",
    title: "Evidence first, not vibes",
    body: "Every red flag is tied to the exact wording that triggered it. You can open a clause and read the sentence it came from, in context. The grade is not an opinion badge — it is the output of a deterministic rules engine, optionally cross-checked by AI, and you can check the work behind any flag.",
  },
  {
    icon: "shield",
    title: "Honest about its limits",
    body: "PaperRoseAI is an automated reading aid. It can miss nuance, misunderstand context, and be wrong. It is not a lawyer and not legal advice. When a page is not a contract, or cannot be read, it says so rather than inventing a grade. A false A+ is the worst possible output, so the tool refuses more often than it guesses.",
  },
  {
    icon: "message",
    title: "Made by one small team",
    body: "PaperRoseAI is provided by PaperBagExpress. It is built to be usable immediately, without an account, and without asking you to hand over keys or personal information to use the basic public service. Optional AI is available only for website scans, and only after you choose to enable it for that scan.",
  },
  {
    icon: "volume",
    title: "A voice that fits you",
    body: "Reports can be read aloud in a voice and speed you choose, so the fine print is easier to absorb. Speech is manual and local to your browser — there is no automatic narration, and nothing plays unless you ask it to.",
  },
];

export default function About() {
  return (
    <ContentPage title="About">
      <p className="content-lead">
        PaperRoseAI is a small, free tool for understanding the fine print. Paste a link, text, or upload a
        document and get a fairness grade, red flags with quotes, plain-English takeaways, and a voice that
        reads the report aloud.
      </p>

      <ul className="content-points">
        {POINTS.map((p) => (
          <li key={p.title} className="content-point">
            <div className="content-point-icon"><Icon name={p.icon} size={22} /></div>
            <div>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </div>
          </li>
        ))}
      </ul>

      <section className="content-block">
        <h2>What it is not</h2>
        <p>
          PaperRoseAI is not a lawyer. It is not legal advice. It does not replace reading the document
          yourself or consulting a qualified attorney for anything that matters. Do not sign, spend, or
          litigate based only on what it says.
        </p>
        <p>
          The grades reflect what a document says, not the reputation of the company that wrote it. A tool
          that reads a friendly-looking policy can still flag the clauses that matter. A tool that reads a
          predatory policy can still give it the score it earned.
        </p>
      </section>

      <section className="content-block">
        <h2>The team</h2>
        <p>
          PaperRoseAI is built and operated by PaperBagExpress. If you have a question about the service,
          the legal pages, or a concern about how a scan was handled, the public contact point is
          <a href="mailto:paperbagexpress@gmail.com" className="content-email">paperbagexpress@gmail.com</a>.
        </p>
        <p className="content-note">
          This is a draft for review by a qualified attorney. It is not legal advice and may not cover every
          obligation that applies to your business, jurisdiction, or data practices.
        </p>
      </section>

      <section className="content-block">
        <h2>The name</h2>
        <p>
          PaperRose is a small robot that reads the fine print so you do not have to do it alone. The rose is
          there because clarity should feel a little kinder than the text it is explaining.
        </p>
      </section>
    </ContentPage>
  );
}
