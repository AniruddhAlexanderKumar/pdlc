import {
  addProjectMemberRequestSchema,
  entityIdSchema,
  projectMemberIdSchema,
  changeProjectMemberRoleRequestSchema,
  type ProjectRole,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import * as membershipRepository from "@/server/repositories/project-membership.repository";
import type { ProjectMember } from "@/server/repositories/project-membership.repository";
import * as userRepository from "@/server/repositories/user.repository";
import { parseOrThrow } from "@/server/validation";
import { getProjectRole, isOrganizationOwner } from "./authorization.service";
import { requireProjectManageAccess, requireProjectReadAccess } from "./project-scope";

/**
 * Project membership administration.
 *
 * Every mutation here requires `requireProjectManageAccess` — MANAGER on
 * this specific project, or the organization's owner — checked before
 * anything else runs. Reads require only `requireProjectReadAccess`, so any
 * project member can see who else is on the project.
 */

export const MEMBERSHIP_ENTITY_TYPE = "ProjectMembership";

export const MEMBERSHIP_AUDIT_ACTIONS = {
  added: "project_membership.added",
  roleChanged: "project_membership.role_changed",
  removed: "project_membership.removed",
} as const;

function auditEvent(context: OrganizationContext, action: string, entityId: string, metadata: Record<string, unknown>) {
  return {
    organizationId: context.organizationId,
    actorId: context.actorId,
    action,
    entityType: MEMBERSHIP_ENTITY_TYPE,
    entityId,
    metadata,
  };
}

/** Every member of a project the caller may read. Any project role, or the organization owner. */
export async function listMembers(
  context: OrganizationContext,
  projectId: unknown,
): Promise<ProjectMember[]> {
  const scopedProjectId = await requireProjectReadAccess(context, projectId);
  return membershipRepository.listMembers(scopedProjectId);
}

export interface MyProjectAccess {
  /** An explicit membership's role, or `MANAGER` when the actor administers the organization implicitly. */
  role: ProjectRole;
  /** Separately exposed because it also governs organization-membership actions this project page may offer. */
  isOrganizationOwner: boolean;
}

/**
 * The caller's own effective access to this project — powers the UI's "your
 * role" display and its show/hide decisions. Never itself an authorization
 * check; useless as one, since every mutation route re-derives this
 * server-side from the session regardless of what a client sends back.
 */
export async function getMyAccess(
  context: OrganizationContext,
  projectId: unknown,
): Promise<MyProjectAccess> {
  const scopedProjectId = await requireProjectReadAccess(context, projectId);
  const [role, owner] = await Promise.all([
    getProjectRole(context, scopedProjectId),
    isOrganizationOwner(context),
  ]);
  // requireProjectReadAccess having succeeded guarantees a role exists.
  return { role: role as ProjectRole, isOrganizationOwner: owner };
}

/**
 * Grants a real organization member access to this project. The user must
 * already belong to the caller's own organization — never an id from
 * elsewhere, and never taken on faith from the client beyond the id itself.
 */
export async function addMember(
  context: OrganizationContext,
  projectId: unknown,
  input: unknown,
): Promise<ProjectMember> {
  const scopedProjectId = await requireProjectManageAccess(context, projectId);
  const data = parseOrThrow(addProjectMemberRequestSchema, input, "Invalid project member");

  if (!(await userRepository.isMemberOfOrganization(data.userId, context.organizationId))) {
    throw new ValidationError("That user is not a member of this organization.");
  }

  const existing = await membershipRepository.findMembership(scopedProjectId, data.userId);
  if (existing) {
    throw new ConflictError("That user is already a member of this project.");
  }

  return prisma.$transaction(async (tx) => {
    const member = await membershipRepository.createMembership(
      { projectId: scopedProjectId, userId: data.userId, role: data.role },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      auditEvent(context, MEMBERSHIP_AUDIT_ACTIONS.added, member.id, {
        projectId: scopedProjectId,
        userId: data.userId,
        role: data.role,
      }),
      tx,
    );

    return member;
  });
}

/**
 * Refuses to leave a project with zero managers — the only role that can
 * ever administer membership again, or reach every approval action, would
 * be gone, and the organization owner cannot always be assumed to want that
 * responsibility silently.
 */
async function requireNotLastManager(
  scopedProjectId: string,
  existing: ProjectMember,
  nextRole: "MANAGER" | "ENGINEER" | "REVIEWER" | "VIEWER" | null,
): Promise<void> {
  const losingManager = existing.role === "MANAGER" && nextRole !== "MANAGER";
  if (!losingManager) return;

  const managerCount = await membershipRepository.countManagers(scopedProjectId);
  if (managerCount <= 1) {
    throw new ConflictError(
      "This project would have no manager left. Assign another manager before changing or removing this one.",
    );
  }
}

export async function changeMemberRole(
  context: OrganizationContext,
  projectId: unknown,
  memberId: unknown,
  input: unknown,
): Promise<ProjectMember> {
  const scopedProjectId = await requireProjectManageAccess(context, projectId);
  const id = parseOrThrow(projectMemberIdSchema, memberId, "Invalid member id");
  const data = parseOrThrow(changeProjectMemberRoleRequestSchema, input, "Invalid role change");

  return prisma.$transaction(async (tx) => {
    const existing = await requireMemberInProject(scopedProjectId, id, tx);
    await requireNotLastManager(scopedProjectId, existing, data.role);

    if (existing.role === data.role) {
      throw new ConflictError(`This member already holds the ${data.role} role.`);
    }

    const member = await membershipRepository.updateRole(id, data.role, tx);

    await auditLogRepository.recordAuditEvent(
      auditEvent(context, MEMBERSHIP_AUDIT_ACTIONS.roleChanged, member.id, {
        projectId: scopedProjectId,
        userId: member.user.id,
        from: existing.role,
        to: data.role,
      }),
      tx,
    );

    return member;
  });
}

export async function removeMember(
  context: OrganizationContext,
  projectId: unknown,
  memberId: unknown,
): Promise<void> {
  const scopedProjectId = await requireProjectManageAccess(context, projectId);
  const id = parseOrThrow(projectMemberIdSchema, memberId, "Invalid member id");

  await prisma.$transaction(async (tx) => {
    const existing = await requireMemberInProject(scopedProjectId, id, tx);
    await requireNotLastManager(scopedProjectId, existing, null);

    await membershipRepository.deleteMembership(id, tx);

    await auditLogRepository.recordAuditEvent(
      auditEvent(context, MEMBERSHIP_AUDIT_ACTIONS.removed, id, {
        projectId: scopedProjectId,
        userId: existing.user.id,
        role: existing.role,
      }),
      tx,
    );
  });
}

async function requireMemberInProject(
  scopedProjectId: string,
  memberId: string,
  client?: Parameters<typeof membershipRepository.listMembers>[1],
): Promise<ProjectMember> {
  const members = await membershipRepository.listMembers(scopedProjectId, client);
  const member = members.find((row) => row.id === memberId);
  if (!member) {
    throw new NotFoundError(`Project member ${memberId} was not found.`);
  }
  return member;
}

export const memberIdSchema = entityIdSchema;
