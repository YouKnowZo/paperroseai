import { createExtensionZip } from "./extensionZip.js";
import fs from "node:fs";
import path from "node:path";

const EXT_ROOT = path.resolve(__dirname, "..", "..", "public", "browser-extension");
const BROWSERS = ["chromium", "firefox"];

function readExtFiles(browser) {
  const dir = path.resolve(EXT_ROOT, browser);
  const names = ["manifest.json", "popup.html", "popup.css", "popup.js", "README.md"];
  return names.map((name) => {
    const filePath = path.resolve(dir, name);
    return { name, content: fs.readFileSync(filePath, "utf8") };
  });
}

/** Emit distributable extension ZIPs into dist/public/browser-extension/ so the
 *  static host serves them as real download artifacts instead of only relying on
 *  the in-app "download extension" button. */
export default function extensionBuildPlugin() {
  return {
    name: "paperrose-extension-build",
    async writeBundle() {
      const out = path.resolve(__dirname, "..", "..", "dist", "browser-extension");
      if (!fs.existsSync(out)) fs.mkdirSync(out, { recursive: true });
      for (const browser of BROWSERS) {
        const files = readExtFiles(browser);
        const blob = createExtensionZip(files);
        const bytes = Buffer.from(await blob.arrayBuffer());
        fs.writeFileSync(path.resolve(out, `paperroseai-${browser}-extension.zip`), bytes);
      }
    },
  };
}
