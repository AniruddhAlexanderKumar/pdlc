// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DecisionAlternative,
  DecisionAssumption,
  DecisionExpectation,
  EngineeringDecision,
  Project,
} from "@/domain";
import { ConflictError, UnauthorizedError } from "@/server/errors";

/**
 * Decision route handlers driven through the *real* EngineeringDecisionService,
 * with only repositories and the transaction faked. Validation, lifecycle,
 * tenancy and error-to-status mapping are genuinely exercised without
 * PostgreSQL.
 */
const TX = { __transaction: true } as const;

const CONTEXT = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
  sessionId: "sess1aaaaaaaaaaaaaaaaaa",
  user: {
    id: "user1aaaaaaaaaaaaaaaaaaa",
    name: "Ada",
    email: "ada@example.test",
    role: "ADMIN",
    organizationRole: "OWNER",
  },
  organization: { id: "org1aaaaaaaaaaaaaaaaaaaa", name: "Example Aerospace" },
};

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)) },
}));

vi.mock("@/server/auth/context", () => ({
  requireAuthenticatedContext: vi.fn(async () => CONTEXT),
}));

vi.mock("@/server/repositories/project.repository", () => ({
  findProjectInOrganization: vi.fn(),
}));

vi.mock("@/server/repositories/engineering-decision.repository", () => ({
  createDecision: vi.fn(),
  updateDecision: vi.fn(),
  findDecisionInProject: vi.fn(),
  listDecisionsInProject: vi.fn(),
  findDecisionOwner: vi.fn(),
  listDecisionLinks: vi.fn(),
  decisionLinkTargetExistsInProject: vi.fn(),
  createDecisionLink: vi.fn(),
  deleteDecisionLink: vi.fn(),
}));

vi.mock("@/server/repositories/decision-alternative.repository", () => ({
  createAlternative: vi.fn(),
  listAlternatives: vi.fn(),
  findAlternativeForDecision: vi.fn(),
  updateAlternative: vi.fn(),
  deleteAlternative: vi.fn(),
}));

vi.mock("@/server/repositories/decision-assumption.repository", () => ({
  createAssumption: vi.fn(),
  listAssumptions: vi.fn(),
  findAssumptionForDecision: vi.fn(),
  updateAssumption: vi.fn(),
  deleteAssumption: vi.fn(),
}));

vi.mock("@/server/repositories/decision-expectation.repository", () => ({
  setExpectation: vi.fn(),
  findExpectation: vi.fn(),
  deleteExpectation: vi.fn(),
}));

vi.mock("@/server/repositories/user.repository", () => ({
  isMemberOfOrganization: vi.fn(),
  getOrganizationRole: vi.fn(),
}));

vi.mock("@/server/repositories/project-membership.repository", () => ({ findMembership: vi.fn() }));

vi.mock("@/server/repositories/audit-log.repository", () => ({
  recordAuditEvent: vi.fn(),
  listAuditEventsForEntity: vi.fn(),
}));

vi.mock("@/server/repositories/project-artifacts.repository", () => ({
  listDecisionLinkTargets: vi.fn(),
}));

const authContext = await import("@/server/auth/context");
const projectRepository = await import("@/server/repositories/project.repository");
const decisionRepository = await import("@/server/repositories/engineering-decision.repository");
const alternativeRepository = await import("@/server/repositories/decision-alternative.repository");
const assumptionRepository = await import("@/server/repositories/decision-assumption.repository");
const expectationRepository = await import("@/server/repositories/decision-expectation.repository");
const userRepository = await import("@/server/repositories/user.repository");
const membershipRepository = await import("@/server/repositories/project-membership.repository");
const auditLogRepository = await import("@/server/repositories/audit-log.repository");

