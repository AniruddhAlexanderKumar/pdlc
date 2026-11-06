// Controlled startup with a real unprivileged login on a disposable local DB.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { sql } from 'kysely';
import pg from 'pg';
const url = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/invalid');
if (process.env.NODE_ENV !== 'test' || url.hostname !== '127.0.0.1' || url.pathname !== '/founders_startup12_test') throw Error('Requires NODE_ENV=test and disposable localhost founders_startup12_test DB');
const { db } = await import('../src/db/index.js');
const { migrateToLatest } = await import('../src/db/migrate.js');
const probe = net.createServer(); await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
const addr = probe.address(); if (!addr || typeof addr === 'string') throw Error('No port'); const port = addr.port;
await new Promise<void>((resolve, reject) => probe.close((err) => err ? reject(err) : resolve()));
const baseEnv = { ...process.env, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: String(port), APP_URL: 'https://localhost', MIGRATIONS_ON_STARTUP: 'false', FOUNDER_AUTH_EXPERIMENTAL: 'true' };
let child: ChildProcess | undefined;
try {
  // A clean database must fail startup without creating migration tables.
  child = spawn(process.execPath, ['apps/server/dist/index.js'], { env: baseEnv, stdio: 'ignore' });
  assert.notEqual(await new Promise<number | null>((resolve) => child!.once('close', resolve)), 0); child = undefined;
  assert.equal((await sql<{ present: string | null }>`select to_regclass('public.kysely_migration')::text as present`.execute(db)).rows[0].present, null);
  await migrateToLatest(() => {});
  const password = randomBytes(24).toString('base64url');
  await sql`CREATE ROLE sv_fixture_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${sql.lit(password)}`.execute(db);
  await sql`REVOKE CREATE ON SCHEMA public FROM PUBLIC`.execute(db);
  await sql`GRANT USAGE ON SCHEMA public TO sv_fixture_runtime`.execute(db);
  // Test-only broad grants for ordinary app cleanup, with security tables and
  // migration metadata explicitly excluded. Not a production privilege policy.
  await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sv_fixture_runtime`.execute(db);
  await sql`REVOKE ALL ON founder_security_audit, kysely_migration, kysely_migration_lock FROM sv_fixture_runtime`.execute(db);
  await sql`GRANT SELECT ON kysely_migration TO sv_fixture_runtime`.execute(db);
  const login = new pg.Client({ host: url.hostname, port: Number(url.port), database: url.pathname.slice(1), user: 'sv_fixture_runtime', password }); await login.connect();
  try {
    const denied = (e: unknown) => (e as { code?: string }).code === '42501';
    await assert.rejects(login.query('CREATE TABLE public.sv_escalation (id integer)'), denied);
    await assert.rejects(login.query('DELETE FROM kysely_migration'), denied);
    await assert.rejects(login.query('DELETE FROM founder_security_audit'), denied);
  } finally { await login.end(); }
  const runtimeUrl = new URL(url); runtimeUrl.username = 'sv_fixture_runtime'; runtimeUrl.password = password;
  child = spawn(process.execPath, ['apps/server/dist/index.js'], { env: { ...baseEnv, DATABASE_URL: runtimeUrl.toString() }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('startup timeout')), 15000);
    const data = (v: Buffer) => { output += v.toString(); if (output.includes('Solution Velocity listening')) { clearTimeout(timer); resolve(); } };
    child!.stdout!.on('data', data); child!.stderr!.on('data', data);
    child!.once('error', reject); child!.once('exit', (code) => { if (!output.includes('Solution Velocity listening')) reject(Error(`runtime exited ${code}`)); });
  });
  assert(!output.includes(password)); assert(!output.includes('migration 027_founder_identity_foundation applied'));
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/health`)).status, 200);
  assert.equal((await fetch(`http://127.0.0.1:${port}/api/founders/login`, { method: 'POST' })).status, 404);
  console.log('PASS controlled production-mode startup: clean DB fails without DDL; separately migrated DB starts with restricted runtime login and founder namespace denied');
} finally {
  if (child && child.exitCode === null) { child.kill('SIGTERM'); await new Promise<void>((resolve) => child!.once('close', () => resolve())); }
  await db.destroy();
}
