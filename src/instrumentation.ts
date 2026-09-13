/**
 * Next.js's own server lifecycle hook — not a custom process manager, just
 * the one function Next.js already calls once when the server process
 * starts. Two things happen here, both Node-runtime only (this file also
 * loads under the Edge runtime for middleware, where neither Prisma nor
 * `process.on` exist):
 *
 * 1. **Startup order, made visible.** Importing `@/config/env` here forces
 *    its eager, validated singleton to run (it may already have run as a
 *    side effect of another import — this just guarantees it happens, and
 *    logs the outcome). An invalid environment throws before the import
 *    resolves, which Next.js surfaces as a startup failure — the process
 *    never reaches "serving traffic". This is deliberately the *only*
 *    startup-order guarantee made here: no database ping, no migration
 *    check. Whether the database is reachable is what `/api/health`
 *    answers per-request, not a one-time boot gate — a database that is
 *    temporarily down during a rolling restart should not stop the process
 *    from starting and then recovering, it should make readiness (not
 *    liveness) fail until the database comes back. See DEPLOYMENT.md's
 *    "Startup order" section for the full reasoning.
 *
 * 2. **Graceful shutdown.** `next start` (and this standalone server) already
 *    stops accepting new connections and lets in-flight ones finish on
 *    SIGTERM — that part needs nothing from this file. What Node's default
 *    behavior does not do is close the Prisma connection pool cleanly, so
 *    this adds exactly that, logged, before the process exits.
 *
 * The `NEXT_RUNTIME` check plus dynamic `import()` below is Next.js's own
 * documented pattern for keeping Node-only code out of the Edge build of
 * this file. Turbopack's build output still prints "Node.js API/module ...
 * not supported in the Edge Runtime" warnings for the modules reached this
 * way (Prisma, `process.on`) — a known, harmless over-eager diagnostic: it
 * still statically walks a dynamic import's target for this warning even
 * though the `if` above means that code never actually runs under
 * `NEXT_RUNTIME !== "nodejs"`. The build succeeds; nothing here is broken.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { env } = await import("@/config/env");
  const { logger } = await import("@/lib/logger");
  const { prisma } = await import("@/lib/db");

  const log = logger.child({ module: "startup" });
  log.info("Application starting", {
    nodeEnv: env.NODE_ENV,
    logLevel: env.LOG_LEVEL,
    sessionTtlDays: env.SESSION_TTL_DAYS,
  });

  let shuttingDown = false;

  async function shutdown(signal: string): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;

    log.info("Shutting down", { signal });
    try {
      await prisma.$disconnect();
      log.info("Database connections closed");
    } catch (error) {
      log.error("Error while closing database connections", { err: error });
    }
    process.exit(0);
  }

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}
