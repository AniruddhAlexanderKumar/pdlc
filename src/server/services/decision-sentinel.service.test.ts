// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { dependencyRulesFor } from "@/domain";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import type { SurveillanceTargetWithSource } from "@/server/repositories/surveillance-target.repository";
import type { ContentChangeCandidateRows } from "@/server/repositories/sentinel-candidate.repository";

/**
 * The Decision Sentinel, against fake repositories and fake engine services:
 * no database, no Prisma, and — critically — no real readiness/impact/
 * drift/assumption/certification calculation anywhere in this file. Every
 * one of the six engines the Sentinel can dispatch to is a bare mock; what
 * is under test is the Sentinel's own wiring, never a second copy of any
 * engine's own logic.
 *
 * Recurring concerns across these tests:
 *  - detection only records what actually changed (`updatedAt` moved, or a
 *    recognized relationship audit action fired) — never invents a change;
 *  - a candidate the dependency registry allows still produces no target
 *    unless the target domain's own stored basis actually references the
 *    changed object ("unrelated object creates no target");
 *  - reevaluation dispatches to the real engine, unmodified, and only
 *    resolves the target on a successful dispatch;
 *  - nothing here ever calls an update/write method on an engineering
 *    entity — the fakes below define no such methods, so a service that
 *    tried would fail loudly rather than silently succeed.
 */

const TX = { __transaction: true } as const;

const CONTEXT = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
};

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";
const REQ_ID = "req1aaaaaaaaaaaaaaaaaaaa";
const DI_ID = "di1aaaaaaaaaaaaaaaaaaaaa";
const ED_ID = "ed1aaaaaaaaaaaaaaaaaaaaa";
const ASM_ID = "asm1aaaaaaaaaaaaaaaaaaa";
const VA_ID = "va1aaaaaaaaaaaaaaaaaaaa";
const SUP_ID = "sup1aaaaaaaaaaaaaaaaaa";
const CR_ID = "cr1aaaaaaaaaaaaaaaaaaaa";
const CB_ID = "cb1aaaaaaaaaaaaaaaaaaaa";
const BL_ID = "bl1aaaaaaaaaaaaaaaaaaaa";
const PROG_ID = "prog1aaaaaaaaaaaaaaaaa";
const TARGET_ID = "tgt1aaaaaaaaaaaaaaaaaa";
const RISK_ID = "risk1aaaaaaaaaaaaaaaaa";
const ISSUE_ID = "issue1aaaaaaaaaaaaaaaa";

const T0 = new Date("2026-01-01T00:00:00.000Z");
const T1 = new Date("2026-02-01T00:00:00.000Z");

/** Every field defaults to "nothing here" — a test overrides only what it needs. */
function emptyContentRows(): ContentChangeCandidateRows {
  return {
    requirements: [],
    designItems: [],
    decisions: [],
    assumptions: [],
    activities: [],
    suppliers: [],
    suppliedItems: [],
    qualifications: [],
    changes: [],
    bases: [],
    risks: [],
    issues: [],
    evidence: [],
  };
}

function contentRows(overrides: Partial<ContentChangeCandidateRows>): ContentChangeCandidateRows {
  return { ...emptyContentRows(), ...overrides };
}

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)),
  },
}));

vi.mock("@/server/repositories/project.repository", () => ({
  findProjectInOrganization: vi.fn(),
}));

vi.mock("@/server/repositories/user.repository", () => ({
  isMemberOfOrganization: vi.fn(),
  getOrganizationRole: vi.fn(),
}));

vi.mock("@/server/repositories/project-membership.repository", () => ({ findMembership: vi.fn() }));

vi.mock("@/server/repositories/audit-log.repository", () => ({
  recordAuditEvent: vi.fn(),
  listAuditEventsForEntities: vi.fn(),
  findLatestActorForEntity: vi.fn(),
}));

vi.mock("@/server/repositories/engineering-baseline.repository", () => ({
  findActiveBaseline: vi.fn(),
}));

vi.mock("@/server/repositories/baseline-member.repository", () => ({
  listMembers: vi.fn(),
}));

vi.mock("@/server/repositories/decision-assumption.repository", () => ({
  findAssumptionsByIds: vi.fn(),
}));

vi.mock("@/server/repositories/impact-analysis.repository", () => ({
  findLatestForChanges: vi.fn(),
  findAnalysisIdsCitingNode: vi.fn(),
}));

vi.mock("@/server/repositories/assumption-monitoring.repository", () => ({
  listProjectAssumptions: vi.fn(),
  findLatestForAssumptions: vi.fn(),
}));

vi.mock("@/server/repositories/certification-program.repository", () => ({
  findProgramInProject: vi.fn(),
}));

vi.mock("@/server/repositories/certification-basis.repository", () => ({
  findActiveBasis: vi.fn(),
}));

vi.mock("@/server/repositories/certification-review.repository", () => ({
  findLatestReview: vi.fn(),
  readReviewBasis: vi.fn(),
}));

vi.mock("@/server/repositories/verification-readiness.repository", () => ({
  findLatestBasisForActivities: vi.fn(),
}));

vi.mock("@/server/repositories/technical-readiness.repository", () => ({
  findLatestScopeForGates: vi.fn(),
}));

vi.mock("@/server/repositories/sentinel-candidate.repository", () => ({
  findContentChangeCandidateRows: vi.fn(),
  findObservationCandidateRows: vi.fn(),
  findRequirementAndDecisionMinimalRows: vi.fn(),
  findMinimalVerificationActivities: vi.fn(),
  findMinimalActiveChangeRequests: vi.fn(),
}));

vi.mock("@/server/repositories/sentinel-event.repository", () => ({
  createEvents: vi.fn(),
}));

vi.mock("@/server/repositories/surveillance-target.repository", () => ({
  upsertOpenTarget: vi.fn(),
  supersedeAcknowledged: vi.fn(),
  findTargetInProject: vi.fn(),
  listOpenTargets: vi.fn(),
  listTargetsForProject: vi.fn(),
  countByStatus: vi.fn(),
  acknowledgeTarget: vi.fn(),
  resolveTarget: vi.fn(),
}));

// Every engine the Sentinel can dispatch to: bare mocks, one method each.
// If `dispatchReevaluation` ever grew a second call into readiness/impact/
// drift/assumption/certification logic, these mocks would not provide it.
vi.mock("./assumption-monitoring.service", () => ({
  assumptionMonitoringService: { evaluateAssumption: vi.fn() },
}));
vi.mock("./certification-review.service", () => ({
  certificationReviewService: { evaluateCertificationReview: vi.fn() },
}));
vi.mock("./change-impact-analysis.service", () => ({
  changeImpactAnalysisService: { runImpactAnalysis: vi.fn() },
}));
vi.mock("./drift-detection.service", () => ({
  driftDetectionService: { evaluateDrift: vi.fn() },
}));
vi.mock("./technical-readiness.service", () => ({
  technicalReadinessService: { evaluateTechnicalReadiness: vi.fn() },
}));
vi.mock("./verification-readiness.service", () => ({
  verificationReadinessService: { evaluateVerificationReadiness: vi.fn() },
}));

