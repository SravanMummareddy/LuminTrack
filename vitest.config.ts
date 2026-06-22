import { defineConfig } from "vitest/config";

// Unit-test harness. Pure logic + the placement lifecycle state machine run in a
// plain Node environment with no database — the lifecycle tests pass a mock
// Prisma transaction client, and `@/server/db` is mocked so importing it never
// constructs the Neon adapter. See src/**/__tests__.
//
// `@/*` path aliases resolve via Vite's native tsconfig-paths support.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: false,
  },
});
