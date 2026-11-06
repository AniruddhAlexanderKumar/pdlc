// Disposable local DB only; all credentials are generated in memory for this run.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const url = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/invalid');
if (process.env.NODE_ENV !== 'test' || !['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/founders_cli_test') throw Error('Requires NODE_ENV=test and disposable localhost founders_cli_test DB');
const { db } = await import('../src/db/index.js');
const { migrateToLatest } = await import('../src/db/migrate.js');
const { verifyPassword } = await import('../src/auth/crypto.js');
const secret = randomBytes(32).toString('base64url');
const password = `Synthetic-${randomBytes(24).toString('base64url')}`;
const digest = createHash('sha256').update(secret).digest('hex');
const rateKey = randomBytes(32).toString('base64');
const cli = fileURLToPath(new URL('../dist/scripts/founder-bootstrap.js', import.meta.url));
const run = (overrides: Record<string, string> = {}) => new Promise<{ code: number | null; output: string }>((resolve, reject) => {
  const child = spawn(process.execPath, [cli], { env: { ...process.env, SV_FOUNDER_BOOTSTRAP_ENABLED: 'true', SV_FOUNDER_BOOTSTRAP_SECRET_SHA256: digest, SV_FOUNDER_BOOTSTRAP_SECRET: secret, SV_FOUNDER_BOOTSTRAP_PASSWORD: password, SV_FOUNDER_BOOTSTRAP_NAME: 'Synthetic founder', SV_FOUNDER_RATE_LIMIT_KEY: rateKey, ...overrides }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', (data: Buffer) => { output += data.toString(); });
  child.stderr.on('data', (data: Buffer) => { output += data.toString(); });
  child.on('error', reject);
  child.on('close', (code) => resolve({ code, output }));
});
try {
  await migrateToLatest(() => {});
  const invalid = await run({ SV_FOUNDER_BOOTSTRAP_SECRET: randomBytes(32).toString('base64url') });
  assert.equal(invalid.code, 1);
  assert.equal((await db.selectFrom('founder_accounts').select('id').execute()).length, 0);
  const attempts = await Promise.all([run(), run(), run()]);
  assert.deepEqual(attempts.map((a) => a.code).sort(), [0, 1, 1]);
  const again = await run();
  assert.equal(again.code, 1);
  const founders = await db.selectFrom('founder_accounts').selectAll().execute();
  assert.equal(founders.length, 1);
  assert.equal(founders[0].email, 'f5manmission@sv.com');
  assert.equal(founders[0].status, 'pending');
  assert.equal(founders[0].password_rotation_required, true);
  assert(await verifyPassword(password, founders[0].password_hash));
  assert(!JSON.stringify(founders).includes(password));
  const audit = await db.selectFrom('founder_security_audit').selectAll().execute();
  assert.equal(audit.length, 5);
  assert.equal(audit.filter((a) => a.outcome === 'success').length, 1);
  for (const sensitive of [secret, digest, password]) {
    assert(![invalid, ...attempts, again].some((result) => result.output.includes(sensitive)));
    assert(!JSON.stringify(audit).includes(sensitive));
  }
  const blocked = await run({ NODE_ENV: 'production' });
  assert.equal(blocked.code, 1);
  console.log('PASS restricted CLI: invalid secret, concurrency, one owner, consumed state, no plaintext output, production disabled');
} finally {
  await db.destroy();
}
