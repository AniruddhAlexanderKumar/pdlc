import {
  type Supplier,
  createSupplierRequestSchema,
  entityIdSchema,
  supplierStatusSchema,
  updateSupplierRequestSchema,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { NotFoundError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import type { AuditEventSummary } from "@/server/repositories/audit-log.repository";
import * as qualificationRepository from "@/server/repositories/supplier-qualification.repository";
import type { QualificationWithParents } from "@/server/repositories/supplier-qualification.repository";
import * as suppliedItemRepository from "@/server/repositories/supplied-item.repository";
import type { SuppliedItemWithSupplier } from "@/server/repositories/supplied-item.repository";
import * as supplierRepository from "@/server/repositories/supplier.repository";
import type { SupplierWithCounts } from "@/server/repositories/supplier.repository";
import { parseOrThrow } from "@/server/validation";
import {
  artifactAuditEvent,
  requireProjectReadAccess,
  requireProjectWriteAccess,
} from "./project-scope";

/**
 * Supplier application service.
 *
 * **Engineering, not procurement.** This service creates, reads and updates the
 * record of an external organization the project's engineering depends on. There
 * is no ordering, no contract, no delivery and no vendor assessment, and adding
 * one would change what this capability is.
 *
 * Two rules matter more than the CRUD:
 *
 *  - **Tenancy and access first.** Every operation is scoped through
 *    `project-scope.ts`, so a supplier in another organization's project — or
 *    in this organization but a project the caller is not a member of — is
 *    not found rather than refused; the API does not confirm what it will
 *    not show. The organization comes from the session and is never
 *    accepted from a caller. Reads require project read access (any real
 *    project role, or the organization owner); create/update additionally
 *    require project write access (`requireProjectWriteAccess` — MANAGER or
 *    ENGINEER, or the organization owner).
 *  - **Status is not derived.** Nothing here reads a qualification to decide a
 *    supplier's status, or the reverse. A supplier can be ACTIVE while one of
 *    their qualifications is EXPIRED, and preserving both is the point: silently
 *    reconciling them would destroy the distinction between "we stopped using
 *    them" and "the qualification lapsed".
 */

export const SUPPLIER_ENTITY_TYPE = "Supplier";

export const SUPPLIER_AUDIT_ACTIONS = {
  created: "supplier.created",
  updated: "supplier.updated",
} as const;

export interface SupplierDetail extends Supplier {
  suppliedItems: SuppliedItemWithSupplier[];
  qualifications: QualificationWithParents[];
  history: AuditEventSummary[];
}

/**
 * Resolves a supplier inside an already-scoped project, or 404s.
 *
 * Deliberately not exported: it takes a `projectId` it trusts to have been
 * checked already, so an exported version would be a tenancy check waiting to be
 * called with an unvalidated id.
 */
async function requireSupplier(
  projectId: string,
  supplierId: unknown,
  client?: Parameters<typeof supplierRepository.findSupplierInProject>[2],
): Promise<Supplier> {
  const id = parseOrThrow(entityIdSchema, supplierId, "Invalid supplier id");
  const supplier = await supplierRepository.findSupplierInProject(projectId, id, client);

  if (!supplier) {
    throw new NotFoundError(`Supplier ${id} was not found.`);
  }
  return supplier;
}

export async function createSupplier(
  context: OrganizationContext,
  projectId: unknown,
  input: unknown,
): Promise<Supplier> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const data = parseOrThrow(createSupplierRequestSchema, input, "Invalid supplier");

  return prisma.$transaction(async (tx) => {
    const supplier = await supplierRepository.createSupplier(
      {
        projectId: scopedProjectId,
        identifier: data.identifier,
        name: data.name,
        description: data.description ?? null,
        status: data.status,
      },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      artifactAuditEvent(context, SUPPLIER_AUDIT_ACTIONS.created, SUPPLIER_ENTITY_TYPE, supplier.id, {
        identifier: supplier.identifier,
        projectId: scopedProjectId,
      }),
      tx,
    );

    return supplier;
  });
}

export async function listSuppliers(
  context: OrganizationContext,
  projectId: unknown,
  filter: { status?: unknown } = {},
): Promise<SupplierWithCounts[]> {
  const scopedProjectId = await requireProjectReadAccess(context, projectId);

  const status =
    filter.status === undefined || filter.status === null || filter.status === ""
      ? undefined
      : parseOrThrow(supplierStatusSchema, filter.status, "Invalid supplier status filter");

  return supplierRepository.listSuppliersInProject(scopedProjectId, status ? { status } : {});
}

export async function getSupplier(
  context: OrganizationContext,
  projectId: unknown,
  supplierId: unknown,
): Promise<SupplierDetail> {
  const scopedProjectId = await requireProjectReadAccess(context, projectId);
  const supplier = await requireSupplier(scopedProjectId, supplierId);

  const [suppliedItems, qualifications, history] = await Promise.all([
    suppliedItemRepository.listSuppliedItemsInProject(scopedProjectId, {
      supplierId: supplier.id,
    }),
    qualificationRepository.listQualificationsInProject(scopedProjectId, {
      supplierId: supplier.id,
    }),
    auditLogRepository.listAuditEventsForEntity({
      organizationId: context.organizationId,
      entityType: SUPPLIER_ENTITY_TYPE,
      entityId: supplier.id,
    }),
  ]);

  return { ...supplier, suppliedItems, qualifications, history };
}

export async function updateSupplier(
  context: OrganizationContext,
  projectId: unknown,
  supplierId: unknown,
  input: unknown,
): Promise<Supplier> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const data = parseOrThrow(updateSupplierRequestSchema, input, "Invalid supplier update");

  return prisma.$transaction(async (tx) => {
    const existing = await requireSupplier(scopedProjectId, supplierId, tx);
    const supplier = await supplierRepository.updateSupplier(existing.id, data, tx);

    await auditLogRepository.recordAuditEvent(
      artifactAuditEvent(context, SUPPLIER_AUDIT_ACTIONS.updated, SUPPLIER_ENTITY_TYPE, supplier.id, {
        changedFields: Object.keys(data),
        // Recorded because a supplier moving out of ACTIVE is an engineering
        // event someone may need to reconstruct later.
        previousStatus: existing.status,
      }),
      tx,
    );

    return supplier;
  });
}
