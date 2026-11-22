// Journey-first UI smoke: three primary destinations, journey path, stage
// activities, project switching and project creation — against a disposable
// local stack (API on :4000, Vite on :5173).
//   node scripts/journey-ui-smoke.mjs
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

const base = process.env.JOURNEY_UI_URL ?? 'http://localhost:5173';
const { chromium: pw } = await import('playwright-core');
const { default: chromium } = await import('@sparticuz/chromium');

const password = `Synthetic-${randomBytes(18).toString('base64url')}`;
const email = `journey-${randomBytes(8).toString('hex')}@example.test`;

async function call(method, path, body, cookie) {
  const response = await fetch(`${base}/api${path}`, {
    method,
    headers: {
      origin: base,
      ...(cookie ? { cookie } : {}),
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}

const registered = await call('POST', '/auth/register', {
  acceptedTerms: true,
  name: 'Journey fixture',
  email,
  password,
  workspaceName: 'Journey fixture workspace'
});
assert.equal(registered.status, 201);
const cookie = registered.cookie;
assert(cookie);

const hardware = await call('POST', '/projects', { name: 'Field purifier', key: 'PURIF', template: 'hardware', description: 'Hardware field unit' }, cookie);
const software = await call('POST', '/projects', { name: 'Control app', key: 'CTRL', template: 'software', description: 'Companion app' }, cookie);
assert.equal(hardware.status, 201);
assert.equal(software.status, 201);

const browser = await pw.launch({
  executablePath: await chromium.executablePath(),
  args: chromium.args.filter((x) => x !== '--disable-web-security'),
  headless: true
});

try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));

  // ── Sign in lands on Journey ────────────────────────────────────────────────
  await page.goto(`${base}/login`);
  await page.getByLabel('Work email').fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL(`${base}/`);
  await page.getByRole('heading', { name: /Field purifier|Control app/ }).waitFor({ timeout: 15000 });

  // Pin the hardware project so the lifecycle assertions below are deterministic.
  await page.getByRole('button', { name: 'Select project' }).first().click();
  await page.getByRole('option', { name: /Field purifier/ }).click();
  await page.waitForURL(`${base}/?project=${hardware.data.id}`);

  // ── Exactly three primary destinations in the main navigation ───────────────
  const mainNav = page.locator('nav[aria-label="Main"]').first();
  await mainNav.getByRole('link', { name: 'Journey' }).waitFor();
  await mainNav.getByRole('link', { name: 'AI Assistant' }).waitFor();
  await mainNav.getByRole('link', { name: 'Design Studio' }).waitFor();
  for (const removed of ['Dashboard', 'Teamwork Graph', 'Achievements', 'Materials', 'Suppliers']) {
    assert.equal(await mainNav.getByRole('link', { name: removed, exact: true }).count(), 0, `${removed} must not be a primary nav entry`);
  }

  // ── The journey path renders with the recommended lifecycle ─────────────────
  await page.getByRole('heading', { name: 'Development path' }).waitFor();
  await page.getByText('Discover & Define').first().waitFor();
  await page.getByText('Prototype & Test').first().waitFor();
  await page.getByText('Journey progress').waitFor();
  await page.getByText('Next action').waitFor();

  // ── The current stage opens with its activities in place ────────────────────
  const activeStage = page.locator('button[aria-label^="Current stage"]');
  assert.equal(await activeStage.count(), 1, 'exactly one active stage');
  const detail = page.getByRole('region', { name: /Activities in/ }).first();
  if (!(await detail.isVisible().catch(() => false))) await activeStage.click();
  await detail.waitFor();
  await detail.getByText('New activity').waitFor();
  assert(await detail.getByText('Capture the problem and target user').first().isVisible(), 'seeded activity visible in stage');
  await page.screenshot({ path: '.data/screenshots/journey-desktop.png', fullPage: false });

  // ── Switch projects from the Journey header ─────────────────────────────────
  await page.getByRole('button', { name: 'Select project' }).first().click();
  await page.getByRole('option', { name: /Control app/ }).click();
  await page.waitForURL(`${base}/?project=${software.data.id}`);
  await page.getByRole('heading', { name: /Control app/ }).waitFor();
  await page.getByText('Operate & Improve', { exact: true }).first().waitFor(); // software lifecycle stage

  // ── Create a new project directly from Journey ──────────────────────────────
  await page.getByRole('button', { name: 'New project' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Project name').fill('Bench tester');
  await dialog.getByLabel('Project type').selectOption('research');
  await dialog.getByText('Recommended Journey').waitFor();
  await dialog.getByRole('button', { name: /Create project/ }).click();
  await page.getByRole('heading', { name: /Bench tester/ }).waitFor({ timeout: 15000 });
  await page.getByText('Proposal', { exact: true }).first().waitFor(); // research lifecycle

  // ── Mobile: three-item bottom nav, no horizontal overflow ───────────────────
  await page.setViewportSize({ width: 390, height: 850 });
  await page.reload();
  await page.getByRole('heading', { name: /Bench tester|Field purifier|Control app/ }).waitFor({ timeout: 15000 });
  const bottomNav = page.locator('nav[aria-label="Main"]').last();
  await bottomNav.getByRole('link', { name: 'Journey' }).waitFor();
  await bottomNav.getByRole('link', { name: 'AI Assistant' }).waitFor();
  await bottomNav.getByRole('link', { name: 'Design Studio' }).waitFor();
  const size = await page.evaluate(() => ({ width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
  assert(size.scroll <= size.width, `horizontal overflow: ${size.scroll} > ${size.width}`);
  await page.screenshot({ path: '.data/screenshots/journey-mobile.png', fullPage: false });

  assert.deepEqual(errors, []);
  console.log('PASS journey landing, three primary destinations, stage detail, project switch/create, mobile layout');
} finally {
  await browser.close();
}
