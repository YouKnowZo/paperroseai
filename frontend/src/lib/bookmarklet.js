/**
 * PaperRose Buddy bookmarklet generator.
 *
 * Produces a self-contained `javascript:` URL that, when clicked from any
 * site's bookmarks bar, injects a floating robot into THAT page, scrapes the
 * visible text in-browser, and asks the local PaperRoseAI backend for a grade
 * — no navigation away from the site.
 *
 * Written without backticks/template literals so the whole source can be
 * wrapped in one String.raw`...` block and minified safely.
 */

const BOOKMARKLET_SOURCE = String.raw
`(function(){
  if (window.__paperroseBuddy) { window.__paperroseBuddy.toggle(); return; }
  var API = "http://127.0.0.1:5000";
  var LOCAL_MUTED = (function(){ try { return localStorage.getItem("pr-buddy-muted") === "1"; } catch(e){ return false; } })();
  var MUTED = LOCAL_MUTED; /* refined below from the backend so all sites agree */
  (function(){
    try {
      fetch(API + "/api/buddy/config").then(function(r){ return r.json(); }).then(function(c){
        if (c && typeof c.muted === "boolean") {
          MUTED = c.muted;
          LOCAL_MUTED = c.muted;
          try { if (c.muted) localStorage.setItem("pr-buddy-muted", "1"); else localStorage.removeItem("pr-buddy-muted"); } catch(e){}
          syncMuteBtn();
        }
      }).catch(function(){});
    } catch(e){}
  })();
  var host = document.createElement("div");
  host.id = "pr-buddy-host";
  host.setAttribute("style", "all:initial; position:fixed; z-index:2147483647; right:24px; bottom:24px; font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;");
  document.body.appendChild(host);
  var sh = host.attachShadow({mode:"open"});
  var st = document.createElement("style");
  st.textContent = CSS_TEXT_PLACEHOLDER;
  sh.appendChild(st);
  var box = document.createElement("div");
  box.className = "bot";
  sh.appendChild(box);
  var panel = document.createElement("div");
  panel.className = "panel hidden";
  sh.appendChild(panel);

  function render(html){ panel.innerHTML = html; }
  function open(){ panel.classList.remove("hidden"); }
  function close(){ panel.classList.add("hidden"); }
  function toggle(){ panel.classList.contains("hidden") ? open() : close(); }
  box.addEventListener("click", toggle);

  function esc(s){ var d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML; }

  /* ---------- voice (Web Speech API) ---------- */
  var UNLOCKED = false, PENDING_SPEECH = null;
  function unlockVoice(){
    if (UNLOCKED) return;
    UNLOCKED = true;
    if (PENDING_SPEECH) { var line = PENDING_SPEECH; PENDING_SPEECH = null; say(line.text, line.opts); }
  }
  document.addEventListener("pointerdown", unlockVoice, true);
  document.addEventListener("keydown", unlockVoice, true);
  /* Clicking the bookmark itself is a user gesture — don't make the user click
     again before the first verdict can speak. */
  try { if (navigator.userActivation && (navigator.userActivation.isActive || navigator.userActivation.hasBeenActive)) unlockVoice(); } catch(e){}
  function cleanSpeech(line){
    return String(line).replace(/[\uD800-\uDFFF\u2600-\u27BF\uFE0F]/g, "").replace(/\bdon't\b/g, "do not").replace(/\bcan't\b/g, "cannot").replace(/\bwon't\b/g, "will not").replace(/\s+/g, " ").trim();
  }
  function say(text, opts){
    if (MUTED || !UNLOCKED || !text || !("speechSynthesis" in window)) return false;
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(cleanSpeech(text));
      opts = opts || {};
      u.rate = opts.rate || 1.02;
      u.pitch = opts.pitch || 1.25;
      u.volume = 0.9;
      var vs = window.speechSynthesis.getVoices().filter(function(v){ return v.lang && v.lang.indexOf("en") === 0; });
      if (vs.length) u.voice = vs.filter(function(v){ return /natural|neural|premium|enhanced/i.test(v.name); })[0] || vs[0];
      window.speechSynthesis.speak(u);
      return true;
    } catch(e){ return false; }
  }
  function sayOrQueue(text, opts){
    if (MUTED || !text) return false;
    if (!UNLOCKED) { PENDING_SPEECH = { text: text, opts: opts }; return false; }
    return say(text, opts);
  }

  /* ---------- earcons (Web Audio, no files) ---------- */
  var MOTIFS = {
    safe: [[523.25,0,0.16,"triangle",0.14],[659.25,0.11,0.16,"triangle",0.14],[783.99,0.22,0.26,"triangle",0.15]],
    moderate: [[392,0,0.11,"sine",0.15],[392,0.17,0.13,"sine",0.12]],
    caution: [[329.63,0,0.15,"triangle",0.14],[261.63,0.16,0.24,"triangle",0.14]],
    dangerous: [[110,0,0.11,"sawtooth",0.1],[130.81,0.14,0.11,"sawtooth",0.1],[110,0.28,0.11,"sawtooth",0.1],[130.81,0.42,0.2,"sawtooth",0.11]],
    error: [[196,0,0.18,"sine",0.13,98]]
  };
  var AC = null;
  function playChime(level){
    if (MUTED) return;
    try {
      var Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return;
      if (!AC) AC = new Ctor();
      if (AC.state === "suspended") AC.resume();
      var motif = MOTIFS[level] || MOTIFS.moderate;
      for (var i = 0; i < motif.length; i++) {
        var n = motif[i];
        var t0 = AC.currentTime + n[1];
        var osc = AC.createOscillator(), g = AC.createGain();
        osc.type = n[3];
        osc.frequency.setValueAtTime(n[0], t0);
        if (n[5]) osc.frequency.exponentialRampToValueAtTime(n[5], t0 + n[2]);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.linearRampToValueAtTime(n[4], t0 + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + n[2]);
        osc.connect(g); g.connect(AC.destination);
        osc.start(t0); osc.stop(t0 + n[2] + 0.05);
      }
    } catch(e){}
  }

  /* ---------- mute toggle (persisted via the backend, shared across sites) ---------- */
  var MUTE_CSS = '<button class="bmute" type="button">' + (MUTED ? "\uD83D\uDD07" : "\uD83D\uDD0A") + "</button>";
  function setMuted(m, announce){
    MUTED = m; LOCAL_MUTED = m;
    try { if (m) localStorage.setItem("pr-buddy-muted", "1"); else localStorage.removeItem("pr-buddy-muted"); } catch(e){}
    try {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    } catch(e){}
    fetch(API + "/api/buddy/config", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ muted: m }) }).catch(function(){});
    var btn = panel.querySelector(".bmute");
    if (btn) { btn.textContent = m ? "\uD83D\uDD07" : "\uD83D\uDD0A"; btn.title = m ? "Buddy is muted \u2014 click to hear me" : "Buddy voice on \u2014 click to mute"; }
    if (!m && announce) say("Voice on!", { rate: 1.05 });
  }
  function wireMute(){
    var btn = panel.querySelector(".bmute");
    if (!btn) return;
    btn.textContent = MUTED ? "\uD83D\uDD07" : "\uD83D\uDD0A";
    btn.title = MUTED ? "Buddy is muted \u2014 click to hear me" : "Buddy voice on \u2014 click to mute";
    btn.addEventListener("click", function(ev){ ev.stopPropagation(); setMuted(!MUTED, !MUTED); });
  }

  function scrape(){
    var clone = document.body.cloneNode(true);
    var hostInClone = clone.querySelector("#pr-buddy-host");
    if (hostInClone) hostInClone.remove();
    var kill = clone.querySelectorAll("script,style,noscript,nav,header,footer,aside,form,svg,iframe,template");
    for (var i=0;i<kill.length;i++) kill[i].remove();
    var t = (clone.innerText || clone.textContent || "").replace(/\s+/g," ").trim();
    return t;
  }

  function gradeColor(s){ return s>=75 ? "#10b981" : s>=55 ? "#f59e0b" : s>=35 ? "#f97316" : "#ef4444"; }
  var LEVELS = { safe:["\uD83D\uDFE2","Safe"], moderate:["\uD83D\uDFE1","Moderate"], caution:["\uD83D\uDFE0","Caution"], dangerous:["\uD83D\uDD34","High Risk"] };

  function verdictLine(r){
    var flags = r.flags || [];
    var highs = flags.filter(function(f){ return f.severity === "high"; });
    var worst = highs.length ? highs[0].title : (flags.length ? flags[0].title : null);
    var word = { A: "an A", B: "a B", C: "a C", D: "a D", F: "an F" }[String(r.grade || "").charAt(0)] || r.grade;
    var line = "I give this " + word;
    if (String(r.grade || "").charAt(0) === "A" && String(r.grade).charAt(1) !== "+") line = "I give this a straight " + r.grade;
    line += worst ? ". Biggest thing to know: " + worst + "." : ". Nothing alarming jumped out.";
    if (highs.length > 1) line += " Plus " + (highs.length - 1) + " more high-severity " + (highs.length === 2 ? "issue" : "issues") + ".";
    return line;
  }

  function showReport(r){
    var L = LEVELS[r.safety_level] || LEVELS.moderate;
    var c = gradeColor(r.score);
    var flags = (r.flags||[]).slice(0,4).map(function(f){
      return '<div class="flag"><span class="sev sev-'+f.severity+'">'+f.severity+'</span>'+esc(f.title)+'</div>';
    }).join("");
    var sum = (r.plain_summary||[]).slice(0,3).map(function(s){ return "<li>"+esc(s)+"</li>"; }).join("");
    playChime(r.safety_level);
    sayOrQueue(verdictLine(r), { pitch: r.safety_level === "dangerous" ? 1.35 : 1.25 });
    render(
      '<div class="head"><strong>Buddy report</strong><span class="bmute-slot"></span></div>'+
      '<div class="verdict"><div class="grade" style="color:'+c+'">'+esc(r.grade)+'</div>'+
      '<div><span class="lvl" style="color:'+c+'">'+L[0]+" "+L[1]+'</span><div class="meta">'+r.score+"/100 fairness</div></div></div>"+
      (sum ? '<ul class="sum">'+sum+"</ul>" : "")+
      (flags ? '<div class="fhead">Top red flags</div>'+flags : '<div class="ok">\u2705 No known predatory clauses found.</div>')+
      '<div class="foot">Not legal advice \u00B7 rules engine</div>'
    );
    var slot = panel.querySelector(".bmute-slot");
    if (slot) slot.innerHTML = MUTE_CSS;
    wireMute();
    open();
  }

  function scan(){
    box.classList.add("busy");
    render('<div class="scan"><div class="spin"></div><p>Reading the fine print…</p></div>' + MUTE_CSS);
    sayOrQueue("Scanning this page for you");
    wireMute();
    open();
    var text = scrape().slice(0, 60000);
    fetch(API + "/api/analyze/text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: text, doc_kind: "Terms & Conditions" })
    })
    .then(function(res){ return res.json(); })
    .then(function(data){
      box.classList.remove("busy");
      if (data.error) {
        playChime("error");
        sayOrQueue("Sorry, I could not read that page.");
        render('<div class="scan"><p>\u26A0\uFE0F '+esc(data.error)+"</p></div>" + MUTE_CSS);
        wireMute();
        return;
      }
      showReport(data);
    })
    .catch(function(){
      box.classList.remove("busy");
      playChime("error");
      sayOrQueue("I can't reach PaperRoseAI. Is the backend running?");
      render('<div class="scan"><p>\u26A0\uFE0F Can\'t reach PaperRoseAI. Is the backend running on '+API+"?</p></div>" + MUTE_CSS);
      wireMute();
    });
  }

  box.title = "Click: scan this page with PaperRoseAI";
  function syncMuteBtn(){
    var btn = panel.querySelector(".bmute");
    if (btn) btn.textContent = MUTED ? "\uD83D\uDD07" : "\uD83D\uDD0A";
  }
  render('<div class="scan"><div class="spin"></div><p>Warming up…</p></div>');
  scan();
  window.__paperroseBuddy = { toggle: toggle, scan: scan, setMuted: setMuted };
})();`;

