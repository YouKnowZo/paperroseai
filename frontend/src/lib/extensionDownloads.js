import { createExtensionZip } from "./extensionZip.js";

const ROOT = "/browser-extension";
const FILES = {
  chromium: ["manifest.json", "popup.html", "popup.css", "popup.js", "README.md"],
  firefox: ["manifest.json", "popup.html", "popup.css", "popup.js", "README.md"],
};

export async function downloadBrowserExtension(browser) {
  if (!(browser in FILES)) throw new Error("Unsupported browser package.");
  const files = await Promise.all(FILES[browser].map(async (name) => {
    const sourceBrowser = browser;
    const response = await fetch(`${ROOT}/${sourceBrowser}/${name}`, { cache: "no-cache", credentials: "omit" });
    if (!response.ok) throw new Error(`Could not load the ${browser} extension (${response.status}). Please retry.`);
    return { name, content: await response.text() };
  }));
  const blob = createExtensionZip(files);
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `paperroseai-${browser}-extension.zip`;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 30_000);
}
