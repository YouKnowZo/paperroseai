import { sitemapXml, robotsTxt } from "./generateSitemap.js";
import fs from "node:fs";
import path from "node:path";

/** Emit a real sitemap.xml and robots.txt into the build output so the
 *  public site has a discoverability surface instead of nothing.
 *
 * siteUrl comes from process.env (Node side) because this plugin runs during
 * the Vite build, where import.meta.env is not available. The browser bundle
 * reads the same value via import.meta.env.VITE_SITE_URL at runtime.
 */
export default function seoPlugin() {
  const siteUrl = (process.env.VITE_SITE_URL || "").trim().replace(/\/$/, "");
  return {
    name: "paperrose-seo",
    writeBundle() {
      const out = path.resolve(__dirname, "..", "..", "dist");
      const now = new Date();
      try {
        fs.writeFileSync(path.resolve(out, "sitemap.xml"), sitemapXml(siteUrl, now), "utf8");
        fs.writeFileSync(path.resolve(out, "robots.txt"), robotsTxt(siteUrl), "utf8");
      } catch (err) {
        throw new Error(`[paperrose-seo] could not emit sitemap/robots: ${err.message}`, { cause: err });
      }
    },
  };
}
