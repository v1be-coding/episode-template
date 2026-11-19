// What a test reads from served HTML, to catch markup the app didn't write.
// Cloudflare's dashboard defaults rewrite HTML at the edge: on 2026-11-18 Web
// Analytics injected its RUM beacon (a /cdn-cgi/ script loading from
// static.cloudflareinsights.com), which broke the CSP and failed C51 (run
// 44250758105). Only production passes through Cloudflare.

// The src of every <script> tag in the HTML, as written.
export function scriptSources(html: string): string[] {
  const sources: string[] = [];
  for (const tag of html.matchAll(/<script\b[^>]*>/gi)) {
    const src = /\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(tag[0]);
    if (src) sources.push(src[1] ?? src[2] ?? src[3] ?? "");
  }
  return sources;
}

// The URLs that don't load from the page's own origin, resolved against it.
export function foreignUrls(urls: string[], pageUrl: string): string[] {
  const origin = new URL(pageUrl).origin;
  return urls.map((url) => new URL(url, pageUrl)).filter((url) => url.origin !== origin).map((url) => url.href);
}
