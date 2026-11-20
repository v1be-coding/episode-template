// App lint (Q65). frozen/ has its own lint, run from main's commit in the PR's merge (Q64).
import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import reactHooks from "eslint-plugin-react-hooks";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  // Flat config doesn't read .gitignore. Subagent worktrees are full repo copies,
  // and linting them ran ESLint out of memory in episode 1.
  globalIgnores(["dist/", "frozen/", "infra/", "drizzle/", "coverage/", ".claude/worktrees/"]),
  js.configs.recommended,
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  { files: ["**/*.{js,mjs,cjs}"], extends: [tseslint.configs.disableTypeChecked] },
  {
    files: ["src/web/**/*.{ts,tsx}"],
    extends: [reactHooks.configs.flat.recommended],
    languageOptions: { globals: globals.browser },
  },
  {
    files: [
      "src/{ai,api,db,limits}/**/*.ts",
      "*.config.{ts,js}",
      ".claude/**/*.mjs",
      "scripts/**/*.mjs",
    ],
    languageOptions: { globals: globals.node },
  },
  // Vitest's asymmetric matchers, such as expect.any(), are typed any.
  { files: ["**/*.test.ts"], rules: { "@typescript-eslint/no-unsafe-assignment": "off" } },
  prettier,
);
