import { defineConfig } from "vitest/config";

// Integration suite — runs the real server actions against a real disposable
// Postgres (Docker). Kept in its own config so the default `npm test` (unit)
// stays database-free and fast. Single-threaded: all tests share one DB and
// truncate between cases.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    globals: false,
    fileParallelism: false,
    pool: "forks",
  },
});
