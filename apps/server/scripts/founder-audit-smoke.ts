// Creates a synthetic role in an isolated disposable database only.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
const url = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/invalid');
if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/founders_audit_test') throw Error('Requires NODE_ENV=test and disposable localhost founders_audit_test DB');
const { db, pool } = await import('../src/db/index.js');
const { migrateToLatest } = await import('../src/db/migrate.js');
try {
  await migrateToLatest(() => {});
  await sql`CREATE ROLE founder_fixture_audit_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE`.execute(db);
  await sql`GRANT USAGE ON SCHEMA public TO founder_fixture_audit_writer`.execute(db);
  await sql`GRANT INSERT, SELECT ON founder_security_audit TO founder_fixture_audit_writer`.execute(db);
  const client = await pool.connect();
  try {
    await client.query('SET ROLE founder_fixture_audit_writer');
    const event = await client.query("INSERT INTO founder_security_audit (event_type,actor_role,outcome,request_id) VALUES ('bootstrap','system','denied',$1) RETURNING id", [randomUUID()]);
    assert(event.rows[0].id);
    for (const statement of ['UPDATE founder_security_audit SET outcome = $1', 'DELETE FROM founder_security_audit', 'TRUNCATE founder_security_audit']) {
      await assert.rejects(client.query(statement, statement.startsWith('UPDATE') ? ['failure'] : []), (e: unknown) => (e as { code?: string }).code === '42501');
    }
    await assert.rejects(client.query("INSERT INTO founder_security_audit (event_type,actor_role,outcome,request_id) VALUES ($1,'system','failure',$2)", ['not_allowed', randomUUID()]), (e: unknown) => (e as { code?: string }).code === '23514');
    await assert.rejects(client.query('ALTER TABLE founder_security_audit DISABLE TRIGGER USER'), (e: unknown) => (e as { code?: string }).code === '42501');
    await client.query('RESET ROLE');
  } finally { client.release(); }
  console.log('PASS audit privilege test: insert allowed, invalid events/update/delete/truncate/trigger changes denied to non-owner role');
} finally { await db.destroy(); }
