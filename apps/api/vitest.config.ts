import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node" },
  resolve: {
    alias: {
      // Use SOURCE for local packages so tests don't depend on dist/
      "@pixelart/schemas":  path.resolve(__dirname, "../../packages/schemas/src/index.ts"),
      "@pixelart/config":   path.resolve(__dirname, "../../packages/config/src/index.ts"),
      // Mock the pipeline queues to avoid Redis during tests
      "@pixelart/pipeline": path.resolve(__dirname, "./test/mocks/pipeline.ts")
    }
  }
});
