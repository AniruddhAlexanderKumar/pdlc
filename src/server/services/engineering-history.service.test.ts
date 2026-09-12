// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrganizationContext } from "@/server/context/organization-context";
import { NotFoundError, ValidationError } from "@/server/errors";

/**
 * The Engineering History service, against faked repositories: no database,
 * no Prisma. Every source this service reads is mocked at the module
 * boundary, so this proves exactly the aggregation — ordering, dedup,
 * filtering, pagination, and the strict event-vs-current-state distinction
 * — never a second copy of any engine's own logic.
 */

const CONTEXT: OrganizationContext = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
};
const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaa";

vi.mock("./project-scope", () => ({
  requireProjectInOrganization: vi.fn(),
  requireProjectReadAccess: vi.fn(),
}));
vi.mock("@/server/repositories/audit-log.repository", () => ({
  listAuditEventsForEntity: vi.fn(),
}));
vi.mock("@/server/repositories/engineering-history.repository", async () => {
  const actual = await vi.importActual<typeof import("@/server/repositories/engineering-history.repository")>(
    "@/server/repositories/engineering-history.repository",
  );
  return {
    HISTORY_ARTIFACT_ENTITY_TYPES: actual.HISTORY_ARTIFACT_ENTITY_TYPES,
    listProjectArtifacts: vi.fn(),
    listAuditEventsForProjectArtifacts: vi.fn(),
  };
});
vi.mock("@/server/repositories/drift-assessment.repository", () => ({ listAssessments: vi.fn() }));
vi.mock("@/server/repositories/impact-analysis.repository", () => ({
  listAllForProject: vi.fn(),
  listAnalyses: vi.fn(),
}));
vi.mock("@/server/repositories/technical-readiness.repository", () => ({ listAssessments: vi.fn() }));
vi.mock("@/server/repositories/verification-readiness.repository", () => ({
  listAllForProject: vi.fn(),
  listAssessments: vi.fn(),
}));
vi.mock("@/server/repositories/certification-program.repository", () => ({
  findProgramInProject: vi.fn(),
}));
vi.mock("@/server/repositories/certification-review.repository", () => ({ listReviews: vi.fn() }));
vi.mock("@/server/repositories/sentinel-event.repository", () => ({ listEventsForProject: vi.fn() }));
vi.mock("@/server/repositories/surveillance-target.repository", () => ({ listTargetsForProject: vi.fn() }));
vi.mock("@/server/repositories/assumption-monitoring.repository", () => ({ listProjectAssumptions: vi.fn() }));
vi.mock("./project-command-center.service", () => ({
  sentinelTargetHref: vi.fn(
    (projectId: string, targetType: string) =>
      targetType === "VERIFICATION_READINESS" ? `/projects/${projectId}/verification` : `/projects/${projectId}`,
  ),
}));

const { requireProjectReadAccess } = await import("./project-scope");
const auditLogRepository = await import("@/server/repositories/audit-log.repository");
const historyRepository = await import("@/server/repositories/engineering-history.repository");
const driftRepository = await import("@/server/repositories/drift-assessment.repository");
const impactAnalysisRepository = await import("@/server/repositories/impact-analysis.repository");
const technicalReadinessRepository = await import("@/server/repositories/technical-readiness.repository");
const verificationReadinessRepository = await import("@/server/repositories/verification-readiness.repository");
const certificationProgramRepository = await import("@/server/repositories/certification-program.repository");
const certificationReviewRepository = await import("@/server/repositories/certification-review.repository");
const sentinelEventRepository = await import("@/server/repositories/sentinel-event.repository");
const surveillanceTargetRepository = await import("@/server/repositories/surveillance-target.repository");
const monitoringRepository = await import("@/server/repositories/assumption-monitoring.repository");
const service = await import("./engineering-history.service");

interface ArtifactRef {
  id: string;
  identifier: string | null;
  label: string;
  createdAt: Date;
  parentId?: string;
}

