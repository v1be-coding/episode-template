import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: ".",
  retries: 1, // Q40: one retry, and anything that needed it is reported.
  reporter: "list",
  use: { baseURL: process.env.BASE_URL },
});
