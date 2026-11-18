// The app's 429 is JSON. Cloudflare's rate-limit block on production (50 /api/*
// calls per 10 s per IP) answers 429 with its own error 1015 page. A 429 that
// isn't JSON is named as Cloudflare's, so it isn't read as an app bug.
export function limitedEntry(url: string, contentType: string | undefined): string {
  return contentType?.includes("application/json") ? url : `${url} (Cloudflare's block, error 1015, not the app's 429)`;
}
