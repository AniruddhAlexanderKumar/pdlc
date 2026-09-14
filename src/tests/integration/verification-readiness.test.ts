import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  VERIFICATION_READINESS_VERSION,
  hasVerificationReadiness,
  readinessSignature,
} from "@/domain";
import {
  SKIP_REASON,
  type TestTenant,
  createTestTenant,
  databaseAvailable,
  destroyTestTenant,
  disconnectIntegrationPrisma,
  integrationPrisma,
} from "./setup";

/**
 * The readiness engine against real PostgreSQL.
 *
 * The unit suite drives the engine over an in-memory graph, so it proves the
 * rule registry and the precedence but nothing about persistence. This runs the
 * real path end to end: a real project graph, real requirement/design/decision
 * records, real assumption-monitoring rows, a real change request with a real
 * impact analysis, and the real assessment/finding rows — including the array
 * and JSON columns, the cascades, project scoping, the fingerprint and the
 * audit row.
 */

const modules = databaseAvailable
  ? {
      readiness: await import("@/server/services/verification-readiness.service"),
      graph: await import("@/server/services/engineering-graph.service"),
      graphRepo: await import("@/server/repositories/graph-repository"),
      readinessRepo: await import("@/server/repositories/verification-readiness.repository"),
      basisRepo: await import(
        "@/server/repositories/verification-readiness-basis.repository"
      ),
    }
  : null;

