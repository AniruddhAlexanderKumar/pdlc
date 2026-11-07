import {
  type OrganizationRole,
  addOrganizationMemberRequestSchema,
  setOrganizationMemberRoleRequestSchema,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import { hashPassword } from "@/server/auth/password";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import * as userRepository from "@/server/repositories/user.repository";
import type { OrganizationMember } from "@/server/repositories/user.repository";
import { parseOrThrow } from "@/server/validation";
import { requireOrganizationOwner } from "./authorization.service";

/**
 * Organization membership administration.
 *
 * This product has no third-party identity provider and no invitation-email
 * flow — consistent with its self-hosted architecture, the minimum viable
 * "add someone to my organization" is the organization owner provisioning a
 * real account directly, the same password-based account `register()`
 * already creates, scoped into the owner's existing organization instead of
 * a new one. `MEMBER` is the only organization role this creates — an
 * additional `OWNER` is never granted through this path (see
 * `authorization.service.ts`'s own doc comment on why organization
 * ownership is not itself transferable in this pass).
 */

export const ORG_MEMBERSHIP_ENTITY_TYPE = "User";

export const ORG_MEMBERSHIP_AUDIT_ACTIONS = {
  memberAdded: "organization.member_added",
  roleChanged: "organization.member_role_changed",
} as const;

/**
 * What the browser is given for one organization member. `createdAt` is an
 * ISO string here rather than the repository's `Date`, the same boundary
 * every other DTO in this codebase draws.
 */
export interface OrganizationMemberDto {
  id: string;
  name: string;
  email: string;
  organizationRole: OrganizationMember["organizationRole"];
  joinedAt: string;
  projectCount: number;
}

/** Every user in the caller's organization. Read access only — any authenticated member of the org. */
export async function listOrganizationMembers(
  context: OrganizationContext,
): Promise<OrganizationMemberDto[]> {
  const members = await userRepository.listOrganizationMembers(context.organizationId);
  return members.map((member) => ({
    id: member.id,
    name: member.name,
    email: member.email,
    organizationRole: member.organizationRole,
    joinedAt: member.createdAt.toISOString(),
    projectCount: member.projectCount,
  }));
}

/**
 * Provisions a new user account inside the caller's own organization.
 * Owner-only — this is the one action that grows who belongs to the
 * organization at all, and Section 3's own semantics reserve it to OWNER.
 */
export async function addOrganizationMember(
  context: OrganizationContext,
  input: unknown,
): Promise<{ id: string; name: string; email: string }> {
  await requireOrganizationOwner(context);
  const data = parseOrThrow(addOrganizationMemberRequestSchema, input, "Invalid member");

  if (await userRepository.emailExists(data.email)) {
    throw new ConflictError("An account with that email address already exists.");
  }

  // Hashing is deliberately outside the transaction — Argon2id is designed
  // to be slow, and holding a transaction open for it would be wasteful.
  // Mirrors `AuthService.register` exactly.
  const passwordHash = await hashPassword(data.password);

  try {
    return await prisma.$transaction(async (tx) => {
      const user = await userRepository.createUser(
        {
          email: data.email,
          name: data.name,
          organizationId: context.organizationId,
          organizationRole: "MEMBER",
        },
        tx,
      );

      await userRepository.createCredential({ userId: user.id, passwordHash }, tx);

      await auditLogRepository.recordAuditEvent(
        {
          organizationId: context.organizationId,
          actorId: context.actorId,
          action: ORG_MEMBERSHIP_AUDIT_ACTIONS.memberAdded,
          entityType: ORG_MEMBERSHIP_ENTITY_TYPE,
          entityId: user.id,
          metadata: { email: user.email },
        },
        tx,
      );

      return { id: user.id, name: user.name, email: user.email };
    });
  } catch (error) {
    // Losing the unique-email race gets the same message as losing it early.
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "P2002"
    ) {
      throw new ConflictError("An account with that email address already exists.");
    }
    throw error;
  }
}

/**
 * Changes one member's organization role. Owner-only.
 *
 * Two guard rails, both deliberate:
 *
 * - **`OWNER` cannot be assigned.** The request schema does not accept it
 *   (`ASSIGNABLE_ORGANIZATION_ROLES`), so ownership stays untransferable
 *   through every path in this pass — the same restraint
 *   `addOrganizationMember` observes by only ever creating `MEMBER`.
 * - **An owner cannot change their own role.** Not a courtesy: an
 *   organization with no owner can never regain one, since granting
 *   `OWNER` is exactly what no path does. Demoting yourself would be a
 *   one-way door out of administering your own organization, so it is
 *   refused rather than confirmed-then-regretted.
 *
 * A target who is currently `OWNER` is refused for the same reason — that
 * would be the previous case wearing a different hat if two owners ever
 * existed.
 */
export async function setOrganizationMemberRole(
  context: OrganizationContext,
  userId: string,
  input: unknown,
): Promise<{ id: string; name: string; organizationRole: OrganizationRole }> {
  await requireOrganizationOwner(context);
  if (!context.actorId) {
    throw new ForbiddenError("An authenticated actor is required to change a member's role.");
  }
  const actorId = context.actorId;

  const data = parseOrThrow(setOrganizationMemberRoleRequestSchema, input, "Invalid role");

  if (userId === actorId) {
    throw new ValidationError("You cannot change your own organization role.");
  }

  const current = await userRepository.getOrganizationRole(userId, context.organizationId);
  if (current === null) {
    throw new NotFoundError("That person is not a member of this organization.");
  }
  if (current === "OWNER") {
    throw new ValidationError("An organization owner's role cannot be changed.");
  }

  return await prisma.$transaction(async (tx) => {
    const updated = await userRepository.updateOrganizationRole(
      { userId, organizationId: context.organizationId, role: data.role },
      tx,
    );
    if (!updated) {
      throw new NotFoundError("That person is not a member of this organization.");
    }

    await auditLogRepository.recordAuditEvent(
      {
        organizationId: context.organizationId,
        actorId,
        action: ORG_MEMBERSHIP_AUDIT_ACTIONS.roleChanged,
        entityType: ORG_MEMBERSHIP_ENTITY_TYPE,
        entityId: userId,
        metadata: { from: current, to: data.role },
      },
      tx,
    );

    return updated;
  });
}
