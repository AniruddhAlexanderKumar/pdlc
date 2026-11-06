// Runs its own isolated local PostgreSQL cluster. Never connects to production.
// Logs are captured in memory; never print raw PostgreSQL errors or log contents.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import express from 'express';
import { Kysely, PostgresDialect } from 'kysely';
import pg from 'pg';
import { founderErrorHandler, founderRequestContext } from '../src/auth/founder-errors.js';
import * as m027 from '../src/db/migrations/027_founder_identity_foundation.js';
import * as m028 from '../src/db/migrations/028_founder_auth_foundation.js';

const modulePath = process.env.FOUNDER_TEST_PG17_MODULE;
if (!modulePath?.startsWith('/')) throw Error('Set FOUNDER_TEST_PG17_MODULE to a local embedded-postgres 17 module');
const { default: EmbeddedPostgres } = await import(modulePath);
// Read exactly the postgres -c options from the checked-in Compose DB service.
const compose = await readFile(new URL('../../../docker-compose.yml', import.meta.url), 'utf8');
const dbSection = compose.split('  db:\n')[1]?.split('\n  app:')[0];
const block = dbSection?.match(/\n    command:\n([\s\S]*?)\n    restart:/)?.[1];
if (!block) throw Error('Postgres command block not found');
const args = block.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('- ')).map((line) => line.slice(2).replace(/^'|'$/g, ''));
assert.equal(args.shift(), 'postgres');
assert(args.includes('log_error_verbosity=terse'));
assert(args.includes('log_parameter_max_length=0'));
assert(args.includes('log_parameter_max_length_on_error=0'));
const probe = net.createServer(); await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
const address = probe.address(); if (!address || typeof address === 'string') throw Error('No local port');
const port = address.port; await new Promise<void>((resolve, reject) => probe.close((e) => e ? reject(e) : resolve()));
const directory = await mkdtemp(path.join(os.tmpdir(), 'pdlc-founder-logging-'));
const password = randomBytes(24).toString('base64url');
const sentinel = `scrypt$SENTINEL_${randomBytes(20).toString('hex')}`;
const logs: string[] = [];
const pgServer = new EmbeddedPostgres({ databaseDir: directory, port, user: 'fixture', password, persistent: false, postgresFlags: args, onLog: (v: unknown) => logs.push(String(v)), onError: (v: unknown) => logs.push(String(v)) });
let started = false;
let db: Kysely<unknown> | undefined;
let web: ReturnType<ReturnType<typeof express>['listen']> | undefined;
const appLogs: string[] = [];
let responseText = '', requestId = '';
try {
  await pgServer.initialise(); await pgServer.start(); started = true;
  await pgServer.createDatabase('founders_logging_test');
  const pool = new pg.Pool({ host: '127.0.0.1', port, database: 'founders_logging_test', user: 'fixture', password });
  db = new Kysely<unknown>({ dialect: new PostgresDialect({ pool }) });
  await m027.up(db); await m028.up(db);
  const version = await pool.query('SHOW server_version_num');
  assert.equal(Math.floor(Number(version.rows[0].server_version_num) / 10000), 17);
  for (const [setting, expected] of Object.entries({ log_error_verbosity: 'terse', log_parameter_max_length: '0', log_parameter_max_length_on_error: '0', log_min_error_statement: 'error', log_statement: 'none', log_min_duration_statement: '-1' })) {
    const r = await pool.query('select current_setting($1) as value', [setting]);
    assert.equal(r.rows[0].value, expected, `Unexpected ${setting}`);
  }
  const inserted = await pool.query("insert into founder_accounts (name,email,password_hash,role) values ($1,$2,$3,$4) returning id", ['Synthetic', 'logging-fixture@example.test', sentinel, 'owner']);
  const app = express(); app.use(founderRequestContext);
  app.get('/probe', async (_req, res, next) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("select set_config('application_name', $1, true)", [`founder:${res.locals.founderRequestId}`]);
      await client.query("update founder_accounts set status = $1 where id = $2", ['active', inserted.rows[0].id]);
      res.status(204).end();
    } catch (err) {
      // Confirm the driver itself received the dangerous DETAIL, but never log it.
      assert.equal((err as { code?: string }).code, '23514');
      assert(String((err as { detail?: string }).detail).includes(sentinel));
      await client.query('ROLLBACK'); next(err);
    } finally { client.release(); }
  });
  app.use(founderErrorHandler({ error(fields, message) { appLogs.push(JSON.stringify({ fields, message })); } }));
  web = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => web!.once('listening', resolve));
  const addr = web.address(); if (!addr || typeof addr === 'string') throw Error('No local HTTP port');
  const response = await fetch(`http://127.0.0.1:${addr.port}/probe`);
  requestId = response.headers.get('x-request-id') ?? '';
  responseText = await response.text();
  assert.equal(response.status, 503); assert.match(requestId, /^[0-9a-f-]{36}$/);
  assert.equal(JSON.parse(responseText).requestId, requestId);
  assert(appLogs.join('').includes('23514') && appLogs.join('').includes(requestId));
} finally {
  if (web) await new Promise<void>((resolve, reject) => web!.close((e) => e ? reject(e) : resolve()));
  if (db) await db.destroy();
  if (started) await pgServer.stop();
  await rm(directory, { recursive: true, force: true });
}
const pgLog = logs.join('');
assert(!pgLog.includes(sentinel), 'Synthetic sentinel leaked to PostgreSQL logs');
assert(!appLogs.join('').includes(sentinel), 'Synthetic sentinel leaked to application logs');
assert(!responseText.includes(sentinel), 'Synthetic sentinel leaked to HTTP response');
assert(pgLog.includes('23514') && pgLog.includes(requestId), 'Postgres SQLSTATE/request correlation missing');
// This app has no configured exception/telemetry exporter. Capture of external
// collectors and real CI pipelines must be verified separately before release.
console.log('PASS PostgreSQL 17 Compose-option sentinel test: row detail absent from server/app logs and response, SQLSTATE and correlation retained');
