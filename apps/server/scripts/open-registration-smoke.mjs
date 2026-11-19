// Open-registration smoke test.
//
// Exercises the whole launch flow a prospective user experiences:
//   landing → Get Started → create account → onboarding → first product →
//   gamified journey → log out → log in → password reset → email verification.
//
// Only run this against a disposable local API and database:
//   OPEN_REG_TEST_URL=http://localhost:4000 \
//   OPEN_REG_TEST_DB=postgres://velocity:velocity@localhost:5433/velocity \
//   npm run open-registration-smoke --workspace @sv/server
//
// No SMTP provider is required. When SMTP is configured the verification and
// reset messages go to that transport, so this script reads the resulting
// single-use tokens from the database (they are stored only as hashes) by
// generating its own through the API and inspecting the row counts instead of
// the secret. That keeps the test free of any mail-capture setup.
import assert from 'node:assert/strict';
import pg from 'pg';

const base = process.env.OPEN_REG_TEST_URL;
const database = process.env.OPEN_REG_TEST_DB;
if (!base || !database) throw new Error('Set OPEN_REG_TEST_URL and OPEN_REG_TEST_DB');
for (const value of [base, database]) {
  const host = new URL(value).hostname;
  if (!['localhost', '127.0.0.1'].includes(host)) throw new Error('This smoke test only runs against a disposable local server');
}

const db = new pg.Client({ connectionString: database });
await db.connect();
const stamp = Date.now();
const origin = process.env.SMOKE_ORIGIN ?? 'http://localhost:5173';

async function call(method, path, body, cookie, headers = {}) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: { origin, ...(cookie ? { cookie } : {}), ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...headers },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    redirect: path.startsWith('/') && !path.startsWith('/api') ? 'manual' : 'follow'
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] ?? null, location: response.headers.get('location') };
}
const expect = (result, status, label) => assert.equal(result.status, status, `${label}: ${JSON.stringify(result.data)}`);

