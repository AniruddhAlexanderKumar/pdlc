// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DecisionAssumption, EngineeringDecision, Project } from "@/domain";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ForbiddenError, NotFoundError } from "@/server/errors";

/**
 * Assumption monitoring, against fake repositories and a fake graph: no
 * database, no Prisma. The engineering-graph read always fails here (the
 * basis "could not be resolved"), which is a real, first-class path the
 * service itself defines — not a workaround — and it keeps this file
 * focused on what it is for: the access boundary between evaluating,
 * reviewing and reading, not a second copy of `EngineeringGraphService`'s
 * own traversal (already covered in `engineering-graph.service.test.ts`).
 */
const TX = { __transaction: true } as const;

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)) },
}));

vi.mock("@/server/repositories/project.repository", () => ({
  findProjectInOrganization: vi.fn(),
}));

vi.mock("@/server/repositories/user.repository", () => ({
  isMemberOfOrganization: vi.fn(),
  getOrganizationRole: vi.fn(),
}));

vi.mock("@/server/repositories/project-membership.repository", () => ({ findMembership: vi.fn() }));

vi.mock("@/server/repositories/decision-assumption.repository", () => ({
  findAssumptionForDecision: vi.fn(),
  updateAssumption: vi.fn(),
}));

vi.mock("@/server/repositories/engineering-decision.repository", () => ({
  findDecisionInProject: vi.fn(),
}));

vi.mock("@/server/repositories/assumption-monitoring.repository", () => ({
  createRecord: vi.fn(),
  findLatestRecord: vi.fn(),
  findLatestOfKind: vi.fn(),
  listHistory: vi.fn(),
  listProjectAssumptions: vi.fn(),
}));

vi.mock("@/server/repositories/audit-log.repository", () => ({
  recordAuditEvent: vi.fn(),
}));

const projectRepository = await import("@/server/repositories/project.repository");
const userRepository = await import("@/server/repositories/user.repository");
const membershipRepository = await import("@/server/repositories/project-membership.repository");
const assumptionRepository = await import("@/server/repositories/decision-assumption.repository");
const decisionRepository = await import("@/server/repositories/engineering-decision.repository");
const monitoringRepository = await import("@/server/repositories/assumption-monitoring.repository");
const auditLogRepository = await import("@/server/repositories/audit-log.repository");
const { AssumptionMonitoringService } = await import("./assumption-monitoring.service");

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

const DECISION: EngineeringDecision = {
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
};

function assumption(overrides: Partial<DecisionAssumption> = {}): DecisionAssumption {
  return {
    id: "asm1aaaaaaaaaaaaaaaaaaa",
    engineeringDecisionId: DECISION.id,
    statement: "Coolant flow stays above 2.4 kg/s.",
    status: "UNKNOWN",
    rationale: null,
    createdAt: new Date("2026-01-03T00:00:00.000Z"),
    updatedAt: new Date("2026-01-03T00:00:00.000Z"),
    ...overrides,
  };
}

function record(overrides: Record<string, unknown> = {}) {
  return {
    id: "rec1aaaaaaaaaaaaaaaaaaa",
    assumptionId: assumption().id,
    kind: "EVALUATION",
    status: "UNKNOWN",
    finding: "UNKNOWN",
    basisFingerprint: "fp",
    decisionFingerprint: "fp-d",
    evidenceFingerprint: "fp-e",
    linkedFingerprint: "fp-l",
    basisSnapshot: [],
    changedObjects: [],
    assumptionStatus: "UNKNOWN",
    monitoredAt: new Date("2026-01-04T00:00:00.000Z"),
    reviewNote: null,
    reviewedAt: null,
    statusBefore: null,
    statusAfter: null,
    actor: null,
    createdAt: new Date("2026-01-04T00:00:00.000Z"),
    ...overrides,
  };
}

let service: InstanceType<typeof AssumptionMonitoringService>;

beforeEach(() => {
  vi.clearAllMocks();
  service = new AssumptionMonitoringService({
    // The graph read always fails, forcing `resolved: false` — the
    // service's own documented "could not read the basis" path.
    getDirectConnections: vi.fn(async () => {
      throw new Error("graph unavailable in this fixture");
    }),
    getNodeRevisions: vi.fn(async () => new Map()),
  } as never);

  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
  vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(DECISION);
  vi.mocked(assumptionRepository.findAssumptionForDecision).mockResolvedValue(assumption());
  vi.mocked(monitoringRepository.findLatestRecord).mockResolvedValue(null);
  vi.mocked(monitoringRepository.findLatestOfKind).mockResolvedValue(null);
  vi.mocked(monitoringRepository.createRecord).mockResolvedValue(record() as never);
  vi.mocked(auditLogRepository.recordAuditEvent).mockResolvedValue(undefined as never);

  // CONTEXT's actor is a MANAGER on PROJECT by default — full read/write
  // access, so existing tests exercising ordinary behavior do not also
  // need to set up a role scenario.
  vi.mocked(membershipRepository.findMembership).mockResolvedValue({
    id: "mem1",
    projectId: PROJECT.id,
    role: "MANAGER",
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: CONTEXT.actorId!, name: "Ada", email: "ada@example.test", organizationRole: "MEMBER" },
  } as never);
  vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");
});

