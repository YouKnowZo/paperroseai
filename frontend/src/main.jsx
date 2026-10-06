import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Header from "./components/Header.jsx";
import NavBar from "./components/NavBar.jsx";
import InputCard from "./components/InputCard.jsx";
import Analyzing from "./components/Analyzing.jsx";
import Results from "./components/Results.jsx";
import FloatingBuddy from "./components/FloatingBuddy.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import Mascot from "./components/Mascot.jsx";
import Icon from "./components/Icon.jsx";
import BrowserExtension from "./components/BrowserExtension.jsx";
import { checkHealth, analyzeUrl, analyzeText, analyzeFile } from "./lib/api.js";
import SeoHead from "./components/SeoHead.jsx";
import NotFound from "./components/NotFound.jsx";
import About from "./components/content/About.jsx";
import HowItWorks from "./components/content/HowItWorks.jsx";
import Faq from "./components/content/Faq.jsx";
import Pricing from "./components/content/Pricing.jsx";
import AcceptableUse from "./components/content/AcceptableUse.jsx";
import "./styles.css";

// Deep-link support: /?scan=https://example.com/terms auto-scans on load
// (named "scan" because "?url=" collides with Vite's asset-import convention)
const params = new URLSearchParams(window.location.search);
const AUTO_SCAN_URL = params.get("scan");

const FEATURES = [
  { icon: "scales", title: "Instant grade", text: "A–F fairness grade, computed from real clauses — not vibes." },
  { icon: "shield", title: "Safety levels", text: "Privacy, legal, content, billing and account risk, each scored 0–100." },
  { icon: "flag", title: "Red flag radar", text: "Arbitration traps, data selling, auto-renewals — quoted straight from the doc." },
  { icon: "message", title: "Plain English", text: "Legal jargon translated into words a 12-year-old could read." },
];

// The app used to be a one-way trip: idle -> done, with the only way back a
// button at the very bottom of a long report. These helpers turn each screen
// into a real history entry so Back/Forward work — including the browser's own
// buttons, because we push actual history state rather than a private stack.
const HOME_VIEW = { kind: "idle" };

function homeUrl() {
  return window.location.pathname;
}

function legalUrl(page) {
  // Legal pages live next to the app so they are always reachable, even when
  // the analyzer is busy or offline. They are static text, not API calls.
  return `${window.location.origin}${window.location.pathname}#legal-${page}`;
}

function urlForRequest(req) {
  // A URL scan is reproducible, so it belongs in the address bar and can be
  // shared or reloaded. Pasted text and uploads are not, so those screens keep
  // a bare URL instead of pretending to be linkable.
  if (req?.type === "url") return `${window.location.pathname}?scan=${encodeURIComponent(req.value)}`;
  return homeUrl();
}

function useLocalTheme() {
  const [theme, setTheme] = useState(() => {
    const saved = localStorage.getItem("pr-theme");
    if (saved) return saved;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
    localStorage.setItem("pr-theme", theme);
  }, [theme]);
  return [theme, setTheme];
}