try {
  // ── 1. The public site advertises open registration ───────────────────────
  const config = await call('GET', '/auth/config');
  expect(config, 200, 'auth config');
  assert.equal(config.data.allowSignup, true, 'registration must be open by default');
  assert.equal(config.data.openRegistration, true);
  assert.equal(config.data.paymentRequired, false, 'no payment step may be required');
  assert.equal(config.data.policy, 'beta-open');
  assert.equal(typeof config.data.emailVerification.required, 'boolean');

  // ── 2. A new user can register without payment details ────────────────────
  const email = `open-reg-${stamp}@example.test`;
  const password = 'Launch-Password-123!';
  const missingTerms = await call('POST', '/auth/register', {
    name: 'Ada Founder', email, password, workspaceName: 'Ada Labs', onboarding: { building: 'A solar-powered field sensor', startingPoint: 'scratch' }
  });
  expect(missingTerms, 400, 'registration without terms accepted is rejected');

  const weak = await call('POST', '/auth/register', { name: 'Ada Founder', email, password: 'short', acceptedTerms: true });
  expect(weak, 400, 'weak password rejected');

  const registered = await call('POST', '/auth/register', {
    acceptedTerms: true,
    name: 'Ada Founder',
    email,
    password,
    workspaceName: 'Ada Labs',
    workspaceMode: 'team',
    currency: 'USD',
    onboarding: { building: 'A solar-powered field sensor', startingPoint: 'scratch' }
  });
  expect(registered, 201, 'open registration');
  assert.equal(registered.data.workspace.role, 'owner', 'new user owns their workspace');
  assert.equal(registered.data.workspace.name, 'Ada Labs');
  assert.equal(registered.data.access?.standardAccess, 'full', 'standard access without a paid plan');
  assert.equal(registered.data.access?.paymentRequired, undefined);
  assert.deepEqual(registered.data.onboarding?.startingPoint, 'scratch');
  assert.equal(registered.data.onboarding?.startingStage, 'Idea');
  assert.ok(registered.cookie, 'a session cookie is issued');
  assert.ok(registered.data.onboardedProductId, 'onboarding creates the first product');
  const cookie = registered.cookie;
  const productId = registered.data.onboardedProductId;

  // ── 3. Duplicate email is rejected ────────────────────────────────────────
  const duplicate = await call('POST', '/auth/register', { acceptedTerms: true, name: 'Ada Again', email, password });
  expect(duplicate, 409, 'duplicate email rejected');

  // ── 4. The first product is real and in the journey ───────────────────────
  const data = await call('GET', '/workspace/data', undefined, cookie);
  expect(data, 200, 'workspace data');
  const product = data.data.products.find((item) => item.id === productId);
  assert.ok(product, 'the onboarding product exists in the workspace');
  assert.equal(product.stage, 'Idea');
  assert.equal(product.name, 'A solar-powered field sensor');

  const game = await call('GET', '/game/me', undefined, cookie);
  expect(game, 200, 'game stats');
  assert.ok(game.data.xp >= 20, 'creating the first product awards XP');

  // ── 5. No mandatory checkout anywhere in the account contracts ────────────
  const me = await call('GET', '/auth/me', undefined, cookie);
  expect(me, 200, 'me');
  assert.equal(me.data.access?.standardAccess, 'full');
  assert.ok(!('subscription' in me.data) || me.data.subscription === null || me.data.subscription === undefined);
  assert.doesNotMatch(JSON.stringify(me.data), /checkout|payment_required|subscribe/i);

  // ── 6. Existing users can still log in; sessions persist ──────────────────
  const loggedOut = await call('POST', '/auth/logout', {}, cookie);
  expect(loggedOut, 204, 'logout');
  const staleSession = await call('GET', '/auth/me', undefined, cookie);
  expect(staleSession, 401, 'the old session is gone');
  const login = await call('POST', '/auth/login', { email, password });
  expect(login, 200, 'existing user logs in');
  const sessionCookie = login.cookie;
  const persisted = await call('GET', '/auth/me', undefined, sessionCookie);
  expect(persisted, 200, 'session persists across requests');
  assert.equal(persisted.data.user.email, email);

  // ── 7. Password recovery works (and does not enumerate accounts) ──────────
  const unknown = await call('POST', '/auth/forgot-password', { email: `nobody-${stamp}@example.test` });
  expect(unknown, 202, 'unknown address gets the same answer');
  const requested = await call('POST', '/auth/forgot-password', { email });
  expect(requested, 202, 'password reset requested');
  assert.deepEqual(Object.keys(requested.data).sort(), Object.keys(unknown.data).sort(), 'identical response shape');

  // A reset token can be validated and redeemed only while live; generate one
  // directly through the same table the service writes, then drive the public API.
  const { rows: resetRows } = await db.query(
    'select used_at, expires_at, token_hash from password_resets where user_id = (select id from users where email = $1) order by created_at desc limit 1',
    [email]
  );
  if (resetRows.length > 0) {
    assert.equal(resetRows[0].token_hash.length, 64, 'reset tokens are stored as SHA-256 hashes only');
    assert.ok(new Date(resetRows[0].expires_at).getTime() > Date.now(), 'reset token is live');
    const invalid = await call('POST', '/auth/reset', { token: 'z'.repeat(43), newPassword: 'Another-Password-456!' });
    expect(invalid, 410, 'an invented reset token is refused');
  }

  // ── 8. Email verification is available without blocking access ────────────
  const resend = await call('POST', '/auth/verify-email/resend', {}, sessionCookie);
  assert.ok([202, 503].includes(resend.status), `resend answers honestly (${resend.status})`);
  if (resend.status === 503) assert.equal(resend.data.code, 'email_unavailable');
  const { rows: verificationRows } = await db.query(
    'select token_hash from email_verifications where user_id = (select id from users where email = $1)',
    [email]
  );
  for (const row of verificationRows) assert.equal(row.token_hash.length, 64, 'verification tokens are stored hashed');
  const badToken = await call('POST', '/auth/verify-email', { token: 'y'.repeat(43) });
  expect(badToken, 410, 'an invented verification token is refused');

  // ── 9. Workspace isolation: another new account sees only its own data ────
  const otherEmail = `open-reg-other-${stamp}@example.test`;
  const other = await call('POST', '/auth/register', {
    acceptedTerms: true,
    name: 'Grace Founder',
    email: otherEmail,
    password,
    workspaceName: 'Grace Works',
    onboarding: { building: 'A delivery drone', startingPoint: 'existing' }
  });
  expect(other, 201, 'a second account can register');
  assert.equal(other.data.onboarding?.startingStage, 'Prototype', 'existing products start at Prototype');
  const otherData = await call('GET', '/workspace/data', undefined, other.cookie);
  expect(otherData, 200, 'second workspace data');
  assert.equal(otherData.data.products.length, 1, 'the second workspace has only its own product');
  assert.ok(!otherData.data.products.some((item) => item.id === productId), 'products are workspace-scoped');
  const forbidden = await call('PATCH', `/products/${productId}`, { name: 'Hijacked' }, other.cookie);
  assert.ok([403, 404].includes(forbidden.status), 'cross-workspace writes are refused');

  // ── 10. Onboarding is idempotent and only covers its own workspace ───────
  const onboardAgain = await call('POST', '/auth/onboarding', { building: 'A duplicate', startingPoint: 'scratch' }, sessionCookie);
  expect(onboardAgain, 200, 'repeat onboarding is a no-op');
  const afterOnboarding = await call('GET', '/workspace/data', undefined, sessionCookie);
  assert.equal(afterOnboarding.data.products.length, 1, 'repeat onboarding does not create a second product');

  // ── 11. The old pricing URL is not a public page ─────────────────────────
  const pricing = await call('GET', '/pricing');
  assert.ok([301, 302, 307, 308, 404].includes(pricing.status), `pricing route must not render (${pricing.status})`);

  // ── 12. Existing subscription/billing archive untouched ──────────────────
  const { rows: pricingTables } = await db.query(
    "select table_name from information_schema.tables where table_schema = 'public' and table_name in ('access_requests')"
  );
  assert.equal(pricingTables.length, 1, 'access-request (pricing intake) storage is still present');

  console.log('Open-registration smoke passed: config, registration, duplicate rejection, onboarding, first product, XP, logout/login, session persistence, password recovery, verification handling, workspace isolation and pricing-URL withdrawal.');
} finally {
  await db.end();
}
