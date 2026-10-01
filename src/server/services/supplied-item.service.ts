import {
  type SuppliedItem,
  type SuppliedItemLinkSummary,
  createSuppliedItemRequestSchema,
  entityIdSchema,
  suppliedItemLinkRequestSchema,
  suppliedItemRelationLabel,
  suppliedItemStatusSchema,
  suppliedItemTypeSchema,
  suppliedItemUnlinkRequestSchema,
  updateSuppliedItemRequestSchema,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { NotFoundError, ValidationError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import type { AuditEventSummary } from "@/server/repositories/audit-log.repository";
import * as projectArtifactsRepository from "@/server/repositories/project-artifacts.repository";
import type { SuppliedItemLinkTargetOptions } from "@/server/repositories/project-artifacts.repository";
import * as qualificationRepository from "@/server/repositories/supplier-qualification.repository";
import type { QualificationWithParents } from "@/server/repositories/supplier-qualification.repository";
import * as suppliedItemRepository from "@/server/repositories/supplied-item.repository";
import type {
  SuppliedItemWithSupplier,
  SupplierSummary,
} from "@/server/repositories/supplied-item.repository";
import * as supplierRepository from "@/server/repositories/supplier.repository";
import { parseOrThrow } from "@/server/validation";
import {
  artifactAuditEvent,
  requireProjectReadAccess,
  requireProjectWriteAccess,
} from "./project-scope";
import { withRecordIdentifier } from "./record-identifier";

/**
 * Supplied item application service.
 *
 * The supplied item is where supplier records meet engineering: it is allocated
 * to design, supports requirements, is verified by activities, is governed by
 * decisions and carries risks. Those relationships are what make a supplier
 * change answerable by the existing change-impact engine, so getting their
 * validation right matters more than anything else in this file.
 *
 * **Every id a caller supplies is re-resolved inside the already-scoped
 * project.** The supplier on creation, and every link target, is checked to
 * exist in *this* project before anything is written. A caller cannot attach an
 * item to a supplier they cannot see, and cannot link an item to a design item
 * in another project — which would otherwise let a change declared here reach
 * objects in a project the declarer has no access to.
 */

export const SUPPLIED_ITEM_ENTITY_TYPE = "SuppliedItem";

export const SUPPLIED_ITEM_AUDIT_ACTIONS = {
  created: "supplied_item.created",
  updated: "supplied_item.updated",
  linked: "supplied_item.linked",
  unlinked: "supplied_item.unlinked",
} as const;

export interface SuppliedItemDetail extends SuppliedItem {
  supplier: SupplierSummary;
  links: SuppliedItemLinkSummary[];
  qualifications: QualificationWithParents[];
  history: AuditEventSummary[];
}

async function requireSuppliedItem(
  projectId: string,
  suppliedItemId: unknown,
  client?: Parameters<typeof suppliedItemRepository.findSuppliedItemInProject>[2],
): Promise<SuppliedItem> {
  const id = parseOrThrow(entityIdSchema, suppliedItemId, "Invalid supplied item id");
  const item = await suppliedItemRepository.findSuppliedItemInProject(projectId, id, client);

  if (!item) {
    throw new NotFoundError(`Supplied item ${id} was not found.`);
  }
  return item;
}

/**
 * The supplier must exist in the same project.
 *
 * A ValidationError rather than a NotFoundError: the caller named a project they
 * do have access to, and the supplier id is the part that is wrong.
 */
async function requireSupplierInProject(
  projectId: string,
  supplierId: string,
  client?: Parameters<typeof supplierRepository.findSupplierInProject>[2],
): Promise<void> {
  const supplier = await supplierRepository.findSupplierInProject(projectId, supplierId, client);
  if (!supplier) {
    throw new ValidationError("That supplier does not exist in this project.");
  }
}

export async function createSuppliedItem(
  context: OrganizationContext,
  projectId: unknown,
  input: unknown,
): Promise<SuppliedItem> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const data = parseOrThrow(createSuppliedItemRequestSchema, input, "Invalid supplied item");

  return withRecordIdentifier(data.identifier, "suppliedItem", scopedProjectId, (identifier) =>
    prisma.$transaction(async (tx) => {
      // Server-validated inside the transaction, so the supplier cannot be
      // removed between the check and the write.
      await requireSupplierInProject(scopedProjectId, data.supplierId, tx);

      const item = await suppliedItemRepository.createSuppliedItem(
        {
          projectId: scopedProjectId,
          supplierId: data.supplierId,
          identifier,
          name: data.name,
          description: data.description ?? null,
          itemType: data.itemType,
          status: data.status,
        },
        tx,
      );

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          SUPPLIED_ITEM_AUDIT_ACTIONS.created,
          SUPPLIED_ITEM_ENTITY_TYPE,
          item.id,
          {
            identifier: item.identifier,
            itemType: item.itemType,
            supplierId: item.supplierId,
            projectId: scopedProjectId,
          },
        ),
        tx,
      );

      return item;
    }),
  );
}

