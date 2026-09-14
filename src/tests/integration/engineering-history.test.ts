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
 * Engineering History against real PostgreSQL.
 *
 * The unit suite (`engineering-history.service.test.ts`) fakes every
 * repository, so it proves the aggregation logic in the abstract. This
 * suite performs real lifecycle mutations through the real services this
 * capability composes — a requirement transition, a decision transition, a
 * risk transition, an issue transition, evidence validation, a baseline
 * activation, a real certification review, and a real Sentinel detection —
 * and proves `getProjectHistory`/`getObjectHistory` read back exactly the
 * events those real mutations actually wrote, correctly ordered, never
 * mutating anything themselves.
 */

const modules = databaseAvailable
  ? {
      history: await import("@/server/services/engineering-history.service"),
      requirementService: await import("@/server/services/requirement.service"),
      riskService: await import("@/server/services/risk.service"),
      issueService: await import("@/server/services/issue.service"),
      evidenceService: await import("@/server/services/evidence.service"),
      changeRequestService: await import("@/server/services/change-request.service"),
      driftDetectionService: (await import("@/server/services/drift-detection.service"))
        .driftDetectionService,
      programRepo: await import("@/server/repositories/certification-program.repository"),
      basisRepo: await import("@/server/repositories/certification-basis.repository"),
      certificationReviewService: (await import("@/server/services/certification-review.service"))
        .certificationReviewService,
      decisionSentinelService: (await import("@/server/services/decision-sentinel.service"))
        .decisionSentinelService,
    }
  : null;

