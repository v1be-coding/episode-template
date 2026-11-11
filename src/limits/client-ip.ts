import { createHmac, timingSafeEqual } from "node:crypto";
import type { APIGatewayProxyEventV2 } from "aws-lambda";

export const ORIGIN_HEADER = "x-v1be-api-origin";

// CloudFront adds this header, so a request without it came to the raw
// execute-api address and skipped CloudFront and Cloudflare (Q55).
export function cameThroughCloudFront(event: APIGatewayProxyEventV2, secret: string): boolean {
  const sent = event.headers?.[ORIGIN_HEADER];
  if (!secret || !sent) return false;
  const a = Buffer.from(sent);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Only call this after cameThroughCloudFront. Behind Cloudflare, API Gateway sees
// Cloudflare's address, so the visitor's is in CF-Connecting-IP. On a branch,
// API Gateway's own sourceIp is the visitor, and no header can change it (#24).
export function clientIp(
  event: APIGatewayProxyEventV2,
  source: "cloudflare" | "api-gateway",
): string {
  const fromCloudflare = event.headers?.["cf-connecting-ip"];
  return source === "cloudflare" && fromCloudflare
    ? fromCloudflare
    : event.requestContext.http.sourceIp;
}

// One person usually holds a whole IPv6 /64, so it counts as one address.
export function addressGroup(ip: string): string {
  if (!ip.includes(":")) return ip;
  const [head = "", tail = ""] = ip.toLowerCase().split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const groups = ip.includes("::")
    ? [...left, ...Array<string>(8 - left.length - right.length).fill("0"), ...right]
    : left;
  return `${groups
    .slice(0, 4)
    .map((group) => group.replace(/^0+(?=.)/, ""))
    .join(":")}::/64`;
}

// Counters and logs hold this, never the address. Keyed, so the IPv4 space
// can't be hashed in bulk to reverse it.
export function hashIp(ip: string, key: string): string {
  return createHmac("sha256", key).update(addressGroup(ip)).digest("hex").slice(0, 32);
}
