// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/domain";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

/**
 * Project membership administration, against fake repositories: no
 * database, no Prisma. The transaction sentinel proves each mutation and
 * its audit event are handed the same client.
 */
const TX = { __transaction: true } as const;

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)) },
}));

vi.mock("@/server/repositories/project.repository", () => ({
  findProjectInOrganization: vi.fn(),
}));

vi.mock("@/server/repositories/project-membership.repository", () => ({
  findMembership: vi.fn(),
  listMembers: vi.fn(),
  createMembership: vi.fn(),
  updateRole: vi.fn(),
  deleteMembership: vi.fn(),
  countManagers: vi.fn(),
}));

vi.mock("@/server/repositories/user.repository", () => ({
  isMemberOfOrganization: vi.fn(),
  getOrganizationRole: vi.fn(),
}));

vi.mock("@/server/repositories/audit-log.repository", () => ({
  recordAuditEvent: vi.fn(),
}));

const projectRepository = await import("@/server/repositories/project.repository");
const membershipRepository = await import("@/server/repositories/project-membership.repository");
const userRepository = await import("@/server/repositories/user.repository");
const auditLogRepository = await import("@/server/repositories/audit-log.repository");
const service = await import("./project-membership.service");

const CONTEXT: OrganizationContext = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
};

const PROJECT: Project = {
  id: "proj1aaaaaaaaaaaaaaaaaaa",
  organizationId: CONTEXT.organizationId,
  name: "Upper Stage Propulsion",
  description: null,
  status: "ACTIVE",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function member(overrides: Record<string, unknown> = {}) {
  return {
    id: "mem1aaaaaaaaaaaaaaaaaaa",
    projectId: PROJECT.id,
    role: "ENGINEER",
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: "user2aaaaaaaaaaaaaaaaaaa", name: "Grace Hopper", email: "grace@example.test", organizationRole: "MEMBER" },
    ...overrides,
  };
}

function callerMembership(role: "MANAGER" | "ENGINEER" | "REVIEWER" | "VIEWER") {
  return {
    id: "mem-caller",
    projectId: PROJECT.id,
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: CONTEXT.actorId!, name: "Ada", email: "ada@example.test", organizationRole: "MEMBER" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
  // Default: the caller is a MANAGER on this project.
  vi.mocked(membershipRepository.findMembership).mockImplementation(async (_projectId, userId) =>
    userId === CONTEXT.actorId ? (callerMembership("MANAGER") as never) : null,
  );
  vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");
  vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(true);
  vi.mocked(membershipRepository.listMembers).mockResolvedValue([]);
  vi.mocked(membershipRepository.countManagers).mockResolvedValue(2);
});

