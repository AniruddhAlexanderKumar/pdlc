/**
 * Next.js's own server lifecycle hook — not a custom process manager, just
 * the one function Next.js already calls once when the server process
 * starts. Two things happen here, both Node-runtime only (this file loads
 * under every runtime Next.js builds for the app, including Edge if
 * anything ever opts into it — `proxy.ts` itself defaults to the Node.js
 * runtime since Next.js 16, but nothing guarantees that stays true forever,
 * so the guard below stays):
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
 * The Node-only body lives in `instrumentation-node.ts`, imported inside an
 * `if (NEXT_RUNTIME === "nodejs")` block — Next's own documented pattern
 * (node_modules/next/dist/docs/.../guides/instrumentation.md). Webpack
 * inlines `process.env.NEXT_RUNTIME` per build, so in the Edge build that
 * branch is a constant `false` and the import is never followed. An earlier
 * early-`return` guard with the imports after it did not get that
 * treatment: webpack followed them into Prisma and `pg` for the Edge build
 * and failed on `fs`.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNode } = await import("./instrumentation-node");
    registerNode();
  }
}
