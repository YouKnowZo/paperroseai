import { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Header from "./components/Header.jsx";
import NavBar from "./components/NavBar.jsx";
import InputCard from "./components/InputCard.jsx";
import Analyzing from "./components/Analyzing.jsx";
import Results from "./components/Results.jsx";
import FloatingBuddy from "./components/FloatingBuddy.jsx";
import BuddyInstaller from "./components/BuddyInstaller.jsx";
import SettingsModal from "./components/SettingsModal.jsx";
import Mascot from "./components/Mascot.jsx";
import Icon from "./components/Icon.jsx";
import { speakOrQueue } from "./lib/voice.js";
import { playEarcon } from "./lib/chimes.js";
import { checkHealth, analyzeUrl, analyzeText, analyzeFile } from "./lib/api.js";
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
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
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
      return;
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
      // Let the buddy announce full-report verdicts out loud too
      playEarcon(data.safety_level);
      speakOrQueue(`Full report ready. I give this ${data.grade}.`);
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

      <Header
        theme={theme}
        onToggleTheme={() => setTheme(theme === "dark" ? "light" : "dark")}
        aiReady={health?.ai_available}
        publicMode={publicMode}
        onOpenSettings={() => setSettingsOpen(true)}
      >
        <NavBar
          canGoBack={nav.canBack}
          canGoForward={nav.canForward}
          reportOpen={nav.reportOpen}
          onBack={() => window.history.back()}
          onForward={() => window.history.forward()}
          onHome={goHome}
          onExit={exitReport}
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
              {health && !health.public_mode && !health.ai_available && health.status !== "down" && (
                <button className="eyebrow-link" onClick={() => setSettingsOpen(true)}>
                  Add an API key →
                </button>
              )}
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
        <div ref={inputCardRef}>
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

      {phase === "done" && (
        <div className="container" style={{ display: "flex", justifyContent: "center", paddingBottom: 70 }}>
          <button className="btn btn-ghost" onClick={goHome}>
            ← Analyze another
          </button>
        </div>
      )}

      {phase === "idle" && (
        <section className="features">
          {FEATURES.map((f) => (
            <div className="feature" key={f.title}>
              <div className="icon"><Icon name={f.icon} size={24} /></div>
              <h4>{f.title}</h4>
              <p>{f.text}</p>
            </div>
          ))}
        </section>
      )}

      {phase === "idle" && health && !health.public_mode && <BuddyInstaller />}

      <footer className="footer">
        <div>
          <div className="footer-brand"><strong>PaperRoseAI</strong><span>by Paperbagexpress</span></div>
          Analysis is informational, may miss nuance, and is not legal advice.
          {health?.public_mode && <span> Website scans are fetched by the server. Optional AI is used only after per-scan consent; pasted and uploaded text are rules-only.</span>}
        </div>
      </footer>

      {busy && (
        <div className="busy-overlay">
          <Analyzing level={progress} />
        </div>
      )}

      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