function minify(source) {
  return source
    // strip comments, collapse whitespace, drop newlines around punctuation
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s+/gm, "")
    .replace(/\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function buildBookmarklet(apiBase = "http://127.0.0.1:5000") {
  const css = `
    .bot{width:60px;height:60px;cursor:pointer;background:linear-gradient(120deg,#f43f5e,#a855f7,#6366f1);
      border-radius:18px;box-shadow:0 8px 24px rgba(168,85,247,.5);position:relative;
      transition:transform .2s ease;}
    .bot:hover{transform:scale(1.08)}
    .bot:before,.bot:after{content:"";position:absolute;background:#fff;border-radius:50%;width:11px;height:11px;top:24px}
    .bot:before{left:13px}.bot:after{left:34px}
    .bot.busy{animation:prpulse 1s ease-in-out infinite}
    @keyframes prpulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
    .panel{position:absolute;bottom:74px;right:0;width:320px;max-height:480px;overflow:auto;
      background:#1c1929;color:#f1eefa;border:1px solid rgba(241,238,250,.18);border-radius:18px;
      box-shadow:0 14px 50px rgba(0,0,0,.55);padding:16px;font-size:13px;line-height:1.5}
    .panel.hidden{display:none}
    .head{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}
    .url{font-size:10px;opacity:.6;max-width:150px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .verdict{display:flex;align-items:center;gap:14px;padding:8px 0}
    .grade{font-size:38px;font-weight:800;line-height:1}
    .lvl{font-weight:700;font-size:12px}
    .meta{font-size:11px;opacity:.6}
    .sum{margin:8px 0;padding:10px 12px;background:rgba(167,139,250,.08);border-radius:10px;
      font-size:12px;opacity:.9;padding-left:24px}
    .sum li{margin:4px 0}
    .fhead{font-size:10px;text-transform:uppercase;letter-spacing:.06em;opacity:.6;margin:10px 0 4px}
    .flag{display:flex;align-items:center;gap:8px;padding:3px 0;font-size:12px}
    .sev{font-size:9px;font-weight:800;text-transform:uppercase;padding:2px 8px;border-radius:99px}
    .sev-high{background:rgba(239,68,68,.15);color:#f87171}
    .sev-medium{background:rgba(245,158,11,.15);color:#fbbf24}
    .sev-low{background:rgba(255,255,255,.08);color:#cbd5e1}
    .bmute{background:none;border:none;cursor:pointer;font-size:15px;line-height:1;padding:2px 4px;border-radius:8px;opacity:.85}
    .bmute:hover{opacity:1;background:rgba(241,238,250,.08)}
    .bmute-slot{display:flex;align-items:center}
    .ok{margin:10px 0;font-size:12px}
    .scan{text-align:center;padding:14px 0}
    .spin{width:26px;height:26px;margin:0 auto 10px;border-radius:50%;
      border:3px solid rgba(167,139,250,.25);border-top-color:#a855f7;animation:prspin .8s linear infinite}
    @keyframes prspin{to{transform:rotate(360deg)}}
    .foot{margin-top:12px;font-size:10px;opacity:.5;text-align:center}
  `;
  // JSON.stringify output is already a valid JS string literal — embed as-is.
  // Function replacement avoids String.replace's special $ handling.
  const src = BOOKMARKLET_SOURCE
    .replace("CSS_TEXT_PLACEHOLDER", () => JSON.stringify(css))
    .replace('var API = "http://127.0.0.1:5000";', () => `var API = ${JSON.stringify(apiBase)};`);
  return "javascript:" + encodeURIComponent(minify(src));
}

export default buildBookmarklet;
