// End-to-end API smoke test against a running server (default http://localhost:4000).
// Creates throwaway users. Never run it against production.
//   SMOKE_URL=http://localhost:4000 SMOKE_ORIGIN=http://localhost:5173 npm run smoke --workspace @sv/server
const B = (process.env.SMOKE_URL ?? 'http://localhost:4000') + '/api';
let cookie = '';
const pw = 'Test-' + Math.random().toString(36).slice(2) + '9x';
async function call(method, path, body, opts = {}) {
  const r = await fetch(B + path, { method, headers: { 'content-type': 'application/json', origin: opts.origin ?? (process.env.SMOKE_ORIGIN ?? 'http://localhost:5173'), cookie }, body: body ? JSON.stringify(body) : undefined });
  const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
  const t = await r.text(); let j; try { j = JSON.parse(t) } catch { j = t }
  return { s: r.status, j };
}
const ok = (c, m) => { console.log((c ? 'PASS' : 'FAIL') + ' ' + m); if (!c) process.exitCode = 1; };
const email = `t${Date.now()}@example.com`;
let r = await call('GET', '/auth/config'); ok(r.s===200, 'config ' + JSON.stringify(r.j));
r = await call('POST', '/auth/register', { name: 'Test User', email, password: 'short' }); ok(r.s===400, 'weak pw rejected: ' + r.j.error);
r = await call('POST', '/auth/register', { name: 'Test User', email, password: pw, workspaceName: 'Test Co' }); ok(r.s===201 && r.j.workspace.role==='owner', 'register ' + r.s);
r = await call('POST', '/auth/register', { name: 'X', email, password: pw }); ok(r.s===409, 'dup email 409');
r = await call('GET', '/auth/me'); ok(r.s===200, 'me');
r = await call('POST', '/products', { name: 'Evil' }, { origin: 'https://evil.example' }); ok(r.s===403, 'cross-origin blocked');
r = await call('POST', '/workspace/sample-data'); ok(r.s===201 && r.j.products.length===4, 'sample data ' + r.s + ' ' + (r.j.error||''));
r = await call('POST', '/workspace/sample-data'); ok(r.s===409, 'sample twice 409');
const data = (await call('GET', '/workspace/data')).j;
const bottle = data.products.find(p => p.name.includes('Bottle'));
ok(bottle && Object.keys(bottle.answers).length > 5, 'bottle answers loaded');
r = await call('POST', '/products', { name: 'New Thing', targetSellingPrice: 20 }); ok(r.s===201 && r.j.xp.length>=1, 'create product xp ' + JSON.stringify(r.j.xp));
const pid = r.j.data.id;
r = await call('PUT', `/products/${pid}/answers/idea.problem`, { value: 'People need things' }); ok(r.s===200 && r.j.xp[0]?.points===15, 'answer xp ' + JSON.stringify(r.j.xp));
r = await call('PUT', `/products/${pid}/answers/idea.problem`, { value: 'People need things v2' }); ok(r.s===200 && r.j.xp.length===0, 'no double xp');
r = await call('PUT', `/products/${pid}/answers/idea.excitement`, { value: 9 }); ok(r.s===400, 'scale validated: ' + r.j.error);
r = await call('PUT', `/products/${pid}/answers/idea.customer`, { value: 'Makers' });
r = await call('PUT', `/products/${pid}/answers/idea.oneliner`, { value: 'A thing for makers' }); ok(r.j.data.description==='A thing for makers', 'oneliner synced to description; xp ' + JSON.stringify(r.j.xp));
r = await call('POST', `/products/${pid}/tasks`, { title: 'Do it', dueDate: '2026-01-01' }); ok(r.s===201, 'task create');
const tid = r.j.data.tasks[0].id;
r = await call('PATCH', `/products/${pid}/tasks/${tid}`, { status: 'done' }); ok(r.j.xp[0]?.points===15, 'task done xp');
r = await call('PATCH', `/products/${pid}/tasks/${tid}`, { status: 'todo' }); r = await call('PATCH', `/products/${pid}/tasks/${tid}`, { status: 'done' }); ok(r.j.xp.length===0, 'no task farming');
r = await call('PATCH', `/products/${pid}`, { stage: 'Research' }); ok(r.j.xp.some(x=>x.points===50), 'stage advance xp ' + JSON.stringify(r.j.xp));
const steel = data.materials.find(m => m.name.includes('Steel'));
r = await call('PUT', `/products/${pid}/materials/${steel.id}`, { quantity: 2 }); ok(r.s===200 && r.j.data.materials.length===1, 'bom add');
r = await call('GET', `/products/${bottle.id}/insights`); ok(r.s===200, 'insights: ' + r.j.map(i => `[${i.tone}] ${i.title}`).join(' | '));
const sw = r.j.find(i => i.action?.type === 'switch_supplier');
r = await call('POST', `/products/${bottle.id}/insights/apply`, { insightId: sw.id }); ok(r.s===200 && r.j.xp.some(x=>x.points===25), 'apply supplier ' + JSON.stringify(r.j.xp));
r = await call('POST', `/products/${bottle.id}/insights/apply`, { insightId: sw.id }); ok(r.s===409, 'stale insight 409');
r = await call('GET', '/game/me'); ok(r.s===200 && r.j.xp>0, `game: xp=${r.j.xp} L${r.j.level} ${r.j.levelTitle} streak=${r.j.streakDays} unlocked=${r.j.achievements.filter(a=>a.unlocked).map(a=>a.id)}`);
r = await call('GET', '/game/leaderboard'); ok(r.s===200 && r.j.length===1, 'leaderboard');
r = await call('POST', '/workspace/invites', { role: 'member' }); ok(r.s===201 && r.j.url.includes('/join/'), 'invite created');
const inviteToken = r.j.url.split('/join/')[1];
const ownerCookie = cookie; cookie='';
r = await call('GET', `/auth/invite/${inviteToken}`); ok(r.s===200 && r.j.workspaceName==='Test Co', 'invite lookup');
r = await call('POST', '/auth/register', { name: 'Member', email: 'm'+email, password: pw, inviteToken }); ok(r.s===201 && r.j.workspace.role==='member' && r.j.workspace.name==='Test Co', 'join via invite');
r = await call('PATCH', '/workspace', { name: 'Hacked' }); ok(r.s===403, 'member cannot edit workspace');
r = await call('GET', '/workspace/data'); ok(r.j.products.length===5, 'member sees shared products');
cookie=''; r = await call('POST', '/auth/register', { name: 'Again', email: 'n'+email, password: pw, inviteToken }); ok(r.s===410, 'invite single use');
cookie = ownerCookie;
r = await call('POST', '/auth/logout'); ok(r.s===204, 'logout');
r = await call('GET', '/auth/me'); ok(r.s===401, 'me after logout 401');
r = await call('POST', '/auth/login', { email, password: 'wrong-password1' }); ok(r.s===401, 'bad login 401');
r = await call('POST', '/auth/login', { email: email.toUpperCase(), password: pw }); ok(r.s===200, 'login case-insensitive');
r = await call('DELETE', `/products/${pid}`); ok(r.s===204, 'delete product');
r = await call('GET', `/products/00000000-0000-0000-0000-000000000000/insights`); ok(r.s===404, '404 product');
if (process.exitCode) console.log('\nSome checks failed.');
