import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
 * Decision memory against real PostgreSQL.
 *
 * The unit suite fakes the repositories, so it proves the service's rules but
 * nothing about the queries beneath them. This runs them: the scoped child
 * lookups, the five link tables and their composite keys, the 1:1 expectation
 * constraint, enum defaults and cascade behavior.
 *
 * Repositories are imported dynamically because importing them pulls in
 * `@/config/env`, which refuses to load without DATABASE_URL. With no
 * database the suite skips rather than erroring.
 */

const repos = databaseAvailable
  ? {
      decision: await import("@/server/repositories/engineering-decision.repository"),
      alternative: await import("@/server/repositories/decision-alternative.repository"),
      assumption: await import("@/server/repositories/decision-assumption.repository"),
      expectation: await import("@/server/repositories/decision-expectation.repository"),
      requirement: await import("@/server/repositories/requirement.repository"),
      design: await import("@/server/repositories/design-item.repository"),
      artifacts: await import("@/server/repositories/project-artifacts.repository"),
      audit: await import("@/server/repositories/audit-log.repository"),
    }
  : null;

describe.skipIf(!databaseAvailable)(`decision memory against PostgreSQL (${SKIP_REASON})`, () => {
  let tenant: TestTenant;
  let otherTenant: TestTenant;

  beforeAll(async () => {
    tenant = await createTestTenant("decisions");
    otherTenant = await createTestTenant("decisions-other");
  });

  afterAll(async () => {
    if (tenant) await destroyTestTenant(tenant);
    if (otherTenant) await destroyTestTenant(otherTenant);
    await disconnectIntegrationPrisma();
  });

  async function makeDecision(identifier: string, projectId = tenant.projectId) {
    return repos!.decision.createDecision({
      projectId,
      identifier,
      title: `Decision ${identifier}`,
      statement: "We will do the thing.",
      rationale: "Because the alternative was worse.",
      ownerId: null,
      decidedAt: null,
    });
  }

  describe("decisions", () => {
    it("inserts, reads back and orders by identifier", async () => {
      await makeDecision("ED-020");
      await makeDecision("ED-010");

      const listed = await repos!.decision.listDecisionsInProject(tenant.projectId);

      expect(listed.map((row) => row.identifier)).toEqual(["ED-010", "ED-020"]);
      expect(listed[0]?.status).toBe("PROPOSED");
      expect(listed[0]).toHaveProperty("owner", null);
    });

    it("enforces the project-scoped unique identifier", async () => {
      await expect(makeDecision("ED-010")).rejects.toMatchObject({ statusCode: 409 });

      // The same identifier is fine in a different project.
      const elsewhere = await makeDecision("ED-010", otherTenant.projectId);
      expect(elsewhere.identifier).toBe("ED-010");
    });

    it("scopes lookup to the project", async () => {
      const mine = await makeDecision("ED-030");

      await expect(
        repos!.decision.findDecisionInProject(tenant.projectId, mine.id),
      ).resolves.toMatchObject({ id: mine.id });
      await expect(
        repos!.decision.findDecisionInProject(otherTenant.projectId, mine.id),
      ).resolves.toBeNull();
    });

    it("filters by status and records an owner", async () => {
      const decision = await makeDecision("ED-040");
      await repos!.decision.updateDecision(decision.id, {
        status: "UNDER_REVIEW",
        ownerId: tenant.userId,
      });

      const underReview = await repos!.decision.listDecisionsInProject(tenant.projectId, {
        status: "UNDER_REVIEW",
      });

      expect(underReview.map((row) => row.identifier)).toEqual(["ED-040"]);
      expect(underReview[0]?.owner).toMatchObject({ id: tenant.userId });
      // The owner select must never carry credential fields.
      expect(Object.keys(underReview[0]?.owner ?? {}).sort()).toEqual(["email", "id", "name"]);
    });
  });

  describe("alternatives", () => {
    it("inserts, lists in creation order, updates and deletes", async () => {
      const decision = await makeDecision("ED-100");

      const first = await repos!.alternative.createAlternative({
        engineeringDecisionId: decision.id,
        title: "Ablative liner",
        description: "Consumable liner.",
        reasonRejected: "Mass.",
      });
      await repos!.alternative.createAlternative({
        engineeringDecisionId: decision.id,
        title: "Film cooling",
        description: null,
        reasonRejected: null,
      });

      const listed = await repos!.alternative.listAlternatives(decision.id);
      expect(listed.map((row) => row.title)).toEqual(["Ablative liner", "Film cooling"]);

      await repos!.alternative.updateAlternative(first.id, {
        reasonRejected: "Mass and refurbishment cost.",
      });
      const reloaded = await repos!.alternative.findAlternativeForDecision(decision.id, first.id);
      expect(reloaded?.reasonRejected).toBe("Mass and refurbishment cost.");

      expect(await repos!.alternative.deleteAlternative(decision.id, first.id)).toBe(1);
      expect(await repos!.alternative.listAlternatives(decision.id)).toHaveLength(1);
    });

    it("cannot be reached through the wrong decision", async () => {
      const mine = await makeDecision("ED-110");
      const other = await makeDecision("ED-111");

      const alternative = await repos!.alternative.createAlternative({
        engineeringDecisionId: mine.id,
        title: "Scoped",
        description: null,
        reasonRejected: null,
      });

      // The scoped lookup and delete both key on the decision as well as the id.
      await expect(
        repos!.alternative.findAlternativeForDecision(other.id, alternative.id),
      ).resolves.toBeNull();
      expect(await repos!.alternative.deleteAlternative(other.id, alternative.id)).toBe(0);
      // Still present under its real parent.
      await expect(
        repos!.alternative.findAlternativeForDecision(mine.id, alternative.id),
      ).resolves.not.toBeNull();
    });
  });

  describe("assumptions", () => {
    it("defaults to UNKNOWN and only changes when told", async () => {
      const decision = await makeDecision("ED-200");

      const assumption = await repos!.assumption.createAssumption({
        engineeringDecisionId: decision.id,
        statement: "Coolant flow stays above 2.4 kg/s.",
        rationale: null,
      });

      // Recording an assumption is not a claim that it has been checked.
      expect(assumption.status).toBe("UNKNOWN");

      const updated = await repos!.assumption.updateAssumption(assumption.id, {
        status: "INVALIDATED",
        rationale: "Test campaign showed 2.1 kg/s.",
      });
      expect(updated.status).toBe("INVALIDATED");

      const listed = await repos!.assumption.listAssumptions(decision.id);
      expect(listed).toHaveLength(1);
      expect(listed[0]?.status).toBe("INVALIDATED");
    });

    it("accepts an explicitly supplied initial status", async () => {
      const decision = await makeDecision("ED-210");

      const assumption = await repos!.assumption.createAssumption({
        engineeringDecisionId: decision.id,
        statement: "Supplier lead time holds.",
        status: "ACTIVE",
        rationale: null,
      });

      expect(assumption.status).toBe("ACTIVE");
    });

    it("cannot be reached through the wrong decision", async () => {
      const mine = await makeDecision("ED-220");
      const other = await makeDecision("ED-221");

      const assumption = await repos!.assumption.createAssumption({
        engineeringDecisionId: mine.id,
        statement: "Scoped.",
        rationale: null,
      });

      await expect(
        repos!.assumption.findAssumptionForDecision(other.id, assumption.id),
      ).resolves.toBeNull();
      expect(await repos!.assumption.deleteAssumption(other.id, assumption.id)).toBe(0);
    });
  });

  describe("expectation", () => {
    it("is one per decision, and replacing it updates rather than duplicates", async () => {
      const decision = await makeDecision("ED-300");

      const created = await repos!.expectation.setExpectation({
        engineeringDecisionId: decision.id,
        statement: "Wall temperature stays below limit.",
        measure: "Peak wall temperature",
        expectedValue: "< 800",
        unit: "K",
        comparisonOperator: null,
        dueAt: null,
        actualValue: null,
        observedAt: null,
      });

      expect(created.status).toBe("NOT_OBSERVED");
      expect(created.actualValue).toBeNull();
      expect(created.comparisonOperator).toBeNull();

      // The upsert path: same decision, second call. Also exercises the new
      // column round-tripping through real PostgreSQL rather than just the
      // in-memory domain layer.
      const replaced = await repos!.expectation.setExpectation({
        engineeringDecisionId: decision.id,
        statement: "Wall temperature stays below limit.",
        measure: "Peak wall temperature",
        expectedValue: "800",
        unit: "K",
        comparisonOperator: "LESS_THAN_OR_EQUAL",
        dueAt: null,
        status: "BREACHED",
        actualValue: "870",
        observedAt: new Date("2026-05-01T00:00:00.000Z"),
      });

      expect(replaced.id).toBe(created.id);
      expect(replaced.status).toBe("BREACHED");
      // Expected survives the observation — that is the whole point.
      expect(replaced.expectedValue).toBe("800");
      expect(replaced.actualValue).toBe("870");
      expect(replaced.comparisonOperator).toBe("LESS_THAN_OR_EQUAL");

      // Read back through a fresh query, not just the upsert's own return
      // value, to prove the operator is genuinely persisted rather than
      // merely echoed back in memory.
      const reread = await repos!.expectation.findExpectation(decision.id);
      expect(reread?.comparisonOperator).toBe("LESS_THAN_OR_EQUAL");

      expect(await repos!.expectation.deleteExpectation(decision.id)).toBe(1);
      await expect(repos!.expectation.findExpectation(decision.id)).resolves.toBeNull();
    });

    it("persists a null comparison operator distinctly from an unset one", async () => {
      // A NULL column and a row that never had the field touched must read
      // back identically — there is no third state.
      const decision = await makeDecision("ED-305");

      const created = await repos!.expectation.setExpectation({
        engineeringDecisionId: decision.id,
        statement: "Coolant flow is sufficient.",
        measure: null,
        expectedValue: null,
        unit: null,
        comparisonOperator: null,
        dueAt: null,
        actualValue: null,
        observedAt: null,
      });

      expect(created.comparisonOperator).toBeNull();

      const reread = await repos!.expectation.findExpectation(decision.id);
      expect(reread?.comparisonOperator).toBeNull();
    });

    it("rejects a second expectation row for the same decision", async () => {
      const decision = await makeDecision("ED-310");
      await integrationPrisma!.decisionExpectation.create({
        data: { engineeringDecisionId: decision.id, statement: "First." },
      });

      await expect(
        integrationPrisma!.decisionExpectation.create({
          data: { engineeringDecisionId: decision.id, statement: "Second." },
        }),
      ).rejects.toMatchObject({ code: "P2002" });
    });
  });

  describe("traceability", () => {
    it("writes, reads and removes edges across every decision relation", async () => {
      const decision = await makeDecision("ED-400");

      const requirement = await repos!.requirement.createRequirement({
        projectId: tenant.projectId,
        identifier: "REQ-400",
        title: "Chamber pressure",
        statement: "The engine shall not exceed 120 bar.",
      });
      const design = await repos!.design.createDesignItem({
        projectId: tenant.projectId,
        identifier: "DI-400",
        name: "Chamber",
        description: null,
        itemType: "COMPONENT",
        ownerId: null,
      });
      const risk = await integrationPrisma!.risk.create({
        data: {
          projectId: tenant.projectId,
          identifier: "RSK-400",
          title: "Thermal margin",
          description: "Margin may be insufficient.",
        },
      });
      const issue = await integrationPrisma!.issue.create({
        data: {
          projectId: tenant.projectId,
          identifier: "ISS-400",
          title: "Coolant channel tolerance",
          description: "Machining tolerance out of spec.",
        },
      });
      const evidence = await integrationPrisma!.evidence.create({
        data: {
          projectId: tenant.projectId,
          identifier: "EV-400",
          title: "Hot fire report",
          evidenceType: "TEST_RESULT",
          sourceReference: "TR-2026-014",
        },
      });

      const targets = [
        { relation: "REQUIREMENT" as const, id: requirement.id },
        { relation: "DESIGN_ITEM" as const, id: design.id },
        { relation: "RISK" as const, id: risk.id },
        { relation: "ISSUE" as const, id: issue.id },
        { relation: "EVIDENCE" as const, id: evidence.id },
      ];

      for (const target of targets) {
        // Each hits a different join table with its own composite key.
        await repos!.decision.createDecisionLink({
          engineeringDecisionId: decision.id,
          relation: target.relation,
          targetId: target.id,
          createdById: tenant.userId,
        });
      }

      const links = await repos!.decision.listDecisionLinks(decision.id);
      expect(links).toHaveLength(5);
      expect(links.map((link) => link.relation).sort()).toEqual([
        "DESIGN_ITEM",
        "EVIDENCE",
        "ISSUE",
        "REQUIREMENT",
        "RISK",
      ]);
      // Design items name their heading `name`; evidence has no identifier and
      // falls back to its source reference. Both are normalized by the mapper.
      expect(links.find((l) => l.relation === "DESIGN_ITEM")).toMatchObject({ title: "Chamber" });
      expect(links.find((l) => l.relation === "EVIDENCE")).toMatchObject({
        identifier: "TR-2026-014",
        title: "Hot fire report",
      });

      // Re-adding is idempotent, not a duplicate row.
      await repos!.decision.createDecisionLink({
        engineeringDecisionId: decision.id,
        relation: "RISK",
        targetId: risk.id,
        createdById: tenant.userId,
      });
      expect(await repos!.decision.listDecisionLinks(decision.id)).toHaveLength(5);

      expect(
        await repos!.decision.deleteDecisionLink({
          engineeringDecisionId: decision.id,
          relation: "EVIDENCE",
          targetId: evidence.id,
        }),
      ).toBe(1);
      expect(await repos!.decision.listDecisionLinks(decision.id)).toHaveLength(4);
    });

    it("confirms link targets only within their own project", async () => {
      const localRequirement = await repos!.requirement.createRequirement({
        projectId: tenant.projectId,
        identifier: "REQ-410",
        title: "Local",
        statement: "Local.",
      });
      const foreignRequirement = await repos!.requirement.createRequirement({
        projectId: otherTenant.projectId,
        identifier: "REQ-410",
        title: "Foreign",
        statement: "Foreign.",
      });

      await expect(
        repos!.decision.decisionLinkTargetExistsInProject(
          "REQUIREMENT",
          localRequirement.id,
          tenant.projectId,
        ),
      ).resolves.toBe(true);
      // This is the query that makes cross-project links impossible.
      await expect(
        repos!.decision.decisionLinkTargetExistsInProject(
          "REQUIREMENT",
          foreignRequirement.id,
          tenant.projectId,
        ),
      ).resolves.toBe(false);
    });

    it("appears from the requirement and design item sides too", async () => {
      const decision = await makeDecision("ED-420");
      const requirement = await repos!.requirement.createRequirement({
        projectId: tenant.projectId,
        identifier: "REQ-420",
        title: "Two-way",
        statement: "Readable from both ends.",
      });
      const design = await repos!.design.createDesignItem({
        projectId: tenant.projectId,
        identifier: "DI-420",
        name: "Two-way item",
        description: null,
        itemType: "COMPONENT",
        ownerId: null,
      });

      await repos!.decision.createDecisionLink({
        engineeringDecisionId: decision.id,
        relation: "REQUIREMENT",
        targetId: requirement.id,
        createdById: null,
      });
      await repos!.decision.createDecisionLink({
        engineeringDecisionId: decision.id,
        relation: "DESIGN_ITEM",
        targetId: design.id,
        createdById: null,
      });

      // The requirement module reads the same edge from its own side.
      const requirementLinks = await repos!.requirement.listRequirementLinks(requirement.id);
      expect(
        requirementLinks.find((link) => link.relation === "ENGINEERING_DECISION"),
      ).toMatchObject({ identifier: "ED-420" });

      // And the design item detail shows it.
      await expect(
        repos!.design.listDecisionsForDesignItem(design.id),
      ).resolves.toMatchObject([{ identifier: "ED-420" }]);
    });

    it("offers project-scoped decision link targets", async () => {
      const targets = await repos!.artifacts.listDecisionLinkTargets(tenant.projectId);

      expect(Object.keys(targets).sort()).toEqual([
        "DESIGN_ITEM",
        "EVIDENCE",
        "ISSUE",
        "REQUIREMENT",
        "RISK",
      ]);
      expect(targets.REQUIREMENT.length).toBeGreaterThan(0);

      const foreign = await repos!.artifacts.listDecisionLinkTargets(otherTenant.projectId);
      expect(foreign.REQUIREMENT.map((row) => row.title)).not.toContain("Chamber pressure");
    });

    it("still populates the requirement module's decision selector", async () => {
      const targets = await repos!.artifacts.listLinkTargets(tenant.projectId);
      // Requirement traceability can now find real decisions.
      expect(targets.ENGINEERING_DECISION.length).toBeGreaterThan(0);
    });
  });

  describe("audit and cascade", () => {
    it("records and reads back decision history scoped to the organization", async () => {
      const decision = await makeDecision("ED-500");

      await repos!.audit.recordAuditEvent({
        organizationId: tenant.organizationId,
        actorId: tenant.userId,
        action: "decision.status_transitioned",
        entityType: "EngineeringDecision",
        entityId: decision.id,
        metadata: { from: "PROPOSED", to: "UNDER_REVIEW" },
      });

      const history = await repos!.audit.listAuditEventsForEntity({
        organizationId: tenant.organizationId,
        entityType: "EngineeringDecision",
        entityId: decision.id,
      });

      expect(history).toHaveLength(1);
      expect(history[0]?.metadata).toEqual({ from: "PROPOSED", to: "UNDER_REVIEW" });
      expect(history[0]?.actor).toMatchObject({ id: tenant.userId });

      // Another organization cannot read it, even knowing the id.
      await expect(
        repos!.audit.listAuditEventsForEntity({
          organizationId: otherTenant.organizationId,
          entityType: "EngineeringDecision",
          entityId: decision.id,
        }),
      ).resolves.toEqual([]);
    });

    it("cascades a deleted decision to its memory records", async () => {
      const decision = await makeDecision("ED-600");

      const alternative = await repos!.alternative.createAlternative({
        engineeringDecisionId: decision.id,
        title: "Doomed",
        description: null,
        reasonRejected: null,
      });
      const assumption = await repos!.assumption.createAssumption({
        engineeringDecisionId: decision.id,
        statement: "Doomed.",
        rationale: null,
      });
      await repos!.expectation.setExpectation({
        engineeringDecisionId: decision.id,
        statement: "Doomed.",
        measure: null,
        expectedValue: null,
        unit: null,
        comparisonOperator: null,
        dueAt: null,
        actualValue: null,
        observedAt: null,
      });

      await integrationPrisma!.engineeringDecision.delete({ where: { id: decision.id } });

      await expect(
        integrationPrisma!.decisionAlternative.findUnique({ where: { id: alternative.id } }),
      ).resolves.toBeNull();
      await expect(
        integrationPrisma!.decisionAssumption.findUnique({ where: { id: assumption.id } }),
      ).resolves.toBeNull();
      await expect(repos!.expectation.findExpectation(decision.id)).resolves.toBeNull();
    });
  });
});
