import type {
  QualificationEvidenceSummary,
  SupplierQualification,
  SupplierQualificationStatus,
  SupplierQualificationType,
} from "@/domain";
import { type DbClient, prisma } from "@/lib/db";
import { rethrowAsConflict } from "./prisma-error";

/**
 * Supplier qualification data access.
 *
 * A qualification is its own record with its own state, deliberately not derived
 * from anything. Nothing in this repository reads a supplier's status to decide
 * a qualification's, or the reverse: a supplier can be ACTIVE while one of their
 * qualifications is EXPIRED, and both facts are preserved.
 *
 * `expiryDate` is stored and reported, never acted on. A date in the past does
 * not make the status EXPIRED — that is a judgement a person records.
 */

export interface CreateSupplierQualificationData {
  projectId: string;
  supplierId: string;
  suppliedItemId: string | null;
  title: string;
  qualificationType: SupplierQualificationType;
  status?: SupplierQualificationStatus | undefined;
  evidenceReference: string | null;
  effectiveDate: Date | null;
  expiryDate: Date | null;
}

export async function createSupplierQualification(
  data: CreateSupplierQualificationData,
  client: DbClient = prisma,
): Promise<SupplierQualification> {
  return client.supplierQualification.create({
    data: {
      projectId: data.projectId,
      supplierId: data.supplierId,
      suppliedItemId: data.suppliedItemId,
      title: data.title,
      qualificationType: data.qualificationType,
      evidenceReference: data.evidenceReference,
      effectiveDate: data.effectiveDate,
      expiryDate: data.expiryDate,
      ...(data.status ? { status: data.status } : {}),
    },
  });
}

export async function findQualificationInProject(
  projectId: string,
  qualificationId: string,
  client: DbClient = prisma,
): Promise<SupplierQualification | null> {
  return client.supplierQualification.findFirst({ where: { id: qualificationId, projectId } });
}

export interface QualificationWithParents extends SupplierQualification {
  supplier: { id: string; identifier: string; name: string };
  suppliedItem: { id: string; identifier: string; name: string } | null;
}

export async function listQualificationsInProject(
  projectId: string,
  options: {
    supplierId?: string;
    suppliedItemId?: string;
    status?: SupplierQualificationStatus;
  } = {},
  client: DbClient = prisma,
): Promise<QualificationWithParents[]> {
  return client.supplierQualification.findMany({
    where: {
      projectId,
      supplierId: options.supplierId,
      suppliedItemId: options.suppliedItemId,
      status: options.status,
    },
    orderBy: [{ title: "asc" }, { id: "asc" }],
    include: {
      supplier: { select: { id: true, identifier: true, name: true } },
      suppliedItem: { select: { id: true, identifier: true, name: true } },
    },
  });
}

export interface UpdateSupplierQualificationData {
  title?: string | undefined;
  qualificationType?: SupplierQualificationType | undefined;
  status?: SupplierQualificationStatus | undefined;
  evidenceReference?: string | null | undefined;
  effectiveDate?: Date | null | undefined;
  expiryDate?: Date | null | undefined;
}

/**
 * Updates a qualification.
 *
 * Neither parent is updatable: a qualification is *about* a particular supplier
 * and item, so moving it would change what the record asserts rather than
 * correct it.
 */
export async function updateSupplierQualification(
  id: string,
  data: UpdateSupplierQualificationData,
  client: DbClient = prisma,
): Promise<SupplierQualification> {
  return client.supplierQualification.update({ where: { id }, data });
}

// --- Evidence ---------------------------------------------------------------

/**
 * Attaches an existing Evidence record to a qualification.
 *
 * Reuses `evidence_links` in its own subject column rather than introducing a
 * second document store. The widened CHECK constraint guarantees exactly one
 * subject per row, so this can never collide with another subject's links.
 */
export async function linkQualificationEvidence(
  qualificationId: string,
  evidenceId: string,
  note: string | null,
  createdById: string | null,
  client: DbClient = prisma,
): Promise<string> {
  try {
    const row = await client.evidenceLink.create({
      data: { supplierQualificationId: qualificationId, evidenceId, note, createdById },
      select: { id: true },
    });
    return row.id;
  } catch (error) {
    rethrowAsConflict(error, "That evidence is already attached to this qualification.");
  }
}

export async function unlinkQualificationEvidence(
  qualificationId: string,
  evidenceId: string,
  client: DbClient = prisma,
): Promise<boolean> {
  const { count } = await client.evidenceLink.deleteMany({
    where: { supplierQualificationId: qualificationId, evidenceId },
  });
  return count > 0;
}

export async function listQualificationEvidence(
  qualificationId: string,
  projectId: string,
  client: DbClient = prisma,
): Promise<QualificationEvidenceSummary[]> {
  const rows = await client.evidenceLink.findMany({
    where: { supplierQualificationId: qualificationId, evidence: { projectId } },
    select: {
      note: true,
      createdAt: true,
      evidence: {
        select: { id: true, title: true, evidenceType: true, sourceReference: true },
      },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return rows.map((row) => ({
    evidenceId: row.evidence.id,
    title: row.evidence.title,
    evidenceType: row.evidence.evidenceType,
    sourceReference: row.evidence.sourceReference,
    note: row.note,
    createdAt: row.createdAt,
  }));
}

/** Whether an Evidence record exists inside this project. */
export async function evidenceExistsInProject(
  evidenceId: string,
  projectId: string,
  client: DbClient = prisma,
): Promise<boolean> {
  return (
    (await client.evidence.findFirst({
      where: { id: evidenceId, projectId },
      select: { id: true },
    })) !== null
  );
}
