import {
  type QualificationEvidenceLinkRequest,
  type QualificationEvidenceSummary,
  type SupplierQualification,
  createSupplierQualificationRequestSchema,
  entityIdSchema,
  qualificationEvidenceLinkRequestSchema,
  qualificationEvidenceUnlinkRequestSchema,
  supplierQualificationStatusSchema,
  updateSupplierQualificationRequestSchema,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { NotFoundError, ValidationError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import type { AuditEventSummary } from "@/server/repositories/audit-log.repository";
import * as qualificationRepository from "@/server/repositories/supplier-qualification.repository";
import type { QualificationWithParents } from "@/server/repositories/supplier-qualification.repository";
import * as suppliedItemRepository from "@/server/repositories/supplied-item.repository";
import * as supplierRepository from "@/server/repositories/supplier.repository";
import { parseOrThrow } from "@/server/validation";
import { artifactAuditEvent, requireProjectInOrganization } from "./project-scope";

/**
 * Supplier qualification application service.
 *
 * A qualification records what establishes that a supplier, or something they
 * supply, is suitable for a defined engineering purpose. It is **not** a
 * certification-authority record: no standard is named, no authority is
 * modelled, and nothing here approves anything. Compliance semantics belong to a
 * capability that does not exist yet.
 *
 * Three disciplines this service holds:
 *
 *  - **Parent integrity.** Both parents are re-resolved inside the scoped
 *    project, and when an item is given it must belong to the named supplier.
 *    A qualification pointing at a supplier's record and another supplier's item
 *    would assert something false about both.
 *  - **Status is recorded, never derived.** Moving a qualification to EXPIRED or
 *    WITHDRAWN is a judgement a person makes. This service will not do it on
 *    their behalf — notably, an `expiryDate` in the past does not change the
 *    status. Change detected is not failure proven.
 *  - **No supplier is rewritten.** Nothing here touches the supplier's own
 *    status. Supplier ACTIVE with qualification EXPIRED is a state the system
 *    preserves rather than reconciles.
 */

export const QUALIFICATION_ENTITY_TYPE = "SupplierQualification";

export const QUALIFICATION_AUDIT_ACTIONS = {
  created: "supplier_qualification.created",
  updated: "supplier_qualification.updated",
  statusChanged: "supplier_qualification.status_changed",
  evidenceLinked: "supplier_qualification.evidence_linked",
  evidenceUnlinked: "supplier_qualification.evidence_unlinked",
} as const;

export interface QualificationDetail extends SupplierQualification {
  supplier: { id: string; identifier: string; name: string };
  suppliedItem: { id: string; identifier: string; name: string } | null;
  evidence: QualificationEvidenceSummary[];
  history: AuditEventSummary[];
}

async function requireQualification(
  projectId: string,
  qualificationId: unknown,
  client?: Parameters<typeof qualificationRepository.findQualificationInProject>[2],
): Promise<SupplierQualification> {
  const id = parseOrThrow(entityIdSchema, qualificationId, "Invalid qualification id");
  const qualification = await qualificationRepository.findQualificationInProject(
    projectId,
    id,
    client,
  );

  if (!qualification) {
    throw new NotFoundError(`Supplier qualification ${id} was not found.`);
  }
  return qualification;
}

/** An ISO date string becomes a Date here, never in a client. */
function toDate(value: string | null | undefined): Date | null {
  if (value === undefined || value === null) return null;
  return new Date(value);
}

export async function createSupplierQualification(
  context: OrganizationContext,
  projectId: unknown,
  input: unknown,
): Promise<SupplierQualification> {
  const scopedProjectId = await requireProjectInOrganization(context, projectId);
  const data = parseOrThrow(
    createSupplierQualificationRequestSchema,
    input,
    "Invalid supplier qualification",
  );

  return prisma.$transaction(async (tx) => {
    const supplier = await supplierRepository.findSupplierInProject(
      scopedProjectId,
      data.supplierId,
      tx,
    );
    if (!supplier) {
      throw new ValidationError("That supplier does not exist in this project.");
    }

    // A qualification may name an item, or qualify the source as a whole.
    let suppliedItemId: string | null = null;
    if (data.suppliedItemId) {
      const item = await suppliedItemRepository.findSuppliedItemInProject(
        scopedProjectId,
        data.suppliedItemId,
        tx,
      );
      if (!item) {
        throw new ValidationError("That supplied item does not exist in this project.");
      }
      // The mismatch check. Without it the record would assert that one
      // supplier's qualification covers another supplier's item.
      if (item.supplierId !== supplier.id) {
        throw new ValidationError(
          "That supplied item is not provided by the supplier this qualification names.",
        );
      }
      suppliedItemId = item.id;
    }

    const qualification = await qualificationRepository.createSupplierQualification(
      {
        projectId: scopedProjectId,
        supplierId: supplier.id,
        suppliedItemId,
        title: data.title,
        qualificationType: data.qualificationType,
        status: data.status,
        evidenceReference: data.evidenceReference ?? null,
        effectiveDate: toDate(data.effectiveDate),
        expiryDate: toDate(data.expiryDate),
      },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      artifactAuditEvent(
        context,
        QUALIFICATION_AUDIT_ACTIONS.created,
        QUALIFICATION_ENTITY_TYPE,
        qualification.id,
        {
          supplierId: supplier.id,
          suppliedItemId,
          qualificationType: qualification.qualificationType,
          status: qualification.status,
          projectId: scopedProjectId,
        },
      ),
      tx,
    );

    return qualification;
  });
}

export async function listSupplierQualifications(
  context: OrganizationContext,
  projectId: unknown,
  filter: { supplierId?: unknown; suppliedItemId?: unknown; status?: unknown } = {},
): Promise<QualificationWithParents[]> {
  const scopedProjectId = await requireProjectInOrganization(context, projectId);

  const optional = <T>(value: unknown, parse: (v: unknown) => T): T | undefined =>
    value === undefined || value === null || value === "" ? undefined : parse(value);

  const supplierId = optional(filter.supplierId, (v) =>
    parseOrThrow(entityIdSchema, v, "Invalid supplier filter"),
  );
  const suppliedItemId = optional(filter.suppliedItemId, (v) =>
    parseOrThrow(entityIdSchema, v, "Invalid supplied item filter"),
  );
  const status = optional(filter.status, (v) =>
    parseOrThrow(supplierQualificationStatusSchema, v, "Invalid qualification status filter"),
  );

  return qualificationRepository.listQualificationsInProject(scopedProjectId, {
    ...(supplierId ? { supplierId } : {}),
    ...(suppliedItemId ? { suppliedItemId } : {}),
    ...(status ? { status } : {}),
  });
}

export async function getSupplierQualification(
  context: OrganizationContext,
  projectId: unknown,
  qualificationId: unknown,
): Promise<QualificationDetail> {
  const scopedProjectId = await requireProjectInOrganization(context, projectId);
  const qualification = await requireQualification(scopedProjectId, qualificationId);

  const [supplier, item, evidence, history] = await Promise.all([
    supplierRepository.findSupplierInProject(scopedProjectId, qualification.supplierId),
    qualification.suppliedItemId
      ? suppliedItemRepository.findSuppliedItemInProject(
          scopedProjectId,
          qualification.suppliedItemId,
        )
      : null,
    qualificationRepository.listQualificationEvidence(qualification.id, scopedProjectId),
    auditLogRepository.listAuditEventsForEntity({
      organizationId: context.organizationId,
      entityType: QUALIFICATION_ENTITY_TYPE,
      entityId: qualification.id,
    }),
  ]);

  if (!supplier) {
    throw new NotFoundError(`Supplier for qualification ${qualification.id} was not found.`);
  }

  return {
    ...qualification,
    supplier: { id: supplier.id, identifier: supplier.identifier, name: supplier.name },
    suppliedItem: item
      ? { id: item.id, identifier: item.identifier, name: item.name }
      : null,
    evidence,
    history,
  };
}

/**
 * Updates a qualification, including its status.
 *
 * A status change is audited as its own action, carrying both the previous and
 * new value: a qualification moving to WITHDRAWN is an engineering event, and
 * losing which state it came from would make the record much harder to read
 * later.
 */
export async function updateSupplierQualification(
  context: OrganizationContext,
  projectId: unknown,
  qualificationId: unknown,
  input: unknown,
): Promise<SupplierQualification> {
  const scopedProjectId = await requireProjectInOrganization(context, projectId);
  const data = parseOrThrow(
    updateSupplierQualificationRequestSchema,
    input,
    "Invalid qualification update",
  );

  return prisma.$transaction(async (tx) => {
    const existing = await requireQualification(scopedProjectId, qualificationId, tx);

    const qualification = await qualificationRepository.updateSupplierQualification(
      existing.id,
      {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.qualificationType !== undefined
          ? { qualificationType: data.qualificationType }
          : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.evidenceReference !== undefined
          ? { evidenceReference: data.evidenceReference ?? null }
          : {}),
        ...(data.effectiveDate !== undefined
          ? { effectiveDate: toDate(data.effectiveDate) }
          : {}),
        ...(data.expiryDate !== undefined ? { expiryDate: toDate(data.expiryDate) } : {}),
      },
      tx,
    );

    const statusChanged = data.status !== undefined && data.status !== existing.status;

    await auditLogRepository.recordAuditEvent(
      artifactAuditEvent(
        context,
        statusChanged
          ? QUALIFICATION_AUDIT_ACTIONS.statusChanged
          : QUALIFICATION_AUDIT_ACTIONS.updated,
        QUALIFICATION_ENTITY_TYPE,
        qualification.id,
        {
          changedFields: Object.keys(data),
          ...(statusChanged
            ? { previousStatus: existing.status, status: qualification.status }
            : {}),
        },
      ),
      tx,
    );

    return qualification;
  });
}

// --- Evidence ---------------------------------------------------------------

export async function linkQualificationEvidence(
  context: OrganizationContext,
  projectId: unknown,
  qualificationId: unknown,
  input: unknown,
): Promise<QualificationEvidenceSummary[]> {
  const scopedProjectId = await requireProjectInOrganization(context, projectId);
  const request: QualificationEvidenceLinkRequest = parseOrThrow(
    qualificationEvidenceLinkRequestSchema,
    input,
    "Invalid evidence link",
  );

  const qualification = await prisma.$transaction(async (tx) => {
    const existing = await requireQualification(scopedProjectId, qualificationId, tx);

    const evidenceExists = await qualificationRepository.evidenceExistsInProject(
      request.evidenceId,
      scopedProjectId,
      tx,
    );
    if (!evidenceExists) {
      throw new ValidationError("That evidence does not exist in this project.");
    }

    const relationshipId = await qualificationRepository.linkQualificationEvidence(
      existing.id,
      request.evidenceId,
      request.note ?? null,
      context.actorId,
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      artifactAuditEvent(
        context,
        QUALIFICATION_AUDIT_ACTIONS.evidenceLinked,
        QUALIFICATION_ENTITY_TYPE,
        existing.id,
        { evidenceId: request.evidenceId, relationshipId },
      ),
      tx,
    );

    return existing;
  });

  return qualificationRepository.listQualificationEvidence(qualification.id, scopedProjectId);
}

export async function unlinkQualificationEvidence(
  context: OrganizationContext,
  projectId: unknown,
  qualificationId: unknown,
  input: unknown,
): Promise<QualificationEvidenceSummary[]> {
  const scopedProjectId = await requireProjectInOrganization(context, projectId);
  const request = parseOrThrow(
    qualificationEvidenceUnlinkRequestSchema,
    input,
    "Invalid evidence unlink",
  );

  const qualification = await prisma.$transaction(async (tx) => {
    const existing = await requireQualification(scopedProjectId, qualificationId, tx);

    const removed = await qualificationRepository.unlinkQualificationEvidence(
      existing.id,
      request.evidenceId,
      tx,
    );
    if (!removed) {
      throw new NotFoundError("That evidence is not attached to this qualification.");
    }

    await auditLogRepository.recordAuditEvent(
      artifactAuditEvent(
        context,
        QUALIFICATION_AUDIT_ACTIONS.evidenceUnlinked,
        QUALIFICATION_ENTITY_TYPE,
        existing.id,
        { evidenceId: request.evidenceId },
      ),
      tx,
    );

    return existing;
  });

  return qualificationRepository.listQualificationEvidence(qualification.id, scopedProjectId);
}