const projectRepository = await import("@/server/repositories/project.repository");
const userRepository = await import("@/server/repositories/user.repository");
const membershipRepository = await import("@/server/repositories/project-membership.repository");
const auditLogRepository = await import("@/server/repositories/audit-log.repository");
const baselineRepository = await import("@/server/repositories/engineering-baseline.repository");
const baselineMemberRepository = await import("@/server/repositories/baseline-member.repository");
const decisionAssumptionRepository =
  await import("@/server/repositories/decision-assumption.repository");
const impactAnalysisRepository = await import("@/server/repositories/impact-analysis.repository");
const monitoringRepository = await import("@/server/repositories/assumption-monitoring.repository");
const certificationProgramRepository =
  await import("@/server/repositories/certification-program.repository");
const certificationBasisRepository =
  await import("@/server/repositories/certification-basis.repository");
const certificationReviewRepository =
  await import("@/server/repositories/certification-review.repository");
const verificationReadinessRepository =
  await import("@/server/repositories/verification-readiness.repository");
const technicalReadinessRepository =
  await import("@/server/repositories/technical-readiness.repository");
const sentinelCandidateRepository =
  await import("@/server/repositories/sentinel-candidate.repository");
const sentinelEventRepository = await import("@/server/repositories/sentinel-event.repository");
const surveillanceTargetRepository =
  await import("@/server/repositories/surveillance-target.repository");
const { assumptionMonitoringService } = await import("./assumption-monitoring.service");
const { certificationReviewService } = await import("./certification-review.service");
const { changeImpactAnalysisService } = await import("./change-impact-analysis.service");
const { driftDetectionService } = await import("./drift-detection.service");
const { technicalReadinessService } = await import("./technical-readiness.service");
const { verificationReadinessService } = await import("./verification-readiness.service");

const { DecisionSentinelService } = await import("./decision-sentinel.service");

let service: InstanceType<typeof DecisionSentinelService>;
let eventCounter: number;

function target(
  overrides: Partial<SurveillanceTargetWithSource> = {},
): SurveillanceTargetWithSource {
  return {
    id: TARGET_ID,
    projectId: PROJECT_ID,
    targetType: "VERIFICATION_READINESS",
    targetId: VA_ID,
    targetIdentifier: "VA-001",
    targetLabel: "Hot fire test",
    reason:
      "The requirement changed after a verification readiness assessment included it in its basis.",
    sourceEventId: "evt1",
    sourceType: "REQUIREMENT",
    sourceId: REQ_ID,
    sourceIdentifier: "REQ-001",
    sourceLabel: "Chamber pressure",
    status: "OPEN",
    detectedAt: T1,
    acknowledgedAt: null,
    acknowledgedById: null,
    acknowledgementNote: null,
    resolvedAt: null,
    resolvedById: null,
    resolutionNote: null,
    supersededById: null,
    createdAt: T1,
    updatedAt: T1,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  service = new DecisionSentinelService();
  eventCounter = 0;

  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue({
    id: PROJECT_ID,
  } as never);
  vi.mocked(auditLogRepository.recordAuditEvent).mockResolvedValue(undefined as never);
  // CONTEXT's actor is a MANAGER on the project by default — full read/write/
  // approve/manage access, so existing tests exercising ordinary behavior do
  // not also need to set up a role scenario.
  vi.mocked(membershipRepository.findMembership).mockResolvedValue({
    id: "mem1",
    projectId: PROJECT_ID,
    role: "MANAGER",
    createdAt: T0,
    updatedAt: T0,
    user: {
      id: CONTEXT.actorId,
      name: "Ada",
      email: "ada@example.test",
      organizationRole: "MEMBER",
    },
  } as never);
  vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");

  // Content-change sources: nothing exists by default, so nothing has changed.
  vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
    emptyContentRows(),
  );
  vi.mocked(sentinelCandidateRepository.findObservationCandidateRows).mockResolvedValue([]);
  vi.mocked(sentinelCandidateRepository.findRequirementAndDecisionMinimalRows).mockResolvedValue({
    requirements: [],
    decisions: [],
  });
  vi.mocked(sentinelCandidateRepository.findMinimalVerificationActivities).mockResolvedValue([]);
  vi.mocked(sentinelCandidateRepository.findMinimalActiveChangeRequests).mockResolvedValue([]);
  vi.mocked(auditLogRepository.listAuditEventsForEntities).mockResolvedValue([]);
  vi.mocked(auditLogRepository.findLatestActorForEntity).mockResolvedValue(null);
  vi.mocked(decisionAssumptionRepository.findAssumptionsByIds).mockResolvedValue(new Map());
  vi.mocked(impactAnalysisRepository.findAnalysisIdsCitingNode).mockResolvedValue(new Set());

  // Every dependent domain: nothing to consult by default, so no membership
  // check can ever pass. Each test that wants a specific target opts in.
  vi.mocked(verificationReadinessRepository.findLatestBasisForActivities).mockResolvedValue(
    new Map(),
  );
  vi.mocked(technicalReadinessRepository.findLatestScopeForGates).mockResolvedValue(new Map());
  vi.mocked(impactAnalysisRepository.findLatestForChanges).mockResolvedValue(new Map());
  vi.mocked(monitoringRepository.listProjectAssumptions).mockResolvedValue([]);
  vi.mocked(monitoringRepository.findLatestForAssumptions).mockResolvedValue(new Map());
  vi.mocked(baselineRepository.findActiveBaseline).mockResolvedValue(null);
  vi.mocked(baselineMemberRepository.listMembers).mockResolvedValue([]);
  vi.mocked(certificationProgramRepository.findProgramInProject).mockResolvedValue(null);
  vi.mocked(certificationBasisRepository.findActiveBasis).mockResolvedValue(null);
  vi.mocked(certificationReviewRepository.findLatestReview).mockResolvedValue(null);
  vi.mocked(certificationReviewRepository.readReviewBasis).mockResolvedValue({
    objects: [],
  } as never);

  // Detection events pass straight through with a generated id, matching the
  // repository's own append-only, idempotent-by-construction contract.
  vi.mocked(sentinelEventRepository.createEvents).mockImplementation(
    async (_projectId, events) =>
      events.map((event) => {
        eventCounter += 1;
        return { id: `evt${eventCounter}`, createdAt: T1, ...event };
      }) as never,
  );

  // A fresh OPEN row by default; each duplicate-suppression test overrides this.
  vi.mocked(surveillanceTargetRepository.upsertOpenTarget).mockImplementation(async (input) => ({
    id: `open-${input.targetType}-${input.targetId}`,
    inserted: true,
  }));
  vi.mocked(surveillanceTargetRepository.supersedeAcknowledged).mockResolvedValue(0);
});

// --- Detection: content changes ---------------------------------------------

