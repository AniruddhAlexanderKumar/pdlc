// Real experimental app logger, CLI and HTTP responses. Local synthetic data only.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawn, type ChildProcess } from 'node:child_process';
import net from 'node:net';
import { sql } from 'kysely';
const url = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/invalid');
if (process.env.NODE_ENV !== 'test' || url.hostname !== '127.0.0.1' || url.pathname !== '/founders_logging12_test') throw Error('Requires NODE_ENV=test and disposable localhost founders_logging12_test DB');
const { db } = await import('../src/db/index.js');
const { migrateToLatest } = await import('../src/db/migrate.js');
const { bootstrapFounder, INITIAL_FOUNDER_EMAIL } = await import('../src/auth/founder-bootstrap.js');
const key = randomBytes(32).toString('base64'), rateKey = randomBytes(32).toString('base64');
const password = `Synthetic-${randomBytes(24).toString('base64url')}`, secret = randomBytes(32).toString('base64url');
const invalidPassword = `Sentinel-${randomBytes(18).toString('base64url')}`;
const invalidMfa = `Sentinel-${randomBytes(18).toString('base64url')}`;
const invalidSession = randomBytes(32).toString('base64url');
const badRecovery = randomBytes(32).toString('base64url');
const badBootstrap = randomBytes(32).toString('base64url');
const unknownPath = `sensitive-${randomBytes(16).toString('hex')}`;
const sentinels = [password, secret, invalidPassword, invalidMfa, invalidSession, badRecovery, badBootstrap, unknownPath];
let app: ChildProcess | undefined, appOutput = '', cliOutput = ''; const responses: string[] = [];
const probe = net.createServer(); await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', resolve));
const addr = probe.address(); if (!addr || typeof addr === 'string') throw Error('No port');
const port = addr.port; await new Promise<void>((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
try {
  await migrateToLatest(() => {});
  assert.equal(await bootstrapFounder(db, { expectedSecretSha256: createHash('sha256').update(secret).digest('hex'), submittedSecret: secret, initialPassword: password, name: 'Synthetic' }), 'created');
  const env = { ...process.env, NODE_ENV: 'development', FOUNDER_AUTH_EXPERIMENTAL: 'true', SV_FOUNDER_TOTP_KEY: key, SV_FOUNDER_RATE_LIMIT_KEY: rateKey, APP_URL: 'http://localhost:5173', LOG_LEVEL: 'info', FOUNDER_FIXTURE_PORT: String(port) };
  app = spawn(process.execPath, ['--import', 'tsx', 'apps/server/scripts/founder-logging-worker.ts'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => reject(Error('worker startup timeout')), 15000);
    app!.stdout!.on('data', (chunk: Buffer) => { appOutput += chunk.toString(); if (appOutput.includes('FOUNDER_FIXTURE_READY')) { clearTimeout(timeout); resolve(); } });
    app!.stderr!.on('data', (chunk: Buffer) => { appOutput += chunk.toString(); });
    app!.once('error', reject); app!.once('exit', (code) => { if (!appOutput.includes('FOUNDER_FIXTURE_READY')) reject(Error(`worker exited ${code}`)); });
  });
  async function call(path: string, method: 'GET' | 'POST', body?: object, cookie?: string) {
    const response = await fetch(`http://127.0.0.1:${port}/api/founders${path}`, { method, headers: { origin: 'http://localhost:5173', ...(method === 'POST' ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text(); responses.push(text);
    return { response, text, cookie: response.headers.getSetCookie().find((c) => c.startsWith('sv_founder_flow='))?.split(';')[0] };
  }
  assert.equal((await call('/login', 'POST', { email: INITIAL_FOUNDER_EMAIL, password: invalidPassword })).response.status, 401);
  const login = await call('/login', 'POST', { email: INITIAL_FOUNDER_EMAIL, password }); assert.equal(login.response.status, 200); assert(login.cookie);
  const setup = await call('/mfa/setup', 'POST', {}, login.cookie); assert.equal(setup.response.status, 200);
  const totpSecret = (JSON.parse(setup.text) as { secret: string }).secret; assert(totpSecret); sentinels.push(totpSecret);
  assert.equal((await call('/mfa/verify', 'POST', { code: invalidMfa }, login.cookie)).response.status, 401);
  assert.equal((await call('/me', 'GET', undefined, `sv_founder_session=${invalidSession}`)).response.status, 403);
  // Recovery is not implemented: verify boundary only, not recovery behavior.
  assert.equal((await call('/recovery/complete', 'POST', { token: badRecovery, password: invalidPassword })).response.status, 404);
  assert.equal((await call(`/${unknownPath}`, 'POST', { password: invalidPassword })).response.status, 404);
  await sql`ALTER TABLE founder_rate_limits RENAME TO founder_rate_limits_logging_fixture`.execute(db);
  try {
    const unavailable = await call('/login', 'POST', { email: INITIAL_FOUNDER_EMAIL, password: invalidPassword });
    assert.equal(unavailable.response.status, 503); assert.match(unavailable.response.headers.get('x-request-id') ?? '', /^[0-9a-f-]{36}$/);
  } finally { await sql`ALTER TABLE founder_rate_limits_logging_fixture RENAME TO founder_rate_limits`.execute(db); }
  await sql`ALTER TABLE founder_sessions RENAME TO founder_sessions_logging_fixture`.execute(db);
  try { assert.equal((await call('/me', 'GET', undefined, `sv_founder_session=${invalidSession}`)).response.status, 503); }
  finally { await sql`ALTER TABLE founder_sessions_logging_fixture RENAME TO founder_sessions`.execute(db); }
  const cli = spawn(process.execPath, ['apps/server/dist/scripts/founder-bootstrap.js'], { env: { ...env, SV_FOUNDER_BOOTSTRAP_ENABLED: 'true', SV_FOUNDER_BOOTSTRAP_SECRET: badBootstrap, SV_FOUNDER_BOOTSTRAP_SECRET_SHA256: createHash('sha256').update(secret).digest('hex'), SV_FOUNDER_BOOTSTRAP_PASSWORD: password, SV_FOUNDER_BOOTSTRAP_NAME: 'Synthetic' }, stdio: ['ignore', 'pipe', 'pipe'] });
  cli.stdout.on('data', (v: Buffer) => { cliOutput += v.toString(); }); cli.stderr.on('data', (v: Buffer) => { cliOutput += v.toString(); });
  assert.equal(await new Promise<number | null>((resolve) => cli.once('close', resolve)), 1);
} finally {
  if (app && app.exitCode === null) { app.kill('SIGTERM'); await new Promise<void>((resolve) => app!.once('close', () => resolve())); }
  await db.destroy();
}
const logs = appOutput + cliOutput;
for (const value of sentinels) assert(!logs.includes(value), 'Synthetic sentinel leaked to app/CLI output');
// The setup response intentionally delivers the TOTP secret to the browser;
// it must never be copied to logs. Other error responses must not echo inputs.
for (const value of sentinels.slice(0, -1)) assert(!responses.join('').includes(value), 'Synthetic credential echoed by HTTP response');
const records = appOutput.split('\n').filter((line) => line.startsWith('{')).map((line) => JSON.parse(line));
assert(records.some((r) => r.category === 'database_error' && r.sqlState === '42P01' && /^[0-9a-f-]{36}$/.test(r.requestId)));
assert(records.some((r) => r.msg === 'Founder request completed' && r.statusCode === 401 && r.route === '/mfa/verify' && typeof r.time === 'number'));
assert(records.some((r) => r.route === 'unknown' && r.statusCode === 404));
console.log('PASS local real-app/CLI/HTTP sentinel checks for login, MFA, session errors, unknown/recovery boundary and unexpected DB errors; external telemetry not checked');
