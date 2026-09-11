import { defineConfig } from "vitest/config";

/**
 * Integration tests — these run against a **real PostgreSQL server**.
 *
 * Separate from the default suite on purpose. The unit suite fakes
 * repositories and needs no database, which keeps it fast and runnable
 * anywhere; this suite exists precisely to execute the Prisma queries the
 * unit suite cannot, so a malformed `where` or a wrong composite key is
 * caught rather than merely typechecked.
 *
 * There is no SQLite fallback and no emulated database. If PostgreSQL is not
 * reachable, the tests skip loudly rather than pretending to pass — see
 * src/tests/integration/setup.ts.
 *
 * Run with: npm run test:integration (requires `docker compose up -d` or
 * another PostgreSQL reachable at DATABASE_URL).
 */
export default defineConfig({
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    // Node, not jsdom: this exercises server-side data access only.
    environment: "node",
    globals: false,
    include: ["src/tests/integration/**/*.test.ts"],
    // A real database is slower than a mock, and CI containers are cold.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Each file owns rows keyed to its own organization; running files
    // sequentially keeps failures easy to read and avoids pool contention.
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "error",
      NEXT_PUBLIC_APP_NAME: "PDLC Platform",
      // DATABASE_URL is deliberately NOT set here — it must come from the
      // real environment so this can never silently point somewhere fake.
    },
  },
});
