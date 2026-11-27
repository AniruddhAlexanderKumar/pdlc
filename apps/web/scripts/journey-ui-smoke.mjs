// Run against a disposable local stack with Chromium installed.
// CHROMIUM_PATH=/usr/bin/chromium node apps/web/scripts/journey-ui-smoke.mjs
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { chromium } from 'playwright-core';

const base = 'http://localhost:5173';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || process.env.BROWSER_EXECUTABLE,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
  headless: true
});

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 850 } });
  page.setDefaultTimeout(12000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  // The live editor has its own independent check. This workflow exercises file fallback.
  await page.route('https://app.cadit.app/**', route => route.abort());
  const registration = await page.request.post(base + '/api/auth/register', {
    headers: { origin: base },
    data: {
      name: 'Lifecycle student',
      email: `journey-${randomBytes(8).toString('hex')}@example.test`,
      password: `Synthetic-${randomBytes(18).toString('base64url')}`,
      acceptedTerms: true,
      workspaceName: 'Lifecycle smoke'
    }
  });
  assert.equal(registration.status(), 201);
  await page.goto(base);
  const consent = page.getByRole('button', { name: 'Essential only' });
  if (await consent.isVisible()) await consent.click();
  await page.getByRole('button', { name: 'Create a project', exact: true }).click();
  await page.getByLabel('Project name').fill('Desk light');
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await page.getByRole('heading', { name: 'Describe your idea' }).waitFor();
  const projectId = new URL(page.url()).searchParams.get('project');
  assert(projectId);
  const projectPath = `/journeys/projects/${projectId}`;
  const api = async (path, method = 'GET', data) => {
    const result = await page.request.fetch(base + '/api' + path, { method, data, headers: { origin: base } });
    assert(result.ok(), `${method} ${path} ${result.status()} ${await result.text()}`);
    return result.json();
  };
  const nav = page.getByRole('navigation', { name: 'Main', exact: true });
  assert.deepEqual(await nav.getByRole('link').allTextContents(), ['Journey','Design Studio','AI Assistant']);
  await page.getByRole('link', { name: 'Ask AI', exact: true }).click();
  await page.getByRole('heading', { name: 'AI Assistant', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Summarise this journey', exact: true }).click();
  await page.getByRole('heading', { name: 'Journey progress · 0%', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Show conversations', exact: true }).click();
  await page.getByRole('button', { name: 'Summarise this journey', exact: true }).waitFor();
  await page.setViewportSize({ width: 1280, height: 850 });
  assert.equal(await nav.getByRole('link', { name: 'AI Assistant' }).getAttribute('aria-current'), 'page');
  assert.equal(await nav.getByRole('link', { name: 'Journey' }).isVisible(), true);
  await nav.getByRole('link', { name: 'Journey' }).click();
  await page.getByRole('heading', { name: 'Describe your idea', exact: true }).waitFor();
  await page.setViewportSize({ width: 390, height: 850 });
  let layout = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  assert(layout[0] <= layout[1], String(layout));

  const view = await api(projectPath);
  const steps = view.stages.flatMap(stage => stage.activities);
  const getStep = title => steps.find(step => step.title === title);
  const open = async title => {
    const activity = getStep(title);
    const row = page.locator(`[id="${activity.id}"]`);
    const toggle = row.locator(':scope > button');
    if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click();
    return row;
  };
  const done = async row => {
    await row.getByRole('button', { name: 'Mark step done' }).click();
    await row.locator(':scope > button').getByText('Done', { exact: true }).waitFor();
  };
  const notes = async (title, text) => {
    const row = await open(title);
    await row.getByLabel('Step notes').fill(text);
    await row.getByRole('button', { name: 'Save notes' }).click();
    await done(row);
  };
  const checklist = async (title, text) => {
    const row = await open(title);
    await row.getByLabel('Requirement', { exact: true }).fill(text);
    await row.getByRole('button', { name: 'Add requirement' }).click();
    await row.getByLabel(`Status for ${text}`).selectOption('Done');
    await done(row);
  };
  const approval = async title => {
    const row = await open(title);
    await row.getByRole('button', { name: 'Ask for approval', exact: true }).click();
    await row.getByText('Waiting for approval.', { exact: true }).waitFor();
    await row.getByLabel('Review notes').fill('Reviewed the evidence.');
    await row.getByRole('button', { name: 'Approve', exact: true }).click();
    await row.getByText('Approved.', { exact: true }).waitFor();
  };

  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await notes('Capture the problem and target user', 'A lamp for a student desk.');
  const scope = await open('Confirm project scope');
  await scope.getByLabel('What changed?').fill('Use a replaceable bulb');
  await scope.getByLabel('Why did it change?').fill('Easier to repair.');
  await scope.getByRole('button', { name: 'Record change' }).filter({ visible: true }).click();
  await done(scope);
  await notes('Problem statement and use cases', 'Read at night.');
  await checklist('Draft functional requirements', 'Lights a book evenly');
  const optional = await open('Log technical feasibility risks');
  await optional.getByRole('button', { name: 'Skip optional step' }).click();
  await optional.getByText('Skipped', { exact: true }).waitFor();
  await approval('Requirements baseline review');

  const design = await open('Concept sketches and architecture');
  await design.getByRole('link', { name: 'Open Design Studio' }).click();
  const studio = page.getByRole('region', { name: 'Project designs' });
  await studio.getByLabel('Design name').fill('Lamp assembly');
  await studio.getByRole('button', { name: 'Create diagram' }).click();
  await page.getByRole('heading', { name: 'Lamp assembly' }).waitFor();
  await page.getByRole('button', { name: 'Add box' }).click();
  await page.getByRole('button', { name: 'Save a version' }).click();
  await page.getByText(/revision 2/i).first().waitFor();
  await page.getByRole('link', { name: 'Back to Journey', exact: true }).click();
  await design.getByRole('link', { name: 'Lamp assembly' }).waitFor();
  await design.getByLabel('Attach an existing file').setInputFiles({
    name: 'lamp.stl', mimeType: 'application/octet-stream', buffer: Buffer.from('first design bytes')
  });
  await design.getByRole('link', { name: 'lamp.stl', exact: true }).waitFor();
  await done(design);
  const choice = await open('Select the preferred concept');
  await choice.getByLabel('What changed?').fill('Choose the modular version');
  await choice.getByLabel('Why did it change?').fill('Easier to assemble.');
  await choice.getByRole('button', { name: 'Record change' }).click();
  await done(choice);
  await approval('Concept design review');

  const detailedDesign = await open('Detailed CAD and drawings');
  await detailedDesign.getByLabel('Link a design').selectOption((await api(projectPath + '/records')).designs[0].id);
  await detailedDesign.getByRole('link', { name: 'Lamp assembly' }).waitFor();
  await detailedDesign.getByRole('link', { name: 'Open Design Studio' }).click();
  await studio.getByLabel('Design name').fill('Lamp enclosure');
  await studio.getByRole('button', { name: 'Create 3D model', exact: true }).click();
  await page.getByRole('heading', { name: 'Lamp enclosure', exact: true }).waitFor();
  await page.getByRole('heading', { name: '3D preview' }).waitFor();
  await page.getByLabel('Shape', { exact: true }).selectOption('circle');
  await page.getByLabel('Diameter (mm)').fill('55');
  await page.getByLabel('Height (mm)').fill('24');
  await page.getByRole('button', { name: 'Save a version', exact: true }).click();
  await page.getByText('Version 2 · Saved', { exact: true }).waitFor();
  await page.getByText(/256 facets/).waitFor();
  const nativeModel = (await api(projectPath + '/records')).designs.find(item => item.kind === 'model');
  const stlUrl = `/api/designs/${nativeModel.id}/revisions/2/stl`;
  const v2 = await page.request.get(base + stlUrl);
  assert.equal(v2.status(), 200);
  assert.equal((await v2.body()).readUInt32LE(80), 256);
  await page.getByRole('link', { name: 'Back to Journey', exact: true }).click();
  await detailedDesign.getByRole('link', { name: 'Lamp enclosure' }).waitFor();
  await done(detailedDesign);
  const parts = await open('Bill of materials');
  await parts.getByLabel('Part or material name').fill('Housing');
  await parts.getByLabel('Quantity', { exact: true }).fill('2');
  await parts.getByRole('button', { name: 'Add part' }).click();
  await done(parts);
  await checklist('Specify materials and tolerances', 'Heat-resistant housing');
  await notes('Prototype build plan', 'Assemble the enclosure.');
  const test = await open('Test plan and results');
  await test.getByLabel('What did you test?').fill('Switch');
  await test.getByLabel('What happened?').fill('The light turned on.');
  await test.getByLabel('What needs fixing? (optional)').fill('Move the switch closer.');
  await test.getByRole('button', { name: 'Record test' }).click();
  await test.getByRole('checkbox', { name: /Move the switch/ }).click();
  await test.getByText('Fixed · Move the switch closer.', { exact: true }).waitFor();
  await done(test);
  await notes('First working prototype', 'First prototype worked.');
  await approval('Final design sign-off');

  const release = await open('Production release');
  await release.getByRole('button', { name: 'Review release' }).click();
  await release.getByText('Lamp assembly · Design version 2').waitFor();
  await release.getByText(/Lamp enclosure · Design version 2/).waitFor();
  await release.getByLabel('Release name').fill('Desk light v1');
  await release.getByRole('button', { name: 'Save this release', exact: true }).click();
  await release.getByText('Desk light v1', { exact: true }).waitFor();
  await done(release);
  await notes('Launch checklist and handover notes', 'Include the illustrated assembly instructions.');
  await page.getByRole('heading', { name: 'Journey complete', exact: true }).waitFor();
  const initial = await api(projectPath + '/records');
  const saved = initial.records.find(item => item.kind === 'release');
  const fileRecord = initial.records.find(item => item.kind === 'file');
  const oldVersion = fileRecord.versions[0].id;
  assert.deepEqual(saved.data.records.map(item => item.kind), ['file','part','test']);
  assert.equal(saved.data.records.find(item => item.kind === 'test').data.fixed, true);

  await open('Concept sketches and architecture');
  await design.getByText('File versions (1)').click();
  await design.getByLabel('Save a new file version').setInputFiles({
    name: 'lamp-updated.stl', mimeType: 'application/octet-stream', buffer: Buffer.from('new design bytes')
  });
  await design.getByText('File versions (2)').waitFor();
  await design.getByRole('link', { name: 'Lamp assembly' }).click();
  await page.getByRole('heading', { name: 'Lamp assembly' }).waitFor();
  await page.getByRole('button', { name: 'Add box' }).click();
  await page.getByRole('button', { name: 'Save a version' }).click();
  await page.getByText(/revision 3/i).first().waitFor();
  await page.getByRole('link', { name: 'Back to Journey', exact: true }).click();
  await open('Bill of materials');
  await parts.getByRole('button', { name: 'Edit part' }).click();
  await parts.getByLabel('Quantity', { exact: true }).fill('3');
  await parts.getByRole('button', { name: 'Save part' }).click();
  await parts.getByText('Quantity 3').waitFor();
  const updated = await api(projectPath + '/records');
  assert.equal(updated.designs[0].revision, 3);
  assert.deepEqual(updated.records.find(item => item.id === saved.id), saved);
  await open('Detailed CAD and drawings');
  await detailedDesign.getByRole('link', { name: 'Lamp enclosure' }).click();
  await page.getByLabel('Height (mm)').fill('30');
  await page.getByRole('button', { name: 'Save a version', exact: true }).click();
  await page.getByText('Version 3 · Saved', { exact: true }).waitFor();
  const latestBody = await (await page.request.get(base + stlUrl.replace('/2/', '/3/'))).body();
  assert.notDeepEqual(latestBody, await v2.body());
  await Promise.all([
    page.waitForEvent('dialog').then(dialog => dialog.accept()),
    page.getByRole('button', { name: 'Restore version 2', exact: true }).click()
  ]);
  await page.getByText('Version 4 · Saved', { exact: true }).waitFor();
  assert.deepEqual(await (await page.request.get(base + stlUrl.replace('/2/', '/4/'))).body(), await v2.body());
  await page.getByRole('link', { name: 'Back to Journey', exact: true }).click();
  const snapshotResponse = await page.request.get(base + '/api' + projectPath + '/records/release/' + saved.id);
  assert.equal(snapshotResponse.status(), 200);
  const snapshot = await snapshotResponse.json();
  assert.equal(snapshot.designs[0].revision, 2);
  assert.equal(snapshot.designs[0].source.nodes.length, 1);
  assert.equal(snapshot.designs.find(item => item.kind === 'model').source.width, 55);
  await open('Production release');
  await release.getByText('Desk light v1', { exact: true }).click();
  assert.equal(await release.getByRole('link', { name: 'Download STL', exact: true }).getAttribute('href'), stlUrl);
  assert.equal(snapshot.records.find(item => item.kind === 'part').data.quantity, 2);
  assert.equal(await (await page.request.get(base + '/api' + projectPath + '/records/files/' + oldVersion)).text(), 'first design bytes');

  const second = await api('/projects', 'POST', { name: 'Second project', key: 'SECOND', template: 'software' });
  await page.reload();
  await page.getByRole('button', { name: 'Select project' }).click();
  await page.getByRole('option', { name: /Second project/ }).click();
  await page.getByRole('heading', { name: /Second project/ }).waitFor();
  assert.equal(await page.getByRole('progressbar', { name: 'Journey progress' }).getAttribute('value'), '0');
  await page.getByRole('heading', { name: 'Learn and improve', exact: true }).waitFor();
  const foreignVersion = await page.request.get(base + `/api/journeys/projects/${second.id}/records/files/${oldVersion}`);
  assert.equal(foreignVersion.status(), 404);
  const foreignDesign = await page.request.post(base + `/api/journeys/projects/${second.id}/records`, {
    headers: { origin: base },
    data: {
      activityId: (await api(`/journeys/projects/${second.id}`)).stages[0].activities[0].id,
      kind: 'diagram',
      designId: initial.designs[0].id
    }
  });
  assert.equal(foreignDesign.status(), 404);
  await nav.getByRole('link', { name: 'Design Studio' }).click();
  await page.getByRole('heading', { name: 'Project designs' }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Lamp assembly' }).count(), 0);
  assert.deepEqual((await api(`/journeys/projects/${second.id}/records`)).records, []);
  await page.getByRole('button', { name: 'Select project' }).click();
  await page.getByRole('option', { name: /Desk light/ }).click();
  await page.getByRole('link', { name: 'Lamp assembly' }).waitFor();
  await page.getByRole('link', { name: 'Back to Journey step' }).click();
  await page.getByRole('heading', { name: /Desk light/ }).waitFor();
  assert(Number(await page.getByRole('progressbar', { name: 'Journey progress' }).getAttribute('value')) > 0);
  layout = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  assert(layout[0] <= layout[1], String(layout));
  assert.deepEqual(errors, []);
  console.log('PASS project creation, path, optional step, approvals, native 3D model, STL, diagram versions, file attachment/history, parts, tests/fixes, immutable release, mobile and project switching');
} finally {
  await browser.close();
}