describe("listMembers", () => {
  it("returns every member for any project reader", async () => {
    vi.mocked(membershipRepository.findMembership).mockImplementation(async (_projectId, userId) =>
      userId === CONTEXT.actorId ? (callerMembership("VIEWER") as never) : null,
    );
    vi.mocked(membershipRepository.listMembers).mockResolvedValue([member()] as never);

    const members = await service.listMembers(CONTEXT, PROJECT.id);
    expect(members).toHaveLength(1);
  });

  it("404s for a project outside the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);
    await expect(service.listMembers(CONTEXT, PROJECT.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("getMyAccess", () => {
  it("reports the caller's real membership role and that they are not the org owner", async () => {
    vi.mocked(membershipRepository.findMembership).mockImplementation(async (_projectId, userId) =>
      userId === CONTEXT.actorId ? (callerMembership("REVIEWER") as never) : null,
    );
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");

    await expect(service.getMyAccess(CONTEXT, PROJECT.id)).resolves.toEqual({
      role: "REVIEWER",
      isOrganizationOwner: false,
    });
  });

  it("reports implicit MANAGER and isOrganizationOwner for the org owner with no membership row", async () => {
    vi.mocked(membershipRepository.findMembership).mockResolvedValue(null);
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("OWNER");

    await expect(service.getMyAccess(CONTEXT, PROJECT.id)).resolves.toEqual({
      role: "MANAGER",
      isOrganizationOwner: true,
    });
  });
});

describe("addMember", () => {
  it("refuses a VIEWER adding a member", async () => {
    vi.mocked(membershipRepository.findMembership).mockImplementation(async (_projectId, userId) =>
      userId === CONTEXT.actorId ? (callerMembership("VIEWER") as never) : null,
    );

    await expect(
      service.addMember(CONTEXT, PROJECT.id, { userId: "user2aaaaaaaaaaaaaaaaaaa", role: "ENGINEER" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(membershipRepository.createMembership).not.toHaveBeenCalled();
  });

  it("refuses an ENGINEER adding a member — write authority is not membership-management authority", async () => {
    vi.mocked(membershipRepository.findMembership).mockImplementation(async (_projectId, userId) =>
      userId === CONTEXT.actorId ? (callerMembership("ENGINEER") as never) : null,
    );

    await expect(
      service.addMember(CONTEXT, PROJECT.id, { userId: "user2aaaaaaaaaaaaaaaaaaa", role: "ENGINEER" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("a MANAGER adds a real organization member, and audits it in the same transaction", async () => {
    vi.mocked(membershipRepository.createMembership).mockResolvedValue(member() as never);

    const created = await service.addMember(CONTEXT, PROJECT.id, {
      userId: "user2aaaaaaaaaaaaaaaaaaa",
      role: "ENGINEER",
    });

    expect(created.user.id).toBe("user2aaaaaaaaaaaaaaaaaaa");
    expect(membershipRepository.createMembership).toHaveBeenCalledWith(
      { projectId: PROJECT.id, userId: "user2aaaaaaaaaaaaaaaaaaa", role: "ENGINEER" },
      TX,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "project_membership.added" }),
      TX,
    );
  });

  it("refuses a user from another organization, never reaching the repository", async () => {
    vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(false);

    await expect(
      service.addMember(CONTEXT, PROJECT.id, { userId: "userfromanotherorg1234", role: "ENGINEER" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(membershipRepository.createMembership).not.toHaveBeenCalled();
  });

  it("surfaces an existing membership as a conflict before writing anything", async () => {
    vi.mocked(membershipRepository.findMembership).mockImplementation(async (_projectId, userId) => {
      if (userId === CONTEXT.actorId) return callerMembership("MANAGER") as never;
      if (userId === "user2aaaaaaaaaaaaaaaaaaa") return member() as never;
      return null;
    });

    await expect(
      service.addMember(CONTEXT, PROJECT.id, { userId: "user2aaaaaaaaaaaaaaaaaaa", role: "ENGINEER" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(membershipRepository.createMembership).not.toHaveBeenCalled();
  });

  it("organization owner with no explicit membership row may still add members", async () => {
    vi.mocked(membershipRepository.findMembership).mockResolvedValue(null);
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("OWNER");
    vi.mocked(membershipRepository.createMembership).mockResolvedValue(member() as never);

    await expect(
      service.addMember(CONTEXT, PROJECT.id, { userId: "user2aaaaaaaaaaaaaaaaaaa", role: "VIEWER" }),
    ).resolves.toBeDefined();
  });
});

describe("changeMemberRole", () => {
  it("changes a member's role and audits from/to", async () => {
    vi.mocked(membershipRepository.listMembers).mockResolvedValue([member({ role: "ENGINEER" })] as never);
    vi.mocked(membershipRepository.updateRole).mockResolvedValue(member({ role: "REVIEWER" }) as never);

    const updated = await service.changeMemberRole(CONTEXT, PROJECT.id, member().id, { role: "REVIEWER" });

    expect(updated.role).toBe("REVIEWER");
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "project_membership.role_changed",
        metadata: expect.objectContaining({ from: "ENGINEER", to: "REVIEWER" }),
      }),
      TX,
    );
  });

  it("refuses a no-op role change", async () => {
    vi.mocked(membershipRepository.listMembers).mockResolvedValue([member({ role: "ENGINEER" })] as never);

    await expect(
      service.changeMemberRole(CONTEXT, PROJECT.id, member().id, { role: "ENGINEER" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(membershipRepository.updateRole).not.toHaveBeenCalled();
  });

  it("refuses demoting the last manager", async () => {
    vi.mocked(membershipRepository.listMembers).mockResolvedValue([
      member({ role: "MANAGER" }),
    ] as never);
    vi.mocked(membershipRepository.countManagers).mockResolvedValue(1);

    await expect(
      service.changeMemberRole(CONTEXT, PROJECT.id, member().id, { role: "ENGINEER" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(membershipRepository.updateRole).not.toHaveBeenCalled();
  });

  it("allows demoting a manager when another manager remains", async () => {
    vi.mocked(membershipRepository.listMembers).mockResolvedValue([
      member({ role: "MANAGER" }),
    ] as never);
    vi.mocked(membershipRepository.countManagers).mockResolvedValue(2);
    vi.mocked(membershipRepository.updateRole).mockResolvedValue(member({ role: "ENGINEER" }) as never);

    await expect(
      service.changeMemberRole(CONTEXT, PROJECT.id, member().id, { role: "ENGINEER" }),
    ).resolves.toMatchObject({ role: "ENGINEER" });
  });

  it("404s for a member id not on this project", async () => {
    vi.mocked(membershipRepository.listMembers).mockResolvedValue([]);

    await expect(
      service.changeMemberRole(CONTEXT, PROJECT.id, "memfromelsewhere1234", { role: "ENGINEER" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses a REVIEWER changing roles — approval authority is not membership-management authority", async () => {
    vi.mocked(membershipRepository.findMembership).mockImplementation(async (_projectId, userId) =>
      userId === CONTEXT.actorId ? (callerMembership("REVIEWER") as never) : null,
    );

    await expect(
      service.changeMemberRole(CONTEXT, PROJECT.id, member().id, { role: "VIEWER" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("removeMember", () => {
  it("removes a member and audits it", async () => {
    vi.mocked(membershipRepository.listMembers).mockResolvedValue([member({ role: "ENGINEER" })] as never);

    await service.removeMember(CONTEXT, PROJECT.id, member().id);

    expect(membershipRepository.deleteMembership).toHaveBeenCalledWith(member().id, TX);
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "project_membership.removed" }),
      TX,
    );
  });

  it("refuses removing the last manager", async () => {
    vi.mocked(membershipRepository.listMembers).mockResolvedValue([
      member({ role: "MANAGER" }),
    ] as never);
    vi.mocked(membershipRepository.countManagers).mockResolvedValue(1);

    await expect(service.removeMember(CONTEXT, PROJECT.id, member().id)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(membershipRepository.deleteMembership).not.toHaveBeenCalled();
  });

  it("refuses a VIEWER removing a member", async () => {
    vi.mocked(membershipRepository.findMembership).mockImplementation(async (_projectId, userId) =>
      userId === CONTEXT.actorId ? (callerMembership("VIEWER") as never) : null,
    );

    await expect(service.removeMember(CONTEXT, PROJECT.id, member().id)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});
