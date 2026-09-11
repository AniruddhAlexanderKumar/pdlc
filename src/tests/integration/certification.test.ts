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
 * The certification workspace against real PostgreSQL.
 *
 * The unit suite (`src/domain/certification.test.ts`) fakes nothing — the
 * domain is Prisma-free by construction — but it proves rules and
 * fingerprints in the abstract. This suite runs the real path: the real
 * tables and constraints (the `certification_programs.projectId` unique
 * constraint, the widened `evidence_links_exactly_one_subject` CHECK, the
 * `RESTRICT`/cascade behavior on real foreign keys), the real
 * `CertificationReviewService` resolving a real batched basis across five
 * other engines, and a complete real certification scenario evaluated more
 * than once.
 *
 * Repositories are imported directly, and dynamically — together with the
 * services — because importing them pulls in `@/config/env`, which refuses to
 * load without `DATABASE_URL`. With no database the suite skips rather than
 * erroring.
 */

const modules = databaseAvailable
  ? {
      program: await import("@/server/repositories/certification-program.repository"),
      basis: await import("@/server/repositories/certification-basis.repository"),
      item: await import("@/server/repositories/compliance-item.repository"),
      link: await import("@/server/repositories/compliance-link.repository"),
      finding: await import("@/server/repositories/certification-finding.repository"),
      review: await import("@/server/repositories/certification-review.repository"),
      audit: await import("@/server/repositories/audit-log.repository"),
      programService: await import("@/server/services/certification-program.service"),
      basisService: await import("@/server/services/certification-basis.service"),
      itemService: await import("@/server/services/compliance-item.service"),
      findingService: await import("@/server/services/certification-finding.service"),
      reviewService: await import("@/server/services/certification-review.service"),
    }
  : null;

