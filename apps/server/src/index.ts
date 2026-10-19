import { createApp } from './app.js';
import { config } from './config.js';
import { db } from './db/index.js';
import { migrateToLatest } from './db/migrate.js';
import { logger } from './lib/logger.js';

async function main() {
  // Apply pending migrations on boot. Kysely takes a lock, so several replicas can start at once.
  await migrateToLatest((msg) => logger.info(msg));

  const app = createApp();
  const server = app.listen(config.PORT, config.HOST, () => {
    logger.info(`Solution Velocity listening on http://${config.HOST}:${config.PORT} (${config.NODE_ENV})`);
  });

  // Clean up expired sessions and links every hour.
  const sweep = setInterval(
    async () => {
      try {
        const now = new Date();
        await db.deleteFrom('sessions').where('expires_at', '<', now).execute();
        await db.deleteFrom('password_resets').where('expires_at', '<', now).execute();
        await db
          .deleteFrom('invites')
          .where('expires_at', '<', new Date(now.getTime() - 30 * 86400_000))
          .execute();
      } catch (err) {
        logger.error({ err }, 'cleanup failed');
      }
    },
    60 * 60 * 1000
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
  logger.fatal({ err }, 'failed to start');
  process.exit(1);
});
