import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: {
    tsconfigPaths: true,
  },
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/tests/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    // Integration tests need a real PostgreSQL server and run through
    // vitest.integration.config.ts (`npm run test:integration`). Keeping them
    // out of the default suite means `npm test` stays runnable with no
    // database at all.
    exclude: ["node_modules/**", "src/tests/integration/**"],
    css: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/generated/**", "src/**/*.test.{ts,tsx}", "src/tests/**"],
    },
    // Fixture values so any module-level `@/config/env` validation succeeds
    // in the test process without a real database. Tests that exercise env
    // validation itself (src/config/env.test.ts) call `parseEnv()` directly
    // with their own fixtures instead of relying on these.
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://test:test@localhost:5432/pdlc_test",
      LOG_LEVEL: "error",
      NEXT_PUBLIC_APP_NAME: "PDLC Platform",
    },
  },
});