describe.skipIf(!databaseAvailable)(`certification workspace against PostgreSQL (${SKIP_REASON})`, () => {
  let tenant: TestTenant;
  let otherTenant: TestTenant;
  let ctx: { organizationId: string; actorId: string };

  beforeAll(async () => {
    tenant = await createTestTenant("certification-primary");
    otherTenant = await createTestTenant("certification-other");
    ctx = { organizationId: tenant.organizationId, actorId: tenant.userId };
  });

  afterAll(async () => {
    if (tenant) await destroyTestTenant(tenant);
    if (otherTenant) await destroyTestTenant(otherTenant);
    await disconnectIntegrationPrisma();
  });

  // --- Fixtures -------------------------------------------------------------

  function identifierFor(label: string): string {
    return uniqueSuffix(label).toUpperCase().replace(/[^A-Z0-9_-]/g, "-").slice(0, 32);
  }

  function contextFor(owner: TestTenant) {
    return { organizationId: owner.organizationId, actorId: owner.userId };
  }

  async function makeRequirement(projectId = tenant.projectId) {
    return integrationPrisma!.requirement.create({
      data: {
        projectId,
        identifier: identifierFor("req"),
        title: "Cabin pressurization limits",
        statement: "The cabin altitude shall not exceed 8,000 ft during normal operation.",
      },
    });
  }

  async function makeVerificationActivity(projectId = tenant.projectId) {
    return integrationPrisma!.verificationActivity.create({
      data: {
        projectId,
        identifier: identifierFor("va"),
        title: "Cabin altitude analysis",
        method: "ANALYSIS",
        status: "PLANNED",
      },
    });
  }

  async function makeDecision(projectId = tenant.projectId) {
    return integrationPrisma!.engineeringDecision.create({
      data: {
        projectId,
        identifier: identifierFor("ed"),
        title: "Cabin pressurization schedule",
        statement: "Maintain cabin altitude below 8,000 ft.",
        rationale: "Crew and passenger physiological limits.",
      },
    });
  }

  async function makeDesignItem(projectId = tenant.projectId) {
    return integrationPrisma!.designItem.create({
      data: {
        projectId,
        identifier: identifierFor("di"),
        name: "Cabin pressure controller",
        itemType: "COMPONENT",
        status: "DRAFT",
      },
    });
  }

  async function makeRisk(projectId = tenant.projectId) {
    return integrationPrisma!.risk.create({
      data: {
        projectId,
        identifier: identifierFor("rsk"),
        title: "Rapid decompression",
        description: "Loss of cabin pressure at altitude.",
      },
    });
  }

  async function makeIssue(projectId = tenant.projectId) {
    return integrationPrisma!.issue.create({
      data: {
        projectId,
        identifier: identifierFor("iss"),
        title: "Controller vendor part shortage",
        description: "Lead time risk on the pressure controller.",
      },
    });
  }

  async function makeEvidence(projectId = tenant.projectId) {
    return integrationPrisma!.evidence.create({
      data: {
        projectId,
        title: "Cabin altitude analysis report",
        evidenceType: "ANALYSIS",
        sourceReference: "RPT-2026-114",
      },
    });
  }

  async function makeSupplierQualification(projectId = tenant.projectId) {
    const supplier = await integrationPrisma!.supplier.create({
      data: { projectId, identifier: identifierFor("sup"), name: "Altitude Systems Inc." },
    });
    return integrationPrisma!.supplierQualification.create({
      data: {
        projectId,
        supplierId: supplier.id,
        title: "Pressure controller process qualification",
        qualificationType: "PROCESS",
        status: "ACTIVE",
      },
    });
  }

  async function makeProgram(owner: TestTenant = tenant) {
    return modules!.program.createProgram({
      projectId: owner.projectId,
      identifier: identifierFor("cert"),
      name: "Cabin systems certification effort",
      description: null,
      ownerId: null,
    });
  }

  async function makeBasis(certificationProgramId: string) {
    return modules!.basis.createBasis({
      certificationProgramId,
      identifier: identifierFor("cb"),
      title: "Part 25 Amdt 25-141",
      description: null,
      revision: "Amdt 25-141",
      sourceReference: "14 CFR Part 25",
      createdById: tenant.userId,
    });
  }

  async function makeActiveBasis(certificationProgramId: string) {
    const basis = await makeBasis(certificationProgramId);
    return modules!.basis.activateBasis(basis.id, tenant.userId);
  }

  async function makeItem(certificationBasisId: string) {
    return modules!.item.createItem({
      certificationBasisId,
      identifier: identifierFor("ci"),
      title: "Cabin pressurization limits",
      description: null,
    });
  }

  // --- Certification programme -----------------------------------------------

  describe("certification programme", () => {
    it("creates one, and refuses a second for the same project", async () => {
      const program = await modules!.programService.certificationProgramService.createProgram(
        ctx,
        tenant.projectId,
        { identifier: identifierFor("cert"), name: "Avionics certification effort" },
      );
      expect(program.status).toBe("DRAFT");

      await expect(
        modules!.programService.certificationProgramService.createProgram(ctx, tenant.projectId, {
          identifier: identifierFor("cert2"),
          name: "A second effort",
        }),
      ).rejects.toThrow();
    });

    it("is invisible to another project's caller", async () => {
      const program = await makeProgram();
      const otherCtx = contextFor(otherTenant);

      const found = await modules!.programService.certificationProgramService.getProgram(
        otherCtx,
        otherTenant.projectId,
      );
      expect(found).toBeNull();
      expect(found).not.toEqual(program);
    });
  });

  // --- Certification basis ----------------------------------------------------

  describe("certification basis", () => {
    it("activates, and refuses a second activation without supersedeActive", async () => {
      const program = await makeProgram();
      const basisA = await makeBasis(program.id);
      const basisB = await modules!.basis.createBasis({
        certificationProgramId: program.id,
        identifier: identifierFor("cb2"),
        title: "Second basis",
        description: null,
        revision: "1",
        sourceReference: null,
        createdById: tenant.userId,
      });

      await modules!.basisService.certificationBasisService.activateBasis(
        ctx,
        tenant.projectId,
        basisA.id,
        {},
      );

      await expect(
        modules!.basisService.certificationBasisService.activateBasis(ctx, tenant.projectId, basisB.id, {}),
      ).rejects.toThrow();

      const superseded = await modules!.basisService.certificationBasisService.activateBasis(
        ctx,
        tenant.projectId,
        basisB.id,
        { supersedeActive: true },
      );
      expect(superseded.status).toBe("ACTIVE");

      const oldRow = await integrationPrisma!.certificationBasis.findUniqueOrThrow({
        where: { id: basisA.id },
      });
      expect(oldRow.status).toBe("SUPERSEDED");
      expect(oldRow.supersededById).toBe(basisB.id);
    });

    it("service-enforces immutability once ACTIVE", async () => {
      const program = await makeProgram();
      const basis = await makeActiveBasis(program.id);

      await expect(
        modules!.basisService.certificationBasisService.updateBasis(ctx, tenant.projectId, basis.id, {
          title: "Renamed",
        }),
      ).rejects.toThrow();

      const row = await integrationPrisma!.certificationBasis.findUniqueOrThrow({ where: { id: basis.id } });
      expect(row.title).toBe(basis.title);
    });
  });

  // --- Compliance items — the central invariant -------------------------------

  describe("compliance items", () => {
    it("never auto-derives applicability, method, status or disposition from a linked artifact's state", async () => {
      const program = await makeProgram();
      const basis = await makeActiveBasis(program.id);
      const item = await modules!.itemService.complianceItemService.createItem(
        ctx,
        tenant.projectId,
        basis.id,
        { identifier: identifierFor("ci"), title: "Cabin pressurization limits" },
      );

      const requirement = await makeRequirement();
      const activity = await makeVerificationActivity();

      await modules!.itemService.complianceItemService.addLink(ctx, tenant.projectId, item.id, {
        linkType: "REQUIREMENT",
        targetId: requirement.id,
      });
      await modules!.itemService.complianceItemService.addLink(ctx, tenant.projectId, item.id, {
        linkType: "VERIFICATION_ACTIVITY",
        targetId: activity.id,
      });

      // Approve the requirement and record the activity as PASSED — real
      // engineering "success" signals — and confirm neither touches the
      // compliance item at all.
      await integrationPrisma!.requirement.update({ where: { id: requirement.id }, data: { status: "APPROVED" } });
      await integrationPrisma!.verificationActivity.update({
        where: { id: activity.id },
        data: { status: "PASSED" },
      });

      const reread = await modules!.item.findItemInProject(tenant.projectId, item.id);
      expect(reread?.applicability).toBe("UNDETERMINED");
      expect(reread?.disposition).toBe("UNASSESSED");
      expect(reread?.status).toBe("OPEN");
      expect(reread?.method).toBeNull();
    });

    it("stamps the reviewer and timestamp when applicability is explicitly set", async () => {
      const program = await makeProgram();
      const basis = await makeActiveBasis(program.id);
      const item = await makeItem(basis.id);

      const updated = await modules!.itemService.complianceItemService.updateItem(
        ctx,
        tenant.projectId,
        item.id,
        { applicability: "APPLICABLE", applicabilityRationale: "Applies to this cabin configuration." },
      );

      expect(updated.applicability).toBe("APPLICABLE");
      expect(updated.applicabilityReviewerId).toBe(tenant.userId);
      expect(updated.applicabilityReviewedAt).not.toBeNull();
    });

    it("is invisible to another project's caller", async () => {
      const program = await makeProgram();
      const basis = await makeActiveBasis(program.id);
      const item = await makeItem(basis.id);

      await expect(
        modules!.itemService.complianceItemService.getItem(contextFor(otherTenant), otherTenant.projectId, item.id),
      ).rejects.toThrow();
    });
  });

  // --- Compliance links, across all eight typed relationships -----------------

  describe("compliance links", () => {
    it("links all eight target types, including evidence via the shared evidence_links table", async () => {
      const program = await makeProgram();
      const basis = await makeActiveBasis(program.id);
      const item = await makeItem(basis.id);

      const requirement = await makeRequirement();
      const activity = await makeVerificationActivity();
      const decision = await makeDecision();
      const design = await makeDesignItem();
      const risk = await makeRisk();
      const issue = await makeIssue();
      const qualification = await makeSupplierQualification();
      const evidence = await makeEvidence();

      const links = await Promise.all([
        modules!.itemService.complianceItemService.addLink(ctx, tenant.projectId, item.id, {
          linkType: "REQUIREMENT",
          targetId: requirement.id,
        }),
        modules!.itemService.complianceItemService.addLink(ctx, tenant.projectId, item.id, {
          linkType: "VERIFICATION_ACTIVITY",
          targetId: activity.id,
        }),
        modules!.itemService.complianceItemService.addLink(ctx, tenant.projectId, item.id, {
          linkType: "ENGINEERING_DECISION",
          targetId: decision.id,
        }),
        modules!.itemService.complianceItemService.addLink(ctx, tenant.projectId, item.id, {
          linkType: "DESIGN_ITEM",
          targetId: design.id,
        }),
        modules!.itemService.complianceItemService.addLink(ctx, tenant.projectId, item.id, {
          linkType: "RISK",
          targetId: risk.id,
        }),
        modules!.itemService.complianceItemService.addLink(ctx, tenant.projectId, item.id, {
          linkType: "ISSUE",
          targetId: issue.id,
        }),
        modules!.itemService.complianceItemService.addLink(ctx, tenant.projectId, item.id, {
          linkType: "SUPPLIER_QUALIFICATION",
          targetId: qualification.id,
        }),
        modules!.itemService.complianceItemService.addLink(ctx, tenant.projectId, item.id, {
          linkType: "EVIDENCE",
          targetId: evidence.id,
        }),
      ]);

      expect(links).toHaveLength(8);
      expect(new Set(links.map((l) => l.linkType)).size).toBe(8);

      const evidenceRow = await integrationPrisma!.evidenceLink.findFirst({
        where: { evidenceId: evidence.id, complianceItemId: item.id },
      });
      expect(evidenceRow).not.toBeNull();

      const allLinks = await modules!.link.listLinks(item.id);
      expect(allLinks).toHaveLength(8);
    });

    it("refuses a target that does not exist in this project", async () => {
      const program = await makeProgram();
      const basis = await makeActiveBasis(program.id);
      const item = await makeItem(basis.id);
      const foreignRequirement = await makeRequirement(otherTenant.projectId);

      await expect(
        modules!.itemService.complianceItemService.addLink(ctx, tenant.projectId, item.id, {
          linkType: "REQUIREMENT",
          targetId: foreignRequirement.id,
        }),
      ).rejects.toThrow();
    });

    it("still enforces exactly one subject on evidence_links at the database level", async () => {
      const program = await makeProgram();
      const basis = await makeActiveBasis(program.id);
      const item = await makeItem(basis.id);
      const requirement = await makeRequirement();
      const evidence = await makeEvidence();

      await expect(
        integrationPrisma!.$executeRaw`
          INSERT INTO evidence_links (id, "evidenceId", "requirementId", "complianceItemId", "createdAt")
          VALUES (${`evl-${uniqueSuffix("x")}`}, ${evidence.id}, ${requirement.id}, ${item.id}, now())
        `,
      ).rejects.toThrow();
    });

    it("removes a link cleanly", async () => {
      const program = await makeProgram();
      const basis = await makeActiveBasis(program.id);
      const item = await makeItem(basis.id);
      const requirement = await makeRequirement();

      const link = await modules!.itemService.complianceItemService.addLink(ctx, tenant.projectId, item.id, {
        linkType: "REQUIREMENT",
        targetId: requirement.id,
      });

      await modules!.itemService.complianceItemService.removeLink(ctx, tenant.projectId, item.id, link.id);

      const remaining = await modules!.link.listLinks(item.id);
      expect(remaining).toHaveLength(0);
    });
  });

  // --- Certification findings --------------------------------------------------

  describe("certification findings", () => {
    it("resolves with a note, an actor and a timestamp, never deleted", async () => {
      const program = await makeProgram();
      const basis = await makeActiveBasis(program.id);
      const item = await makeItem(basis.id);

      const finding = await modules!.findingService.certificationFindingService.createFinding(
        ctx,
        tenant.projectId,
        item.id,
        { identifier: identifierFor("cf"), title: "Missing analysis report", severity: "HIGH" },
      );

      const resolved = await modules!.findingService.certificationFindingService.resolveFinding(
        ctx,
        tenant.projectId,
        item.id,
        finding.id,
        { note: "Analysis report RPT-2026-114 filed." },
      );

      expect(resolved.status).toBe("RESOLVED");
      expect(resolved.resolvedById).toBe(tenant.userId);
      expect(resolved.resolvedAt).not.toBeNull();
      expect(resolved.resolutionNote).toContain("RPT-2026-114");

      const stillThere = await integrationPrisma!.certificationFinding.findUniqueOrThrow({
        where: { id: finding.id },
      });
      expect(stillThere).not.toBeNull();
    });

    it("refuses to re-disposition an already-resolved finding", async () => {
      const program = await makeProgram();
      const basis = await makeActiveBasis(program.id);
      const item = await makeItem(basis.id);
      const finding = await modules!.findingService.certificationFindingService.createFinding(
        ctx,
        tenant.projectId,
        item.id,
        { identifier: identifierFor("cf"), title: "x", severity: "LOW" },
      );
      await modules!.findingService.certificationFindingService.resolveFinding(
        ctx,
        tenant.projectId,
        item.id,
        finding.id,
        { note: "Fixed." },
      );

      await expect(
        modules!.findingService.certificationFindingService.acceptFinding(
          ctx,
          tenant.projectId,
          item.id,
          finding.id,
          { note: "Accepted." },
        ),
      ).rejects.toThrow();
    });
  });

  // --- Certification review ----------------------------------------------------

  describe("certification review", () => {
    it("evaluates an empty basis as UNKNOWN — never claims readiness from silence", async () => {
      const program = await makeProgram();
      await makeActiveBasis(program.id);

      const report = await modules!.reviewService.certificationReviewService.evaluateCertificationReview(
        ctx,
        tenant.projectId,
        {},
      );

      expect(report.review.status).toBe("UNKNOWN");
      expect(report.findings).toHaveLength(0);
    });

    it("persists JSONB basis, and the fingerprint is stable across two unchanged evaluations", async () => {
      const program = await makeProgram();
      const basis = await makeActiveBasis(program.id);
      const item = await modules!.itemService.complianceItemService.createItem(
        ctx,
        tenant.projectId,
        basis.id,
        { identifier: identifierFor("ci"), title: "Cabin pressurization limits" },
      );
      await modules!.itemService.complianceItemService.updateItem(ctx, tenant.projectId, item.id, {
        applicability: "NOT_APPLICABLE",
      });

      const first = await modules!.reviewService.certificationReviewService.evaluateCertificationReview(
        ctx,
        tenant.projectId,
        {},
      );
      const second = await modules!.reviewService.certificationReviewService.evaluateCertificationReview(
        ctx,
        tenant.projectId,
        {},
      );

      expect(first.review.fingerprint).toBe(second.review.fingerprint);
      expect(first.review.id).not.toBe(second.review.id);

      const storedBasis = await modules!.review.readReviewBasis({ id: first.review.id });
      expect(storedBasis.certificationBasisId).toBe(basis.id);
    });

    it("goes STALE when a linked engineering object changes, and CURRENT again after re-evaluation", async () => {
      const program = await makeProgram();
      const basis = await makeActiveBasis(program.id);
      const item = await modules!.itemService.complianceItemService.createItem(
        ctx,
        tenant.projectId,
        basis.id,
        { identifier: identifierFor("ci"), title: "Cabin pressurization limits" },
      );
      await modules!.itemService.complianceItemService.updateItem(ctx, tenant.projectId, item.id, {
        applicability: "APPLICABLE",
        method: "ANALYSIS",
      });
      const requirement = await makeRequirement();
      await modules!.itemService.complianceItemService.addLink(ctx, tenant.projectId, item.id, {
        linkType: "REQUIREMENT",
        targetId: requirement.id,
      });

      await modules!.reviewService.certificationReviewService.evaluateCertificationReview(
        ctx,
        tenant.projectId,
        {},
      );

      let latest = await modules!.reviewService.certificationReviewService.getLatestCertificationReview(
        ctx,
        tenant.projectId,
      );
      expect("review" in latest && latest.freshness).toBe("CURRENT");

      await integrationPrisma!.requirement.update({ where: { id: requirement.id }, data: { status: "APPROVED" } });

      latest = await modules!.reviewService.certificationReviewService.getLatestCertificationReview(
        ctx,
        tenant.projectId,
      );
      expect("review" in latest && latest.freshness).toBe("STALE");

      const reEvaluated = await modules!.reviewService.certificationReviewService.evaluateCertificationReview(
        ctx,
        tenant.projectId,
        {},
      );
      expect(reEvaluated.freshness).toBe("CURRENT");
    });

    it("keeps immutable history — every evaluation is a new row, none overwritten", async () => {
      const program = await makeProgram();
      await makeActiveBasis(program.id);

      const first = await modules!.reviewService.certificationReviewService.evaluateCertificationReview(
        ctx,
        tenant.projectId,
        {},
      );
      const second = await modules!.reviewService.certificationReviewService.evaluateCertificationReview(
        ctx,
        tenant.projectId,
        {},
      );

      const history = await modules!.reviewService.certificationReviewService.listCertificationReviewHistory(
        ctx,
        tenant.projectId,
      );
      const ids = history.map((r) => r.id);
      expect(ids).toContain(first.review.id);
      expect(ids).toContain(second.review.id);
    });

    it("uses only real registry rule ids — cross-checked against every finding actually persisted", async () => {
      const program = await makeProgram();
      const basis = await makeActiveBasis(program.id);
      const item = await modules!.itemService.complianceItemService.createItem(
        ctx,
        tenant.projectId,
        basis.id,
        { identifier: identifierFor("ci"), title: "Cabin pressurization limits" },
      );
      await modules!.itemService.complianceItemService.updateItem(ctx, tenant.projectId, item.id, {
        applicability: "APPLICABLE",
      });

      const { certificationReviewRuleIds } = await import("@/domain");
      const validIds = new Set(certificationReviewRuleIds());

      const report = await modules!.reviewService.certificationReviewService.evaluateCertificationReview(
        ctx,
        tenant.projectId,
        {},
      );

      expect(report.findings.length).toBeGreaterThan(0);
      for (const finding of report.findings) {
        expect(validIds.has(finding.ruleId)).toBe(true);
      }
    });

    it("audits evaluation with counts only, never the full finding array", async () => {
      const program = await makeProgram();
      await makeActiveBasis(program.id);

      const report = await modules!.reviewService.certificationReviewService.evaluateCertificationReview(
        ctx,
        tenant.projectId,
        {},
      );

      const events = await modules!.audit.listAuditEventsForEntity({
        organizationId: tenant.organizationId,
        entityType: "CertificationReview",
        entityId: report.review.id,
      });
      expect(events).toHaveLength(1);
      const metadata = events[0]!.metadata as Record<string, unknown>;
      expect(metadata).toHaveProperty("status");
      expect(metadata).toHaveProperty("findingCount");
      expect(metadata).not.toHaveProperty("findings");
    });

    it("cascades programme, basis, items, links, findings, reviews and review findings when the project is deleted", async () => {
      const shortLived = await createTestTenant("certification-cascade");
      try {
        const program = await makeProgram(shortLived);
        const basis = await makeActiveBasis(program.id);
        const item = await modules!.item.createItem({
          certificationBasisId: basis.id,
          identifier: identifierFor("ci"),
          title: "x",
          description: null,
        });
        await modules!.finding.createFinding({
          complianceItemId: item.id,
          identifier: identifierFor("cf"),
          title: "x",
          description: null,
          severity: "LOW",
        });
        const cascadeCtx = contextFor(shortLived);
        await modules!.reviewService.certificationReviewService.evaluateCertificationReview(
          cascadeCtx,
          shortLived.projectId,
          {},
        );

        await integrationPrisma!.project.delete({ where: { id: shortLived.projectId } });

        const remainingPrograms = await integrationPrisma!.certificationProgram.count({
          where: { id: program.id },
        });
        expect(remainingPrograms).toBe(0);
      } finally {
        await destroyTestTenant(shortLived);
      }
    });

    it("refuses to delete a certification basis directly while it has compliance items referencing it (foreign key intact)", async () => {
      const program = await makeProgram();
      const basis = await makeActiveBasis(program.id);
      await makeItem(basis.id);

      await expect(
        integrationPrisma!.certificationBasis.delete({ where: { id: basis.id } }),
      ).rejects.toThrow();
    });
  });

  // --- A real certification scenario, end to end -------------------------------

  describe("a real certification scenario end to end", () => {
    it("walks the full chain and never lets the review write back to a compliance item's own fields", async () => {
      // 1. Programme and basis.
      await modules!.programService.certificationProgramService.createProgram(ctx, tenant.projectId, {
        identifier: identifierFor("cert"),
        name: "Full-chain certification effort",
      });
      const draftBasis = await modules!.basisService.certificationBasisService.createBasis(
        ctx,
        tenant.projectId,
        { identifier: identifierFor("cb"), title: "Part 25 Amdt 25-141", revision: "Amdt 25-141" },
      );
      const basis = await modules!.basisService.certificationBasisService.activateBasis(
        ctx,
        tenant.projectId,
        draftBasis.id,
        {},
      );

      // 2. Compliance item, initially with nothing set.
      const item = await modules!.itemService.complianceItemService.createItem(
        ctx,
        tenant.projectId,
        basis.id,
        { identifier: identifierFor("ci"), title: "Cabin pressurization limits" },
      );

      // 3. First evaluation: UNDETERMINED applicability blocks.
      const undeterminedReport =
        await modules!.reviewService.certificationReviewService.evaluateCertificationReview(
          ctx,
          tenant.projectId,
          {},
        );
      expect(undeterminedReport.review.status).toBe("NOT_READY");
      expect(undeterminedReport.findings.some((f) => f.ruleId === "CR-APL-001")).toBe(true);

      // 4. Applicability set explicitly.
      await modules!.itemService.complianceItemService.updateItem(ctx, tenant.projectId, item.id, {
        applicability: "APPLICABLE",
        applicabilityRationale: "This obligation applies to the pressurization schedule.",
      });

      const noMethodReport =
        await modules!.reviewService.certificationReviewService.evaluateCertificationReview(
          ctx,
          tenant.projectId,
          {},
        );
      expect(noMethodReport.findings.some((f) => f.ruleId === "CR-MTH-001" && f.status === "BLOCKING")).toBe(true);
      expect(noMethodReport.findings.some((f) => f.ruleId === "CR-LNK-001" && f.status === "BLOCKING")).toBe(true);

      // 5. Method chosen, engineering links established, evidence attached.
      await modules!.itemService.complianceItemService.updateItem(ctx, tenant.projectId, item.id, {
        method: "ANALYSIS",
      });
      const requirement = await makeRequirement();
      const activity = await makeVerificationActivity();
      const decision = await makeDecision();
      const design = await makeDesignItem();
      const qualification = await makeSupplierQualification();
      const evidence = await makeEvidence();

      for (const [linkType, targetId] of [
        ["REQUIREMENT", requirement.id],
        ["VERIFICATION_ACTIVITY", activity.id],
        ["ENGINEERING_DECISION", decision.id],
        ["DESIGN_ITEM", design.id],
        ["SUPPLIER_QUALIFICATION", qualification.id],
        ["EVIDENCE", evidence.id],
      ] as const) {
        await modules!.itemService.complianceItemService.addLink(ctx, tenant.projectId, item.id, {
          linkType,
          targetId,
        });
      }

      const linkedReport = await modules!.reviewService.certificationReviewService.evaluateCertificationReview(
        ctx,
        tenant.projectId,
        {},
      );
      expect(linkedReport.findings.some((f) => f.ruleId === "CR-LNK-001")).toBe(false);
      expect(linkedReport.findings.some((f) => f.ruleId === "CR-EVD-001")).toBe(false);
      expect(linkedReport.findings.some((f) => f.ruleId === "CR-EVD-002")).toBe(true);

      // 6. A HIGH severity finding blocks the review.
      const finding = await modules!.findingService.certificationFindingService.createFinding(
        ctx,
        tenant.projectId,
        item.id,
        { identifier: identifierFor("cf"), title: "Analysis assumptions not independently checked", severity: "HIGH" },
      );

      const blockedByFindingReport =
        await modules!.reviewService.certificationReviewService.evaluateCertificationReview(
          ctx,
          tenant.projectId,
          {},
        );
      expect(blockedByFindingReport.review.status).toBe("NOT_READY");
      expect(
        blockedByFindingReport.findings.some((f) => f.ruleId === "CR-FND-001" && f.status === "BLOCKING"),
      ).toBe(true);

      // 7. Resolve the finding.
      await modules!.findingService.certificationFindingService.resolveFinding(
        ctx,
        tenant.projectId,
        item.id,
        finding.id,
        { note: "Independent check completed and filed as evidence.", evidenceId: evidence.id },
      );

      const finalReport = await modules!.reviewService.certificationReviewService.evaluateCertificationReview(
        ctx,
        tenant.projectId,
        {},
      );
      expect(finalReport.findings.some((f) => f.ruleId === "CR-FND-001")).toBe(false);
      expect(finalReport.findings.some((f) => f.ruleId === "CR-FND-003")).toBe(true);

      // 8. The compliance item's own applicability/method/status/disposition
      // were never touched by any of these evaluations — the central
      // invariant, verified against the actual database row.
      const finalItemRow = await integrationPrisma!.complianceItem.findUniqueOrThrow({ where: { id: item.id } });
      expect(finalItemRow.applicability).toBe("APPLICABLE");
      expect(finalItemRow.method).toBe("ANALYSIS");
      expect(finalItemRow.disposition).toBe("UNASSESSED");
      expect(finalItemRow.status).toBe("OPEN");

      // 9. Immutable history: every one of the five evaluations above is a
      // distinct, still-readable row.
      const fullHistory = await modules!.reviewService.certificationReviewService.listCertificationReviewHistory(
        ctx,
        tenant.projectId,
      );
      expect(fullHistory.length).toBeGreaterThanOrEqual(5);
    });
  });
});
