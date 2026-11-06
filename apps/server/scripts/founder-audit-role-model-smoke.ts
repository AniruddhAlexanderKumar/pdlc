// Disposable PostgreSQL role-model rehearsal. Never use these role names in production.
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { sql, Kysely, PostgresDialect } from 'kysely';
import type { Database } from '../src/db/schema.js';
import pg from 'pg';
const url = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/invalid');
if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/founders_audit_roles_test') throw Error('Requires NODE_ENV=test and disposable localhost founders_audit_roles_test DB');
const { db, pool } = await import('../src/db/index.js');
const { migrateToLatest } = await import('../src/db/migrate.js');
const { provisionFounderAuditRoles } = await import('../src/auth/founder-audit-roles.js');
const { bootstrapFounder } = await import('../src/auth/founder-bootstrap.js');
const { founderPasswordStep } = await import('../src/auth/founder-auth.js');
try {
  await migrateToLatest(() => {});
  await sql`CREATE ROLE sv_fixture_audit_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`.execute(db);
  await sql`CREATE ROLE sv_fixture_audit_writer NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`.execute(db);
  await sql`CREATE ROLE sv_fixture_audit_reader NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`.execute(db);
  const appPassword = randomBytes(24).toString('base64url');
  const readerPassword = randomBytes(24).toString('base64url');
  await sql`CREATE ROLE sv_fixture_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${sql.lit(appPassword)}`.execute(db);
  await sql`CREATE ROLE sv_fixture_observer LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${sql.lit(readerPassword)}`.execute(db);
  await sql`GRANT sv_fixture_audit_reader TO sv_fixture_observer`.execute(db);
  await sql`REVOKE CREATE ON SCHEMA public FROM PUBLIC, sv_fixture_app, sv_fixture_audit_writer, sv_fixture_audit_reader`.execute(db);
  await sql`GRANT USAGE ON SCHEMA public TO sv_fixture_app, sv_fixture_audit_writer, sv_fixture_audit_reader`.execute(db);
  const roles = { owner: 'sv_fixture_audit_owner', writer: 'sv_fixture_audit_writer', reader: 'sv_fixture_audit_reader', app: 'sv_fixture_app' };
  await sql`CREATE ROLE sv_fixture_unexpected NOLOGIN`.execute(db);
  await sql`GRANT SELECT ON founder_security_audit TO sv_fixture_unexpected`.execute(db);
  await assert.rejects(provisionFounderAuditRoles(db, roles), /Unexpected existing audit grants/);
  await sql`REVOKE ALL ON founder_security_audit FROM sv_fixture_unexpected`.execute(db);
  await sql`GRANT sv_fixture_audit_owner TO sv_fixture_app`.execute(db);
  await assert.rejects(provisionFounderAuditRoles(db, roles), /Unsafe inherited audit privileges/);
  await sql`REVOKE sv_fixture_audit_owner FROM sv_fixture_app`.execute(db);
  await sql`GRANT pg_write_all_data TO sv_fixture_app`.execute(db);
  await assert.rejects(provisionFounderAuditRoles(db, roles), /Effective audit rights exceed/);
  await sql`REVOKE pg_write_all_data FROM sv_fixture_app`.execute(db);
  await provisionFounderAuditRoles(db, roles);
  await sql`GRANT SELECT, INSERT, UPDATE, DELETE ON users, founder_accounts, founder_bootstrap_state, founder_auth_flows, founder_sessions, founder_recovery_codes, founder_password_recoveries, founder_rate_limits TO sv_fixture_app`.execute(db);
  const appDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool: new pg.Pool({ host: url.hostname, port: Number(url.port), database: url.pathname.slice(1), user: 'sv_fixture_app', password: appPassword }) }) });
  const client = new pg.Client({ host: url.hostname, port: Number(url.port), database: url.pathname.slice(1), user: 'sv_fixture_app', password: appPassword });
  const reader = new pg.Client({ host: url.hostname, port: Number(url.port), database: url.pathname.slice(1), user: 'sv_fixture_observer', password: readerPassword });
  await client.connect(); await reader.connect();
  const denied = (error: unknown) => (error as { code?: string }).code === '42501';
  try {
    await client.query("INSERT INTO founder_security_audit (event_type, actor_role, outcome, request_id) VALUES ('bootstrap','system','denied',$1)", [randomUUID()]);
    for (const statement of [
      'SELECT * FROM founder_security_audit',
      "UPDATE founder_security_audit SET outcome = 'failure'",
      'DELETE FROM founder_security_audit', 'TRUNCATE founder_security_audit',
      'ALTER TABLE founder_security_audit DISABLE TRIGGER USER',
      'GRANT DELETE ON founder_security_audit TO sv_fixture_app',
      'GRANT sv_fixture_audit_owner TO sv_fixture_app',
      'SET ROLE sv_fixture_audit_owner',
      'CREATE TABLE public.sv_fixture_escalation (id integer)',
      "INSERT INTO founder_security_audit (id, event_type, actor_role, outcome, request_id) VALUES (gen_random_uuid(),'bootstrap','system','denied',gen_random_uuid())"
    ]) await assert.rejects(client.query(statement), denied, `Expected denial: ${statement}`);
    assert.equal((await reader.query('SELECT count(*)::int AS n FROM founder_security_audit')).rows[0].n, 1);
    await assert.rejects(reader.query("INSERT INTO founder_security_audit (event_type,actor_role,outcome,request_id) VALUES ('bootstrap','system','denied',gen_random_uuid())"), denied);
    await assert.rejects(reader.query('DELETE FROM founder_security_audit'), denied);
    const secret = randomBytes(32).toString('base64url');
    const password = `Synthetic-${randomBytes(24).toString('base64url')}`;
    assert.equal(await bootstrapFounder(appDb, { submittedSecret: secret, expectedSecretSha256: createHash('sha256').update(secret).digest('hex'), initialPassword: password, name: 'Synthetic' }), 'created');
    assert.equal(await founderPasswordStep(appDb, 'f5manmission@sv.com', 'incorrect'), null);
    assert.equal((await founderPasswordStep(appDb, 'f5manmission@sv.com', password))?.stage, 'enroll');
    assert.equal((await reader.query('SELECT count(*)::int AS n FROM founder_security_audit')).rows[0].n, 4);
    // Simulate an audit outage inside an operational transaction. The associated
    // security mutation must roll back rather than commit without its audit event.
    const founder = await pool.query("INSERT INTO founder_accounts (name,email,password_hash,role) VALUES ('Fixture','fixture@example.test','scrypt$fixture','owner') RETURNING id");
    await pool.query('REVOKE INSERT (event_type, actor_id, actor_role, target_id, outcome, request_id) ON founder_security_audit FROM sv_fixture_audit_writer');
    const beforeFailure = (await pool.query("SELECT failed_logins FROM founder_accounts WHERE email = 'f5manmission@sv.com'")).rows[0].failed_logins;
    await assert.rejects(founderPasswordStep(appDb, 'f5manmission@sv.com', 'incorrect'), denied);
    assert.equal((await pool.query("SELECT failed_logins FROM founder_accounts WHERE email = 'f5manmission@sv.com'")).rows[0].failed_logins, beforeFailure);
    await client.query('BEGIN');
    await client.query("UPDATE founder_accounts SET name='Changed' WHERE id=$1", [founder.rows[0].id]);
    await assert.rejects(client.query("INSERT INTO founder_security_audit (event_type,actor_role,outcome,request_id) VALUES ('bootstrap','system','success',$1)", [randomUUID()]), denied);
    await client.query('ROLLBACK');
    assert.equal((await pool.query('SELECT name FROM founder_accounts WHERE id=$1', [founder.rows[0].id])).rows[0].name, 'Fixture');
  } finally { await client.end(); await reader.end(); await appDb.destroy(); }
  console.log('PASS isolated audit owner/writer/reader/app role rehearsal: insert-only, read-only, mutation and escalation denied, security transaction rolled back on audit failure');
} finally { await db.destroy(); }
