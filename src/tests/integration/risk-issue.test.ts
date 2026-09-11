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
 * Risks and Issues against real PostgreSQL.
 *
 * The unit suites (`src/domain/risk.test.ts`, `src/domain/issue.test.ts`,
 * `src/server/services/risk.service.test.ts`,
 * `src/server/services/issue.service.test.ts`) fake every repository, so
 * they prove the lifecycle, editability and ownership rules in the
 * abstract. This suite runs the real path: real tables and constraints (the
 * `risks`/`issues` project-scoped unique identifier, the real
 * `RiskRequirementLink`/`RiskDesignLink`/`DecisionRiskLink` and
 * `IssueRequirementLink`/`IssueDesignLink`/`DecisionIssueLink` join tables),
 * real project/organization isolation, real audit rows, and — the point of
 * this file — that links created through the real `RiskService`/
 * `IssueService` (not a raw insert) are genuinely visible to the graph, the
 * real change-impact engine, the real technical-readiness engine, the real
 * certification review, and the real Decision Sentinel. None of those five
 * systems' own logic is re-implemented or duplicated here; each is invoked
 * through its real, unmodified public method.
 *
 * Repositories and services are imported dynamically, guarded by
 * `databaseAvailable`, because importing them pulls in `@/config/env`,
 * which refuses to load without `DATABASE_URL`. With no database the suite
 * skips rather than erroring.
 */

const modules = databaseAvailable
  ? {
      riskRepo: await import("@/server/repositories/risk.repository"),
      issueRepo: await import("@/server/repositories/issue.repository"),
      riskService: await import("@/server/services/risk.service"),
      issueService: await import("@/server/services/issue.service"),
      auditLog: await import("@/server/repositories/audit-log.repository"),
      changeRequestService: await import("@/server/services/change-request.service"),
      impact: await import("@/server/services/change-impact-analysis.service"),
      technical: await import("@/server/services/technical-readiness.service"),
      programRepo: await import("@/server/repositories/certification-program.repository"),
      basisRepo: await import("@/server/repositories/certification-basis.repository"),
      itemService: await import("@/server/services/compliance-item.service"),
      review: await import("@/server/services/certification-review.service"),
      sentinel: await import("@/server/services/decision-sentinel.service"),
      graph: await import("@/server/services/engineering-graph.service"),
      graphRepo: await import("@/server/repositories/graph-repository"),
    }
  : null;

