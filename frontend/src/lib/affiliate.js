const RESERVED_HOSTS = new Set(["localhost", "127.0.0.1", "github.com", "vercel.app"]);

export function getAffiliateOffer(nameValue, urlValue) {
  const name = typeof nameValue === "string" ? nameValue.trim() : "";
  const rawUrl = typeof urlValue === "string" ? urlValue.trim() : "";
  if (!name || name.length > 48 || !rawUrl || rawUrl.length > 2048) return null;
  try {
    const url = new URL(rawUrl);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:" || !hostname.includes(".") || RESERVED_HOSTS.has(hostname) || hostname.endsWith(".vercel.app")) return null;
    if (url.username || url.password) return null;
    return { name, url: url.toString() };
  } catch {
    return null;
  }
}
