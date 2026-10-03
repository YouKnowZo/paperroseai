import { useState } from "react";
import Icon from "./Icon.jsx";
import { downloadBrowserExtension } from "../lib/extensionDownloads.js";

export default function BrowserExtension({ onTryIt }) {
  const [downloadError, setDownloadError] = useState("");
  async function download(browser) {
    setDownloadError("");
    try { await downloadBrowserExtension(browser); }
    catch (error) { setDownloadError(error?.message || "Could not prepare the add-on download."); }
  }
  return (
    <section className="browser-extension card" id="browser-extension">
      <div className="extension-copy">
        <span className="section-kicker">READ WHERE YOU BROWSE</span>
        <h2>Take a page into a clear review.</h2>
        <p>Our free, open-source browser add-on copies visible page text only when you click it. You decide what to submit in PaperRoseAI.</p>
        <div className="extension-browsers" aria-label="Supported browsers">
          <span>Chrome</span><span>Microsoft Edge</span><span>Brave</span><span>Firefox</span><span>Opera</span>
        </div>
        <div className="extension-downloads" aria-label="Download for your browser">
          <button className="btn btn-ghost" type="button" onClick={() => download("chromium")}><Icon name="download" size={17} /> Chrome / Edge / Brave</button>
          <button className="btn btn-ghost" type="button" onClick={() => download("firefox")}><Icon name="download" size={17} /> Firefox</button>
        </div>
        {downloadError && <p className="extension-error" role="alert">{downloadError}</p>}
        <details className="extension-manual"><summary>Manual install or Opera instructions</summary><ol>
          <li>Download the all-browser extension ZIP and extract it.</li>
          <li>Open <strong>browser-extension/chromium</strong> (Chromium) or <strong>browser-extension/firefox</strong> (Firefox).</li>
          <li>Load the folder as an unpacked/temporary extension from your browser's extensions page.</li>
        </ol></details>
        <ol className="extension-steps">
          <li><span>1</span><div>Download the extension ZIP for your browser and extract it.</div></li>
          <li><span>2</span><div>Open your browser’s extensions page and enable developer mode (or temporary extensions in Firefox).</div></li>
          <li><span>3</span><div>Choose Load unpacked (Chromium) or Load Temporary Add-on (Firefox) and select the extracted folder.</div></li>
          <li><span>4</span><div>Open a terms page, click the extension, then review, paste, and submit the text here.</div></li>
        </ol>
        <div className="extension-actions">
          <button className="btn btn-primary" onClick={onTryIt}><Icon name="scales" size={17} /> Try a free review</button>
        </div>
        <p className="extension-note">Not yet listed in browser stores; currently installed as an unpacked/test extension. Firefox temporary add-ons are removed on restart. Opera may work with the Chromium package. Safari needs separate packaging. Nothing auto-scans or reads cookies/hidden fields.</p>
      </div>
      <div className="extension-art" aria-hidden="true"><div className="extension-browser"><div className="extension-browser-bar"><i /><i /><i /><span>example.com/legal</span></div><div className="extension-page"><b>Terms &amp; conditions</b><span /><span /><span className="short" /><span /><mark /><span /><span className="medium" /></div><div className="extension-addon"><Icon name="scales" size={27} /><span>Review this page</span><Icon name="arrow" size={16} /></div></div></div>
    </section>
  );
}
