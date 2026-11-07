import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { describe, expect, it } from "vitest";
import { addressGroup, cameThroughCloudFront, clientIp, hashIp, ORIGIN_HEADER } from "./client-ip.js";

const event = (headers: Record<string, string>, sourceIp = "198.51.100.7") =>
  ({ headers, requestContext: { http: { sourceIp } } }) as unknown as APIGatewayProxyEventV2;

describe("cameThroughCloudFront", () => {
  it("accepts the header CloudFront adds", () => {
    expect(cameThroughCloudFront(event({ [ORIGIN_HEADER]: "secret" }), "secret")).toBe(true);
  });

  it.each([
    ["no header", {}],
    ["a wrong value", { [ORIGIN_HEADER]: "guess!" }],
    ["a value of another length", { [ORIGIN_HEADER]: "s" }],
  ])("refuses %s", (_name, headers) => {
    expect(cameThroughCloudFront(event(headers), "secret")).toBe(false);
  });

  it("refuses everything when the Lambda has no secret", () => {
    expect(cameThroughCloudFront(event({ [ORIGIN_HEADER]: "" }), "")).toBe(false);
  });
});

describe("clientIp", () => {
  it("uses CF-Connecting-IP behind Cloudflare", () => {
    expect(clientIp(event({ "cf-connecting-ip": "203.0.113.5" }), "cloudflare")).toBe("203.0.113.5");
  });

  it("ignores CF-Connecting-IP on a branch, where anyone can send it", () => {
    expect(clientIp(event({ "cf-connecting-ip": "203.0.113.5" }), "api-gateway")).toBe("198.51.100.7");
  });

  it("falls back to sourceIp if Cloudflare's header is missing", () => {
    expect(clientIp(event({}), "cloudflare")).toBe("198.51.100.7");
  });
});

describe("addressGroup", () => {
  it("keeps an IPv4 address as it is", () => {
    expect(addressGroup("203.0.113.5")).toBe("203.0.113.5");
  });

  it.each([
    ["2001:db8:1:2:3:4:5:6", "2001:db8:1:2::/64"],
    ["2001:db8:1:2::9", "2001:db8:1:2::/64"],
    ["2001:DB8::1", "2001:db8:0:0::/64"],
    ["2001:0db8:0001:0002::", "2001:db8:1:2::/64"],
  ])("groups %s by its /64", (ip, group) => {
    expect(addressGroup(ip)).toBe(group);
  });
});

describe("hashIp", () => {
  it("counts addresses in one /64 together", () => {
    expect(hashIp("2001:db8:1:2::9", "k")).toBe(hashIp("2001:db8:1:2:ffff::1", "k"));
  });

  it("doesn't contain the address", () => {
    expect(hashIp("203.0.113.5", "k")).not.toContain("203");
  });

  it("depends on the key", () => {
    expect(hashIp("203.0.113.5", "a")).not.toBe(hashIp("203.0.113.5", "b"));
  });
});
