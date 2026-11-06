// This modifies a disposable local database only. Never point it at shared data.
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { sql } from 'kysely';
import { Migrator, type Migration } from 'kysely/migration';

const url = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/invalid');
if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/founders_migration_test') throw new Error('Requires the disposable local founders_migration_test database and NODE_ENV=test');
const { db } = await import('../src/db/index.js');
const { requireCurrentMigrations } = await import('../src/db/migrate.js');
const { createApp } = await import('../src/app.js');
const { newToken, hashPassword } = await import('../src/auth/crypto.js');
const directory = fileURLToPath(new URL('../src/db/migrations/', import.meta.url));
const migrations: Record<string, Migration> = {};
for (const filename of await readdir(directory)) {
  if (/^\d{3}_.+\.ts$/.test(filename)) migrations[filename.slice(0, -3)] = await import(pathToFileURL(path.join(directory, filename)).href);
}
const migrator = new Migrator({ db, provider: { getMigrations: async () => migrations } });
let server: ReturnType<ReturnType<typeof createApp>['listen']> | undefined;
try {
  const baseline = await migrator.migrateTo('026_native_sketch_documents');
  if (baseline.error) throw baseline.error;
  await assert.rejects(requireCurrentMigrations(), /migration history/);
  const user = await db.insertInto('users').values({ name: 'Synthetic', email: 'migration-fixture@example.test', password_hash: await hashPassword(`Synthetic-${crypto.randomUUID()}`), last_login_at: null }).returning('id').executeTakeFirstOrThrow();
  const workspace = await db.insertInto('workspaces').values({ name: 'Synthetic workspace' }).returning('id').executeTakeFirstOrThrow();
  await db.insertInto('memberships').values({ user_id: user.id, workspace_id: workspace.id, role: 'owner' }).execute();
  const session = newToken();
  await db.insertInto('sessions').values({ id: session.hash, user_id: user.id, workspace_id: workspace.id, expires_at: new Date(Date.now() + 3600_000), user_agent: null, ip: null }).execute();
  server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw Error('No listener');
  const me = async () => fetch(`http://127.0.0.1:${addr.port}/api/auth/me`, { headers: { cookie: `sv_session=${session.token}` } });
  assert.equal((await me()).status, 200);
  const before = await db.selectFrom('users').selectAll().where('id', '=', user.id).executeTakeFirstOrThrow();

  // A conflicting pre-existing name forces 027 to fail; its transaction must not
  // leave the bootstrap or audit tables behind and existing auth must still work.
  await sql`CREATE TABLE founder_accounts (fixture integer)`.execute(db);
  const conflict = await migrator.migrateToLatest();
  assert(conflict.error);
  const partial = await sql<{ name: string | null }>`select to_regclass('founder_bootstrap_state')::text as name`.execute(db);
  assert.equal(partial.rows[0].name, null);
  assert.equal((await me()).status, 200);
  await sql`DROP TABLE founder_accounts`.execute(db);
  const upgrade = await migrator.migrateToLatest();
  if (upgrade.error) throw upgrade.error;
  assert.deepEqual(await db.selectFrom('users').selectAll().where('id', '=', user.id).executeTakeFirstOrThrow(), before);
  assert.equal((await me()).status, 200);
  assert.equal((await migrator.migrateToLatest()).error, undefined);
  const rollback = await migrator.migrateDown();
  assert(rollback.error, 'automatic security-state rollback must fail');
  assert.equal((await me()).status, 200);
  const migrationNames = (await db.selectFrom('kysely_migration' as never).selectAll().execute()) as unknown as { name: string }[];
  assert(migrationNames.some((row) => row.name === '027_founder_identity_foundation'));
  assert(migrationNames.some((row) => row.name === '028_founder_auth_foundation'));
  assert(migrationNames.some((row) => row.name === '029_founder_rate_limits'));
  assert(migrationNames.some((row) => row.name === '030_founder_audit_validation'));
  await requireCurrentMigrations();
  await sql`INSERT INTO kysely_migration (name, timestamp) VALUES ('999_fixture_unknown', '2026-01-01T00:00:00.000Z')`.execute(db);
  await assert.rejects(requireCurrentMigrations(), /migration history/);
  await sql`DELETE FROM kysely_migration WHERE name = '999_fixture_unknown'`.execute(db);
  console.log('PASS disposable migration upgrade, failure rollback, retry, idempotence, read-only startup history check, non-destructive down and ordinary authenticated session');
} finally {
  if (server) await new Promise<void>((resolve, reject) => server!.close((e) => e ? reject(e) : resolve()));
  await db.destroy();
}
