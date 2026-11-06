import { defineConfig } from "vitest/config";

// Separate from vite.config.ts, whose root is the web folder. Frozen tests run in
// their own step, so they stay out of this.
export default defineConfig({
  test: { include: ["src/**/*.test.{ts,tsx}"] },
});
