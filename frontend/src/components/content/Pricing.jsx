import ContentPage from "./ContentPage.jsx";
import Icon from "../Icon.jsx";
import AffiliateSupport from "../AffiliateSupport.jsx";

export default function Pricing() {
  return (
    <ContentPage title="Pricing">
      <p className="content-lead">
        PaperRoseAI is free to use. There is no subscription, no pay-per-scan, and no account required to use the
        basic public service.
      </p>

      <section className="content-block">
        <div className="pricing-free">
          <div className="pricing-free-badge">
            <Icon name="scales" size={34} />
            <div>                <h3>Free</h3>
              <p className="pricing-free-price">$0</p>
            </div>
          </div>
          <ul className="pricing-features">
            <li>Fairness grade (A–F) for each document</li>
            <li>Safety scores for privacy, legal, content, billing, and account risk</li>
            <li>Red flags with the exact wording that triggered them</li>
            <li>Plain-English summary and a voice that reads the report aloud</li>
            <li>Website scan, paste text, or upload a PDF/DOCX/TXT/MD/HTML</li>
            <li>No account required</li>
            <li>No API keys required for public users</li>
          </ul>
          <a href="/" className="btn btn-primary">Start a free review</a>
        </div>
      </section>

      <section className="content-block">
        <h2>Optional partner offer</h2>
        <p>
          Beneath some completed reports you may see a clearly marked partner offer for document or signing tools.
          It is always labeled as a partner offer, it discloses that the service may earn a commission at no extra
          cost to you, and it is hidden entirely unless a real, approved partner is configured.
        </p>
        <p className="content-note">
          Missing, invalid, insecure, or placeholder links stay hidden. The service never fakes a partner or calls
          ordinary clicks income.
        </p>
        <AffiliateSupport />
      </section>

      <section className="content-block">
        <h2>What there is not, yet</h2>
        <ul>
          <li>No subscription tier and no paid scan credits</li>
          <li>No account system and no billing</li>
          <li>No public API key program for third parties</li>
        </ul>
        <p className="content-note">
          If the service adds a paid feature later, it will be clearly labeled, and the free tool will stay free for
          the core reading aid.
        </p>
      </section>

      <section className="content-block">
        <h2>If you are building your own agreement</h2>
        <p>
          PaperRoseAI reads agreements written by others. If you are putting your own terms together, an approved
          document or e-signature partner may help. When one is configured, the partner offer beneath reports points
          there with a clear disclosure.
        </p>
      </section>
    </ContentPage>
  );
}