const collection = await import("@/app/api/projects/[projectId]/decisions/route");
const item = await import("@/app/api/projects/[projectId]/decisions/[decisionId]/route");
const transition = await import(
  "@/app/api/projects/[projectId]/decisions/[decisionId]/transition/route"
);
const owner = await import("@/app/api/projects/[projectId]/decisions/[decisionId]/owner/route");
const alternatives = await import(
  "@/app/api/projects/[projectId]/decisions/[decisionId]/alternatives/route"
);
const alternativeItem = await import(
  "@/app/api/projects/[projectId]/decisions/[decisionId]/alternatives/[alternativeId]/route"
);
const assumptions = await import(
  "@/app/api/projects/[projectId]/decisions/[decisionId]/assumptions/route"
);
const assumptionItem = await import(
  "@/app/api/projects/[projectId]/decisions/[decisionId]/assumptions/[assumptionId]/route"
);
const expectation = await import(
  "@/app/api/projects/[projectId]/decisions/[decisionId]/expectation/route"
);
const links = await import("@/app/api/projects/[projectId]/decisions/[decisionId]/links/route");

const PROJECT: Project = {
  id: "proj1aaaaaaaaaaaaaaaaaaa",
  organizationId: CONTEXT.organizationId,
  name: "Upper Stage Propulsion",
  description: null,
  status: "ACTIVE",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const DECISION_ID = "dec1aaaaaaaaaaaaaaaaaaa";

function decision(overrides: Partial<EngineeringDecision> = {}): EngineeringDecision {
  return {
    id: DECISION_ID,
    projectId: PROJECT.id,
    identifier: "ED-001",
    title: "Use regenerative cooling",
    statement: "The chamber will be regeneratively cooled.",
    rationale: "Ablative liner mass was prohibitive.",
    alternativesConsidered: null,
    assumptions: null,
    status: "PROPOSED",
    ownerId: null,
    decidedAt: null,
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

const ALTERNATIVE: DecisionAlternative = {
  id: "alt1aaaaaaaaaaaaaaaaaaa",
  engineeringDecisionId: DECISION_ID,
  title: "Ablative liner",
  description: null,
  reasonRejected: "Mass.",
  createdAt: new Date("2026-01-03T00:00:00.000Z"),
  updatedAt: new Date("2026-01-03T00:00:00.000Z"),
};

const ASSUMPTION: DecisionAssumption = {
  id: "asm1aaaaaaaaaaaaaaaaaaa",
  engineeringDecisionId: DECISION_ID,
  statement: "Coolant flow stays above 2.4 kg/s.",
  status: "UNKNOWN",
  rationale: null,
  createdAt: new Date("2026-01-03T00:00:00.000Z"),
  updatedAt: new Date("2026-01-03T00:00:00.000Z"),
};

const EXPECTATION: DecisionExpectation = {
  id: "exp1aaaaaaaaaaaaaaaaaaa",
  engineeringDecisionId: DECISION_ID,
  statement: "Wall temperature stays below limit.",
  measure: "Peak wall temperature",
  expectedValue: "< 800",
  unit: "K",
  comparisonOperator: null,
  dueAt: null,
  status: "NOT_OBSERVED",
  actualValue: null,
  observedAt: null,
  createdAt: new Date("2026-01-03T00:00:00.000Z"),
  updatedAt: new Date("2026-01-03T00:00:00.000Z"),
};

const BASE = `http://localhost/api/projects/${PROJECT.id}/decisions`;

function send(method: string, body: unknown, url = BASE): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function get(url = BASE): Request {
  return new Request(url, { method: "GET" });
}

const projectCtx = () => ({ params: Promise.resolve({ projectId: PROJECT.id }) });
const decisionCtx = () => ({
  params: Promise.resolve({ projectId: PROJECT.id, decisionId: DECISION_ID }),
});
const altCtx = () => ({
  params: Promise.resolve({
    projectId: PROJECT.id,
    decisionId: DECISION_ID,
    alternativeId: ALTERNATIVE.id,
  }),
});
const asmCtx = () => ({
  params: Promise.resolve({
    projectId: PROJECT.id,
    decisionId: DECISION_ID,
    assumptionId: ASSUMPTION.id,
  }),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authContext.requireAuthenticatedContext).mockResolvedValue(CONTEXT);
  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
  vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(true);
  vi.mocked(decisionRepository.decisionLinkTargetExistsInProject).mockResolvedValue(true);
  vi.mocked(decisionRepository.listDecisionLinks).mockResolvedValue([]);
  vi.mocked(alternativeRepository.listAlternatives).mockResolvedValue([]);
  vi.mocked(assumptionRepository.listAssumptions).mockResolvedValue([]);
  vi.mocked(expectationRepository.findExpectation).mockResolvedValue(null);
  vi.mocked(auditLogRepository.listAuditEventsForEntity).mockResolvedValue([]);
  // CONTEXT's user is an organization OWNER (see CONTEXT above) — full
  // implicit project access with no explicit ProjectMembership row needed.
  vi.mocked(membershipRepository.findMembership).mockResolvedValue(null);
  vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("OWNER");
});

describe("authentication", () => {
  function unauthenticated() {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());
  }

  it("rejects unauthenticated reads with 401", async () => {
    unauthenticated();

    const responses = await Promise.all([
      collection.GET(get(), projectCtx()),
      item.GET(get(), decisionCtx()),
      alternatives.GET(get(), decisionCtx()),
      assumptions.GET(get(), decisionCtx()),
      expectation.GET(get(), decisionCtx()),
      links.GET(get(), decisionCtx()),
    ]);

    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401, 401, 401]);
    expect(decisionRepository.listDecisionsInProject).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated writes with 401", async () => {
    unauthenticated();

    const responses = await Promise.all([
      collection.POST(send("POST", { identifier: "ED-001" }), projectCtx()),
      transition.POST(send("POST", { to: "UNDER_REVIEW" }), decisionCtx()),
      owner.POST(send("POST", { ownerId: null }), decisionCtx()),
      alternatives.POST(send("POST", { title: "x" }), decisionCtx()),
      assumptions.POST(send("POST", { statement: "x" }), decisionCtx()),
      expectation.PUT(send("PUT", { statement: "x" }), decisionCtx()),
    ]);

    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401, 401, 401]);
  });
});