function emptyArtifacts(): Map<string, ArtifactRef[]> {
  return new Map(historyRepository.HISTORY_ARTIFACT_ENTITY_TYPES.map((row) => [row.entityType, [] as ArtifactRef[]]));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireProjectReadAccess).mockResolvedValue(PROJECT_ID);
  vi.mocked(historyRepository.listProjectArtifacts).mockResolvedValue(emptyArtifacts());
  vi.mocked(historyRepository.listAuditEventsForProjectArtifacts).mockResolvedValue([]);
  vi.mocked(auditLogRepository.listAuditEventsForEntity).mockResolvedValue([]);
  vi.mocked(driftRepository.listAssessments).mockResolvedValue([]);
  vi.mocked(impactAnalysisRepository.listAllForProject).mockResolvedValue([]);
  vi.mocked(impactAnalysisRepository.listAnalyses).mockResolvedValue([]);
  vi.mocked(technicalReadinessRepository.listAssessments).mockResolvedValue([]);
  vi.mocked(verificationReadinessRepository.listAllForProject).mockResolvedValue([]);
  vi.mocked(verificationReadinessRepository.listAssessments).mockResolvedValue([]);
  vi.mocked(certificationProgramRepository.findProgramInProject).mockResolvedValue(null);
  vi.mocked(certificationReviewRepository.listReviews).mockResolvedValue([]);
  vi.mocked(sentinelEventRepository.listEventsForProject).mockResolvedValue([]);
  vi.mocked(surveillanceTargetRepository.listTargetsForProject).mockResolvedValue([]);
  vi.mocked(monitoringRepository.listProjectAssumptions).mockResolvedValue([]);
});