describe.skipIf(!databaseAvailable)(`Engineering History against PostgreSQL (${SKIP_REASON})`, () => {
  const prisma = integrationPrisma!;

  let tenant: TestTenant;
  let otherTenant: TestTenant;
  let ctx: { organizationId: string; actorId: string };

  beforeAll(async () => {
    tenant = await createTestTenant("history-primary");
    otherTenant = await createTestTenant("history-other");
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

  describe("empty project", () => {
    it("returns an empty, well-formed stream rather than an error", async () => {
      const solo = await createTestTenant("history-empty");
      try {
        const soloCtx = { organizationId: solo.organizationId, actorId: solo.userId };
        const result = await modules!.history.getProjectHistory(soloCtx, solo.projectId);
        expect(result.events).toEqual([]);
        expect(result.page.total).toBe(0);
      } finally {
        await destroyTestTenant(solo);
      }
    });

    it("404s a project outside the caller's organization", async () => {
      await expect(
        modules!.history.getProjectHistory(
          { organizationId: otherTenant.organizationId, actorId: otherTenant.userId },
          tenant.projectId,
        ),
      ).rejects.toThrow();
    });
  });

  describe("a real project's real history", () => {
    it("reflects real lifecycle transitions and real assessment events, in deterministic newest-first order", async () => {
      // --- Requirement: DRAFT -> IN_REVIEW, a real transition -----------------
      const requirement = await modules!.requirementService.createRequirement(ctx, tenant.projectId, {
        identifier: identifierFor("req"),
        title: "Maximum chamber pressure",
        statement: "The engine shall not exceed 120 bar.",
      });
      await modules!.requirementService.transitionRequirementStatus(ctx, tenant.projectId, requirement.id, {
        to: "IN_REVIEW",
      });

      // --- Risk: OPEN -> MITIGATED ---------------------------------------------
      const risk = await modules!.riskService.createRisk(ctx, tenant.projectId, {
        identifier: identifierFor("rsk"),
        title: "Coolant supply interruption",
        description: "d",
      });
      await modules!.riskService.transitionRisk(ctx, tenant.projectId, risk.id, { to: "MITIGATED" });

      // --- Issue: OPEN -> IN_PROGRESS -------------------------------------------
      const issue = await modules!.issueService.createIssue(ctx, tenant.projectId, {
        identifier: identifierFor("iss"),
        title: "Pressure sensor drift",
        description: "d",
        severity: "HIGH",
      });
      await modules!.issueService.transitionIssue(ctx, tenant.projectId, issue.id, { to: "IN_PROGRESS" });

      // --- Evidence: DRAFT -> VALIDATED -----------------------------------------
      const evidence = await modules!.evidenceService.createEvidence(ctx, tenant.projectId, {
        identifier: identifierFor("ev"),
        title: "Hot fire test report",
        evidenceType: "TEST_RESULT",
        sourceReference: "d",
      });
      await modules!.evidenceService.validateEvidence(ctx, tenant.projectId, evidence.id, {});

      // --- Change request: DRAFT -> SUBMITTED -----------------------------------
      const change = await modules!.changeRequestService.createChangeRequest(ctx, tenant.projectId, {
        identifier: identifierFor("cr"),
        title: "Revise coolant pump mounting",
        description: "d",
        reason: "d",
      });
      await modules!.changeRequestService.transitionChangeRequest(ctx, tenant.projectId, change.id, {
        to: "SUBMITTED",
      });

      // --- Baseline: created, a member added, activated -------------------------
      const baseline = await modules!.driftDetectionService.createBaseline(ctx, tenant.projectId, {
        identifier: identifierFor("bl"),
        name: "Preliminary design baseline",
      });
      await modules!.driftDetectionService.addBaselineMember(ctx, tenant.projectId, baseline.id, {
        nodeType: "REQUIREMENT",
        nodeId: requirement.id,
      });
      await modules!.driftDetectionService.activateBaseline(ctx, tenant.projectId, baseline.id, {});

      // --- Certification: program, basis, activated, a real review evaluation ---
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

      // --- A real Sentinel detection over everything above -----------------------
      await modules!.decisionSentinelService.detectProjectChanges(ctx, tenant.projectId);

      // --- Now ask for the project's history ---------------------------------------
      const result = await modules!.history.getProjectHistory(ctx, tenant.projectId, {}, { limit: 200 });

      // Every real mutation above produced a real, findable event.
      expect(result.events.some((e) => e.action === "requirement.status_transitioned" && e.sourceId === requirement.id)).toBe(true);
      expect(result.events.some((e) => e.action === "risk.status_transitioned" && e.sourceId === risk.id)).toBe(true);
      expect(result.events.some((e) => e.action === "issue.status_transitioned" && e.sourceId === issue.id)).toBe(true);
      expect(result.events.some((e) => e.action === "evidence.validated" && e.sourceId === evidence.id)).toBe(true);
      expect(result.events.some((e) => e.action === "change.status_transitioned" && e.sourceId === change.id)).toBe(true);
      expect(result.events.some((e) => e.action === "baseline.created" && e.sourceId === baseline.id)).toBe(true);
      expect(result.events.some((e) => e.action === "baseline.activated" && e.sourceId === baseline.id)).toBe(true);
      expect(result.events.some((e) => e.sourceType === "CERTIFICATION_REVIEW")).toBe(true);
      expect(result.events.some((e) => e.sourceModule === "SENTINEL")).toBe(true);

      // Deterministic newest-first ordering, no invented order.
      for (let i = 1; i < result.events.length; i++) {
        expect(result.events[i - 1]!.timestamp.getTime()).toBeGreaterThanOrEqual(
          result.events[i]!.timestamp.getTime(),
        );
      }

      // No duplicate keys, across every source this composed.
      const keys = result.events.map((e) => e.key);
      expect(new Set(keys).size).toBe(keys.length);

      // Every event's href stays inside this project's own path.
      for (const e of result.events) {
        if (e.href) expect(e.href.startsWith(`/projects/${tenant.projectId}`)).toBe(true);
      }

      // Reading history never writes an audit row of its own.
      const before = await prisma.auditLog.count({ where: { organizationId: tenant.organizationId } });
      await modules!.history.getProjectHistory(ctx, tenant.projectId);
      const after = await prisma.auditLog.count({ where: { organizationId: tenant.organizationId } });
      expect(after).toBe(before);
    });

    it("getObjectHistory returns exactly the real requirement's own transition, never another object's", async () => {
      const requirement = await modules!.requirementService.createRequirement(ctx, tenant.projectId, {
        identifier: identifierFor("req2"),
        title: "Injector face temperature",
        statement: "The injector face shall not exceed 900 K.",
      });
      await modules!.requirementService.transitionRequirementStatus(ctx, tenant.projectId, requirement.id, {
        to: "IN_REVIEW",
      });

      const result = await modules!.history.getObjectHistory(ctx, tenant.projectId, "REQUIREMENT", requirement.id);

      expect(result.object.identifier).toBe(requirement.identifier);
      expect(result.events.every((e) => e.sourceId === requirement.id)).toBe(true);
      expect(result.events.some((e) => e.action === "requirement.status_transitioned")).toBe(true);
    });

    it("404s an object that belongs to another project", async () => {
      // Created through otherTenant's own actor, not `ctx` — tenant's actor
      // has no membership in otherTenant's project (a different
      // organization entirely; createTestTenant never shares one), so
      // createRequirement would 404 that write before "theirs" ever existed
      // to test the read-side isolation this test is actually about.
      const otherCtx = { organizationId: otherTenant.organizationId, actorId: otherTenant.userId };
      const theirs = await modules!.requirementService.createRequirement(otherCtx, otherTenant.projectId, {
        identifier: identifierFor("req3"),
        title: "Their requirement",
        statement: "Not visible from this project.",
      });

      await expect(
        modules!.history.getObjectHistory(ctx, tenant.projectId, "REQUIREMENT", theirs.id),
      ).rejects.toThrow();
    });

    it("keeps project isolation for the whole project-level stream", async () => {
      const otherCtx = { organizationId: otherTenant.organizationId, actorId: otherTenant.userId };
      const theirRequirement = await modules!.requirementService.createRequirement(otherCtx, otherTenant.projectId, {
        identifier: identifierFor("req4"),
        title: "Nozzle throat diameter",
        statement: "d",
      });

      const ours = await modules!.history.getProjectHistory(ctx, tenant.projectId, {}, { limit: 200 });
      expect(ours.events.some((e) => e.sourceId === theirRequirement.id)).toBe(false);
    });
  });

  describe("negative assertions", () => {
    it("contains no score, probability, heatmap, percentage or AI-generated field anywhere", async () => {
      const result = await modules!.history.getProjectHistory(ctx, tenant.projectId, {}, { limit: 200 });
      const text = JSON.stringify(result);
      expect(text).not.toMatch(/score|percent|confidence|probability|heatmap|ai[_-]?generated/i);
    });
  });
});
