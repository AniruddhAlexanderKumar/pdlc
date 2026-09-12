import { addOrganizationMemberRequestSchema } from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError } from "@/server/errors";
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
} as const;

/** Every user in the caller's organization. Read access only — any authenticated member of the org. */
export async function listOrganizationMembers(
  context: OrganizationContext,
): Promise<OrganizationMember[]> {
  return userRepository.listOrganizationMembers(context.organizationId);
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
