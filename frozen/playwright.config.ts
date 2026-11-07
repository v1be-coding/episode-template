import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  // Q40: one retry, and a test that needed it passes and is reported.
  retries: 1,
  // Retries run at the end, so a retry can't land in a fresh rate-limit window
  // and hide a 429 (Q59).
  retryStrategy: "isolated",
  // One at a time, because every test shares this runner's IP and its limit.
  workers: 1,
  reporter: "list",
  use: {
    baseURL: process.env.BASE_URL,
    // Keeps the failed first attempt, which is the one worth reading. on-first-retry
    // would keep only the retry, which for a flaky test is the attempt that passed.
    trace: "retain-on-failure-and-retries",
  },
  projects: [
    { name: "smoke", testIgnore: /rate-limit\.spec\.ts/ },
    // Last, because it uses up this IP's minute on purpose.
    { name: "rate-limit", testMatch: /rate-limit\.spec\.ts/, dependencies: ["smoke"] },
  ],
});
