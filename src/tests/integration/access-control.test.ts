import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError } from "@/server/errors";
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
 * Engineering Access Control against real PostgreSQL.
 *
 * The unit suites (`authorization.service.test.ts`,
 * `project-membership.service.test.ts`,
 * `organization-membership.service.test.ts`, and the `asRole()` blocks in
 * every migrated engineering service's own test file) fake every
 * repository, so they prove the role logic in the abstract. This suite
 * runs the real path: the real `project_memberships` unique constraint,
 * real cross-project and cross-organization isolation queries, real audit
 * rows, and real role enforcement on an actual migrated service
 * (`requirement.service.ts`) reached through nothing but its own public
 * API — the same one the HTTP routes call.
 */

const modules = databaseAvailable
  ? {
      authorization: await import("@/server/services/authorization.service"),
      projectMembership: await import("@/server/services/project-membership.service"),
      organizationMembership: await import("@/server/services/organization-membership.service"),
      requirementService: await import("@/server/services/requirement.service"),
      supplierService: await import("@/server/services/supplier.service"),
      certificationProgramService: (
        await import("@/server/services/certification-program.service")
      ).certificationProgramService,
      auditLog: await import("@/server/repositories/audit-log.repository"),
    }
  : null;

describe.skipIf(!databaseAvailable)(`Engineering Access Control against PostgreSQL (${SKIP_REASON})`, () => {
  const prisma = integrationPrisma!;

  let tenant: TestTenant;
  let otherTenant: TestTenant;
  let ctx: { organizationId: string; actorId: string };
  let otherCtx: { organizationId: string; actorId: string };

  beforeAll(async () => {
    tenant = await createTestTenant("access-control-primary");
    otherTenant = await createTestTenant("access-control-other");
    ctx = { organizationId: tenant.organizationId, actorId: tenant.userId };
    otherCtx = { organizationId: otherTenant.organizationId, actorId: otherTenant.userId };
  });

  afterAll(async () => {
    if (tenant) await destroyTestTenant(tenant);
    if (otherTenant) await destroyTestTenant(otherTenant);
    await disconnectIntegrationPrisma();
  });

  /** A real, organization-scoped MEMBER (not the tenant's own OWNER), with no project access yet. */
  async function makePlainOrgMember(organizationId: string, label: string) {
    return prisma.user.create({
      data: {
        email: `${uniqueSuffix(label)}@test.invalid`,
        name: "A Real Colleague",
        organizationId,
        organizationRole: "MEMBER",
      },
    });
  }

  function identifierFor(label: string): string {
    return uniqueSuffix(label).toUpperCase().replace(/[^A-Z0-9_-]/g, "-").slice(0, 32);
  }

  describe("organization ownership", () => {
    it("the tenant's own user is a real OWNER row, not an assumption", async () => {
      const row = await prisma.user.findUniqueOrThrow({ where: { id: tenant.userId } });
      expect(row.organizationRole).toBe("OWNER");
      await expect(modules!.authorization.isOrganizationOwner(ctx)).resolves.toBe(true);
    });

    it("a plain MEMBER is not an owner and has no implicit project access", async () => {
      const member = await makePlainOrgMember(tenant.organizationId, "plain");
      const memberCtx = { organizationId: tenant.organizationId, actorId: member.id };

      await expect(modules!.authorization.isOrganizationOwner(memberCtx)).resolves.toBe(false);
      await expect(
        modules!.authorization.requireProjectAccess(memberCtx, tenant.projectId),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("an owner provisions a real account with a real password hash, audited", async () => {
      const email = `${uniqueSuffix("provisioned")}@test.invalid`;
      const created = await modules!.organizationMembership.addOrganizationMember(ctx, {
        name: "Provisioned Colleague",
        email,
        password: "correct horse battery staple",
      });

      const row = await prisma.user.findUniqueOrThrow({ where: { id: created.id } });
      expect(row.organizationRole).toBe("MEMBER");
      const credential = await prisma.userCredential.findUniqueOrThrow({ where: { userId: created.id } });
      expect(credential.passwordHash).not.toBe("correct horse battery staple");

      const members = await modules!.organizationMembership.listOrganizationMembers(ctx);
      expect(members.map((m) => m.id)).toContain(created.id);

      const history = await modules!.auditLog.listAuditEventsForEntity({
        organizationId: tenant.organizationId,
        entityType: "User",
        entityId: created.id,
      });
      expect(history.map((e) => e.action)).toContain("organization.member_added");
    });

    it("a plain MEMBER cannot provision a new account", async () => {
      const member = await makePlainOrgMember(tenant.organizationId, "cant-provision");
      const memberCtx = { organizationId: tenant.organizationId, actorId: member.id };

      await expect(
        modules!.organizationMembership.addOrganizationMember(memberCtx, {
          name: "x",
          email: `${uniqueSuffix("x")}@test.invalid`,
          password: "correct horse battery staple",
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("project membership lifecycle", () => {
    it("creates a real ProjectMembership row, then updates and removes it — each audited", async () => {
      const member = await makePlainOrgMember(tenant.organizationId, "lifecycle");

      const added = await modules!.projectMembership.addMember(ctx, tenant.projectId, {
        userId: member.id,
        role: "ENGINEER",
      });
      expect(added.role).toBe("ENGINEER");

      const dbRow = await prisma.projectMembership.findUniqueOrThrow({
        where: { projectId_userId: { projectId: tenant.projectId, userId: member.id } },
      });
      expect(dbRow.role).toBe("ENGINEER");

      const changed = await modules!.projectMembership.changeMemberRole(ctx, tenant.projectId, added.id, {
        role: "REVIEWER",
      });
      expect(changed.role).toBe("REVIEWER");

      await modules!.projectMembership.removeMember(ctx, tenant.projectId, added.id);
      await expect(
        prisma.projectMembership.findUnique({
          where: { projectId_userId: { projectId: tenant.projectId, userId: member.id } },
        }),
      ).resolves.toBeNull();

      const history = await modules!.auditLog.listAuditEventsForEntity({
        organizationId: tenant.organizationId,
        entityType: "ProjectMembership",
        entityId: added.id,
      });
      const actions = history.map((e) => e.action);
      expect(actions).toContain("project_membership.added");
      expect(actions).toContain("project_membership.role_changed");
      expect(actions).toContain("project_membership.removed");
    });

    it("refuses a duplicate membership — the real unique constraint, surfaced as a conflict", async () => {
      const member = await makePlainOrgMember(tenant.organizationId, "dup");
      await modules!.projectMembership.addMember(ctx, tenant.projectId, {
        userId: member.id,
        role: "VIEWER",
      });

      await expect(
        modules!.projectMembership.addMember(ctx, tenant.projectId, { userId: member.id, role: "ENGINEER" }),
      ).rejects.toBeInstanceOf(ConflictError);
    });

    it("refuses removing the last explicit MANAGER, even though the organization owner still exists", async () => {
      const manager = await makePlainOrgMember(tenant.organizationId, "sole-manager");
      const membership = await modules!.projectMembership.addMember(ctx, tenant.projectId, {
        userId: manager.id,
        role: "MANAGER",
      });

      await expect(
        modules!.projectMembership.removeMember(ctx, tenant.projectId, membership.id),
      ).rejects.toBeInstanceOf(ConflictError);

      // Cleanup: demote is also blocked by the same guard, so remove via a
      // second manager first, then tear down.
      await modules!.projectMembership.addMember(ctx, tenant.projectId, {
        userId: (await makePlainOrgMember(tenant.organizationId, "second-manager")).id,
        role: "MANAGER",
      });
      await modules!.projectMembership.removeMember(ctx, tenant.projectId, membership.id);
    });

    it("a non-manager cannot administer project membership", async () => {
      const engineer = await makePlainOrgMember(tenant.organizationId, "non-manager");
      await modules!.projectMembership.addMember(ctx, tenant.projectId, {
        userId: engineer.id,
        role: "ENGINEER",
      });
      const engineerCtx = { organizationId: tenant.organizationId, actorId: engineer.id };

      await expect(
        modules!.projectMembership.addMember(engineerCtx, tenant.projectId, {
          userId: (await makePlainOrgMember(tenant.organizationId, "target")).id,
          role: "VIEWER",
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe("read/write/approve boundaries on a real migrated service", () => {
    async function memberWithRole(role: "MANAGER" | "ENGINEER" | "REVIEWER" | "VIEWER") {
      const user = await makePlainOrgMember(tenant.organizationId, role.toLowerCase());
      await modules!.projectMembership.addMember(ctx, tenant.projectId, { userId: user.id, role });
      return { organizationId: tenant.organizationId, actorId: user.id };
    }

    it("a VIEWER reads but cannot create a requirement", async () => {
      const viewerCtx = await memberWithRole("VIEWER");

      await expect(modules!.requirementService.listRequirements(viewerCtx, tenant.projectId, {})).resolves.toBeDefined();
      await expect(
        modules!.requirementService.createRequirement(viewerCtx, tenant.projectId, {
          identifier: identifierFor("req"),
          title: "Should never be created",
          statement: "A viewer has no write authority.",
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("an ENGINEER writes but cannot approve", async () => {
      const engineerCtx = await memberWithRole("ENGINEER");

      const requirement = await modules!.requirementService.createRequirement(engineerCtx, tenant.projectId, {
        identifier: identifierFor("req"),
        title: "Maximum chamber pressure",
        statement: "The engine shall not exceed 120 bar.",
      });

      await modules!.requirementService.transitionRequirementStatus(
        engineerCtx,
        tenant.projectId,
        requirement.id,
        { to: "IN_REVIEW" },
      );

      await expect(
        modules!.requirementService.transitionRequirementStatus(engineerCtx, tenant.projectId, requirement.id, {
          to: "APPROVED",
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it("a REVIEWER approves but cannot write", async () => {
      const managerCtx = await memberWithRole("MANAGER");
      const reviewerCtx = await memberWithRole("REVIEWER");

      const requirement = await modules!.requirementService.createRequirement(managerCtx, tenant.projectId, {
        identifier: identifierFor("req"),
        title: "Maximum chamber pressure",
        statement: "The engine shall not exceed 120 bar.",
      });
      await modules!.requirementService.transitionRequirementStatus(managerCtx, tenant.projectId, requirement.id, {
        to: "IN_REVIEW",
      });

      await expect(
        modules!.requirementService.createRequirement(reviewerCtx, tenant.projectId, {
          identifier: identifierFor("req"),
          title: "Should never be created",
          statement: "A reviewer has no write authority.",
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);

      const approved = await modules!.requirementService.transitionRequirementStatus(
        reviewerCtx,
        tenant.projectId,
        requirement.id,
        { to: "APPROVED" },
      );
      expect(approved.status).toBe("APPROVED");
    });

    it("a same-organization user with no membership on this project gets 404, not 403", async () => {
      const outsider = await makePlainOrgMember(tenant.organizationId, "outsider");
      const outsiderCtx = { organizationId: tenant.organizationId, actorId: outsider.id };

      await expect(
        modules!.requirementService.listRequirements(outsiderCtx, tenant.projectId, {}),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("cross-project and cross-organization isolation", () => {
    it("membership on one project grants nothing on a second project in the same organization", async () => {
      const secondProject = await prisma.project.create({
        data: { organizationId: tenant.organizationId, name: `[TEST] Second ${uniqueSuffix("proj")}` },
      });

      const engineer = await makePlainOrgMember(tenant.organizationId, "scoped");
      await modules!.projectMembership.addMember(ctx, tenant.projectId, {
        userId: engineer.id,
        role: "ENGINEER",
      });
      const engineerCtx = { organizationId: tenant.organizationId, actorId: engineer.id };

      await expect(
        modules!.requirementService.listRequirements(engineerCtx, secondProject.id, {}),
      ).rejects.toBeInstanceOf(NotFoundError);

      await prisma.project.delete({ where: { id: secondProject.id } });
    });

    it("a user from another organization cannot reach this project even by id", async () => {
      await expect(
        modules!.requirementService.listRequirements(otherCtx, tenant.projectId, {}),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it("organization ownership does not cross the organization boundary", async () => {
      // otherTenant's own user is OWNER of *their* organization — never this one.
      await expect(
        modules!.authorization.requireProjectAccess(otherCtx, tenant.projectId),
      ).rejects.toBeInstanceOf(NotFoundError);
    });
  });

  describe("a module completed in the follow-up pass (Supplier), against the same real boundaries", () => {
    it("a VIEWER reads but cannot create a supplier; an ENGINEER can", async () => {
      const viewerCtx = await memberWithRole("VIEWER");
      const engineerCtx = await memberWithRole("ENGINEER");

      await expect(modules!.supplierService.listSuppliers(viewerCtx, tenant.projectId, {})).resolves.toBeDefined();
      await expect(
        modules!.supplierService.createSupplier(viewerCtx, tenant.projectId, {
          identifier: identifierFor("sup"),
          name: "Vulcan Alloys",
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);

      const created = await modules!.supplierService.createSupplier(engineerCtx, tenant.projectId, {
        identifier: identifierFor("sup"),
        name: "Vulcan Alloys",
      });
      expect(created.name).toBe("Vulcan Alloys");
    });

    it("a same-organization caller with no project membership gets 404 reading suppliers too — reads are gated in this group, unlike the original thirteen services", async () => {
      const outsider = await makePlainOrgMember(tenant.organizationId, "supplier-outsider");
      const outsiderCtx = { organizationId: tenant.organizationId, actorId: outsider.id };

      await expect(
        modules!.supplierService.listSuppliers(outsiderCtx, tenant.projectId, {}),
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    async function memberWithRole(role: "MANAGER" | "ENGINEER" | "REVIEWER" | "VIEWER") {
      const user = await makePlainOrgMember(tenant.organizationId, role.toLowerCase());
      await modules!.projectMembership.addMember(ctx, tenant.projectId, { userId: user.id, role });
      return { organizationId: tenant.organizationId, actorId: user.id };
    }
  });

  describe("owner assignment closes a real gap: CertificationProgram.ownerId", () => {
    it("refuses an owner who is a real organization member but cannot reach this project", async () => {
      const outsider = await makePlainOrgMember(tenant.organizationId, "cert-owner-outsider");

      await expect(
        modules!.certificationProgramService.createProgram(ctx, tenant.projectId, {
          identifier: identifierFor("cert"),
          name: "Avionics certification effort",
          ownerId: outsider.id,
        }),
      ).rejects.toThrow(/does not have access to this project/);
    });

    it("accepts an owner who is an explicit member of this project", async () => {
      const member = await makePlainOrgMember(tenant.organizationId, "cert-owner-member");
      await modules!.projectMembership.addMember(ctx, tenant.projectId, {
        userId: member.id,
        role: "VIEWER",
      });

      const program = await modules!.certificationProgramService.createProgram(ctx, tenant.projectId, {
        identifier: identifierFor("cert"),
        name: "Avionics certification effort",
        ownerId: member.id,
      });
      expect(program.ownerId).toBe(member.id);
    });
  });
});
