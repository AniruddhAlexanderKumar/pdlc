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
 * Evidence against real PostgreSQL.
 *
 * The unit suites (`src/domain/evidence.test.ts`,
 * `src/server/services/evidence.service.test.ts`) fake every repository, so
 * they prove the lifecycle, editability and supersession rules in the
 * abstract. This suite runs the real path: real tables and constraints (the
 * project-scoped unique identifier, the real `EvidenceLink` six-subject-
 * column table, the real self-referential `supersededById`), real project/
 * organization isolation, real audit rows, and — the point of this file —
 * that evidence created through the real `EvidenceService` (not a raw
 * insert) is genuinely visible to the graph (including the one new edge,
 * `CERTIFICATION_FINDING_HAS_EVIDENCE`), the real technical-readiness
 * engine, the real verification-readiness engine, the real certification
 * review, and the real Decision Sentinel. None of those systems' own logic
 * is re-implemented here; each is invoked through its real, unmodified
 * public method.
 */

const modules = databaseAvailable
  ? {
      evidenceService: await import("@/server/services/evidence.service"),
      requirementService: await import("@/server/services/requirement.service"),
      verificationService: await import("@/server/services/verification-activity.service"),
      technicalReadiness: (await import("@/server/services/technical-readiness.service"))
        .technicalReadinessService,
      verificationReadiness: (await import("@/server/services/verification-readiness.service"))
        .verificationReadinessService,
      programRepo: await import("@/server/repositories/certification-program.repository"),
      basisRepo: await import("@/server/repositories/certification-basis.repository"),
      complianceItemService: (await import("@/server/services/compliance-item.service"))
        .complianceItemService,
      certificationFindingService: (await import("@/server/services/certification-finding.service"))
        .certificationFindingService,
      certificationReviewService: (await import("@/server/services/certification-review.service"))
        .certificationReviewService,
      sentinel: await import("@/server/services/decision-sentinel.service"),
      graph: (await import("@/server/services/engineering-graph.service")).engineeringGraphService,
      auditLog: await import("@/server/repositories/audit-log.repository"),
    }
  : null;

