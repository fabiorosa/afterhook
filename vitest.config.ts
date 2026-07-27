import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: [
      ...configDefaults.exclude,
      "**/dist/**",
      "**/e2e/**",
      "**/*.integration.test.ts",
    ],
    coverage: {
      enabled: false,
    },
  },
});
