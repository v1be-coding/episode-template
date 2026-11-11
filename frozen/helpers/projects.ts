import type { Project } from "@playwright/test";

// Which test projects run on a target. Acceptance tests run on branch
// environments only, and production keeps the smoke test (Q29). verify.yml sets
// FROZEN_TARGET. Unset, as in a local run, counts as a branch.
export function projectsFor(target: string | undefined): Project[] {
  const onProduction = target === "production";
  const beforeRateLimit = onProduction ? ["smoke"] : ["smoke", "acceptance"];
  return [
    { name: "smoke", testDir: "smoke", testIgnore: /rate-limit\.spec\.ts/ },
    ...(onProduction ? [] : [{ name: "acceptance", testDir: "acceptance", dependencies: ["smoke"] }]),
    // Last, because it uses up this IP's minute on purpose.
    { name: "rate-limit", testMatch: /rate-limit\.spec\.ts/, dependencies: beforeRateLimit },
  ];
}
