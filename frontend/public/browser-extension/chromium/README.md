# PaperRoseAI Page Reader — Chromium

Works as an unpacked Chromium Manifest V3 extension in Chrome, Microsoft Edge, Brave, and Chromium browsers that support activeTab/scripting.

## Install for testing
1. Download and extract the repository ZIP.
2. Open `chrome://extensions` (or `edge://extensions` / `brave://extensions`).
3. Enable Developer mode.
4. Choose **Load unpacked** and select the `browser-extension/chromium` folder.
5. Pin the extension, visit a terms page, click its toolbar icon, and choose **Review this page**.
6. PaperRoseAI opens; click **Paste copied page**, review the text, and submit explicitly.

The hosted app URL is configured in `popup.js` (`https://frontend-five-amber-34.vercel.app/`). If the production app domain changes, update that URL before packaging the extension.

Nothing runs until the toolbar action is clicked. The extension requests only temporary active-tab access, script injection for that tab, and clipboard writing. It copies up to 60,000 visible characters. It does not read cookies, credentials, hidden inputs, or browse in the background. It does not submit the analysis or have host-wide access.

This source package is not published in the Chrome Web Store, Edge Add-ons, Brave, or Opera stores yet.
