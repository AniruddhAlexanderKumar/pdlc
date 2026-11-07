import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SKIP_REASON,
  type TestTenant,
  createTestTenant,
  databaseAvailable,
  destroyTestTenant,
  disconnectIntegrationPrisma,
  integrationPrisma,
  uniqueSuffix,
} from "./setup";

/**
 * The Engineering Command Center against real PostgreSQL.
 *
 * The unit suite (`project-command-center.service.test.ts`) fakes every
 * sub-service, so it proves the aggregation logic in the abstract. This
 * suite populates a real project through the real services this command
 * center composes — a requirement, a decision with an assumption, a
 * verification activity, a risk, an issue, a supplier chain, a piece of
 * evidence, a certification program/basis/item, a real Sentinel detection,
 * and a change with a completed impact analysis — and proves the command
 * center reads all of it back correctly, in one request, without evaluating
 * or mutating any of it.
 */

const modules = databaseAvailable
  ? {
      commandCenter: await import("@/server/services/project-command-center.service"),
      requirementService: await import("@/server/services/requirement.service"),
      verificationService: await import("@/server/services/verification-activity.service"),
      riskService: await import("@/server/services/risk.service"),
      issueService: await import("@/server/services/issue.service"),
      supplierService: await import("@/server/services/supplier.service"),
      suppliedItemService: await import("@/server/services/supplied-item.service"),
      evidenceService: await import("@/server/services/evidence.service"),
      changeRequestService: await import("@/server/services/change-request.service"),
      changeImpactAnalysisService: (await import("@/server/services/change-impact-analysis.service"))
        .changeImpactAnalysisService,
      technicalReadinessService: (await import("@/server/services/technical-readiness.service"))
        .technicalReadinessService,
      programRepo: await import("@/server/repositories/certification-program.repository"),
      basisRepo: await import("@/server/repositories/certification-basis.repository"),
      complianceItemService: (await import("@/server/services/compliance-item.service")).complianceItemService,
      certificationReviewService: (await import("@/server/services/certification-review.service"))
        .certificationReviewService,
      decisionSentinelService: (await import("@/server/services/decision-sentinel.service"))
        .decisionSentinelService,
      driftDetectionService: (await import("@/server/services/drift-detection.service"))
        .driftDetectionService,
    }
  : null;

