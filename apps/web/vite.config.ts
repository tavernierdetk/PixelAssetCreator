import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/setupTests.ts"],
    css: true,
    globals: true,            // ← add this
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
      "/@": resolve(__dirname, "src"),
    },
  },
});
