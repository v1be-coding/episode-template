import assert from "node:assert/strict";
import { test } from "node:test";
import { branchUrl, parseArgs } from "./time-requests.mjs";

test("reads the path, count, method, headers and body", () => {
  assert.deepEqual(
    parseArgs([
      "12",
      "/api/traces",
      "--count",
      "5",
      "--method",
      "POST",
      "--header",
      "X-Api-Key: abc",
      "--body",
      "{}",
    ]),
    {
      pr: "12",
      path: "/api/traces",
      count: 5,
      method: "POST",
      headers: { "x-api-key": "abc" },
      body: "{}",
    },
  );
  assert.equal(parseArgs(["12", "/api/health"]).count, 3);
});

test("refuses anything that could reach another host or write elsewhere", () => {
  for (const argv of [
    ["x", "/api"],
    ["12", "https://example.com/"],
    ["12", "//example.com/"],
    ["12", "/\\example.com/"],
    ["12", "/api", "--method", "DELETE"],
    ["12", "/api", "--count", "500"],
    ["12", "/api", "--body", "{}"],
    ["12", "/api", "--url", "https://example.com"],
    ["12", "/api", "--count"],
  ]) {
    assert.throws(() => parseArgs(argv), undefined, argv.join(" "));
  }
});

test("takes the newest branch URL from a trusted author only", () => {
  const comments = [
    {
      author: { login: "v1be-agent[bot]" },
      body: "Branch: https://d111.cloudfront.net\n- [ ] x",
    },
    { author: { login: "v1be-agent" }, body: "Branch: https://d222.cloudfront.net" },
    { author: { login: "someone" }, body: "Try https://d999.cloudfront.net" },
  ];
  assert.equal(branchUrl(comments), "https://d222.cloudfront.net");
  assert.equal(branchUrl([comments[2]]), null);
});
