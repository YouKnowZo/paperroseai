import { test } from "node:test";
import assert from "node:assert/strict";
import { robotsTxt, siteUrls, sitemapXml } from "./generateSitemap.js";

const SITE_URL = "https://paperrose.example";

test("sitemap lists absolute HTTPS URLs for every content page", () => {
  const urls = siteUrls(SITE_URL);
  assert.equal(urls[0].url, SITE_URL);
  assert.ok(urls.every(({ url }) => url.startsWith(`${SITE_URL}/`) || url === SITE_URL));
  const xml = sitemapXml(SITE_URL, "2026-10-05T00:00:00.000Z");
  assert.match(xml, new RegExp(`<loc>${SITE_URL}/about</loc>`));
  assert.doesNotMatch(xml, /<loc>\/(?:about|faq|pricing)/);
});

test("robots points to an absolute sitemap URL", () => {
  assert.match(robotsTxt(SITE_URL), /Sitemap: https:\/\/paperrose\.example\/sitemap\.xml/);
});

test("invalid or missing canonical site origins are rejected", () => {
  for (const value of [undefined, "", "/", "http://paperrose.example", "https://user:pass@paperrose.example", "https://paperrose.example/path", "https://paperrose.example?preview=1"]) {
    assert.throws(() => siteUrls(value), /VITE_SITE_URL must/);
  }
});
