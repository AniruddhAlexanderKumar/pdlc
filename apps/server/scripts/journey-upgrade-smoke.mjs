// Dedicated empty database only. Verifies the upgrade over actual 034 data,
// not just whether all the migrations run on an empty schema.
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { sql } from 'kysely';
import { Migrator } from 'kysely/migration';
const url = new URL(process.env.DATABASE_URL ?? 'postgres://invalid/invalid');
if (
  process.env.NODE_ENV !== 'test' ||
  !['localhost', '127.0.0.1'].includes(url.hostname) ||
  url.pathname !== '/journey_upgrade_test'
)
  throw Error('Requires the empty disposable local journey_upgrade_test database');
const { db } = await import('../src/db/index.ts');
const { migrateToLatest, requireCurrentMigrations } = await import('../src/db/migrate.ts');
try {
  const existing = await sql`SELECT to_regclass('public.products') AS present`.execute(db);
  assert.equal(existing.rows[0].present, null, 'Requires empty fixture DB');
  const migrations = {},
    dir = new URL('../src/db/migrations/', import.meta.url);
  for (const file of await readdir(dir))
    if (/^\d{3}_.+\.ts$/.test(file)) migrations[file.slice(0, -3)] = await import(new URL(file, dir));
  const old = new Migrator({ db, provider: { getMigrations: async () => migrations } });
  const first = await old.migrateTo('034_activity_collaboration');
  if (first.error) throw first.error;
  const ws = (await sql`INSERT INTO workspaces(name) VALUES ('Upgrade fixture') RETURNING id`.execute(db)).rows[0].id;
  const users = (
    await sql`INSERT INTO users(email,name,password_hash) VALUES ('a@fixture.test','A','unused'),('b@fixture.test','B','unused'),('c@fixture.test','C','unused') RETURNING id`.execute(
      db
    )
  ).rows;
  const p = (
    await sql`INSERT INTO products(workspace_id,name,stage) VALUES (${ws},'Existing product','Research') RETURNING id`.execute(
      db
    )
  ).rows[0].id;
  const ref = `${p}:idea.problem`;
  await sql`INSERT INTO answers(product_id,question_key,value,answered_by,answered_at) VALUES (${p},'idea.problem','"Older answer"',${users[0].id},'2026-01-02'),(${p},'research.validated','false',${users[1].id},'2026-01-03')`.execute(
    db
  );
  await sql`INSERT INTO stage_history(product_id,to_stage) VALUES (${p},'Prototype'),(${p},'Research')`.execute(db);
  const task = (
    await sql`INSERT INTO tasks(product_id,title,status) VALUES (${p},'Unlinked legacy work','done') RETURNING id`.execute(
      db
    )
  ).rows[0].id;
  await sql`INSERT INTO activity_records(product_id,activity_key,status,review_state,reviewed_by,review_note) VALUES (${p},'testing.criteria','completed','approved',${users[1].id},'Preserve this decision')`.execute(
    db
  );
  for (const user of users.slice(0, 2))
    await sql`INSERT INTO xp_events(workspace_id,user_id,product_id,kind,ref,points,label) VALUES (${ws},${user.id},${p},'answer',${ref},15,'Historical credit')`.execute(
      db
    );
  await migrateToLatest(() => {});
  await migrateToLatest(() => {});
  await requireCurrentMigrations();
  const product = await db.selectFrom('products').selectAll().where('id', '=', p).executeTakeFirstOrThrow();
  assert.equal(product.product_kind, 'other');
  assert.equal(product.legacy_stage, 'Prototype');
  assert.equal(product.stage, 'Research');
  assert.deepEqual(
    (await db.selectFrom('answers').select('value').where('product_id', '=', p).orderBy('question_key').execute()).map(
      (x) => x.value
    ),
    ['Older answer', false]
  );
  const records = await db
    .selectFrom('activity_records')
    .selectAll()
    .where('product_id', '=', p)
    .orderBy('activity_key')
    .execute();
  assert.equal(records[0].completed_at.toISOString(), '2026-01-02T00:00:00.000Z');
  assert.equal(records[0].completed_by, users[0].id);
  assert.equal(records[1].review_state, 'none');
  assert.equal(records[1].completed_at, null);
  assert.equal(records[1].status, 'in_progress');
  assert.equal(records[2].reviewed_by, users[1].id);
  assert.equal(records[2].review_note, 'Preserve this decision');
  assert.equal(records[2].review_state, 'approved');
  assert.deepEqual(
    await db
      .selectFrom('tasks')
      .select(['chapter', 'title', 'status'])
      .where('id', '=', task)
      .executeTakeFirstOrThrow(),
    { chapter: null, title: 'Unlinked legacy work', status: 'done' }
  );
  assert.equal(
    (
      await sql`INSERT INTO xp_events(workspace_id,user_id,product_id,kind,ref,points,label) VALUES (${ws},${users[2].id},${p},'answer',${ref},15,'Retry') ON CONFLICT DO NOTHING RETURNING id`.execute(
        db
      )
    ).rows.length,
    0
  );
  const xp = await db
    .selectFrom('xp_events')
    .select(['first_credit', 'points'])
    .where('workspace_id', '=', ws)
    .execute();
  assert.equal(xp.filter((x) => x.first_credit).length, 1);
  assert.equal(
    xp.reduce((n, x) => n + x.points, 0),
    30
  );
  console.log(
    'PASS populated 034 → 035, answered-at and owner retained, no invented approval, visited stage retained, both historical credits preserved with no third credit, idempotent re-run'
  );
} finally {
  await db.destroy();
}
