/** Static site map + robots generator used by the Vite build plugin.
 *
 * Routes are declared here so they stay in one place and the build can emit
 * a real sitemap.xml + robots.txt instead of leaving the public site without
 * any discoverability surface.
 *
 * URL signatures (shared with main.jsx urlForRequest):
 *   /?scan=<encoded URL>            — a URL report (linkable)
 *   /#legal-terms | /#legal-privacy | /#legal-disclaimer — static legal text
 *   /about · /how-it-works · /faq · /pricing · /acceptable-use — content pages
 *
 * The public app is a single-page app, so all of these resolve to index.html
 * at the server/edge; the sitemap lists the real human-facing URLs.
 *
 * This module is used in two worlds:
 *   - Browser bundle: SeoHead reads import.meta.env.VITE_SITE_URL at runtime.
 *   - Node build plugin: the plugin passes process.env.VITE_SITE_URL in.
 * The pure functions below take siteUrl explicitly so neither world is broken.
 */
export const SITE_NAME = "PaperRoseAI";
export const SITE_DESC =
  "Understand the fine print with fairness grades, evidence-backed red flags, plain-English takeaways, and a voice that fits you.";

export const CONTENT_PAGES = [
  { path: "/about", changefreq: "monthly", priority: "0.7" },
  { path: "/how-it-works", changefreq: "monthly", priority: "0.8" },
  { path: "/faq", changefreq: "weekly", priority: "0.9" },
  { path: "/pricing", changefreq: "monthly", priority: "0.6" },
  { path: "/acceptable-use", changefreq: "monthly", priority: "0.6" },
];

/** Every public URL we want crawlers/search to know about. */
export function siteUrls(siteUrl) {
  const base = (siteUrl || "/").replace(/\/$/, "");
  return [
    { url: base, changefreq: "hourly", priority: "1.0" },
    ...CONTENT_PAGES.map((p) => ({ url: base + p.path, ...p })),
  ];
}

export function sitemapXml(siteUrl, now) {
  const urls = siteUrls(siteUrl);
  const base = (siteUrl || "/").replace(/\/$/, "");
  const nowStr = new Date(now).toISOString();
  const body = urls
    .map(
      (u) => `  <url>
    <loc>${u.url}</loc>
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
    <lastmod>${nowStr}</lastmod>
  </url>`
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}

export function robotsTxt(siteUrl) {
  const base = (siteUrl || "/").replace(/\/$/, "");
  return `User-agent: *
Allow: /

Sitemap: ${base}/sitemap.xml

# The app is a single-page site; everything resolves to index.html at the edge.
# Do not crawl user-generated scan report query strings.
Disallow: /*?scan=
`;
}