export async function listSuppliedItems(
  context: OrganizationContext,
  projectId: unknown,
  filter: { supplierId?: unknown; itemType?: unknown; status?: unknown } = {},
): Promise<SuppliedItemWithSupplier[]> {
  const scopedProjectId = await requireProjectReadAccess(context, projectId);

  const optional = <T>(value: unknown, parse: (v: unknown) => T): T | undefined =>
    value === undefined || value === null || value === "" ? undefined : parse(value);

  const supplierId = optional(filter.supplierId, (v) =>
    parseOrThrow(entityIdSchema, v, "Invalid supplier filter"),
  );
  const itemType = optional(filter.itemType, (v) =>
    parseOrThrow(suppliedItemTypeSchema, v, "Invalid item type filter"),
  );
  const status = optional(filter.status, (v) =>
    parseOrThrow(suppliedItemStatusSchema, v, "Invalid status filter"),
  );

  return suppliedItemRepository.listSuppliedItemsInProject(scopedProjectId, {
    ...(supplierId ? { supplierId } : {}),
    ...(itemType ? { itemType } : {}),
    ...(status ? { status } : {}),
  });
}

export async function getSuppliedItem(
  context: OrganizationContext,
  projectId: unknown,
  suppliedItemId: unknown,
): Promise<SuppliedItemDetail> {
  const scopedProjectId = await requireProjectReadAccess(context, projectId);
  const item = await requireSuppliedItem(scopedProjectId, suppliedItemId);

  const [supplier, links, qualifications, history] = await Promise.all([
    supplierRepository.findSupplierInProject(scopedProjectId, item.supplierId),
    suppliedItemRepository.listSuppliedItemLinks(item.id, scopedProjectId),
    qualificationRepository.listQualificationsInProject(scopedProjectId, {
      suppliedItemId: item.id,
    }),
    auditLogRepository.listAuditEventsForEntity({
      organizationId: context.organizationId,
      entityType: SUPPLIED_ITEM_ENTITY_TYPE,
      entityId: item.id,
    }),
  ]);

  if (!supplier) {
    // The foreign key is RESTRICT, so this cannot happen through the API.
    throw new NotFoundError(`Supplier for supplied item ${item.identifier} was not found.`);
  }

  return {
    ...item,
    supplier: {
      id: supplier.id,
      identifier: supplier.identifier,
      name: supplier.name,
      status: supplier.status,
    },
    links,
    qualifications,
    history,
  };
}

export async function updateSuppliedItem(
  context: OrganizationContext,
  projectId: unknown,
  suppliedItemId: unknown,
  input: unknown,
): Promise<SuppliedItem> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const data = parseOrThrow(updateSuppliedItemRequestSchema, input, "Invalid supplied item update");

  return prisma.$transaction(async (tx) => {
    const existing = await requireSuppliedItem(scopedProjectId, suppliedItemId, tx);
    const item = await suppliedItemRepository.updateSuppliedItem(existing.id, data, tx);

    await auditLogRepository.recordAuditEvent(
      artifactAuditEvent(
        context,
        SUPPLIED_ITEM_AUDIT_ACTIONS.updated,
        SUPPLIED_ITEM_ENTITY_TYPE,
        item.id,
        { changedFields: Object.keys(data), previousStatus: existing.status },
      ),
      tx,
    );

    return item;
  });
}

