// Disposable local database only: this test creates and deletes synthetic rows.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';

const url = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/invalid');
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/founders_bootstrap_test' || process.env.NODE_ENV !== 'test') {
  throw new Error('Use NODE_ENV=test and a disposable localhost database named founders_bootstrap_test');
}
const { db } = await import('../src/db/index.js');
const { migrateToLatest } = await import('../src/db/migrate.js');
const { bootstrapFounder, INITIAL_FOUNDER_EMAIL } = await import('../src/auth/founder-bootstrap.js');
const { verifyPassword } = await import('../src/auth/crypto.js');
const { sql } = await import('kysely');
const submittedSecret = randomBytes(32).toString('base64url');
const initialPassword = `Synthetic-${randomBytes(24).toString('base64url')}`;
const expectedSecretSha256 = createHash('sha256').update(submittedSecret).digest('hex');
const input = { submittedSecret, expectedSecretSha256, initialPassword, name: 'Synthetic owner' };

try {
  await migrateToLatest(() => {});
  assert.equal(await bootstrapFounder(db, { ...input, submittedSecret: randomBytes(32).toString('base64url') }), 'denied');
  assert.equal((await db.selectFrom('founder_accounts').selectAll().execute()).length, 0);
  const existing = await db.insertInto('users').values({ email: INITIAL_FOUNDER_EMAIL, name: 'Synthetic ordinary account', password_hash: '!', last_login_at: null }).returning('id').executeTakeFirstOrThrow();
  assert.equal(await bootstrapFounder(db, input), 'denied');
  await db.deleteFrom('users').where('id', '=', existing.id).execute();
  await sql`CREATE FUNCTION founder_fixture_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$`.execute(db);
  await sql`CREATE TRIGGER founder_fixture_fail BEFORE INSERT ON founder_accounts FOR EACH ROW EXECUTE FUNCTION founder_fixture_fail()`.execute(db);
  await assert.rejects(bootstrapFounder(db, input), { message: 'Founder bootstrap failed' });
  assert.equal((await db.selectFrom('founder_accounts').selectAll().execute()).length, 0);
  assert.equal((await db.selectFrom('founder_bootstrap_state').selectAll().executeTakeFirstOrThrow()).consumed_at, null);
  await sql`DROP TRIGGER founder_fixture_fail ON founder_accounts`.execute(db);
  await sql`DROP FUNCTION founder_fixture_fail()`.execute(db);
  await sql`CREATE FUNCTION founder_fixture_audit_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.outcome = 'success' THEN RAISE EXCEPTION 'synthetic audit failure'; END IF; RETURN NEW; END $$`.execute(db);
  await sql`CREATE TRIGGER founder_fixture_audit_fail BEFORE INSERT ON founder_security_audit FOR EACH ROW EXECUTE FUNCTION founder_fixture_audit_fail()`.execute(db);
  await assert.rejects(bootstrapFounder(db, input), { message: 'Founder bootstrap failed' });
  assert.equal((await db.selectFrom('founder_accounts').selectAll().execute()).length, 0);
  assert.equal((await db.selectFrom('founder_bootstrap_state').selectAll().executeTakeFirstOrThrow()).consumed_at, null);
  await sql`DROP TRIGGER founder_fixture_audit_fail ON founder_security_audit`.execute(db);
  await sql`DROP FUNCTION founder_fixture_audit_fail()`.execute(db);
  const outcomes = await Promise.all([bootstrapFounder(db, input), bootstrapFounder(db, input), bootstrapFounder(db, input)]);
  assert.deepEqual(outcomes.sort(), ['created', 'denied', 'denied']);
  assert.equal(await bootstrapFounder(db, input), 'denied');
  const accounts = await db.selectFrom('founder_accounts').selectAll().execute();
  assert.equal(accounts.length, 1);
  assert.equal(accounts[0].email, INITIAL_FOUNDER_EMAIL);
  assert.equal(accounts[0].role, 'owner');
  assert.equal(accounts[0].status, 'pending');
  assert.equal(accounts[0].password_rotation_required, true);
  assert.equal(accounts[0].mfa_enrolled_at, null);
  assert(!JSON.stringify(accounts).includes(initialPassword));
  assert(await verifyPassword(initialPassword, accounts[0].password_hash));
  const state = await db.selectFrom('founder_bootstrap_state').selectAll().executeTakeFirstOrThrow();
  assert(state.consumed_at);
  assert.equal(state.founder_id, accounts[0].id);
  await assert.rejects(db.updateTable('founder_accounts').set({ status: 'active' }).where('id', '=', accounts[0].id).execute());
  const audit = await db.selectFrom('founder_security_audit').selectAll().execute();
  assert.equal(audit.length, 8);
  assert.equal(audit.filter((e) => e.outcome === 'success').length, 1);
  assert.equal(audit.filter((e) => e.outcome === 'failure').length, 2);
  assert.equal(new Set(audit.map((e) => e.request_id)).size, audit.length);
  assert(!JSON.stringify(audit).includes(initialPassword));
  assert(!JSON.stringify(audit).includes(submittedSecret));
  assert(!JSON.stringify(audit).includes(expectedSecretSha256));
  await assert.rejects(db.updateTable('founder_security_audit').set({ outcome: 'failure' }).execute());
  await assert.rejects(db.deleteFrom('founder_security_audit').execute());
  await assert.rejects(sql`TRUNCATE founder_security_audit`.execute(db));
  console.log('PASS isolated bootstrap: invalid secret, collision, concurrency, consumed state, password hash, MFA activation guard and audit mutation rejection');
} finally {
  await db.destroy();
}
