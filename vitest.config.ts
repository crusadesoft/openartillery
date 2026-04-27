import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["packages/*/src/**/*.test.ts", "packages/*/test/**/*.test.ts"],
    setupFiles: ["packages/server/test/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["packages/*/src/**"],
      exclude: ["**/*.test.ts", "**/dist/**"],
    },
  },
});
