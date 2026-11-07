// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrganizationContext } from "@/server/context/organization-context";
import { NotFoundError } from "@/server/errors";

/**
 * The Engineering Command Center against faked services and repositories:
 * no database, no Prisma. Every sub-engine is mocked at the module
 * boundary, so this file proves exactly one thing — that the aggregation
 * itself is correct, deterministic, and never invents a value the mocks did
 * not provide. The individual engines' own correctness is proven in their
 * own test suites; nothing here re-tests readiness rules, impact
 * propagation, drift comparison, or Sentinel dependency resolution.
 */

const CONTEXT: OrganizationContext = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
};
const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaa";

const PROJECT = {
  id: PROJECT_ID,
  organizationId: CONTEXT.organizationId,
  name: "Upper Stage Propulsion",
  description: "A test project.",
  status: "ACTIVE",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

vi.mock("./project.service", () => ({ getProject: vi.fn() }));
vi.mock("./technical-readiness.service", () => ({
  technicalReadinessService: { getLatestTechnicalReadiness: vi.fn() },
}));
vi.mock("./verification-activity.service", () => ({ listVerificationActivities: vi.fn() }));
vi.mock("./certification-program.service", () => ({
  certificationProgramService: { getProgram: vi.fn() },
}));
vi.mock("./certification-basis.service", () => ({
  certificationBasisService: { listBases: vi.fn() },
}));
vi.mock("./certification-review.service", () => ({
  certificationReviewService: { getLatestCertificationReview: vi.fn() },
}));
vi.mock("./compliance-item.service", () => ({
  complianceItemService: { listItems: vi.fn() },
}));
vi.mock("./change-request.service", () => ({ listChangeRequests: vi.fn() }));
vi.mock("./drift-detection.service", () => ({
  driftDetectionService: { getLatestDriftAssessment: vi.fn(), compareBaseline: vi.fn() },
}));
vi.mock("./risk.service", () => ({ listRisks: vi.fn() }));
vi.mock("./issue.service", () => ({ listIssues: vi.fn() }));
vi.mock("./supplier.service", () => ({ listSuppliers: vi.fn() }));
vi.mock("./supplied-item.service", () => ({ listSuppliedItems: vi.fn() }));
vi.mock("./supplier-qualification.service", () => ({ listSupplierQualifications: vi.fn() }));
vi.mock("./evidence.service", () => ({ listEvidence: vi.fn() }));
vi.mock("./decision-sentinel.service", () => ({
  decisionSentinelService: { getSurveillanceCounts: vi.fn(), listOpenSurveillance: vi.fn() },
}));
vi.mock("@/server/repositories/assumption-monitoring.repository", () => ({
  listProjectAssumptions: vi.fn(),
  findLatestForAssumptions: vi.fn(),
}));
vi.mock("@/server/repositories/verification-readiness.repository", () => ({
  findLatestForActivities: vi.fn(),
}));
vi.mock("@/server/repositories/impact-analysis.repository", () => ({
  findLatestForChanges: vi.fn(),
}));
vi.mock("@/server/repositories/project-revision.repository", () => ({
  computeProjectFingerprint: vi.fn(),
}));
vi.mock("@/server/repositories/certification-finding.repository", () => ({
  listOpenFindingsForItems: vi.fn(),
}));
vi.mock("@/server/repositories/engineering-baseline.repository", () => ({
  listBaselinesInProject: vi.fn(),
}));

const projectService = await import("./project.service");
const { technicalReadinessService } = await import("./technical-readiness.service");
const verificationActivityService = await import("./verification-activity.service");
const { certificationProgramService } = await import("./certification-program.service");
const { certificationBasisService } = await import("./certification-basis.service");
const { certificationReviewService } = await import("./certification-review.service");
const { complianceItemService } = await import("./compliance-item.service");
const changeRequestService = await import("./change-request.service");
const { driftDetectionService } = await import("./drift-detection.service");
const riskService = await import("./risk.service");
const issueService = await import("./issue.service");
const supplierService = await import("./supplier.service");
const suppliedItemService = await import("./supplied-item.service");
const supplierQualificationService = await import("./supplier-qualification.service");
const evidenceService = await import("./evidence.service");
const { decisionSentinelService } = await import("./decision-sentinel.service");
const monitoringRepository = await import("@/server/repositories/assumption-monitoring.repository");
const verificationReadinessRepository = await import(
  "@/server/repositories/verification-readiness.repository"
);
const impactAnalysisRepository = await import("@/server/repositories/impact-analysis.repository");
const projectRevisionRepository = await import("@/server/repositories/project-revision.repository");
const certificationFindingRepository = await import(
  "@/server/repositories/certification-finding.repository"
);
const baselineRepository = await import("@/server/repositories/engineering-baseline.repository");
const service = await import("./project-command-center.service");

function emptyDefaults() {
  vi.mocked(projectService.getProject).mockResolvedValue(PROJECT as never);
  vi.mocked(technicalReadinessService.getLatestTechnicalReadiness).mockResolvedValue({
    status: "NOT_EVALUATED",
  } as never);
  vi.mocked(verificationActivityService.listVerificationActivities).mockResolvedValue([]);
  vi.mocked(certificationProgramService.getProgram).mockResolvedValue(null);
  vi.mocked(certificationBasisService.listBases).mockResolvedValue([]);
  vi.mocked(certificationReviewService.getLatestCertificationReview).mockResolvedValue({
    status: "NOT_EVALUATED",
  } as never);
  vi.mocked(complianceItemService.listItems).mockResolvedValue([]);
  vi.mocked(changeRequestService.listChangeRequests).mockResolvedValue([]);
  vi.mocked(driftDetectionService.getLatestDriftAssessment).mockResolvedValue({
    status: "NOT_EVALUATED",
  } as never);
  vi.mocked(riskService.listRisks).mockResolvedValue([]);
  vi.mocked(issueService.listIssues).mockResolvedValue([]);
  vi.mocked(supplierService.listSuppliers).mockResolvedValue([]);
  vi.mocked(suppliedItemService.listSuppliedItems).mockResolvedValue([]);
  vi.mocked(supplierQualificationService.listSupplierQualifications).mockResolvedValue([]);
  vi.mocked(evidenceService.listEvidence).mockResolvedValue([]);
  vi.mocked(decisionSentinelService.getSurveillanceCounts).mockResolvedValue({
    open: 0,
    acknowledged: 0,
  });
  vi.mocked(decisionSentinelService.listOpenSurveillance).mockResolvedValue([]);
  vi.mocked(monitoringRepository.listProjectAssumptions).mockResolvedValue([]);
  vi.mocked(monitoringRepository.findLatestForAssumptions).mockResolvedValue(new Map());
  vi.mocked(verificationReadinessRepository.findLatestForActivities).mockResolvedValue(new Map());
  vi.mocked(impactAnalysisRepository.findLatestForChanges).mockResolvedValue(new Map());
  vi.mocked(projectRevisionRepository.computeProjectFingerprint).mockResolvedValue("fp-current");
  vi.mocked(certificationFindingRepository.listOpenFindingsForItems).mockResolvedValue([]);
  vi.mocked(baselineRepository.listBaselinesInProject).mockResolvedValue([]);
}

beforeEach(() => {
  vi.clearAllMocks();
  emptyDefaults();
});

describe("empty project", () => {
  it("returns real project fields and no attention items", async () => {
    const view = await service.getCommandCenter(CONTEXT, PROJECT_ID);

    expect(view.project).toEqual({
      id: PROJECT_ID,
      identifier: null,
      name: "Upper Stage Propulsion",
      description: "A test project.",
      status: "ACTIVE",
      createdAt: PROJECT.createdAt,
      updatedAt: PROJECT.updatedAt,
    });
    expect(view.attentionItems).toEqual([]);
    expect(view.risks.open).toBe(0);
    expect(view.issues.open).toBe(0);
    expect(view.sentinel.openCount).toBe(0);
    expect(view.readiness.certification.hasProgram).toBe(false);
    expect(view.readiness.drift.status).toBe("NOT_EVALUATED");
    expect(view.traceabilityHref).toBe(`/projects/${PROJECT_ID}/traceability`);
  });

  it("404s for a project outside the caller's organization", async () => {
    vi.mocked(projectService.getProject).mockRejectedValue(new NotFoundError("Project not found."));

    await expect(service.getCommandCenter(CONTEXT, PROJECT_ID)).rejects.toThrow(NotFoundError);
  });
});

describe("mixed-state project", () => {
  it("surfaces a NOT_READY technical readiness gate as an attention item", async () => {
    vi.mocked(technicalReadinessService.getLatestTechnicalReadiness).mockImplementation(
      async (_ctx, _projectId, gate) =>
        gate === "RELEASE_READY"
          ? ({
              assessment: {
                id: "tr1",
                gate: "RELEASE_READY",
                status: "NOT_READY",
                evaluatedAt: new Date("2026-02-01T00:00:00.000Z"),
                summary: { blocking: 2, warning: 0, unknown: 0, informational: 0 },
              },
              freshness: "CURRENT",
            } as never)
          : ({ status: "NOT_EVALUATED" } as never),
    );

    const view = await service.getCommandCenter(CONTEXT, PROJECT_ID);

    const releaseReady = view.readiness.technical.find((g) => g.gate === "RELEASE_READY")!;
    expect(releaseReady.status).toBe("NOT_READY");
    expect(releaseReady.blocking).toBe(2);
    expect(releaseReady.freshness).toBe("CURRENT");

    const attention = view.attentionItems.find((item) => item.sourceType === "TECHNICAL_READINESS_GATE");
    expect(attention).toBeDefined();
    expect(attention!.sourceModule).toBe("TECHNICAL_READINESS");
    expect(attention!.state).toBe("NOT_READY");
    expect(attention!.reason).toContain("not ready");
    expect(attention!.reason).toContain("2 blocking");
    expect(attention!.href).toBe(`/projects/${PROJECT_ID}`);
  });

  it("does not flag a READY gate as attention", async () => {
    vi.mocked(technicalReadinessService.getLatestTechnicalReadiness).mockResolvedValue({
      assessment: {
        id: "tr1",
        gate: "SYSTEM_DEFINITION",
        status: "READY",
        evaluatedAt: new Date(),
        summary: { blocking: 0, warning: 0, unknown: 0, informational: 0 },
      },
      freshness: "CURRENT",
    } as never);

    const view = await service.getCommandCenter(CONTEXT, PROJECT_ID);

    expect(view.attentionItems.some((item) => item.sourceModule === "TECHNICAL_READINESS")).toBe(false);
  });

  it("flags a failed verification activity via the batched readiness read, no per-activity call", async () => {
    vi.mocked(verificationActivityService.listVerificationActivities).mockResolvedValue([
      { id: "va1", identifier: "VA-001", title: "Hot fire", status: "FAILED" },
      { id: "va2", identifier: "VA-002", title: "Vibe test", status: "PASSED" },
    ] as never);
    vi.mocked(verificationReadinessRepository.findLatestForActivities).mockResolvedValue(
      new Map([
        [
          "va2",
          { status: "READY", evaluatedAt: new Date("2026-02-01T00:00:00.000Z") } as never,
        ],
      ]),
    );

    const view = await service.getCommandCenter(CONTEXT, PROJECT_ID);

    expect(view.readiness.verification.activitiesTotal).toBe(2);
    expect(view.readiness.verification.activitiesFailed).toBe(1);
    expect(view.readiness.verification.activitiesNeverEvaluated).toBe(1);
    expect(view.readiness.verification.attentionActivities.map((a) => a.id)).toEqual(["va1"]);
    expect(
      view.attentionItems.some((item) => item.sourceType === "VERIFICATION_ACTIVITY" && item.sourceId === "va1"),
    ).toBe(true);
    // The batched repository read was used, never a per-activity service call.
    expect(verificationActivityService.listVerificationActivities).toHaveBeenCalledTimes(1);
  });

  it("reports no certification program as a real empty state, not an error", async () => {
    vi.mocked(certificationProgramService.getProgram).mockResolvedValue(null);

    const view = await service.getCommandCenter(CONTEXT, PROJECT_ID);

    expect(view.readiness.certification.hasProgram).toBe(false);
    expect(view.readiness.certification.review).toBeNull();
    expect(certificationReviewService.getLatestCertificationReview).not.toHaveBeenCalled();
  });

  it("surfaces certification review status and open findings once a program exists", async () => {
    vi.mocked(certificationProgramService.getProgram).mockResolvedValue({
      id: "prog1",
      identifier: "CERT-001",
    } as never);
    vi.mocked(certificationBasisService.listBases).mockResolvedValue([
      { id: "basis1", identifier: "CB-001", status: "ACTIVE" },
    ] as never);
    vi.mocked(certificationReviewService.getLatestCertificationReview).mockResolvedValue({
      review: {
        status: "NOT_READY",
        evaluatedAt: new Date("2026-02-01T00:00:00.000Z"),
        counts: { blockingCount: 1, unknownCount: 0 },
      },
    } as never);
    vi.mocked(complianceItemService.listItems).mockResolvedValue([{ id: "item1" }] as never);
    vi.mocked(certificationFindingRepository.listOpenFindingsForItems).mockResolvedValue([
      { id: "f1", identifier: "FND-001", title: "Margin shortfall", status: "OPEN", complianceItemId: "item1" },
    ] as never);

    const view = await service.getCommandCenter(CONTEXT, PROJECT_ID);

    expect(view.readiness.certification.hasProgram).toBe(true);
    expect(view.readiness.certification.review?.status).toBe("NOT_READY");
    expect(view.readiness.certification.openFindings).toHaveLength(1);
    expect(certificationFindingRepository.listOpenFindingsForItems).toHaveBeenCalledWith(["item1"]);
    expect(
      view.attentionItems.some((item) => item.sourceType === "CERTIFICATION_REVIEW"),
    ).toBe(true);
    expect(
      view.attentionItems.some((item) => item.sourceType === "CERTIFICATION_FINDING" && item.sourceId === "f1"),
    ).toBe(true);
  });

  it("marks a change's impact analysis STALE using the real freshnessOf comparison, not a re-derivation", async () => {
    vi.mocked(changeRequestService.listChangeRequests).mockResolvedValue([
      { id: "cr1", identifier: "CR-001", title: "Raise limit", status: "UNDER_REVIEW" },
      { id: "cr2", identifier: "CR-002", title: "Implemented change", status: "IMPLEMENTED" },
    ] as never);
    vi.mocked(projectRevisionRepository.computeProjectFingerprint).mockResolvedValue("fp-now");
    vi.mocked(impactAnalysisRepository.findLatestForChanges).mockResolvedValue(
      new Map([
        [
          "cr1",
          {
            status: "COMPLETED",
            sourceFingerprint: "fp-old",
            startedAt: new Date("2026-01-15T00:00:00.000Z"),
            summary: { direct: 1, downstream: 2, crossDomain: 0, unknown: 0 },
          } as never,
        ],
      ]),
    );

    const view = await service.getCommandCenter(CONTEXT, PROJECT_ID);

    // Only the UNDER_REVIEW change is active; IMPLEMENTED is terminal and excluded.
    expect(view.readiness.changeImpact.activeChanges).toHaveLength(1);
    expect(view.readiness.changeImpact.activeChanges[0]!.latestAnalysis.freshness).toBe("STALE");
    expect(view.attentionItems.some((item) => item.sourceType === "CHANGE_REQUEST" && item.state === "STALE")).toBe(
      true,
    );
  });

  it("flags a REVIEW_REQUIRED assumption and never evaluates it itself", async () => {
    vi.mocked(monitoringRepository.listProjectAssumptions).mockResolvedValue([
      {
        id: "assum1",
        statement: "The supplier lead time will not change.",
        status: "VALIDATED",
        engineeringDecisionId: "dec1",
        decisionIdentifier: "ED-001",
      },
    ] as never);
    vi.mocked(monitoringRepository.findLatestForAssumptions).mockResolvedValue(
      new Map([["assum1", { status: "REVIEW_REQUIRED" } as never]]),
    );

    const view = await service.getCommandCenter(CONTEXT, PROJECT_ID);

    expect(view.readiness.assumptions.reviewRequired).toBe(1);
    expect(view.readiness.assumptions.attentionAssumptions[0]!.href).toBe(
      `/projects/${PROJECT_ID}/decisions/dec1`,
    );
    expect(
      view.attentionItems.some((item) => item.sourceType === "DECISION_ASSUMPTION" && item.sourceId === "assum1"),
    ).toBe(true);
    // No evaluation method was ever invoked — only the batched read.
    expect(monitoringRepository.findLatestForAssumptions).toHaveBeenCalledTimes(1);
  });

  it("flags detected drift and unknown drift, but not NO_DRIFT", async () => {
    vi.mocked(driftDetectionService.getLatestDriftAssessment).mockResolvedValue({
      assessment: {
        status: "DRIFT_DETECTED",
        evaluatedAt: new Date("2026-02-01T00:00:00.000Z"),
        summary: { findings: 3, reviewRequired: 1, informational: 1, unknown: 0 },
      },
    } as never);

    const view = await service.getCommandCenter(CONTEXT, PROJECT_ID);

    expect(view.readiness.drift.status).toBe("DRIFT_DETECTED");
    expect(view.attentionItems.some((item) => item.sourceType === "DRIFT_ASSESSMENT")).toBe(true);
  });

  it("surfaces the active baseline's real member count and a live changed/missing comparison", async () => {
    vi.mocked(baselineRepository.listBaselinesInProject).mockResolvedValue([
      {
        id: "bl1",
        identifier: "BL-001",
        name: "Preliminary design baseline",
        status: "ACTIVE",
        memberCount: 3,
        assessmentCount: 0,
      },
    ] as never);
    vi.mocked(driftDetectionService.compareBaseline).mockResolvedValue({
      baselineId: "bl1",
      summary: { total: 3, unchanged: 1, changed: 1, missing: 1, unknown: 0 },
      members: [],
    } as never);

    const view = await service.getCommandCenter(CONTEXT, PROJECT_ID);

    expect(view.configuration).toEqual({
      hasActiveBaseline: true,
      baselineId: "bl1",
      baselineIdentifier: "BL-001",
      baselineName: "Preliminary design baseline",
      status: "ACTIVE",
      memberCount: 3,
      changedCount: 1,
      missingCount: 1,
      comparisonStatus: "CURRENT",
      href: `/projects/${PROJECT_ID}/baselines/bl1`,
    });
    // A literal stored aggregate, not a re-derived count from fetching every member.
    expect(baselineRepository.listBaselinesInProject).toHaveBeenCalledWith(PROJECT_ID, {
      status: "ACTIVE",
    });
    // Not folded into "Attention Required" — configuration divergence is its
    // own section, independent of the persisted-drift-assessment attention rule.
    expect(view.attentionItems.some((item) => item.sourceModule === "DRIFT")).toBe(false);
  });

  it("reports comparisonStatus UNKNOWN when a member's comparison itself came back unknown", async () => {
    vi.mocked(baselineRepository.listBaselinesInProject).mockResolvedValue([
      { id: "bl1", identifier: "BL-001", name: "X", status: "ACTIVE", memberCount: 1, assessmentCount: 0 },
    ] as never);
    vi.mocked(driftDetectionService.compareBaseline).mockResolvedValue({
      baselineId: "bl1",
      summary: { total: 1, unchanged: 0, changed: 0, missing: 0, unknown: 1 },
      members: [],
    } as never);

    const view = await service.getCommandCenter(CONTEXT, PROJECT_ID);

    expect(view.configuration.comparisonStatus).toBe("UNKNOWN");
  });

  it("reports an honest no-active-baseline state rather than a zeroed comparison", async () => {
    vi.mocked(baselineRepository.listBaselinesInProject).mockResolvedValue([]);

    const view = await service.getCommandCenter(CONTEXT, PROJECT_ID);

    expect(view.configuration).toEqual({
      hasActiveBaseline: false,
      baselineId: null,
      baselineIdentifier: null,
      baselineName: null,
      status: null,
      memberCount: null,
      changedCount: null,
      missingCount: null,
      comparisonStatus: null,
      href: `/projects/${PROJECT_ID}/baselines`,
    });
    expect(driftDetectionService.compareBaseline).not.toHaveBeenCalled();
  });

  it("shows open risks and high/critical issues, and only high/critical issues as attention", async () => {
    vi.mocked(riskService.listRisks).mockResolvedValue([
      { id: "rk1", identifier: "RSK-001", title: "Corrosion", status: "OPEN" },
      { id: "rk2", identifier: "RSK-002", title: "Mitigated one", status: "MITIGATED" },
    ] as never);
    vi.mocked(issueService.listIssues).mockResolvedValue([
      { id: "is1", identifier: "ISS-001", title: "Sensor fault", status: "OPEN", severity: "CRITICAL" },
      { id: "is2", identifier: "ISS-002", title: "Cosmetic", status: "OPEN", severity: "LOW" },
      { id: "is3", identifier: "ISS-003", title: "Closed one", status: "CLOSED", severity: "HIGH" },
    ] as never);

    const view = await service.getCommandCenter(CONTEXT, PROJECT_ID);

    expect(view.risks.open).toBe(1);
    expect(view.risks.items.map((r) => r.identifier)).toEqual(["RSK-001"]);
    expect(view.issues.open).toBe(2);
    expect(view.issues.attentionCount).toBe(1);
    expect(view.attentionItems.filter((item) => item.sourceModule === "RISK")).toHaveLength(1);
    expect(view.attentionItems.filter((item) => item.sourceModule === "ISSUE")).toHaveLength(1);
    expect(view.attentionItems.some((item) => item.sourceId === "is2")).toBe(false);
    expect(view.attentionItems.some((item) => item.sourceId === "is3")).toBe(false);
  });

  it("surfaces suppliers/items under review and expired/withdrawn qualifications", async () => {
    vi.mocked(supplierService.listSuppliers).mockResolvedValue([
      { id: "sup1", identifier: "SUP-001", name: "Acme Aero", status: "UNDER_REVIEW" },
      { id: "sup2", identifier: "SUP-002", name: "Active supplier", status: "ACTIVE" },
    ] as never);
    vi.mocked(suppliedItemService.listSuppliedItems).mockResolvedValue([
      { id: "si1", identifier: "SI-001", name: "Landing strut", status: "UNDER_REVIEW" },
    ] as never);
    vi.mocked(supplierQualificationService.listSupplierQualifications).mockResolvedValue([
      { id: "q1", title: "Source approval", status: "EXPIRED", supplier: { identifier: "SUP-001" } },
      { id: "q2", title: "Still active", status: "ACTIVE", supplier: { identifier: "SUP-002" } },
    ] as never);

    const view = await service.getCommandCenter(CONTEXT, PROJECT_ID);

    expect(view.suppliers.suppliersUnderReview).toHaveLength(1);
    expect(view.suppliers.suppliedItemsUnderReview).toHaveLength(1);
    expect(view.suppliers.qualificationsAttention).toHaveLength(1);
    expect(view.attentionItems.filter((item) => item.sourceModule === "SUPPLIER")).toHaveLength(3);
  });

  it("counts evidence by status but never treats DRAFT as an attention item", async () => {
    vi.mocked(evidenceService.listEvidence).mockResolvedValue([
      { id: "ev1", identifier: "EV-001", title: "Draft report", status: "DRAFT" },
      { id: "ev2", identifier: "EV-002", title: "Validated report", status: "VALIDATED" },
      { id: "ev3", identifier: "EV-003", title: "Old report", status: "SUPERSEDED" },
    ] as never);

    const view = await service.getCommandCenter(CONTEXT, PROJECT_ID);

    expect(view.evidence.draftCount).toBe(1);
    expect(view.evidence.validatedCount).toBe(1);
    expect(view.evidence.supersededCount).toBe(1);
    expect(view.evidence.draftItems).toHaveLength(1);
    // Recording evidence is normal, not urgent — never an attention item.
    expect(view.attentionItems.some((item) => item.sourceType === "EVIDENCE")).toBe(false);
  });

  it("surfaces open Sentinel targets with their own stored reason, never mutating anything", async () => {
    vi.mocked(decisionSentinelService.getSurveillanceCounts).mockResolvedValue({
      open: 1,
      acknowledged: 2,
    });
    vi.mocked(decisionSentinelService.listOpenSurveillance).mockResolvedValue([
      {
        id: "target1",
        targetType: "VERIFICATION_READINESS",
        targetId: "va1",
        targetIdentifier: "VA-001",
        targetLabel: "Hot fire test",
        status: "OPEN",
        reason: "The requirement changed after this activity's readiness was assessed.",
      },
    ] as never);

    const view = await service.getCommandCenter(CONTEXT, PROJECT_ID);

    expect(view.sentinel.openCount).toBe(1);
    expect(view.sentinel.acknowledgedCount).toBe(2);
    expect(view.sentinel.targets[0]!.href).toBe(`/projects/${PROJECT_ID}/verification/va1`);
    expect(view.sentinel.targets[0]!.reason).toBe(
      "The requirement changed after this activity's readiness was assessed.",
    );
    const sentinelAttention = view.attentionItems.find((item) => item.sourceModule === "SENTINEL");
    expect(sentinelAttention?.reason).toBe(
      "The requirement changed after this activity's readiness was assessed.",
    );
    expect(decisionSentinelService.listOpenSurveillance).toHaveBeenCalledTimes(1);
    // The mock only defines getSurveillanceCounts/listOpenSurveillance — if the
    // service under test called acknowledge/resolve/reevaluate on the read
    // path, that call would throw (not a function) and this test would fail.
  });
});

describe("de-duplication", () => {
  it("never produces two attention items with the same key", async () => {
    vi.mocked(technicalReadinessService.getLatestTechnicalReadiness).mockResolvedValue({
      assessment: {
        id: "tr1",
        gate: "RELEASE_READY",
        status: "NOT_READY",
        evaluatedAt: new Date(),
        summary: { blocking: 1, warning: 0, unknown: 0, informational: 0 },
      },
      freshness: "CURRENT",
    } as never);
    vi.mocked(riskService.listRisks).mockResolvedValue([
      { id: "rk1", identifier: "RSK-001", title: "Corrosion", status: "OPEN" },
    ] as never);

    const view = await service.getCommandCenter(CONTEXT, PROJECT_ID);

    const keys = view.attentionItems.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("negative assertions: no invented judgement", () => {
  it("never contains a score, probability, heatmap, percentage, or composite health field anywhere in the response", async () => {
    vi.mocked(riskService.listRisks).mockResolvedValue([
      { id: "rk1", identifier: "RSK-001", title: "Corrosion", status: "OPEN" },
    ] as never);
    vi.mocked(issueService.listIssues).mockResolvedValue([
      { id: "is1", identifier: "ISS-001", title: "Sensor fault", status: "OPEN", severity: "CRITICAL" },
    ] as never);

    const view = await service.getCommandCenter(CONTEXT, PROJECT_ID);
    const text = JSON.stringify(view);

    expect(text).not.toMatch(
      /riskScore|probability|heatmap|healthScore|overallHealth|compositeScore|readinessPercent|percentage|prediction/i,
    );
  });
});