describe("decisions collection", () => {
  it("lists decisions in the project", async () => {
    vi.mocked(decisionRepository.listDecisionsInProject).mockResolvedValue([
      { ...decision(), owner: null },
    ]);

    const response = await collection.GET(get(), projectCtx());

    expect(response.status).toBe(200);
    expect((await response.json()).decisions[0].identifier).toBe("ED-001");
  });

  it("creates a decision and returns 201", async () => {
    vi.mocked(decisionRepository.createDecision).mockResolvedValue(decision());

    const response = await collection.POST(
      send("POST", {
        identifier: "ED-001",
        title: "Use regenerative cooling",
        statement: "The chamber will be regeneratively cooled.",
        rationale: "Ablative liner mass was prohibitive.",
      }),
      projectCtx(),
    );

    expect(response.status).toBe(201);
    expect((await response.json()).decision.status).toBe("PROPOSED");
  });

  it("returns 400 for invalid input", async () => {
    const response = await collection.POST(
      send("POST", { identifier: "bad id", title: "", statement: "", rationale: "" }),
      projectCtx(),
    );

    expect(response.status).toBe(400);
  });

  it("returns 409 for a duplicate identifier", async () => {
    vi.mocked(decisionRepository.createDecision).mockRejectedValue(
      new ConflictError("Decision ED-001 already exists in this project."),
    );

    const response = await collection.POST(
      send("POST", {
        identifier: "ED-001",
        title: "Dup",
        statement: "Dup",
        rationale: "Dup",
      }),
      projectCtx(),
    );

    expect(response.status).toBe(409);
  });

  it("returns 404 for a project outside the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    const response = await collection.GET(get(), projectCtx());

    expect(response.status).toBe(404);
    expect(decisionRepository.listDecisionsInProject).not.toHaveBeenCalled();
  });
});

