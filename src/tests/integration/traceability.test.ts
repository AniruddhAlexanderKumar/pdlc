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
 * The Traceability workspace against real PostgreSQL.
 *
 * This is the one genuinely new backend capability from this prompt —
 * `TraceabilityService.listSelectableRoots` — proven against real,
 * service-created data across a representative sample of the seventeen
 * selectable node types, plus one composed scenario that ties root selection
 * to the pre-existing, unmodified `EngineeringGraphService` the same way the
 * frontend workspace does: pick a root, then read its relationships.
 *
 * The graph engine itself (traversal, direction, provenance, project
 * isolation) already has thorough coverage in `graph.test.ts` from earlier
 * work and is not re-proven here — this file only proves that the new
 * picker composes correctly with that unmodified engine over real data.
 */

const modules = databaseAvailable
  ? {
      traceability: await import("@/server/services/traceability.service"),
      graph: (await import("@/server/services/engineering-graph.service")).engineeringGraphService,
      requirementService: await import("@/server/services/requirement.service"),
      riskService: await import("@/server/services/risk.service"),
      issueService: await import("@/server/services/issue.service"),
      changeRequestService: await import("@/server/services/change-request.service"),
      supplierService: await import("@/server/services/supplier.service"),
      suppliedItemService: await import("@/server/services/supplied-item.service"),
      driftDetectionService: (await import("@/server/services/drift-detection.service"))
        .driftDetectionService,
      programRepo: await import("@/server/repositories/certification-program.repository"),
      basisRepo: await import("@/server/repositories/certification-basis.repository"),
      complianceItemService: (await import("@/server/services/compliance-item.service"))
        .complianceItemService,
      certificationReviewService: (await import("@/server/services/certification-review.service"))
        .certificationReviewService,
    }
  : null;

