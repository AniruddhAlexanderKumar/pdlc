import {
  type OrganizationProfile,
  setOrganizationIndustryRequestSchema,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import * as organizationRepository from "@/server/repositories/organization.repository";
import { parseOrThrow } from "@/server/validation";
import { requireOrganizationOwner } from "./authorization.service";

/**
 * Organization profile — currently just the engineering-industry selection.
 *
 * This is deliberately small and deliberately inert: it records which real
 * engineering discipline an organization works in, for display, and does
 * not feed any engineering computation. No readiness engine, no Sentinel
 * rule, no impact-analysis propagation rule reads this field — see
 * `organization.ts`'s own doc comment. A dashboard-emphasis or
 * terminology-personalization layer that actually *consumes* this value is
 * explicitly out of scope here; this is the selection, not the
 * personalization engine that would read it.
 */

export const ORGANIZATION_ENTITY_TYPE = "Organization";

export const ORGANIZATION_AUDIT_ACTIONS = {
  industrySet: "organization.industry_set",
} as const;

function toProfile(row: {
  id: string;
  name: string;
  industry: OrganizationProfile["industry"];
  industryOtherDetail: string | null;
  industrySetAt: Date | null;
  industrySetBy: { id: string; name: string } | null;
}): OrganizationProfile {
  return {
    id: row.id,
    name: row.name,
    industry: row.industry,
    industryOtherDetail: row.industryOtherDetail,
    industrySetAt: row.industrySetAt ? row.industrySetAt.toISOString() : null,
    industrySetBy: row.industrySetBy,
  };
}

/** Any authenticated member of the organization may read its profile. */
export async function getOrganizationProfile(
  context: OrganizationContext,
): Promise<OrganizationProfile> {
  const row = await organizationRepository.getOrganizationProfile(context.organizationId);
  if (!row) throw new NotFoundError("Organization was not found.");
  return toProfile(row);
}

/**
 * Sets (or changes) the organization's industry. Owner-only — the same
 * reservation `addOrganizationMember` uses, for the same reason: this is an
 * organization-wide property, not a project-scoped or personal one, so it
 * follows the org-administration tier, not project roles.
 */
export async function setOrganizationIndustry(
  context: OrganizationContext,
  input: unknown,
): Promise<OrganizationProfile> {
  await requireOrganizationOwner(context);
  // `requireOrganizationOwner` proves this context resolved to a real,
  // authenticated owner, but its type stays `string | null` for contexts in
  // general — narrow it explicitly here rather than asserting past the
  // compiler, since this id becomes a real foreign key next.
  if (!context.actorId) {
    throw new ForbiddenError("An authenticated actor is required to set the organization's industry.");
  }
  const actorId = context.actorId;
  const data = parseOrThrow(setOrganizationIndustryRequestSchema, input, "Invalid industry selection");

  const setAt = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const row = await organizationRepository.updateOrganizationIndustry(
      {
        organizationId: context.organizationId,
        industry: data.industry,
        otherDetail: data.otherDetail ?? null,
        setById: actorId,
        setAt,
      },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      {
        organizationId: context.organizationId,
        actorId,
        action: ORGANIZATION_AUDIT_ACTIONS.industrySet,
        entityType: ORGANIZATION_ENTITY_TYPE,
        entityId: context.organizationId,
        metadata: { industry: data.industry, otherDetail: data.otherDetail ?? null },
      },
      tx,
    );

    return row;
  });

  return toProfile(updated);
}
