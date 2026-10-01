import {
  type DesignItem,
  assignDesignItemOwnerRequestSchema,
  createDesignItemRequestSchema,
  designItemTypeSchema,
  entityIdSchema,
  updateDesignItemRequestSchema,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { NotFoundError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import type { AuditEventSummary } from "@/server/repositories/audit-log.repository";
import * as designItemRepository from "@/server/repositories/design-item.repository";
import type {
  DesignItemWithOwner,
  LinkedDecisionSummary,
  OwnerSummary,
} from "@/server/repositories/design-item.repository";
import type { LinkedRequirementSummary } from "@/server/repositories/stakeholder-need.repository";
import { parseOrThrow } from "@/server/validation";
import { requireAssignableOwner } from "./authorization.service";
import {
  artifactAuditEvent,
  requireProjectInOrganization,
  requireProjectWriteAccess,
} from "./project-scope";
import { withRecordIdentifier } from "./record-identifier";

/**
 * Design item application service.
 *
 * A design item is a node in the product structure that requirements are
 * allocated to. There is no lifecycle gate here — a design item's status is
 * descriptive rather than governed — but ownership, tenancy and audit work
 * exactly as they do for requirements.
 */

export const DESIGN_ITEM_ENTITY_TYPE = "DesignItem";

export const DESIGN_ITEM_AUDIT_ACTIONS = {
  created: "design_item.created",
  updated: "design_item.updated",
  ownerAssigned: "design_item.owner_assigned",
  ownerCleared: "design_item.owner_cleared",
} as const;

export interface DesignItemDetail extends DesignItem {
  owner: OwnerSummary | null;
  requirements: Array<LinkedRequirementSummary & { linkType: string }>;
  /** Decisions already recorded against this item. Read-only; no decisions module yet. */
  decisions: LinkedDecisionSummary[];
  history: AuditEventSummary[];
}

async function requireDesignItem(
  projectId: string,
  designItemId: unknown,
  client?: Parameters<typeof designItemRepository.findDesignItemInProject>[2],
): Promise<DesignItem> {
  const id = parseOrThrow(entityIdSchema, designItemId, "Invalid design item id");
  const item = await designItemRepository.findDesignItemInProject(projectId, id, client);

  if (!item) {
    throw new NotFoundError(`Design item ${id} was not found.`);
  }
  return item;
}

export async function createDesignItem(
  context: OrganizationContext,
  projectId: unknown,
  input: unknown,
): Promise<DesignItem> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const data = parseOrThrow(createDesignItemRequestSchema, input, "Invalid design item");

  if (data.ownerId) {
    await requireAssignableOwner(context, scopedProjectId, data.ownerId);
  }

  return withRecordIdentifier(data.identifier, "designItem", scopedProjectId, (identifier) =>
    prisma.$transaction(async (tx) => {
      const item = await designItemRepository.createDesignItem(
        {
          projectId: scopedProjectId,
          identifier,
          name: data.name,
          description: data.description ?? null,
          itemType: data.itemType,
          status: data.status,
          ownerId: data.ownerId ?? null,
        },
        tx,
      );

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          DESIGN_ITEM_AUDIT_ACTIONS.created,
          DESIGN_ITEM_ENTITY_TYPE,
          item.id,
          { identifier: item.identifier, itemType: item.itemType, projectId: scopedProjectId },
        ),
        tx,
      );

      return item;
    }),
  );
}

export async function listDesignItems(
  context: OrganizationContext,
  projectId: unknown,
  filter: { itemType?: unknown } = {},
): Promise<DesignItemWithOwner[]> {
  const scopedProjectId = await requireProjectInOrganization(context, projectId);

  const itemType =
    filter.itemType === undefined || filter.itemType === null || filter.itemType === ""
      ? undefined
      : parseOrThrow(designItemTypeSchema, filter.itemType, "Invalid item type filter");

  return designItemRepository.listDesignItemsInProject(
    scopedProjectId,
    itemType ? { itemType } : {},
  );
}

export async function getDesignItem(
  context: OrganizationContext,
  projectId: unknown,
  designItemId: unknown,
): Promise<DesignItemDetail> {
  const scopedProjectId = await requireProjectInOrganization(context, projectId);
  const item = await requireDesignItem(scopedProjectId, designItemId);

  const [owner, requirements, decisions, history] = await Promise.all([
    item.ownerId ? designItemRepository.findDesignItemOwner(item.ownerId) : null,
    designItemRepository.listRequirementsForDesignItem(item.id),
    designItemRepository.listDecisionsForDesignItem(item.id),
    auditLogRepository.listAuditEventsForEntity({
      organizationId: context.organizationId,
      entityType: DESIGN_ITEM_ENTITY_TYPE,
      entityId: item.id,
    }),
  ]);

  return { ...item, owner, requirements, decisions, history };
}

export async function updateDesignItem(
  context: OrganizationContext,
  projectId: unknown,
  designItemId: unknown,
  input: unknown,
): Promise<DesignItem> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const data = parseOrThrow(updateDesignItemRequestSchema, input, "Invalid design item update");

  return prisma.$transaction(async (tx) => {
    const existing = await requireDesignItem(scopedProjectId, designItemId, tx);

    const item = await designItemRepository.updateDesignItem(existing.id, data, tx);

    await auditLogRepository.recordAuditEvent(
      artifactAuditEvent(
        context,
        DESIGN_ITEM_AUDIT_ACTIONS.updated,
        DESIGN_ITEM_ENTITY_TYPE,
        item.id,
        { changedFields: Object.keys(data) },
      ),
      tx,
    );

    return item;
  });
}

/** Assigns an owner, or clears one when `ownerId` is null. */
export async function assignDesignItemOwner(
  context: OrganizationContext,
  projectId: unknown,
  designItemId: unknown,
  input: unknown,
): Promise<DesignItem> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const { ownerId } = parseOrThrow(
    assignDesignItemOwnerRequestSchema,
    input,
    "Invalid owner assignment",
  );

  if (ownerId) {
    await requireAssignableOwner(context, scopedProjectId, ownerId);
  }

  return prisma.$transaction(async (tx) => {
    const existing = await requireDesignItem(scopedProjectId, designItemId, tx);
    const item = await designItemRepository.updateDesignItem(existing.id, { ownerId }, tx);

    await auditLogRepository.recordAuditEvent(
      artifactAuditEvent(
        context,
        ownerId
          ? DESIGN_ITEM_AUDIT_ACTIONS.ownerAssigned
          : DESIGN_ITEM_AUDIT_ACTIONS.ownerCleared,
        DESIGN_ITEM_ENTITY_TYPE,
        item.id,
        { previousOwnerId: existing.ownerId, ownerId },
      ),
      tx,
    );

    return item;
  });
}
