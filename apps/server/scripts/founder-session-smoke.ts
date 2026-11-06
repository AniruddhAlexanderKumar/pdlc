// Disposable DB test. Inserts synthetic sessions directly; this is not a login test.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';

const url = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/invalid');
if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/founders_session_test') throw Error('Requires NODE_ENV=test and disposable localhost founders_session_test DB');
const { db } = await import('../src/db/index.js');
const { migrateToLatest } = await import('../src/db/migrate.js');
const { newToken } = await import('../src/auth/crypto.js');
const { authorizeFounderInTransaction, requireFounderPermission } = await import('../src/auth/founder-session.js');
const { founderTransportGuard } = await import('../src/auth/founder-transport.js');
let server: ReturnType<ReturnType<typeof express>['listen']> | undefined;
try {
  await migrateToLatest(() => {});
  const insert = async (role: 'owner' | 'admin' | 'operations') => {
    const founder = await db.insertInto('founder_accounts').values({ name: 'Synthetic', email: `${randomUUID()}@example.test`, password_hash: 'scrypt$fixture', role, status: 'active', password_rotation_required: false, mfa_enrolled_at: new Date(), totp_ciphertext: 'synthetic ciphertext', last_login_at: null, last_failed_login_at: null, password_changed_at: new Date(), locked_until: null }).returningAll().executeTakeFirstOrThrow();
    const token = newToken();
    await db.insertInto('founder_sessions').values({ token_hash: token.hash, founder_id: founder.id, session_version: founder.session_version, idle_expires_at: new Date(Date.now() + 30 * 60_000), absolute_expires_at: new Date(Date.now() + 3600_000) }).execute();
    return { founder, token };
  };
  const owner = await insert('owner');
  const admin = await insert('admin');
  const ops = await insert('operations');
  const app = express();
  app.use(cookieParser()); app.use(founderTransportGuard('http://localhost:5173'));
  app.get('/owner', requireFounderPermission('founder.roles.manage', false), (_req, res) => res.status(204).end());
  app.get('/operations', requireFounderPermission('platform.operations.read', false), (_req, res) => res.status(204).end());
  app.post('/owner', requireFounderPermission('founder.roles.manage', false), (_req, res) => res.status(204).end());
  server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server!.once('listening', resolve));
  const addr = server.address(); if (!addr || typeof addr === 'string') throw Error('No listener');
  const req = (path: string, token?: string, method = 'GET', origin?: string) => fetch(`http://127.0.0.1:${addr.port}${path}`, { method, headers: { ...(token ? { cookie: `sv_founder_session=${token}` } : {}), ...(origin ? { origin } : {}), ...(method === 'POST' ? { 'content-type': 'application/json' } : {}) }, ...(method === 'POST' ? { body: '{}' } : {}) });
  assert.equal((await req('/owner')).status, 401);
  assert.equal((await req('/owner', owner.token.token)).status, 204);
  assert.equal((await req('/owner', admin.token.token)).status, 403);
  assert.equal((await req('/owner', ops.token.token)).status, 403);
  for (const x of [owner, admin, ops]) assert.equal((await req('/operations', x.token.token)).status, 204);
  assert.equal((await req('/owner', owner.token.token, 'POST', 'http://evil.test')).status, 403);
  assert.equal((await req('/owner', owner.token.token, 'POST', 'http://localhost:5173')).status, 204);
  assert.equal(await db.transaction().execute((trx) => authorizeFounderInTransaction(trx, admin.token.token, 'founder.roles.manage')), null);
  await db.updateTable('founder_accounts').set({ status: 'suspended' }).where('id', '=', owner.founder.id).execute();
  assert.equal((await req('/owner', owner.token.token)).status, 403);
  assert.equal((await req('/operations', ops.token.token)).status, 204);
  await db.updateTable('founder_accounts').set({ session_version: 2 }).where('id', '=', admin.founder.id).execute();
  assert.equal((await req('/operations', admin.token.token)).status, 403);
  await db.updateTable('founder_sessions').set({ idle_expires_at: new Date(Date.now() - 1000) }).where('token_hash', '=', ops.token.hash).execute();
  assert.equal((await req('/operations', ops.token.token)).status, 403);
  await db.updateTable('founder_accounts').set({ status: 'active' }).where('id', '=', owner.founder.id).execute();
  const expired = new Date(Date.now() - 1000);
  await db.updateTable('founder_sessions').set({ idle_expires_at: expired, absolute_expires_at: expired }).where('token_hash', '=', owner.token.hash).execute();
  assert.equal((await req('/owner', owner.token.token)).status, 403);
  console.log('PASS isolated founder session authorization: role checks, exact-origin CSRF, suspension, version revocation, expiry and cross-account isolation');
} finally {
  if (server) await new Promise<void>((resolve, reject) => server!.close((err) => err ? reject(err) : resolve()));
  await db.destroy();
}
