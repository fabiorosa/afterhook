import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "apps/api/src/persistence/**/*.integration.test.ts",
      "packages/orchestration/src/**/*.integration.test.ts",
    ],
  },
});
