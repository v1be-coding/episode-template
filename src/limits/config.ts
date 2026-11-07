// Settings Terraform gives the Lambda. Read on each call, so tests can set them.
export function limitsConfig() {
  return {
    table: process.env.LIMITS_TABLE ?? "",
    originSecret: process.env.API_ORIGIN_SECRET ?? "",
    // "cloudflare" behind Cloudflare, "api-gateway" on a branch (Q55).
    ipSource: process.env.IP_SOURCE === "cloudflare" ? "cloudflare" : "api-gateway",
    episode: process.env.EPISODE ?? "unknown",
    target: process.env.TARGET ?? "unknown",
    dailyCapUsd: Number(process.env.DAILY_CAP_USD ?? "1"),
  } as const;
}
