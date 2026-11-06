// Test the unexposed recovery primitive against a disposable local DB only.
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
const url = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/invalid');
if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/founders_recovery_test') throw Error('Requires NODE_ENV=test and disposable local founders_recovery_test DB');
const { db } = await import('../src/db/index.js');
const { migrateToLatest } = await import('../src/db/migrate.js');
const { hashPassword, newToken } = await import('../src/auth/crypto.js');
const { newFounderTotp, encryptFounderTotp } = await import('../src/auth/founder-mfa.js');
const { createFounderRecovery, completeFounderRecovery } = await import('../src/auth/founder-recovery.js');
const { founderPasswordStep } = await import('../src/auth/founder-auth.js');
const key = randomBytes(32);
const oldPassword = `Synthetic-${randomBytes(24).toString('base64url')}`;
const newPassword = `Rotated-${randomBytes(24).toString('base64url')}`;
const now = new Date();
try {
  await migrateToLatest(() => {});
  const insert = async (role: 'owner' | 'admin') => {
    const email = `${randomUUID()}@example.test`, id = randomUUID();
    const secret = newFounderTotp(email).secret;
    return db.insertInto('founder_accounts').values({ id, name: 'Synthetic', email, password_hash: await hashPassword(oldPassword), role, status: 'active', password_rotation_required: false, mfa_enrolled_at: now, totp_ciphertext: encryptFounderTotp(secret, id, key), last_login_at: null, last_failed_login_at: null, password_changed_at: now, locked_until: null }).returningAll().executeTakeFirstOrThrow();
  };
  const owner = await insert('owner'), admin = await insert('admin');
  assert.equal(await createFounderRecovery(db, owner.id, now), null);
  const session = newToken();
  await db.insertInto('founder_sessions').values({ token_hash: session.hash, founder_id: admin.id, session_version: admin.session_version, idle_expires_at: new Date(now.getTime() + 30 * 60_000), absolute_expires_at: new Date(now.getTime() + 3600_000) }).execute();
  const previous = await createFounderRecovery(db, admin.id, now); assert(previous);
  const current = await createFounderRecovery(db, admin.id, now); assert(current);
  assert.equal(await completeFounderRecovery(db, previous, newPassword, now), false);
  assert.equal(await completeFounderRecovery(db, current, newPassword, new Date(now.getTime() + 21 * 60_000)), false);
  const outcomes = await Promise.all([completeFounderRecovery(db, current, newPassword, now), completeFounderRecovery(db, current, newPassword, now)]);
  assert.deepEqual(outcomes.sort(), [false, true]);
  assert.equal(await completeFounderRecovery(db, current, newPassword, now), false);
  assert.equal((await db.selectFrom('founder_sessions').selectAll().where('founder_id', '=', admin.id).execute()).length, 0);
  const passwordStep = await founderPasswordStep(db, admin.email, newPassword, now);
  assert(passwordStep && passwordStep.stage === 'verify');
  const audit = JSON.stringify(await db.selectFrom('founder_security_audit').selectAll().execute());
  for (const value of [oldPassword, newPassword, previous, current, session.token]) assert(!audit.includes(value));
  console.log('PASS unexposed recovery primitive: owner excluded, invalidation, expiry, single-use under concurrency, session revocation and MFA still required');
} finally { await db.destroy(); }
