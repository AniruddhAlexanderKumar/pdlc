import {
  type OrganizationProfile,
  type TerminologyLabelOverrides,
  TERMINOLOGY_LABEL_KEYS,
  setOrganizationIndustryRequestSchema,
  setOrganizationTerminologyRequestSchema,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ForbiddenError, NotFoundError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import type { OrganizationProfileRow } from "@/server/repositories/organization.repository";
import * as organizationRepository from "@/server/repositories/organization.repository";
import { parseOrThrow } from "@/server/validation";
import { requireOrganizationOwner } from "./authorization.service";

/**
 * Organization profile — the engineering-industry selection, and the
 * organization's own terminology overrides.
 *
 * Both are deliberately small and deliberately inert to engineering
 * computation: industry records which real discipline an organization
 * works in, for display; terminology records which display label an
 * organization prefers for a fixed set of artifact nouns, read only by
 * navigation and page headers (see `resolveTerminologyLabel` in
 * `@/domain`). No readiness engine, no Sentinel rule, no impact-analysis
 * propagation rule reads either field — see `organization.ts`'s own doc
 * comments. Renaming "Risk" to "Hazard" here changes what a sidebar link
 * says, never what a readiness verdict is.
 */

export const ORGANIZATION_ENTITY_TYPE = "Organization";

export const ORGANIZATION_AUDIT_ACTIONS = {
  industrySet: "organization.industry_set",
  terminologySet: "organization.terminology_set",
} as const;

/**
 * The `labelOverrides` JSON column, narrowed to the shape the domain layer
 * expects. Never trusts the column blindly: a key this product no longer
 * recognizes (an older deploy's now-retired key, or a row edited outside
 * this service) is dropped rather than surfaced, and a non-string value is
 * dropped too — the same "don't trust storage, trust validation" posture
 * `parseOrThrow` applies to requests, applied here to what comes back out.
 */
function toLabelOverrides(raw: OrganizationProfileRow["labelOverrides"]): TerminologyLabelOverrides {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const overrides: TerminologyLabelOverrides = {};
  for (const key of TERMINOLOGY_LABEL_KEYS) {
    const value = (raw as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) {
      overrides[key] = value;
    }
  }
  return overrides;
}

function toProfile(row: OrganizationProfileRow): OrganizationProfile {
  return {
    id: row.id,
    name: row.name,
    industry: row.industry,
    industryOtherDetail: row.industryOtherDetail,
    industrySetAt: row.industrySetAt ? row.industrySetAt.toISOString() : null,
    industrySetBy: row.industrySetBy,
    labelOverrides: toLabelOverrides(row.labelOverrides),
    labelOverridesSetAt: row.labelOverridesSetAt ? row.labelOverridesSetAt.toISOString() : null,
    labelOverridesSetBy: row.labelOverridesSetBy,
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

/**
 * Sets (or changes) the organization's terminology overrides. Owner-only,
 * for the same reason `setOrganizationIndustry` is: an organization-wide
 * property, not a personal one.
 *
 * A blank or whitespace-only value for a key is dropped rather than stored
 * — the request schema allows an empty string (so a form can send "clear
 * this field" without a separate action per key), but nothing empty should
 * ever reach `resolveTerminologyLabel` as if it were a real override, since
 * an org that means "use the default" and one that means "call it ''"
 * are not actually different organizations.
 */
export async function setOrganizationTerminology(
  context: OrganizationContext,
  input: unknown,
): Promise<OrganizationProfile> {
  await requireOrganizationOwner(context);
  if (!context.actorId) {
    throw new ForbiddenError("An authenticated actor is required to set the organization's terminology.");
  }
  const actorId = context.actorId;
  const data = parseOrThrow(
    setOrganizationTerminologyRequestSchema,
    input,
    "Invalid terminology selection",
  );

  const cleaned: TerminologyLabelOverrides = {};
  for (const key of TERMINOLOGY_LABEL_KEYS) {
    const value = data.overrides[key];
    if (value && value.trim()) {
      cleaned[key] = value.trim();
    }
  }

  const setAt = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    const row = await organizationRepository.updateOrganizationTerminology(
      {
        organizationId: context.organizationId,
        overrides: cleaned,
        setById: actorId,
        setAt,
      },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      {
        organizationId: context.organizationId,
        actorId,
        action: ORGANIZATION_AUDIT_ACTIONS.terminologySet,
        entityType: ORGANIZATION_ENTITY_TYPE,
        entityId: context.organizationId,
        metadata: { overrides: cleaned },
      },
      tx,
    );

    return row;
  });

  return toProfile(updated);
}