describe("detection: content changes", () => {
  it("records an event for a requirement whose updatedAt has moved", async () => {
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        requirements: [
          {
            id: REQ_ID,
            identifier: "REQ-001",
            label: "Chamber pressure",
            createdAt: T0,
            updatedAt: T1,
          },
        ],
      }),
    );

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);

    expect(summary.eventsCreated).toBe(1);
    expect(sentinelEventRepository.createEvents).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: "REQUIREMENT",
          sourceId: REQ_ID,
          eventType: "ENGINEERING_OBJECT_CHANGED",
          sourceRevision: T1.toISOString(),
        }),
      ]),
    );
  });

  it("records no event for a requirement never edited", async () => {
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        requirements: [
          {
            id: REQ_ID,
            identifier: "REQ-001",
            label: "Chamber pressure",
            createdAt: T0,
            updatedAt: T0,
          },
        ],
      }),
    );

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);

    expect(summary.eventsCreated).toBe(0);
  });

  it("records an event for a changed design item", async () => {
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        designItems: [
          {
            id: DI_ID,
            identifier: "DI-001",
            label: "Combustion chamber",
            createdAt: T0,
            updatedAt: T1,
          },
        ],
      }),
    );

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);
    expect(summary.eventsCreated).toBe(1);
  });

  it("records an event for a changed engineering decision", async () => {
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        decisions: [
          {
            id: ED_ID,
            identifier: "ED-001",
            label: "Use titanium liner",
            createdAt: T0,
            updatedAt: T1,
          },
        ],
      }),
    );

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);
    expect(summary.eventsCreated).toBe(1);
  });

  it("records an event for a changed decision assumption", async () => {
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        assumptions: [
          {
            id: ASM_ID,
            identifier: null,
            label: "Supplier ships on schedule",
            createdAt: T0,
            updatedAt: T1,
          },
        ],
      }),
    );

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);
    expect(summary.eventsCreated).toBe(1);
  });

  it("records an event for a changed verification activity", async () => {
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        activities: [
          { id: VA_ID, identifier: "VA-001", label: "Hot fire test", createdAt: T0, updatedAt: T1 },
        ],
      }),
    );

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);
    expect(summary.eventsCreated).toBe(1);
  });

  it("records an event for a changed supplier", async () => {
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        suppliers: [
          { id: SUP_ID, identifier: "SUP-001", label: "Acme Alloys", createdAt: T0, updatedAt: T1 },
        ],
      }),
    );

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);
    expect(summary.eventsCreated).toBe(1);
  });

  it("records an event for a changed risk", async () => {
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        risks: [
          {
            id: RISK_ID,
            identifier: "RSK-001",
            label: "Coolant supply interruption",
            createdAt: T0,
            updatedAt: T1,
          },
        ],
      }),
    );

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);
    expect(summary.eventsCreated).toBe(1);
    expect(sentinelEventRepository.createEvents).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: "RISK",
          sourceId: RISK_ID,
          eventType: "ENGINEERING_OBJECT_CHANGED",
        }),
      ]),
    );
  });

  it("records an event for a changed issue", async () => {
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        issues: [
          {
            id: ISSUE_ID,
            identifier: "ISS-001",
            label: "Chamber wall crack found",
            createdAt: T0,
            updatedAt: T1,
          },
        ],
      }),
    );

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);
    expect(summary.eventsCreated).toBe(1);
    expect(sentinelEventRepository.createEvents).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.arrayContaining([
        expect.objectContaining({
          sourceType: "ISSUE",
          sourceId: ISSUE_ID,
          eventType: "ENGINEERING_OBJECT_CHANGED",
        }),
      ]),
    );
  });
});

// --- Detection: observations -------------------------------------------------

describe("detection: observations", () => {
  it("records an event for every recorded observation, changed or not", async () => {
    vi.mocked(sentinelCandidateRepository.findObservationCandidateRows).mockResolvedValue([
      { id: "obs1", identifier: "OBS-001", title: "Peak wall temperature", updatedAt: T1 },
      { id: "obs2", identifier: "OBS-002", title: "Vibration spectrum", updatedAt: T1 },
    ]);

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);

    expect(summary.eventsCreated).toBe(2);
    expect(sentinelEventRepository.createEvents).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.arrayContaining([expect.objectContaining({ eventType: "OBSERVATION_RECORDED" })]),
    );
  });
});

// --- Detection: relationship changes ----------------------------------------

describe("detection: relationship changes", () => {
  it("records a relationship-change event from a recognized audit action", async () => {
    vi.mocked(sentinelCandidateRepository.findRequirementAndDecisionMinimalRows).mockResolvedValue({
      requirements: [{ id: REQ_ID, identifier: "REQ-001", title: "Chamber pressure" }],
      decisions: [],
    });
    vi.mocked(auditLogRepository.listAuditEventsForEntities).mockResolvedValue([
      {
        id: "al1",
        action: "requirement.link_added",
        entityType: "Requirement",
        entityId: REQ_ID,
        createdAt: T1,
      },
    ]);

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);

    expect(summary.eventsCreated).toBe(1);
    expect(sentinelEventRepository.createEvents).toHaveBeenCalledWith(
      PROJECT_ID,
      expect.arrayContaining([
        expect.objectContaining({
          eventType: "RELATIONSHIP_CHANGED",
          sourceType: "REQUIREMENT",
          sourceRevision: "audit:al1",
        }),
      ]),
    );
  });

  it("ignores an audit row whose action is not a recognized relationship change", async () => {
    vi.mocked(sentinelCandidateRepository.findRequirementAndDecisionMinimalRows).mockResolvedValue({
      requirements: [{ id: REQ_ID, identifier: "REQ-001", title: "Chamber pressure" }],
      decisions: [],
    });
    vi.mocked(auditLogRepository.listAuditEventsForEntities).mockResolvedValue([
      {
        id: "al1",
        action: "requirement.renamed",
        entityType: "Requirement",
        entityId: REQ_ID,
        createdAt: T1,
      },
    ]);

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);
    expect(summary.eventsCreated).toBe(0);
  });

  it("skips an audit row for an entity this project does not own, without throwing", async () => {
    vi.mocked(sentinelCandidateRepository.findRequirementAndDecisionMinimalRows).mockResolvedValue({
      requirements: [{ id: REQ_ID, identifier: "REQ-001", title: "Chamber pressure" }],
      decisions: [],
    });
    vi.mocked(auditLogRepository.listAuditEventsForEntities).mockResolvedValue([
      {
        id: "al1",
        action: "requirement.link_added",
        entityType: "Requirement",
        entityId: "req-elsewhere",
        createdAt: T1,
      },
    ]);

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);
    expect(summary.eventsCreated).toBe(0);
  });

  it("never scans the audit log when the project has no requirements or decisions", async () => {
    await service.detectProjectChanges(CONTEXT, PROJECT_ID);
    expect(auditLogRepository.listAuditEventsForEntities).not.toHaveBeenCalled();
  });
});

// --- Detection: audit trail --------------------------------------------------

