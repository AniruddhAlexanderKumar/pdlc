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
 * Real PostgreSQL exercise of the repository layer.
 *
 * The unit suite fakes repositories, so it proves the services' logic but
 * says nothing about whether the Prisma queries underneath are correct. This
 * suite runs them: composite keys, `include`/`select` shapes, ordering,
 * unique constraints, cascades and cross-project scoping. A malformed `where`
 * fails here and nowhere else.
 *
 * Repositories are imported dynamically, because importing them pulls in
 * `@/config/env`, which refuses to load without a DATABASE_URL. When there is
 * no database the suite skips instead of erroring.
 */

const repos = databaseAvailable
  ? {
      requirement: await import("@/server/repositories/requirement.repository"),
      need: await import("@/server/repositories/stakeholder-need.repository"),
      design: await import("@/server/repositories/design-item.repository"),
      verification: await import("@/server/repositories/verification-activity.repository"),
      project: await import("@/server/repositories/project.repository"),
      audit: await import("@/server/repositories/audit-log.repository"),
      artifacts: await import("@/server/repositories/project-artifacts.repository"),
      user: await import("@/server/repositories/user.repository"),
    }
  : null;

describe.skipIf(!databaseAvailable)(`repositories against PostgreSQL (${SKIP_REASON})`, () => {
  let tenant: TestTenant;
  let otherTenant: TestTenant;

  beforeAll(async () => {
    tenant = await createTestTenant("primary");
    otherTenant = await createTestTenant("other");
  });

  afterAll(async () => {
    if (tenant) await destroyTestTenant(tenant);
    if (otherTenant) await destroyTestTenant(otherTenant);
    await disconnectIntegrationPrisma();
  });

  describe("requirements", () => {
    it("creates, reads back and orders by identifier then id", async () => {
      const r = repos!.requirement;

      // Inserted out of order to prove the ordering comes from the query.
      await r.createRequirement({
        projectId: tenant.projectId,
        identifier: "REQ-020",
        title: "Second",
        statement: "The system shall B.",
      });
      await r.createRequirement({
        projectId: tenant.projectId,
        identifier: "REQ-010",
        title: "First",
        statement: "The system shall A.",
      });

      const listed = await r.listRequirementsInProject(tenant.projectId);

      expect(listed.map((row) => row.identifier)).toEqual(["REQ-010", "REQ-020"]);
      // The owner relation is included and null when unassigned.
      expect(listed[0]).toHaveProperty("owner", null);
      expect(listed[0]?.status).toBe("DRAFT");
    });

    it("enforces the project-scoped unique identifier", async () => {
      const r = repos!.requirement;

      await expect(
        r.createRequirement({
          projectId: tenant.projectId,
          identifier: "REQ-010",
          title: "Duplicate",
          statement: "Clash.",
        }),
      ).rejects.toMatchObject({ statusCode: 409 });

      // The same identifier is fine in a different project.
      const elsewhere = await r.createRequirement({
        projectId: otherTenant.projectId,
        identifier: "REQ-010",
        title: "Same key, other project",
        statement: "Allowed.",
      });
      expect(elsewhere.identifier).toBe("REQ-010");
    });

    it("scopes lookup to the project", async () => {
      const r = repos!.requirement;
      const mine = await r.createRequirement({
        projectId: tenant.projectId,
        identifier: "REQ-030",
        title: "Scoped",
        statement: "The system shall C.",
      });

      await expect(
        r.findRequirementInProject(tenant.projectId, mine.id),
      ).resolves.toMatchObject({ id: mine.id });
      // The same id, asked for through another project, does not match.
      await expect(
        r.findRequirementInProject(otherTenant.projectId, mine.id),
      ).resolves.toBeNull();
    });

    it("filters by status", async () => {
      const r = repos!.requirement;
      const created = await r.createRequirement({
        projectId: tenant.projectId,
        identifier: "REQ-040",
        title: "Approved one",
        statement: "The system shall D.",
      });
      await r.updateRequirement(created.id, { status: "APPROVED" });

      const approved = await r.listRequirementsInProject(tenant.projectId, {
        status: "APPROVED",
      });

      expect(approved.map((row) => row.identifier)).toEqual(["REQ-040"]);
    });

    it("**guards a status transition against a concurrent write, real Postgres included**", async () => {
      // The same read-decide-write shape repeats across every lifecycle
      // transition in this codebase (Requirement, EngineeringDecision, Risk,
      // Issue, ChangeRequest, Evidence, CertificationFinding) — all guarded
      // through `transitionStatusGuarded`/`assertGuardedTransition`, which
      // this exercises directly rather than through the service, since the
      // guard itself lives in the repository. Two concurrent callers who
      // both read DRAFT and both decide to write a *different* next status
      // must not both silently win: one commits, the other gets a real
      // conflict from the database, not a client-side check.
      const r = repos!.requirement;
      const created = await r.createRequirement({
        projectId: tenant.projectId,
        identifier: "REQ-050",
        title: "Raced",
        statement: "The system shall race.",
      });

      const results = await Promise.allSettled([
        r.transitionStatusGuarded(created.id, "DRAFT", "IN_REVIEW"),
        r.transitionStatusGuarded(created.id, "DRAFT", "OBSOLETE"),
      ]);

      const fulfilled = results.filter((res) => res.status === "fulfilled");
      const rejected = results.filter((res) => res.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const final = await r.findRequirementInProject(tenant.projectId, created.id);
      expect(["IN_REVIEW", "OBSOLETE"]).toContain(final?.status);
      // Whichever transition actually landed matches the one call that
      // resolved — no third, blended outcome.
      const winner = fulfilled[0] as PromiseFulfilledResult<{ status: string }>;
      expect(final?.status).toBe(winner.value.status);
    });
  });

  describe("traceability links", () => {
    it("writes, reads and removes edges across all four relations", async () => {
      const r = repos!.requirement;

      const requirement = await r.createRequirement({
        projectId: tenant.projectId,
        identifier: "REQ-100",
        title: "Traced",
        statement: "The system shall be traced.",
      });

      const need = await repos!.need.createStakeholderNeed({
        projectId: tenant.projectId,
        identifier: "SN-100",
        title: "Origin need",
        description: "Because a customer asked.",
        stakeholder: "Customer",
      });
      const design = await repos!.design.createDesignItem({
        projectId: tenant.projectId,
        identifier: "DI-100",
        name: "Chamber",
        description: null,
        itemType: "COMPONENT",
        ownerId: null,
      });
      const verification = await repos!.verification.createVerificationActivity({
        projectId: tenant.projectId,
        identifier: "VER-100",
        title: "Hot fire",
        description: null,
        method: "TEST",
        plannedDate: null,
        ownerId: null,
      });
      const decision = await integrationPrisma!.engineeringDecision.create({
        data: {
          projectId: tenant.projectId,
          identifier: "ED-100",
          title: "Use regenerative cooling",
          statement: "We will use regenerative cooling.",
          rationale: "Ablative mass was prohibitive.",
        },
      });

      // Each of these hits a different join table with its own composite key.
      await r.createRequirementLink({
        requirementId: requirement.id,
        relation: "STAKEHOLDER_NEED",
        targetId: need.id,
        createdById: tenant.userId,
      });
      await r.createRequirementLink({
        requirementId: requirement.id,
        relation: "DESIGN_ITEM",
        targetId: design.id,
        linkType: "ALLOCATED_TO",
        note: "primary allocation",
        createdById: tenant.userId,
      });
      await r.createRequirementLink({
        requirementId: requirement.id,
        relation: "VERIFICATION_ACTIVITY",
        targetId: verification.id,
        createdById: tenant.userId,
      });
      await r.createRequirementLink({
        requirementId: requirement.id,
        relation: "ENGINEERING_DECISION",
        targetId: decision.id,
        linkType: "DECISION_ADDRESSES_REQUIREMENT",
        createdById: tenant.userId,
      });

      // The four-query read with its differing target shapes.
      const links = await r.listRequirementLinks(requirement.id);
      expect(links).toHaveLength(4);
      expect(links.map((link) => link.relation).sort()).toEqual([
        "DESIGN_ITEM",
        "ENGINEERING_DECISION",
        "STAKEHOLDER_NEED",
        "VERIFICATION_ACTIVITY",
      ]);
      // Design items name their heading `name`; the mapper normalizes it.
      const designLink = links.find((link) => link.relation === "DESIGN_ITEM");
      expect(designLink).toMatchObject({ identifier: "DI-100", title: "Chamber", note: "primary allocation" });

      // Re-adding the same edge is idempotent, not a duplicate row.
      await r.createRequirementLink({
        requirementId: requirement.id,
        relation: "STAKEHOLDER_NEED",
        targetId: need.id,
        createdById: tenant.userId,
      });
      expect(await r.listRequirementLinks(requirement.id)).toHaveLength(4);

      const removed = await r.deleteRequirementLink({
        requirementId: requirement.id,
        relation: "DESIGN_ITEM",
        targetId: design.id,
        linkType: "ALLOCATED_TO",
      });
      expect(removed).toBe(1);
      expect(await r.listRequirementLinks(requirement.id)).toHaveLength(3);

      // Removing something that is not there reports zero rather than throwing.
      expect(
        await r.deleteRequirementLink({
          requirementId: requirement.id,
          relation: "DESIGN_ITEM",
          targetId: design.id,
          linkType: "ALLOCATED_TO",
        }),
      ).toBe(0);
    });

    it("confirms link targets only within their own project", async () => {
      const r = repos!.requirement;

      const localDesign = await repos!.design.createDesignItem({
        projectId: tenant.projectId,
        identifier: "DI-200",
        name: "Local",
        description: null,
        itemType: "ASSEMBLY",
        ownerId: null,
      });
      const foreignDesign = await repos!.design.createDesignItem({
        projectId: otherTenant.projectId,
        identifier: "DI-200",
        name: "Foreign",
        description: null,
        itemType: "ASSEMBLY",
        ownerId: null,
      });

      await expect(
        r.linkTargetExistsInProject("DESIGN_ITEM", localDesign.id, tenant.projectId),
      ).resolves.toBe(true);
      // This is the query that makes cross-project links impossible.
      await expect(
        r.linkTargetExistsInProject("DESIGN_ITEM", foreignDesign.id, tenant.projectId),
      ).resolves.toBe(false);
    });

    it("reads the reverse direction from each artifact", async () => {
      const requirement = await repos!.requirement.createRequirement({
        projectId: tenant.projectId,
        identifier: "REQ-200",
        title: "Reverse",
        statement: "The system shall reverse.",
      });
      const need = await repos!.need.createStakeholderNeed({
        projectId: tenant.projectId,
        identifier: "SN-200",
        title: "Reverse need",
        description: "d",
        stakeholder: "s",
      });
      const design = await repos!.design.createDesignItem({
        projectId: tenant.projectId,
        identifier: "DI-300",
        name: "Reverse item",
        description: null,
        itemType: "COMPONENT",
        ownerId: null,
      });
      const verification = await repos!.verification.createVerificationActivity({
        projectId: tenant.projectId,
        identifier: "VER-200",
        title: "Reverse check",
        description: null,
        method: "ANALYSIS",
        plannedDate: null,
        ownerId: null,
      });

      await repos!.requirement.createRequirementLink({
        requirementId: requirement.id,
        relation: "STAKEHOLDER_NEED",
        targetId: need.id,
        createdById: null,
      });
      await repos!.requirement.createRequirementLink({
        requirementId: requirement.id,
        relation: "DESIGN_ITEM",
        targetId: design.id,
        createdById: null,
      });
      await repos!.requirement.createRequirementLink({
        requirementId: requirement.id,
        relation: "VERIFICATION_ACTIVITY",
        targetId: verification.id,
        createdById: null,
      });

      await expect(repos!.need.listRequirementsForNeed(need.id)).resolves.toMatchObject([
        { identifier: "REQ-200" },
      ]);
      await expect(
        repos!.design.listRequirementsForDesignItem(design.id),
      ).resolves.toMatchObject([{ identifier: "REQ-200", linkType: "ALLOCATED_TO" }]);
      await expect(
        repos!.verification.listRequirementsForVerification(tenant.projectId, verification.id),
      ).resolves.toMatchObject([{ identifier: "REQ-200" }]);

      // Scoped by project as well as by activity: a link naming another
      // programme's requirement must not surface it here.
      await expect(
        repos!.verification.listRequirementsForVerification(
          otherTenant.projectId,
          verification.id,
        ),
      ).resolves.toEqual([]);
    });
  });

  describe("artifact repositories", () => {
    it("lists design items and verification activities with their owner relation", async () => {
      const design = await repos!.design.createDesignItem({
        projectId: tenant.projectId,
        identifier: "DI-400",
        name: "Owned item",
        description: "has an owner",
        itemType: "SUBSYSTEM",
        ownerId: tenant.userId,
      });
      await repos!.verification.createVerificationActivity({
        projectId: tenant.projectId,
        identifier: "VER-400",
        title: "Owned activity",
        description: null,
        method: "INSPECTION",
        plannedDate: new Date("2026-04-01T00:00:00.000Z"),
        ownerId: tenant.userId,
      });

      const items = await repos!.design.listDesignItemsInProject(tenant.projectId);
      const owned = items.find((row) => row.id === design.id);
      expect(owned?.owner).toMatchObject({ id: tenant.userId });
      // The owner select must never carry credential fields.
      expect(Object.keys(owned?.owner ?? {}).sort()).toEqual(["email", "id", "name"]);

      const activities = await repos!.verification.listVerificationActivitiesInProject(
        tenant.projectId,
      );
      const activity = activities.find((row) => row.identifier === "VER-400");
      expect(activity?.owner).toMatchObject({ id: tenant.userId });
      expect(activity?.plannedDate?.toISOString()).toBe("2026-04-01T00:00:00.000Z");
      expect(activity?.status).toBe("PLANNED");
    });

    it("**guards a verification activity's status transition against a concurrent write**", async () => {
      // Same shape and same fix as the Requirement race test above —
      // verification activities were the one lifecycle-controlled object
      // this exact TOCTOU pattern was found in during a later adversarial
      // security pass, not the original concurrency-hardening one.
      const created = await repos!.verification.createVerificationActivity({
        projectId: tenant.projectId,
        identifier: "VER-500",
        title: "Raced",
        description: null,
        method: "TEST",
        plannedDate: null,
        ownerId: null,
      });

      const results = await Promise.allSettled([
        repos!.verification.transitionStatusGuarded(created.id, "PLANNED", { status: "IN_PROGRESS" }),
        repos!.verification.transitionStatusGuarded(created.id, "PLANNED", { status: "WAIVED" }),
      ]);

      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);

      const final = await repos!.verification.findVerificationActivityInProject(
        tenant.projectId,
        created.id,
      );
      expect(["IN_PROGRESS", "WAIVED"]).toContain(final?.status);
    });

    it("enumerates link targets for a project", async () => {
      const targets = await repos!.artifacts.listLinkTargets(tenant.projectId);

      // listLinkTargets always returns all five keys unconditionally (each an
      // empty array when the project has no instances of that type) — this
      // is the object's fixed shape, not a function of what data exists.
      expect(Object.keys(targets).sort()).toEqual([
        "DESIGN_ITEM",
        "ENGINEERING_DECISION",
        "EVIDENCE",
        "STAKEHOLDER_NEED",
        "VERIFICATION_ACTIVITY",
      ]);
      expect(targets.DESIGN_ITEM.length).toBeGreaterThan(0);
      // Only this project's artifacts are offered.
      const foreign = await repos!.artifacts.listLinkTargets(otherTenant.projectId);
      expect(foreign.DESIGN_ITEM.map((row) => row.title)).not.toContain("Chamber");
    });

    it("reports organization membership truthfully", async () => {
      await expect(
        repos!.user.isMemberOfOrganization(tenant.userId, tenant.organizationId),
      ).resolves.toBe(true);
      await expect(
        repos!.user.isMemberOfOrganization(tenant.userId, otherTenant.organizationId),
      ).resolves.toBe(false);

      const members = await repos!.user.listOrganizationMembers(tenant.organizationId);
      expect(members).toHaveLength(1);
      // An exact allowlist on purpose: this is the query that decides what
      // can reach a browser about another person, so growing it should be
      // a deliberate edit here, never a silent consequence of a `select`
      // change. No password hash and no organization id, then or now.
      expect(Object.keys(members[0]!).sort()).toEqual([
        "createdAt",
        "email",
        "id",
        "name",
        "organizationRole",
        "projectCount",
      ]);
      // The real reason `projectCount` exists: it is a genuine aggregate
      // over this tenant's own membership rows, not a placeholder.
      expect(members[0]!.projectCount).toBe(0);
      expect(members[0]!.organizationRole).toBe("OWNER");
    });
  });

  describe("audit log", () => {
    it("writes an event with metadata and reads it back scoped to the organization", async () => {
      const requirement = await repos!.requirement.createRequirement({
        projectId: tenant.projectId,
        identifier: "REQ-300",
        title: "Audited",
        statement: "The system shall be audited.",
      });

      await repos!.audit.recordAuditEvent({
        organizationId: tenant.organizationId,
        actorId: tenant.userId,
        action: "requirement.created",
        entityType: "Requirement",
        entityId: requirement.id,
        metadata: { identifier: "REQ-300" },
      });

      const history = await repos!.audit.listAuditEventsForEntity({
        organizationId: tenant.organizationId,
        entityType: "Requirement",
        entityId: requirement.id,
      });

      expect(history).toHaveLength(1);
      expect(history[0]).toMatchObject({ action: "requirement.created" });
      expect(history[0]?.actor).toMatchObject({ id: tenant.userId });
      expect(history[0]?.metadata).toEqual({ identifier: "REQ-300" });

      // Another organization cannot read it, even knowing the entity id.
      await expect(
        repos!.audit.listAuditEventsForEntity({
          organizationId: otherTenant.organizationId,
          entityType: "Requirement",
          entityId: requirement.id,
        }),
      ).resolves.toEqual([]);
    });
  });

  describe("decision memory schema", () => {
    it("stores alternatives, assumptions and a single expectation per decision", async () => {
      const prisma = integrationPrisma!;

      const decision = await prisma.engineeringDecision.create({
        data: {
          projectId: tenant.projectId,
          identifier: "ED-200",
          title: "Regenerative cooling",
          statement: "We will regeneratively cool the chamber.",
          rationale: "Ablative liner mass was prohibitive.",
        },
      });

      await prisma.decisionAlternative.create({
        data: {
          engineeringDecisionId: decision.id,
          title: "Ablative liner",
          description: "Consumable liner.",
          reasonRejected: "Mass and refurbishment cost.",
        },
      });

      const assumption = await prisma.decisionAssumption.create({
        data: { engineeringDecisionId: decision.id, statement: "Coolant flow is sufficient." },
      });
      // Recording an assumption is not the same as having checked it.
      expect(assumption.status).toBe("UNKNOWN");

      const expectation = await prisma.decisionExpectation.create({
        data: {
          engineeringDecisionId: decision.id,
          statement: "Wall temperature stays below limit.",
          measure: "Peak wall temperature",
          expectedValue: "< 800",
          unit: "K",
        },
      });
      expect(expectation.status).toBe("NOT_OBSERVED");
      expect(expectation.actualValue).toBeNull();

      // One expectation per decision, enforced by a unique index.
      await expect(
        prisma.decisionExpectation.create({
          data: { engineeringDecisionId: decision.id, statement: "A second one." },
        }),
      ).rejects.toMatchObject({ code: "P2002" });

      const loaded = await prisma.engineeringDecision.findUnique({
        where: { id: decision.id },
        include: { alternatives: true, assumptions_: true, expectation: true },
      });
      expect(loaded?.alternatives).toHaveLength(1);
      expect(loaded?.assumptions_).toHaveLength(1);
      expect(loaded?.expectation?.measure).toBe("Peak wall temperature");

      // Deleting the decision cascades to its memory records.
      await prisma.engineeringDecision.delete({ where: { id: decision.id } });
      await expect(
        prisma.decisionAssumption.findUnique({ where: { id: assumption.id } }),
      ).resolves.toBeNull();
    });
  });

  describe("tenancy", () => {
    it("keeps projects scoped to their organization", async () => {
      await expect(
        repos!.project.findProjectInOrganization(tenant.organizationId, tenant.projectId),
      ).resolves.toMatchObject({ id: tenant.projectId });
      await expect(
        repos!.project.findProjectInOrganization(otherTenant.organizationId, tenant.projectId),
      ).resolves.toBeNull();
    });

    it("cascades a deleted organization through its projects and artifacts", async () => {
      const doomed = await createTestTenant("cascade");
      const requirement = await repos!.requirement.createRequirement({
        projectId: doomed.projectId,
        identifier: "REQ-900",
        title: "Doomed",
        statement: "This will be removed with its organization.",
      });

      await destroyTestTenant(doomed);

      await expect(
        integrationPrisma!.requirement.findUnique({ where: { id: requirement.id } }),
      ).resolves.toBeNull();
      await expect(
        integrationPrisma!.project.findUnique({ where: { id: doomed.projectId } }),
      ).resolves.toBeNull();
    });
  });
});