describe("decision detail and update", () => {
  it("returns the full memory with lifecycle info and no persistence noise", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(alternativeRepository.listAlternatives).mockResolvedValue([ALTERNATIVE]);
    vi.mocked(assumptionRepository.listAssumptions).mockResolvedValue([ASSUMPTION]);
    vi.mocked(expectationRepository.findExpectation).mockResolvedValue(EXPECTATION);

    const response = await item.GET(get(), decisionCtx());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.decision.availableTransitions).toEqual(["UNDER_REVIEW", "REJECTED"]);
    expect(body.decision.alternatives).toHaveLength(1);
    expect(body.decision.assumptions[0].status).toBe("UNKNOWN");
    expect(body.decision.expectation.status).toBe("NOT_OBSERVED");
    // Neither credentials nor the legacy free-text columns are serialized.
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|tokenHash|alternativesConsidered/i);
  });

  it("returns 404 for a decision in another project", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(null);
    expect((await item.GET(get(), decisionCtx())).status).toBe(404);
  });

  it("updates content on a proposed decision", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(decisionRepository.updateDecision).mockResolvedValue(decision({ title: "Revised" }));

    const response = await item.PATCH(send("PATCH", { title: "Revised" }), decisionCtx());

    expect(response.status).toBe(200);
    expect((await response.json()).decision.title).toBe("Revised");
  });

  it("returns 400 when trying to change status through PATCH", async () => {
    const response = await item.PATCH(send("PATCH", { status: "APPROVED" }), decisionCtx());

    expect(response.status).toBe(400);
    expect(decisionRepository.updateDecision).not.toHaveBeenCalled();
  });

  it("returns 409 when editing an approved decision", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(
      decision({ status: "APPROVED" }),
    );

    const response = await item.PATCH(send("PATCH", { title: "Rewrite" }), decisionCtx());

    expect(response.status).toBe(409);
  });
});

describe("lifecycle endpoint", () => {
  it("performs a legal transition", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(decisionRepository.updateDecision).mockResolvedValue(
      decision({ status: "UNDER_REVIEW" }),
    );

    const response = await transition.POST(send("POST", { to: "UNDER_REVIEW" }), decisionCtx());

    expect(response.status).toBe(200);
    expect((await response.json()).decision.status).toBe("UNDER_REVIEW");
  });

  it("returns 409 for an illegal jump and names what is allowed", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());

    const response = await transition.POST(send("POST", { to: "APPROVED" }), decisionCtx());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.message).toMatch(/UNDER_REVIEW/);
    expect(decisionRepository.updateDecision).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown target status", async () => {
    expect((await transition.POST(send("POST", { to: "NOPE" }), decisionCtx())).status).toBe(400);
  });
});

describe("owner endpoint", () => {
  it("assigns an owner in the same organization", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(decisionRepository.updateDecision).mockResolvedValue(
      decision({ ownerId: "user2aaaaaaaaaaaaaaaaaaa" }),
    );

    const response = await owner.POST(
      send("POST", { ownerId: "user2aaaaaaaaaaaaaaaaaaa" }),
      decisionCtx(),
    );

    expect(response.status).toBe(200);
  });

  it("returns 400 for an owner outside the organization", async () => {
    vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(false);

    const response = await owner.POST(
      send("POST", { ownerId: "userfromanotherorg1234" }),
      decisionCtx(),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toMatch(/not a member/i);
  });
});

describe("alternatives endpoints", () => {
  it("creates, updates and deletes", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(alternativeRepository.createAlternative).mockResolvedValue(ALTERNATIVE);
    vi.mocked(alternativeRepository.findAlternativeForDecision).mockResolvedValue(ALTERNATIVE);
    vi.mocked(alternativeRepository.updateAlternative).mockResolvedValue(ALTERNATIVE);
    vi.mocked(alternativeRepository.deleteAlternative).mockResolvedValue(1);

    const created = await alternatives.POST(
      send("POST", { title: "Ablative liner", reasonRejected: "Mass." }),
      decisionCtx(),
    );
    const updated = await alternativeItem.PATCH(
      send("PATCH", { reasonRejected: "Mass and cost." }),
      altCtx(),
    );
    const deleted = await alternativeItem.DELETE(get(), altCtx());

    expect([created.status, updated.status, deleted.status]).toEqual([201, 200, 200]);
  });

  it("returns 400 for an alternative with no title", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    expect((await alternatives.POST(send("POST", { title: "" }), decisionCtx())).status).toBe(400);
  });

  it("returns 404 for an alternative on another decision", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(alternativeRepository.findAlternativeForDecision).mockResolvedValue(null);

    const response = await alternativeItem.PATCH(send("PATCH", { title: "Hijack" }), altCtx());

    expect(response.status).toBe(404);
  });
});

