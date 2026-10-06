# PaperRoseAI Page Reader — Firefox

## Install temporarily for testing
1. Download and extract the repository ZIP.
2. Open `about:debugging#/runtime/this-firefox`.
3. Choose **Load Temporary Add-on…** and select `browser-extension/firefox/manifest.json`.
4. Pin the extension, visit a terms page, click its toolbar icon, and choose **Review this page**.
5. PaperRoseAI opens; click **Paste copied page**, review the text, then submit explicitly.

The hosted app URL is configured in `popup.js` (`https://frontend-five-amber-34.vercel.app/`). If the production app domain changes, update that URL before packaging the extension.

The Firefox Manifest V2 build requests only `activeTab` and clipboard write access. Nothing runs until clicked. It copies up to 60,000 visible characters only and does not read cookies, passwords, hidden form values, or background pages. Firefox temporary add-ons are removed when Firefox restarts. The extension is not yet signed or listed on addons.mozilla.org (AMO).
