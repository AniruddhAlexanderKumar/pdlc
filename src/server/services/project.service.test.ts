// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/domain";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

/**
 * The service is exercised against fake repositories: no database, no Prisma.
 * `$transaction` runs its callback with a sentinel client so we can also
 * assert that a mutation and its audit event are handed the *same* client —
 * i.e. that they would commit together.
 */
const TX = { __transaction: true } as const;

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)),
  },
}));

vi.mock("@/server/repositories/project.repository", () => ({
  createProject: vi.fn(),
  findProjectInOrganization: vi.fn(),
  listProjectsByOrganization: vi.fn(),
  updateProject: vi.fn(),
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  organizationExists: vi.fn(),
}));

vi.mock("@/server/repositories/audit-log.repository", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/server/repositories/project-membership.repository", () => ({
  findMembership: vi.fn(),
  createMembership: vi.fn(),
}));

vi.mock("@/server/repositories/user.repository", () => ({
  getOrganizationRole: vi.fn(),
}));

const projectRepository = await import("@/server/repositories/project.repository");
const organizationRepository = await import("@/server/repositories/organization.repository");
const auditLogRepository = await import("@/server/repositories/audit-log.repository");
const membershipRepository = await import("@/server/repositories/project-membership.repository");
const userRepository = await import("@/server/repositories/user.repository");
const projectService = await import("@/server/services/project.service");

const CONTEXT: OrganizationContext = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
};

const OTHER_ORG_CONTEXT: OrganizationContext = {
  organizationId: "org2bbbbbbbbbbbbbbbbbbbb",
  actorId: "user2bbbbbbbbbbbbbbbbbbb",
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

const ARCHIVED_PROJECT: Project = { ...PROJECT, status: "ARCHIVED" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(organizationRepository.organizationExists).mockResolvedValue(true);
  // The default fixture: CONTEXT's actor is an explicit MANAGER on PROJECT.
  // Individual tests override this (or `getOrganizationRole`) when the
  // access decision itself is what they are testing.
  vi.mocked(membershipRepository.findMembership).mockResolvedValue({
    id: "mem1",
    projectId: PROJECT.id,
    role: "MANAGER",
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: CONTEXT.actorId!, name: "Ada", email: "ada@example.test", organizationRole: "MEMBER" },
  });
  vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");
  vi.mocked(membershipRepository.createMembership).mockResolvedValue({
    id: "mem1",
    projectId: PROJECT.id,
    role: "MANAGER",
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: CONTEXT.actorId!, name: "Ada", email: "ada@example.test", organizationRole: "MEMBER" },
  });
});

