import { defineConfig } from "@playwright/test";
import { projectsFor } from "./helpers/projects.ts";

export default defineConfig({
  testDir: ".",
  // Q40: one retry, and a test that needed it passes and is reported.
  retries: 1,
  // Retries run at the end, so a retry can't land in a fresh rate-limit window
  // and hide a 429 (Q59).
  retryStrategy: "isolated",
  // One at a time, because every test shares this runner's IP and its limit.
  workers: 1,
  // results.json and the retry report are kept for the retro (Q66). Neither holds
  // traces, cookies or bodies, so both can be uploaded from any target.
  reporter: [
    ["list"],
    ["json", { outputFile: "reports/results.json" }],
    ["./helpers/retry-reporter.ts"],
  ],
  use: {
    baseURL: process.env.BASE_URL,
    // Keeps the failed first attempt, which is the one worth reading. on-first-retry
    // would keep only the retry, which for a flaky test is the attempt that passed.
    trace: "retain-on-failure-and-retries",
  },
  projects: projectsFor(process.env.FROZEN_TARGET),
});
