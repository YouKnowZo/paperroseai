import ContentPage from "./ContentPage.jsx";
import Icon from "../Icon.jsx";

const OK = [
  { icon: "link", title: "Your own agreements", body: "Scan the terms, privacy policy, or contract you are about to accept." },
  { icon: "file", title: "Third-party terms you are considering", body: "Read a service’s terms before you sign up, subscribe, or upload anything." },
  { icon: "message", title: "A document you have in hand", body: "Paste the text or upload the PDF/DOCX/TXT/MD/HTML of an agreement you are reviewing." },
  { icon: "shield", title: "Pasted or uploaded text", body: "Pasted text and uploaded documents are analyzed on the rules-only path; they are not sent to hosted AI." },
];

const NOT_OK = [
  { icon: "shield", title: "Anything non-public or private", body: "Do not submit internal documents, private services, local or private-network addresses, or anything you are not allowed to share." },
  { icon: "flag", title: "A page that is not a legal document", body: "The scanner refuses to grade pages that do not look like a terms or privacy document. It would rather say so than invent a grade." },
  { icon: "link", title: "Pages protected by access controls", body: "Do not use the tool to bypass logins, paywalls, or access restrictions. If a site blocks automated readers, the honest response is to use the extension, paste the text, or upload the PDF." },
  { icon: "file", title: "Mass scanning or abuse", body: "Public scans are rate-limited. Do not use the service to scan at volume, to probe sites, or to automate anything beyond a person reviewing a document." },
];

export default function AcceptableUse() {
  return (
    <ContentPage title="Acceptable use">
      <p className="content-lead">
        PaperRoseAI is a reading aid for the fine print. These are the kinds of use that are welcome, and the kinds
        that are not. The scanner will also refuse certain documents on its own, because a tool that guesses is worse
        than one that says it cannot read the page.
      </p>

      <section className="content-block">
        <h2>Welcome use</h2>
        <div className="content-cols">
          {OK.map((item) => (
            <div key={item.title} className="content-col">
              <div className="content-col-icon"><Icon name={item.icon} size={24} /></div>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="content-block">
        <h2>Not welcome</h2>
        <div className="content-cols">
          {NOT_OK.map((item) => (
            <div key={item.title} className="content-col">
              <div className="content-col-icon"><Icon name={item.icon} size={24} /></div>
              <h3>{item.title}</h3>
              <p>{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="content-block">
        <h2>The scanner also refuses on its own</h2>
        <ul>
          <li>Pages that are not legal documents are refused, not graded.</li>
          <li>JavaScript-only pages that return no readable text are reported honestly, after trying the legal pages the site itself links to.</li>
          <li>Pasted fragments shorter than a sentence or two are refused with the character count.</li>
          <li>When nothing readable can be fetched, the tool says so and points to the alternatives.</li>
        </ul>
      </section>

      <section className="content-block">
        <h2>About automated reading</h2>
        <p>
          PaperRoseAI is an automated reading aid, not a lawyer and not legal advice. Results are informational and
          may be wrong, incomplete, or outdated. Do not sign, spend, or litigate based only on what it says. Read the
          document yourself and consult a qualified attorney for anything that matters.
        </p>
        <p>
          The grade reflects what the document says, not the reputation of the company that wrote it. Two documents
          from the same company can receive different results.
        </p>
      </section>

      <section className="content-block">
        <h2>If you are the site owner</h2>
        <p>
          If you represent a site whose terms or privacy policy was scanned, this is a public reading tool, not a
          security audit or a crawler that stores your pages. If you have a concern about how a page was handled,
          contact PaperBagExpress at{" "}
          <a href="mailto:paperbagexpress@gmail.com" className="content-email">paperbagexpress@gmail.com</a>.
        </p>
      </section>
    </ContentPage>
  );
}