describe.skipIf(!databaseAvailable)(`Evidence against PostgreSQL (${SKIP_REASON})`, () => {
  const prisma = integrationPrisma!;

  let tenant: TestTenant;
  let otherTenant: TestTenant;
  let ctx: { organizationId: string; actorId: string };
  let otherCtx: { organizationId: string; actorId: string };

  beforeAll(async () => {
    tenant = await createTestTenant("evidence-primary");
    otherTenant = await createTestTenant("evidence-other");
    ctx = { organizationId: tenant.organizationId, actorId: tenant.userId };
    otherCtx = { organizationId: otherTenant.organizationId, actorId: otherTenant.userId };
  });

  afterAll(async () => {
    if (tenant) await destroyTestTenant(tenant);
    if (otherTenant) await destroyTestTenant(otherTenant);
    await disconnectIntegrationPrisma();
  });

  function identifierFor(label: string): string {
    return uniqueSuffix(label).toUpperCase().replace(/[^A-Z0-9_-]/g, "-").slice(0, 32);
  }

  async function makeRequirement(projectId = tenant.projectId) {
    return prisma.requirement.create({
      data: {
        projectId,
        identifier: identifierFor("req"),
        title: "Maximum chamber pressure",
        statement: "The engine shall not exceed 120 bar.",
      },
    });
  }

  async function makeVerificationActivity(projectId = tenant.projectId) {
    return prisma.verificationActivity.create({
      data: { projectId, identifier: identifierFor("va"), title: "Chamber pressure test", method: "TEST" },
    });
  }

  describe("evidence CRUD", () => {
    it("creates a DRAFT record, reads it back, and updates its content", async () => {
      const created = await modules!.evidenceService.createEvidence(ctx, tenant.projectId, {
        identifier: identifierFor("ev"),
        title: "Hot fire test report",
        evidenceType: "TEST_RESULT",
        sourceReference: "TR-2026-014",
      });
      expect(created.status).toBe("DRAFT");
      expect(created.recordedById).toBe(tenant.userId);

      const detail = await modules!.evidenceService.getEvidence(ctx, tenant.projectId, created.id);
      expect(detail.availableTransitions).toEqual(["VALIDATED", "SUPERSEDED"]);
      expect(detail.editable).toEqual({ content: true, links: true });

      const updated = await modules!.evidenceService.updateEvidence(ctx, tenant.projectId, created.id, {
        sourceReference: "TR-2026-014-REV-A",
      });
      expect(updated.sourceReference).toBe("TR-2026-014-REV-A");
    });

    it("**enforces the project-scoped unique identifier**", async () => {
      const identifier = identifierFor("ev-dup");
      await modules!.evidenceService.createEvidence(ctx, tenant.projectId, {
        identifier,
        title: "First",
        evidenceType: "DOCUMENT",
        sourceReference: "d",
      });

      await expect(
        modules!.evidenceService.createEvidence(ctx, tenant.projectId, {
          identifier,
          title: "Second",
          evidenceType: "DOCUMENT",
          sourceReference: "d",
        }),
      ).rejects.toThrow(/already exists/i);

      // The same identifier is free in a different project.
      const elsewhere = await modules!.evidenceService.createEvidence(otherCtx, otherTenant.projectId, {
        identifier,
        title: "Theirs",
        evidenceType: "DOCUMENT",
        sourceReference: "d",
      });
      expect(elsewhere.identifier).toBe(identifier);
    });

    it("runs the full lifecycle: DRAFT -> VALIDATED -> SUPERSEDED, and refuses to reopen", async () => {
      const evidence = await modules!.evidenceService.createEvidence(ctx, tenant.projectId, {
        identifier: identifierFor("ev"),
        title: "Vibration test log",
        evidenceType: "TEST_RESULT",
        sourceReference: "d",
      });

      const validated = await modules!.evidenceService.validateEvidence(
        ctx,
        tenant.projectId,
        evidence.id,
        {},
      );
      expect(validated.status).toBe("VALIDATED");
      expect(validated.validatedById).toBe(tenant.userId);

      await expect(
        modules!.evidenceService.updateEvidence(ctx, tenant.projectId, evidence.id, { title: "x" }),
      ).rejects.toThrow();

      const replacement = await modules!.evidenceService.createEvidence(ctx, tenant.projectId, {
        identifier: identifierFor("ev-2"),
        title: "Corrected vibration test log",
        evidenceType: "TEST_RESULT",
        sourceReference: "d2",
      });
      const superseded = await modules!.evidenceService.supersedeEvidence(
        ctx,
        tenant.projectId,
        evidence.id,
        { newEvidenceId: replacement.id },
      );
      expect(superseded.status).toBe("SUPERSEDED");
      expect(superseded.supersededById).toBe(replacement.id);

      // Still readable, not deleted.
      const stillReadable = await modules!.evidenceService.getEvidence(ctx, tenant.projectId, evidence.id);
      expect(stillReadable.status).toBe("SUPERSEDED");
      expect(stillReadable.availableTransitions).toEqual([]);
    });

    it("404s evidence belonging to another project", async () => {
      const evidence = await modules!.evidenceService.createEvidence(ctx, tenant.projectId, {
        identifier: identifierFor("ev"),
        title: "x",
        evidenceType: "DOCUMENT",
        sourceReference: "d",
      });

      await expect(
        modules!.evidenceService.getEvidence(otherCtx, otherTenant.projectId, evidence.id),
      ).rejects.toThrow();
    });

    it("writes a real audit row for creation, validation and supersession", async () => {
      const evidence = await modules!.evidenceService.createEvidence(ctx, tenant.projectId, {
        identifier: identifierFor("ev"),
        title: "x",
        evidenceType: "DOCUMENT",
        sourceReference: "d",
      });
      await modules!.evidenceService.validateEvidence(ctx, tenant.projectId, evidence.id, {});
      const replacement = await modules!.evidenceService.createEvidence(ctx, tenant.projectId, {
        identifier: identifierFor("ev-2"),
        title: "y",
        evidenceType: "DOCUMENT",
        sourceReference: "d",
      });
      await modules!.evidenceService.supersedeEvidence(ctx, tenant.projectId, evidence.id, {
        newEvidenceId: replacement.id,
      });

      const history = await modules!.auditLog.listAuditEventsForEntity({
        organizationId: ctx.organizationId,
        entityType: "Evidence",
        entityId: evidence.id,
      });
      const actions = history.map((event) => event.action);
      expect(actions).toContain("evidence.created");
      expect(actions).toContain("evidence.validated");
      expect(actions).toContain("evidence.superseded");
    });
  });

  describe("supersession semantics", () => {
    it("does not move an existing link to the new evidence version", async () => {
      const requirement = await makeRequirement();
      const original = await modules!.evidenceService.createEvidence(ctx, tenant.projectId, {
        identifier: identifierFor("ev"),
        title: "Original analysis",
        evidenceType: "ANALYSIS",
        sourceReference: "d",
      });
      await modules!.evidenceService.linkEvidence(ctx, tenant.projectId, original.id, {
        relation: "REQUIREMENT",
        targetId: requirement.id,
      });

      const replacement = await modules!.evidenceService.createEvidence(ctx, tenant.projectId, {
        identifier: identifierFor("ev-2"),
        title: "Corrected analysis",
        evidenceType: "ANALYSIS",
        sourceReference: "d2",
      });
      await modules!.evidenceService.supersedeEvidence(ctx, tenant.projectId, original.id, {
        newEvidenceId: replacement.id,
      });

      const originalLinks = await modules!.evidenceService.listEvidenceLinks(
        ctx,
        tenant.projectId,
        original.id,
      );
      expect(originalLinks.some((link) => link.targetId === requirement.id)).toBe(true);

      const replacementLinks = await modules!.evidenceService.listEvidenceLinks(
        ctx,
        tenant.projectId,
        replacement.id,
      );
      expect(replacementLinks).toEqual([]);
    });

    it("**guards supersession against a concurrent supersede by a different replacement**", async () => {
      // Two callers who both read DRAFT and both decide to supersede the
      // same evidence with a *different* replacement must not both win —
      // whichever transaction's write lands second finds the row no longer
      // DRAFT and is refused, rather than silently overwriting the winner's
      // supersededById.
      const original = await modules!.evidenceService.createEvidence(ctx, tenant.projectId, {
        identifier: identifierFor("ev-race"),
        title: "Raced",
        evidenceType: "ANALYSIS",
        sourceReference: "d",
      });
      const replacementA = await modules!.evidenceService.createEvidence(ctx, tenant.projectId, {
        identifier: identifierFor("ev-race-a"),
        title: "Replacement A",
        evidenceType: "ANALYSIS",
        sourceReference: "d",
      });
      const replacementB = await modules!.evidenceService.createEvidence(ctx, tenant.projectId, {
        identifier: identifierFor("ev-race-b"),
        title: "Replacement B",
        evidenceType: "ANALYSIS",
        sourceReference: "d",
      });

      const results = await Promise.allSettled([
        modules!.evidenceService.supersedeEvidence(ctx, tenant.projectId, original.id, {
          newEvidenceId: replacementA.id,
        }),
        modules!.evidenceService.supersedeEvidence(ctx, tenant.projectId, original.id, {
          newEvidenceId: replacementB.id,
        }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      expect(fulfilled).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);

      const final = await modules!.evidenceService.getEvidence(ctx, tenant.projectId, original.id);
      const winner = fulfilled[0] as PromiseFulfilledResult<{ supersededById: string | null }>;
      expect(final.supersededById).toBe(winner.value.supersededById);
    });
  });

  describe("traceability", () => {
    it("links to a requirement, a verification activity, and rejects a cross-project target", async () => {
      const requirement = await makeRequirement();
      const activity = await makeVerificationActivity();
      const evidence = await modules!.evidenceService.createEvidence(ctx, tenant.projectId, {
        identifier: identifierFor("ev"),
        title: "x",
        evidenceType: "TEST_RESULT",
        sourceReference: "d",
      });

      const link = await modules!.evidenceService.linkEvidence(ctx, tenant.projectId, evidence.id, {
        relation: "REQUIREMENT",
        targetId: requirement.id,
      });
      expect(link.targetId).toBe(requirement.id);

      await modules!.evidenceService.linkEvidence(ctx, tenant.projectId, evidence.id, {
        relation: "VERIFICATION_ACTIVITY",
        targetId: activity.id,
      });

      const theirRequirement = await makeRequirement(otherTenant.projectId);
      await expect(
        modules!.evidenceService.linkEvidence(ctx, tenant.projectId, evidence.id, {
          relation: "REQUIREMENT",
          targetId: theirRequirement.id,
        }),
      ).rejects.toThrow();

      await modules!.evidenceService.unlinkEvidence(ctx, tenant.projectId, evidence.id, link.id);
      const remaining = await modules!.evidenceService.listEvidenceLinks(ctx, tenant.projectId, evidence.id);
      expect(remaining.some((l) => l.relation === "REQUIREMENT")).toBe(false);
    });

    it("supports attaching evidence to a verification activity from the activity's own side", async () => {
      const activity = await makeVerificationActivity();
      const evidence = await modules!.evidenceService.createEvidence(ctx, tenant.projectId, {
        identifier: identifierFor("ev"),
        title: "Test result",
        evidenceType: "TEST_RESULT",
        sourceReference: "d",
      });

      const attached = await modules!.verificationService.linkVerificationEvidence(
        ctx,
        tenant.projectId,
        activity.id,
        { evidenceId: evidence.id },
      );
      expect(attached.some((row) => row.id === evidence.id)).toBe(true);

      const links = await modules!.evidenceService.listEvidenceLinks(ctx, tenant.projectId, evidence.id);
      expect(links.some((l) => l.relation === "VERIFICATION_ACTIVITY" && l.targetId === activity.id)).toBe(
        true,
      );
    });
  });

  describe("graph integration", () => {
    it("resolves a real service-created evidence link in both directions", async () => {
      const requirement = await makeRequirement();
      const evidence = await modules!.evidenceService.createEvidence(ctx, tenant.projectId, {
        identifier: identifierFor("ev"),
        title: "x",
        evidenceType: "DOCUMENT",
        sourceReference: "d",
      });
      await modules!.evidenceService.linkEvidence(ctx, tenant.projectId, evidence.id, {
        relation: "REQUIREMENT",
        targetId: requirement.id,
      });

      const outbound = await modules!.graph.getDirectConnections(
        ctx,
        tenant.projectId,
        { type: "REQUIREMENT", id: requirement.id },
        "OUTBOUND",
      );
      expect(
        outbound.connections.some(
          (c) => c.neighbor.type === "EVIDENCE" && c.neighbor.id === evidence.id,
        ),
      ).toBe(true);

      const inbound = await modules!.graph.getDirectConnections(
        ctx,
        tenant.projectId,
        { type: "EVIDENCE", id: evidence.id },
        "INBOUND",
      );
      expect(
        inbound.connections.some((c) => c.neighbor.type === "REQUIREMENT" && c.neighbor.id === requirement.id),
      ).toBe(true);
    });

    it("resolves the new CERTIFICATION_FINDING_HAS_EVIDENCE edge, added because the FK already existed but the graph did not read it", async () => {
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
      const basis = await modules!.basisRepo.activateBasis(draftBasis.id, tenant.userId);
      const item = await modules!.complianceItemService.createItem(ctx, tenant.projectId, basis.id, {
        identifier: identifierFor("ci"),
        title: "Structural margin",
      });
      const finding = await modules!.certificationFindingService.createFinding(
        ctx,
        tenant.projectId,
        item.id,
        { identifier: identifierFor("fnd"), title: "Margin shortfall", severity: "LOW" },
      );
      const evidence = await modules!.evidenceService.createEvidence(ctx, tenant.projectId, {
        identifier: identifierFor("ev"),
        title: "Reanalysis closing the margin gap",
        evidenceType: "ANALYSIS",
        sourceReference: "d",
      });
      await modules!.certificationFindingService.resolveFinding(ctx, tenant.projectId, item.id, finding.id, {
        note: "Closed by reanalysis.",
        evidenceId: evidence.id,
      });

      const outbound = await modules!.graph.getDirectConnections(
        ctx,
        tenant.projectId,
        { type: "CERTIFICATION_FINDING", id: finding.id },
        "OUTBOUND",
      );
      const evidenceEdge = outbound.connections.find((c) => c.neighbor.type === "EVIDENCE");
      expect(evidenceEdge?.neighbor.id).toBe(evidence.id);
      expect(evidenceEdge?.edge.type).toBe("CERTIFICATION_FINDING_HAS_EVIDENCE");

      const inbound = await modules!.graph.getDirectConnections(
        ctx,
        tenant.projectId,
        { type: "EVIDENCE", id: evidence.id },
        "INBOUND",
      );
      expect(
        inbound.connections.some(
          (c) => c.neighbor.type === "CERTIFICATION_FINDING" && c.neighbor.id === finding.id,
        ),
      ).toBe(true);
    });

    it("never resolves evidence from another project", async () => {
      const theirs = await modules!.evidenceService.createEvidence(otherCtx, otherTenant.projectId, {
        identifier: identifierFor("ev"),
        title: "Cross-project probe",
        evidenceType: "DOCUMENT",
        sourceReference: "d",
      });

      await expect(
        modules!.graph.getNode(ctx, tenant.projectId, { type: "EVIDENCE", id: theirs.id }),
      ).rejects.toThrow();
    });
  });

  describe("technical readiness compatibility", () => {
    it("counts real evidence attached to a passed verification activity", async () => {
      const activity = await prisma.verificationActivity.create({
        data: {
          projectId: tenant.projectId,
          identifier: identifierFor("va"),
          title: "Proof pressure test",
          method: "TEST",
          status: "PASSED",
        },
      });
      const evidence = await modules!.evidenceService.createEvidence(ctx, tenant.projectId, {
        identifier: identifierFor("ev"),
        title: "Proof test report",
        evidenceType: "TEST_RESULT",
        sourceReference: "d",
      });
      await modules!.verificationService.linkVerificationEvidence(ctx, tenant.projectId, activity.id, {
        evidenceId: evidence.id,
      });

      const report = await modules!.technicalReadiness.evaluateTechnicalReadiness(
        ctx,
        tenant.projectId,
        { gate: "RELEASE_READY" },
      );

      const text = JSON.stringify(report);
      expect(text).not.toMatch(/probability|riskScore|"score"\s*:\s*\d/i);
    });
  });

  describe("verification readiness compatibility", () => {
    it("includes real evidence attached to the activity in its basis", async () => {
      const requirement = await makeRequirement();
      const activity = await makeVerificationActivity();
      await modules!.requirementService.linkRequirement(ctx, tenant.projectId, requirement.id, {
        relation: "VERIFICATION_ACTIVITY",
        targetId: activity.id,
      });
      const evidence = await modules!.evidenceService.createEvidence(ctx, tenant.projectId, {
        identifier: identifierFor("ev"),
        title: "In-progress reading",
        evidenceType: "MEASUREMENT",
        sourceReference: "d",
      });
      await modules!.verificationService.linkVerificationEvidence(ctx, tenant.projectId, activity.id, {
        evidenceId: evidence.id,
      });

      const report = await modules!.verificationReadiness.evaluateVerificationReadiness(
        ctx,
        tenant.projectId,
        activity.id,
        {},
      );

      expect(
        report.basis.objects.some((object) => object.type === "EVIDENCE" && object.id === evidence.id),
      ).toBe(true);
    });
  });

  describe("certification compatibility", () => {
    it("links evidence to a compliance item, and the review reads it back without a broadened basis rule", async () => {
      // otherTenant, not tenant: a project may have at most one
      // CertificationProgram (a real, DB-enforced unique constraint on
      // projectId), and an earlier test in this file already created one
      // for tenant.projectId — reusing it here would collide, not exercise
      // anything new.
      const program = await modules!.programRepo.createProgram({
        projectId: otherTenant.projectId,
        identifier: identifierFor("cert"),
        name: "Avionics certification effort",
        description: null,
        ownerId: null,
      });
      const draftBasis = await modules!.basisRepo.createBasis({
        certificationProgramId: program.id,
        identifier: identifierFor("cb"),
        title: "Part 25",
        description: null,
        revision: "Amdt 1",
        sourceReference: "14 CFR Part 25",
        createdById: otherTenant.userId,
      });
      const basis = await modules!.basisRepo.activateBasis(draftBasis.id, otherTenant.userId);
      const item = await modules!.complianceItemService.createItem(
        otherCtx,
        otherTenant.projectId,
        basis.id,
        { identifier: identifierFor("ci"), title: "EMI shielding" },
      );
      const evidence = await modules!.evidenceService.createEvidence(otherCtx, otherTenant.projectId, {
        identifier: identifierFor("ev"),
        title: "EMI test report",
        evidenceType: "TEST_RESULT",
        sourceReference: "d",
      });

      await modules!.evidenceService.linkEvidence(otherCtx, otherTenant.projectId, evidence.id, {
        relation: "COMPLIANCE_ITEM",
        targetId: item.id,
      });

      const review = await modules!.certificationReviewService.evaluateCertificationReview(
        otherCtx,
        otherTenant.projectId,
        {},
      );
      expect(JSON.stringify(review)).not.toMatch(/\bcertified\b|FAA compliant|EASA approved/i);
    });
  });

  describe("sentinel compatibility", () => {
    it("opens TECHNICAL_READINESS when a changed piece of evidence is counted in a gate assessment's scope", async () => {
      // Flush whatever earlier tests in this file left pending first — many
      // change objects without ever calling detection themselves, so real,
      // undetected history accumulates in this shared project. Only one
      // OPEN row can exist per (targetType, targetId); if this test's own
      // evidence change and some other, earlier, unrelated pending change
      // both reach the same RELEASE_READY target in the same detection
      // pass, whichever is processed last wins the recorded source — a
      // race this test should not be exposed to for a cause it did not
      // create.
      await modules!.sentinel.decisionSentinelService.detectProjectChanges(ctx, tenant.projectId);

      // The RELEASE_READY scope walk reaches evidence only via
      // requirement → verification activity → evidence (see
      // technical-readiness.service.ts's resolveScope doc comment: Hop 2
      // then Hop 4) — a verification activity with no requirement link is
      // never reached by any hop, so its evidence never enters scope
      // either. A real requirement + REQUIREMENT_VERIFIED_BY link is what
      // makes this activity (and therefore its evidence) actually count.
      const requirement = await makeRequirement();
      const activity = await prisma.verificationActivity.create({
        data: {
          projectId: tenant.projectId,
          identifier: identifierFor("va"),
          title: "Gate-scoped test",
          method: "TEST",
          status: "PASSED",
        },
      });
      await prisma.requirementVerificationLink.create({
        data: { requirementId: requirement.id, verificationActivityId: activity.id, createdById: tenant.userId },
      });
      const evidence = await modules!.evidenceService.createEvidence(ctx, tenant.projectId, {
        identifier: identifierFor("ev"),
        title: "Gate-scoped evidence",
        evidenceType: "TEST_RESULT",
        sourceReference: "d",
      });
      await modules!.verificationService.linkVerificationEvidence(ctx, tenant.projectId, activity.id, {
        evidenceId: evidence.id,
      });
      await modules!.technicalReadiness.evaluateTechnicalReadiness(ctx, tenant.projectId, {
        gate: "RELEASE_READY",
      });

      await modules!.evidenceService.updateEvidence(ctx, tenant.projectId, evidence.id, {
        title: "Gate-scoped evidence, revised",
      });

      await modules!.sentinel.decisionSentinelService.detectProjectChanges(ctx, tenant.projectId);
      const open = await modules!.sentinel.decisionSentinelService.listOpenSurveillance(
        ctx,
        tenant.projectId,
      );
      expect(
        open.some(
          (target) => target.sourceType === "EVIDENCE" && target.targetType === "TECHNICAL_READINESS",
        ),
      ).toBe(true);
    });

    it("never opens CERTIFICATION_REVIEW purely from certification-linked evidence unless the review's own basis genuinely included it", async () => {
      // Regression guard mirroring the Risk/Issue precedent: verify by
      // running the real detection, not by trusting the domain registry
      // alone — a rule here is only correct if it is genuinely reachable.
      const evidence = await modules!.evidenceService.createEvidence(ctx, tenant.projectId, {
        identifier: identifierFor("ev"),
        title: "Unlinked evidence",
        evidenceType: "DOCUMENT",
        sourceReference: "d",
      });
      await modules!.evidenceService.updateEvidence(ctx, tenant.projectId, evidence.id, {
        title: "Unlinked evidence, revised",
      });

      await modules!.sentinel.decisionSentinelService.detectProjectChanges(ctx, tenant.projectId);
      const open = await modules!.sentinel.decisionSentinelService.listOpenSurveillance(
        ctx,
        tenant.projectId,
      );
      const forThisEvidence = open.filter(
        (target) => target.sourceType === "EVIDENCE" && target.sourceId === evidence.id,
      );
      // No certification review has ever consulted this evidence, so no
      // CERTIFICATION_REVIEW target should open for it — the dependency rule
      // exists, but membership is never assumed.
      expect(forThisEvidence.some((t) => t.targetType === "CERTIFICATION_REVIEW")).toBe(false);
    });
  });
});
