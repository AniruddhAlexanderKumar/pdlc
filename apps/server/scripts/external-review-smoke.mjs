// SECURITY TEST ONLY: run against a disposable local database and fake SMTP server.
// REVIEW_TEST_URL=http://localhost:4002 REVIEW_TEST_DB=postgres://.../review_test REVIEW_TEST_MAIL=/tmp/review-test-email.txt node apps/server/scripts/external-review-smoke.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { createHash } from "node:crypto";
const base = process.env.REVIEW_TEST_URL,
  dbUrl = process.env.REVIEW_TEST_DB,
  mail = process.env.REVIEW_TEST_MAIL;
if (
  !base ||
  !dbUrl ||
  !mail ||
  !["localhost", "127.0.0.1"].includes(new URL(base).hostname) ||
  !["localhost", "127.0.0.1"].includes(new URL(dbUrl).hostname)
)
  throw Error("Set disposable local test URL, DB and fake SMTP capture");
const db = new pg.Client({ connectionString: dbUrl });
await db.connect();
const stamp = Date.now();
async function call(method, path, body, opts = {}) {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      origin: "http://localhost:5173",
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      ...(opts.token ? { authorization: `Review ${opts.token}` } : {}),
      ...(opts.session ? { "x-review-session": opts.session } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data;
  try {
    data = await r.json();
  } catch {
    data = null;
  }
  return {
    status: r.status,
    data,
    cookie: r.headers.get("set-cookie")?.split(";")[0],
    headers: r.headers,
  };
}
const expect = (r, s) => assert.equal(r.status, s, JSON.stringify(r.data));
async function register(name, inviteToken) {
  const r = await call("POST", "/auth/register", {
    name,
    email: `${name.toLowerCase()}-${stamp}@example.test`,
    password: "Test-Password-2389!",
    workspaceName: `${name} workspace`,
    inviteToken,
  });
  expect(r, 201);
  return r;
}
try {
  const owner = await register("Owner");
  const other = await register("Other");
  let r = await call(
    "POST",
    "/projects",
    { key: "ENG", name: "Engineering" },
    { cookie: owner.cookie },
  );
  expect(r, 201);
  const p = r.data.id;
  r = await call(
    "POST",
    "/projects",
    { key: "PRV", name: "Other project" },
    { cookie: owner.cookie },
  );
  expect(r, 201);
  const p2 = r.data.id;
  async function issue(projectId, summary, description) {
    const x = await call(
      "POST",
      `/projects/${projectId}/issues`,
      { summary, description },
      { cookie: owner.cookie },
    );
    expect(x, 201);
    return x.data.id;
  }
  const a = await issue(p, "Shared record", "Permitted description");
  const b = await issue(p, "Unshared secret", "PRIVATE-NOTES");
  const c = await issue(p2, "Other project secret", "OTHER-PRIVATE");
  await db.query(
    "insert into issue_relationships (workspace_id,source_issue_id,target_issue_id,relationship_type,description) values ($1,$2,$3,'relates_to','INTERNAL')",
    [owner.data.workspace.id, a, b],
  );
  const input = {
    projectId: p,
    title: "Consultant review",
    instructions: "Please review.",
    issueIds: [a],
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    reviewerEmail: null,
    showLinks: true,
  };
  r = await call("POST", "/external-reviews", input, { cookie: owner.cookie });
  expect(r, 403); // admin opt-in required
  r = await call(
    "PATCH",
    "/external-reviews/settings",
    { allowUnrestricted: true },
    { cookie: owner.cookie },
  );
  expect(r, 200);
  r = await call(
    "POST",
    "/external-reviews",
    { ...input, issueIds: [a, c] },
    { cookie: owner.cookie },
  );
  expect(r, 400); // other project forbidden
  r = await call(
    "PATCH",
    "/external-reviews/settings",
    { allowUnrestricted: true },
    { cookie: other.cookie },
  );
  expect(r, 200);
  r = await call("POST", "/external-reviews", input, { cookie: other.cookie });
  expect(r, 404); // other workspace
  r = await call("POST", "/external-reviews", input, { cookie: owner.cookie });
  expect(r, 201);
  const id = r.data.id,
    token = new URL(r.data.url).hash.slice(1);
  assert.equal(token.length, 43);
  const saved = await db.query(
    "select token_hash from external_reviews where id=$1",
    [id],
  );
  assert.equal(
    saved.rows[0].token_hash,
    createHash("sha256").update(token).digest("hex"),
  );
  assert.notEqual(saved.rows[0].token_hash, token);
  r = await call("GET", "/reviewer", undefined, { token });
  expect(r, 200);
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.headers.get("referrer-policy"), "no-referrer");
  assert.equal(r.data.issues.length, 1);
  assert.equal(r.data.issues[0].title, "Shared record");
  assert.equal(r.data.links.length, 0);
  assert(!JSON.stringify(r.data).includes("PRIVATE-NOTES"));
  assert(!JSON.stringify(r.data).includes("INTERNAL"));
  assert(!JSON.stringify(r.data).includes("reporter"));
  // Explicit selection changes are enforced immediately, including relationship endpoints.
  expect(await call("PATCH", `/external-reviews/${id}`, {...input, issueIds:[a,b]}, {cookie:owner.cookie}), 200);
  r=await call("GET", "/reviewer", undefined, {token}); expect(r,200); assert.equal(r.data.issues.length,2); assert.equal(r.data.links.length,1); assert(!JSON.stringify(r.data).includes("INTERNAL"));
  expect(await call("PATCH", `/external-reviews/${id}`, input, {cookie:owner.cookie}), 200);
  r=await call("GET", "/reviewer", undefined, {token}); expect(r,200); assert.equal(r.data.issues.length,1); assert.equal(r.data.links.length,0);
  expect(
    await call("GET", "/reviewer", undefined, { token: "z".repeat(43) }),
    404,
  );
  expect(await call("GET", "/reviewer/" + b, undefined, { token }), 404);
  expect(
    await call(
      "POST",
      `/projects/${p}/issues`,
      { summary: "attacker" },
      { token },
    ),
    401,
  );
  expect(
    await call(
      "PATCH",
      `/projects/${p}/issues/${a}`,
      { summary: "attacker" },
      { token },
    ),
    401,
  );
  expect(await call("GET", "/workspace/data", undefined, { token }), 401);
  expect(
    await call("GET", "/admin/access-requests", undefined, { token }),
    401,
  );
  expect(
    await call("GET", "/reviewer/documents/x/download", undefined, { token }),
    404,
  );
  expect(
    await call("GET", "/external-reviews", undefined, { cookie: other.cookie }),
    200,
  );
  expect(
    await call("GET", `/external-reviews/${id}/events`, undefined, {
      cookie: other.cookie,
    }),
    404,
  );
  // Invitation-derived member cannot manage links.
  r = await call(
    "POST",
    "/workspace/invites",
    { role: "member" },
    { cookie: owner.cookie },
  );
  expect(r, 201);
  const invite = new URL(r.data.url).pathname.split("/").pop();
  const member = await register("Member", invite);
  expect(
    await call("GET", "/external-reviews", undefined, {
      cookie: member.cookie,
    }),
    403,
  );
  // Restriction + delivery + single use and scope.
  r = await call(
    "POST",
    "/external-reviews",
    { ...input, title: "Restricted", reviewerEmail: "reviewer@example.test" },
    { cookie: owner.cookie },
  );
  expect(r, 201);
  const restricted = r.data.id,
    token2 = new URL(r.data.url).hash.slice(1);
  r = await call("GET", "/reviewer", undefined, { token: token2 });
  expect(r, 200);
  assert.deepEqual(r.data, { requiresVerification: true });
  expect(
    await call(
      "POST",
      "/reviewer/verify",
      { code: "111111" },
      { token: token2 },
    ),
    403,
  );
  expect(await call("POST", "/reviewer/challenge", {}, { token: token2 }), 200);
  const text = await readFile(mail, "utf8");
  const code = text.match(/verification code is (\d{6})/)?.[1];
  assert(code, "code not delivered via test SMTP");
  const wrong = code === "000000" ? "000001" : "000000";
  expect(
    await call("POST", "/reviewer/verify", { code: wrong }, { token: token2 }),
    403,
  );
  r = await call("POST", "/reviewer/verify", { code }, { token: token2 });
  expect(r, 200);
  const session = r.data.session;
  expect(
    await call("POST", "/reviewer/verify", { code }, { token: token2 }),
    403,
  );
  r = await call("GET", "/reviewer", undefined, { token: token2, session });
  expect(r, 200);
  assert.equal(r.data.issues.length, 1);
  r = await call("GET", "/reviewer", undefined, { token, session });
  expect(r, 200); // unrestricted; cannot use this session for a different restricted token
  r = await call(
    "POST",
    "/external-reviews",
    { ...input, title: "Restricted 2", reviewerEmail: "other@example.test" },
    { cookie: owner.cookie },
  );
  expect(r, 201);
  const token3 = new URL(r.data.url).hash.slice(1);
  r = await call("GET", "/reviewer", undefined, { token: token3, session });
  expect(r, 200);
  assert.deepEqual(r.data, { requiresVerification: true });
  expect(
    await call(
      "POST",
      `/external-reviews/${restricted}/revoke`,
      {},
      { cookie: owner.cookie },
    ),
    200,
  );
  expect(
    await call("GET", "/reviewer", undefined, { token: token2, session }),
    404,
  );
  await db.query(
    "update external_reviews set expires_at=now()-interval '1 minute' where id=$1",
    [id],
  );
  expect(await call("GET", "/reviewer", undefined, { token }), 404);
  r = await call("GET", `/external-reviews/${restricted}/events`, undefined, {
    cookie: owner.cookie,
  });
  expect(r, 200);
  for (const event of [
    "created",
    "verification_requested",
    "verification_attempted",
    "verification_completed",
    "accessed",
    "revoked",
    "access_denied",
  ])
    assert(
      r.data.some((x) => x.event_type === event),
      event,
    );
  // Server computes prices and refuses tampered totals and invalid combinations.
  const form = {
    name: "Pricing Tester",
    email: `price-${stamp}@example.test`,
    organization: "Engineering",
    role: "Engineer",
    industry: "Hardware & robotics",
    teamSize: "6–20",
    country: "India",
    goals: "Review engineering workflows",
    pricing: { plan: "small", editors: 10, billing: "annual" },
  };
  expect(
    await call("POST", "/access-requests", {
      ...form,
      pricing: { ...form.pricing, periodTotalCents: 1 },
    }),
    400,
  );
  expect(
    await call("POST", "/access-requests", {
      ...form,
      pricing: { ...form.pricing, editors: 100 },
    }),
    400,
  );
  r = await call("POST", "/access-requests", form);
  expect(r, 201);
  const requestId = r.data.id;
  const savedPrice = await db.query(
    "select pricing_snapshot from access_requests where id=$1",
    [requestId],
  );
  assert.equal(savedPrice.rows[0].pricing_snapshot.periodTotalCents, 38400);
  await db.query("update users set is_admin=true where id=$1", [
    owner.data.user.id,
  ]);
  r = await call(
    "PATCH",
    `/admin/access-requests/${requestId}`,
    {
      status: "needs_info",
      reviewNote: "Please confirm",
      pricing: { plan: "medium", editors: 100, billing: "annual" },
    },
    { cookie: owner.cookie },
  );
  expect(r, 200);
  const proposal = await db.query(
    "select pricing_snapshot,proposed_pricing_snapshot,status from access_requests where id=$1",
    [requestId],
  );
  assert.equal(proposal.rows[0].pricing_snapshot.periodTotalCents, 38400);
  assert.equal(
    proposal.rows[0].proposed_pricing_snapshot.periodTotalCents,
    230400,
  );
  assert.equal(proposal.rows[0].status, "needs_info");
  expect(
    await call(
      "PATCH",
      `/admin/access-requests/${requestId}`,
      {
        status: "approved",
        pricing: { plan: "small", editors: 100, billing: "monthly" },
      },
      { cookie: owner.cookie },
    ),
    400,
  );
  expect(
    await call(
      "PATCH",
      `/admin/access-requests/${requestId}`,
      { status: "approved" },
      { cookie: owner.cookie },
    ),
    200,
  );
  expect(
    await call(
      "PATCH",
      `/admin/access-requests/${requestId}`,
      { status: "declined" },
      { cookie: owner.cookie },
    ),
    200,
  );
  const history = await db.query(
    "select old_status,new_status from access_request_events where request_id=$1 order by created_at",
    [requestId],
  );
  assert.equal(history.rowCount, 3);
  r = await call("GET", "/admin/access-requests", undefined, {
    cookie: owner.cookie,
  });
  expect(r, 200);
  const listed = r.data.find((x) => x.id === requestId);
  assert.equal(listed.pricingSnapshot.periodTotalCents, 38400);
  assert.equal(listed.proposedPricingSnapshot.periodTotalCents, 230400);
  // Disabling unrestricted sharing revokes links permanently, even after re-enabling it.
  r=await call("POST", "/external-reviews", {...input, title:"Policy link"}, {cookie:owner.cookie}); expect(r,201); const policyToken=new URL(r.data.url).hash.slice(1);
  expect(await call("PATCH", "/external-reviews/settings", {allowUnrestricted:false}, {cookie:owner.cookie}),200);
  expect(await call("GET", "/reviewer", undefined, {token:policyToken}),404);
  expect(await call("PATCH", "/external-reviews/settings", {allowUnrestricted:true}, {cookie:owner.cookie}),200);
  expect(await call("GET", "/reviewer", undefined, {token:policyToken}),404);
  // Rate limiting on anonymous review endpoints, regardless of token validity.
  let limited = false;
  for (let i = 0; i < 70; i++) {
    r = await call("GET", "/reviewer", undefined, { token: "z".repeat(43) });
    if (r.status === 429) {
      limited = true;
      break;
    }
  }
  assert(limited);
  console.log(
    "External review and pricing security smoke passed: isolation, permissions, token hashing, OTP, expiry, revocation, audit, rate limits and server-calculated snapshots.",
  );
} finally {
  await db.end();
}
