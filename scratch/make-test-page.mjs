// Generates scratch/test.html — a fake "external website" with the real
// PaperRose bookmarklet embedded as a clickable bookmark link, for
// end-to-end injection testing.
// Run: node scratch/make-test-page.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import build from "../frontend/src/lib/bookmarklet.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
mkdirSync(join(root, "scratch"), { recursive: true });

const url = build("http://127.0.0.1:5000");

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>MegaWidget Inc. — Terms of Service</title></head>
<body style="font-family:Georgia,serif;max-width:720px;margin:40px auto;padding:0 20px;color:#222">
<h1>MegaWidget Inc. — Terms of Service</h1>
<p>Last updated: January 2026. By accessing MegaWidget Inc. ("the Company") services, you agree to be bound by these Terms of Service.</p>
<h2>1. Binding Arbitration</h2>
<p>Any dispute arising from these terms shall be resolved through final and binding arbitration. You waive your right to a jury trial and agree that claims must be brought individually, not as part of a class action.</p>
<h2>2. Subscriptions &amp; Billing</h2>
<p>Paid plans automatically renew each month until you cancel. All fees paid are non-refundable.</p>
<h2>3. User Content License</h2>
<p>By posting content, you grant the Company a perpetual, irrevocable, worldwide, royalty-free license to use, modify, translate, and distribute your content.</p>
<h2>4. Privacy</h2>
<p>We may sell your personal information to third-party advertising partners. We use third-party cookies and device fingerprinting for cross-site tracking. You may opt out of marketing emails at any time. You have the right to request deletion of your personal data.</p>
<h2>5. Changes</h2>
<p>We reserve the right to change these terms at any time; your continued use constitutes acceptance.</p>
<h2>6. Liability</h2>
<p>IN NO EVENT SHALL THE COMPANY BE LIABLE FOR ANY DAMAGES. THE SERVICE IS PROVIDED "AS IS" WITHOUT WARRANTIES.</p>
<h2>7. Termination</h2>
<p>We may suspend or terminate your account at any time, for any reason, without prior notice.</p>
<p>Related: <a href="/privacy">Privacy Policy</a> · <a href="/cookies">Cookie Policy</a></p>
<hr>
<p style="background:#ffe9ec;padding:14px;border-radius:10px">
<b>Test harness:</b> pretend this page is some other company's website.
Click the bookmark below — it plays the role of the bookmarklet saved in your
bookmarks bar — and the PaperRose buddy should appear here and grade this page
without navigating away.</p>
<p><a id="bm" href="ESCAPED_URL_PLACEHOLDER" style="display:inline-flex;align-items:center;gap:8px;background:linear-gradient(120deg,#f43f5e,#a855f7,#6366f1);color:#fff;padding:10px 20px;border-radius:99px;text-decoration:none;font-family:sans-serif;font-weight:700">🤖 PaperRose Buddy (click = bookmarklet)</a></p>
</body></html>`;

writeFileSync(join(root, "scratch", "test.html"), html.replace("ESCAPED_URL_PLACEHOLDER", url));
console.log("scratch/test.html written. Bookmarklet size:", url.length, "chars.");