describe.skipIf(!databaseAvailable)(`Risks and Issues against PostgreSQL (${SKIP_REASON})`, () => {
  const prisma = integrationPrisma!;

  let tenant: TestTenant;
  let otherTenant: TestTenant;
  let ctx: { organizationId: string; actorId: string };

  beforeAll(async () => {
    tenant = await createTestTenant("risk-issue-primary");
    otherTenant = await createTestTenant("risk-issue-other");
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

  async function makeDesignItem(projectId = tenant.projectId) {
    return prisma.designItem.create({
      data: {
        projectId,
        identifier: identifierFor("di"),
        name: "Combustion chamber",
        itemType: "COMPONENT",
      },
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

  // --- Risk CRUD ------------------------------------------------------------

  describe("risk CRUD", () => {
    it("creates a risk as OPEN, reads it back, and updates its content", async () => {
      const created = await modules!.riskService.createRisk(ctx, tenant.projectId, {
        identifier: identifierFor("rsk"),
        title: "Coolant supply interruption",
        description: "The coolant loop may lose flow under vibration.",
      });
      expect(created.status).toBe("OPEN");

      const detail = await modules!.riskService.getRisk(ctx, tenant.projectId, created.id);
      expect(detail.availableTransitions).toEqual(["MITIGATED", "ACCEPTED", "CLOSED"]);
      expect(detail.editable).toEqual({ content: true, owner: true, links: true });

      const updated = await modules!.riskService.updateRisk(ctx, tenant.projectId, created.id, {
        cause: "Pump mounting fatigue.",
      });
      expect(updated.cause).toBe("Pump mounting fatigue.");
    });

    it("**enforces the project-scoped unique identifier**", async () => {
      const identifier = identifierFor("rsk-dup");
      await modules!.riskService.createRisk(ctx, tenant.projectId, {
        identifier,
        title: "First",
        description: "d",
      });

      await expect(
        modules!.riskService.createRisk(ctx, tenant.projectId, {
          identifier,
          title: "Second",
          description: "d",
        }),
      ).rejects.toThrow(/already exists/i);

      // The same identifier is free in a different project.
      const elsewhere = await modules!.riskService.createRisk(ctx, otherTenant.projectId, {
        identifier,
        title: "Theirs",
        description: "d",
      });
      expect(elsewhere.identifier).toBe(identifier);
    });

    it("runs the full lifecycle and refuses to reopen a closed risk", async () => {
      const risk = await modules!.riskService.createRisk(ctx, tenant.projectId, {
        identifier: identifierFor("rsk"),
        title: "Vibration-induced fatigue",
        description: "d",
      });

      const mitigated = await modules!.riskService.transitionRisk(ctx, tenant.projectId, risk.id, {
        to: "MITIGATED",
      });
      expect(mitigated.status).toBe("MITIGATED");

      const closed = await modules!.riskService.transitionRisk(ctx, tenant.projectId, risk.id, {
        to: "CLOSED",
      });
      expect(closed.status).toBe("CLOSED");

      await expect(
        modules!.riskService.transitionRisk(ctx, tenant.projectId, risk.id, { to: "OPEN" }),
      ).rejects.toThrow();
      await expect(
        modules!.riskService.updateRisk(ctx, tenant.projectId, risk.id, { title: "x" }),
      ).rejects.toThrow();
    });

    it("assigns a real organization member as owner, and rejects a stranger", async () => {
      const risk = await modules!.riskService.createRisk(ctx, tenant.projectId, {
        identifier: identifierFor("rsk"),
        title: "Owner test",
        description: "d",
      });

      const assigned = await modules!.riskService.assignRiskOwner(ctx, tenant.projectId, risk.id, {
        ownerId: tenant.userId,
      });
      expect(assigned.ownerId).toBe(tenant.userId);

      // A user who exists, but in a different organization.
      await expect(
        modules!.riskService.assignRiskOwner(ctx, tenant.projectId, risk.id, {
          ownerId: otherTenant.userId,
        }),
      ).rejects.toThrow(/not a member of this organization/i);
    });

    it("404s a risk belonging to another project", async () => {
      const risk = await modules!.riskService.createRisk(ctx, tenant.projectId, {
        identifier: identifierFor("rsk"),
        title: "x",
        description: "d",
      });

      const otherCtx = { organizationId: otherTenant.organizationId, actorId: otherTenant.userId };
      await expect(
        modules!.riskService.getRisk(otherCtx, otherTenant.projectId, risk.id),
      ).rejects.toThrow();
    });

    it("writes a real audit row for every mutation, attributed to the actor", async () => {
      const risk = await modules!.riskService.createRisk(ctx, tenant.projectId, {
        identifier: identifierFor("rsk"),
        title: "Audit test",
        description: "d",
      });
      await modules!.riskService.updateRisk(ctx, tenant.projectId, risk.id, { title: "Revised" });
      await modules!.riskService.transitionRisk(ctx, tenant.projectId, risk.id, { to: "ACCEPTED" });

      const events = await modules!.auditLog.listAuditEventsForEntity({
        organizationId: tenant.organizationId,
        entityType: "Risk",
        entityId: risk.id,
      });
      const actions = events.map((e) => e.action);
      expect(actions).toContain("risk.created");
      expect(actions).toContain("risk.updated");
      expect(actions).toContain("risk.status_transitioned");
      expect(events.every((e) => e.actor?.id === tenant.userId)).toBe(true);
    });
  });

  // --- Issue CRUD -------------------------------------------------------------

  describe("issue CRUD", () => {
    it("creates an issue as OPEN with a required severity, reads it back, and updates it", async () => {
      const created = await modules!.issueService.createIssue(ctx, tenant.projectId, {
        identifier: identifierFor("iss"),
        title: "Chamber wall crack found",
        description: "A hairline crack was found during post-test inspection.",
        severity: "HIGH",
      });
      expect(created.status).toBe("OPEN");
      expect(created.severity).toBe("HIGH");

      const updated = await modules!.issueService.updateIssue(ctx, tenant.projectId, created.id, {
        severity: "CRITICAL",
      });
      expect(updated.severity).toBe("CRITICAL");
    });

    it("**enforces the project-scoped unique identifier**", async () => {
      const identifier = identifierFor("iss-dup");
      await modules!.issueService.createIssue(ctx, tenant.projectId, {
        identifier,
        title: "First",
        description: "d",
        severity: "LOW",
      });

      await expect(
        modules!.issueService.createIssue(ctx, tenant.projectId, {
          identifier,
          title: "Second",
          description: "d",
          severity: "LOW",
        }),
      ).rejects.toThrow(/already exists/i);
    });

    it("runs the full lifecycle including OPEN straight to RESOLVED, and refuses to reopen", async () => {
      const issue = await modules!.issueService.createIssue(ctx, tenant.projectId, {
        identifier: identifierFor("iss"),
        title: "Direct resolution test",
        description: "d",
        severity: "LOW",
      });

      const resolved = await modules!.issueService.transitionIssue(ctx, tenant.projectId, issue.id, {
        to: "RESOLVED",
      });
      expect(resolved.status).toBe("RESOLVED");

      // Content is frozen once resolved — no closure-note carve-out exists.
      await expect(
        modules!.issueService.updateIssue(ctx, tenant.projectId, issue.id, { title: "x" }),
      ).rejects.toThrow();

      const closed = await modules!.issueService.transitionIssue(ctx, tenant.projectId, issue.id, {
        to: "CLOSED",
      });
      expect(closed.status).toBe("CLOSED");

      await expect(
        modules!.issueService.transitionIssue(ctx, tenant.projectId, issue.id, { to: "OPEN" }),
      ).rejects.toThrow();
    });

    it("keeps ownership assignable through RESOLVED, frozen only at CLOSED", async () => {
      const issue = await modules!.issueService.createIssue(ctx, tenant.projectId, {
        identifier: identifierFor("iss"),
        title: "Owner test",
        description: "d",
        severity: "MEDIUM",
      });
      await modules!.issueService.transitionIssue(ctx, tenant.projectId, issue.id, { to: "RESOLVED" });

      const assigned = await modules!.issueService.assignIssueOwner(ctx, tenant.projectId, issue.id, {
        ownerId: tenant.userId,
      });
      expect(assigned.ownerId).toBe(tenant.userId);

      await modules!.issueService.transitionIssue(ctx, tenant.projectId, issue.id, { to: "CLOSED" });
      await expect(
        modules!.issueService.assignIssueOwner(ctx, tenant.projectId, issue.id, { ownerId: tenant.userId }),
      ).rejects.toThrow();
    });

    it("writes a real audit row for every mutation", async () => {
      const issue = await modules!.issueService.createIssue(ctx, tenant.projectId, {
        identifier: identifierFor("iss"),
        title: "Audit test",
        description: "d",
        severity: "LOW",
      });
      await modules!.issueService.assignIssueOwner(ctx, tenant.projectId, issue.id, {
        ownerId: tenant.userId,
      });

      const events = await modules!.auditLog.listAuditEventsForEntity({
        organizationId: tenant.organizationId,
        entityType: "Issue",
        entityId: issue.id,
      });
      expect(events.map((e) => e.action)).toEqual(
        expect.arrayContaining(["issue.created", "issue.owner_assigned"]),
      );
    });
  });

  // --- Traceability -------------------------------------------------------------

  describe("traceability", () => {
    it("links a risk to a requirement, a design item and a decision, and unlinks one", async () => {
      const requirement = await makeRequirement();
      const designItem = await makeDesignItem();
      const decision = await makeDecision();
      const risk = await modules!.riskService.createRisk(ctx, tenant.projectId, {
        identifier: identifierFor("rsk"),
        title: "Traceability test",
        description: "d",
      });

      const reqLink = await modules!.riskService.linkRisk(ctx, tenant.projectId, risk.id, {
        relation: "REQUIREMENT",
        targetId: requirement.id,
      });
      await modules!.riskService.linkRisk(ctx, tenant.projectId, risk.id, {
        relation: "DESIGN_ITEM",
        targetId: designItem.id,
      });
      await modules!.riskService.linkRisk(ctx, tenant.projectId, risk.id, {
        relation: "ENGINEERING_DECISION",
        targetId: decision.id,
      });

      const links = await modules!.riskService.listRiskLinks(ctx, tenant.projectId, risk.id);
      expect(links).toHaveLength(3);

      await modules!.riskService.unlinkRisk(ctx, tenant.projectId, risk.id, reqLink.id);
      const afterUnlink = await modules!.riskService.listRiskLinks(ctx, tenant.projectId, risk.id);
      expect(afterUnlink).toHaveLength(2);
      expect(afterUnlink.some((l) => l.relation === "REQUIREMENT")).toBe(false);
    });

    it("**rejects linking a risk to an artifact from another project**", async () => {
      const foreignRequirement = await makeRequirement(otherTenant.projectId);
      const risk = await modules!.riskService.createRisk(ctx, tenant.projectId, {
        identifier: identifierFor("rsk"),
        title: "Cross-project test",
        description: "d",
      });

      await expect(
        modules!.riskService.linkRisk(ctx, tenant.projectId, risk.id, {
          relation: "REQUIREMENT",
          targetId: foreignRequirement.id,
        }),
      ).rejects.toThrow(/does not exist in this project/i);
    });

    it("links an issue to a requirement and a design item", async () => {
      const requirement = await makeRequirement();
      const designItem = await makeDesignItem();
      const issue = await modules!.issueService.createIssue(ctx, tenant.projectId, {
        identifier: identifierFor("iss"),
        title: "Traceability test",
        description: "d",
        severity: "MEDIUM",
      });

      await modules!.issueService.linkIssue(ctx, tenant.projectId, issue.id, {
        relation: "REQUIREMENT",
        targetId: requirement.id,
      });
      await modules!.issueService.linkIssue(ctx, tenant.projectId, issue.id, {
        relation: "DESIGN_ITEM",
        targetId: designItem.id,
      });

      const links = await modules!.issueService.listIssueLinks(ctx, tenant.projectId, issue.id);
      expect(links).toHaveLength(2);
    });

    it("cascades risk and issue rows and their links when the project is deleted", async () => {
      const shortLived = await createTestTenant("risk-issue-cascade");
      try {
        const localCtx = { organizationId: shortLived.organizationId, actorId: shortLived.userId };
        const requirement = await makeRequirement(shortLived.projectId);
        const risk = await modules!.riskService.createRisk(localCtx, shortLived.projectId, {
          identifier: identifierFor("rsk"),
          title: "x",
          description: "d",
        });
        await modules!.riskService.linkRisk(localCtx, shortLived.projectId, risk.id, {
          relation: "REQUIREMENT",
          targetId: requirement.id,
        });

        await prisma.project.delete({ where: { id: shortLived.projectId } });

        expect(await prisma.risk.count({ where: { id: risk.id } })).toBe(0);
        expect(await prisma.riskRequirementLink.count({ where: { riskId: risk.id } })).toBe(0);
      } finally {
        await destroyTestTenant(shortLived);
      }
    });
  });

  // --- Graph integration ----------------------------------------------------

  describe("graph integration", () => {
    it("resolves a service-created risk link through the real graph, forward and reverse", async () => {
      const requirement = await makeRequirement();
      const risk = await modules!.riskService.createRisk(ctx, tenant.projectId, {
        identifier: identifierFor("rsk"),
        title: "Graph test",
        description: "d",
      });
      await modules!.riskService.linkRisk(ctx, tenant.projectId, risk.id, {
        relation: "REQUIREMENT",
        targetId: requirement.id,
      });

      const graphRepository = new modules!.graphRepo.EngineeringGraphRepository(prisma);

      const node = await graphRepository.getNode(tenant.projectId, { type: "RISK", id: risk.id });
      expect(node?.identifier).toBe(risk.identifier);

      const outgoing = await graphRepository.getOutgoingEdges(tenant.projectId, [
        { type: "RISK", id: risk.id },
      ]);
      const forward = outgoing.find((e) => e.type === "RISK_AFFECTS_REQUIREMENT");
      expect(forward?.target).toEqual({ type: "REQUIREMENT", id: requirement.id });

      const incoming = await graphRepository.getIncomingEdges(tenant.projectId, [
        { type: "REQUIREMENT", id: requirement.id },
      ]);
      expect(incoming.some((e) => e.type === "RISK_AFFECTS_REQUIREMENT" && e.source.id === risk.id)).toBe(
        true,
      );
    });

    it("**never resolves a risk from another project**", async () => {
      const risk = await modules!.riskService.createRisk(ctx, tenant.projectId, {
        identifier: identifierFor("rsk"),
        title: "Isolation test",
        description: "d",
      });

      const graphRepository = new modules!.graphRepo.EngineeringGraphRepository(prisma);
      const node = await graphRepository.getNode(otherTenant.projectId, { type: "RISK", id: risk.id });
      expect(node).toBeNull();
    });
  });

  // --- Change impact compatibility ---------------------------------------------

  describe("change impact compatibility", () => {
    it("reaches a risk and an issue declared as impacted by a real change, through the real engine", async () => {
      const risk = await modules!.riskService.createRisk(ctx, tenant.projectId, {
        identifier: identifierFor("rsk"),
        title: "Impact test",
        description: "d",
      });
      const issue = await modules!.issueService.createIssue(ctx, tenant.projectId, {
        identifier: identifierFor("iss"),
        title: "Impact test",
        description: "d",
        severity: "LOW",
      });
      const change = await prisma.changeRequest.create({
        data: {
          projectId: tenant.projectId,
          identifier: identifierFor("cr"),
          title: "Raise the pressure limit",
          description: "d",
          reason: "d",
          requestedById: tenant.userId,
        },
      });

      await modules!.changeRequestService.addDeclaredImpact(ctx, tenant.projectId, change.id, {
        target: { type: "RISK", id: risk.id },
      });
      await modules!.changeRequestService.addDeclaredImpact(ctx, tenant.projectId, change.id, {
        target: { type: "ISSUE", id: issue.id },
      });

      const report = await modules!.impact.changeImpactAnalysisService.runImpactAnalysis(
        ctx,
        tenant.projectId,
        change.id,
      );

      expect(report.analysis.status).toBe("COMPLETED");
      const roots = await prisma.impactAnalysisRoot.findMany({ where: { analysisId: report.analysis.id } });
      const rootTypes = roots.map((r) => `${r.nodeType}:${r.nodeId}`);
      expect(rootTypes).toContain(`RISK:${risk.id}`);
      expect(rootTypes).toContain(`ISSUE:${issue.id}`);
    });
  });

  // --- Technical readiness compatibility ---------------------------------------

  describe("technical readiness compatibility", () => {
    it("consumes a real OPEN risk and a real CRITICAL issue without inventing a score", async () => {
      await modules!.riskService.createRisk(ctx, tenant.projectId, {
        identifier: identifierFor("rsk"),
        title: "Readiness test",
        description: "d",
      });
      await modules!.issueService.createIssue(ctx, tenant.projectId, {
        identifier: identifierFor("iss"),
        title: "Readiness test",
        description: "d",
        severity: "CRITICAL",
      });

      const report = await modules!.technical.technicalReadinessService.evaluateTechnicalReadiness(
        ctx,
        tenant.projectId,
        { gate: "SYSTEM_DEFINITION" },
      );

      const issueFinding = report.findings.find((f) => f.ruleId === "TR-ISS-001");
      expect(issueFinding?.status).toBe("BLOCKING");
      // No numeric score, percentage or probability anywhere in the report.
      expect(JSON.stringify(report)).not.toMatch(/score|probability|percent/i);
    });
  });

  // --- Certification compatibility ----------------------------------------------

  describe("certification compatibility", () => {
    it("links a compliance item to a real risk and a real issue, and the review reads them back", async () => {
      const program = await modules!.programRepo.createProgram({
        projectId: tenant.projectId,
        identifier: identifierFor("cert"),
        name: "Cabin systems certification effort",
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
        createdById: tenant.userId,
      });
      const basis = await modules!.basisRepo.activateBasis(draftBasis.id, tenant.userId);
      const item = await modules!.itemService.complianceItemService.createItem(
        ctx,
        tenant.projectId,
        basis.id,
        { identifier: identifierFor("ci"), title: "Structural margin" },
      );

      const risk = await modules!.riskService.createRisk(ctx, tenant.projectId, {
        identifier: identifierFor("rsk"),
        title: "Certification test",
        description: "d",
      });
      const issue = await modules!.issueService.createIssue(ctx, tenant.projectId, {
        identifier: identifierFor("iss"),
        title: "Certification test",
        description: "d",
        severity: "LOW",
      });

      await modules!.itemService.complianceItemService.addLink(ctx, tenant.projectId, item.id, {
        linkType: "RISK",
        targetId: risk.id,
      });
      await modules!.itemService.complianceItemService.addLink(ctx, tenant.projectId, item.id, {
        linkType: "ISSUE",
        targetId: issue.id,
      });

      const links = await modules!.itemService.complianceItemService.listLinks(ctx, tenant.projectId, item.id);
      expect(links.some((l) => l.linkType === "RISK" && l.targetId === risk.id)).toBe(true);
      expect(links.some((l) => l.linkType === "ISSUE" && l.targetId === issue.id)).toBe(true);

      // The review runs without error over a basis that includes risk/issue
      // supporting links — it never claims a regulatory disposition.
      const review = await modules!.review.certificationReviewService.evaluateCertificationReview(
        ctx,
        tenant.projectId,
        {},
      );
      expect(JSON.stringify(review)).not.toMatch(/\bcertified\b|FAA compliant|EASA approved/i);
    });
  });

  // --- Sentinel compatibility -----------------------------------------------

  describe("sentinel compatibility", () => {
    it("detects a real risk change and opens a real surveillance target for the technical readiness gate it reaches", async () => {
      const risk = await modules!.riskService.createRisk(ctx, tenant.projectId, {
        identifier: identifierFor("rsk"),
        title: "Sentinel test",
        description: "d",
      });
      // An OPEN risk is in scope for every gate — evaluate one for real, so a
      // real assessment now references it.
      await modules!.technical.technicalReadinessService.evaluateTechnicalReadiness(ctx, tenant.projectId, {
        gate: "SYSTEM_DEFINITION",
      });

      // A real content change to the risk.
      await modules!.riskService.updateRisk(ctx, tenant.projectId, risk.id, {
        title: "Sentinel test (revised)",
      });

      const summary = await modules!.sentinel.decisionSentinelService.detectProjectChanges(
        ctx,
        tenant.projectId,
      );
      expect(summary.eventsCreated).toBeGreaterThanOrEqual(1);

      const open = await modules!.sentinel.decisionSentinelService.listOpenSurveillance(
        ctx,
        tenant.projectId,
      );
      const target = open.find((t) => t.targetType === "TECHNICAL_READINESS" && t.sourceId === risk.id);
      expect(target).toBeDefined();
      expect(target?.sourceType).toBe("RISK");
      expect(target?.targetId).toBe("SYSTEM_DEFINITION");
    });

    it("**never opens a CERTIFICATION_REVIEW target for a risk or issue change — no such dependency exists**", async () => {
      // A compliance item may link to a risk as supporting context, but that
      // link is excluded from the review's own basis and fingerprint, so a
      // risk change can never make a review stale — the registry correctly
      // has no such row, and this proves detection never invents the target.
      const program = await modules!.programRepo.createProgram({
        projectId: tenant.projectId,
        identifier: identifierFor("cert"),
        name: "No-op certification test",
        description: null,
        ownerId: null,
      });
      const draftBasis = await modules!.basisRepo.createBasis({
        certificationProgramId: program.id,
        identifier: identifierFor("cb"),
        title: "Basis",
        description: null,
        revision: "1",
        sourceReference: "ref",
        createdById: tenant.userId,
      });
      const basis = await modules!.basisRepo.activateBasis(draftBasis.id, tenant.userId);
      const item = await modules!.itemService.complianceItemService.createItem(
        ctx,
        tenant.projectId,
        basis.id,
        { identifier: identifierFor("ci"), title: "Risk-linked item" },
      );
      const risk = await modules!.riskService.createRisk(ctx, tenant.projectId, {
        identifier: identifierFor("rsk"),
        title: "No-op test",
        description: "d",
      });
      await modules!.itemService.complianceItemService.addLink(ctx, tenant.projectId, item.id, {
        linkType: "RISK",
        targetId: risk.id,
      });
      await modules!.review.certificationReviewService.evaluateCertificationReview(ctx, tenant.projectId, {});

      await modules!.riskService.updateRisk(ctx, tenant.projectId, risk.id, { title: "No-op test (revised)" });
      await modules!.sentinel.decisionSentinelService.detectProjectChanges(ctx, tenant.projectId);

      const open = await modules!.sentinel.decisionSentinelService.listOpenSurveillance(
        ctx,
        tenant.projectId,
      );
      expect(open.some((t) => t.targetType === "CERTIFICATION_REVIEW" && t.sourceId === risk.id)).toBe(
        false,
      );
    });

    it("**never creates a surveillance target for a risk change no consulted basis references**", async () => {
      const risk = await modules!.riskService.createRisk(ctx, tenant.projectId, {
        identifier: identifierFor("rsk"),
        title: "Unreferenced risk",
        description: "d",
      });
      await modules!.riskService.updateRisk(ctx, tenant.projectId, risk.id, { title: "Still unreferenced" });

      await modules!.sentinel.decisionSentinelService.detectProjectChanges(ctx, tenant.projectId);

      const open = await modules!.sentinel.decisionSentinelService.listOpenSurveillance(
        ctx,
        tenant.projectId,
      );
      expect(open.some((t) => t.sourceId === risk.id)).toBe(false);
    });
  });
});