describe("detection: audit trail", () => {
  it("records no detection-run audit event when nothing changed", async () => {
    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);

    expect(summary).toEqual({ eventsCreated: 0, targetsOpened: 0, targetsUpdated: 0 });
    expect(auditLogRepository.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("records exactly one detection-run audit event, however many events were found", async () => {
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        requirements: [
          {
            id: REQ_ID,
            identifier: "REQ-001",
            label: "Chamber pressure",
            createdAt: T0,
            updatedAt: T1,
          },
        ],
        designItems: [
          { id: DI_ID, identifier: "DI-001", label: "Liner", createdAt: T0, updatedAt: T1 },
        ],
      }),
    );

    await service.detectProjectChanges(CONTEXT, PROJECT_ID);

    const detectionRuns = vi
      .mocked(auditLogRepository.recordAuditEvent)
      .mock.calls.filter(
        ([event]) => (event as { action: string }).action === "sentinel.detection_run",
      );
    expect(detectionRuns).toHaveLength(1);
  });

  it("404s when the project is outside the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    await expect(service.detectProjectChanges(CONTEXT, "elsewhere")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

// --- Dependency resolution: membership checks -------------------------------

describe("dependency resolution", () => {
  it("**opens no target when the changed object is not in any consulted basis**", async () => {
    // The registry allows REQUIREMENT -> IMPACT_ANALYSIS/VERIFICATION_READINESS/
    // TECHNICAL_READINESS/CERTIFICATION_REVIEW, but nothing downstream actually
    // references this requirement, so none of the four should fire.
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        requirements: [
          {
            id: REQ_ID,
            identifier: "REQ-001",
            label: "Chamber pressure",
            createdAt: T0,
            updatedAt: T1,
          },
        ],
      }),
    );
    vi.mocked(sentinelCandidateRepository.findMinimalVerificationActivities).mockResolvedValue([
      { id: VA_ID, identifier: "VA-001", title: "Hot fire test" },
    ]);
    vi.mocked(verificationReadinessRepository.findLatestBasisForActivities).mockResolvedValue(
      new Map([
        [VA_ID, { objects: [{ type: "DESIGN_ITEM", id: "some-other-design-item" }] }],
      ]) as never,
    );

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);

    expect(summary.targetsOpened).toBe(0);
    expect(surveillanceTargetRepository.upsertOpenTarget).not.toHaveBeenCalled();
  });

  it("opens a VERIFICATION_READINESS target when the assessment's basis references the changed object", async () => {
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        requirements: [
          {
            id: REQ_ID,
            identifier: "REQ-001",
            label: "Chamber pressure",
            createdAt: T0,
            updatedAt: T1,
          },
        ],
      }),
    );
    vi.mocked(sentinelCandidateRepository.findMinimalVerificationActivities).mockResolvedValue([
      { id: VA_ID, identifier: "VA-001", title: "Hot fire test" },
    ]);
    vi.mocked(verificationReadinessRepository.findLatestBasisForActivities).mockResolvedValue(
      new Map([[VA_ID, { objects: [{ type: "REQUIREMENT", id: REQ_ID }] }]]) as never,
    );

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);

    expect(summary.targetsOpened).toBe(1);
    expect(surveillanceTargetRepository.upsertOpenTarget).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PROJECT_ID,
        targetType: "VERIFICATION_READINESS",
        targetId: VA_ID,
        reason: expect.stringContaining("verification readiness"),
      }),
      TX,
    );
  });

  it("opens a DRIFT_ASSESSMENT target for a design item baselined as a member", async () => {
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        designItems: [
          {
            id: DI_ID,
            identifier: "DI-001",
            label: "Combustion chamber",
            createdAt: T0,
            updatedAt: T1,
          },
        ],
      }),
    );
    vi.mocked(baselineRepository.findActiveBaseline).mockResolvedValue({
      id: BL_ID,
      identifier: "BL-001",
      name: "Design baseline",
    } as never);
    vi.mocked(baselineMemberRepository.listMembers).mockResolvedValue([
      { nodeType: "DESIGN_ITEM", nodeId: DI_ID },
    ] as never);

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);

    expect(summary.targetsOpened).toBe(1);
    expect(surveillanceTargetRepository.upsertOpenTarget).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: "DRIFT_ASSESSMENT", targetId: BL_ID }),
      TX,
    );
  });

  it("opens no drift target for a design item that is not a baseline member", async () => {
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        designItems: [
          {
            id: DI_ID,
            identifier: "DI-001",
            label: "Combustion chamber",
            createdAt: T0,
            updatedAt: T1,
          },
        ],
      }),
    );
    vi.mocked(baselineRepository.findActiveBaseline).mockResolvedValue({
      id: BL_ID,
      identifier: "BL-001",
      name: "Design baseline",
    } as never);
    vi.mocked(baselineMemberRepository.listMembers).mockResolvedValue([
      { nodeType: "DESIGN_ITEM", nodeId: "a-different-design-item" },
    ] as never);

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);
    expect(summary.targetsOpened).toBe(0);
  });

  // REQUIREMENT, ENGINEERING_DECISION and VERIFICATION_ACTIVITY are all real
  // BaselineMemberType values whose fingerprint the drift basis folds in —
  // the same generic membership check `candidatesFromDrift` already performs
  // for DESIGN_ITEM above, now reachable for these three too via the three
  // dependency rows added to SURVEILLANCE_DEPENDENCY_RULES.
  it("opens a DRIFT_ASSESSMENT target for a requirement baselined as a member", async () => {
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        requirements: [
          {
            id: REQ_ID,
            identifier: "REQ-001",
            label: "Chamber pressure",
            createdAt: T0,
            updatedAt: T1,
          },
        ],
      }),
    );
    vi.mocked(baselineRepository.findActiveBaseline).mockResolvedValue({
      id: BL_ID,
      identifier: "BL-001",
      name: "Design baseline",
    } as never);
    vi.mocked(baselineMemberRepository.listMembers).mockResolvedValue([
      { nodeType: "REQUIREMENT", nodeId: REQ_ID },
    ] as never);

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);

    expect(summary.targetsOpened).toBe(1);
    expect(surveillanceTargetRepository.upsertOpenTarget).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: "DRIFT_ASSESSMENT", targetId: BL_ID }),
      TX,
    );
  });

  it("opens a DRIFT_ASSESSMENT target for a decision baselined as a member", async () => {
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        decisions: [
          {
            id: ED_ID,
            identifier: "ED-001",
            label: "Use regenerative cooling",
            createdAt: T0,
            updatedAt: T1,
          },
        ],
      }),
    );
    vi.mocked(baselineRepository.findActiveBaseline).mockResolvedValue({
      id: BL_ID,
      identifier: "BL-001",
      name: "Design baseline",
    } as never);
    vi.mocked(baselineMemberRepository.listMembers).mockResolvedValue([
      { nodeType: "ENGINEERING_DECISION", nodeId: ED_ID },
    ] as never);

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);

    expect(summary.targetsOpened).toBe(1);
    expect(surveillanceTargetRepository.upsertOpenTarget).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: "DRIFT_ASSESSMENT", targetId: BL_ID }),
      TX,
    );
  });

  it("opens a DRIFT_ASSESSMENT target for a verification activity baselined as a member", async () => {
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        activities: [
          { id: VA_ID, identifier: "VA-001", label: "Hot fire test", createdAt: T0, updatedAt: T1 },
        ],
      }),
    );
    vi.mocked(baselineRepository.findActiveBaseline).mockResolvedValue({
      id: BL_ID,
      identifier: "BL-001",
      name: "Design baseline",
    } as never);
    vi.mocked(baselineMemberRepository.listMembers).mockResolvedValue([
      { nodeType: "VERIFICATION_ACTIVITY", nodeId: VA_ID },
    ] as never);

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);

    expect(summary.targetsOpened).toBe(1);
    expect(surveillanceTargetRepository.upsertOpenTarget).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: "DRIFT_ASSESSMENT", targetId: BL_ID }),
      TX,
    );
  });

  it("opens a drift target for a new observation whenever an active baseline exists", async () => {
    vi.mocked(sentinelCandidateRepository.findObservationCandidateRows).mockResolvedValue([
      { id: "obs1", identifier: "OBS-001", title: "Peak wall temperature", updatedAt: T1 },
    ]);
    vi.mocked(baselineRepository.findActiveBaseline).mockResolvedValue({
      id: BL_ID,
      identifier: "BL-001",
      name: "Design baseline",
    } as never);

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);

    expect(summary.targetsOpened).toBe(1);
    expect(surveillanceTargetRepository.upsertOpenTarget).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: "DRIFT_ASSESSMENT", targetId: BL_ID }),
      TX,
    );
  });

  it("opens an IMPACT_ANALYSIS target when a completed analysis actually reached the changed object", async () => {
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        requirements: [
          {
            id: REQ_ID,
            identifier: "REQ-001",
            label: "Chamber pressure",
            createdAt: T0,
            updatedAt: T1,
          },
        ],
      }),
    );
    vi.mocked(sentinelCandidateRepository.findMinimalActiveChangeRequests).mockResolvedValue([
      { id: CR_ID, identifier: "CR-001", title: "Reduce wall thickness" },
    ]);
    vi.mocked(impactAnalysisRepository.findLatestForChanges).mockResolvedValue(
      new Map([[CR_ID, { id: "ia1", status: "COMPLETED" }]]) as never,
    );
    vi.mocked(impactAnalysisRepository.findAnalysisIdsCitingNode).mockResolvedValue(
      new Set(["ia1"]),
    );

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);

    expect(summary.targetsOpened).toBe(1);
    expect(surveillanceTargetRepository.upsertOpenTarget).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: "IMPACT_ANALYSIS", targetId: CR_ID }),
      TX,
    );
  });

  it("**never consults an impact analysis that has not completed**", async () => {
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        requirements: [
          {
            id: REQ_ID,
            identifier: "REQ-001",
            label: "Chamber pressure",
            createdAt: T0,
            updatedAt: T1,
          },
        ],
      }),
    );
    vi.mocked(sentinelCandidateRepository.findMinimalActiveChangeRequests).mockResolvedValue([
      { id: CR_ID, identifier: "CR-001", title: "Reduce wall thickness" },
    ]);
    vi.mocked(impactAnalysisRepository.findLatestForChanges).mockResolvedValue(
      new Map([[CR_ID, { id: "ia1", status: "RUNNING" }]]) as never,
    );

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);

    expect(summary.targetsOpened).toBe(0);
    expect(impactAnalysisRepository.findAnalysisIdsCitingNode).not.toHaveBeenCalled();
  });

  it("opens ASSUMPTION_MONITORING for the assumption's own change", async () => {
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        assumptions: [
          {
            id: ASM_ID,
            identifier: null,
            label: "Supplier ships on schedule",
            createdAt: T0,
            updatedAt: T1,
          },
        ],
      }),
    );
    vi.mocked(monitoringRepository.listProjectAssumptions).mockResolvedValue([
      {
        id: ASM_ID,
        statement: "Supplier ships on schedule",
        status: "ACTIVE",
        engineeringDecisionId: ED_ID,
        decisionIdentifier: "ED-001",
      },
    ] as never);

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);

    expect(summary.targetsOpened).toBe(1);
    expect(surveillanceTargetRepository.upsertOpenTarget).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: "ASSUMPTION_MONITORING", targetId: ASM_ID }),
      TX,
    );
  });

  it("opens ASSUMPTION_MONITORING when a decision behind an assumption's own basis changed", async () => {
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        decisions: [
          {
            id: ED_ID,
            identifier: "ED-001",
            label: "Use titanium liner",
            createdAt: T0,
            updatedAt: T1,
          },
        ],
      }),
    );
    vi.mocked(monitoringRepository.listProjectAssumptions).mockResolvedValue([
      {
        id: ASM_ID,
        statement: "Supplier ships on schedule",
        status: "ACTIVE",
        engineeringDecisionId: ED_ID,
        decisionIdentifier: "ED-001",
      },
    ] as never);
    vi.mocked(monitoringRepository.findLatestForAssumptions).mockResolvedValue(
      new Map([
        [ASM_ID, { basisSnapshot: [{ type: "ENGINEERING_DECISION", id: ED_ID }] }],
      ]) as never,
    );

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);

    expect(summary.targetsOpened).toBe(1);
    expect(surveillanceTargetRepository.upsertOpenTarget).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: "ASSUMPTION_MONITORING", targetId: ASM_ID }),
      TX,
    );
  });

  it("opens CERTIFICATION_REVIEW when the ACTIVE certification basis changes", async () => {
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        bases: [
          { id: CB_ID, identifier: "CB-001", label: "Basis rev A", createdAt: T0, updatedAt: T1 },
        ],
      }),
    );
    vi.mocked(certificationProgramRepository.findProgramInProject).mockResolvedValue({
      id: PROG_ID,
      identifier: "CERT-001",
      name: "Type certification",
    } as never);
    vi.mocked(certificationBasisRepository.findActiveBasis).mockResolvedValue({
      id: CB_ID,
    } as never);

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);

    expect(summary.targetsOpened).toBe(1);
    expect(surveillanceTargetRepository.upsertOpenTarget).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: "CERTIFICATION_REVIEW", targetId: PROG_ID }),
      TX,
    );
  });

  it("**does not open CERTIFICATION_REVIEW for a superseded (non-active) basis**", async () => {
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        bases: [
          { id: CB_ID, identifier: "CB-001", label: "Basis rev A", createdAt: T0, updatedAt: T1 },
        ],
      }),
    );
    vi.mocked(certificationProgramRepository.findProgramInProject).mockResolvedValue({
      id: PROG_ID,
      identifier: "CERT-001",
      name: "Type certification",
    } as never);
    vi.mocked(certificationBasisRepository.findActiveBasis).mockResolvedValue({
      id: "a-newer-active-basis",
    } as never);

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);
    expect(summary.targetsOpened).toBe(0);
  });

  it("opens CERTIFICATION_REVIEW when the latest review's basis references the changed requirement", async () => {
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        requirements: [
          {
            id: REQ_ID,
            identifier: "REQ-001",
            label: "Chamber pressure",
            createdAt: T0,
            updatedAt: T1,
          },
        ],
      }),
    );
    vi.mocked(certificationProgramRepository.findProgramInProject).mockResolvedValue({
      id: PROG_ID,
      identifier: "CERT-001",
      name: "Type certification",
    } as never);
    vi.mocked(certificationReviewRepository.findLatestReview).mockResolvedValue({
      id: "rev1",
    } as never);
    vi.mocked(certificationReviewRepository.readReviewBasis).mockResolvedValue({
      objects: [{ type: "REQUIREMENT", id: REQ_ID }],
    } as never);

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);

    expect(summary.targetsOpened).toBe(1);
    expect(surveillanceTargetRepository.upsertOpenTarget).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: "CERTIFICATION_REVIEW", targetId: PROG_ID }),
      TX,
    );
  });

  it("opens IMPACT_ANALYSIS when a changed risk was reached by a completed analysis", async () => {
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        risks: [
          {
            id: RISK_ID,
            identifier: "RSK-001",
            label: "Coolant supply interruption",
            createdAt: T0,
            updatedAt: T1,
          },
        ],
      }),
    );
    vi.mocked(sentinelCandidateRepository.findMinimalActiveChangeRequests).mockResolvedValue([
      { id: CR_ID, identifier: "CR-001", title: "Reduce wall thickness" },
    ]);
    vi.mocked(impactAnalysisRepository.findLatestForChanges).mockResolvedValue(
      new Map([[CR_ID, { id: "ia1", status: "COMPLETED" }]]) as never,
    );
    vi.mocked(impactAnalysisRepository.findAnalysisIdsCitingNode).mockResolvedValue(
      new Set(["ia1"]),
    );

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);

    expect(summary.targetsOpened).toBe(1);
    expect(surveillanceTargetRepository.upsertOpenTarget).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: "IMPACT_ANALYSIS", targetId: CR_ID }),
      TX,
    );
  });

  it("**never dispatches a risk or issue change to CERTIFICATION_REVIEW — no such dependency row exists**", async () => {
    // A compliance item may link to a risk/issue as supporting context, but
    // that link is deliberately excluded from the review's own basis
    // snapshot and fingerprint, so a risk/issue change can never make a
    // review stale. A row here would be unreachable by construction.
    const targetTypes = dependencyRulesFor("RISK").map((rule) => rule.targetType);
    expect(targetTypes).not.toContain("CERTIFICATION_REVIEW");
    expect(dependencyRulesFor("ISSUE").map((rule) => rule.targetType)).not.toContain(
      "CERTIFICATION_REVIEW",
    );
  });

  it("opens TECHNICAL_READINESS when a changed issue is counted in a gate assessment's scope", async () => {
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        issues: [
          {
            id: ISSUE_ID,
            identifier: "ISS-001",
            label: "Chamber wall crack found",
            createdAt: T0,
            updatedAt: T1,
          },
        ],
      }),
    );
    vi.mocked(technicalReadinessRepository.findLatestScopeForGates).mockResolvedValue(
      new Map([["SYSTEM_DEFINITION", { objects: [{ type: "ISSUE", id: ISSUE_ID }] }]]) as never,
    );

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);

    expect(summary.targetsOpened).toBe(1);
    expect(surveillanceTargetRepository.upsertOpenTarget).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: "TECHNICAL_READINESS", targetId: "SYSTEM_DEFINITION" }),
      TX,
    );
  });

  it("**opens no target for a risk that no consulted basis references**", async () => {
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        risks: [
          {
            id: RISK_ID,
            identifier: "RSK-001",
            label: "Coolant supply interruption",
            createdAt: T0,
            updatedAt: T1,
          },
        ],
      }),
    );

    const summary = await service.detectProjectChanges(CONTEXT, PROJECT_ID);

    expect(summary.targetsOpened).toBe(0);
    expect(surveillanceTargetRepository.upsertOpenTarget).not.toHaveBeenCalled();
  });
});

