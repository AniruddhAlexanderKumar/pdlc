// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

/**
 * The one place project/organization access is decided, against fake
 * repositories: no database, no Prisma. These are the "reusable
 * authorization test helpers" the rest of the migrated services' own tests
 * build their role-boundary cases on top of — `asRole()` here is the same
 * shape as every migrated service test's own `asRole()`.
 *
 * Every test asserts on the *outcome* (throws/does not throw, which role is
 * returned) rather than on incidental call counts, so this file stays
 * useful even as the internal composition of `getProjectRole` changes.
 */

vi.mock("@/server/repositories/project-membership.repository", () => ({
  findMembership: vi.fn(),
}));
vi.mock("@/server/repositories/user.repository", () => ({
  getOrganizationRole: vi.fn(),
  isMemberOfOrganization: vi.fn(),
}));
vi.mock("@/server/repositories/project.repository", () => ({
  findProjectInOrganization: vi.fn(),
}));

const membershipRepository = await import("@/server/repositories/project-membership.repository");
const userRepository = await import("@/server/repositories/user.repository");
const projectRepository = await import("@/server/repositories/project.repository");
const service = await import("./authorization.service");

const CONTEXT: OrganizationContext = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
};

const SYSTEM_CONTEXT: OrganizationContext = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: null,
};

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";

