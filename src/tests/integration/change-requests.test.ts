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
 * Change requests and declared impacts against real PostgreSQL.
 *
 * The unit suite fakes the repositories, so it proves the service's rules but
 * nothing about the queries beneath them. This runs them: the project-scoped
 * lookups, the composite unique key on identifier, the polymorphic impact
 * columns and their CHECK constraint, the parent-scoped child lookup, the
 * foreign keys and their cascades, and the audit metadata round-trip.
 *
 * Repositories are imported dynamically because importing them pulls in
 * `@/config/env`, which refuses to load without DATABASE_URL. With no database
 * the suite skips rather than erroring.
 */

const repos = databaseAvailable
  ? {
      change: await import("@/server/repositories/change-request.repository"),
      artifacts: await import("@/server/repositories/project-artifacts.repository"),
      audit: await import("@/server/repositories/audit-log.repository"),
    }
  : null;

describe.skipIf(!databaseAvailable)(`change requests against PostgreSQL (${SKIP_REASON})`, () => {
  const prisma = integrationPrisma!;

  let tenant: TestTenant;
  let otherTenant: TestTenant;

  const ids = {
    requirement: "",
    designItem: "",
    decision: "",
    verification: "",
    risk: "",
    issue: "",
    foreignRequirement: "",
  };

  beforeAll(async () => {
    tenant = await createTestTenant("changes");
    otherTenant = await createTestTenant("changes-other");

    const projectId = tenant.projectId;

    const requirement = await prisma.requirement.create({
      data: {
        projectId,
        identifier: "REQ-001",
        title: "Maximum chamber pressure",
        statement: "The engine shall not exceed 120 bar.",
      },
    });
    ids.requirement = requirement.id;

    const designItem = await prisma.designItem.create({
      data: {
        projectId,
        identifier: "DI-001",
        name: "Combustion chamber",
        itemType: "COMPONENT",
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
      },
    });
    ids.decision = decision.id;

    const verification = await prisma.verificationActivity.create({
      data: { projectId, identifier: "VA-001", title: "Hot fire test", method: "TEST" },
    });
    ids.verification = verification.id;

    const risk = await prisma.risk.create({
      data: {
        projectId,
        identifier: "RISK-001",
        title: "Coolant channel blockage",
        description: "Debris could block a cooling channel.",
      },
    });
    ids.risk = risk.id;

    const issue = await prisma.issue.create({
      data: {
        projectId,
        identifier: "ISS-001",
        title: "Weld porosity",
        description: "Porosity found in the chamber weld.",
      },
    });
    ids.issue = issue.id;

    // A requirement in a different project, used to prove the scoped target
    // check actually reads the project column.
    const foreignRequirement = await prisma.requirement.create({
      data: {
        projectId: otherTenant.projectId,
        identifier: "REQ-900",
        title: "Someone else's requirement",
        statement: "Not ours.",
      },
    });
    ids.foreignRequirement = foreignRequirement.id;
  });

  afterAll(async () => {
    if (tenant) await destroyTestTenant(tenant);
    if (otherTenant) await destroyTestTenant(otherTenant);
    await disconnectIntegrationPrisma();
  });

  async function makeChange(identifier: string, projectId = tenant.projectId) {
    return repos!.change.createChangeRequest({
      projectId,
      identifier,
      title: `Change ${identifier}`,
      description: "Raise the chamber pressure limit to 130 bar.",
      reason: "Performance shortfall found in hot fire.",
      status: "DRAFT",
      requestedById: tenant.userId,
    });
  }

  describe("persistence", () => {
    it("inserts a change and reads it back", async () => {
      const created = await makeChange("CR-001");

      expect(created.status).toBe("DRAFT");
      expect(created.requestedById).toBe(tenant.userId);

      const read = await repos!.change.findChangeRequestInProject(tenant.projectId, created.id);
      expect(read).toEqual(created);
    });

    it("refuses a duplicate identifier inside one project", async () => {
      await makeChange("CR-DUP");

      // The composite unique key is (projectId, identifier); the repository
      // translates the violation into a conflict rather than leaking Prisma.
      await expect(makeChange("CR-DUP")).rejects.toThrow(/already exists/i);
    });

    it("allows the same identifier in a different project", async () => {
      const mine = await makeChange(`CR-${uniqueSuffix("s").slice(0, 6).toUpperCase()}`);
      const theirs = await repos!.change.createChangeRequest({
        projectId: otherTenant.projectId,
        identifier: mine.identifier,
        title: "Same key, different programme",
        description: "Two programmes may both have a CR-001.",
        reason: "Identifiers are project-scoped.",
        status: "DRAFT",
        requestedById: otherTenant.userId,
      });

      expect(theirs.identifier).toBe(mine.identifier);
      expect(theirs.projectId).not.toBe(mine.projectId);
    });

    it("does not find a change through another project", async () => {
      const created = await makeChange("CR-SCOPE");

      const leaked = await repos!.change.findChangeRequestInProject(
        otherTenant.projectId,
        created.id,
      );
      expect(leaked).toBeNull();
    });

    it("persists a lifecycle transition", async () => {
      const created = await makeChange("CR-LIFE");

      const submitted = await repos!.change.updateChangeRequest(created.id, {
        status: "SUBMITTED",
      });
      expect(submitted.status).toBe("SUBMITTED");

      const reread = await repos!.change.findChangeRequestInProject(
        tenant.projectId,
        created.id,
      );
      expect(reread?.status).toBe("SUBMITTED");
      expect(reread?.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
    });

    it("lists newest first, scoped to the project", async () => {
      const listed = await repos!.change.listChangeRequestsInProject({
        projectId: tenant.projectId,
      });

      expect(listed.length).toBeGreaterThan(0);
      expect(listed.every((row) => row.projectId === tenant.projectId)).toBe(true);
      expect(listed[0]?.requestedBy?.id).toBe(tenant.userId);

      const timestamps = listed.map((row) => row.createdAt.getTime());
      expect([...timestamps].sort((a, b) => b - a)).toEqual(timestamps);
    });

    it("filters by status", async () => {
      const listed = await repos!.change.listChangeRequestsInProject({
        projectId: tenant.projectId,
        status: "SUBMITTED",
      });

      expect(listed.length).toBeGreaterThan(0);
      expect(listed.every((row) => row.status === "SUBMITTED")).toBe(true);
    });
  });

  describe("declared impacts", () => {
    it("records an impact on every supported target type", async () => {
      const change = await makeChange("CR-TARGETS");

      const targets = [
        { type: "REQUIREMENT" as const, id: ids.requirement },
        { type: "DESIGN_ITEM" as const, id: ids.designItem },
        { type: "ENGINEERING_DECISION" as const, id: ids.decision },
        { type: "VERIFICATION_ACTIVITY" as const, id: ids.verification },
        { type: "RISK" as const, id: ids.risk },
        { type: "ISSUE" as const, id: ids.issue },
      ];

      for (const target of targets) {
        await repos!.change.createDeclaredImpact({
          changeRequestId: change.id,
          type: target.type,
          targetId: target.id,
          note: `Declared against ${target.type}.`,
          createdById: tenant.userId,
        });
      }

      const impacts = await repos!.change.listDeclaredImpacts(change.id);

      expect(impacts).toHaveLength(6);
      expect(impacts.map((impact) => impact.target.type).sort()).toEqual(
        targets.map((target) => target.type).sort(),
      );
      // The identity is resolved from the target's own table, not guessed.
      const requirementImpact = impacts.find((i) => i.target.type === "REQUIREMENT");
      expect(requirementImpact?.targetIdentifier).toBe("REQ-001");
      expect(requirementImpact?.targetTitle).toBe("Maximum chamber pressure");
      expect(requirementImpact?.createdBy?.id).toBe(tenant.userId);
      // Design items name their heading `name`; the mapper reads the right one.
      expect(impacts.find((i) => i.target.type === "DESIGN_ITEM")?.targetTitle).toBe(
        "Combustion chamber",
      );
    });

    it("refuses the same target twice on one change", async () => {
      const change = await makeChange("CR-DUPIMPACT");

      await repos!.change.createDeclaredImpact({
        changeRequestId: change.id,
        type: "REQUIREMENT",
        targetId: ids.requirement,
        note: null,
        createdById: tenant.userId,
      });

      await expect(
        repos!.change.createDeclaredImpact({
          changeRequestId: change.id,
          type: "REQUIREMENT",
          targetId: ids.requirement,
          note: null,
          createdById: tenant.userId,
        }),
      ).rejects.toThrow(/already declared/i);
    });

    it("rejects a target that does not exist at all", async () => {
      const change = await makeChange("CR-GHOST");

      // The foreign key is what refuses it: a declaration cannot point at
      // nothing.
      await expect(
        repos!.change.createDeclaredImpact({
          changeRequestId: change.id,
          type: "REQUIREMENT",
          targetId: "req000000000000000000000",
          note: null,
          createdById: tenant.userId,
        }),
      ).rejects.toThrow();
    });

    it("sees a target from another project as absent when scoped", async () => {
      // The row would insert — nothing in the schema forbids it — which is
      // exactly why the service checks the project first.
      expect(
        await repos!.change.changeImpactTargetExistsInProject(
          "REQUIREMENT",
          ids.foreignRequirement,
          tenant.projectId,
        ),
      ).toBe(false);

      expect(
        await repos!.change.changeImpactTargetExistsInProject(
          "REQUIREMENT",
          ids.requirement,
          tenant.projectId,
        ),
      ).toBe(true);
    });

    it("checks existence per target type against the right table", async () => {
      // A design item id is not a requirement id, even inside the same project.
      expect(
        await repos!.change.changeImpactTargetExistsInProject(
          "REQUIREMENT",
          ids.designItem,
          tenant.projectId,
        ),
      ).toBe(false);
      expect(
        await repos!.change.changeImpactTargetExistsInProject(
          "DESIGN_ITEM",
          ids.designItem,
          tenant.projectId,
        ),
      ).toBe(true);
    });

    it("finds a child only through its own parent change", async () => {
      const mine = await makeChange("CR-PARENT-A");
      const other = await makeChange("CR-PARENT-B");

      const impactId = await repos!.change.createDeclaredImpact({
        changeRequestId: mine.id,
        type: "REQUIREMENT",
        targetId: ids.requirement,
        note: null,
        createdById: tenant.userId,
      });

      expect(await repos!.change.findDeclaredImpactForChange(mine.id, impactId)).not.toBeNull();
      // Guessing the id from a different change finds nothing, so nothing there
      // can be deleted.
      expect(await repos!.change.findDeclaredImpactForChange(other.id, impactId)).toBeNull();
    });

    it("removes a declared impact", async () => {
      const change = await makeChange("CR-REMOVE");

      const impactId = await repos!.change.createDeclaredImpact({
        changeRequestId: change.id,
        type: "DESIGN_ITEM",
        targetId: ids.designItem,
        note: null,
        createdById: tenant.userId,
      });

      await repos!.change.deleteDeclaredImpact(impactId);

      expect(await repos!.change.listDeclaredImpacts(change.id)).toEqual([]);
    });

    it("cascades declared impacts when the change is deleted", async () => {
      const change = await makeChange("CR-CASCADE");
      await repos!.change.createDeclaredImpact({
        changeRequestId: change.id,
        type: "REQUIREMENT",
        targetId: ids.requirement,
        note: null,
        createdById: tenant.userId,
      });

      await prisma.changeRequest.delete({ where: { id: change.id } });

      expect(
        await prisma.changeRequestImpact.count({ where: { changeRequestId: change.id } }),
      ).toBe(0);
    });

    it("cascades declared impacts when the target artifact is deleted", async () => {
      const change = await makeChange("CR-TARGETCASCADE");
      const doomed = await prisma.risk.create({
        data: {
          projectId: tenant.projectId,
          identifier: "RISK-900",
          title: "Temporary risk",
          description: "Exists only for this test.",
        },
      });

      await repos!.change.createDeclaredImpact({
        changeRequestId: change.id,
        type: "RISK",
        targetId: doomed.id,
        note: null,
        createdById: tenant.userId,
      });

      await prisma.risk.delete({ where: { id: doomed.id } });

      // The declaration cannot outlive what it points at, so no impact row is
      // left claiming an artifact that no longer exists.
      expect(await repos!.change.listDeclaredImpacts(change.id)).toEqual([]);
    });

    it("keeps the declaration when its creator is removed", async () => {
      const change = await makeChange("CR-CREATORGONE");
      const temp = await prisma.user.create({
        data: {
          email: `${uniqueSuffix("creator")}@test.invalid`,
          name: "Temporary Engineer",
          role: "ENGINEER",
          organizationId: tenant.organizationId,
        },
      });

      await repos!.change.createDeclaredImpact({
        changeRequestId: change.id,
        type: "REQUIREMENT",
        targetId: ids.requirement,
        note: "Declared by someone who later left.",
        createdById: temp.id,
      });

      await prisma.user.delete({ where: { id: temp.id } });

      // SetNull, not cascade: losing the person must not erase the assertion.
      const impacts = await repos!.change.listDeclaredImpacts(change.id);
      expect(impacts).toHaveLength(1);
      expect(impacts[0]?.createdBy).toBeNull();
      expect(impacts[0]?.note).toBe("Declared by someone who later left.");
    });
  });

  describe("the impact target selector", () => {
    it("offers only artifacts from this project, in the eight supported categories", async () => {
      const targets = await repos!.artifacts.listChangeImpactTargets(tenant.projectId);

      expect(Object.keys(targets).sort()).toEqual([
        "DESIGN_ITEM",
        "ENGINEERING_DECISION",
        "ISSUE",
        "REQUIREMENT",
        "RISK",
        "SUPPLIED_ITEM",
        "SUPPLIER",
        "VERIFICATION_ACTIVITY",
      ]);
      expect(targets.REQUIREMENT.map((option) => option.id)).toContain(ids.requirement);
      expect(targets.REQUIREMENT.map((option) => option.id)).not.toContain(
        ids.foreignRequirement,
      );
      expect(targets.DESIGN_ITEM[0]?.title).toBe("Combustion chamber");
    });
  });

  describe("audit", () => {
    it("round-trips the actor, action and metadata", async () => {
      const change = await makeChange("CR-AUDIT");

      await repos!.audit.recordAuditEvent({
        organizationId: tenant.organizationId,
        actorId: tenant.userId,
        action: "change.status_transitioned",
        entityType: "ChangeRequest",
        entityId: change.id,
        metadata: { from: "DRAFT", to: "SUBMITTED", rationale: "Ready for the board." },
      });

      const history = await repos!.audit.listAuditEventsForEntity({
        organizationId: tenant.organizationId,
        entityType: "ChangeRequest",
        entityId: change.id,
      });

      expect(history).toHaveLength(1);
      expect(history[0]?.action).toBe("change.status_transitioned");
      expect(history[0]?.actor?.id).toBe(tenant.userId);
      expect(history[0]?.metadata).toEqual({
        from: "DRAFT",
        to: "SUBMITTED",
        rationale: "Ready for the board.",
      });
    });

    it("does not return another organization's history for the same entity", async () => {
      const change = await makeChange("CR-AUDITSCOPE");
      await repos!.audit.recordAuditEvent({
        organizationId: tenant.organizationId,
        actorId: tenant.userId,
        action: "change.created",
        entityType: "ChangeRequest",
        entityId: change.id,
        metadata: null,
      });

      const leaked = await repos!.audit.listAuditEventsForEntity({
        organizationId: otherTenant.organizationId,
        entityType: "ChangeRequest",
        entityId: change.id,
      });

      expect(leaked).toEqual([]);
    });
  });
});