function HeroTeam() {
  const scribes = [
    { className: "hero-team-robot-left", size: 166, mood: "thinking" },
    { className: "hero-team-robot-center", size: 198, mood: "happy" },
    { className: "hero-team-robot-right", size: 158, mood: "thinking" },
  ];

  return (
    <div
      className="hero-team"
      role="img"
      aria-label="Three PaperRoseAI legal-scribe robots checking an agreement, with red roses in their hands"
    >
      <div className="hero-team-backdrop" aria-hidden="true" />
      <div className="hero-team-paper" aria-hidden="true">
        <span className="hero-team-paper-title">PAPERROSEAI REVIEW</span>
        <span className="hero-team-paper-line" />
        <span className="hero-team-paper-line short" />
        <span className="hero-team-paper-highlight" />
        <span className="hero-team-paper-line" />
        <span className="hero-team-paper-line medium" />
      </div>
      <span className="hero-team-spark hero-team-spark-one" aria-hidden="true">✦</span>
      <span className="hero-team-spark hero-team-spark-two" aria-hidden="true">✧</span>
      <div className="hero-team-tag hero-team-tag-left" aria-hidden="true">
        <span className="hero-team-tag-icon">✦</span> CLAUSE CHECK
      </div>
      <div className="hero-team-tag hero-team-tag-right" aria-hidden="true">
        <span className="hero-team-tag-icon check">✓</span> PLAIN ENGLISH
      </div>
      {scribes.map((scribe) => (
        <div className={`hero-team-robot ${scribe.className}`} key={scribe.className}>
          <Mascot size={scribe.size} mood={scribe.mood} className="hero-team-mascot" />
        </div>
      ))}
      <div className="hero-team-caption" aria-hidden="true">
        <span className="hero-team-caption-dot" /> THE PAPERROSEAI SCRIBE SQUAD
      </div>
    </div>
  );
}

const LEGAL_PAGES = {
  terms: {
    title: "Terms of Service",
    body: [
      "PaperRoseAI is provided by PaperBagExpress. By using the Service you agree to these Terms of Service, our Privacy Policy, and our Disclaimer.",
      "The Service is an automated reading aid. It reads text you provide and produces a fairness grade, plain-language summary, risk highlights, and category scores. It is designed to help you understand documents faster. It is not a lawyer, not legal advice, and not a substitute for reading the document yourself or consulting a qualified attorney.",
      "You must be at least 18, or using the Service with the permission of a parent or guardian, to use it. You are responsible for what you do with any document you review. Do not rely on the Service as the only basis for signing, rejecting, paying, or litigating anything.",
      "The Service is provided as is and as available. PaperBagExpress does not guarantee that any analysis will be accurate, complete, current, or useful for any particular purpose, and does not guarantee any specific uptime or usage quota. Optional AI features are available only after you choose to enable them for a specific scan, and AI results are not guaranteed and may be wrong or misleading.",
      "To the maximum extent permitted by law, PaperBagExpress is not responsible for indirect, incidental, special, consequential, or punitive damages arising out of or related to your use of the Service, and total liability will not exceed the amount you paid for the Service in the 12 months before the claim, or USD 0 if you paid nothing. Nothing in these terms excludes or limits liability for fraud, death, personal injury caused by negligence, or any other liability that cannot be excluded or limited by applicable law.",
      "These terms are governed by the laws of the State of California. Any dispute arising out of or relating to these terms or the Service will be resolved exclusively by binding individual arbitration, not by a court or class action, unless a particular dispute is not eligible for arbitration under applicable law.",
      "We may update these terms at any time. Changes take effect when we publish them. Continued use after a change means you accept the updated terms. We may suspend or stop the Service at any time, with or without notice.",
      "If you have questions about these terms, contact PaperBagExpress at paperbagexpress@gmail.com.",
      "This is a draft for review by a qualified attorney. It is not legal advice and may not cover every obligation that applies to your business, jurisdiction, or data practices.",
    ],
  },
  privacy: {
    title: "Privacy Policy",
    body: [
      "PaperRoseAI is provided by PaperBagExpress. This policy explains what happens to information you give the Service and what we say we do with it.",
      "When you use the Service, we may receive the text you paste or upload when you choose to analyze it, a public webpage we fetch for you when you ask us to scan a URL, and basic information about the request itself, such as the kind of analysis you requested. We do not ask for an account, password, or payment information to use the basic public Service.",
      "We use the information only to produce the analysis you requested. We do not sell your information. We do not use your content to train models or improve third-party services on your behalf. Any optional AI feature you choose to enable for a website scan is processed by the provider you choose to use for that scan, under that provider's own terms.",
      "Text you paste or upload is processed to generate your result and is deleted from temporary processing as soon as the Service no longer needs it to return that result. Fetched webpages are retrieved at your request and are not stored as part of your personal profile. Because the public Service runs on hosted serverless infrastructure, processing is temporary and we do not maintain a personal file of your analyses. We do not guarantee that every copy of any data is erased from every system the Service depends on, including logs or provider systems outside our direct control.",
      "We do not sell your personal data. If anything in this policy changes in a way that could affect how your information is handled, we will update this policy and note the change in the Last updated date.",
      "The Service may depend on third-party providers for hosting, optional AI processing, human-verification checks, and similar functions. Those providers have their own privacy practices. We are not responsible for their handling of information outside our control.",
      "You can avoid submitting text by simply not using the Service. If you believe information about you is being handled incorrectly, contact us and we will review the request.",
      "The Service is intended for general use by adults. If you are under the age of majority in your jurisdiction, you should use the Service only with a parent or guardian.",
      "We take reasonable steps to protect the Service, but no online service is perfectly secure. We do not guarantee that unauthorized access, loss, or misuse of information will never happen.",
      "If you have questions about this policy, contact PaperBagExpress at paperbagexpress@gmail.com.",
      "This is a draft for review by a qualified attorney. It is not legal advice and may not cover every privacy obligation that applies to your business, jurisdiction, or data practices.",
    ],
  },
  disclaimer: {
    title: "Disclaimer",
    body: [
      "PaperRoseAI is an automated reading aid, not a lawyer and not legal advice.",
      "The Service analyzes text you provide and may produce grades, summaries, and risk flags that are informational only. Results can be wrong, incomplete, outdated, or missing important context. Do not sign, spend, or litigate based only on what the Service says. Read the document yourself and consult a qualified attorney for anything that matters.",
      "PaperBagExpress provides the Service as is and as available, without any warranty of accuracy, completeness, reliability, or fitness for a particular purpose, to the maximum extent permitted by law. We do not guarantee any specific uptime, quota, or availability. We are not responsible for damages arising from your use of, or reliance on, the Service, including decisions you make based on its output.",
      "Optional AI features, where available, are offered only after you choose to enable them for a specific scan. AI results are not guaranteed and may be wrong or misleading. Any third-party AI provider used for an optional feature has its own terms and privacy practices.",
      "If you use the Service, you accept these limits and the full Terms of Service. If you do not accept them, do not use the Service.",
      "This notice is a draft for review by a qualified attorney and is not legal advice.",
    ],
  },
};

