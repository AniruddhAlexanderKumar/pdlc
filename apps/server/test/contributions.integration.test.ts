import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:net';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { after, before, test } from 'node:test';
import EmbeddedPostgres from 'embedded-postgres';

const scratch = path.resolve(process.cwd(), `.tmp-contribution-test-${process.pid}`);
const databaseDir = path.join(scratch, 'data');
const tempDir = path.join(scratch, 'tmp');
let postgres: InstanceType<typeof EmbeddedPostgres>;
let postgresStarted = false;
let db: (typeof import('../src/db/index.js'))['db'] | undefined;
let server: Server | undefined;
let port: number;

async function unusedPort(): Promise<number> {
  const listener = createServer();
  await new Promise<void>((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const address = listener.address();
  assert.ok(address && typeof address !== 'string');
  await new Promise<void>((resolve, reject) => listener.close((error) => error ? reject(error) : resolve()));
  return address.port;
}

before(async () => {
  await mkdir(tempDir, { recursive: true });
  process.env.TMP = tempDir;
  process.env.TEMP = tempDir;
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'silent';
  port = await unusedPort();
  process.env.DATABASE_URL = `postgres://sv_test:sv_test_only@127.0.0.1:${port}/sv_test`;

  postgres = new EmbeddedPostgres({ databaseDir, user: 'sv_test', password: 'sv_test_only', port, persistent: false });
  await postgres.initialise();
  await postgres.start();
  postgresStarted = true;
  await postgres.createDatabase('sv_test');

  const { migrateToLatest } = await import('../src/db/migrate.js');
  await migrateToLatest(() => {});
  ({ db } = await import('../src/db/index.js'));
  const { createApp } = await import('../src/app.js');
  server = createApp().listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server!.once('listening', resolve);
    server!.once('error', reject);
  });
});

after(async () => {
  if (server) {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server!.close((error) => error ? reject(error) : resolve()));
  }
  if (db) await db.destroy();
  if (postgresStarted) await postgres.stop();
  await rm(scratch, { recursive: true, force: true });
});

const password = 'Test-Password42!';
const origin = 'http://localhost:5173';