// --- Relationships ----------------------------------------------------------

/**
 * Everything in this project a supplied item may be linked to.
 *
 * Project-scoped, so the picker can only ever offer artifacts the caller already
 * has access to — the same boundary the link write enforces.
 */
export async function listSuppliedItemLinkTargets(
  context: OrganizationContext,
  projectId: unknown,
): Promise<SuppliedItemLinkTargetOptions> {
  const scopedProjectId = await requireProjectReadAccess(context, projectId);
  return projectArtifactsRepository.listSuppliedItemLinkTargets(scopedProjectId);
}

/**
 * Records that a supplied item participates in some part of the product.
 *
 * The target is validated against the *same project* before the row is written,
 * inside the transaction. This is the security boundary that keeps supplier
 * impact honest: without it, a caller could link an item to a design item in
 * another project and then reach that project's objects through a change-impact
 * analysis they are entitled to run.
 */
export async function linkSuppliedItem(
  context: OrganizationContext,
  projectId: unknown,
  suppliedItemId: unknown,
  input: unknown,
): Promise<SuppliedItemLinkSummary[]> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const request = parseOrThrow(suppliedItemLinkRequestSchema, input, "Invalid link request");

  await prisma.$transaction(async (tx) => {
    const item = await requireSuppliedItem(scopedProjectId, suppliedItemId, tx);

    const targetExists = await suppliedItemRepository.suppliedItemLinkTargetExists(
      request.relation,
      request.targetId,
      scopedProjectId,
      tx,
    );
    if (!targetExists) {
      throw new ValidationError(
        `That ${suppliedItemRelationLabel(request.relation).toLowerCase()} does not exist in this project.`,
      );
    }

    const relationshipId = await suppliedItemRepository.linkSuppliedItem(
      {
        suppliedItemId: item.id,
        relation: request.relation,
        targetId: request.targetId,
        note: request.note ?? null,
        createdById: context.actorId,
      },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      artifactAuditEvent(
        context,
        SUPPLIED_ITEM_AUDIT_ACTIONS.linked,
        SUPPLIED_ITEM_ENTITY_TYPE,
        item.id,
        { relation: request.relation, targetId: request.targetId, relationshipId },
      ),
      tx,
    );
  });

  return suppliedItemRepository.listSuppliedItemLinks(
    parseOrThrow(entityIdSchema, suppliedItemId, "Invalid supplied item id"),
    scopedProjectId,
  );
}

export async function unlinkSuppliedItem(
  context: OrganizationContext,
  projectId: unknown,
  suppliedItemId: unknown,
  input: unknown,
): Promise<SuppliedItemLinkSummary[]> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const request = parseOrThrow(suppliedItemUnlinkRequestSchema, input, "Invalid unlink request");

  await prisma.$transaction(async (tx) => {
    const item = await requireSuppliedItem(scopedProjectId, suppliedItemId, tx);

    const removed = await suppliedItemRepository.unlinkSuppliedItem(
      item.id,
      request.relation,
      request.targetId,
      tx,
    );
    if (!removed) {
      throw new NotFoundError("That relationship was not found on this supplied item.");
    }

    await auditLogRepository.recordAuditEvent(
      artifactAuditEvent(
        context,
        SUPPLIED_ITEM_AUDIT_ACTIONS.unlinked,
        SUPPLIED_ITEM_ENTITY_TYPE,
        item.id,
        { relation: request.relation, targetId: request.targetId },
      ),
      tx,
    );
  });

  return suppliedItemRepository.listSuppliedItemLinks(
    parseOrThrow(entityIdSchema, suppliedItemId, "Invalid supplied item id"),
    scopedProjectId,
  );
}