// --- Duplicate suppression ---------------------------------------------------

describe("duplicate suppression", () => {
  async function requirementChangedIntoVerificationReadiness() {
    vi.mocked(sentinelCandidateRepository.findContentChangeCandidateRows).mockResolvedValue(
      contentRows({
        requirements: [
          {
            id: REQ_ID,
            identifier: "REQ-001",
            label: "Chamber pressure",
            createdAt: T0,
            updatedAt: T1,
          },
        ],
      }),
    );
    vi.mocked(sentinelCandidateRepository.findMinimalVerificationActivities).mockResolvedValue([
      { id: VA_ID, identifier: "VA-001", title: "Hot fire test" },
    ]);
    vi.mocked(verificationReadinessRepository.findLatestBasisForActivities).mockResolvedValue(
      new Map([[VA_ID, { objects: [{ type: "REQUIREMENT", id: REQ_ID }] }]]) as never,
    );
    return service.detectProjectChanges(CONTEXT, PROJECT_ID);
  }

  it("counts a genuinely new open target as opened, and supersedes any acknowledged one", async () => {
    vi.mocked(surveillanceTargetRepository.upsertOpenTarget).mockResolvedValue({
      id: "new-target",
      inserted: true,
    });

    const summary = await requirementChangedIntoVerificationReadiness();

    expect(summary.targetsOpened).toBe(1);
    expect(summary.targetsUpdated).toBe(0);
    expect(surveillanceTargetRepository.supersedeAcknowledged).toHaveBeenCalledWith(
      PROJECT_ID,
      "VERIFICATION_READINESS",
      VA_ID,
      "new-target",
      TX,
    );
  });

  it("**counts a re-affirmed already-open target as updated, not opened, and does not supersede**", async () => {
    // The partial unique index means this write updated the existing OPEN
    // row rather than inserting a second one — this is the storm-protection
    // path, and it must never look like a fresh signal or trigger supersession.
    vi.mocked(surveillanceTargetRepository.upsertOpenTarget).mockResolvedValue({
      id: "existing-target",
      inserted: false,
    });

    const summary = await requirementChangedIntoVerificationReadiness();

    expect(summary.targetsOpened).toBe(0);
    expect(summary.targetsUpdated).toBe(1);
    expect(surveillanceTargetRepository.supersedeAcknowledged).not.toHaveBeenCalled();
  });

  it("**never records a re-affirmed target as 'acknowledged' in the audit log — nobody acknowledged anything**", async () => {
    // An earlier version of this code reused the acknowledgement audit action
    // for this path, which would have made the audit trail claim a human
    // action that never happened.
    vi.mocked(surveillanceTargetRepository.upsertOpenTarget).mockResolvedValue({
      id: "existing-target",
      inserted: false,
    });

    await requirementChangedIntoVerificationReadiness();

    const actions = vi
      .mocked(auditLogRepository.recordAuditEvent)
      .mock.calls.map(([event]) => (event as { action: string }).action);
    expect(actions).toContain("sentinel.target_updated");
    expect(actions).not.toContain("sentinel.target_acknowledged");
  });

  it("records a supersession audit event only when an acknowledged target was actually superseded", async () => {
    vi.mocked(surveillanceTargetRepository.upsertOpenTarget).mockResolvedValue({
      id: "new-target",
      inserted: true,
    });
    vi.mocked(surveillanceTargetRepository.supersedeAcknowledged).mockResolvedValue(1);

    await requirementChangedIntoVerificationReadiness();

    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "sentinel.target_superseded",
        entityId: "new-target",
        metadata: expect.objectContaining({ supersededCount: 1 }),
      }),
      TX,
    );
  });
});