describe("project isolation", () => {
  it("404s getProjectHistory for a project outside the caller's organization", async () => {
    vi.mocked(requireProjectReadAccess).mockRejectedValue(new NotFoundError("Project not found."));
    await expect(service.getProjectHistory(CONTEXT, "other-project")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("404s getObjectHistory for a project outside the caller's organization", async () => {
    vi.mocked(requireProjectReadAccess).mockRejectedValue(new NotFoundError("Project not found."));
    await expect(
      service.getObjectHistory(CONTEXT, "other-project", "REQUIREMENT", "r1"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("empty project", () => {
  it("returns an empty, well-formed page rather than an error", async () => {
    const result = await service.getProjectHistory(CONTEXT, PROJECT_ID);
    expect(result.events).toEqual([]);
    expect(result.page).toEqual({ offset: 0, limit: 50, total: 0, hasMore: false });
  });
});

describe("artifact events (AuditLog-backed)", () => {
  function withRequirement() {
    const artifacts = emptyArtifacts();
    artifacts.set("Requirement", [
      { id: "r1", identifier: "REQ-001", label: "Chamber pressure", createdAt: new Date("2026-01-01") },
    ]);
    vi.mocked(historyRepository.listProjectArtifacts).mockResolvedValue(artifacts);
  }

  it("composes a real AuditLog row into a correctly-labeled, correctly-linked event", async () => {
    withRequirement();
    vi.mocked(historyRepository.listAuditEventsForProjectArtifacts).mockResolvedValue([
      {
        id: "aud1",
        entityType: "Requirement",
        entityId: "r1",
        action: "requirement.status_transitioned",
        createdAt: new Date("2026-03-01T00:00:00.000Z"),
        actor: { id: "user1", name: "Ada" },
        metadata: { from: "DRAFT", to: "IN_REVIEW" },
      },
    ]);

    const result = await service.getProjectHistory(CONTEXT, PROJECT_ID);

    expect(result.events).toHaveLength(1);
    const [e] = result.events;
    expect(e!.sourceModule).toBe("REQUIREMENT");
    expect(e!.sourceType).toBe("REQUIREMENT");
    expect(e!.sourceId).toBe("r1");
    expect(e!.sourceIdentifier).toBe("REQ-001");
    expect(e!.category).toBe("LIFECYCLE_TRANSITION");
    expect(e!.label).toBe("Status changed");
    expect(e!.detail).toBe("DRAFT → IN_REVIEW");
    expect(e!.actorId).toBe("user1");
    expect(e!.actorName).toBe("Ada");
    expect(e!.href).toBe(`/projects/${PROJECT_ID}/requirements/r1`);
  });

  it("never invents an actor: a system-initiated row has a null actor, never a guessed name", async () => {
    withRequirement();
    vi.mocked(historyRepository.listAuditEventsForProjectArtifacts).mockResolvedValue([
      {
        id: "aud1",
        entityType: "Requirement",
        entityId: "r1",
        action: "requirement.created",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        actor: null,
        metadata: null,
      },
    ]);

    const result = await service.getProjectHistory(CONTEXT, PROJECT_ID);
    expect(result.events[0]!.actorId).toBeNull();
    expect(result.events[0]!.actorName).toBeNull();
  });

  it("never fabricates a detail string beyond what the metadata itself records", async () => {
    withRequirement();
    vi.mocked(historyRepository.listAuditEventsForProjectArtifacts).mockResolvedValue([
      {
        id: "aud1",
        entityType: "Requirement",
        entityId: "r1",
        action: "requirement.created",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        actor: null,
        metadata: { somethingUnrecognized: "value" },
      },
    ]);

    const result = await service.getProjectHistory(CONTEXT, PROJECT_ID);
    expect(result.events[0]!.detail).toBeNull();
  });

  it("drops a row whose entityId this scan never itself enumerated (defense in depth)", async () => {
    withRequirement();
    vi.mocked(historyRepository.listAuditEventsForProjectArtifacts).mockResolvedValue([
      {
        id: "aud1",
        entityType: "Requirement",
        entityId: "not-in-this-project",
        action: "requirement.created",
        createdAt: new Date(),
        actor: null,
        metadata: null,
      },
    ]);

    const result = await service.getProjectHistory(CONTEXT, PROJECT_ID);
    expect(result.events).toEqual([]);
  });
});

describe("native-table events", () => {
  it("emits a drift-evaluated event naming the real baseline", async () => {
    const artifacts = emptyArtifacts();
    artifacts.set("EngineeringBaseline", [
      { id: "bl1", identifier: "BL-001", label: "Design baseline", createdAt: new Date() },
    ]);
    vi.mocked(historyRepository.listProjectArtifacts).mockResolvedValue(artifacts);
    vi.mocked(driftRepository.listAssessments).mockResolvedValue([
      { id: "drf1", baselineId: "bl1", status: "DRIFT_DETECTED", evaluatedAt: new Date("2026-04-01"), evaluatedById: "user1" },
    ] as never);

    const result = await service.getProjectHistory(CONTEXT, PROJECT_ID);
    const driftEvent = result.events.find((e) => e.sourceModule === "DRIFT");
    expect(driftEvent).toBeDefined();
    expect(driftEvent!.sourceIdentifier).toBe("BL-001");
    expect(driftEvent!.detail).toBe("DRIFT_DETECTED");
    expect(driftEvent!.category).toBe("ASSESSMENT");
  });

  it("emits both a started and a completed event for one impact analysis", async () => {
    const artifacts = emptyArtifacts();
    artifacts.set("ChangeRequest", [
      { id: "cr1", identifier: "CR-001", label: "Revise mounting", createdAt: new Date() },
    ]);
    vi.mocked(historyRepository.listProjectArtifacts).mockResolvedValue(artifacts);
    vi.mocked(impactAnalysisRepository.listAllForProject).mockResolvedValue([
      {
        id: "ia1",
        changeRequestId: "cr1",
        status: "COMPLETED",
        startedAt: new Date("2026-05-01T00:00:00.000Z"),
        completedAt: new Date("2026-05-01T00:05:00.000Z"),
      },
    ] as never);

    const result = await service.getProjectHistory(CONTEXT, PROJECT_ID);
    const impactEvents = result.events.filter((e) => e.sourceModule === "CHANGE_MANAGEMENT" && e.sourceType === "IMPACT_ANALYSIS");
    expect(impactEvents).toHaveLength(2);
    expect(impactEvents.map((e) => e.action).sort()).toEqual(["impact_analysis.evaluated", "impact_analysis.ran"]);
  });

  it("does not emit a completed event for an impact analysis still running", async () => {
    vi.mocked(impactAnalysisRepository.listAllForProject).mockResolvedValue([
      { id: "ia1", changeRequestId: "cr1", status: "RUNNING", startedAt: new Date(), completedAt: null },
    ] as never);

    const result = await service.getProjectHistory(CONTEXT, PROJECT_ID);
    const impactEvents = result.events.filter((e) => e.sourceType === "IMPACT_ANALYSIS");
    expect(impactEvents).toHaveLength(1);
    expect(impactEvents[0]!.action).toBe("impact_analysis.ran");
  });

  it("reads no certification review at all when no program exists", async () => {
    vi.mocked(certificationProgramRepository.findProgramInProject).mockResolvedValue(null);
    await service.getProjectHistory(CONTEXT, PROJECT_ID);
    expect(certificationReviewRepository.listReviews).not.toHaveBeenCalled();
  });

  it("emits a certification-review-evaluated event once a program exists", async () => {
    vi.mocked(certificationProgramRepository.findProgramInProject).mockResolvedValue({ id: "prog1" } as never);
    vi.mocked(certificationReviewRepository.listReviews).mockResolvedValue([
      { id: "rev1", status: "READY", evaluatedAt: new Date("2026-06-01"), evaluatedById: "user1" },
    ] as never);

    const result = await service.getProjectHistory(CONTEXT, PROJECT_ID);
    const reviewEvent = result.events.find((e) => e.sourceType === "CERTIFICATION_REVIEW");
    expect(reviewEvent).toBeDefined();
    expect(reviewEvent!.detail).toBe("READY");
  });

  it("emits DETECTED, ACKNOWLEDGED and RESOLVED as three distinct events from one surveillance target", async () => {
    vi.mocked(surveillanceTargetRepository.listTargetsForProject).mockResolvedValue([
      {
        id: "tgt1",
        targetType: "VERIFICATION_READINESS",
        targetId: "va1",
        targetIdentifier: "VA-001",
        targetLabel: "Hot fire test",
        reason: "The requirement changed.",
        detectedAt: new Date("2026-01-01"),
        acknowledgedAt: new Date("2026-01-02"),
        acknowledgedById: "user1",
        resolvedAt: new Date("2026-01-03"),
        resolvedById: "user1",
      },
    ] as never);

    const result = await service.getProjectHistory(CONTEXT, PROJECT_ID);
    const targetEvents = result.events.filter((e) => e.sourceType === "SURVEILLANCE_TARGET");
    expect(targetEvents).toHaveLength(3);
    expect(targetEvents.map((e) => e.action).sort()).toEqual([
      "sentinel.target_acknowledged",
      "sentinel.target_detected",
      "sentinel.target_resolved",
    ]);
    expect(targetEvents.every((e) => e.sourceModule === "SENTINEL")).toBe(true);
    expect(targetEvents.every((e) => e.href === `/projects/${PROJECT_ID}/verification`)).toBe(true);
  });

  it("emits only a DETECTED event for a target never acknowledged or resolved", async () => {
    vi.mocked(surveillanceTargetRepository.listTargetsForProject).mockResolvedValue([
      {
        id: "tgt1",
        targetType: "TECHNICAL_READINESS",
        targetId: "RELEASE_READY",
        targetIdentifier: null,
        targetLabel: "RELEASE READY",
        reason: "The requirement changed.",
        detectedAt: new Date("2026-01-01"),
        acknowledgedAt: null,
        acknowledgedById: null,
        resolvedAt: null,
        resolvedById: null,
      },
    ] as never);

    const result = await service.getProjectHistory(CONTEXT, PROJECT_ID);
    const targetEvents = result.events.filter((e) => e.sourceType === "SURVEILLANCE_TARGET");
    expect(targetEvents).toHaveLength(1);
    expect(targetEvents[0]!.action).toBe("sentinel.target_detected");
  });

  it("labels a Sentinel change-detection event distinctly from a target event", async () => {
    vi.mocked(sentinelEventRepository.listEventsForProject).mockResolvedValue([
      {
        id: "evt1",
        sourceType: "REQUIREMENT",
        sourceId: "r1",
        sourceIdentifier: "REQ-001",
        sourceLabel: "Chamber pressure",
        detectedAt: new Date("2026-01-01"),
        actorId: "user1",
      },
    ] as never);

    const result = await service.getProjectHistory(CONTEXT, PROJECT_ID);
    const detectionEvent = result.events.find((e) => e.sourceType === "SENTINEL_EVENT");
    expect(detectionEvent).toBeDefined();
    expect(detectionEvent!.sourceModule).toBe("SENTINEL");
    expect(detectionEvent!.actorId).toBe("user1");
  });
});

describe("ordering, dedup and filtering", () => {
  it("orders every merged event newest first, across every source type", async () => {
    const artifacts = emptyArtifacts();
    artifacts.set("Requirement", [{ id: "r1", identifier: "REQ-001", label: "X", createdAt: new Date("2026-01-01") }]);
    vi.mocked(historyRepository.listProjectArtifacts).mockResolvedValue(artifacts);
    vi.mocked(historyRepository.listAuditEventsForProjectArtifacts).mockResolvedValue([
      { id: "aud1", entityType: "Requirement", entityId: "r1", action: "requirement.created", createdAt: new Date("2026-01-01"), actor: null, metadata: null },
    ]);
    vi.mocked(sentinelEventRepository.listEventsForProject).mockResolvedValue([
      { id: "evt1", sourceType: "REQUIREMENT", sourceId: "r1", sourceIdentifier: "REQ-001", sourceLabel: "X", detectedAt: new Date("2026-06-01"), actorId: null },
    ] as never);

    const result = await service.getProjectHistory(CONTEXT, PROJECT_ID);
    expect(result.events[0]!.sourceType).toBe("SENTINEL_EVENT");
    expect(result.events[1]!.action).toBe("requirement.created");
  });

  it("filters by module", async () => {
    const artifacts = emptyArtifacts();
    artifacts.set("Requirement", [{ id: "r1", identifier: "REQ-001", label: "X", createdAt: new Date() }]);
    vi.mocked(historyRepository.listProjectArtifacts).mockResolvedValue(artifacts);
    vi.mocked(historyRepository.listAuditEventsForProjectArtifacts).mockResolvedValue([
      { id: "aud1", entityType: "Requirement", entityId: "r1", action: "requirement.created", createdAt: new Date(), actor: null, metadata: null },
    ]);
    vi.mocked(sentinelEventRepository.listEventsForProject).mockResolvedValue([
      { id: "evt1", sourceType: "REQUIREMENT", sourceId: "r1", sourceIdentifier: "REQ-001", sourceLabel: "X", detectedAt: new Date(), actorId: null },
    ] as never);

    const filtered = await service.getProjectHistory(CONTEXT, PROJECT_ID, { module: "SENTINEL" });
    expect(filtered.events).toHaveLength(1);
    expect(filtered.events[0]!.sourceModule).toBe("SENTINEL");
  });

  it("filters by actorId", async () => {
    const artifacts = emptyArtifacts();
    artifacts.set("Requirement", [{ id: "r1", identifier: "REQ-001", label: "X", createdAt: new Date() }]);
    vi.mocked(historyRepository.listProjectArtifacts).mockResolvedValue(artifacts);
    vi.mocked(historyRepository.listAuditEventsForProjectArtifacts).mockResolvedValue([
      { id: "aud1", entityType: "Requirement", entityId: "r1", action: "requirement.created", createdAt: new Date(), actor: { id: "user1", name: "Ada" }, metadata: null },
      { id: "aud2", entityType: "Requirement", entityId: "r1", action: "requirement.updated", createdAt: new Date(), actor: { id: "user2", name: "Bea" }, metadata: null },
    ]);

    const filtered = await service.getProjectHistory(CONTEXT, PROJECT_ID, { actorId: "user2" });
    expect(filtered.events).toHaveLength(1);
    expect(filtered.events[0]!.actorId).toBe("user2");
  });

  it("filters by an inclusive date range", async () => {
    const artifacts = emptyArtifacts();
    artifacts.set("Requirement", [{ id: "r1", identifier: "REQ-001", label: "X", createdAt: new Date() }]);
    vi.mocked(historyRepository.listProjectArtifacts).mockResolvedValue(artifacts);
    vi.mocked(historyRepository.listAuditEventsForProjectArtifacts).mockResolvedValue([
      { id: "aud1", entityType: "Requirement", entityId: "r1", action: "requirement.created", createdAt: new Date("2026-01-01"), actor: null, metadata: null },
      { id: "aud2", entityType: "Requirement", entityId: "r1", action: "requirement.updated", createdAt: new Date("2026-06-01"), actor: null, metadata: null },
    ]);

    const filtered = await service.getProjectHistory(CONTEXT, PROJECT_ID, {
      from: "2026-03-01T00:00:00.000Z",
    });
    expect(filtered.events).toHaveLength(1);
    expect(filtered.events[0]!.action).toBe("requirement.updated");
  });

  it("paginates with a caller-supplied offset and limit", async () => {
    const artifacts = emptyArtifacts();
    artifacts.set(
      "Requirement",
      Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, identifier: `REQ-00${i}`, label: "X", createdAt: new Date() })),
    );
    vi.mocked(historyRepository.listProjectArtifacts).mockResolvedValue(artifacts);
    vi.mocked(historyRepository.listAuditEventsForProjectArtifacts).mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => ({
        id: `aud${i}`,
        entityType: "Requirement",
        entityId: `r${i}`,
        action: "requirement.created",
        createdAt: new Date(2026, 0, i + 1),
        actor: null,
        metadata: null,
      })),
    );

    const result = await service.getProjectHistory(CONTEXT, PROJECT_ID, {}, { offset: 2, limit: 2 });
    expect(result.events).toHaveLength(2);
    expect(result.page).toEqual({ offset: 2, limit: 2, total: 5, hasMore: true });
  });
});

describe("getObjectHistory", () => {
  it("rejects an unsupported object type as a controlled validation error", async () => {
    await expect(
      service.getObjectHistory(CONTEXT, PROJECT_ID, "DRIFT_ASSESSMENT", "drf1"),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("404s an object id this project's own scan never enumerated", async () => {
    await expect(
      service.getObjectHistory(CONTEXT, PROJECT_ID, "REQUIREMENT", "not-real"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns the object's own identity and its real audit trail", async () => {
    const artifacts = emptyArtifacts();
    artifacts.set("Requirement", [{ id: "r1", identifier: "REQ-001", label: "Chamber pressure", createdAt: new Date() }]);
    vi.mocked(historyRepository.listProjectArtifacts).mockResolvedValue(artifacts);
    vi.mocked(auditLogRepository.listAuditEventsForEntity).mockResolvedValue([
      { id: "aud1", action: "requirement.created", createdAt: new Date("2026-01-01"), actor: null, metadata: null },
    ]);

    const result = await service.getObjectHistory(CONTEXT, PROJECT_ID, "REQUIREMENT", "r1");
    expect(result.object).toEqual({
      type: "REQUIREMENT",
      id: "r1",
      identifier: "REQ-001",
      label: "Chamber pressure",
      href: `/projects/${PROJECT_ID}/requirements/r1`,
    });
    expect(result.events).toHaveLength(1);
  });

  it("merges in the real impact analyses for a change request", async () => {
    const artifacts = emptyArtifacts();
    artifacts.set("ChangeRequest", [{ id: "cr1", identifier: "CR-001", label: "Revise mounting", createdAt: new Date() }]);
    vi.mocked(historyRepository.listProjectArtifacts).mockResolvedValue(artifacts);
    vi.mocked(impactAnalysisRepository.listAnalyses).mockResolvedValue([
      { id: "ia1", changeRequestId: "cr1", status: "COMPLETED", startedAt: new Date("2026-01-01"), completedAt: new Date("2026-01-02") },
    ] as never);

    const result = await service.getObjectHistory(CONTEXT, PROJECT_ID, "CHANGE_REQUEST", "cr1");
    expect(impactAnalysisRepository.listAnalyses).toHaveBeenCalledWith(PROJECT_ID, "cr1");
    expect(result.events.some((e) => e.sourceType === "IMPACT_ANALYSIS")).toBe(true);
  });

  it("merges in the real drift assessments for a baseline", async () => {
    const artifacts = emptyArtifacts();
    artifacts.set("EngineeringBaseline", [{ id: "bl1", identifier: "BL-001", label: "Design baseline", createdAt: new Date() }]);
    vi.mocked(historyRepository.listProjectArtifacts).mockResolvedValue(artifacts);
    vi.mocked(driftRepository.listAssessments).mockResolvedValue([
      { id: "drf1", baselineId: "bl1", status: "NO_DRIFT", evaluatedAt: new Date("2026-01-01"), evaluatedById: null },
    ] as never);

    const result = await service.getObjectHistory(CONTEXT, PROJECT_ID, "ENGINEERING_BASELINE", "bl1");
    expect(driftRepository.listAssessments).toHaveBeenCalledWith(PROJECT_ID, "bl1");
    expect(result.events.some((e) => e.sourceType === "DRIFT_ASSESSMENT")).toBe(true);
  });

  it("merges in the real verification readiness assessments for an activity", async () => {
    const artifacts = emptyArtifacts();
    artifacts.set("VerificationActivity", [{ id: "va1", identifier: "VA-001", label: "Hot fire test", createdAt: new Date() }]);
    vi.mocked(historyRepository.listProjectArtifacts).mockResolvedValue(artifacts);
    vi.mocked(verificationReadinessRepository.listAssessments).mockResolvedValue([
      { id: "vr1", verificationActivityId: "va1", status: "READY", evaluatedAt: new Date("2026-01-01"), evaluatedById: null },
    ] as never);

    const result = await service.getObjectHistory(CONTEXT, PROJECT_ID, "VERIFICATION_ACTIVITY", "va1");
    expect(verificationReadinessRepository.listAssessments).toHaveBeenCalledWith(PROJECT_ID, "va1");
    expect(result.events.some((e) => e.sourceType === "VERIFICATION_ACTIVITY" && e.action.startsWith("verification_readiness"))).toBe(true);
  });
});

describe("negative assertions: no invented judgement", () => {
  it("never contains a score, probability, heatmap, percentage or AI-generated-explanation field anywhere", async () => {
    const artifacts = emptyArtifacts();
    artifacts.set("Requirement", [{ id: "r1", identifier: "REQ-001", label: "X", createdAt: new Date() }]);
    vi.mocked(historyRepository.listProjectArtifacts).mockResolvedValue(artifacts);
    vi.mocked(historyRepository.listAuditEventsForProjectArtifacts).mockResolvedValue([
      { id: "aud1", entityType: "Requirement", entityId: "r1", action: "requirement.created", createdAt: new Date(), actor: null, metadata: null },
    ]);

    const result = await service.getProjectHistory(CONTEXT, PROJECT_ID);
    expect(JSON.stringify(result)).not.toMatch(
      /score|percent|confidence|probability|heatmap|summary generated|ai[_-]?generated/i,
    );
  });
});
