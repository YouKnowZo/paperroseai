import Icon from "./Icon.jsx";
import { getAffiliateOffer } from "../lib/affiliate.js";

const OFFER = getAffiliateOffer(import.meta.env.VITE_AFFILIATE_PARTNER_NAME, import.meta.env.VITE_AFFILIATE_URL);

export default function AffiliateSupport({ report = false }) {
  if (!OFFER) return null;
  return (
    <aside className={`affiliate-card ${report ? "affiliate-report" : ""}`} aria-label="Sponsored partner recommendation">
      <div className="affiliate-icon"><Icon name="file" size={21} /></div>
      <div className="affiliate-copy">
        <span className="affiliate-label">Partner offer</span>
        <h3>Need a hand putting your agreement together?</h3>
        <p>Explore document and signing tools from {OFFER.name}.</p>
        <small>We may earn a commission if you choose to sign up, at no extra cost to you.</small>
      </div>
      <a className="btn btn-ghost affiliate-link" href={OFFER.url} target="_blank" rel="sponsored nofollow noopener noreferrer">
        Explore {OFFER.name} <Icon name="arrow" size={16} />
      </a>
    </aside>
  );
}