describe.skipIf(!databaseAvailable)(
  `verification readiness against PostgreSQL (${SKIP_REASON})`,
  () => {
    const prisma = integrationPrisma!;

    let tenant: TestTenant;
    let otherTenant: TestTenant;
    let context: { organizationId: string; actorId: string };
    let service: InstanceType<
      typeof import("@/server/services/verification-readiness.service").VerificationReadinessService
    >;

    const ids = {
      requirement: "",
      designItem: "",
      decision: "",
      assumption: "",
      verification: "",
      /** A second activity with no requirement link at all. */
      orphanVerification: "",
      evidence: "",
      changeRequest: "",
      foreignActivity: "",
    };

    beforeAll(async () => {
      tenant = await createTestTenant("readiness");
      otherTenant = await createTestTenant("readiness-other");
      context = { organizationId: tenant.organizationId, actorId: tenant.userId };

      // The engine reads the graph through the real service, which reads the
      // real repository — bound here to the integration client.
      service = new modules!.readiness.VerificationReadinessService(
        new modules!.graph.EngineeringGraphService(
          new modules!.graphRepo.EngineeringGraphRepository(prisma),
        ),
      );

      const projectId = tenant.projectId;

      //   REQ-1 ─┬─verified by──▶ VA-1 ──has evidence──▶ EV-1
      //          ├─allocated to─▶ DI-1 ◀──shapes────── ED-1 ──assumption──▶ ASM-1
      //          └─addressed by─▶ ED-1
      const requirement = await prisma.requirement.create({
        data: {
          projectId,
          identifier: "REQ-001",
          title: "Maximum chamber pressure",
          statement: "The engine shall not exceed 120 bar.",
          status: "APPROVED",
        },
      });
      ids.requirement = requirement.id;

      const designItem = await prisma.designItem.create({
        data: {
          projectId,
          identifier: "DI-001",
          name: "Combustion chamber",
          itemType: "COMPONENT",
          status: "BASELINED",
        },
      });
      ids.designItem = designItem.id;

      const decision = await prisma.engineeringDecision.create({
        data: {
          projectId,
          identifier: "ED-001",
          title: "Use regenerative cooling",
          statement: "The chamber will be regeneratively cooled.",
          rationale: "Ablative liner mass was prohibitive.",
          status: "APPROVED",
        },
      });
      ids.decision = decision.id;

      const assumption = await prisma.decisionAssumption.create({
        data: {
          engineeringDecisionId: decision.id,
          statement: "Coolant flow stays above 2.4 kg/s.",
          status: "VALIDATED",
        },
      });
      ids.assumption = assumption.id;

      const verification = await prisma.verificationActivity.create({
        data: {
          projectId,
          identifier: "VA-001",
          title: "Proof pressure test",
          method: "TEST",
          ownerId: tenant.userId,
        },
      });
      ids.verification = verification.id;

      const orphan = await prisma.verificationActivity.create({
        data: {
          projectId,
          identifier: "VA-002",
          title: "Unattached inspection",
          method: "INSPECTION",
        },
      });
      ids.orphanVerification = orphan.id;

      const evidence = await prisma.evidence.create({
        data: {
          projectId,
          identifier: "EV-001",
          title: "Proof test report",
          evidenceType: "TEST_RESULT",
          sourceReference: "TR-2026-014",
        },
      });
      ids.evidence = evidence.id;

      await prisma.requirementVerificationLink.create({
        data: {
          requirementId: requirement.id,
          verificationActivityId: verification.id,
          createdById: tenant.userId,
        },
      });
      await prisma.requirementDesignLink.create({
        data: {
          requirementId: requirement.id,
          designItemId: designItem.id,
          linkType: "ALLOCATED_TO",
          createdById: tenant.userId,
        },
      });
      await prisma.requirementDecisionLink.create({
        data: {
          requirementId: requirement.id,
          engineeringDecisionId: decision.id,
          linkType: "DECISION_ADDRESSES_REQUIREMENT",
          createdById: tenant.userId,
        },
      });
      await prisma.decisionDesignLink.create({
        data: {
          engineeringDecisionId: decision.id,
          designItemId: designItem.id,
          createdById: tenant.userId,
        },
      });
      await prisma.evidenceLink.create({
        data: {
          evidenceId: evidence.id,
          verificationActivityId: verification.id,
          createdById: tenant.userId,
        },
      });

      const changeRequest = await prisma.changeRequest.create({
        data: {
          projectId,
          identifier: "CR-001",
          title: "Raise the pressure limit",
          description: "Raise the chamber pressure limit to 130 bar.",
          reason: "Performance shortfall.",
          requestedById: tenant.userId,
        },
      });
      ids.changeRequest = changeRequest.id;

      // An activity in the other tenant, to prove nothing leaks across.
      const foreignActivity = await prisma.verificationActivity.create({
        data: {
          projectId: otherTenant.projectId,
          identifier: "VA-900",
          title: "Someone else's test",
          method: "TEST",
        },
      });
      ids.foreignActivity = foreignActivity.id;
    });

    afterAll(async () => {
      if (tenant) await destroyTestTenant(tenant);
      if (otherTenant) await destroyTestTenant(otherTenant);
      await disconnectIntegrationPrisma();
    });

    // --- Persistence --------------------------------------------------------

    describe("persisting an assessment", () => {
      it("writes the assessment and its findings in one transaction", async () => {
        const report = await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );

        const stored = await prisma.verificationReadinessAssessment.findUniqueOrThrow({
          where: { id: report.assessment.id },
        });
        expect(stored.projectId).toBe(tenant.projectId);
        expect(stored.verificationActivityId).toBe(ids.verification);
        expect(stored.readinessVersion).toBe(VERIFICATION_READINESS_VERSION);
        expect(stored.fingerprint).toMatch(/^[0-9a-f]{64}$/);
        expect(stored.evaluatedById).toBe(tenant.userId);

        const findingRows = await prisma.verificationReadinessFinding.count({
          where: { assessmentId: report.assessment.id },
        });
        expect(findingRows).toBeGreaterThan(0);
        // The summary must describe the rows actually written.
        expect(stored.findingCount).toBe(findingRows);
        expect(
          stored.blockingCount +
            stored.warningCount +
            stored.informationalCount +
            stored.unknownCount,
        ).toBe(stored.findingCount);
      });

      it("round-trips the finding basis array and the basis JSON column", async () => {
        const report = await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );

        const row = await prisma.verificationReadinessFinding.findFirstOrThrow({
          where: { assessmentId: report.assessment.id, ruleId: "VR-REQ-003" },
        });
        // A real PostgreSQL text[] round trip, sorted as the domain normalizes.
        expect(row.basis).toEqual([
          "REQUIREMENT_LIFECYCLE_STATE",
          "REQUIREMENT_VERIFICATION_LINK",
        ]);
        expect(row.subjectId).toBe(ids.requirement);
        expect(row.subjectIdentifier).toBe("REQ-001");

        const stored = await prisma.verificationReadinessAssessment.findUniqueOrThrow({
          where: { id: report.assessment.id },
        });
        const basis = stored.basis as {
          objects: Array<{ id: string; state: string | null; revision: string }>;
          relationships: Array<{ relationshipId: string; edgeType: string }>;
        };
        expect(basis.objects.map((object) => object.id)).toContain(ids.requirement);
        expect(basis.relationships.length).toBeGreaterThan(0);
      });

      it("stores findings in the deterministic order the engine produced", async () => {
        const report = await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );

        const rows = await prisma.verificationReadinessFinding.findMany({
          where: { assessmentId: report.assessment.id },
          orderBy: { sequence: "asc" },
        });
        expect(rows.map((row) => row.sequence)).toEqual(rows.map((_, index) => index));
        expect(rows.map((row) => row.ruleId)).toEqual(
          report.findings.map((finding) => finding.ruleId),
        );
      });

      it("records the evaluation as an audit event against the assessment", async () => {
        const report = await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );

        const events = await prisma.auditLog.findMany({
          where: {
            organizationId: tenant.organizationId,
            entityType: "VerificationReadinessAssessment",
            entityId: report.assessment.id,
          },
        });
        expect(events).toHaveLength(1);
        expect(events[0]?.action).toBe("verification_readiness.evaluated");
        expect(events[0]?.actorId).toBe(tenant.userId);
        // The detail lives in the assessment, not in the audit log.
        expect(JSON.stringify(events[0]?.metadata)).not.toContain("VR-REQ-003");

        const started = await prisma.auditLog.findMany({
          where: {
            organizationId: tenant.organizationId,
            entityType: "VerificationActivity",
            entityId: ids.verification,
            action: "verification_readiness.evaluation_started",
          },
        });
        expect(started.length).toBeGreaterThan(0);
      });

      it("enforces the foreign key from a finding to its assessment", async () => {
        await expect(
          prisma.verificationReadinessFinding.create({
            data: {
              assessmentId: "does-not-exist",
              ruleId: "VR-REQ-001",
              category: "REQUIREMENT_STATE",
              status: "BLOCKING",
              severity: "BLOCKER",
              subjectType: "REQUIREMENT",
              subjectId: ids.requirement,
              subjectLabel: "Orphan",
              message: "Orphan",
              basis: [],
              sequence: 0,
            },
          }),
        ).rejects.toThrow();
      });
    });

    // --- Reading ------------------------------------------------------------

    describe("latest, history and detail", () => {
      it("returns the newest assessment as the latest one", async () => {
        const first = await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );
        const second = await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );
        expect(second.assessment.id).not.toBe(first.assessment.id);

        const latest = await service.getLatestVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );
        expect(hasVerificationReadiness(latest)).toBe(true);
        if (!hasVerificationReadiness(latest)) return;
        expect(latest.assessment.id).toBe(second.assessment.id);
      });

      it("keeps the whole history, newest first", async () => {
        await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );

        const history = await service.listVerificationReadinessHistory(
          context,
          tenant.projectId,
          ids.verification,
        );
        expect(history.length).toBeGreaterThan(1);
        for (let index = 1; index < history.length; index += 1) {
          expect(history[index - 1]!.evaluatedAt.getTime()).toBeGreaterThanOrEqual(
            history[index]!.evaluatedAt.getTime(),
          );
        }
      });

      it("returns one assessment in full, with the basis it was written with", async () => {
        const report = await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );

        const explained = await service.explainVerificationReadiness(
          context,
          tenant.projectId,
          report.assessment.id,
        );
        expect(explained.assessment.id).toBe(report.assessment.id);
        expect(readinessSignature(explained)).toBe(readinessSignature(report));
        expect(explained.basis.objects.length).toBe(report.basis.objects.length);
      });

      it("says NOT_EVALUATED for an activity nobody has assessed", async () => {
        const latest = await service.getLatestVerificationReadiness(
          context,
          tenant.projectId,
          ids.orphanVerification,
        );
        expect(hasVerificationReadiness(latest)).toBe(false);
        expect(latest).toMatchObject({ status: "NOT_EVALUATED" });
      });
    });

    // --- Scoping ------------------------------------------------------------

    describe("project and organization scoping", () => {
      it("does not read an activity in another organization", async () => {
        await expect(
          service.evaluateVerificationReadiness(
            context,
            otherTenant.projectId,
            ids.foreignActivity,
          ),
        ).rejects.toThrow(/not found/i);
      });

      it("does not return an assessment through another project's id", async () => {
        const report = await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );

        const found = await modules!.readinessRepo.findAssessmentInProject(
          otherTenant.projectId,
          report.assessment.id,
          prisma,
        );
        expect(found).toBeNull();
      });

      it("returns no findings for an assessment outside the project", async () => {
        const report = await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );

        const basis = await modules!.readinessRepo.findAssessmentBasis(
          otherTenant.projectId,
          report.assessment.id,
          prisma,
        );
        expect(basis).toBeNull();
      });

      it("keeps every finding's subject inside the project", async () => {
        const report = await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );

        const known = new Set([
          ids.verification,
          ids.requirement,
          ids.designItem,
          ids.decision,
          ids.assumption,
          ids.evidence,
          ids.changeRequest,
        ]);
        for (const finding of report.findings) {
          expect(known.has(finding.subjectId)).toBe(true);
        }
      });
    });

    // --- The real graph -----------------------------------------------------

    describe("evaluating from the real persisted graph", () => {
      it("reaches requirement, design, decision, assumption and evidence", async () => {
        const report = await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );

        const byId = new Map(report.basis.objects.map((object) => [object.id, object]));
        expect(byId.get(ids.requirement)?.role).toBe("VERIFIED_REQUIREMENT");
        expect(byId.get(ids.designItem)?.role).toBe("PREREQUISITE_DESIGN_ITEM");
        expect(byId.get(ids.decision)?.role).toBe("RELEVANT_DECISION");
        expect(byId.get(ids.assumption)?.role).toBe("DECISION_ASSUMPTION");
        expect(byId.get(ids.evidence)?.role).toBe("ATTACHED_EVIDENCE");
      });

      it("cites relationship rows that genuinely exist", async () => {
        const report = await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );

        const verified = report.basis.relationships.find(
          (relationship) => relationship.edgeType === "REQUIREMENT_VERIFIED_BY",
        );
        expect(verified).toBeDefined();
        const row = await prisma.requirementVerificationLink.findUnique({
          where: { id: verified!.relationshipId },
        });
        expect(row).not.toBeNull();
      });

      it("blocks an activity that verifies nothing", async () => {
        const report = await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.orphanVerification,
        );

        expect(report.assessment.status).toBe("NOT_READY");
        expect(report.findings.map((finding) => finding.ruleId)).toContain("VR-TRACE-001");
      });

      it("reports an assumption nobody has monitored as indeterminate", async () => {
        const report = await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );

        const finding = report.findings.find((f) => f.ruleId === "VR-ASM-003");
        expect(finding?.status).toBe("UNKNOWN");
        expect(report.assessment.status).toBe("UNKNOWN");
      });

      it("consumes a real assumption-monitoring record once one exists", async () => {
        await prisma.assumptionMonitoringRecord.create({
          data: {
            assumptionId: ids.assumption,
            kind: "EVALUATION",
            status: "REVIEW_REQUIRED",
            finding: "DECISION_BASIS_CHANGED",
            basisFingerprint: "fp-basis",
            decisionFingerprint: "fp-decision",
            evidenceFingerprint: "fp-evidence",
            linkedFingerprint: "fp-linked",
            basisSnapshot: [],
            changedObjects: [],
            assumptionStatus: "VALIDATED",
            actorId: tenant.userId,
          },
        });

        const report = await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );

        expect(report.findings.find((f) => f.ruleId === "VR-ASM-001")?.status).toBe("BLOCKING");
        expect(report.assessment.status).toBe("NOT_READY");
        // Consumed, never written: the assumption's own status is untouched.
        const assumption = await prisma.decisionAssumption.findUniqueOrThrow({
          where: { id: ids.assumption },
        });
        expect(assumption.status).toBe("VALIDATED");
      });

      it("does not modify any source artifact", async () => {
        const before = await prisma.requirement.findUniqueOrThrow({
          where: { id: ids.requirement },
        });

        await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );

        const after = await prisma.requirement.findUniqueOrThrow({
          where: { id: ids.requirement },
        });
        expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
        expect(after.status).toBe(before.status);
      });
    });

    // --- Change impact ------------------------------------------------------

    describe("change-impact context", () => {
      it("reports a declared but unanalysed change as indeterminate", async () => {
        await prisma.changeRequestImpact.create({
          data: {
            changeRequestId: ids.changeRequest,
            requirementId: ids.requirement,
            note: "The limit is stated here.",
            createdById: tenant.userId,
          },
        });

        const report = await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );

        const finding = report.findings.find((f) => f.ruleId === "VR-CHG-004");
        expect(finding?.status).toBe("UNKNOWN");
        expect(finding?.subjectId).toBe(ids.changeRequest);
      });

      it("reads a real impact analysis and judges its freshness", async () => {
        const impact = await import("@/server/services/change-impact-analysis.service");
        const impactService = new impact.ChangeImpactAnalysisService(
          new modules!.graph.EngineeringGraphService(
            new modules!.graphRepo.EngineeringGraphRepository(prisma),
          ),
        );
        await impactService.runImpactAnalysis(context, tenant.projectId, ids.changeRequest);

        const report = await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );

        // The analysis reaches the requirement this activity verifies, and the
        // activity itself, so the strongest of those conditions applies.
        const ruleIds = report.findings.map((finding) => finding.ruleId);
        expect(ruleIds.some((id) => id === "VR-CHG-001" || id === "VR-CHG-002")).toBe(true);
        expect(report.assessment.status).toBe("NOT_READY");

        const change = report.basis.changes.find(
          (candidate) => candidate.changeRequestId === ids.changeRequest,
        );
        expect(change?.analysisFreshness).toBe("CURRENT");
        expect(change?.analysisId).not.toBeNull();
      });

      it("never presents a stale impact analysis as current evidence", async () => {
        // Touching an unrelated artifact moves the project-wide fingerprint the
        // impact engine uses, which is exactly what makes its analysis stale.
        await prisma.requirement.update({
          where: { id: ids.requirement },
          data: { title: "Maximum chamber pressure (revised)" },
        });

        const report = await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );

        const change = report.basis.changes.find(
          (candidate) => candidate.changeRequestId === ids.changeRequest,
        );
        expect(change?.analysisFreshness).toBe("STALE");
        expect(report.findings.find((f) => f.ruleId === "VR-CHG-003")?.status).toBe("UNKNOWN");
      });

      it("returns no change context for an activity nothing in flight touches", async () => {
        const rows = await modules!.basisRepo.loadChangeImpactContext(
          tenant.projectId,
          [{ type: "VERIFICATION_ACTIVITY", id: ids.orphanVerification }],
          prisma,
        );
        expect(rows).toEqual([]);
      });
    });

    // --- Freshness and immutability -----------------------------------------

    describe("freshness against the real basis", () => {
      it("is current immediately after an evaluation", async () => {
        await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );

        const latest = await service.getLatestVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );
        if (!hasVerificationReadiness(latest)) throw new Error("expected an assessment");
        expect(latest.freshness).toBe("CURRENT");
      });

      it("goes stale when a basis object actually changes", async () => {
        await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );

        await prisma.designItem.update({
          where: { id: ids.designItem },
          data: { status: "IN_REVIEW" },
        });

        const latest = await service.getLatestVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );
        if (!hasVerificationReadiness(latest)) throw new Error("expected an assessment");
        expect(latest.freshness).toBe("STALE");
      });

      it("is not staled by an unrelated artifact elsewhere in the project", async () => {
        await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );

        // A requirement this activity has nothing to do with.
        await prisma.requirement.create({
          data: {
            projectId: tenant.projectId,
            identifier: "REQ-900",
            title: "Unrelated requirement",
            statement: "Nothing to do with the proof pressure test.",
          },
        });

        const latest = await service.getLatestVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );
        if (!hasVerificationReadiness(latest)) throw new Error("expected an assessment");
        expect(latest.freshness).toBe("CURRENT");
      });

      it("leaves a historical assessment exactly as it was written", async () => {
        const first = await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );

        await prisma.requirement.update({
          where: { id: ids.requirement },
          data: { status: "OBSOLETE" },
        });
        const second = await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );
        expect(second.assessment.status).toBe("NOT_READY");

        const historical = await service.explainVerificationReadiness(
          context,
          tenant.projectId,
          first.assessment.id,
        );
        expect(historical.assessment.status).toBe(first.assessment.status);
        expect(historical.assessment.fingerprint).toBe(first.assessment.fingerprint);
        expect(readinessSignature(historical)).toBe(readinessSignature(first));
        expect(historical.freshness).toBe("STALE");

        // Put the requirement back for anything that runs after this.
        await prisma.requirement.update({
          where: { id: ids.requirement },
          data: { status: "APPROVED" },
        });
      });
    });

    // --- Cascades -----------------------------------------------------------

    describe("cascade behaviour", () => {
      it("removes the assessments when the activity is deleted", async () => {
        const activity = await prisma.verificationActivity.create({
          data: {
            projectId: tenant.projectId,
            identifier: "VA-003",
            title: "Disposable activity",
            method: "ANALYSIS",
          },
        });
        const report = await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          activity.id,
        );

        await prisma.verificationActivity.delete({ where: { id: activity.id } });

        expect(
          await prisma.verificationReadinessAssessment.count({
            where: { id: report.assessment.id },
          }),
        ).toBe(0);
        // And the findings go with it.
        expect(
          await prisma.verificationReadinessFinding.count({
            where: { assessmentId: report.assessment.id },
          }),
        ).toBe(0);
      });

      it("keeps the assessment when the evaluator is removed", async () => {
        const evaluator = await prisma.user.create({
          data: {
            email: `readiness-evaluator-${Date.now()}@test.invalid`,
            name: "Temporary Evaluator",
            organizationId: tenant.organizationId,
          },
        });
        // A plain org MEMBER (the default, unlike the tenant's own OWNER
        // user) has no access to any project without a real membership row
        // — the same rule production enforces. Without this, evaluating as
        // `evaluator` is rejected before it ever reaches the engine.
        await prisma.projectMembership.create({
          data: { projectId: tenant.projectId, userId: evaluator.id, role: "ENGINEER" },
        });

        const report = await service.evaluateVerificationReadiness(
          { organizationId: tenant.organizationId, actorId: evaluator.id },
          tenant.projectId,
          ids.verification,
        );

        await prisma.user.delete({ where: { id: evaluator.id } });

        const stored = await prisma.verificationReadinessAssessment.findUniqueOrThrow({
          where: { id: report.assessment.id },
        });
        // Losing the person must not erase the engineering judgement.
        expect(stored.evaluatedById).toBeNull();
      });
    });

    // --- Batched reads ------------------------------------------------------

    describe("the list query", () => {
      it("returns the latest assessment per activity in one pass", async () => {
        await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );
        await service.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.orphanVerification,
        );

        const latest = await modules!.readinessRepo.findLatestForActivities(
          tenant.projectId,
          [ids.verification, ids.orphanVerification],
          prisma,
        );
        expect(latest.size).toBe(2);
        expect(latest.get(ids.orphanVerification)?.status).toBe("NOT_READY");
      });

      it("returns nothing for activities in another project", async () => {
        const latest = await modules!.readinessRepo.findLatestForActivities(
          otherTenant.projectId,
          [ids.verification],
          prisma,
        );
        expect(latest.size).toBe(0);
      });
    });
  },
);
