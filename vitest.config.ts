import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const webAppRoot = fileURLToPath(new URL("./apps/web", import.meta.url));

export default defineConfig({
  oxc: {
    jsx: {
      runtime: "automatic",
      importSource: "react",
    },
  },
  resolve: {
    alias: [
      {
        find: /^@\//,
        replacement: `${webAppRoot}/`,
      },
    ],
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "apps/**/src/**/*.test.{ts,tsx}",
      "apps/**/components/**/*.test.{ts,tsx}",
      "apps/**/lib/**/*.test.{ts,tsx}",
      "packages/**/src/**/*.test.{ts,tsx}",
      "scripts/**/*.test.{ts,tsx}",
    ],
    exclude: ["**/node_modules/**", "**/.next/**", "**/dist/**"],
    restoreMocks: true,
    clearMocks: true,
    passWithNoTests: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: [
        "apps/web/lib/**/*.ts",
        "apps/worker/src/**/*.ts",
        "packages/**/src/**/*.ts",
      ],
      exclude: [
        "**/*.test.ts",
        "**/node_modules/**",
        "packages/db/src/**",
        "packages/contracts/src/index.ts",
      ],
    },
  },
});
