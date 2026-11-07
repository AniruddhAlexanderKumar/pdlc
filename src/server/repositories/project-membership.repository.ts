import type { ProjectRole } from "@/domain";
import { type DbClient, prisma } from "@/lib/db";
import { rethrowAsConflict } from "./prisma-error";

/**
 * Explicit project membership persistence.
 *
 * One row per (project, user). This table is the entire mechanism behind
 * "organization membership no longer implies project access" — a user
 * reaches a project either through a real row here, or by being their
 * organization's OWNER (checked separately, in
 * `authorization.service.ts`; this file never reads `organizationRole`).
 */

export interface ProjectMember {
  id: string;
  projectId: string;
  role: ProjectRole;
  createdAt: Date;
  updatedAt: Date;
  user: { id: string; name: string; email: string; organizationRole: string };
}

const MEMBER_SELECT = {
  id: true,
  projectId: true,
  role: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true, email: true, organizationRole: true } },
} as const;

export async function findMembership(
  projectId: string,
  userId: string,
  client: DbClient = prisma,
): Promise<ProjectMember | null> {
  return client.projectMembership.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: MEMBER_SELECT,
  }) as Promise<ProjectMember | null>;
}

/** Every member of one project, ordered by role then name — managers first, alphabetically within a role. */
export async function listMembers(
  projectId: string,
  client: DbClient = prisma,
): Promise<ProjectMember[]> {
  const rows = await client.projectMembership.findMany({
    where: { projectId },
    select: MEMBER_SELECT,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows as ProjectMember[];
}

export async function createMembership(
  input: { projectId: string; userId: string; role: ProjectRole },
  client: DbClient = prisma,
): Promise<ProjectMember> {
  try {
    return (await client.projectMembership.create({
      data: input,
      select: MEMBER_SELECT,
    })) as ProjectMember;
  } catch (error) {
    rethrowAsConflict(error, "That user is already a member of this project.");
  }
}

export async function updateRole(
  id: string,
  role: ProjectRole,
  client: DbClient = prisma,
): Promise<ProjectMember> {
  return client.projectMembership.update({
    where: { id },
    data: { role },
    select: MEMBER_SELECT,
  }) as Promise<ProjectMember>;
}

export async function deleteMembership(id: string, client: DbClient = prisma): Promise<void> {
  await client.projectMembership.delete({ where: { id } });
}

/** How many MANAGER rows a project currently has — used to refuse removing the last one. */
export async function countManagers(projectId: string, client: DbClient = prisma): Promise<number> {
  return client.projectMembership.count({ where: { projectId, role: "MANAGER" } });
}
