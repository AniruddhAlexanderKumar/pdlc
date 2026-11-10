import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';

// The boundary must not consult the ordinary session store, even for a malformed
// cookie. An intentionally unreachable DB also makes an accidental lookup fail.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:1/disposable';
const { createApp } = await import('../app.js');
let server: Server;
let base: string;
before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test address');
  base = `http://127.0.0.1:${address.port}`;
});
after(async () => { await new Promise<void>((resolve, reject) => server.close((err) => err ? reject(err) : resolve())); });

test('founder API namespace is closed for all methods and ordinary cookies', async () => {
  for (const path of ['/api/founders', '/api/founders/', '/api/founders/login', '/api/founders/accounts/123', '/api/FOUNDERS/overview?test=1', '/api/founders-console', '/api/founders-console/organizations', '/api/founders-console/users/123', '/api/FOUNDERS-CONSOLE/settings']) {
    for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']) {
      for (const cookie of ['', 'sv_session=an-ordinary-session-token-that-is-long-enough', '__Host-sv_session=an-ordinary-session-token-that-is-long-enough']) {
        const res = await fetch(base + path, { method, headers: { ...(cookie ? { cookie } : {}), origin: 'https://untrusted.example' } });
        assert.equal(res.status, 404, `${method} ${path}`);
        assert.equal(res.headers.get('cache-control'), 'no-store');
        assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
        assert.deepEqual(await res.json(), { error: 'Not found' });
      }
    }
  }
});

test('reservation does not intercept similarly named API paths', async () => {
  const res = await fetch(base + '/api/founders-extra');
  assert.equal(res.status, 404);
  assert.notEqual(res.headers.get('cache-control'), 'no-store');
});
