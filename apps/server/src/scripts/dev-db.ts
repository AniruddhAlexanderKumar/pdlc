/**
 * Local development database: a real PostgreSQL server run from node_modules,
 * so you don't need Docker or a system install. Data lives in .data/postgres.
 *
 *   npm run dev:db      # leave running in its own terminal
 *
 * Connection string: postgres://velocity:velocity@localhost:5433/velocity
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');
const dataDir = path.join(root, '.data', 'postgres');
const port = Number(process.env.DEV_DB_PORT ?? 5433);

const pg = new EmbeddedPostgres({ databaseDir: dataDir, user: 'velocity', password: 'velocity', port, persistent: true });

const fresh = !existsSync(path.join(dataDir, 'PG_VERSION'));
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase('velocity');

console.log(`Dev Postgres running → postgres://velocity:velocity@localhost:${port}/velocity  (Ctrl+C to stop)`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
