// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DecisionAlternative,
  DecisionAssumption,
  DecisionExpectation,
  EngineeringDecision,
  Project,
} from "@/domain";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

/**
 * Decision memory service behavior against fake repositories: no database, no
 * Prisma. The transaction sentinel proves each mutation and its audit event
 * are handed the same client, i.e. that they commit together.
 */
const TX = { __transaction: true } as const;

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)) },
}));

vi.mock("@/server/repositories/project.repository", () => ({
  findProjectInOrganization: vi.fn(),
}));

vi.mock("@/server/repositories/engineering-decision.repository", () => ({
  createDecision: vi.fn(),
  updateDecision: vi.fn(),
  transitionStatusGuarded: vi.fn(),
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

const projectRepository = await import("@/server/repositories/project.repository");
const decisionRepository = await import("@/server/repositories/engineering-decision.repository");
const alternativeRepository = await import("@/server/repositories/decision-alternative.repository");
const assumptionRepository = await import("@/server/repositories/decision-assumption.repository");
const expectationRepository = await import("@/server/repositories/decision-expectation.repository");
const userRepository = await import("@/server/repositories/user.repository");
const membershipRepository = await import("@/server/repositories/project-membership.repository");
const auditLogRepository = await import("@/server/repositories/audit-log.repository");
const service = await import("./engineering-decision.service");

const CONTEXT: OrganizationContext = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
};

const PROJECT: Project = {
  id: "proj1aaaaaaaaaaaaaaaaaaa",
  organizationId: CONTEXT.organizationId,
  name: "Upper Stage Propulsion",
  description: null,
  status: "ACTIVE",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function decision(overrides: Partial<EngineeringDecision> = {}): EngineeringDecision {
  return {
    id: "dec1aaaaaaaaaaaaaaaaaaa",
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
  engineeringDecisionId: "dec1aaaaaaaaaaaaaaaaaaa",
  title: "Ablative liner",
  description: null,
  reasonRejected: "Mass.",
  createdAt: new Date("2026-01-03T00:00:00.000Z"),
  updatedAt: new Date("2026-01-03T00:00:00.000Z"),
};

const ASSUMPTION: DecisionAssumption = {
  id: "asm1aaaaaaaaaaaaaaaaaaa",
  engineeringDecisionId: "dec1aaaaaaaaaaaaaaaaaaa",
  statement: "Coolant flow stays above 2.4 kg/s.",
  status: "UNKNOWN",
  rationale: null,
  createdAt: new Date("2026-01-03T00:00:00.000Z"),
  updatedAt: new Date("2026-01-03T00:00:00.000Z"),
};

const EXPECTATION: DecisionExpectation = {
  id: "exp1aaaaaaaaaaaaaaaaaaa",
  engineeringDecisionId: "dec1aaaaaaaaaaaaaaaaaaa",
  statement: "Wall temperature stays below limit.",
  measure: "Peak wall temperature",
  // Prose in the value, and no operator: exactly the shape the drift engine
  // must refuse to compare rather than parse a "<" out of.
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

const VALID_CREATE = {
  identifier: "ED-001",
  title: "Use regenerative cooling",
  statement: "The chamber will be regeneratively cooled.",
  rationale: "Ablative liner mass was prohibitive.",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
  vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(true);
  vi.mocked(decisionRepository.decisionLinkTargetExistsInProject).mockResolvedValue(true);
  vi.mocked(decisionRepository.listDecisionLinks).mockResolvedValue([]);
  vi.mocked(alternativeRepository.listAlternatives).mockResolvedValue([]);
  vi.mocked(assumptionRepository.listAssumptions).mockResolvedValue([]);
  vi.mocked(expectationRepository.findExpectation).mockResolvedValue(null);
  vi.mocked(auditLogRepository.listAuditEventsForEntity).mockResolvedValue([]);
  // CONTEXT's actor is a MANAGER on PROJECT by default — full read/write/
  // approve/manage access, so existing tests exercising ordinary behavior
  // do not also need to set up a role scenario.
  vi.mocked(membershipRepository.findMembership).mockResolvedValue({
    id: "mem1",
    projectId: PROJECT.id,
    role: "MANAGER",
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: CONTEXT.actorId!, name: "Ada", email: "ada@example.test", organizationRole: "MEMBER" },
  });
  vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");
});

describe("createDecision", () => {
  it("creates a PROPOSED decision scoped to the project and audits it", async () => {
    vi.mocked(decisionRepository.createDecision).mockResolvedValue(decision());

    const created = await service.createDecision(CONTEXT, PROJECT.id, VALID_CREATE);

    expect(created.status).toBe("PROPOSED");
    expect(decisionRepository.createDecision).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT.id }),
      TX,
    );
    // Status is never taken from the caller.
    expect(decisionRepository.createDecision).toHaveBeenCalledWith(
      expect.not.objectContaining({ status: expect.anything() }),
      TX,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "decision.created",
        entityType: "EngineeringDecision",
        organizationId: CONTEXT.organizationId,
        actorId: CONTEXT.actorId,
      }),
      TX,
    );
  });

  it.each([
    ["a blank title", { ...VALID_CREATE, title: " " }],
    ["a missing rationale", { identifier: "ED-001", title: "t", statement: "s" }],
    ["a malformed identifier", { ...VALID_CREATE, identifier: "ed 1" }],
    ["a caller-supplied status", { ...VALID_CREATE, status: "APPROVED" }],
    ["a caller-supplied organizationId", { ...VALID_CREATE, organizationId: "org2" }],
    ["a caller-supplied projectId", { ...VALID_CREATE, projectId: "proj2" }],
  ])("rejects %s", async (_label, input) => {
    await expect(service.createDecision(CONTEXT, PROJECT.id, input)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(decisionRepository.createDecision).not.toHaveBeenCalled();
  });

  it("surfaces a duplicate identifier as a conflict", async () => {
    vi.mocked(decisionRepository.createDecision).mockRejectedValue(
      new ConflictError("Decision ED-001 already exists in this project."),
    );

    await expect(
      service.createDecision(CONTEXT, PROJECT.id, VALID_CREATE),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses a project outside the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    await expect(
      service.createDecision(CONTEXT, PROJECT.id, VALID_CREATE),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects an owner from another organization", async () => {
    vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(false);

    await expect(
      service.createDecision(CONTEXT, PROJECT.id, {
        ...VALID_CREATE,
        ownerId: "userfromanotherorg1234",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(decisionRepository.createDecision).not.toHaveBeenCalled();
  });
});

describe("lifecycle", () => {
  it.each([
    ["PROPOSED", "UNDER_REVIEW"],
    ["PROPOSED", "REJECTED"],
    ["UNDER_REVIEW", "APPROVED"],
    ["UNDER_REVIEW", "REJECTED"],
    ["APPROVED", "SUPERSEDED"],
  ] as const)("allows %s → %s", async (from, to) => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision({ status: from }));
    vi.mocked(decisionRepository.transitionStatusGuarded).mockResolvedValue(decision({ status: to }));

    const result = await service.transitionDecisionStatus(CONTEXT, PROJECT.id, "dec1", { to });

    expect(result.status).toBe(to);
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "decision.status_transitioned",
        metadata: { from, to },
      }),
      TX,
    );
  });

  it.each([
    ["PROPOSED", "APPROVED"],
    ["PROPOSED", "SUPERSEDED"],
    ["REJECTED", "APPROVED"],
    ["SUPERSEDED", "APPROVED"],
    ["APPROVED", "UNDER_REVIEW"],
    ["REJECTED", "UNDER_REVIEW"],
  ] as const)("rejects %s → %s as a conflict", async (from, to) => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision({ status: from }));

    await expect(
      service.transitionDecisionStatus(CONTEXT, PROJECT.id, "dec1", { to }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(decisionRepository.transitionStatusGuarded).not.toHaveBeenCalled();
    expect(auditLogRepository.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("stamps decidedAt on approval when the author did not set one", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(
      decision({ status: "UNDER_REVIEW", decidedAt: null }),
    );
    vi.mocked(decisionRepository.transitionStatusGuarded).mockResolvedValue(decision({ status: "APPROVED" }));

    await service.transitionDecisionStatus(CONTEXT, PROJECT.id, "dec1", { to: "APPROVED" });

    const written = vi.mocked(decisionRepository.transitionStatusGuarded).mock.calls[0]?.[2];
    expect(written?.decidedAt).toBeInstanceOf(Date);
  });

  it("preserves an author-supplied decidedAt on approval", async () => {
    const decidedAt = new Date("2026-01-05T00:00:00.000Z");
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(
      decision({ status: "UNDER_REVIEW", decidedAt }),
    );
    vi.mocked(decisionRepository.transitionStatusGuarded).mockResolvedValue(decision({ status: "APPROVED" }));

    await service.transitionDecisionStatus(CONTEXT, PROJECT.id, "dec1", { to: "APPROVED" });

    expect(vi.mocked(decisionRepository.transitionStatusGuarded).mock.calls[0]?.[2]).not.toHaveProperty(
      "decidedAt",
    );
  });
});

describe("updateDecision", () => {
  it.each(["PROPOSED", "UNDER_REVIEW"] as const)("allows content edits in %s", async (status) => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision({ status }));
    vi.mocked(decisionRepository.updateDecision).mockResolvedValue(
      decision({ status, title: "Revised" }),
    );

    const updated = await service.updateDecision(CONTEXT, PROJECT.id, "dec1", {
      title: "Revised",
    });

    expect(updated.title).toBe("Revised");
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "decision.updated" }),
      TX,
    );
  });

  it.each(["APPROVED", "REJECTED", "SUPERSEDED"] as const)(
    "refuses content edits in %s",
    async (status) => {
      vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision({ status }));

      await expect(
        service.updateDecision(CONTEXT, PROJECT.id, "dec1", { title: "Rewrite" }),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(decisionRepository.updateDecision).not.toHaveBeenCalled();
    },
  );

  it("refuses a status change through PATCH", async () => {
    await expect(
      service.updateDecision(CONTEXT, PROJECT.id, "dec1", { status: "APPROVED" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("does not touch a decision in another project", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(null);

    await expect(
      service.updateDecision(CONTEXT, PROJECT.id, "dec1", { title: "Revised" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("owner", () => {
  it("assigns an owner from the same organization", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(decisionRepository.updateDecision).mockResolvedValue(
      decision({ ownerId: "user2aaaaaaaaaaaaaaaaaaa" }),
    );

    await service.assignDecisionOwner(CONTEXT, PROJECT.id, "dec1", {
      ownerId: "user2aaaaaaaaaaaaaaaaaaa",
    });

    expect(userRepository.isMemberOfOrganization).toHaveBeenCalledWith(
      "user2aaaaaaaaaaaaaaaaaaa",
      CONTEXT.organizationId,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "decision.owner_assigned" }),
      TX,
    );
  });

  it("rejects an owner from another organization", async () => {
    vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(false);

    await expect(
      service.assignDecisionOwner(CONTEXT, PROJECT.id, "dec1", {
        ownerId: "userfromanotherorg1234",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(decisionRepository.updateDecision).not.toHaveBeenCalled();
  });

  it.each(["REJECTED", "SUPERSEDED"] as const)("refuses ownership changes in %s", async (status) => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision({ status }));

    await expect(
      service.assignDecisionOwner(CONTEXT, PROJECT.id, "dec1", { ownerId: "user2aaaaaaaaaaaaaaaaaaa" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("alternatives", () => {
  it("adds, updates and removes an alternative, auditing each", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(alternativeRepository.createAlternative).mockResolvedValue(ALTERNATIVE);
    vi.mocked(alternativeRepository.findAlternativeForDecision).mockResolvedValue(ALTERNATIVE);
    vi.mocked(alternativeRepository.updateAlternative).mockResolvedValue(ALTERNATIVE);
    vi.mocked(alternativeRepository.deleteAlternative).mockResolvedValue(1);

    await service.addAlternative(CONTEXT, PROJECT.id, "dec1", { title: "Ablative liner" });
    await service.updateAlternative(CONTEXT, PROJECT.id, "dec1", ALTERNATIVE.id, {
      reasonRejected: "Mass and refurbishment cost.",
    });
    await service.removeAlternative(CONTEXT, PROJECT.id, "dec1", ALTERNATIVE.id);

    for (const action of [
      "decision.alternative_added",
      "decision.alternative_updated",
      "decision.alternative_removed",
    ]) {
      expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
        expect.objectContaining({ action }),
        TX,
      );
    }
  });

  it("rejects an alternative with no title", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());

    await expect(
      service.addAlternative(CONTEXT, PROJECT.id, "dec1", { title: " " }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses alternatives once the decision is approved", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(
      decision({ status: "APPROVED" }),
    );

    await expect(
      service.addAlternative(CONTEXT, PROJECT.id, "dec1", { title: "Late option" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("does not touch an alternative belonging to another decision", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    // The scoped lookup finds nothing for a foreign alternative.
    vi.mocked(alternativeRepository.findAlternativeForDecision).mockResolvedValue(null);

    await expect(
      service.updateAlternative(CONTEXT, PROJECT.id, "dec1", "altfromotherdecision12", {
        title: "Hijack",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(alternativeRepository.updateAlternative).not.toHaveBeenCalled();
  });

  it("reports a missing alternative on removal rather than silently succeeding", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(alternativeRepository.deleteAlternative).mockResolvedValue(0);

    await expect(
      service.removeAlternative(CONTEXT, PROJECT.id, "dec1", ALTERNATIVE.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("assumptions", () => {
  it("records an assumption without claiming it is valid", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(assumptionRepository.createAssumption).mockResolvedValue(ASSUMPTION);

    const created = await service.addAssumption(CONTEXT, PROJECT.id, "dec1", {
      statement: "Coolant flow stays above 2.4 kg/s.",
    });

    // No status supplied means the repository default (UNKNOWN) applies.
    expect(assumptionRepository.createAssumption).toHaveBeenCalledWith(
      expect.objectContaining({ status: undefined }),
      TX,
    );
    expect(created.status).toBe("UNKNOWN");
  });

  it("lets a user record an explicit validation, and audits the state change", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(assumptionRepository.findAssumptionForDecision).mockResolvedValue(ASSUMPTION);
    vi.mocked(assumptionRepository.updateAssumption).mockResolvedValue({
      ...ASSUMPTION,
      status: "VALIDATED",
    });

    await service.updateAssumption(CONTEXT, PROJECT.id, "dec1", ASSUMPTION.id, {
      status: "VALIDATED",
    });

    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "decision.assumption_updated",
        metadata: expect.objectContaining({ from: "UNKNOWN", to: "VALIDATED" }),
      }),
      TX,
    );
  });

  it("stays editable after approval — that is when assumptions are usually revisited", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(
      decision({ status: "APPROVED" }),
    );
    vi.mocked(assumptionRepository.createAssumption).mockResolvedValue(ASSUMPTION);

    await expect(
      service.addAssumption(CONTEXT, PROJECT.id, "dec1", { statement: "Still true?" }),
    ).resolves.toBeDefined();
  });

  it.each(["REJECTED", "SUPERSEDED"] as const)("freezes assumptions in %s", async (status) => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision({ status }));

    await expect(
      service.addAssumption(CONTEXT, PROJECT.id, "dec1", { statement: "Too late" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects an unknown assumption status", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());

    await expect(
      service.addAssumption(CONTEXT, PROJECT.id, "dec1", {
        statement: "x",
        status: "PROBABLY_FINE",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("does not touch an assumption belonging to another decision", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(assumptionRepository.findAssumptionForDecision).mockResolvedValue(null);

    await expect(
      service.updateAssumption(CONTEXT, PROJECT.id, "dec1", "asmfromotherdecision12", {
        status: "VALIDATED",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("removes an assumption and audits it", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(assumptionRepository.deleteAssumption).mockResolvedValue(1);

    await service.removeAssumption(CONTEXT, PROJECT.id, "dec1", ASSUMPTION.id);

    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "decision.assumption_removed" }),
      TX,
    );
  });
});

describe("expectation", () => {
  it("records an expectation that starts unobserved", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(expectationRepository.setExpectation).mockResolvedValue(EXPECTATION);

    const result = await service.setExpectation(CONTEXT, PROJECT.id, "dec1", {
      statement: "Wall temperature stays below limit.",
      measure: "Peak wall temperature",
      expectedValue: "< 800",
      unit: "K",
    });

    expect(result.status).toBe("NOT_OBSERVED");
    expect(result.actualValue).toBeNull();
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "decision.expectation_set" }),
      TX,
    );
  });

  it("never infers an outcome from a recorded value", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(expectationRepository.setExpectation).mockResolvedValue({
      ...EXPECTATION,
      actualValue: "760",
    });

    await service.setExpectation(CONTEXT, PROJECT.id, "dec1", {
      statement: "Wall temperature stays below limit.",
      expectedValue: "< 800",
      actualValue: "760",
    });

    // An actual value was supplied but no status was: the service must pass
    // status through as undefined rather than deciding it HELD.
    const written = vi.mocked(expectationRepository.setExpectation).mock.calls[0]?.[0];
    expect(written?.actualValue).toBe("760");
    expect(written?.status).toBeUndefined();
  });

  it("accepts an explicitly recorded outcome", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(expectationRepository.setExpectation).mockResolvedValue({
      ...EXPECTATION,
      status: "BREACHED",
      actualValue: "870",
    });

    const result = await service.setExpectation(CONTEXT, PROJECT.id, "dec1", {
      statement: "Wall temperature stays below limit.",
      actualValue: "870",
      status: "BREACHED",
    });

    expect(result.status).toBe("BREACHED");
  });

  it("forwards an explicit comparison operator to the repository", async () => {
    // The domain schema has validated this since the field was added; this
    // guards the service→repository hop that used to drop it silently.
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(expectationRepository.setExpectation).mockResolvedValue({
      ...EXPECTATION,
      comparisonOperator: "LESS_THAN_OR_EQUAL",
    });

    await service.setExpectation(CONTEXT, PROJECT.id, "dec1", {
      statement: "Wall temperature stays below limit.",
      expectedValue: "800",
      unit: "K",
      comparisonOperator: "LESS_THAN_OR_EQUAL",
    });

    const written = vi.mocked(expectationRepository.setExpectation).mock.calls[0]?.[0];
    expect(written?.comparisonOperator).toBe("LESS_THAN_OR_EQUAL");
  });

  it("defaults the operator to null rather than dropping the field", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(expectationRepository.setExpectation).mockResolvedValue(EXPECTATION);

    await service.setExpectation(CONTEXT, PROJECT.id, "dec1", {
      statement: "Wall temperature stays below limit.",
      expectedValue: "< 800",
    });

    const written = vi.mocked(expectationRepository.setExpectation).mock.calls[0]?.[0];
    expect(written).toHaveProperty("comparisonOperator", null);
  });

  it("rejects an expectation with no statement", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());

    await expect(
      service.setExpectation(CONTEXT, PROJECT.id, "dec1", { statement: "" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("clears an expectation and reports when there was none", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(expectationRepository.deleteExpectation).mockResolvedValue(1);

    await service.clearExpectation(CONTEXT, PROJECT.id, "dec1");
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "decision.expectation_cleared" }),
      TX,
    );

    vi.mocked(expectationRepository.deleteExpectation).mockResolvedValue(0);
    await expect(service.clearExpectation(CONTEXT, PROJECT.id, "dec1")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("traceability", () => {
  it.each(["REQUIREMENT", "DESIGN_ITEM", "RISK", "ISSUE", "EVIDENCE"] as const)(
    "links to a same-project %s",
    async (relation) => {
      vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());

      await service.linkDecision(CONTEXT, PROJECT.id, "dec1", {
        relation,
        targetId: "target1aaaaaaaaaaaaaaa",
      });

      expect(decisionRepository.decisionLinkTargetExistsInProject).toHaveBeenCalledWith(
        relation,
        "target1aaaaaaaaaaaaaaa",
        PROJECT.id,
        TX,
      );
      expect(decisionRepository.createDecisionLink).toHaveBeenCalledWith(
        // Provenance comes from the session, never the request body.
        expect.objectContaining({ relation, createdById: CONTEXT.actorId }),
        TX,
      );
    },
  );

  it("rejects a link to a target in another project", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(decisionRepository.decisionLinkTargetExistsInProject).mockResolvedValue(false);

    await expect(
      service.linkDecision(CONTEXT, PROJECT.id, "dec1", {
        relation: "REQUIREMENT",
        targetId: "reqfromotherproject123",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(decisionRepository.createDecisionLink).not.toHaveBeenCalled();
    expect(auditLogRepository.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects an untyped or unknown relation", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());

    await expect(
      service.linkDecision(CONTEXT, PROJECT.id, "dec1", {
        entityType: "Whatever",
        entityId: "x",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("unlinks and reports a missing edge", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());
    vi.mocked(decisionRepository.deleteDecisionLink).mockResolvedValue(1);

    await service.unlinkDecision(CONTEXT, PROJECT.id, "dec1", {
      relation: "DESIGN_ITEM",
      targetId: "design1aaaaaaaaaaaaaaa",
    });
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "decision.link_removed" }),
      TX,
    );

    vi.mocked(decisionRepository.deleteDecisionLink).mockResolvedValue(0);
    await expect(
      service.unlinkDecision(CONTEXT, PROJECT.id, "dec1", {
        relation: "DESIGN_ITEM",
        targetId: "design1aaaaaaaaaaaaaaa",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("getDecision", () => {
  it("returns only legal transitions and per-area editability", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(
      decision({ status: "APPROVED" }),
    );

    const detail = await service.getDecision(CONTEXT, PROJECT.id, "dec1");

    expect(detail.availableTransitions).toEqual(["SUPERSEDED"]);
    // Content closes at approval; assumptions and links stay open.
    expect(detail.editable).toEqual({
      content: false,
      owner: true,
      assumptions: true,
      links: true,
    });
  });

  it("omits the legacy free-text columns so there is one source of truth", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(
      decision({ alternativesConsidered: "legacy text", assumptions: "legacy text" }),
    );

    const detail = await service.getDecision(CONTEXT, PROJECT.id, "dec1");

    expect(detail).not.toHaveProperty("alternativesConsidered");
    expect(Array.isArray(detail.assumptions)).toBe(true);
  });

  it("scopes history to the caller's organization", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());

    await service.getDecision(CONTEXT, PROJECT.id, "dec1");

    expect(auditLogRepository.listAuditEventsForEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: CONTEXT.organizationId,
        entityType: "EngineeringDecision",
      }),
    );
  });
});

describe("listDecisions", () => {
  it("lists within the project and passes a status filter through", async () => {
    vi.mocked(decisionRepository.listDecisionsInProject).mockResolvedValue([]);

    await service.listDecisions(CONTEXT, PROJECT.id, { status: "APPROVED" });

    expect(decisionRepository.listDecisionsInProject).toHaveBeenCalledWith(PROJECT.id, {
      status: "APPROVED",
    });
  });

  it("rejects an unrecognized status filter", async () => {
    await expect(
      service.listDecisions(CONTEXT, PROJECT.id, { status: "NOT_A_STATUS" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("project role authorization", () => {
  function asRole(role: "MANAGER" | "ENGINEER" | "REVIEWER" | "VIEWER") {
    vi.mocked(membershipRepository.findMembership).mockResolvedValue({
      id: "mem1",
      projectId: PROJECT.id,
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: { id: CONTEXT.actorId!, name: "Ada", email: "ada@example.test", organizationRole: "MEMBER" },
    } as never);
  }

  it("refuses a VIEWER creating a decision", async () => {
    asRole("VIEWER");
    await expect(
      service.createDecision(CONTEXT, PROJECT.id, VALID_CREATE),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(decisionRepository.createDecision).not.toHaveBeenCalled();
  });

  it("refuses a REVIEWER creating a decision — review authority is not write authority", async () => {
    asRole("REVIEWER");
    await expect(
      service.createDecision(CONTEXT, PROJECT.id, VALID_CREATE),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows an ENGINEER to create a decision", async () => {
    asRole("ENGINEER");
    vi.mocked(decisionRepository.createDecision).mockResolvedValue(decision());

    await expect(
      service.createDecision(CONTEXT, PROJECT.id, VALID_CREATE),
    ).resolves.toMatchObject({ identifier: "ED-001" });
  });

  it("refuses an ENGINEER approving a decision — write authority is not approval authority", async () => {
    asRole("ENGINEER");
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(
      decision({ status: "UNDER_REVIEW" }),
    );

    await expect(
      service.transitionDecisionStatus(CONTEXT, PROJECT.id, "dec1", { to: "APPROVED" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(decisionRepository.transitionStatusGuarded).not.toHaveBeenCalled();
  });

  it("allows an ENGINEER to move a decision through a non-approval transition", async () => {
    asRole("ENGINEER");
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(
      decision({ status: "PROPOSED" }),
    );
    vi.mocked(decisionRepository.transitionStatusGuarded).mockResolvedValue(
      decision({ status: "UNDER_REVIEW" }),
    );

    await expect(
      service.transitionDecisionStatus(CONTEXT, PROJECT.id, "dec1", { to: "UNDER_REVIEW" }),
    ).resolves.toMatchObject({ status: "UNDER_REVIEW" });
  });

  it("allows a REVIEWER to approve a decision", async () => {
    asRole("REVIEWER");
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(
      decision({ status: "UNDER_REVIEW" }),
    );
    vi.mocked(decisionRepository.transitionStatusGuarded).mockResolvedValue(decision({ status: "APPROVED" }));

    await expect(
      service.transitionDecisionStatus(CONTEXT, PROJECT.id, "dec1", { to: "APPROVED" }),
    ).resolves.toMatchObject({ status: "APPROVED" });
  });

  it("refuses a REVIEWER moving a decision through a non-approval transition", async () => {
    asRole("REVIEWER");
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(
      decision({ status: "PROPOSED" }),
    );

    await expect(
      service.transitionDecisionStatus(CONTEXT, PROJECT.id, "dec1", { to: "UNDER_REVIEW" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows a MANAGER to do both ordinary writes and approvals", async () => {
    asRole("MANAGER");
    vi.mocked(decisionRepository.createDecision).mockResolvedValue(decision());
    await expect(
      service.createDecision(CONTEXT, PROJECT.id, VALID_CREATE),
    ).resolves.toMatchObject({ identifier: "ED-001" });

    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(
      decision({ status: "UNDER_REVIEW" }),
    );
    vi.mocked(decisionRepository.transitionStatusGuarded).mockResolvedValue(decision({ status: "APPROVED" }));
    await expect(
      service.transitionDecisionStatus(CONTEXT, PROJECT.id, "dec1", { to: "APPROVED" }),
    ).resolves.toMatchObject({ status: "APPROVED" });
  });

  it("refuses a VIEWER adding an alternative", async () => {
    asRole("VIEWER");
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(decision());

    await expect(
      service.addAlternative(CONTEXT, PROJECT.id, "dec1", { title: "Ablative liner" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});