describe("evaluateAssumption", () => {
  it("appends an evaluation record without touching the assumption's own status", async () => {
    const state = await service.evaluateAssumption(CONTEXT, PROJECT.id, DECISION.id, assumption().id);

    expect(state.assumptionStatus).toBe("UNKNOWN");
    expect(assumptionRepository.updateAssumption).not.toHaveBeenCalled();
    expect(monitoringRepository.createRecord).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "EVALUATION", assumptionId: assumption().id }),
      TX,
    );
  });

  it("404s a decision outside this project", async () => {
    vi.mocked(decisionRepository.findDecisionInProject).mockResolvedValue(null);

    await expect(
      service.evaluateAssumption(CONTEXT, PROJECT.id, "elsewhere", assumption().id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("reviewAssumption", () => {
  it("moves the assumption's status only when a status is supplied", async () => {
    vi.mocked(assumptionRepository.updateAssumption).mockResolvedValue(
      assumption({ status: "VALIDATED" }),
    );
    vi.mocked(monitoringRepository.createRecord).mockResolvedValue(
      record({ kind: "REVIEW", statusBefore: "UNKNOWN", statusAfter: "VALIDATED" }) as never,
    );

    await service.reviewAssumption(CONTEXT, PROJECT.id, DECISION.id, assumption().id, {
      status: "VALIDATED",
    });

    expect(assumptionRepository.updateAssumption).toHaveBeenCalledWith(
      assumption().id,
      { status: "VALIDATED" },
      TX,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "assumption.status_changed_on_review" }),
      TX,
    );
  });

  it("records a review with no status change as a real outcome, not a no-op", async () => {
    await service.reviewAssumption(CONTEXT, PROJECT.id, DECISION.id, assumption().id, {
      note: "Still holds.",
    });

    expect(assumptionRepository.updateAssumption).not.toHaveBeenCalled();
    expect(monitoringRepository.createRecord).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "REVIEW" }),
      TX,
    );
  });
});

describe("reads", () => {
  it("getAssumptionStatus reports NOT_EVALUATED with no history", async () => {
    const state = await service.getAssumptionStatus(CONTEXT, PROJECT.id, DECISION.id, assumption().id);
    expect(state.monitoringStatus).toBe("NOT_EVALUATED");
  });

  it("getMonitoringHistory returns the append-only log", async () => {
    vi.mocked(monitoringRepository.listHistory).mockResolvedValue([record()] as never);

    const history = await service.getMonitoringHistory(CONTEXT, PROJECT.id, DECISION.id, assumption().id);
    expect(history).toHaveLength(1);
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

  it("refuses a VIEWER evaluating an assumption", async () => {
    asRole("VIEWER");
    await expect(
      service.evaluateAssumption(CONTEXT, PROJECT.id, DECISION.id, assumption().id),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(monitoringRepository.createRecord).not.toHaveBeenCalled();
  });

  it("refuses a REVIEWER evaluating an assumption — no approval tier exists for this domain", async () => {
    asRole("REVIEWER");
    await expect(
      service.evaluateAssumption(CONTEXT, PROJECT.id, DECISION.id, assumption().id),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows an ENGINEER to evaluate an assumption", async () => {
    asRole("ENGINEER");
    await expect(
      service.evaluateAssumption(CONTEXT, PROJECT.id, DECISION.id, assumption().id),
    ).resolves.toBeDefined();
  });

  it("refuses a VIEWER reviewing an assumption", async () => {
    asRole("VIEWER");
    await expect(
      service.reviewAssumption(CONTEXT, PROJECT.id, DECISION.id, assumption().id, {
        note: "Still holds.",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows an ENGINEER to review an assumption — the same engineering authority as an ordinary content edit", async () => {
    asRole("ENGINEER");
    await expect(
      service.reviewAssumption(CONTEXT, PROJECT.id, DECISION.id, assumption().id, {
        note: "Still holds.",
      }),
    ).resolves.toBeDefined();
  });

  it("refuses a VIEWER sweeping the whole project", async () => {
    asRole("VIEWER");
    await expect(
      service.evaluateProjectAssumptions(CONTEXT, PROJECT.id),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a same-organization caller with no project membership cannot even read", async () => {
    vi.mocked(membershipRepository.findMembership).mockResolvedValue(null);
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");

    await expect(
      service.getAssumptionStatus(CONTEXT, PROJECT.id, DECISION.id, assumption().id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a VIEWER can still read", async () => {
    asRole("VIEWER");
    await expect(
      service.getAssumptionStatus(CONTEXT, PROJECT.id, DECISION.id, assumption().id),
    ).resolves.toBeDefined();
  });
});
