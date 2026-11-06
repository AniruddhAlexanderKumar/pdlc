import { createApp } from './app.js';
import { config } from './config.js';
import { db } from './db/index.js';
import { migrateToLatest, requireCurrentMigrations } from './db/migrate.js';
import { logger } from './lib/logger.js';
import { cleanupExpiredDemos } from './services/demoCleanup.js';
import { databaseErrorCode } from './auth/founder-errors.js';
import { cleanupFounderRateBuckets } from './auth/founder-rate-limit.js';

async function main() {
  // Legacy default stays unchanged. Controlled deployments may use an
  // independently privileged migration job and a read-only startup check.
  if (config.MIGRATIONS_ON_STARTUP) await migrateToLatest((msg) => logger.info(msg));
  else await requireCurrentMigrations();

  // Resume cleanup promptly after downtime, not only at the next interval.
  await cleanupExpiredDemos();
  const app = createApp();
  const server = app.listen(config.PORT, config.HOST, () => {
    logger.info(`Solution Velocity listening on http://${config.HOST}:${config.PORT} (${config.NODE_ENV})`);
  });

  // Clean up expired demos, sessions and links periodically.
  const sweep = setInterval(
    async () => {
      try {
        const now = new Date();
        await cleanupExpiredDemos(now);
        await db.deleteFrom('sessions').where('expires_at', '<', now).execute();
        await db.deleteFrom('external_review_sessions').where('expires_at', '<', now).execute();
        await db.deleteFrom('external_review_challenges').where('expires_at', '<', now).execute();
        await db.deleteFrom('password_resets').where('expires_at', '<', now).execute();
        // Only the non-production founder experiment uses these buckets today.
        if (config.FOUNDER_AUTH_EXPERIMENTAL && !config.isProd) await cleanupFounderRateBuckets(db);
        await db
          .deleteFrom('invites')
          .where('expires_at', '<', new Date(now.getTime() - 30 * 86400_000))
          .execute();
      } catch (err) {
        const sqlState = databaseErrorCode(err);
        if (sqlState) logger.error({ category: 'database_error', sqlState }, 'cleanup failed');
        else logger.error({ err }, 'cleanup failed');
      }
    },
    15 * 60 * 1000
  );
  sweep.unref();

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close(async () => {
      await db.destroy();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  const sqlState = databaseErrorCode(err);
  // Migration errors can include database row details; never log the raw error.
  logger.fatal({ category: sqlState ? 'database_error' : 'startup_error', ...(sqlState ? { sqlState } : {}) }, 'failed to start');
  process.exit(1);
});
