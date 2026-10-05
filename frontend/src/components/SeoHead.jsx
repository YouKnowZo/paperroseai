import { useEffect, useRef } from "react";

const BASE_URL = (import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/$/, "");
const SITE_NAME = "PaperRoseAI";
const SITE_DESC =
  "Understand the fine print with fairness grades, evidence-backed red flags, plain-English takeaways, and a voice that fits you.";

const PAGES = {
  "/": {
    title: "PaperRoseAI by Paperbagexpress — Small print. Big clarity.",
    desc: SITE_DESC,
    ogTitle: "PaperRoseAI — Small print. Big clarity.",
    ogType: "website",
  },
  "/about": {
    title: "About PaperRoseAI",
    desc: "Who built PaperRoseAI, why, and what it can and cannot do. An automated reading aid, not a lawyer.",
    ogTitle: "About PaperRoseAI",
    ogType: "website",
  },
  "/how-it-works": {
    title: "How PaperRoseAI works",
    desc: "How the rules engine and optional AI turn a Terms of Service or privacy policy into a fairness grade, red flags, and plain English.",
    ogTitle: "How PaperRoseAI works",
    ogType: "website",
  },
  "/faq": {
    title: "PaperRoseAI FAQ",
    desc: "Common questions about grades, accuracy, what PaperRoseAI can and cannot do, and how it handles your text.",
    ogTitle: "PaperRoseAI FAQ",
    ogType: "website",
  },
  "/pricing": {
    title: "PaperRoseAI pricing",
    desc: "PaperRoseAI is free to use. There is no subscription or pay-per-scan. An optional, clearly disclosed partner offer may appear beneath some reports.",
    ogTitle: "PaperRoseAI pricing — free to use",
    ogType: "website",
  },
  "/acceptable-use": {
    title: "PaperRoseAI acceptable use",
    desc: "What kinds of scans are welcome, what the scanner will refuse, and the limits of automated legal-document reading.",
    ogTitle: "PaperRoseAI acceptable use",
    ogType: "website",
  },
};

export default function SeoHead({ page = "/" }) {
  const prev = useRef(null);
  useEffect(() => {
    const p = PAGES[page] || PAGES["/"];
    if (prev.current && prev.current.key === page) return;
    prev.current = { key: page };

    const title = p.title;
    const desc = p.desc;
    const ogTitle = p.ogTitle;
    const ogType = p.ogType;

    document.title = title;
    document.querySelector('meta[name="description"]').setAttribute("content", desc);
    document.querySelector('meta[name="theme-color"]').setAttribute("content", "#b72750");

    let og = document.getElementById("pr-og");
    if (!og) {
      og = document.createElement("meta");
      og.id = "pr-og";
      og.name = "og:title";
      document.head.appendChild(og);
    }
    og.setAttribute("property", "og:title");
    og.setAttribute("content", ogTitle);

    let ogD = document.getElementById("pr-og-desc");
    if (!ogD) {
      ogD = document.createElement("meta");
      ogD.id = "pr-og-desc";
      ogD.setAttribute("property", "og:description");
      document.head.appendChild(ogD);
    }
    ogD.setAttribute("content", desc);

    let ogTypeEl = document.getElementById("pr-og-type");
    if (!ogTypeEl) {
      ogTypeEl = document.createElement("meta");
      ogTypeEl.id = "pr-og-type";
      ogTypeEl.setAttribute("property", "og:type");
      document.head.appendChild(ogTypeEl);
    }
    ogTypeEl.setAttribute("content", ogType);

    let ogUrl = document.getElementById("pr-og-url");
    if (!ogUrl) {
      ogUrl = document.createElement("meta");
      ogUrl.id = "pr-og-url";
      ogUrl.setAttribute("property", "og:url");
      document.head.appendChild(ogUrl);
    }
    ogUrl.setAttribute("content", BASE_URL + page);

    let tw = document.getElementById("pr-tw-title");
    if (!tw) {
      tw = document.createElement("meta");
      tw.id = "pr-tw-title";
      tw.name = "twitter:title";
      document.head.appendChild(tw);
    }
    tw.setAttribute("content", ogTitle);

    let twD = document.getElementById("pr-tw-desc");
    if (!twD) {
      twD = document.createElement("meta");
      twD.id = "pr-tw-desc";
      twD.name = "twitter:description";
      document.head.appendChild(twD);
    }
    twD.setAttribute("content", desc);

    let twCard = document.getElementById("pr-tw-card");
    if (!twCard) {
      twCard = document.createElement("meta");
      twCard.id = "pr-tw-card";
      twCard.name = "twitter:card";
      document.head.appendChild(twCard);
    }
    twCard.setAttribute("content", "summary");

    let canonical = document.getElementById("pr-canonical");
    if (!canonical) {
      canonical = document.createElement("link");
      canonical.id = "pr-canonical";
      canonical.rel = "canonical";
      document.head.appendChild(canonical);
    }
    canonical.setAttribute("href", BASE_URL + page);
  }, [page]);
  return null;
}
