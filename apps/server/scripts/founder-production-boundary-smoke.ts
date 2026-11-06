// Production-mode boundary only on a disposable localhost URL; never a deployment.
import assert from 'node:assert/strict';
const url = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/invalid');
if (process.env.NODE_ENV !== 'test' || url.hostname !== '127.0.0.1' || url.pathname !== '/founders_production_boundary_test') throw Error('Requires disposable localhost founders_production_boundary_test DB');
process.env.NODE_ENV = 'production'; process.env.FOUNDER_AUTH_EXPERIMENTAL = 'true'; process.env.FOUNDER_MANAGEMENT_EXPERIMENTAL = 'true'; process.env.APP_URL = 'https://localhost';
const { createApp } = await import('../src/app.js');
const { db } = await import('../src/db/index.js');
const server = createApp().listen(0, '127.0.0.1');
await new Promise<void>((resolve) => server.once('listening', resolve));
try {
  const address = server.address(); if (!address || typeof address === 'string') throw Error('No port');
  for (const path of ['/login', '/mfa/setup', '/mfa/verify', '/password/rotate', '/recovery', '/accounts', '/customers', '/organizations', '/me']) {
    const response: Response = await fetch(`http://127.0.0.1:${address.port}/api/founders${path}`, { method: 'POST', headers: { origin: 'https://localhost', 'content-type': 'application/json' }, body: '{}' });
    assert.equal(response.status, 404); assert.equal(response.headers.get('cache-control'), 'no-store');
  }
  console.log('PASS production-mode founder API deny-all even with experimental flag enabled');
} finally { await new Promise<void>((resolve, reject) => server.close((e) => e ? reject(e) : resolve())); await db.destroy(); }