describe("assumptions endpoints", () => {
  it("creates an assumption that starts unchecked", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(assumptionRepository.createAssumption).mockResolvedValue(ASSUMPTION);

    const response = await assumptions.POST(
      send("POST", { statement: "Coolant flow stays above 2.4 kg/s." }),
      decisionCtx(),
    );

    expect(response.status).toBe(201);
    expect((await response.json()).assumption.status).toBe("UNKNOWN");
  });

  it("records an explicit validation", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(assumptionRepository.findAssumptionForDecision).mockResolvedValue(ASSUMPTION);
    vi.mocked(assumptionRepository.updateAssumption).mockResolvedValue({
      ...ASSUMPTION,
      status: "VALIDATED",
    });

    const response = await assumptionItem.PATCH(send("PATCH", { status: "VALIDATED" }), asmCtx());

    expect(response.status).toBe(200);
    expect((await response.json()).assumption.status).toBe("VALIDATED");
  });

  it("returns 400 for an unknown assumption status", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());

    const response = await assumptionItem.PATCH(send("PATCH", { status: "FINE" }), asmCtx());

    expect(response.status).toBe(400);
  });

  it("deletes an assumption", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(assumptionRepository.deleteAssumption).mockResolvedValue(1);

    expect((await assumptionItem.DELETE(get(), asmCtx())).status).toBe(200);
  });
});

describe("expectation endpoint", () => {
  it("returns null when none is recorded", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());

    const response = await expectation.GET(get(), decisionCtx());

    expect(response.status).toBe(200);
    expect((await response.json()).expectation).toBeNull();
  });

  it("sets an expectation and leaves it unobserved", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(expectationRepository.setExpectation).mockResolvedValue(EXPECTATION);

    const response = await expectation.PUT(
      send("PUT", { statement: "Wall temperature stays below limit.", expectedValue: "< 800" }),
      decisionCtx(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.expectation.status).toBe("NOT_OBSERVED");
    expect(body.expectation.actualValue).toBeNull();
  });

  it("returns 400 without a statement", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    expect((await expectation.PUT(send("PUT", { statement: "" }), decisionCtx())).status).toBe(400);
  });

  it("clears an expectation, and 404s when there is none", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(expectationRepository.deleteExpectation).mockResolvedValue(1);
    expect((await expectation.DELETE(get(), decisionCtx())).status).toBe(200);

    vi.mocked(expectationRepository.deleteExpectation).mockResolvedValue(0);
    expect((await expectation.DELETE(get(), decisionCtx())).status).toBe(404);
  });
});

describe("links endpoints", () => {
  it("adds a link to a same-project artifact", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());

    const response = await links.POST(
      send("POST", { relation: "REQUIREMENT", targetId: "req1aaaaaaaaaaaaaaaaaaaa" }),
      decisionCtx(),
    );

    expect(response.status).toBe(201);
    expect(decisionRepository.createDecisionLink).toHaveBeenCalledWith(
      expect.objectContaining({ createdById: CONTEXT.actorId }),
      TX,
    );
  });

  it("returns 400 for a cross-project target", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(decisionRepository.decisionLinkTargetExistsInProject).mockResolvedValue(false);

    const response = await links.POST(
      send("POST", { relation: "DESIGN_ITEM", targetId: "designfromotherproject" }),
      decisionCtx(),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toMatch(/same project/i);
    expect(decisionRepository.createDecisionLink).not.toHaveBeenCalled();
  });

  it("returns 400 for an opaque entityType/entityId body", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());

    const response = await links.POST(
      send("POST", { entityType: "Whatever", entityId: "x" }),
      decisionCtx(),
    );

    expect(response.status).toBe(400);
  });

  it("removes a link identified by query parameters", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(decisionRepository.deleteDecisionLink).mockResolvedValue(1);

    const response = await links.DELETE(
      new Request(`${BASE}/${DECISION_ID}/links?relation=DESIGN_ITEM&targetId=design1`, {
        method: "DELETE",
      }),
      decisionCtx(),
    );

    expect(response.status).toBe(200);
    expect(decisionRepository.deleteDecisionLink).toHaveBeenCalledWith(
      expect.objectContaining({ relation: "DESIGN_ITEM" }),
      TX,
    );
  });

  it("returns 404 when removing a link that does not exist", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(decisionRepository.deleteDecisionLink).mockResolvedValue(0);

    const response = await links.DELETE(
      new Request(`${BASE}/${DECISION_ID}/links?relation=RISK&targetId=risk1`, {
        method: "DELETE",
      }),
      decisionCtx(),
    );

    expect(response.status).toBe(404);
  });
});
