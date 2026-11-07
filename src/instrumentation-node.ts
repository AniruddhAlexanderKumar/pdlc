import { env } from "@/config/env";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * The Node-runtime half of `instrumentation.ts` — see that file for what
 * this does and why it lives in its own module.
 */
export function registerNode(): void {
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