describe("createProject", () => {
  it("creates a project scoped to the caller's organization", async () => {
    vi.mocked(projectRepository.createProject).mockResolvedValue(PROJECT);

    const project = await projectService.createProject(CONTEXT, {
      name: "Upper Stage Propulsion",
    });

    expect(project).toEqual(PROJECT);
    expect(projectRepository.createProject).toHaveBeenCalledWith(
      { organizationId: CONTEXT.organizationId, name: "Upper Stage Propulsion", description: null },
      TX,
    );
  });

  it("grants the creator an explicit MANAGER membership, in the same transaction", async () => {
    vi.mocked(projectRepository.createProject).mockResolvedValue(PROJECT);

    await projectService.createProject(CONTEXT, { name: "Upper Stage Propulsion" });

    expect(membershipRepository.createMembership).toHaveBeenCalledWith(
      { projectId: PROJECT.id, userId: CONTEXT.actorId, role: "MANAGER" },
      TX,
    );
  });

  it("records a creation audit event in the same transaction as the write", async () => {
    vi.mocked(projectRepository.createProject).mockResolvedValue(PROJECT);

    await projectService.createProject(CONTEXT, { name: "Upper Stage Propulsion" });

    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: CONTEXT.organizationId,
        actorId: CONTEXT.actorId,
        action: "project.created",
        entityType: "Project",
        entityId: PROJECT.id,
      }),
      TX,
    );
  });

  it("rejects a blank name", async () => {
    await expect(projectService.createProject(CONTEXT, { name: "   " })).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(projectRepository.createProject).not.toHaveBeenCalled();
  });

  it("rejects a caller-supplied organizationId instead of silently ignoring it", async () => {
    await expect(
      projectService.createProject(CONTEXT, {
        name: "Upper Stage Propulsion",
        organizationId: OTHER_ORG_CONTEXT.organizationId,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it.each(["status", "createdAt", "id"])("rejects a caller-supplied %s", async (field) => {
    await expect(
      projectService.createProject(CONTEXT, { name: "Upper Stage Propulsion", [field]: "ACTIVE" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("fails when the organization does not exist", async () => {
    vi.mocked(organizationRepository.organizationExists).mockResolvedValue(false);

    await expect(
      projectService.createProject(CONTEXT, { name: "Upper Stage Propulsion" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(projectRepository.createProject).not.toHaveBeenCalled();
  });
});

describe("listProjects", () => {
  it("lists only the caller's organization", async () => {
    vi.mocked(projectRepository.listProjectsByOrganization).mockResolvedValue([PROJECT]);

    const projects = await projectService.listProjects(CONTEXT);

    expect(projects).toEqual([PROJECT]);
    expect(projectRepository.listProjectsByOrganization).toHaveBeenCalledWith(
      CONTEXT.organizationId,
    );
  });

  it("returns an empty list rather than failing when there are no projects", async () => {
    vi.mocked(projectRepository.listProjectsByOrganization).mockResolvedValue([]);
    await expect(projectService.listProjects(CONTEXT)).resolves.toEqual([]);
  });
});

describe("getProject", () => {
  it("returns a project in the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);

    await expect(projectService.getProject(CONTEXT, PROJECT.id)).resolves.toEqual(PROJECT);
    expect(projectRepository.findProjectInOrganization).toHaveBeenCalledWith(
      CONTEXT.organizationId,
      PROJECT.id,
      undefined,
    );
  });

  it("does not return a project belonging to another organization", async () => {
    // The scoped query matches nothing for a foreign organization.
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    await expect(
      projectService.getProject(OTHER_ORG_CONTEXT, PROJECT.id),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(projectRepository.findProjectInOrganization).toHaveBeenCalledWith(
      OTHER_ORG_CONTEXT.organizationId,
      PROJECT.id,
      undefined,
    );
  });

  it("404s for a same-organization caller with no project membership and no owner role", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
    vi.mocked(membershipRepository.findMembership).mockResolvedValue(null);
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");

    await expect(projectService.getProject(CONTEXT, PROJECT.id)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("succeeds for a same-organization caller with no project membership who is the organization owner", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
    vi.mocked(membershipRepository.findMembership).mockResolvedValue(null);
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("OWNER");

    await expect(projectService.getProject(CONTEXT, PROJECT.id)).resolves.toEqual(PROJECT);
  });

  it("rejects a malformed project id before querying", async () => {
    await expect(projectService.getProject(CONTEXT, "not a valid id")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(projectRepository.findProjectInOrganization).not.toHaveBeenCalled();
  });
});

describe("updateProject", () => {
  it("updates name and description", async () => {
    const updated = { ...PROJECT, name: "Renamed", description: "Now with a description" };
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
    vi.mocked(projectRepository.updateProject).mockResolvedValue(updated);

    const project = await projectService.updateProject(CONTEXT, PROJECT.id, {
      name: "Renamed",
      description: "Now with a description",
    });

    expect(project).toEqual(updated);
    expect(projectRepository.updateProject).toHaveBeenCalledWith(
      PROJECT.id,
      { name: "Renamed", description: "Now with a description" },
      TX,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "project.updated" }),
      TX,
    );
  });

  it("rejects an attempt to change the status through update", async () => {
    await expect(
      projectService.updateProject(CONTEXT, PROJECT.id, { status: "ARCHIVED" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an empty update", async () => {
    await expect(projectService.updateProject(CONTEXT, PROJECT.id, {})).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("refuses to modify an archived project", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(ARCHIVED_PROJECT);

    await expect(
      projectService.updateProject(CONTEXT, PROJECT.id, { name: "Renamed" }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(projectRepository.updateProject).not.toHaveBeenCalled();
    expect(auditLogRepository.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("does not update a project from another organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    await expect(
      projectService.updateProject(OTHER_ORG_CONTEXT, PROJECT.id, { name: "Renamed" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(projectRepository.updateProject).not.toHaveBeenCalled();
  });
});

describe("archiveProject", () => {
  it("transitions the project to ARCHIVED and audits it", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
    vi.mocked(projectRepository.updateProject).mockResolvedValue(ARCHIVED_PROJECT);

    const project = await projectService.archiveProject(CONTEXT, PROJECT.id);

    expect(project.status).toBe("ARCHIVED");
    expect(projectRepository.updateProject).toHaveBeenCalledWith(
      PROJECT.id,
      { status: "ARCHIVED" },
      TX,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "project.archived", entityId: PROJECT.id }),
      TX,
    );
  });

  it("rejects archiving a project that is already archived", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(ARCHIVED_PROJECT);

    await expect(projectService.archiveProject(CONTEXT, PROJECT.id)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(projectRepository.updateProject).not.toHaveBeenCalled();
    expect(auditLogRepository.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("does not archive a project from another organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    await expect(
      projectService.archiveProject(OTHER_ORG_CONTEXT, PROJECT.id),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(projectRepository.updateProject).not.toHaveBeenCalled();
  });
});
