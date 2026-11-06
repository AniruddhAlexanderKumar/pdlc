// Test partial 028 failure and concurrent startup against isolated local DBs.
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { sql, Kysely, PostgresDialect } from 'kysely';
import { Migrator, type Migration } from 'kysely/migration';
import pg from 'pg';
const url = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/invalid');
if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/founders_migration_partial_test') throw Error('Requires disposable local founders_migration_partial_test DB');
const directory = fileURLToPath(new URL('../src/db/migrations/', import.meta.url));
const migrations: Record<string, Migration> = {};
for (const file of await readdir(directory)) if (/^\d{3}_.+\.ts$/.test(file)) migrations[file.slice(0, -3)] = await import(pathToFileURL(path.join(directory, file)).href);
const connect = (url: string) => {
  const pool = new pg.Pool({ connectionString: url });
  // Fault injection intentionally terminates a backend; suppress only the
  // fixture client's duplicate socket event, not the migration rejection.
  pool.on('connect', (client) => client.on('error', () => {}));
  return new Kysely<unknown>({ dialect: new PostgresDialect({ pool }) });
};
const migrator = (db: Kysely<unknown>) => new Migrator({ db, provider: { getMigrations: async () => migrations } });
const partial = connect(url.toString());
url.pathname = '/founders_migration_concurrent_test'; const one = connect(url.toString()), two = connect(url.toString());
url.pathname = '/founders_migration_interrupted_test'; const interrupted = connect(url.toString()), terminator = connect(url.toString());
try {
  const m = migrator(partial);
  assert.equal((await m.migrateTo('027_founder_identity_foundation')).error, undefined);
  await sql`CREATE TABLE founder_sessions (fixture integer)`.execute(partial);
  assert((await m.migrateToLatest()).error);
  const result = await sql<{ flows: string | null; has_totp: boolean }>`SELECT to_regclass('founder_auth_flows')::text AS flows, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='founder_accounts' AND column_name='totp_ciphertext') AS has_totp`.execute(partial);
  assert.equal(result.rows[0].flows, null); assert.equal(result.rows[0].has_totp, false);
  await sql`DROP TABLE founder_sessions`.execute(partial);
  assert.equal((await m.migrateToLatest()).error, undefined);
  const [a, b] = await Promise.all([migrator(one).migrateToLatest(), migrator(two).migrateToLatest()]);
  assert.equal(a.error, undefined); assert.equal(b.error, undefined);
  const records = await sql<{ name: string; count: number }>`SELECT name, count(*)::int AS count FROM kysely_migration GROUP BY name`.execute(one);
  for (const name of ['027_founder_identity_foundation', '028_founder_auth_foundation', '029_founder_rate_limits', '030_founder_audit_validation']) assert.equal(records.rows.find((r) => r.name === name)?.count, 1);
  assert.equal((await migrator(interrupted).migrateTo('027_founder_identity_foundation')).error, undefined);
  let announce!: (pid: number) => void;
  const started = new Promise<number>((resolve) => { announce = resolve; });
  const original028 = migrations['028_founder_auth_foundation'];
  const slowMigrations = { ...migrations, '028_founder_auth_foundation': { up: async (trx: Kysely<unknown>) => {
    await original028.up(trx);
    const pid = await sql<{ pid: number }>`SELECT pg_backend_pid() AS pid`.execute(trx);
    const waiting = sql`SELECT pg_sleep(30)`.execute(trx);
    // Let the query reach the backend before terminating it, so pg can deliver
    // the connection failure to the pending query rather than an idle client.
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
    announce(pid.rows[0].pid);
    await waiting;
  }, down: original028.down } };
  const slow = new Migrator({ db: interrupted, provider: { getMigrations: async () => slowMigrations } }).migrateToLatest();
  const pid = await started;
  const killed = await sql<{ terminated: boolean }>`SELECT pg_terminate_backend(${pid}) AS terminated`.execute(terminator);
  assert(killed.rows[0].terminated);
  assert((await slow).error);
  const afterDisconnect = await sql<{ flows: string | null; has_totp: boolean }>`SELECT to_regclass('founder_auth_flows')::text AS flows, EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='founder_accounts' AND column_name='totp_ciphertext') AS has_totp`.execute(terminator);
  assert.equal(afterDisconnect.rows[0].flows, null); assert.equal(afterDisconnect.rows[0].has_totp, false);
  assert.equal((await migrator(terminator).migrateToLatest()).error, undefined);
  console.log('PASS 028 partial-failure and terminated-connection rollback/retry; concurrent clean-database migrations serialize');
} finally { await partial.destroy(); await one.destroy(); await two.destroy(); await interrupted.destroy(); await terminator.destroy(); }
