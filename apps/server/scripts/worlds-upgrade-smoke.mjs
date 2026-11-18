// Populated 035 -> 036. NEVER point at a customer database.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import { Migrator } from 'kysely/migration';
const url = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/invalid');
if (
  process.env.NODE_ENV !== 'test' ||
  !['127.0.0.1', 'localhost'].includes(url.hostname) ||
  !/^\/worlds_upgrade_test(?:_[a-z0-9]+)?$/.test(url.pathname)
)
  throw Error('Requires an empty local worlds_upgrade_test');
const server = createServer();
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
process.env.APP_URL = baseUrl;
const { db } = await import('../src/db/index.ts');
const { migrateToLatest, requireCurrentMigrations } = await import('../src/db/migrate.ts');
const { hashPassword, newToken } = await import('../src/auth/crypto.ts');
let browser;
try {
  assert.equal(
    (await sql`SELECT to_regclass('public.products') AS p`.execute(db)).rows[0].p,
    null,
    'Requires empty fixture DB'
  );
  const dir = new URL('../src/db/migrations/', import.meta.url),
    migrations = {};
  for (const f of await readdir(dir))
    if (/^\d{3}_.+\.ts$/.test(f)) migrations[f.slice(0, -3)] = await import(new URL(f, dir));
  const step = await new Migrator({ db, provider: { getMigrations: async () => migrations } }).migrateTo(
    '035_founder_journey'
  );
  if (step.error) throw step.error;
  const ws = (await sql`INSERT INTO workspaces(name) VALUES('Historical team') RETURNING id`.execute(db)).rows[0]
    .id;
  const password = randomUUID(),
    email = 'legacy-owner@example.test';
  const hash = await hashPassword(password);
  const people = (
    await sql`INSERT INTO users(email,name,password_hash,guide_mode) VALUES(${email},'Original owner',${hash},'advanced'),('legacy-member@example.test','Original member',${hash},'beginner') RETURNING id`.execute(
      db
    )
  ).rows;
  const [owner, member] = people.map((p) => p.id);
  await sql`INSERT INTO memberships(workspace_id,user_id,role) VALUES(${ws},${owner},'owner'),(${ws},${member},'member')`.execute(
    db
  );
  const session = newToken();
  await sql`INSERT INTO sessions(id,user_id,workspace_id,expires_at) VALUES(${session.hash},${owner},${ws},now()+interval '1 day')`.execute(
    db
  );
  const a = (
    await sql`INSERT INTO products(workspace_id,name,stage,description,notes,target_price,overhead,product_kind) VALUES(${ws},'Legacy pilot',' testing ','Recorded concept','Historical research notebook',25,0,'software') RETURNING id`.execute(
      db
    )
  ).rows[0].id;
  const b = (
    await sql`INSERT INTO products(workspace_id,name,stage,description,product_kind) VALUES(${ws},'Second product','Launch','Another concept','service') RETURNING id`.execute(
      db
    )
  ).rows[0].id;
  await sql`INSERT INTO stage_history(product_id,from_stage,to_stage) VALUES(${a},NULL,'Idea'),(${a},'Idea','Research'),(${a},'Design','Prototype'),(${a},'Prototype','Testing')`.execute(
    db
  );
  const ambiguous = (
    await sql`INSERT INTO products(workspace_id,name,stage) VALUES(${ws},'Unplaced version','alpha-2') RETURNING id`.execute(
      db
    )
  ).rows[0].id;
  await sql`INSERT INTO answers(product_id,question_key,value) VALUES(${ambiguous},'planning.risk','"Unconfirmed timeline"')`.execute(
    db
  );
  const answers = {
    'idea.problem': 'Original problem',
    'idea.customer': 'Original audience',
    'idea.promise': 'A useful saving',
    'research.finding': ['Founder assumption', 'Unverified note', ''],
    'testing.testers': 0,
    'research.validated': false,
    'testing.criteria': 'Actual protocol',
    'planning.priorities': { oldFormat: 'do not rewrite' }
  };
  for (const [key, v] of Object.entries(answers))
    await sql`INSERT INTO answers(product_id,question_key,value,answered_by,answered_at) VALUES(${a},${key},${JSON.stringify(v)}::jsonb,${member},'2026-02-03')`.execute(
      db
    );
  await sql`INSERT INTO activity_records(product_id,activity_key,status,review_state,reviewed_by,review_note) VALUES(${a},'testing.criteria','completed','approved',${owner},'Retain review')`.execute(
    db
  );
  await sql`INSERT INTO activity_drafts(product_id,user_id,question_key,value,previous_value) VALUES(${a},${member},'testing.results','"private"','null')`.execute(
    db
  );
  await sql`INSERT INTO tasks(product_id,title,status) VALUES(${a},'Original unlinked task','in_progress')`.execute(
    db
  );
  const doc = (
    await sql`INSERT INTO design_documents(workspace_id,product_id,title,kind,owner_id) VALUES(${ws},${a},'Pilot flow','diagram',${member}) RETURNING id`.execute(
      db
    )
  ).rows[0].id;
  await sql`INSERT INTO design_revisions(document_id,revision,source,author_id) VALUES(${doc},1,'{"schemaVersion":1,"nodes":[{"id":"n","label":"Confirm booking","x":10,"y":10}],"edges":[]}',${member})`.execute(
    db
  );
  await sql`INSERT INTO xp_events(workspace_id,user_id,product_id,kind,ref,points,label,created_at) SELECT ${ws},${owner},${a},'answer',concat('prior:',n),15,'Historical answer','2026-02-01'::date+n FROM generate_series(1,10)n`.execute(
    db
  );
  await sql`INSERT INTO suppliers(workspace_id,name) SELECT ${ws},concat('Existing supplier ',n) FROM generate_series(1,3)n`.execute(
    db
  );
  // Expected cutover baseline, decided from the old records before running any transformation.
  await sql`INSERT INTO xp_events(workspace_id,user_id,product_id,kind,ref,points,label,created_at) VALUES(${ws},${owner},${a},'quest_complete',${a + ':Idea'},100,'Historical checkpoint','2026-02-10')`.execute(
    db
  );
  const expected = {
    xp: 250,
    world: 'Testing',
    units: 3,
    originalTask: 'Original unlinked task',
    secondWorld: 'Launch'
  };
  const report = () =>
    JSON.parse(
      execFileSync(process.execPath, ['--import', 'tsx', 'apps/server/src/scripts/journey-report.ts'], {
        encoding: 'utf8'
      })
    );
  const pre = report();
  assert.equal(pre.phase, 'pre-036');
  assert.equal(Number(pre.inventory.xp), 250);
  await migrateToLatest();
  await migrateToLatest();
  await requireCurrentMigrations();
  const read = async () => ({
    xp: (await sql`SELECT sum(points)::int AS n FROM xp_events`.execute(db)).rows[0].n,
    receipts: (await sql`SELECT count(*)::int AS n FROM journey_stamps`.execute(db)).rows[0].n,
    imports: (await sql`SELECT count(*)::int AS n FROM journey_upgrades`.execute(db)).rows[0].n,
    answers: (await sql`SELECT count(*)::int AS n FROM answers`.execute(db)).rows[0].n
  });
  const post = report();
  for (const k of Object.keys(pre.inventory).filter((k) => k !== 'answers'))
    assert.equal(post.inventory[k], pre.inventory[k], k);
  assert.equal(post.inventory.answers, pre.inventory.answers + post.upgrades[0].exact_field_matches);
  assert.equal(post.upgrades[0].positions_to_confirm, 1);
  const baseline = await read();
  assert.equal(baseline.xp, expected.xp);
  assert.equal(baseline.imports, 3);
  await sql`UPDATE products SET target_price=20,labour=2 WHERE id=${b}`.execute(db);
  await db.transaction().execute((trx) => migrations['036_world_progression'].up(trx));
  assert.deepEqual(await read(), baseline);
  assert.equal(
    (await sql`SELECT count(*)::int AS n FROM builder_badges WHERE badge='margin_master'`.execute(db)).rows[0].n,
    0,
    'Direct retry must not recompute legacy entitlements from later records'
  );
  const { createApp } = await import('../src/app.ts');
  server.on('request', createApp());
  const base = baseUrl + '/api';
  let cookie = `sv_session=${session.token}`;
  async function call(path, method = 'GET', body, status = 200) {
    const r = await fetch(base + path, {
      method,
      headers: { cookie, origin: process.env.APP_URL, 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const json = await r.json().catch(() => null);
    assert.equal(r.status, status, `${path}: ${JSON.stringify(json)}`);
    return json;
  }
  assert.equal((await call('/auth/me')).user.id, owner);
  const me = await call('/auth/login', 'POST', { email, password });
  assert.equal(me.user.guideMode, 'advanced');
  assert.equal(me.workspace.id, ws);
  assert.equal(me.user.showStreak, false);
  const pos = (await call(`/products/${ambiguous}/activities`)).trail;
  assert.equal(pos.upgrade.needsPlacement, true);
  assert.equal(pos.next.key, 'planning.mvp');
  const repair = await call(`/products/${ambiguous}/placement`, 'POST', { stage: 'Prototype' });
  assert.deepEqual(repair.xp, []);
  assert.equal(repair.data.stage, 'Prototype');
  assert.equal(repair.data.answers['planning.risk'], 'Unconfirmed timeline');
  await call(`/products/${ambiguous}/placement`, 'POST', { stage: 'Improvement' }, 409);
  const data = await call('/workspace/data'),
    p = data.products.find((p) => p.id === a);
  assert.equal(p.stage, expected.world);
  assert.equal(p.tasks[0].title, expected.originalTask);
  assert.equal(p.answers['idea.oneliner'], 'Recorded concept');
  assert.equal(p.answers['planning.target_price'], 25);
  assert.equal(p.answers['prototype.overhead'], undefined);
  assert.equal(p.answers['testing.testers'], 0);
  assert.equal(p.answers['research.validated'], false);
  assert.deepEqual(p.answers['planning.priorities'], answers['planning.priorities']);
  assert.equal(p.notes, 'Historical research notebook');
  const t = (await call(`/products/${a}/activities`)).trail;
  assert.equal(t.upgrade.originalStage, ' testing ');
  assert.equal(t.upgrade.counts.unlinkedTasks, 1);
  assert.equal(t.upgrade.counts.designs, 1);
  assert.ok(t.sources.find((s) => s.id === doc)?.excerpt.includes('Confirm booking'));
  assert.ok(t.worlds[0].finished);
  assert.equal(t.worlds[0].units.filter((u) => u.complete).length, expected.units);
  assert.ok(!t.worlds[1].ready);
  assert.ok(t.worlds[1].recognised);
  assert.equal(t.worlds[5].lock, null);
  assert.ok(t.worlds[6].lock);
  assert.ok(t.next.key.startsWith('testing.'));
  assert.equal(t.worlds[2].units[0].lessons.find((l) => l.key === 'planning.priorities').state, 'needs_review');
  assert.deepEqual(await call('/products/drafts'), []);
  const t2 = (await call(`/products/${b}/activities`)).trail;
  assert.equal(t2.worlds[6].lock, null);
  assert.ok(!t2.worlds[0].finished);
  assert.ok(!t2.sources.some((s) => s.id === doc));
  assert.equal(t2.next.key.split('.')[0], 'launch');
  const g = await call('/game/me');
  assert.equal(g.xp, 250);
  assert.equal(g.longestStreak, 10);
  assert.equal(g.streakDays, 0);
  assert.equal(g.achievements.find((b) => b.id === 'curious').unlocked, true);
  assert.equal(g.achievements.find((b) => b.id === 'scout').legacyTeam, true);
  assert.equal(g.levelHistory[0].level, 2);
  assert.ok((await call('/game/history')).rows.every((x) => x.origin === 'legacy'));
  assert.deepEqual((await call(`/products/${a}/worlds/Idea/finish`, 'POST', {})).xp, []);
  await call(`/products/${a}/worlds/Testing/check`, 'POST', {}, 409);
  const old =
    await sql`SELECT answered_at::date::text AS day,answered_by FROM answers WHERE product_id=${a} AND question_key='testing.criteria'`.execute(
      db
    );
  assert.deepEqual(old.rows[0], { day: '2026-02-03', answered_by: member });
  assert.equal((await call('/workspace/members')).length, 2);
  assert.equal((await call(`/products/${a}/activities`)).records['testing.criteria'].reviewNote, 'Retain review');
  assert.equal((await read()).xp, 250);
  if (process.env.WORLDS_UPGRADE_BROWSER === '1') {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({
      executablePath: process.env.BROWSER_EXECUTABLE || chromium.executablePath(),
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage']
    });
    const page = await browser.newPage({ viewport: { width: 768, height: 1024 } });
    page.setDefaultTimeout(9000);
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(baseUrl + '/login');
    await page.getByRole('button', { name: 'Essential only' }).click();
    await page.getByLabel('Work email').fill(email);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    const select = page.getByLabel('Current product');
    await select.selectOption(a);
    await page.getByRole('heading', { name: 'Legacy pilot / Testing' }).waitFor();
    await page.getByText('Your journey has been upgraded.', { exact: true }).waitFor();
    await select.selectOption(b);
    await page.getByRole('heading', { name: 'Second product / Launch' }).waitFor();
    await page.goto(baseUrl + `/products/${a}/discover?stage=Planning&q=planning.priorities`);
    await page.getByText(/Previous format · review before replacing/).waitFor();
    await page.goto(baseUrl + '/achievements');
    await page.getByRole('button', { name: 'View all XP transactions' }).click();
    await page
      .getByText(/Pre-upgrade credit/)
      .first()
      .waitFor();
    assert.deepEqual(errors, []);
    assert.equal((await read()).xp, 250);
    console.log(
      'PASS browser signs into a populated legacy team without onboarding; selects independent product paths, inspects a malformed saved answer and reads original transactions.'
    );
  }
  console.log(
    'PASS populated 035 → 036, existing login/session and roles, multiple paths, exact field recognition, unlinked task/diagram/private draft/sign-off preserved, uncertain work flagged, 250 old XP, durable badges, no retroactive or duplicate rewards on rerun.'
  );
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((r) => server.close(r));
  await db.destroy();
}
