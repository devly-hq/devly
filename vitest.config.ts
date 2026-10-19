import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [
      "tests/unit/**/*.test.ts",
      "tests/integration/**/*.test.ts",
      "tests/e2e/**/*.test.ts",
      "packages/**/src/**/*.test.ts",
      "apps/**/src/**/*.test.ts",
    ],
    testTimeout: 240_000,
    coverage: {
      reporter: ["text", "html"],
      include: ["packages/**/src/**/*.ts"],
    },
  },
  resolve: {
    alias: {
      "@devly/core": path.resolve(__dirname, "packages/core/src"),
      "@devly/agents": path.resolve(__dirname, "packages/agents/src"),
      "@devly/execution": path.resolve(__dirname, "packages/execution/src"),
      "@devly/mascot": path.resolve(__dirname, "packages/mascot/src"),
      "@devly/protocol": path.resolve(__dirname, "packages/protocol/src"),
    },
  },
});