function App() {
  const [theme, setTheme] = useLocalTheme();
  const [health, setHealth] = useState(null);
  const [phase, setPhase] = useState("idle"); // idle | analyzing | done | error
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [toast, setToast] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Unknown/offline health must never expose local-only controls on the public app.
  const publicMode = health?.public_mode !== false;
  const inputCardRef = useRef(null);
  const autoScanStartedRef = useRef(false);

  const legalPage = LEGAL_PAGES[window.location.hash.slice("#legal-".length)] ?? null;

  const CONTENT_PAGES = {
    "/about": About,
    "/how-it-works": HowItWorks,
    "/faq": Faq,
    "/pricing": Pricing,
    "/acceptable-use": AcceptableUse,
  };
  const contentPage = CONTENT_PAGES[window.location.pathname];
  const ContentPage = contentPage;

  // Navigation state. The stack mirrors the history entries we created, and
  // posRef is where we currently are in it; results live in a map so stepping
  // back to a report is instant instead of re-fetching it.
  const [nav, setNav] = useState({ canBack: false, canForward: false, reportOpen: false });
  const stackRef = useRef([HOME_VIEW]);
  const posRef = useRef(0);
  const resultsRef = useRef(new Map());
  const runIdRef = useRef(0);

  const currentView = () => stackRef.current[posRef.current];

  function syncNav() {
    setNav({
      canBack: posRef.current > 0,
      canForward: posRef.current < stackRef.current.length - 1,
      reportOpen: currentView()?.kind === "results",
    });
  }

  function applyView(view) {
    runIdRef.current += 1; // anything in flight is stale the moment we navigate
    const cached = view?.kind === "results" ? resultsRef.current.get(view.id) : null;
    if (cached) {
      setResult(cached);
      setError("");
      setPhase("done");
    } else {
      setResult(null);
      setError("");
      setPhase("idle");
    }
    syncNav();
  }

  function pushView(view, url) {
    stackRef.current = stackRef.current.slice(0, posRef.current + 1);
    stackRef.current.push(view);
    posRef.current = stackRef.current.length - 1;
    try {
      window.history.pushState({ prPos: posRef.current }, "", url || homeUrl());
    } catch {
      /* about:blank or a sandboxed context: navigation still works in-app */
    }
    syncNav();
  }

  function focusInput() {
    const el = inputCardRef.current?.querySelector("input, textarea");
    el?.focus({ preventScroll: true });
  }

  function goHome() {
    if (currentView()?.kind === "idle") {
      focusInput();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    pushView(HOME_VIEW, homeUrl());
    applyView(HOME_VIEW);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(focusInput, 350);
  }

  function exitReport() {
    // Deliberately different from "New scan": this rewrites the current entry as
    // home, so the report you just closed cannot be reached with Forward either.
    runIdRef.current += 1;
    stackRef.current[posRef.current] = HOME_VIEW;
    try {
      window.history.replaceState({ prPos: posRef.current }, "", homeUrl());
    } catch {
      /* see pushView */
    }
    applyView(HOME_VIEW);
    window.scrollTo({ top: 0, behavior: "smooth" });
    setTimeout(focusInput, 350);
  }

  function jumpTo(id) {
    if (id === "features" || id === "browser-extension") goHome();
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
  }

  // Keep a lid on cached reports: drop the oldest ones no longer reachable.
  function trimResults() {
    if (resultsRef.current.size <= 12) return;
    const reachable = new Set(
      stackRef.current.filter((v) => v?.kind === "results").map((v) => v.id),
    );
    for (const key of [...resultsRef.current.keys()]) {
      if (resultsRef.current.size <= 12) break;
      if (!reachable.has(key)) resultsRef.current.delete(key);
    }
  }

  const refreshHealth = () =>
    checkHealth().then(setHealth).catch(() => setHealth({ status: "down", public_mode: true }));

  useEffect(() => {
    refreshHealth();
  }, []);

  // The settings modal tells us when a key was saved/removed so the badge flips.
  useEffect(() => {
    const onChanged = () => refreshHealth();
    window.addEventListener("pr:settings-changed", onChanged);
    return () => window.removeEventListener("pr:settings-changed", onChanged);
  }, []);

  // Listen for the buddy asking the main app to run a full analysis
  useEffect(() => {
    function onAnalyze(e) {
      if (publicMode) {
        goHome();
        window.dispatchEvent(new CustomEvent("pr:prefill", { detail: e.detail }));
      } else handleAnalyze(e.detail);
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    window.addEventListener("pr:analyze", onAnalyze);
    return () => window.removeEventListener("pr:analyze", onAnalyze);
  }, [publicMode]);

  // A URL report can be shared/bookmarked. Start it after the first render,
  // but guard it because React StrictMode intentionally re-runs effects in dev.
  useEffect(() => {
    if (!AUTO_SCAN_URL || !health || autoScanStartedRef.current) return;
    autoScanStartedRef.current = true;
    if (health.public_mode !== false) {
      setToast("Verify the human check and press Analyze to scan this website.");
    }
    handleAnalyze({ type: "url", value: AUTO_SCAN_URL });
  }, [health]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(t);
  }, [toast]);

  // Stamp the entry we loaded with, then follow the browser's Back/Forward.
  useEffect(() => {
    try {
      window.history.replaceState({ prPos: 0 }, "", window.location.href);
    } catch {
      /* see pushView */
    }
    function onPop(e) {
      const p = e.state?.prPos;
      posRef.current =
        typeof p === "number" && p >= 0 && p < stackRef.current.length ? p : 0;
      applyView(stackRef.current[posRef.current]);
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Esc closes an open report, unless a modal is asking for it first.
  useEffect(() => {
    function onKey(e) {
      if (e.key !== "Escape" || settingsOpen) return;
      if (currentView()?.kind === "results") exitReport();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [settingsOpen]);

  async function handleAnalyze(req) {
    const runId = ++runIdRef.current;
    setPhase("analyzing");
    setError("");
    setResult(null);
    setProgress(8);
    const timer = setInterval(() => {
      setProgress((p) => (p < 88 ? p + Math.max(1, (88 - p) / 9) : p));
    }, 350);
    try {
      let data;
      if (req.type === "url") data = await analyzeUrl(req.value, { allowFreeAI: req.allowFreeAI === true, turnstileToken: req.turnstileToken });
      else if (req.type === "text") data = await analyzeText(req.value, { turnstileToken: req.turnstileToken });
      else data = await analyzeFile(req.value, { turnstileToken: req.turnstileToken });
      // The user may have navigated away while this was running; if so, the
      // result is no longer what they are looking at.
      if (runId !== runIdRef.current) return;

      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      resultsRef.current.set(id, data);
      trimResults();
      pushView({ kind: "results", id }, urlForRequest(req));
      setProgress(100);
      setResult(data);
      setPhase("done");
      setToast(`Done — grade ${data.grade} (${data.safety_level})`);
    } catch (e) {
      if (runId !== runIdRef.current) return;
      setError(e.message || "Something went wrong.");
      setPhase("error");
    } finally {
      clearInterval(timer);
    }
  }

  const busy = phase === "analyzing";

  return (
    <>
      <div className="orbs" aria-hidden="true">
        <div className="orb orb-1" />
        <div className="orb orb-2" />
        <div className="orb orb-3" />
      </div>

      {legalPage && (
        <div className="legal-page">
          <header className="legal-page-header">
            <div className="legal-page-brand"><Mascot /><div><span className="grad-text">PaperRose</span><span>AI</span><div className="brand-sub">by Paperbagexpress</div></div></div>
            <button className="btn btn-ghost btn-icon" onClick={() => window.history.replaceState(null, "", homeUrl())} aria-label="Close legal page"><Icon name="close" size={18} /></button>
          </header>
          <main className="legal-page-body">
            <div className="legal-page-card">
              <h1>{legalPage.title}</h1>
              <p className="legal-page-updated">Last updated 2026-10-02</p>
              {legalPage.body.map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>
          </main>
          <footer className="legal-page-footer">
            <p>PaperRoseAI is an automated reading aid. It is not legal advice.</p>
          </footer>
        </div>
      )}

      {contentPage ? (
        <>
          <SeoHead page={window.location.pathname} />
          <ContentPage />
        </>
      ) : legalPage ? (
        <></>
      ) : window.location.pathname !== "/" ? (
        <>
          <SeoHead page={window.location.pathname} />
          <NotFound />
        </>
      ) : (
        <>
          <Header
            theme={theme}
            onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
            aiReady={health?.ai_available}
            publicMode={publicMode}
            onOpenSettings={() => setSettingsOpen(true)}
          >
            <NavBar
              reportOpen={nav.reportOpen}
              onHome={() => jumpTo("input-card")}
              onNewScan={goHome}
              onJump={jumpTo}
            />
          </Header>

          {settingsOpen && (
            <SettingsModal publicMode={publicMode} onClose={() => setSettingsOpen(false)} onNote={setToast} />
          )}

          <FloatingBuddy result={result} busy={busy} onNewScan={goHome} />

          {phase !== "done" && (
            <section className="hero">
              <div className="hero-copy">
                <div className="hero-eyebrow">
                  <span className="dot" />
                  {health?.ai_available ? "AI engine online" : health?.status === "down" ? "Backend offline" : !health ? "Connecting securely…" : publicMode && !health?.turnstile_ready ? "Scan protection needs setup" : "Rules engine online"}
                </div>
                <div className="hero-kicker">YOUR FINE-PRINT ADVANTAGE</div>
                <h1>
                  Small print.<br /><span className="grad-text">Big clarity.</span>
                </h1>
                <p>
                  Know what you’re agreeing to. Turn terms, privacy policies, and agreements into a fairness grade, clear takeaways, and the clauses worth a second look.
                </p>
                <div className="hero-trust"><span><Icon name="shield" size={16} /> Evidence-backed flags</span><span><Icon name="volume" size={16} /> A voice that fits you</span></div>
              </div>
              <HeroTeam />
            </section>
          )}

          {phase !== "done" && (
            <div ref={inputCardRef} id="input-card">
              <InputCard
                busy={busy}
                onAnalyze={handleAnalyze}
                publicMode={publicMode}
                freeAIAvailable={health?.free_ai_available === true}
                turnstileSiteKey={health?.turnstile_site_key || ""}
                turnstileReady={health?.status === "ok" && (!publicMode || health?.turnstile_ready === true)}
                initialUrl={AUTO_SCAN_URL || ""}
                backendReady={health?.status === "ok"}
              />
            </div>
          )}

          {phase === "error" && (
            <div className="error-banner">
              <span>⚠️</span>
              <div>
                <strong>Couldn't analyze that.</strong>
                <div>{error}</div>
              </div>
            </div>
          )}

          {phase === "done" && result && <Results result={result} publicMode={publicMode} />}
          {phase === "idle" && <BrowserExtension onTryIt={() => jumpTo("input-card")} />}

          {phase === "done" && (
            <div className="container" style={{ display: "flex", justifyContent: "center", paddingBottom: 70 }}>
              <button className="btn btn-ghost" onClick={goHome}>
                ← Analyze another
              </button>
            </div>
          )}

          {phase === "idle" && (
            <section className="features" id="features">
              {FEATURES.map((f) => (
                <div className="feature" key={f.title}>
                  <div className="icon"><Icon name={f.icon} size={24} /></div>
                  <h4>{f.title}</h4>
                  <p>{f.text}</p>
                </div>
              ))}
            </section>
          )}

          {phase === "idle" && (
            <section className="legal" id="legal-terms">
              <div className="legal-card">
                <div className="legal-card-head">
                  <h2>By using PaperRoseAI, you agree to our terms</h2>
                  <p className="legal-card-sub">This is an automated reading aid. It is not a lawyer and not legal advice. Read the document yourself before you sign anything.</p>
                </div>
                <div className="legal-links">
                  <a href={legalUrl("terms")} className="btn btn-ghost">Read the Terms of Service</a>
                  <a href={legalUrl("privacy")} className="btn btn-ghost">Read the Privacy Policy</a>
                  <a href={legalUrl("disclaimer")} className="btn btn-ghost">Read the Disclaimer</a>
                </div>
              </div>
            </section>
          )}

          <footer className="footer">
            <div className="footer-legal">
              <div className="footer-brand"><strong>PaperRoseAI</strong><span>by Paperbagexpress</span></div>
              <p className="footer-tagline">Automated reading aid, not legal advice. Results can be wrong or miss context — skim the document and consult a qualified attorney for anything that matters.</p>
              <div className="footer-links">
                <a href={legalUrl("terms")} className="footer-link">Terms of Service</a>
                <a href={legalUrl("privacy")} className="footer-link">Privacy Policy</a>
                <a href={legalUrl("disclaimer")} className="footer-link">Disclaimer</a>
              </div>
              {health?.public_mode && <p className="footer-note">Website scans are fetched by the server. Optional AI is used only after you consent on each scan; pasted and uploaded text are rules-only.</p>}
            </div>
          </footer>

          {busy && (
            <div className="busy-overlay">
              <Analyzing level={progress} />
            </div>
          )}

          {toast && <div className="toast" role="status">{toast}</div>}
        </>
      )}
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
