import { defineConfig } from "vitest/config";
import path from "node:path";

/** Unit tests for pure math only (no React, no I/O) — order execution,
 *  and Alpha's Kelly/Dixon-Coles/margin-removal/metrics modules as they
 *  land. Playwright (`test:e2e`) stays the tool for anything that touches
 *  the browser or a running server. */
export default defineConfig({
  test: {
    include: ["src/**/__tests__/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
