// Real Vite/Express/PostgreSQL flow. Uses synthetic records on a disposable local instance only.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright-core';
const base = process.env.STUDIO_TEST_URL;
if (process.env.NODE_ENV !== 'test' || base !== 'http://localhost:5173')
  throw Error('Requires NODE_ENV=test and the disposable local Vite app');
const browser = await chromium.launch({
  executablePath: process.env.BROWSER_EXECUTABLE || chromium.executablePath(),
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage']
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 960 } }),
    errors = [];
  page.setDefaultTimeout(9000);
  page.on('pageerror', (e) => errors.push(e.message));
  const btn = (name) => page.getByRole('button', { name, exact: true }),
    link = (name) => page.getByRole('link', { name, exact: true });
  const api = async (path, method = 'GET', body) =>
    page.evaluate(
      async ({ path, method, body }) => {
        const r = await fetch('/api' + path, {
          method,
          headers: body === undefined ? {} : { 'content-type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (!r.ok) throw Error(`${method} ${path}: ${r.status}`);
        return r.status === 204 ? null : r.json();
      },
      { path, method, body }
    );
  await page.goto(base);
  await btn('Essential only').click();
  const desktop = async (width, height) => {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(r)));
    assert.ok(
      await page.evaluate(
        () =>
          document.documentElement.scrollWidth <= window.innerWidth + 1 &&
          [...document.querySelectorAll('main')].every((el) => el.scrollWidth <= el.clientWidth + 1)
      ),
      `horizontal overflow at ${width} on ${page.url()}`
    );
  };
  await desktop(375, 820);
  await page
    .getByRole('button', { name: /Research/ })
    .first()
    .click();
  await page.getByText('You’ll create a research notebook').waitFor();
  await desktop(1440, 960);
  await page.goto(`${base}/signup`);
  const password = `Guide-${randomUUID()}`;
  await page.getByLabel('Your name').fill('Founder fixture');
  await page.getByLabel('Work email').fill(`browser-${randomUUID()}@example.test`);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Confirm password', { exact: true }).fill(password);
  await btn('Continue to Workspace →').click();
  await page.getByText('Personal workspace', { exact: true }).click();
  await btn('Create Account & Continue →').click();
  await page.getByLabel('Product name').fill('Calendar pilot');
  await page.getByLabel('What kind of product?').selectOption('software');
  await page.getByLabel('Where are you now?').selectOption('Planning');
  await page.getByLabel('How familiar is product development?').selectOption('advanced');
  await btn('Start my journey').click();
  await page.waitForURL(/\/journey$/);
  await link('Continue building').click();
  await page.waitForURL(/q=planning.mvp/);
  const id = new URL(page.url()).pathname.split('/')[2],
    root = `/products/${id}`;
  const mvp = page.getByRole('textbox', { name: /smallest useful version/ });
  await mvp.waitFor();
  await btn('Use beginner guidance').click();
  await btn('Use advanced guidance').waitFor();
  assert.equal((await api('/auth/me')).workspace.mode, 'solo');
  assert.equal((await api('/auth/me')).user.guideMode, 'beginner');
  await mvp.fill('Let a tutor publish one open slot.');
  page.once('dialog', (d) => d.dismiss());
  await link('Chapter brief').click();
  assert.equal(await mvp.inputValue(), 'Let a tutor publish one open slot.');
  await btn('Save for later').click();
  await link('Resume draft').waitFor();
  await page.reload();
  await link('Resume draft').click();
  await page.getByText(/Restored your private draft/).waitFor();
  assert.equal(await mvp.inputValue(), 'Let a tutor publish one open slot.');
  assert.equal((await api('/workspace/data')).products[0].answers['planning.mvp'], undefined);
  await page.getByText('Founder copilot', { exact: true }).click();
  await btn('Why does this matter?').click();
  await page.getByText('Built-in guide · no AI generated').waitFor();
  // The real provider and credit transaction have a separate integration test.
  // Here isolate the UI contract for a proposal: neither receipt nor copy is a save.
  await page.route(
    `**/api${root}/lessons/planning.mvp/assist`,
    (route) =>
      route.fulfill({
        json: {
          source: 'ai',
          text: 'Suggested: publish one slot and confirm it by hand.',
          next: { href: root + '/journey', title: 'Review the plan' }
        }
      }),
    { times: 1 }
  );
  await btn('Help rewrite my draft').click();
  await page.getByText('AI suggestion · review before use').waitFor();
  assert.equal(await mvp.inputValue(), 'Let a tutor publish one open slot.');
  await btn('Copy to my draft for editing').click();
  assert.match(await mvp.inputValue(), /^Suggested:/);
  assert.equal((await api('/workspace/data')).products[0].answers['planning.mvp'], undefined);
  await mvp.fill('Pilot one slot, with manual confirmation.');
  // Another session changed the persisted answer after this form was opened.
  await api(`${root}/answers/planning.mvp`, 'PUT', { value: 'Another revision' });
  const pre = (await api('/game/me')).xp;
  await btn('Complete activity').click();
  await page.getByText('The shared answer has changed.').waitFor();
  assert.equal(await mvp.inputValue(), 'Pilot one slot, with manual confirmation.');
  await btn('Reviewed · keep my edits').click();
  await btn('Save revision').click();
  await page.getByText('Your mvp definition is saved.', { exact: true }).waitFor();
  assert.equal((await api('/game/me')).xp, pre);
  assert.deepEqual(await api('/products/drafts'), []);
  await link('Read brief').click();
  await page.getByText('Pilot one slot, with manual confirmation.', { exact: true }).waitFor();
  await page.getByRole('link', { name: /Revise MVP definition/ }).click();
  assert.equal(await mvp.inputValue(), 'Pilot one slot, with manual confirmation.');
  await desktop(375, 820);
  await desktop(768, 1024);
  await desktop(1440, 960);
  await page.goto(`${base}${root}/discover?stage=Planning&q=planning.priorities`);
  await page.getByLabel('Priority 1').fill('Publish a slot');
  await btn('Add item').click();
  await page.getByLabel('Priority 2').fill('Confirm a booking');
  await btn('Move item 2 up').click();
  await btn('Complete activity').click();
  await link('Read brief').click();
  await page.getByText('1. Confirm a booking 2. Publish a slot', { exact: true }).waitFor();
  await page.goto(`${base}/?view=journey`);
  await page.getByRole('heading', { name: 'Your building desk' }).waitFor();
  for (const w of [375, 768, 1440]) await desktop(w, 920);
  const chapters = page.getByRole('region', { name: 'Your product journey' });
  await chapters.locator('[data-world]').first().waitFor();
  assert.equal(await chapters.locator('[data-world]').count(), 8);
  const researchWorld = chapters.locator('[data-world=Research]');
  await researchWorld.getByRole('button', { name: /World 02/ }).click();
  await researchWorld.getByRole('link', { name: 'World workspace →' }).click();
  await page.getByRole('region', { name: 'Research overview' }).waitFor();
  await btn('Read or revise brief →').click();
  await page.getByRole('link', { name: /Add Research notebook/ }).click();
  await page.getByLabel('What is this based on?').selectOption('Independent evidence');
  await page.getByLabel('Observation or assumption').fill('Fixture observation');
  await btn('Complete activity').click();
  await page.getByRole('alert').filter({ hasText: 'traceable source' }).waitFor();
  await page.getByLabel('What is this based on?').selectOption('Founder assumption');
  await btn('Complete activity').click();
  await link('Read brief').click();
  await page.getByText(/Founder assumption \(founder-reported\)/).waitFor();
  await page.goto(`${base}/?view=workspace`);
  await page
    .getByRole('link', { name: /Founder journey/i })
    .first()
    .waitFor();
  await api('/dashboard', 'PUT', { preset: 'personal' });
  await page.goto(base);
  await page.getByRole('region', { name: 'Your product journey' }).waitFor();
  await link('Workspace overview').click();
  await link('Choose layout').waitFor();
  await page.getByRole('link', { name: /Founder journey/ }).click();
  await page.getByRole('heading', { name: 'Your building desk' }).waitFor();
  // Work on one chapter's comparison in the small-screen editor.
  await desktop(375, 820);
  await page.goto(`${base}${root}/discover?stage=Research&q=research.comparison`);
  await page.getByLabel('Comparison criterion').fill('Cancellation notice');
  await page.getByLabel('Alternative 1', { exact: true }).fill('Calendar: investigate');
  await page.getByLabel('Alternative 2', { exact: true }).fill('Group chat: ask tutors');
  await btn('Complete activity').click();
  await link('Read brief').click();
  await page.getByText(/Criterion: Cancellation notice/).waitFor();
  await desktop(1440, 960);
  await api(`${root}/answers/research.validated`, 'PUT', { value: false });
  await page.goto(`${base}${root}/journey?stage=Research&activity=research.validated`);
  await page.getByText('Current answer', { exact: true }).waitFor();
  await btn('Submit for review').click();
  await btn('Approve').click();
  await page.waitForFunction(
    async (id) =>
      (await (await fetch('/api/workspace/data')).json()).products.find((p) => p.id === id).approvalStates[
        'research.validated'
      ] === 'approved',
    id
  );
  await page.goto(`${base}${root}/journey?stage=Planning&activity=planning.risk`);
  await page.getByText('Prerequisites (0)', { exact: true }).click();
  await page.getByLabel('Choose a prerequisite').selectOption('design.behaviour');
  await btn('Link prerequisite').click();
  await btn('Remove prerequisite design.behaviour').waitFor();
  await page.goto(base + '/?view=journey');
  await page.getByText('Something this depends on is not finished yet.').first().waitFor();
  // Starting a subsequent cycle must preserve earlier records even with no completion claim.
  const cycle = await api('/products', 'POST', {
    name: 'Iteration fixture',
    startingStage: 'Improvement',
    productKind: 'service'
  });
  const iteration = '/products/' + cycle.data.id;
  await api(iteration + '/answers/improve.return', 'PUT', { value: 'Design' });
  await api(iteration + '/answers/design.journey', 'PUT', { value: 'Existing journey map' });
  await page.goto(`${base}${iteration}/journey?stage=Improvement`);
  await btn('Start next cycle in Design →').click();
  await page.waitForURL(/stage=Design&view=brief/);
  await page.getByText('Existing journey map', { exact: true }).waitFor();
  assert.equal((await api('/workspace/data')).products.find((p) => p.id === cycle.data.id).stage, 'Design');
  // Navigating a chapter is not a stage change. Archive and return must be explicit.
  await page.goto(`${base}${iteration}/journey?stage=Retired`);
  assert.equal((await api('/workspace/data')).products.find((p) => p.id === cycle.data.id).stage, 'Design');
  await btn('Archive product').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Archive product' }).click();
  await page.waitForURL(/discover\?stage=Retired/);
  await page.goto(`${base}${iteration}/journey?stage=Design`);
  await btn('Make Design the current chapter').click();
  await page.waitForURL(/stage=Design&view=brief/);
  await page.getByText('Existing journey map', { exact: true }).waitFor();
  const empty = await browser.newPage();
  empty.setDefaultTimeout(9000);
  empty.on('pageerror', (e) => errors.push(e.message));
  await empty.goto(base);
  await empty.getByRole('button', { name: 'Essential only' }).click();
  await empty.evaluate(async () => {
    const r = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: `empty-${crypto.randomUUID()}@example.test`,
        password: crypto.randomUUID(),
        workspaceName: 'Empty workspace',
        name: 'Fixture'
      })
    });
    if (r.status !== 201) throw Error('Empty fixture registration failed');
  });
  await empty.goto(base);
  await empty.getByRole('heading', { name: 'Let’s build your product.' }).waitFor();
  await empty.getByRole('button', { name: 'Create a product', exact: true }).click();
  await empty.getByLabel('Product name').fill('Another pilot');
  await empty.getByText('Already developing this? Bring existing work').click();
  await empty.getByLabel('Import text (.txt / .md)').setInputFiles({
    name: 'concept.md',
    mimeType: 'text/markdown',
    buffer: Buffer.from('A field notebook with revisions.')
  });
  await empty.waitForFunction(
    () => document.querySelector('textarea')?.value === 'A field notebook with revisions.'
  );
  await empty.getByRole('button', { name: 'Start my journey' }).click();
  await empty.waitForURL(/\/journey$/);
  await empty.getByRole('link', { name: 'Continue building', exact: true }).click();
  await empty.waitForURL(/q=idea.oneliner/);
  const otherRoot = new URL(empty.url()).pathname.replace(/\/discover$/, '');
  for (const [key, text] of [
    ['idea.oneliner', 'A field notebook with revisions.'],
    ['idea.problem', 'Teams lose notes in the field.'],
    ['idea.customer', 'Field teams'],
    ['idea.promise', 'Keep every revision with the trial.']
  ]) {
    if (key !== 'idea.oneliner') {
      await empty.goto(base + otherRoot + '/journey');
      await empty.getByRole('link', { name: 'Continue building', exact: true }).click();
    }
    await empty.waitForURL((u) => u.searchParams.get('q') === key && u.searchParams.get('guided') === '1');
    await empty.locator('article form').getByRole('textbox').fill(text);
    await empty.getByRole('button', { name: 'Complete activity', exact: true }).click();
    await empty.getByText('Activity recorded', { exact: true }).waitFor();
  }
  await empty.goto(base + otherRoot + '/journey');
  await empty.getByText('Your evidence meets this checkpoint.').waitFor();
  await empty.getByRole('button', { name: 'Check evidence', exact: true }).click();
  await empty.getByText('Checkpoint passed. Rechecking does not repeat the reward.').waitFor();
  await empty.getByRole('button', { name: 'Finish world', exact: true }).click();
  await empty.getByRole('button', { name: 'Enter Research', exact: true }).click();
  await empty.getByRole('heading', { name: 'Another pilot / Research' }).waitFor();
  await empty.goto(base + '/achievements');
  await empty.getByRole('list', { name: 'Daily activity calendar' }).waitFor();
  await empty.getByRole('button', { name: 'View all XP transactions' }).click();
  await empty.getByText('World complete: Idea · Another pilot', { exact: true }).first().waitFor();
  await empty.close();
  assert.deepEqual(errors, []);
  console.log(
    'PASS signup, depth switch, guarded leave, durable draft, reviewed suggestions, concurrent revision, read/revise, ranking, evidence, comparison, sign-off, prerequisites, saved and empty dashboards, 8 navigable chapters, iteration and archive/return, 375/768/1440px layouts'
  );
} finally {
  await browser.close();
}
