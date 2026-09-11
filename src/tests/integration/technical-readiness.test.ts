import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  TECHNICAL_READINESS_VERSION,
  hasTechnicalReadiness,
  technicalReadinessSignature,
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
 * The gate engine against real PostgreSQL.
 *
 * The unit suite drives the engine over an in-memory graph, so it proves the
 * rule registry and the precedence but nothing about persistence. This runs the
 * real path end to end: a real project graph with requirements, design items,
 * decisions, assumptions, verification activities, evidence, risks, issues and
 * a change request; the real verification-readiness and change-impact engines
 * writing the verdicts this one consumes; and the real assessment/finding rows
 * — including the array and JSON columns, the cascades, project scoping, the
 * fingerprint and the audit row.
 */

const modules = databaseAvailable
  ? {
      technical: await import("@/server/services/technical-readiness.service"),
      verification: await import("@/server/services/verification-readiness.service"),
      impact: await import("@/server/services/change-impact-analysis.service"),
      graph: await import("@/server/services/engineering-graph.service"),
      graphRepo: await import("@/server/repositories/graph-repository"),
      technicalRepo: await import("@/server/repositories/technical-readiness.repository"),
      scopeRepo: await import("@/server/repositories/technical-readiness-scope.repository"),
    }
  : null;

describe.skipIf(!databaseAvailable)(
  `technical readiness against PostgreSQL (${SKIP_REASON})`,
  () => {
    const prisma = integrationPrisma!;

    let tenant: TestTenant;
    let otherTenant: TestTenant;
    let context: { organizationId: string; actorId: string };
    let service: InstanceType<
      typeof import("@/server/services/technical-readiness.service").TechnicalReadinessService
    >;
    let verification: InstanceType<
      typeof import("@/server/services/verification-readiness.service").VerificationReadinessService
    >;

    const ids = {
      need: "",
      requirement: "",
      designItem: "",
      decision: "",
      assumption: "",
      verification: "",
      evidence: "",
      changeRequest: "",
      risk: "",
      issue: "",
    };

    beforeAll(async () => {
      tenant = await createTestTenant("technical-readiness");
      otherTenant = await createTestTenant("technical-readiness-other");
      context = { organizationId: tenant.organizationId, actorId: tenant.userId };

      const graph = new modules!.graph.EngineeringGraphService(
        new modules!.graphRepo.EngineeringGraphRepository(prisma),
      );
      verification = new modules!.verification.VerificationReadinessService(graph);
      service = new modules!.technical.TechnicalReadinessService(graph, verification);

      const projectId = tenant.projectId;

      //   SN-1 ─derives▶ REQ-1 ─┬─allocated─▶ DI-1 ◀─shapes── ED-1 ─assumption▶ ASM-1
      //                         └─verified by▶ VA-1 ─has evidence▶ EV-1
      const need = await prisma.stakeholderNeed.create({
        data: {
          projectId,
          identifier: "SN-001",
          title: "Survive ascent loads",
          description: "The vehicle must survive max q.",
          stakeholder: "Chief Engineer",
        },
      });
      ids.need = need.id;

      const requirement = await prisma.requirement.create({
        data: {
          projectId,
          identifier: "REQ-001",
          title: "Maximum chamber pressure",
          statement: "The engine shall not exceed 120 bar.",
          status: "BASELINED",
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

      const activity = await prisma.verificationActivity.create({
        data: {
          projectId,
          identifier: "VA-001",
          title: "Proof pressure test",
          method: "TEST",
          ownerId: tenant.userId,
        },
      });
      ids.verification = activity.id;

      const evidence = await prisma.evidence.create({
        data: {
          projectId,
          title: "Proof test report",
          evidenceType: "TEST_RESULT",
          sourceReference: "TR-2026-014",
        },
      });
      ids.evidence = evidence.id;

      await prisma.needRequirementLink.create({
        data: {
          stakeholderNeedId: need.id,
          requirementId: requirement.id,
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
      await prisma.requirementVerificationLink.create({
        data: {
          requirementId: requirement.id,
          verificationActivityId: activity.id,
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
          verificationActivityId: activity.id,
          createdById: tenant.userId,
        },
      });

      const risk = await prisma.risk.create({
        data: {
          projectId,
          identifier: "RISK-001",
          title: "Coolant channel blockage",
          description: "Debris could block a channel.",
          status: "ACCEPTED",
        },
      });
      ids.risk = risk.id;

      const issue = await prisma.issue.create({
        data: {
          projectId,
          identifier: "ISS-001",
          title: "Injector face erosion",
          description: "Observed after long-duration firing.",
          severity: "MEDIUM",
          status: "OPEN",
        },
      });
      ids.issue = issue.id;

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
    });

    afterAll(async () => {
      if (tenant) await destroyTestTenant(tenant);
      if (otherTenant) await destroyTestTenant(otherTenant);
      await disconnectIntegrationPrisma();
    });

    // --- Persistence --------------------------------------------------------

    describe("persisting a gate assessment", () => {
      it("writes the assessment and its findings in one transaction", async () => {
        const report = await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "SYSTEM_DEFINITION",
        });

        const stored = await prisma.technicalReadinessAssessment.findUniqueOrThrow({
          where: { id: report.assessment.id },
        });
        expect(stored.projectId).toBe(tenant.projectId);
        expect(stored.gate).toBe("SYSTEM_DEFINITION");
        expect(stored.readinessVersion).toBe(TECHNICAL_READINESS_VERSION);
        expect(stored.fingerprint).toMatch(/^[0-9a-f]{64}$/);
        expect(stored.evaluatedById).toBe(tenant.userId);

        const findingRows = await prisma.technicalReadinessFinding.count({
          where: { assessmentId: report.assessment.id },
        });
        expect(findingRows).toBeGreaterThan(0);
        expect(stored.findingCount).toBe(findingRows);
        expect(
          stored.blockingCount +
            stored.warningCount +
            stored.informationalCount +
            stored.unknownCount,
        ).toBe(stored.findingCount);
      });

      it("round-trips the finding basis array and the scope JSON column", async () => {
        const report = await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "SYSTEM_DEFINITION",
        });

        const row = await prisma.technicalReadinessFinding.findFirstOrThrow({
          where: { assessmentId: report.assessment.id, ruleId: "TR-SCP-001" },
        });
        // A real PostgreSQL text[] round trip.
        expect(row.basis).toEqual(["PROJECT_SCOPE"]);
        expect(row.subjectType).toBe("PROJECT");
        expect(row.subjectId).toBe(tenant.projectId);

        const stored = await prisma.technicalReadinessAssessment.findUniqueOrThrow({
          where: { id: report.assessment.id },
        });
        const scope = stored.scope as {
          label: string;
          counts: Record<string, number>;
          objects: Array<{ id: string; state: string | null; revision: string }>;
          relationships: Array<{ relationshipId: string }>;
        };
        expect(scope.label).toBe("Current active engineering scope");
        expect(scope.counts["REQUIREMENT"]).toBe(1);
        expect(scope.objects.map((object) => object.id)).toContain(ids.requirement);
        expect(scope.relationships.length).toBeGreaterThan(0);
      });

      it("stores findings in the deterministic order the engine produced", async () => {
        const report = await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "DESIGN_REVIEW",
        });

        const rows = await prisma.technicalReadinessFinding.findMany({
          where: { assessmentId: report.assessment.id },
          orderBy: { sequence: "asc" },
        });
        expect(rows.map((row) => row.sequence)).toEqual(rows.map((_, index) => index));
        expect(rows.map((row) => row.ruleId)).toEqual(
          report.findings.map((finding) => finding.ruleId),
        );
      });

      it("records the evaluation as an audit event against the assessment", async () => {
        const report = await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "DESIGN_FREEZE",
        });

        const events = await prisma.auditLog.findMany({
          where: {
            organizationId: tenant.organizationId,
            entityType: "TechnicalReadinessAssessment",
            entityId: report.assessment.id,
          },
        });
        expect(events).toHaveLength(1);
        expect(events[0]?.action).toBe("technical_readiness.evaluated");
        expect(events[0]?.actorId).toBe(tenant.userId);
        expect(JSON.stringify(events[0]?.metadata)).toContain("DESIGN_FREEZE");
        // The detail lives in the assessment, not in the audit log.
        expect(JSON.stringify(events[0]?.metadata)).not.toContain("TR-SCP-001");

        const started = await prisma.auditLog.findMany({
          where: {
            organizationId: tenant.organizationId,
            entityType: "Project",
            entityId: tenant.projectId,
            action: "technical_readiness.evaluation_started",
          },
        });
        expect(started.length).toBeGreaterThan(0);
      });

      it("enforces the foreign key from a finding to its assessment", async () => {
        await expect(
          prisma.technicalReadinessFinding.create({
            data: {
              assessmentId: "does-not-exist",
              ruleId: "TR-REQ-002",
              category: "REQUIREMENT",
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

    // --- Gate-scoped reads --------------------------------------------------

    describe("latest, history and detail", () => {
      it("keeps each gate's latest assessment separate", async () => {
        const definition = await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "SYSTEM_DEFINITION",
        });
        const review = await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "DESIGN_REVIEW",
        });

        const latestDefinition = await service.getLatestTechnicalReadiness(
          context,
          tenant.projectId,
          "SYSTEM_DEFINITION",
        );
        if (!hasTechnicalReadiness(latestDefinition)) throw new Error("expected an assessment");
        expect(latestDefinition.assessment.id).toBe(definition.assessment.id);

        const latestReview = await service.getLatestTechnicalReadiness(
          context,
          tenant.projectId,
          "DESIGN_REVIEW",
        );
        if (!hasTechnicalReadiness(latestReview)) throw new Error("expected an assessment");
        expect(latestReview.assessment.id).toBe(review.assessment.id);
      });

      it("filters history by gate, and returns everything without one", async () => {
        const gated = await service.listTechnicalReadinessHistory(
          context,
          tenant.projectId,
          "SYSTEM_DEFINITION",
        );
        expect(gated.every((assessment) => assessment.gate === "SYSTEM_DEFINITION")).toBe(true);

        const all = await service.listTechnicalReadinessHistory(context, tenant.projectId);
        expect(all.length).toBeGreaterThan(gated.length);

        for (let index = 1; index < all.length; index += 1) {
          expect(all[index - 1]!.evaluatedAt.getTime()).toBeGreaterThanOrEqual(
            all[index]!.evaluatedAt.getTime(),
          );
        }
      });

      it("returns one assessment in full, with the scope it was written with", async () => {
        const report = await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "DESIGN_REVIEW",
        });

        const explained = await service.explainTechnicalReadiness(
          context,
          tenant.projectId,
          report.assessment.id,
        );
        expect(explained.assessment.id).toBe(report.assessment.id);
        expect(technicalReadinessSignature(explained)).toBe(
          technicalReadinessSignature(report),
        );
        expect(explained.scope.objects.length).toBe(report.scope.objects.length);
      });

      it("says NOT_EVALUATED for a gate nobody has assessed", async () => {
        const latest = await service.getLatestTechnicalReadiness(
          context,
          otherTenant.projectId,
          "RELEASE_READY",
        );
        expect(hasTechnicalReadiness(latest)).toBe(false);
        expect(latest).toMatchObject({ status: "NOT_EVALUATED", gate: "RELEASE_READY" });
      });

      it("returns the latest per gate in one batched pass", async () => {
        const latest = await modules!.technicalRepo.findLatestPerGate(tenant.projectId, prisma);
        expect(latest.get("SYSTEM_DEFINITION")).toBeDefined();
        expect(latest.get("DESIGN_REVIEW")).toBeDefined();
        // A gate nobody evaluated is absent rather than a zero-valued entry.
        expect(latest.get("RELEASE_READY")).toBeUndefined();
      });
    });

    // --- Scoping ------------------------------------------------------------

    describe("project and organization scoping", () => {
      it("does not evaluate a project in another organization", async () => {
        await expect(
          service.evaluateTechnicalReadiness(
            { organizationId: tenant.organizationId, actorId: tenant.userId },
            otherTenant.projectId,
            { gate: "SYSTEM_DEFINITION" },
          ),
        ).rejects.toThrow(/not found/i);
      });

      it("does not return an assessment through another project's id", async () => {
        const report = await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "SYSTEM_DEFINITION",
        });

        const found = await modules!.technicalRepo.findAssessmentInProject(
          otherTenant.projectId,
          report.assessment.id,
          prisma,
        );
        expect(found).toBeNull();

        const scope = await modules!.technicalRepo.findAssessmentScope(
          otherTenant.projectId,
          report.assessment.id,
          prisma,
        );
        expect(scope).toBeNull();
      });

      it("keeps every scope object inside the project", async () => {
        const report = await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "RELEASE_READY",
        });

        const known = new Set([
          tenant.projectId,
          ids.requirement,
          ids.designItem,
          ids.decision,
          ids.assumption,
          ids.verification,
          ids.evidence,
          ids.need,
          ids.changeRequest,
          ids.risk,
          ids.issue,
        ]);
        for (const object of report.scope.objects) {
          expect(known.has(object.id)).toBe(true);
        }
        for (const finding of report.findings) {
          expect(known.has(finding.subjectId)).toBe(true);
        }
      });

      it("scopes the batched state reads to the project", async () => {
        const foreign = await modules!.scopeRepo.loadRequirements(
          otherTenant.projectId,
          prisma,
        );
        expect(foreign).toEqual([]);
      });
    });

    // --- Evaluating from the real graph -------------------------------------

    describe("evaluating from the real persisted state", () => {
      it("resolves the whole active scope from real rows", async () => {
        const report = await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "RELEASE_READY",
        });

        const byId = new Map(report.scope.objects.map((object) => [object.id, object]));
        expect(byId.get(ids.requirement)?.role).toBe("REQUIREMENT");
        expect(byId.get(ids.designItem)?.role).toBe("DESIGN_ITEM");
        expect(byId.get(ids.decision)?.role).toBe("ENGINEERING_DECISION");
        expect(byId.get(ids.assumption)?.role).toBe("DECISION_ASSUMPTION");
        expect(byId.get(ids.verification)?.role).toBe("VERIFICATION_ACTIVITY");
        expect(byId.get(ids.need)?.role).toBe("STAKEHOLDER_NEED");
        expect(byId.get(ids.changeRequest)?.role).toBe("CHANGE_REQUEST");
        // An accepted risk is out of the open set but still in scope.
        expect(byId.get(ids.risk)?.state).toBe("ACCEPTED");
        expect(byId.get(ids.issue)?.state).toBe("MEDIUM/OPEN");
      });

      it("cites relationship rows that genuinely exist", async () => {
        const report = await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "DESIGN_REVIEW",
        });

        const allocation = report.scope.relationships.find(
          (relationship) => relationship.edgeType === "REQUIREMENT_ALLOCATED_TO_DESIGN",
        );
        expect(allocation).toBeDefined();
        const row = await prisma.requirementDesignLink.findUnique({
          where: { id: allocation!.relationshipId },
        });
        expect(row).not.toBeNull();
      });

      it("reports an unmonitored assumption as indeterminate", async () => {
        const report = await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "SYSTEM_DEFINITION",
        });

        const finding = report.findings.find((f) => f.ruleId === "TR-ASM-004");
        expect(finding?.status).toBe("UNKNOWN");
        expect(report.assessment.status).toBe("UNKNOWN");
      });

      it("blocks the release gate on verification that has not concluded", async () => {
        const report = await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "RELEASE_READY",
        });

        expect(report.findings.find((f) => f.ruleId === "TR-VER-006")?.status).toBe("BLOCKING");
        expect(report.assessment.status).toBe("NOT_READY");
      });

      it("does not modify any source artifact", async () => {
        const before = await prisma.requirement.findUniqueOrThrow({
          where: { id: ids.requirement },
        });
        const assumptionBefore = await prisma.decisionAssumption.findUniqueOrThrow({
          where: { id: ids.assumption },
        });

        await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "RELEASE_READY",
        });

        const after = await prisma.requirement.findUniqueOrThrow({
          where: { id: ids.requirement },
        });
        const assumptionAfter = await prisma.decisionAssumption.findUniqueOrThrow({
          where: { id: ids.assumption },
        });
        expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
        expect(assumptionAfter.status).toBe(assumptionBefore.status);
        expect(assumptionAfter.updatedAt.getTime()).toBe(assumptionBefore.updatedAt.getTime());
      });
    });

    // --- Consuming the other engines ----------------------------------------

    describe("consuming verification readiness", () => {
      it("blocks the verification gate when no readiness assessment exists", async () => {
        const report = await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "VERIFICATION_READY",
        });

        const finding = report.findings.find((f) => f.ruleId === "TR-VER-001");
        expect(finding?.status).toBe("BLOCKING");
        expect(finding?.subjectId).toBe(ids.verification);
        expect(report.scope.consumed.verificationReadiness[0]?.assessmentId).toBeNull();
      });

      it("consumes a real verification-readiness verdict once one exists", async () => {
        const vr = await verification.evaluateVerificationReadiness(
          context,
          tenant.projectId,
          ids.verification,
        );

        const report = await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "VERIFICATION_READY",
        });

        const consumed = report.scope.consumed.verificationReadiness[0];
        expect(consumed?.assessmentId).toBe(vr.assessment.id);
        expect(consumed?.status).toBe(vr.assessment.status);
        expect(consumed?.freshness).toBe("CURRENT");
        // It cites the other engine's verdict rather than restating its rules.
        expect(report.findings.some((f) => f.ruleId.startsWith("VR-"))).toBe(false);
      });

      it("never presents a stale verification-readiness verdict as current", async () => {
        // Touching the activity moves its readiness basis, which is what makes
        // that engine's assessment stale.
        await prisma.verificationActivity.update({
          where: { id: ids.verification },
          data: { description: "Revised after the readiness assessment was taken." },
        });

        const report = await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "VERIFICATION_READY",
        });

        expect(report.scope.consumed.verificationReadiness[0]?.freshness).toBe("STALE");
        expect(report.findings.find((f) => f.ruleId === "TR-VER-002")?.status).toBe("UNKNOWN");
      });
    });

    describe("consuming change impact", () => {
      it("reports an un-analysed change as indeterminate at a late gate", async () => {
        const report = await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "DESIGN_FREEZE",
        });

        const finding = report.findings.find((f) => f.ruleId === "TR-CHG-001");
        expect(finding?.status).toBe("UNKNOWN");
        expect(finding?.subjectId).toBe(ids.changeRequest);
        expect(report.scope.consumed.changeImpact[0]?.analysisFreshness).toBe("NOT_RUN");
      });

      it("reads a real impact analysis and judges what it reaches", async () => {
        await prisma.changeRequestImpact.create({
          data: {
            changeRequestId: ids.changeRequest,
            requirementId: ids.requirement,
            note: "The limit is stated here.",
            createdById: tenant.userId,
          },
        });
        await prisma.changeRequest.update({
          where: { id: ids.changeRequest },
          data: { status: "UNDER_REVIEW" },
        });

        const impactService = new modules!.impact.ChangeImpactAnalysisService(
          new modules!.graph.EngineeringGraphService(
            new modules!.graphRepo.EngineeringGraphRepository(prisma),
          ),
        );
        await impactService.runImpactAnalysis(context, tenant.projectId, ids.changeRequest);

        const report = await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "DESIGN_FREEZE",
        });

        const consumed = report.scope.consumed.changeImpact[0];
        expect(consumed?.analysisFreshness).toBe("CURRENT");
        expect(consumed?.reachedScopeKeys).toContain(`REQUIREMENT:${ids.requirement}`);
        expect(report.findings.find((f) => f.ruleId === "TR-CHG-005")?.status).toBe("BLOCKING");
      });

      it("never presents a stale impact analysis as current", async () => {
        // An unrelated edit moves the project-wide fingerprint the impact engine
        // uses, which is exactly what makes its analysis stale.
        await prisma.risk.update({
          where: { id: ids.risk },
          data: { description: "Debris could block a channel (revised)." },
        });

        const report = await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "DESIGN_FREEZE",
        });

        expect(report.scope.consumed.changeImpact[0]?.analysisFreshness).toBe("STALE");
        expect(report.findings.find((f) => f.ruleId === "TR-CHG-003")?.status).toBe("UNKNOWN");
      });
    });

    describe("consuming assumption monitoring", () => {
      it("blocks a late gate when monitoring says an assumption needs review", async () => {
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

        const report = await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "DESIGN_FREEZE",
        });

        expect(report.findings.find((f) => f.ruleId === "TR-ASM-001")?.status).toBe("BLOCKING");
        expect(report.scope.consumed.assumptionMonitoring[0]).toMatchObject({
          assumptionId: ids.assumption,
          monitoringStatus: "REVIEW_REQUIRED",
          assumptionStatus: "VALIDATED",
        });

        // Consumed, never written: the assumption's own status is untouched.
        const assumption = await prisma.decisionAssumption.findUniqueOrThrow({
          where: { id: ids.assumption },
        });
        expect(assumption.status).toBe("VALIDATED");
      });

      it("only warns about the same verdict at an early gate", async () => {
        const report = await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "DESIGN_REVIEW",
        });

        expect(report.findings.find((f) => f.ruleId === "TR-ASM-002")?.status).toBe("WARNING");
        expect(report.findings.find((f) => f.ruleId === "TR-ASM-001")).toBeUndefined();
      });
    });

    // --- Freshness and immutability -----------------------------------------

    describe("freshness against the real state", () => {
      it("is current immediately after an evaluation", async () => {
        await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "SYSTEM_DEFINITION",
        });

        const latest = await service.getLatestTechnicalReadiness(
          context,
          tenant.projectId,
          "SYSTEM_DEFINITION",
        );
        if (!hasTechnicalReadiness(latest)) throw new Error("expected an assessment");
        expect(latest.freshness).toBe("CURRENT");
      });

      it("goes stale when a scope object actually changes", async () => {
        await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "SYSTEM_DEFINITION",
        });

        await prisma.designItem.update({
          where: { id: ids.designItem },
          data: { status: "APPROVED" },
        });

        const latest = await service.getLatestTechnicalReadiness(
          context,
          tenant.projectId,
          "SYSTEM_DEFINITION",
        );
        if (!hasTechnicalReadiness(latest)) throw new Error("expected an assessment");
        expect(latest.freshness).toBe("STALE");
      });

      it("gives two gates different fingerprints over the same project", async () => {
        const review = await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "DESIGN_REVIEW",
        });
        const freeze = await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "DESIGN_FREEZE",
        });

        expect(freeze.assessment.fingerprint).not.toBe(review.assessment.fingerprint);
      });

      it("reaches an equivalent conclusion on a repeated evaluation", async () => {
        const first = await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "SYSTEM_DEFINITION",
        });
        const second = await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "SYSTEM_DEFINITION",
        });

        expect(technicalReadinessSignature(second)).toBe(technicalReadinessSignature(first));
        expect(second.assessment.fingerprint).toBe(first.assessment.fingerprint);
        expect(second.assessment.id).not.toBe(first.assessment.id);
      });

      it("leaves a historical assessment exactly as it was written", async () => {
        const first = await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "SYSTEM_DEFINITION",
        });

        await prisma.requirement.update({
          where: { id: ids.requirement },
          data: { status: "DRAFT" },
        });
        const second = await service.evaluateTechnicalReadiness(context, tenant.projectId, {
          gate: "SYSTEM_DEFINITION",
        });
        expect(second.assessment.status).toBe("NOT_READY");

        const historical = await service.explainTechnicalReadiness(
          context,
          tenant.projectId,
          first.assessment.id,
        );
        expect(historical.assessment.status).toBe(first.assessment.status);
        expect(historical.assessment.fingerprint).toBe(first.assessment.fingerprint);
        expect(technicalReadinessSignature(historical)).toBe(
          technicalReadinessSignature(first),
        );
        expect(historical.freshness).toBe("STALE");

        // Put the requirement back for anything that runs after this.
        await prisma.requirement.update({
          where: { id: ids.requirement },
          data: { status: "BASELINED" },
        });
      });
    });

    // --- Cascades -----------------------------------------------------------

    describe("cascade behaviour", () => {
      it("removes the assessments when the project is deleted", async () => {
        const disposable = await createTestTenant("technical-readiness-cascade");
        try {
          const report = await service.evaluateTechnicalReadiness(
            { organizationId: disposable.organizationId, actorId: disposable.userId },
            disposable.projectId,
            { gate: "SYSTEM_DEFINITION" },
          );

          await prisma.project.delete({ where: { id: disposable.projectId } });

          expect(
            await prisma.technicalReadinessAssessment.count({
              where: { id: report.assessment.id },
            }),
          ).toBe(0);
          // And the findings go with it.
          expect(
            await prisma.technicalReadinessFinding.count({
              where: { assessmentId: report.assessment.id },
            }),
          ).toBe(0);
        } finally {
          await destroyTestTenant(disposable);
        }
      });

      it("keeps the assessment when the evaluator is removed", async () => {
        const evaluator = await prisma.user.create({
          data: {
            email: `gate-evaluator-${Date.now()}@test.invalid`,
            name: "Temporary Evaluator",
            organizationId: tenant.organizationId,
          },
        });

        const report = await service.evaluateTechnicalReadiness(
          { organizationId: tenant.organizationId, actorId: evaluator.id },
          tenant.projectId,
          { gate: "SYSTEM_DEFINITION" },
        );

        await prisma.user.delete({ where: { id: evaluator.id } });

        const stored = await prisma.technicalReadinessAssessment.findUniqueOrThrow({
          where: { id: report.assessment.id },
        });
        // Losing the person must not erase the engineering judgement.
        expect(stored.evaluatedById).toBeNull();
      });
    });
  },
);