// --- Reading -----------------------------------------------------------------

describe("reading surveillance state", () => {
  it("lists open targets scoped to the resolved project", async () => {
    vi.mocked(surveillanceTargetRepository.listOpenTargets).mockResolvedValue([target()]);

    const result = await service.listOpenSurveillance(CONTEXT, PROJECT_ID);

    expect(result).toEqual([target()]);
    expect(surveillanceTargetRepository.listOpenTargets).toHaveBeenCalledWith(PROJECT_ID);
  });

  it("restricts history to resolved and superseded statuses", async () => {
    vi.mocked(surveillanceTargetRepository.listTargetsForProject).mockResolvedValue([]);

    await service.listSurveillanceHistory(CONTEXT, PROJECT_ID);

    expect(surveillanceTargetRepository.listTargetsForProject).toHaveBeenCalledWith(PROJECT_ID, {
      status: ["RESOLVED", "SUPERSEDED"],
    });
  });

  it("404s every read for a project outside the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    await expect(service.listOpenSurveillance(CONTEXT, "elsewhere")).rejects.toBeInstanceOf(
      NotFoundError,
    );
    await expect(service.getSurveillanceCounts(CONTEXT, "elsewhere")).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("404s for a target id that does not resolve in this project", async () => {
    vi.mocked(surveillanceTargetRepository.findTargetInProject).mockResolvedValue(null);

    await expect(
      service.getSurveillanceTarget(CONTEXT, PROJECT_ID, "elsewhere"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

// --- Acknowledge --------------------------------------------------------------

describe("acknowledge", () => {
  it("acknowledges an OPEN target, recording the actor and note", async () => {
    vi.mocked(surveillanceTargetRepository.findTargetInProject).mockResolvedValue(
      target({ status: "OPEN" }),
    );
    vi.mocked(surveillanceTargetRepository.acknowledgeTarget).mockResolvedValue(
      target({ status: "ACKNOWLEDGED" }),
    );

    await service.acknowledgeSurveillance(CONTEXT, PROJECT_ID, TARGET_ID, { note: "seen it" });

    expect(surveillanceTargetRepository.acknowledgeTarget).toHaveBeenCalledWith(
      TARGET_ID,
      "OPEN",
      CONTEXT.actorId,
      "seen it",
      TX,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "sentinel.target_acknowledged" }),
      TX,
    );
  });

  it("**refuses to acknowledge a resolved target**", async () => {
    vi.mocked(surveillanceTargetRepository.findTargetInProject).mockResolvedValue(
      target({ status: "RESOLVED" }),
    );

    await expect(
      service.acknowledgeSurveillance(CONTEXT, PROJECT_ID, TARGET_ID, {}),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(surveillanceTargetRepository.acknowledgeTarget).not.toHaveBeenCalled();
  });
});

// --- Resolve -------------------------------------------------------------------

describe("resolve", () => {
  it("**refuses to resolve without a note**", async () => {
    vi.mocked(surveillanceTargetRepository.findTargetInProject).mockResolvedValue(
      target({ status: "OPEN" }),
    );

    await expect(
      service.resolveSurveillance(CONTEXT, PROJECT_ID, TARGET_ID, {}),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(surveillanceTargetRepository.resolveTarget).not.toHaveBeenCalled();
  });

  it("resolves an acknowledged target with a note", async () => {
    vi.mocked(surveillanceTargetRepository.findTargetInProject).mockResolvedValue(
      target({ status: "ACKNOWLEDGED" }),
    );
    vi.mocked(surveillanceTargetRepository.resolveTarget).mockResolvedValue(
      target({ status: "RESOLVED" }),
    );

    await service.resolveSurveillance(CONTEXT, PROJECT_ID, TARGET_ID, { note: "re-ran readiness" });

    expect(surveillanceTargetRepository.resolveTarget).toHaveBeenCalledWith(
      TARGET_ID,
      "ACKNOWLEDGED",
      CONTEXT.actorId,
      "re-ran readiness",
      TX,
    );
  });

  it("refuses to resolve an already-resolved target", async () => {
    vi.mocked(surveillanceTargetRepository.findTargetInProject).mockResolvedValue(
      target({ status: "RESOLVED" }),
    );

    await expect(
      service.resolveSurveillance(CONTEXT, PROJECT_ID, TARGET_ID, { note: "x" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

// --- Reevaluation dispatch ------------------------------------------------------

describe("reevaluation dispatch", () => {
  it("dispatches an IMPACT_ANALYSIS target to the real change-impact engine, then resolves it", async () => {
    vi.mocked(surveillanceTargetRepository.findTargetInProject).mockResolvedValue(
      target({ status: "OPEN", targetType: "IMPACT_ANALYSIS", targetId: CR_ID }),
    );
    vi.mocked(changeImpactAnalysisService.runImpactAnalysis).mockResolvedValue(undefined as never);
    vi.mocked(surveillanceTargetRepository.resolveTarget).mockResolvedValue(
      target({ status: "RESOLVED" }),
    );

    await service.reEvaluateTarget(CONTEXT, PROJECT_ID, TARGET_ID);

    expect(changeImpactAnalysisService.runImpactAnalysis).toHaveBeenCalledWith(
      CONTEXT,
      PROJECT_ID,
      CR_ID,
      {},
    );
    expect(surveillanceTargetRepository.resolveTarget).toHaveBeenCalledWith(
      TARGET_ID,
      "OPEN",
      CONTEXT.actorId,
      expect.stringMatching(/resolved automatically/i),
      TX,
    );
  });

  it("dispatches a VERIFICATION_READINESS target to the real verification-readiness engine", async () => {
    vi.mocked(surveillanceTargetRepository.findTargetInProject).mockResolvedValue(
      target({ status: "OPEN", targetType: "VERIFICATION_READINESS", targetId: VA_ID }),
    );
    vi.mocked(verificationReadinessService.evaluateVerificationReadiness).mockResolvedValue(
      undefined as never,
    );
    vi.mocked(surveillanceTargetRepository.resolveTarget).mockResolvedValue(
      target({ status: "RESOLVED" }),
    );

    await service.reEvaluateTarget(CONTEXT, PROJECT_ID, TARGET_ID);

    expect(verificationReadinessService.evaluateVerificationReadiness).toHaveBeenCalledWith(
      CONTEXT,
      PROJECT_ID,
      VA_ID,
      {},
    );
  });

  it("dispatches a TECHNICAL_READINESS target using its own id as the gate", async () => {
    vi.mocked(surveillanceTargetRepository.findTargetInProject).mockResolvedValue(
      target({ status: "OPEN", targetType: "TECHNICAL_READINESS", targetId: "SYSTEM_DEFINITION" }),
    );
    vi.mocked(technicalReadinessService.evaluateTechnicalReadiness).mockResolvedValue(
      undefined as never,
    );
    vi.mocked(surveillanceTargetRepository.resolveTarget).mockResolvedValue(
      target({ status: "RESOLVED" }),
    );

    await service.reEvaluateTarget(CONTEXT, PROJECT_ID, TARGET_ID);

    expect(technicalReadinessService.evaluateTechnicalReadiness).toHaveBeenCalledWith(
      CONTEXT,
      PROJECT_ID,
      { gate: "SYSTEM_DEFINITION" },
    );
  });

  it("dispatches a DRIFT_ASSESSMENT target to the real drift engine", async () => {
    vi.mocked(surveillanceTargetRepository.findTargetInProject).mockResolvedValue(
      target({ status: "OPEN", targetType: "DRIFT_ASSESSMENT", targetId: BL_ID }),
    );
    vi.mocked(driftDetectionService.evaluateDrift).mockResolvedValue(undefined as never);
    vi.mocked(surveillanceTargetRepository.resolveTarget).mockResolvedValue(
      target({ status: "RESOLVED" }),
    );

    await service.reEvaluateTarget(CONTEXT, PROJECT_ID, TARGET_ID);

    // The real engine's request schema is `{ baselineId }`, not a bare id —
    // passing the bare id would fail the engine's own strict-object parse.
    expect(driftDetectionService.evaluateDrift).toHaveBeenCalledWith(CONTEXT, PROJECT_ID, {
      baselineId: BL_ID,
    });
  });

  it("dispatches a CERTIFICATION_REVIEW target to the real certification-review engine", async () => {
    vi.mocked(surveillanceTargetRepository.findTargetInProject).mockResolvedValue(
      target({ status: "OPEN", targetType: "CERTIFICATION_REVIEW", targetId: PROG_ID }),
    );
    vi.mocked(certificationReviewService.evaluateCertificationReview).mockResolvedValue(
      undefined as never,
    );
    vi.mocked(surveillanceTargetRepository.resolveTarget).mockResolvedValue(
      target({ status: "RESOLVED" }),
    );

    await service.reEvaluateTarget(CONTEXT, PROJECT_ID, TARGET_ID);

    expect(certificationReviewService.evaluateCertificationReview).toHaveBeenCalledWith(
      CONTEXT,
      PROJECT_ID,
      {},
    );
  });

  it("dispatches an ASSUMPTION_MONITORING target, resolving its owning decision first", async () => {
    vi.mocked(surveillanceTargetRepository.findTargetInProject).mockResolvedValue(
      target({ status: "OPEN", targetType: "ASSUMPTION_MONITORING", targetId: ASM_ID }),
    );
    vi.mocked(decisionAssumptionRepository.findAssumptionsByIds).mockResolvedValue(
      new Map([[ASM_ID, { id: ASM_ID, engineeringDecisionId: ED_ID } as never]]),
    );
    vi.mocked(assumptionMonitoringService.evaluateAssumption).mockResolvedValue(undefined as never);
    vi.mocked(surveillanceTargetRepository.resolveTarget).mockResolvedValue(
      target({ status: "RESOLVED" }),
    );

    await service.reEvaluateTarget(CONTEXT, PROJECT_ID, TARGET_ID);

    expect(assumptionMonitoringService.evaluateAssumption).toHaveBeenCalledWith(
      CONTEXT,
      PROJECT_ID,
      ED_ID,
      ASM_ID,
    );
  });

  it("404s an ASSUMPTION_MONITORING dispatch whose assumption no longer exists, and leaves the target open", async () => {
    vi.mocked(surveillanceTargetRepository.findTargetInProject).mockResolvedValue(
      target({ status: "OPEN", targetType: "ASSUMPTION_MONITORING", targetId: ASM_ID }),
    );
    vi.mocked(decisionAssumptionRepository.findAssumptionsByIds).mockResolvedValue(new Map());

    await expect(service.reEvaluateTarget(CONTEXT, PROJECT_ID, TARGET_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
    expect(assumptionMonitoringService.evaluateAssumption).not.toHaveBeenCalled();
    expect(surveillanceTargetRepository.resolveTarget).not.toHaveBeenCalled();
  });

  it("**leaves the target open when the dispatched engine throws**", async () => {
    vi.mocked(surveillanceTargetRepository.findTargetInProject).mockResolvedValue(
      target({ status: "OPEN", targetType: "VERIFICATION_READINESS", targetId: VA_ID }),
    );
    vi.mocked(verificationReadinessService.evaluateVerificationReadiness).mockRejectedValue(
      new Error("engine failed"),
    );

    await expect(service.reEvaluateTarget(CONTEXT, PROJECT_ID, TARGET_ID)).rejects.toThrow(
      "engine failed",
    );
    expect(surveillanceTargetRepository.resolveTarget).not.toHaveBeenCalled();
  });

  it("refuses to reevaluate an already-resolved target, dispatching nothing", async () => {
    vi.mocked(surveillanceTargetRepository.findTargetInProject).mockResolvedValue(
      target({ status: "RESOLVED", targetType: "DRIFT_ASSESSMENT", targetId: BL_ID }),
    );

    await expect(service.reEvaluateTarget(CONTEXT, PROJECT_ID, TARGET_ID)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(driftDetectionService.evaluateDrift).not.toHaveBeenCalled();
  });
});

describe("project role authorization", () => {
  function asRole(role: "MANAGER" | "ENGINEER" | "REVIEWER" | "VIEWER") {
    vi.mocked(membershipRepository.findMembership).mockResolvedValue({
      id: "mem1",
      projectId: PROJECT_ID,
      role,
      createdAt: T0,
      updatedAt: T0,
      user: {
        id: CONTEXT.actorId,
        name: "Ada",
        email: "ada@example.test",
        organizationRole: "MEMBER",
      },
    } as never);
  }

  it("refuses a VIEWER acknowledging a surveillance target", async () => {
    asRole("VIEWER");
    vi.mocked(surveillanceTargetRepository.findTargetInProject).mockResolvedValue(
      target({ status: "OPEN" }),
    );

    await expect(
      service.acknowledgeSurveillance(CONTEXT, PROJECT_ID, TARGET_ID, { note: "seen it" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(surveillanceTargetRepository.acknowledgeTarget).not.toHaveBeenCalled();
  });

  it("allows an ENGINEER to acknowledge a target but refuses them resolving it — acknowledgement is not resolution authority", async () => {
    asRole("ENGINEER");
    vi.mocked(surveillanceTargetRepository.findTargetInProject).mockResolvedValue(
      target({ status: "OPEN" }),
    );
    vi.mocked(surveillanceTargetRepository.acknowledgeTarget).mockResolvedValue(
      target({ status: "ACKNOWLEDGED" }),
    );

    await expect(
      service.acknowledgeSurveillance(CONTEXT, PROJECT_ID, TARGET_ID, { note: "seen it" }),
    ).resolves.toMatchObject({ status: "ACKNOWLEDGED" });

    await expect(
      service.resolveSurveillance(CONTEXT, PROJECT_ID, TARGET_ID, { note: "fixed" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(surveillanceTargetRepository.resolveTarget).not.toHaveBeenCalled();
  });

  it("allows a REVIEWER to resolve a target", async () => {
    asRole("REVIEWER");
    vi.mocked(surveillanceTargetRepository.findTargetInProject).mockResolvedValue(
      target({ status: "ACKNOWLEDGED" }),
    );
    vi.mocked(surveillanceTargetRepository.resolveTarget).mockResolvedValue(
      target({ status: "RESOLVED" }),
    );

    await expect(
      service.resolveSurveillance(CONTEXT, PROJECT_ID, TARGET_ID, { note: "fixed" }),
    ).resolves.toMatchObject({ status: "RESOLVED" });
  });

  it("allows an ENGINEER to trigger a re-evaluation — the automatic resolution it performs is objective-evidence-driven, not an approval judgement", async () => {
    asRole("ENGINEER");
    vi.mocked(surveillanceTargetRepository.findTargetInProject).mockResolvedValue(
      target({ status: "OPEN", targetType: "IMPACT_ANALYSIS", targetId: CR_ID }),
    );
    vi.mocked(surveillanceTargetRepository.resolveTarget).mockResolvedValue(
      target({ status: "RESOLVED" }),
    );

    await expect(service.reEvaluateTarget(CONTEXT, PROJECT_ID, TARGET_ID)).resolves.toMatchObject({
      status: "RESOLVED",
    });
    expect(surveillanceTargetRepository.resolveTarget).toHaveBeenCalled();
  });

  it("refuses a VIEWER running detection", async () => {
    asRole("VIEWER");

    await expect(service.detectProjectChanges(CONTEXT, PROJECT_ID)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