function projectRow(organizationId = CONTEXT.organizationId) {
  return {
    id: PROJECT_ID,
    organizationId,
    name: "Test project",
    description: null,
    status: "ACTIVE",
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function membershipRow(role: "MANAGER" | "ENGINEER" | "REVIEWER" | "VIEWER") {
  return {
    id: "mem1aaaaaaaaaaaaaaaaaaa",
    projectId: PROJECT_ID,
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: CONTEXT.actorId!, name: "Ada", email: "ada@example.test", organizationRole: "MEMBER" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(membershipRepository.findMembership).mockResolvedValue(null);
  vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");
  vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(true);
  // In-organization by default — every existing test below is about the
  // membership/ownership axis, not tenancy, so it assumes PROJECT_ID already
  // belongs to CONTEXT.organizationId. The cross-organization case gets its
  // own test, overriding this per-call.
  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(projectRow() as never);
});

describe("isOrganizationOwner / requireOrganizationOwner", () => {
  it("is false for a plain MEMBER", async () => {
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");
    await expect(service.isOrganizationOwner(CONTEXT)).resolves.toBe(false);
  });

  it("is true for OWNER", async () => {
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("OWNER");
    await expect(service.isOrganizationOwner(CONTEXT)).resolves.toBe(true);
  });

  it("is false for a context with no actor — a system context owns nothing", async () => {
    await expect(service.isOrganizationOwner(SYSTEM_CONTEXT)).resolves.toBe(false);
    expect(userRepository.getOrganizationRole).not.toHaveBeenCalled();
  });

  it("requireOrganizationOwner throws ForbiddenError for a non-owner", async () => {
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");
    await expect(service.requireOrganizationOwner(CONTEXT)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("requireOrganizationOwner resolves for an owner", async () => {
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("OWNER");
    await expect(service.requireOrganizationOwner(CONTEXT)).resolves.toBeUndefined();
  });

  it("an EXECUTIVE is not an owner and cannot pass the owner gate — the role administers nothing", async () => {
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("EXECUTIVE");
    await expect(service.isOrganizationOwner(CONTEXT)).resolves.toBe(false);
    await expect(service.requireOrganizationOwner(CONTEXT)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("requirePortfolioAccess", () => {
  it("resolves for an owner", async () => {
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("OWNER");
    await expect(service.requirePortfolioAccess(CONTEXT)).resolves.toBeUndefined();
  });

  it("resolves for an executive — the one surface the role exists to reach", async () => {
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("EXECUTIVE");
    await expect(service.requirePortfolioAccess(CONTEXT)).resolves.toBeUndefined();
  });

  it("throws for a plain member, who is a legitimate member of the organization but not of this", async () => {
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");
    await expect(service.requirePortfolioAccess(CONTEXT)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("throws for a context with no actor", async () => {
    await expect(service.requirePortfolioAccess(SYSTEM_CONTEXT)).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("getProjectRole", () => {
  it("returns the explicit membership's role — the fast path, checked first", async () => {
    vi.mocked(membershipRepository.findMembership).mockResolvedValue(membershipRow("ENGINEER") as never);

    await expect(service.getProjectRole(CONTEXT, PROJECT_ID)).resolves.toBe("ENGINEER");
    // The org-owner fallback is never consulted once an explicit row exists.
    expect(userRepository.getOrganizationRole).not.toHaveBeenCalled();
  });

  it("falls back to implicit MANAGER for an organization owner with no membership row", async () => {
    vi.mocked(membershipRepository.findMembership).mockResolvedValue(null);
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("OWNER");

    await expect(service.getProjectRole(CONTEXT, PROJECT_ID)).resolves.toBe("MANAGER");
  });

  it("returns null for a plain member with no membership row", async () => {
    vi.mocked(membershipRepository.findMembership).mockResolvedValue(null);
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");

    await expect(service.getProjectRole(CONTEXT, PROJECT_ID)).resolves.toBeNull();
  });

  it("falls back to implicit VIEWER for an organization executive with no membership row", async () => {
    vi.mocked(membershipRepository.findMembership).mockResolvedValue(null);
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("EXECUTIVE");

    await expect(service.getProjectRole(CONTEXT, PROJECT_ID)).resolves.toBe("VIEWER");
  });

  it("an explicit membership row still wins for an executive — being an executive never demotes a real role", async () => {
    vi.mocked(membershipRepository.findMembership).mockResolvedValue(membershipRow("ENGINEER") as never);

    await expect(service.getProjectRole(CONTEXT, PROJECT_ID)).resolves.toBe("ENGINEER");
    expect(userRepository.getOrganizationRole).not.toHaveBeenCalled();
  });

  it("returns null for an executive of a *different* organization — the implicit grant does not cross the boundary either", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("EXECUTIVE");

    await expect(service.getProjectRole(CONTEXT, PROJECT_ID)).resolves.toBeNull();
  });

  it("returns null for a context with no actor, without touching either repository", async () => {
    await expect(service.getProjectRole(SYSTEM_CONTEXT, PROJECT_ID)).resolves.toBeNull();
    expect(membershipRepository.findMembership).not.toHaveBeenCalled();
    expect(userRepository.getOrganizationRole).not.toHaveBeenCalled();
  });

  it("returns null for a project belonging to a different organization, even for that organization's own owner — the implicit-MANAGER fallback does not cross the organization boundary", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("OWNER");

    await expect(service.getProjectRole(CONTEXT, PROJECT_ID)).resolves.toBeNull();
    // Short-circuits before either check even runs: there is nothing here
    // for membership or ownership to be checked against.
    expect(membershipRepository.findMembership).not.toHaveBeenCalled();
    expect(userRepository.getOrganizationRole).not.toHaveBeenCalled();
  });
});

describe("requireProjectAccess", () => {
  it("404s — not 403 — for a caller with neither membership nor ownership", async () => {
    await expect(service.requireProjectAccess(CONTEXT, PROJECT_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("returns the role for any real member, VIEWER included", async () => {
    vi.mocked(membershipRepository.findMembership).mockResolvedValue(membershipRow("VIEWER") as never);
    await expect(service.requireProjectAccess(CONTEXT, PROJECT_ID)).resolves.toBe("VIEWER");
  });
});

describe("requireProjectWrite", () => {
  it.each(["MANAGER", "ENGINEER"] as const)("allows %s", async (role) => {
    vi.mocked(membershipRepository.findMembership).mockResolvedValue(membershipRow(role) as never);
    await expect(service.requireProjectWrite(CONTEXT, PROJECT_ID)).resolves.toBe(role);
  });

  it.each(["REVIEWER", "VIEWER"] as const)("refuses %s with ForbiddenError", async (role) => {
    vi.mocked(membershipRepository.findMembership).mockResolvedValue(membershipRow(role) as never);
    await expect(service.requireProjectWrite(CONTEXT, PROJECT_ID)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("404s rather than 403s for a caller with no access at all", async () => {
    await expect(service.requireProjectWrite(CONTEXT, PROJECT_ID)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});

describe("requireProjectApprove", () => {
  it.each(["MANAGER", "REVIEWER"] as const)("allows %s", async (role) => {
    vi.mocked(membershipRepository.findMembership).mockResolvedValue(membershipRow(role) as never);
    await expect(service.requireProjectApprove(CONTEXT, PROJECT_ID)).resolves.toBe(role);
  });

  it.each(["ENGINEER", "VIEWER"] as const)(
    "refuses %s — write authority is not approval authority",
    async (role) => {
      vi.mocked(membershipRepository.findMembership).mockResolvedValue(membershipRow(role) as never);
      await expect(service.requireProjectApprove(CONTEXT, PROJECT_ID)).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    },
  );
});

describe("requireProjectManage", () => {
  it("allows only MANAGER", async () => {
    vi.mocked(membershipRepository.findMembership).mockResolvedValue(membershipRow("MANAGER") as never);
    await expect(service.requireProjectManage(CONTEXT, PROJECT_ID)).resolves.toBe("MANAGER");
  });

  it.each(["ENGINEER", "REVIEWER", "VIEWER"] as const)("refuses %s", async (role) => {
    vi.mocked(membershipRepository.findMembership).mockResolvedValue(membershipRow(role) as never);
    await expect(service.requireProjectManage(CONTEXT, PROJECT_ID)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });

  it("an organization owner with no explicit membership row may still manage", async () => {
    vi.mocked(membershipRepository.findMembership).mockResolvedValue(null);
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("OWNER");
    await expect(service.requireProjectManage(CONTEXT, PROJECT_ID)).resolves.toBe("MANAGER");
  });
});

describe("requireAssignableOwner", () => {
  it("rejects a proposed owner outside the caller's organization", async () => {
    vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(false);

    await expect(
      service.requireAssignableOwner(CONTEXT, PROJECT_ID, "userfromanotherorg1234"),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an organization member who cannot reach this specific project", async () => {
    vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(true);
    // The proposed owner has no membership row on this project, and getOrganizationRole
    // for *that* user (not the caller) resolves to a plain member.
    vi.mocked(membershipRepository.findMembership).mockResolvedValue(null);
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");

    await expect(
      service.requireAssignableOwner(CONTEXT, PROJECT_ID, "user2aaaaaaaaaaaaaaaaaaa"),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("accepts an organization member who is an explicit project member", async () => {
    vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(true);
    vi.mocked(membershipRepository.findMembership).mockResolvedValue(membershipRow("VIEWER") as never);

    await expect(
      service.requireAssignableOwner(CONTEXT, PROJECT_ID, "user2aaaaaaaaaaaaaaaaaaa"),
    ).resolves.toBeUndefined();
  });

  it("accepts the organization's owner even with no explicit membership row", async () => {
    vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(true);
    vi.mocked(membershipRepository.findMembership).mockResolvedValue(null);
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("OWNER");

    await expect(
      service.requireAssignableOwner(CONTEXT, PROJECT_ID, "user2aaaaaaaaaaaaaaaaaaa"),
    ).resolves.toBeUndefined();
  });
});
