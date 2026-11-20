import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import type { Server } from 'node:http';

// The origin check runs before session loading, so no database is consulted on
// a rejected request. A deliberately unreachable database proves that: a
// request that gets past the middleware fails later, with a 500 (or a 400 for
// an empty body), never with the origin error.
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgres://test:test@127.0.0.1:1/disposable';
process.env.APP_URL = 'https://velocity.example.com';
const { createApp } = await import('../app.js');

let server: Server;
let port = 0;
before(async () => {
  server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('No test address');
  port = address.port;
});
after(async () => {
  await new Promise<void>((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
});

/**
 * Sends exactly the headers given, over raw HTTP, so `Host` and
 * `X-Forwarded-Host` can be controlled the way a browser and a proxy set them.
 * Returns the status and error text. 403 with "Cross-origin request blocked"
 * is the middleware rejecting the request; anything else means it passed.
 */
function send(method: string, path: string, headers: Record<string, string>, body?: string) {
  return new Promise<{ status: number; error?: string }>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, method, path, headers: { connection: 'close', ...headers } }, (res) => {
      let raw = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        let error: string | undefined;
        try {
          error = (JSON.parse(raw) as { error?: string }).error;
        } catch {
          error = undefined;
        }
        resolve({ status: res.statusCode ?? 0, error });
      });
    });
    req.on('error', reject);
    req.end(body);
  });
}

const login = (headers: Record<string, string>, host = 'velocity.example.com') =>
  send('POST', '/api/auth/login', { host, 'content-type': 'application/json', ...headers }, JSON.stringify({ email: 'someone@example.com', password: 'not-checked-here1' }));

const blocked = (res: { status: number; error?: string }) => {
  assert.equal(res.status, 403);
  assert.equal(res.error, 'Cross-origin request blocked');
};

test('a genuinely cross-site request is rejected', async () => {
  for (const origin of ['https://evil.example', 'https://velocity.example.com.evil.example', 'http://velocity.example.com', 'https://velocity.example.com:8443']) {
    blocked(await login({ origin, 'sec-fetch-site': 'cross-site' }));
    blocked(await login({ origin, 'sec-fetch-site': 'same-site' }));
  }
});

test('a request from the configured public URL is accepted', async () => {
  const res = await login({ origin: 'https://velocity.example.com', 'sec-fetch-site': 'same-origin' });
  assert.notEqual(res.status, 403);
});

test('a same-origin request from another address this deployment is served on is accepted', async () => {
  // A reverse proxy, a preview host, the Vite dev server or an alternate
  // hostname: the browser's Origin is the address it was opened on, and the
  // same address arrives as Host. That is same-origin for the browser.
  const cases: Array<[origin: string, host: string]> = [
    ['https://preview-5173.sandbox.example', 'preview-5173.sandbox.example'],
    ['http://localhost:5173', 'localhost:5173'],
    ['https://www.velocity.example.com', 'www.velocity.example.com'],
    ['http://localhost:4000', 'localhost:4000']
  ];
  for (const [origin, host] of cases) {
    const res = await login({ origin, 'sec-fetch-site': 'same-origin' }, host);
    assert.notEqual(res.status, 403, origin);
  }
});

test('X-Forwarded-Host alone does not widen the check', async () => {
  // TRUST_PROXY is a hop count, not a list of trusted addresses, so any direct
  // client could set this header. It must not make an unrelated origin valid.
  blocked(await login({ origin: 'https://app.example.org', 'sec-fetch-site': 'same-origin', 'x-forwarded-host': 'app.example.org' }, 'internal:4000'));
});

test('a forged Origin that does not match the delivered host is rejected', async () => {
  // Only a script on the application's own pages can claim same-origin, and the
  // header is browser-controlled. A page on another site cannot produce it.
  blocked(await login({ origin: 'https://attacker.example', 'sec-fetch-site': 'same-origin' }));
});

test('the scheme and port have to match the address the request was delivered for', async () => {
  // A non-default port is a different origin from the default, and https on a
  // host is a different origin from http on it.
  blocked(await login({ origin: 'https://app.example.org', 'sec-fetch-site': 'same-origin' }, 'app.example.org:5173'));
  blocked(await login({ origin: 'http://app.example.org:5173', 'sec-fetch-site': 'same-origin' }, 'app.example.org'));
  blocked(await login({ origin: 'https://app.example.org:8443', 'sec-fetch-site': 'same-origin' }, 'app.example.org:5173'));
});

test('a default port written out explicitly is the same origin', async () => {
  // Browsers omit the default port from Origin but may keep it in Host.
  const res = await login({ origin: 'https://velocity.example.com', 'sec-fetch-site': 'same-origin' }, 'velocity.example.com:443');
  assert.notEqual(res.status, 403);
  const http = await login({ origin: 'http://velocity.example.com', 'sec-fetch-site': 'same-origin' }, 'velocity.example.com:80');
  assert.notEqual(http.status, 403);
});

test('a Referer from the deployment is accepted when Origin is absent', async () => {
  const res = await login({ referer: 'https://velocity.example.com/projects', 'sec-fetch-site': 'same-origin' });
  assert.notEqual(res.status, 403);
  blocked(await login({ referer: 'https://evil.example/projects' }));
});

test('a state-changing request from something that looks like a browser but sends no Origin is rejected', async () => {
  // Every browser sends Sec-Fetch-Site and Origin for state-changing requests.
  // Neither is present, so this is not a browser flow that can hold a cookie.
  blocked(await login({ 'sec-fetch-site': 'same-origin' }));
});

test('non-browser clients without these headers still work', async () => {
  // curl and scripts send neither header; they also cannot hold a victim's cookie.
  const res = await send('POST', '/api/auth/login', { host: 'velocity.example.com', 'content-type': 'application/json' }, JSON.stringify({ email: 'someone@example.com', password: 'not-checked-here1' }));
  assert.notEqual(res.status, 403);
});

test('safe methods are never blocked by the origin check', async () => {
  // GET /auth/me with no cookie is rejected by the session layer, not by the
  // origin check — the cross-site Origin here must not matter.
  const res = await send('GET', '/api/auth/me', { host: 'velocity.example.com', origin: 'https://evil.example' });
  assert.equal(res.status, 401);
});