describe.skipIf(!databaseAvailable)(`Engineering Command Center against PostgreSQL (${SKIP_REASON})`, () => {
  const prisma = integrationPrisma!;

  let tenant: TestTenant;
  let otherTenant: TestTenant;
  let ctx: { organizationId: string; actorId: string };

  beforeAll(async () => {
    tenant = await createTestTenant("command-center-primary");
    otherTenant = await createTestTenant("command-center-other");
    ctx = { organizationId: tenant.organizationId, actorId: tenant.userId };
  });

  afterAll(async () => {
    if (tenant) await destroyTestTenant(tenant);
    if (otherTenant) await destroyTestTenant(otherTenant);
    await disconnectIntegrationPrisma();
  });

  function identifierFor(label: string): string {
    return uniqueSuffix(label).toUpperCase().replace(/[^A-Z0-9_-]/g, "-").slice(0, 32);
  }

  async function makeDecision(projectId = tenant.projectId) {
    return prisma.engineeringDecision.create({
      data: {
        projectId,
        identifier: identifierFor("ed"),
        title: "Use regenerative cooling",
        statement: "The chamber will be regeneratively cooled.",
        rationale: "Ablative liner mass was prohibitive.",
      },
    });
  }

  describe("empty project", () => {
    it("returns real project fields, empty sections, and no attention items", async () => {
      const solo = await createTestTenant("command-center-empty");
      try {
        const soloCtx = { organizationId: solo.organizationId, actorId: solo.userId };
        const view = await modules!.commandCenter.getCommandCenter(soloCtx, solo.projectId);

        expect(view.project.id).toBe(solo.projectId);
        expect(view.attentionItems).toEqual([]);
        expect(view.risks.open).toBe(0);
        expect(view.issues.open).toBe(0);
        expect(view.readiness.certification.hasProgram).toBe(false);
        expect(view.readiness.assumptions.total).toBe(0);
        expect(view.sentinel.openCount).toBe(0);
        expect(view.readiness.technical).toHaveLength(5);
        expect(view.readiness.technical.every((gate) => gate.status === "NOT_EVALUATED")).toBe(true);
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
          href: `/projects/${solo.projectId}/baselines`,
        });
      } finally {
        await destroyTestTenant(solo);
      }
    });

    it("404s a project outside the caller's organization", async () => {
      await expect(
        modules!.commandCenter.getCommandCenter(
          { organizationId: otherTenant.organizationId, actorId: otherTenant.userId },
          tenant.projectId,
        ),
      ).rejects.toThrow();
    });
  });

  describe("populated project", () => {
    it("aggregates real data from every composed engine correctly", async () => {
      // --- Requirement, decision, assumption, verification -------------------
      const requirement = await modules!.requirementService.createRequirement(ctx, tenant.projectId, {
        identifier: identifierFor("req"),
        title: "Maximum chamber pressure",
        statement: "The engine shall not exceed 120 bar.",
      });
      const decision = await makeDecision();
      await prisma.decisionAssumption.create({
        data: {
          engineeringDecisionId: decision.id,
          statement: "Supplier lead time will not change.",
          status: "VALIDATED",
        },
      });
      const activity = await prisma.verificationActivity.create({
        data: {
          projectId: tenant.projectId,
          identifier: identifierFor("va"),
          title: "Hot fire test",
          method: "TEST",
          status: "FAILED",
        },
      });

      // --- Risk / Issue --------------------------------------------------------
      const risk = await modules!.riskService.createRisk(ctx, tenant.projectId, {
        identifier: identifierFor("rsk"),
        title: "Coolant supply interruption",
        description: "d",
      });
      const issue = await modules!.issueService.createIssue(ctx, tenant.projectId, {
        identifier: identifierFor("iss"),
        title: "Pressure sensor drift",
        description: "d",
        severity: "CRITICAL",
      });

      // --- Supplier chain --------------------------------------------------------
      const supplier = await modules!.supplierService.createSupplier(ctx, tenant.projectId, {
        identifier: identifierFor("sup"),
        name: "Acme Aerostructures",
        status: "UNDER_REVIEW",
      });
      await modules!.suppliedItemService.createSuppliedItem(ctx, tenant.projectId, {
        supplierId: supplier.id,
        identifier: identifierFor("si"),
        name: "Coolant pump",
        itemType: "PART",
        status: "UNDER_REVIEW",
      });

      // --- Evidence ---------------------------------------------------------------
      await modules!.evidenceService.createEvidence(ctx, tenant.projectId, {
        identifier: identifierFor("ev"),
        title: "Hot fire test report",
        evidenceType: "TEST_RESULT",
        sourceReference: "d",
      });

      // --- Certification ---------------------------------------------------------
      const program = await modules!.programRepo.createProgram({
        projectId: tenant.projectId,
        identifier: identifierFor("cert"),
        name: "Propulsion certification effort",
        description: null,
        ownerId: null,
      });
      const draftBasis = await modules!.basisRepo.createBasis({
        certificationProgramId: program.id,
        identifier: identifierFor("cb"),
        title: "Part 33",
        description: null,
        revision: "Amdt 1",
        sourceReference: "14 CFR Part 33",
        createdById: tenant.userId,
      });
      await modules!.basisRepo.activateBasis(draftBasis.id, tenant.userId);
      await modules!.certificationReviewService.evaluateCertificationReview(ctx, tenant.projectId, {});

      // --- Change + impact analysis ------------------------------------------------
      const change = await modules!.changeRequestService.createChangeRequest(ctx, tenant.projectId, {
        identifier: identifierFor("cr"),
        title: "Revise coolant pump mounting",
        description: "d",
        reason: "d",
      });
      await modules!.changeRequestService.transitionChangeRequest(ctx, tenant.projectId, change.id, {
        to: "SUBMITTED",
      });
      await modules!.changeRequestService.addDeclaredImpact(ctx, tenant.projectId, change.id, {
        target: { type: "REQUIREMENT", id: requirement.id },
      });
      await modules!.changeImpactAnalysisService.runImpactAnalysis(ctx, tenant.projectId, change.id);

      // --- Technical readiness (so Sentinel has something real to watch) ----------
      await modules!.technicalReadinessService.evaluateTechnicalReadiness(ctx, tenant.projectId, {
        gate: "RELEASE_READY",
      });

      // --- Configuration baseline: the requirement as a member, then a real edit ---
      const configBaseline = await modules!.driftDetectionService.createBaseline(
        ctx,
        tenant.projectId,
        { identifier: identifierFor("bl"), name: "Preliminary design baseline" },
      );
      await modules!.driftDetectionService.addBaselineMember(ctx, tenant.projectId, configBaseline.id, {
        nodeType: "REQUIREMENT",
        nodeId: requirement.id,
      });
      await modules!.driftDetectionService.activateBaseline(ctx, tenant.projectId, configBaseline.id, {});
      // A real product workflow, not a raw update.
      await modules!.requirementService.updateRequirement(ctx, tenant.projectId, requirement.id, {
        title: "Maximum chamber pressure (revised)",
      });

      // --- A real Sentinel detection over everything above -------------------------
      await modules!.decisionSentinelService.detectProjectChanges(ctx, tenant.projectId);

      // --- Now ask the command center ------------------------------------------------
      const view = await modules!.commandCenter.getCommandCenter(ctx, tenant.projectId);

      expect(view.project.id).toBe(tenant.projectId);

      expect(view.risks.open).toBe(1);
      expect(view.risks.items.map((r) => r.id)).toContain(risk.id);

      expect(view.issues.open).toBe(1);
      expect(view.issues.attentionCount).toBe(1);
      expect(view.issues.items.map((i) => i.id)).toContain(issue.id);

      expect(view.suppliers.suppliersUnderReview.map((s) => s.id)).toContain(supplier.id);
      expect(view.suppliers.suppliedItemsUnderReview.length).toBeGreaterThan(0);

      expect(view.evidence.draftCount).toBeGreaterThan(0);

      expect(view.readiness.certification.hasProgram).toBe(true);
      expect(view.readiness.certification.review).not.toBeNull();

      const releaseReady = view.readiness.technical.find((g) => g.gate === "RELEASE_READY")!;
      expect(releaseReady.status).not.toBe("NOT_EVALUATED");

      const failedActivity = view.readiness.verification.attentionActivities.find(
        (a) => a.id === activity.id,
      );
      expect(failedActivity).toBeDefined();
      expect(failedActivity!.activityStatus).toBe("FAILED");

      const activeChange = view.readiness.changeImpact.activeChanges.find((c) => c.id === change.id);
      expect(activeChange).toBeDefined();
      expect(activeChange!.latestAnalysis.status).toBe("COMPLETED");
      // STALE, correctly: `requirement` is both this change's declared
      // impact target and, below, the configuration baseline's member — the
      // same real updateRequirement() edit that must stale the baseline
      // also genuinely changes the fingerprint runImpactAnalysis captured,
      // by the identical CURRENT/STALE mechanism freshnessOf() uses for
      // both. Honestly reporting that is the feature, not a bug to paper
      // over by asserting CURRENT here.
      expect(activeChange!.latestAnalysis.freshness).toBe("STALE");

      // --- Configuration baseline: a real, live comparison, and a real Sentinel signal ---
      expect(view.configuration).toEqual({
        hasActiveBaseline: true,
        baselineId: configBaseline.id,
        baselineIdentifier: configBaseline.identifier,
        baselineName: "Preliminary design baseline",
        status: "ACTIVE",
        memberCount: 1,
        changedCount: 1,
        missingCount: 0,
        comparisonStatus: "CURRENT",
        href: `/projects/${tenant.projectId}/baselines/${configBaseline.id}`,
      });
      // The Sentinel dependency added for this capability (REQUIREMENT ->
      // DRIFT_ASSESSMENT) actually fired, from the real detection run above.
      expect(
        view.sentinel.targets.some(
          (t) => t.targetType === "DRIFT_ASSESSMENT" && t.targetIdentifier === configBaseline.identifier,
        ),
      ).toBe(true);
      // Not folded into "Attention Required" — configuration divergence has
      // its own section, independent of the Sentinel/drift attention rules.
      expect(
        view.attentionItems.some(
          (item) => item.sourceType === "CONFIGURATION_BASELINE" && item.sourceId === configBaseline.id,
        ),
      ).toBe(false);

      // --- Attention items reflect the same real, authoritative states -----------
      const keys = view.attentionItems.map((item) => item.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(view.attentionItems.some((item) => item.sourceType === "RISK" && item.sourceId === risk.id)).toBe(
        true,
      );
      expect(
        view.attentionItems.some((item) => item.sourceType === "ISSUE" && item.sourceId === issue.id),
      ).toBe(true);
      expect(
        view.attentionItems.some(
          (item) => item.sourceType === "VERIFICATION_ACTIVITY" && item.sourceId === activity.id,
        ),
      ).toBe(true);
      expect(
        view.attentionItems.some((item) => item.sourceType === "SUPPLIER" && item.sourceId === supplier.id),
      ).toBe(true);

      // --- Every attention item's href resolves to something real, and stays in-project ---
      for (const item of view.attentionItems) {
        expect(item.href.startsWith(`/projects/${tenant.projectId}`)).toBe(true);
      }

      // --- Sentinel: real open targets, never triggered by reading the command center again ---
      const beforeSecondRead = await prisma.surveillanceTarget.count({ where: { projectId: tenant.projectId } });
      await modules!.commandCenter.getCommandCenter(ctx, tenant.projectId);
      const afterSecondRead = await prisma.surveillanceTarget.count({ where: { projectId: tenant.projectId } });
      expect(afterSecondRead).toBe(beforeSecondRead);
    });
  });

  describe("negative assertions", () => {
    it("contains no score, probability, heatmap, percentage or composite health field anywhere in the response", async () => {
      const view = await modules!.commandCenter.getCommandCenter(ctx, tenant.projectId);
      const text = JSON.stringify(view);

      expect(text).not.toMatch(
        /riskScore|probability|heatmap|healthScore|overallHealth|compositeScore|readinessPercent|percentage|prediction/i,
      );
    });
  });
});