describe.skipIf(!databaseAvailable)(`Traceability workspace against PostgreSQL (${SKIP_REASON})`, () => {
  const prisma = integrationPrisma!;

  let tenant: TestTenant;
  let otherTenant: TestTenant;
  let ctx: { organizationId: string; actorId: string };
  let otherCtx: { organizationId: string; actorId: string };

  beforeAll(async () => {
    tenant = await createTestTenant("traceability-primary");
    otherTenant = await createTestTenant("traceability-other");
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

  async function makeDesignItem(projectId = tenant.projectId) {
    return prisma.designItem.create({
      data: { projectId, identifier: identifierFor("di"), name: "Combustion chamber", itemType: "COMPONENT" },
    });
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

  async function makeVerificationActivity(projectId = tenant.projectId) {
    return prisma.verificationActivity.create({
      data: { projectId, identifier: identifierFor("va"), title: "Chamber pressure test", method: "TEST" },
    });
  }

  // A fully connected slice, built once, that every test in this file reads from.
  let requirement: { id: string; identifier: string };
  let designItem: { id: string; identifier: string };
  let decision: { id: string; identifier: string };
  let verification: { id: string; identifier: string };
  let risk: { id: string; identifier: string };
  let issue: { id: string; identifier: string };
  let changeRequest: { id: string; identifier: string };
  let supplier: { id: string; identifier: string };
  let baseline: { id: string; identifier: string };
  let complianceItem: { id: string; identifier: string };

  beforeAll(async () => {
    requirement = await modules!.requirementService.createRequirement(ctx, tenant.projectId, {
      identifier: identifierFor("req"),
      title: "Maximum chamber pressure",
      statement: "The engine shall not exceed 120 bar.",
    });
    designItem = await makeDesignItem();
    decision = await makeDecision();
    verification = await makeVerificationActivity();

    await modules!.requirementService.linkRequirement(ctx, tenant.projectId, requirement.id, {
      relation: "DESIGN_ITEM",
      targetId: designItem.id,
    });
    await modules!.requirementService.linkRequirement(ctx, tenant.projectId, requirement.id, {
      relation: "VERIFICATION_ACTIVITY",
      targetId: verification.id,
    });
    await modules!.requirementService.linkRequirement(ctx, tenant.projectId, requirement.id, {
      relation: "ENGINEERING_DECISION",
      targetId: decision.id,
      linkType: "DECISION_ADDRESSES_REQUIREMENT",
    });

    risk = await modules!.riskService.createRisk(ctx, tenant.projectId, {
      identifier: identifierFor("rsk"),
      title: "Coolant supply interruption",
      description: "The coolant loop may lose flow under vibration.",
    });
    await modules!.riskService.linkRisk(ctx, tenant.projectId, risk.id, {
      relation: "REQUIREMENT",
      targetId: requirement.id,
    });

    issue = await modules!.issueService.createIssue(ctx, tenant.projectId, {
      identifier: identifierFor("iss"),
      title: "Pressure sensor drift",
      description: "Sensor readings drifted during hot-fire.",
      severity: "MEDIUM",
    });
    await modules!.issueService.linkIssue(ctx, tenant.projectId, issue.id, {
      relation: "REQUIREMENT",
      targetId: requirement.id,
    });

    changeRequest = await modules!.changeRequestService.createChangeRequest(ctx, tenant.projectId, {
      identifier: identifierFor("cr"),
      title: "Revise coolant pump mounting",
      description: "Stiffen the pump mount to reduce fatigue.",
      reason: "Traced to an open risk found in review.",
    });
    await modules!.changeRequestService.addDeclaredImpact(ctx, tenant.projectId, changeRequest.id, {
      target: { type: "RISK", id: risk.id },
    });

    supplier = await modules!.supplierService.createSupplier(ctx, tenant.projectId, {
      identifier: identifierFor("sup"),
      name: "Acme Aerostructures",
    });
    await modules!.suppliedItemService.createSuppliedItem(ctx, tenant.projectId, {
      supplierId: supplier.id,
      identifier: identifierFor("si"),
      name: "Coolant pump",
      itemType: "PART",
    });

    baseline = await modules!.driftDetectionService.createBaseline(ctx, tenant.projectId, {
      identifier: identifierFor("bsl"),
      name: "PDR baseline",
    });

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
    complianceItem = await modules!.complianceItemService.createItem(ctx, tenant.projectId, basis.id, {
      identifier: identifierFor("ci"),
      title: "Structural margin",
    });
    await modules!.certificationReviewService.evaluateCertificationReview(ctx, tenant.projectId, {});
  });

  describe("listSelectableRoots", () => {
    it("resolves real requirements, risks, issues and changes with the right identifier/label", async () => {
      const requirements = await modules!.traceability.listSelectableRoots(
        ctx,
        tenant.projectId,
        "REQUIREMENT",
      );
      expect(requirements.some((r) => r.id === requirement.id && r.identifier === requirement.identifier)).toBe(
        true,
      );

      const risks = await modules!.traceability.listSelectableRoots(ctx, tenant.projectId, "RISK");
      expect(risks.some((r) => r.id === risk.id)).toBe(true);

      const issues = await modules!.traceability.listSelectableRoots(ctx, tenant.projectId, "ISSUE");
      expect(issues.some((r) => r.id === issue.id)).toBe(true);

      const changes = await modules!.traceability.listSelectableRoots(
        ctx,
        tenant.projectId,
        "CHANGE_REQUEST",
      );
      expect(changes.some((r) => r.id === changeRequest.id)).toBe(true);
    });

    it("resolves suppliers, baselines and certification objects created through their own real services", async () => {
      const suppliers = await modules!.traceability.listSelectableRoots(ctx, tenant.projectId, "SUPPLIER");
      expect(suppliers.some((r) => r.id === supplier.id)).toBe(true);

      const baselines = await modules!.traceability.listSelectableRoots(
        ctx,
        tenant.projectId,
        "ENGINEERING_BASELINE",
      );
      expect(baselines.some((r) => r.id === baseline.id)).toBe(true);

      const bases = await modules!.traceability.listSelectableRoots(
        ctx,
        tenant.projectId,
        "CERTIFICATION_BASIS",
      );
      expect(bases.length).toBeGreaterThan(0);

      const items = await modules!.traceability.listSelectableRoots(
        ctx,
        tenant.projectId,
        "COMPLIANCE_ITEM",
      );
      expect(items.some((r) => r.id === complianceItem.id)).toBe(true);

      const reviews = await modules!.traceability.listSelectableRoots(
        ctx,
        tenant.projectId,
        "CERTIFICATION_REVIEW",
      );
      expect(reviews.length).toBeGreaterThan(0);
      // A review has no title; it is identified by status and timestamp only.
      expect(reviews[0]!.identifier).toBeNull();
    });

    it("returns an empty list for certification node types before any program exists — not an error", async () => {
      const bases = await modules!.traceability.listSelectableRoots(
        otherCtx,
        otherTenant.projectId,
        "CERTIFICATION_BASIS",
      );
      const items = await modules!.traceability.listSelectableRoots(
        otherCtx,
        otherTenant.projectId,
        "COMPLIANCE_ITEM",
      );
      const reviews = await modules!.traceability.listSelectableRoots(
        otherCtx,
        otherTenant.projectId,
        "CERTIFICATION_REVIEW",
      );
      expect(bases).toEqual([]);
      expect(items).toEqual([]);
      expect(reviews).toEqual([]);
    });

    it("**never returns another project's objects**", async () => {
      const theirRequirement = await modules!.requirementService.createRequirement(
        otherCtx,
        otherTenant.projectId,
        { identifier: identifierFor("req"), title: "Their own requirement", statement: "x" },
      );

      const ours = await modules!.traceability.listSelectableRoots(ctx, tenant.projectId, "REQUIREMENT");
      expect(ours.some((r) => r.id === theirRequirement.id)).toBe(false);

      const theirs = await modules!.traceability.listSelectableRoots(
        otherCtx,
        otherTenant.projectId,
        "REQUIREMENT",
      );
      expect(theirs.some((r) => r.id === requirement.id)).toBe(false);
    });

    it("404s a project outside the caller's organization", async () => {
      await expect(
        modules!.traceability.listSelectableRoots(otherCtx, tenant.projectId, "REQUIREMENT"),
      ).rejects.toThrow();
    });
  });

  describe("composed with the real graph service", () => {
    it("reads the exact relationships a picked requirement was given, in both directions", async () => {
      const neighborhood = await modules!.graph.getDirectConnections(
        ctx,
        tenant.projectId,
        { type: "REQUIREMENT", id: requirement.id },
        "BOTH",
      );

      const outboundTypes = neighborhood.connections
        .filter((c) => c.direction === "OUTBOUND")
        .map((c) => c.edge.type);
      const inboundTypes = neighborhood.connections
        .filter((c) => c.direction === "INBOUND")
        .map((c) => c.edge.type);

      expect(outboundTypes).toEqual(
        expect.arrayContaining([
          "REQUIREMENT_ALLOCATED_TO_DESIGN",
          "REQUIREMENT_VERIFIED_BY",
          "REQUIREMENT_LINKED_TO_DECISION",
        ]),
      );
      expect(inboundTypes).toEqual(
        expect.arrayContaining(["RISK_AFFECTS_REQUIREMENT", "ISSUE_AFFECTS_REQUIREMENT"]),
      );

      const designConnection = neighborhood.connections.find(
        (c) => c.neighbor.type === "DESIGN_ITEM",
      );
      expect(designConnection?.neighbor.id).toBe(designItem.id);
    });

    it("reaches a two-hop object — the change request behind the risk — with a real shortest path", async () => {
      const traversal = await modules!.graph.traverse(ctx, tenant.projectId, {
        root: { type: "REQUIREMENT", id: requirement.id },
        direction: "BOTH",
        maxDepth: 2,
      });

      const changeNode = traversal.nodes.find((entry) => entry.node.id === changeRequest.id);
      expect(changeNode).toBeDefined();
      expect(changeNode!.depth).toBe(2);
      expect(changeNode!.path.map((step) => step.edgeType)).toEqual([
        "RISK_AFFECTS_REQUIREMENT",
        "CHANGE_IMPACTS_OBJECT",
      ]);
    });

    it("never resolves a node from another project", async () => {
      await expect(
        modules!.graph.getNode(ctx, tenant.projectId, { type: "REQUIREMENT", id: "not-in-this-project" }),
      ).rejects.toThrow();

      const theirRequirement = await modules!.requirementService.createRequirement(
        otherCtx,
        otherTenant.projectId,
        { identifier: identifierFor("req"), title: "Cross-project probe", statement: "x" },
      );
      await expect(
        modules!.graph.getNode(ctx, tenant.projectId, {
          type: "REQUIREMENT",
          id: theirRequirement.id,
        }),
      ).rejects.toThrow();
    });

    it("creates no audit rows for reading the picker or the graph", async () => {
      const before = await prisma.auditLog.count();

      await modules!.traceability.listSelectableRoots(ctx, tenant.projectId, "REQUIREMENT");
      await modules!.graph.getDirectConnections(
        ctx,
        tenant.projectId,
        { type: "REQUIREMENT", id: requirement.id },
        "BOTH",
      );
      await modules!.graph.traverse(ctx, tenant.projectId, {
        root: { type: "REQUIREMENT", id: requirement.id },
        direction: "BOTH",
        maxDepth: 2,
      });

      const after = await prisma.auditLog.count();
      expect(after).toBe(before);
    });
  });
});