async function call(cookie: string | undefined, method: string, route: string, body?: unknown) {
  assert.ok(server);
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const response = await fetch(`http://127.0.0.1:${address.port}/api${route}`, {
    method,
    headers: {
      origin,
      ...(cookie ? { cookie } : {}),
      ...(body ? { 'content-type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  return {
    status: response.status,
    json: text ? JSON.parse(text) : null,
    cookie: response.headers.get('set-cookie')?.split(';')[0]
  };
}

test('contribution review is permissioned, auditable, idempotent, and workspace-scoped', async () => {
  const owner = await call(undefined, 'POST', '/auth/register', {
    name: 'Owner',
    email: 'owner@test.invalid',
    password,
    workspaceName: 'First workspace'
  });
  assert.equal(owner.status, 201);
  const ownerCookie = owner.cookie!;
  const ownerId = owner.json.user.id as string;
  assert.equal(owner.json.user.language, 'en');
  const anonymousLanguage = await call(undefined, 'POST', '/auth/language', { language: 'hi' });
  assert.equal(anonymousLanguage.status, 401);
  const savedLanguage = await call(ownerCookie, 'POST', '/auth/language', { language: 'hi' });
  assert.equal(savedLanguage.status, 204);
  const refreshedMe = await call(ownerCookie, 'GET', '/auth/me');
  assert.equal(refreshedMe.json.user.language, 'hi');
  const unsupportedLanguage = await call(ownerCookie, 'POST', '/auth/language', { language: 'xx' });
  assert.equal(unsupportedLanguage.status, 400);
  const invite = await call(ownerCookie, 'POST', '/workspace/invites', { role: 'admin' });
  assert.equal(invite.status, 201);
  const reviewer = await call(undefined, 'POST', '/auth/register', {
    name: 'Reviewer',
    email: 'reviewer@test.invalid',
    password,
    inviteToken: invite.json.url.split('/join/')[1]
  });
  assert.equal(reviewer.status, 201);
  const reviewerCookie = reviewer.cookie!;

  const submission = {
    idempotencyKey: 'submission-key-001',
    categoryKey: 'engineering',
    title: 'Deliver reliable feature',
    description: 'Implemented and validated the capability.',
    outcome: 'Accepted feature',
    expectedImpact: 'Improves workflow',
    participants: [{
      userId: ownerId,
      roleDescription: 'Implementer',
      contributionDescription: 'Built and tested.',
      attributionShare: 100
    }],
    evidence: [{
      sourceType: 'url',
      url: 'https://example.test/work',
      description: 'Reviewed delivery evidence'
    }]
  };
  const tooSmall = await call(ownerCookie, 'POST', '/contributions', submission);
  assert.equal(tooSmall.status, 409);

  const teamInvite = await call(ownerCookie, 'POST', '/workspace/invites', { role: 'member' });
  const teamMember = await call(undefined, 'POST', '/auth/register', {
    name: 'Third Member',
    email: 'third-member@test.invalid',
    password,
    inviteToken: teamInvite.json.url.split('/join/')[1]
  });
  assert.equal(teamMember.status, 201);

  const created = await call(ownerCookie, 'POST', '/contributions', submission);
  assert.equal(created.status, 201);
  const contributionId = created.json.id as string;
  const retried = await call(ownerCookie, 'POST', '/contributions', submission);
  assert.equal(retried.status, 200);
  assert.equal(retried.json.id, contributionId);
  const submitted = await call(ownerCookie, 'POST', `/contributions/${contributionId}/submit`, {});
  assert.equal(submitted.json.status, 'submitted');
  const evidenceId = submitted.json.evidence[0].id as string;
  const scores = [{
    userId: ownerId,
    ratings: { impact: 4, quality: 4, complexity: 3, collaboration: 2, effort: 2 },
    explanation: 'Evidence supports the outcome and dimension ratings.'
  }];
  const selfReview = await call(ownerCookie, 'POST', `/contributions/${contributionId}/review`, {
    decision: 'approved', notes: 'Self-review should fail.', scores
  });
  assert.equal(selfReview.status, 403);
  const selfVerification = await call(ownerCookie, 'POST', `/contributions/${contributionId}/evidence/${evidenceId}/verify`, {});
  assert.equal(selfVerification.status, 403);

  const removedThirdMember = await call(ownerCookie, 'DELETE', `/workspace/members/${teamMember.json.user.id}`);
  assert.equal(removedThirdMember.status, 204);
  const blockedApproval = await call(reviewerCookie, 'POST', `/contributions/${contributionId}/review`, {
    decision: 'approved', notes: 'Contribution scoring is disabled for two members.', scores
  });
  assert.equal(blockedApproval.status, 409);

  const replacementInvite = await call(ownerCookie, 'POST', '/workspace/invites', { role: 'member' });
  const replacementMember = await call(undefined, 'POST', '/auth/register', {
    name: 'Replacement Third Member',
    email: 'replacement-third-member@test.invalid',
    password,
    inviteToken: replacementInvite.json.url.split('/join/')[1]
  });
  assert.equal(replacementMember.status, 201);

  const requestedRevision = await call(reviewerCookie, 'POST', `/contributions/${contributionId}/review`, {
    decision: 'revision_requested',
    notes: 'Clarify the delivered outcome.'
  });
  assert.equal(requestedRevision.json.status, 'revision_requested');
  const revised = await call(ownerCookie, 'PATCH', `/contributions/${contributionId}`, {
    description: 'Implemented, tested, and documented the accepted capability.'
  });
  assert.equal(revised.status, 200);
  const resubmitted = await call(ownerCookie, 'POST', `/contributions/${contributionId}/submit`, {});
  assert.equal(resubmitted.json.status, 'submitted');

  const verified = await call(reviewerCookie, 'POST', `/contributions/${contributionId}/evidence/${evidenceId}/verify`, {});
  assert.equal(verified.status, 200);
  assert.ok(verified.json.evidence[0].verifiedAt);
  const approved = await call(reviewerCookie, 'POST', `/contributions/${contributionId}/review`, {
    decision: 'approved',
    notes: 'Evidence and outcome reviewed.',
    scores
  });
  assert.equal(approved.status, 200);
  assert.equal(approved.json.status, 'approved');
  assert.equal(approved.json.participants[0].awardedXp, 68);

  const duplicate = await call(reviewerCookie, 'POST', '/contributions', {
    idempotencyKey: 'submission-key-002',
    categoryKey: 'engineering',
    title: 'Deliver reliable feature',
    description: 'Duplicate outcome.',
    participants: [{
      userId: reviewer.json.user.id,
      roleDescription: 'Implementer',
      contributionDescription: 'Repeated work.',
      attributionShare: 100
    }],
    evidence: [{
      sourceType: 'url',
      url: 'https://example.test/duplicate',
      description: 'Duplicate evidence'
    }]
  });
  assert.equal(duplicate.status, 409);

  const secondInvite = await call(ownerCookie, 'POST', '/workspace/invites', { role: 'admin' });
  const secondReviewer = await call(undefined, 'POST', '/auth/register', {
    name: 'Second Reviewer',
    email: 'reviewer2@test.invalid',
    password,
    inviteToken: secondInvite.json.url.split('/join/')[1]
  });
  assert.equal(secondReviewer.status, 201);
  const dispute = await call(ownerCookie, 'POST', `/contributions/${contributionId}/dispute`, { reason: 'Requesting correction review.' });
  assert.equal(dispute.json.status, 'disputed');
  const sameReviewerResolution = await call(reviewerCookie, 'POST', `/contributions/${contributionId}/resolve`, {
    decision: 'rejected', notes: 'The original reviewer must not resolve this.'
  });
  assert.equal(sameReviewerResolution.status, 403);
  const adjusted = await call(secondReviewer.cookie, 'POST', `/contributions/${contributionId}/resolve`, {
    decision: 'approved',
    notes: 'Correction review adjusted the impact rating.',
    scores: [{
      userId: ownerId,
      ratings: { impact: 3, quality: 4, complexity: 3, collaboration: 2, effort: 2 },
      explanation: 'Revised evidence supports a meaningful rather than high impact rating.'
    }]
  });
  assert.equal(adjusted.json.status, 'approved');
  assert.equal(adjusted.json.participants[0].awardedXp, 61);
  const disputeAgain = await call(ownerCookie, 'POST', `/contributions/${contributionId}/dispute`, { reason: 'Requesting another correction review.' });
  assert.equal(disputeAgain.json.status, 'disputed');
  const adjusterCannotResolve = await call(secondReviewer.cookie, 'POST', `/contributions/${contributionId}/resolve`, {
    decision: 'rejected', notes: 'The reviewer who adjusted the score cannot resolve the dispute.'
  });
  assert.equal(adjusterCannotResolve.status, 403);
  const resolved = await call(reviewerCookie, 'POST', `/contributions/${contributionId}/resolve`, {
    decision: 'rejected', notes: 'The disputed contribution did not meet the accepted outcome.'
  });
  assert.equal(resolved.json.status, 'rejected');

  const awards = await db!.selectFrom('contribution_awards').select('points').where('contribution_id', '=', contributionId).execute();
  assert.equal(awards.reduce((sum, award) => sum + award.points, 0), 0);
  const scoreVersions = await db!.selectFrom('contribution_scores').select('version').where('contribution_id', '=', contributionId).orderBy('version').execute();
  assert.deepEqual(scoreVersions.map((score) => score.version), [1, 2]);
  const history = await db!.selectFrom('contribution_history').select('action').where('contribution_id', '=', contributionId).execute();
  assert.ok(history.some((entry) => entry.action === 'score_recorded'));
  assert.ok(history.some((entry) => entry.action === 'disputed'));
  assert.ok(history.some((entry) => entry.action === 'dispute_resolved'));
  const ownerSummary = await call(ownerCookie, 'GET', '/contributions/summary?days=90');
  assert.equal(ownerSummary.json.approvedXp, 0);

  const otherWorkspace = await call(undefined, 'POST', '/auth/register', {
    name: 'Other',
    email: 'other@test.invalid',
    password,
    workspaceName: 'Second workspace'
  });
  assert.equal(otherWorkspace.status, 201);
  const otherContributions = await call(otherWorkspace.cookie, 'GET', '/contributions');
  assert.deepEqual(otherContributions.json, []);
  const otherSummary = await call(otherWorkspace.cookie, 'GET', '/contributions/summary?days=90');
  assert.equal(otherSummary.json.approvedXp, 0);

  const demoStart = await call(undefined, 'POST', '/demo/access', {});
  assert.equal(demoStart.status, 200);
  const demoRemaining = new Date(demoStart.json.expiresAt).getTime() - Date.now();
  assert.ok(demoRemaining > 14 * 60 * 1000 && demoRemaining <= 15 * 60 * 1000);
  assert.ok(demoStart.cookie);
  const demoData = await call(demoStart.cookie, 'GET', '/demo/data');
  assert.equal(demoData.status, 200);
  assert.equal(demoData.json.workspaceName, 'Northstar Product Studio');
  assert.equal(demoData.json.products.length, 3);
  const resumedDemo = await call(demoStart.cookie, 'POST', '/demo/access', {});
  assert.equal(resumedDemo.status, 200);
  assert.equal(resumedDemo.json.resumed, true);
  const demoAccess = await db!.selectFrom('demo_access').select(['ip_hash', 'token_hash']).executeTakeFirstOrThrow();
  assert.equal(demoAccess.ip_hash.length, 64);
  assert.notEqual(demoAccess.ip_hash, '127.0.0.1');
  assert.notEqual(demoAccess.token_hash, demoStart.cookie!.split('=')[1]);
  assert.equal((await call(undefined, 'POST', '/demo/access', {})).status, 410);
  assert.equal((await call(undefined, 'GET', '/demo/data')).status, 410);
  await db!.updateTable('demo_access').set({ expires_at: new Date(Date.now() - 1000) }).execute();
  assert.equal((await call(demoStart.cookie, 'GET', '/demo/data')).status, 410);
  assert.equal((await call(demoStart.cookie, 'POST', '/demo/access', {})).status, 410);
});
