// Exercise the real assistant request, prompt selection, fallback and usage ledger
// against a metered localhost provider fixture. No credentials or external models.
import assert from 'node:assert/strict';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
const dbUrl = new URL(process.env.DATABASE_URL || 'postgres://invalid/invalid');
if (
  process.env.NODE_ENV !== 'test' ||
  !['localhost', '127.0.0.1'].includes(dbUrl.hostname) ||
  !dbUrl.pathname.endsWith('_test')
)
  throw Error('Requires a disposable localhost *_test PostgreSQL database');
const listen = (server) =>
  new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}`)));
let calls = [],
  fail = false;
const fake = http.createServer(async (req, res) => {
  let body = '';
  for await (const chunk of req) body += chunk;
  calls.push(JSON.parse(body));
  if (fail) return res.writeHead(429).end();
  res
    .writeHead(200, { 'content-type': 'application/json' })
    .end(
      JSON.stringify({
        choices: [{ message: { content: 'Suggestion: try offering one slot manually.' } }],
        usage: { total_tokens: 37 }
      })
    );
});
const provider = await listen(fake);
process.env.ASSISTANT_AI_ENABLED = 'true';
process.env.ASSISTANT_PROVIDERS = JSON.stringify([{ name: 'fixture', baseUrl: provider, model: 'fixture' }]);
const { createApp } = await import('../src/app.ts');
const { db } = await import('../src/db/index.ts');
const server = http.createServer(createApp()),
  base = await listen(server);
try {
  async function call(cookie, method, path, body, status = 200) {
    const r = await fetch(`${base}/api${path}`, {
      method,
      headers: {
        origin: process.env.APP_URL || 'http://localhost:5173',
        ...(cookie ? { cookie } : {}),
        ...(body ? { 'content-type': 'application/json' } : {})
      },
      body: JSON.stringify(body)
    });
    const data = await r.json().catch(() => null);
    assert.equal(r.status, status, JSON.stringify(data));
    return { cookie: r.headers.get('set-cookie')?.split(';')[0], data };
  }
  const register = (inviteToken) =>
    call(
      '',
      'POST',
      '/auth/register',
      {
        name: 'Provider fixture',
        workspaceName: 'Provider fixture',
        email: `fixture-${randomUUID()}@example.test`,
        password: randomUUID(),
        inviteToken
      },
      201
    );
  const owner = await register(),
    foreign = await register(),
    member = await register(
      new URL((await call(owner.cookie, 'POST', '/workspace/invites', { role: 'member' }, 201)).data.url).pathname
        .split('/')
        .pop()
    );
  const product = (
    await call(
      owner.cookie,
      'POST',
      '/products',
      { name: 'Pilot notebook', startingStage: 'Planning', productKind: 'service', guideMode: 'advanced' },
      201
    )
  ).data.data;
  await call(owner.cookie, 'POST', '/products', { name: 'DO_NOT_SEND_OTHER_PRODUCT' }, 201);
  await call(owner.cookie, 'PUT', `/products/${product.id}/answers/idea.problem`, { value: 'Late cancellations' });
  await call(
    member.cookie,
    'PUT',
    `/products/${product.id}/drafts/planning.mvp`,
    { value: 'DO_NOT_SEND_MEMBER_DRAFT', previousValue: null },
    204
  );
  await call(owner.cookie, 'PATCH', `/products/${product.id}`, {
    costs: { overhead: 2 },
    notes: 'Keep a manual confirmation step'
  });
  await call(
    owner.cookie,
    'POST',
    `/products/${product.id}/tasks`,
    { title: 'Review the overdue pilot', dueDate: '2020-03-01' },
    201
  );
  const route = `/products/${product.id}/lessons/planning.mvp/assist`,
    body = { draft: 'A tutor can offer a time', message: 'Help rewrite my draft' };
  const ask = async () => (await call(owner.cookie, 'POST', route, body)).data;
  assert.equal((await ask()).source, 'guide');
  assert.equal(calls.length, 0, 'no provider call without allowance');
  await db
    .insertInto('assistant_allowances')
    .values({ workspace_id: owner.data.workspace.id, remaining_tokens: 100000, updated_at: new Date() })
    .onConflict((c) => c.column('workspace_id').doUpdateSet({ remaining_tokens: 100000 }))
    .execute();
  await call(foreign.cookie, 'POST', route, body, 404);
  assert.equal(calls.length, 0);
  const reply = await ask();
  assert.equal(reply.source, 'ai');
  assert.match(reply.text, /Suggestion:/);
  assert.equal(calls.length, 1);
  const prompt = calls[0].messages[1].content;
  for (const included of [
    'Pilot notebook',
    'Late cancellations',
    'manual confirmation',
    'Review the overdue pilot',
    'advanced',
    'Planning',
    'A tutor can offer a time',
    '"overhead":2'
  ])
    assert.ok(prompt.includes(included), included);
  for (const excluded of ['DO_NOT_SEND', 'password_hash', foreign.data.user.email, member.data.user.email])
    assert.ok(!prompt.includes(excluded));
  assert.match(calls[0].messages[0].content, /Never invent/);
  assert.equal(
    (await call(owner.cookie, 'GET', '/workspace/data')).data.products.find((p) => p.id === product.id).answers[
      'planning.mvp'
    ],
    undefined
  );
  assert.deepEqual((await call(owner.cookie, 'GET', '/products/drafts')).data, []);
  const usage = await db
    .selectFrom('assistant_usage')
    .select(['charged_tokens', 'conversation_id', 'status'])
    .where('workspace_id', '=', owner.data.workspace.id)
    .executeTakeFirstOrThrow();
  assert.equal(Number(usage.charged_tokens), 37);
  assert.equal(usage.conversation_id, null);
  assert.equal(usage.status, 'success');
  const next = (await call(owner.cookie, 'POST', route, { message: 'What should I do next?' })).data;
  assert.equal(next.source, 'guide');
  assert.equal(next.next.href, `/products/${product.id}/tasks`);
  assert.equal(calls.length, 1);
  fail = true;
  assert.equal((await ask()).source, 'guide');
  assert.equal(calls.length, 2);
  console.log(
    'PASS real copilot adapter and metering with local provider, bounded context, member draft and tenant isolation, no automatic writes, unavailable-provider and exhausted-credit fallback'
  );
} finally {
  await new Promise((r) => server.close(r));
  await new Promise((r) => fake.close(r));
  await db.destroy();
}
