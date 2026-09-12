import {
  type CreateEvidenceInput,
  type Evidence,
  type EvidenceCitingFinding,
  type EvidenceFilter,
  type EvidenceLinkSummary,
  type EvidenceRelation,
  type EvidenceStatus,
  type UpdateEvidenceInput,
  createEvidenceInputSchema,
  evidenceFilterSchema,
  evidenceLinkKey,
  updateEvidenceInputSchema,
} from "@/domain";
import { type DbClient, prisma } from "@/lib/db";
import { parseOrThrow } from "@/server/validation";
import { toEvidence } from "./mappers";
import { rethrowAsConflict } from "./prisma-error";

/** Evidence data access, including the trace edges that hang off a piece of evidence. */

export interface EvidenceActorSummary {
  id: string;
  name: string;
  email: string;
}

export async function createEvidence(
  input: CreateEvidenceInput,
  client: DbClient = prisma,
): Promise<Evidence> {
  const data = parseOrThrow(createEvidenceInputSchema, input, "Invalid evidence");

  try {
    const row = await client.evidence.create({
      data: {
        projectId: data.projectId,
        identifier: data.identifier,
        title: data.title,
        description: data.description ?? null,
        evidenceType: data.evidenceType,
        sourceReference: data.sourceReference,
        recordedById: data.recordedById ?? null,
      },
    });
    return toEvidence(row);
  } catch (error) {
    rethrowAsConflict(error, `Evidence ${data.identifier} already exists in this project.`);
  }
}

export async function findEvidenceInProject(
  projectId: string,
  evidenceId: string,
  client: DbClient = prisma,
): Promise<Evidence | null> {
  const row = await client.evidence.findFirst({ where: { id: evidenceId, projectId } });
  return row ? toEvidence(row) : null;
}

export async function listEvidence(
  filter: EvidenceFilter,
  client: DbClient = prisma,
): Promise<Evidence[]> {
  const where = parseOrThrow(evidenceFilterSchema, filter, "Invalid evidence filter");

  const rows = await client.evidence.findMany({
    where: { projectId: where.projectId, status: where.status, evidenceType: where.evidenceType },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
  });
  return rows.map(toEvidence);
}

export interface EvidenceListItem extends Evidence {
  recordedBy: EvidenceActorSummary | null;
}

/** Evidence in a project, ordered by identifier then id. */
export async function listEvidenceInProject(
  projectId: string,
  options: { status?: EvidenceStatus; evidenceType?: Evidence["evidenceType"] } = {},
  client: DbClient = prisma,
): Promise<EvidenceListItem[]> {
  const rows = await client.evidence.findMany({
    where: { projectId, status: options.status, evidenceType: options.evidenceType },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
    include: { recordedBy: { select: { id: true, name: true, email: true } } },
  });
  return rows.map((row) => ({ ...toEvidence(row), recordedBy: row.recordedBy }));
}

export interface EvidenceWithActors extends Evidence {
  recordedBy: EvidenceActorSummary | null;
  validatedBy: EvidenceActorSummary | null;
  /** The evidence this one superseded, once it has — identifier/title only. */
  supersededByRef: { id: string; identifier: string; title: string } | null;
}

/** One evidence record with its recorder, validator and successor resolved. Never selects credential fields. */
export async function findEvidenceDetail(
  projectId: string,
  evidenceId: string,
  client: DbClient = prisma,
): Promise<EvidenceWithActors | null> {
  const row = await client.evidence.findFirst({
    where: { id: evidenceId, projectId },
    include: {
      recordedBy: { select: { id: true, name: true, email: true } },
      validatedBy: { select: { id: true, name: true, email: true } },
      supersededBy: { select: { id: true, identifier: true, title: true } },
    },
  });
  if (!row) return null;
  return {
    ...toEvidence(row),
    recordedBy: row.recordedBy,
    validatedBy: row.validatedBy,
    supersededByRef: row.supersededBy,
  };
}

export async function updateEvidence(
  id: string,
  input: UpdateEvidenceInput,
  client: DbClient = prisma,
): Promise<Evidence> {
  const data = parseOrThrow(updateEvidenceInputSchema, input, "Invalid evidence update");

  const row = await client.evidence.update({
    where: { id },
    data: {
      title: data.title,
      description: data.description,
      evidenceType: data.evidenceType,
      sourceReference: data.sourceReference,
    },
  });
  return toEvidence(row);
}

/** DRAFT -> VALIDATED. */
export async function validateEvidence(
  id: string,
  validatedById: string,
  client: DbClient = prisma,
): Promise<Evidence> {
  const row = await client.evidence.update({
    where: { id },
    data: { status: "VALIDATED", validatedById, validatedAt: new Date() },
  });
  return toEvidence(row);
}

/**
 * DRAFT|VALIDATED -> SUPERSEDED.
 *
 * Records the successor and nothing else — no `EvidenceLink` row is touched,
 * so every historical relationship keeps pointing at this exact record. A
 * caller who wants the new evidence linked where this one was must add that
 * link explicitly, through the normal link path.
 */
export async function supersedeEvidence(
  id: string,
  newEvidenceId: string,
  client: DbClient = prisma,
): Promise<Evidence> {
  const row = await client.evidence.update({
    where: { id },
    data: { status: "SUPERSEDED", supersededById: newEvidenceId, supersededAt: new Date() },
  });
  return toEvidence(row);
}

// --- Traceability -------------------------------------------------------------

/**
 * Confirms a link target exists *and* sits in the same project.
 *
 * Compliance items have no `projectId` column of their own — scoped through
 * their basis and programme, exactly as the certification module's own
 * lookups already do. Every other relation is checked directly.
 */
export async function evidenceLinkTargetExistsInProject(
  relation: EvidenceRelation,
  targetId: string,
  projectId: string,
  client: DbClient = prisma,
): Promise<boolean> {
  switch (relation) {
    case "REQUIREMENT":
      return (
        (await client.requirement.findFirst({
          where: { id: targetId, projectId },
          select: { id: true },
        })) !== null
      );
    case "ENGINEERING_DECISION":
      return (
        (await client.engineeringDecision.findFirst({
          where: { id: targetId, projectId },
          select: { id: true },
        })) !== null
      );
    case "VERIFICATION_ACTIVITY":
      return (
        (await client.verificationActivity.findFirst({
          where: { id: targetId, projectId },
          select: { id: true },
        })) !== null
      );
    case "SUPPLIED_ITEM":
      return (
        (await client.suppliedItem.findFirst({
          where: { id: targetId, projectId },
          select: { id: true },
        })) !== null
      );
    case "SUPPLIER_QUALIFICATION":
      return (
        (await client.supplierQualification.findFirst({
          where: { id: targetId, projectId },
          select: { id: true },
        })) !== null
      );
    case "COMPLIANCE_ITEM":
      return (
        (await client.complianceItem.findFirst({
          where: { id: targetId, certificationBasis: { certificationProgram: { projectId } } },
          select: { id: true },
        })) !== null
      );
  }
}

export interface CreateEvidenceLinkInput {
  evidenceId: string;
  relation: EvidenceRelation;
  targetId: string;
  note?: string | null | undefined;
  createdById: string | null;
}

export interface CreatedLinkRow {
  rowId: string;
}

/** Writes one trace edge into the shared `EvidenceLink` table, returning the new row's id. */
export async function createEvidenceLink(
  input: CreateEvidenceLinkInput,
  client: DbClient = prisma,
): Promise<CreatedLinkRow> {
  const { evidenceId, targetId, note, createdById } = input;

  switch (input.relation) {
    case "REQUIREMENT": {
      const row = await client.evidenceLink.create({
        data: { evidenceId, requirementId: targetId, note: note ?? null, createdById },
        select: { id: true },
      });
      return { rowId: row.id };
    }
    case "ENGINEERING_DECISION": {
      const row = await client.evidenceLink.create({
        data: { evidenceId, engineeringDecisionId: targetId, note: note ?? null, createdById },
        select: { id: true },
      });
      return { rowId: row.id };
    }
    case "VERIFICATION_ACTIVITY": {
      const row = await client.evidenceLink.create({
        data: { evidenceId, verificationActivityId: targetId, note: note ?? null, createdById },
        select: { id: true },
      });
      return { rowId: row.id };
    }
    case "SUPPLIED_ITEM": {
      const row = await client.evidenceLink.create({
        data: { evidenceId, suppliedItemId: targetId, note: note ?? null, createdById },
        select: { id: true },
      });
      return { rowId: row.id };
    }
    case "SUPPLIER_QUALIFICATION": {
      const row = await client.evidenceLink.create({
        data: { evidenceId, supplierQualificationId: targetId, note: note ?? null, createdById },
        select: { id: true },
      });
      return { rowId: row.id };
    }
    case "COMPLIANCE_ITEM": {
      const row = await client.evidenceLink.create({
        data: { evidenceId, complianceItemId: targetId, note: note ?? null, createdById },
        select: { id: true },
      });
      return { rowId: row.id };
    }
  }
}

/** Whether this exact edge already exists — the service turns a hit into a client error. */
export async function evidenceLinkExists(
  evidenceId: string,
  relation: EvidenceRelation,
  targetId: string,
  client: DbClient = prisma,
): Promise<boolean> {
  switch (relation) {
    case "REQUIREMENT":
      return (
        (await client.evidenceLink.findUnique({
          where: { evidenceId_requirementId: { evidenceId, requirementId: targetId } },
          select: { id: true },
        })) !== null
      );
    case "ENGINEERING_DECISION":
      return (
        (await client.evidenceLink.findUnique({
          where: { evidenceId_engineeringDecisionId: { evidenceId, engineeringDecisionId: targetId } },
          select: { id: true },
        })) !== null
      );
    case "VERIFICATION_ACTIVITY":
      return (
        (await client.evidenceLink.findUnique({
          where: {
            evidenceId_verificationActivityId: { evidenceId, verificationActivityId: targetId },
          },
          select: { id: true },
        })) !== null
      );
    case "SUPPLIED_ITEM":
      return (
        (await client.evidenceLink.findUnique({
          where: { evidenceId_suppliedItemId: { evidenceId, suppliedItemId: targetId } },
          select: { id: true },
        })) !== null
      );
    case "SUPPLIER_QUALIFICATION":
      return (
        (await client.evidenceLink.findUnique({
          where: {
            evidenceId_supplierQualificationId: { evidenceId, supplierQualificationId: targetId },
          },
          select: { id: true },
        })) !== null
      );
    case "COMPLIANCE_ITEM":
      return (
        (await client.evidenceLink.findUnique({
          where: { evidenceId_complianceItemId: { evidenceId, complianceItemId: targetId } },
          select: { id: true },
        })) !== null
      );
  }
}

/** Removes a trace edge by its row id. Returns how many rows went, so the caller can 404 on none. */
export async function deleteEvidenceLink(
  evidenceId: string,
  rowId: string,
  client: DbClient = prisma,
): Promise<number> {
  const { count } = await client.evidenceLink.deleteMany({ where: { id: rowId, evidenceId } });
  return count;
}

/**
 * Every edge on this evidence, with enough of each target to display it.
 *
 * Six queries rather than one union: every relation lives in the same table
 * but a different nullable column, and each target type names its heading
 * differently (`title` for most, `name` for supplied items).
 */
export async function listEvidenceLinks(
  evidenceId: string,
  client: DbClient = prisma,
): Promise<EvidenceLinkSummary[]> {
  const [requirements, decisions, verifications, suppliedItems, qualifications, complianceItems] =
    await Promise.all([
      client.evidenceLink.findMany({
        where: { evidenceId, requirementId: { not: null } },
        select: {
          id: true,
          note: true,
          createdAt: true,
          requirement: { select: { id: true, identifier: true, title: true } },
        },
      }),
      client.evidenceLink.findMany({
        where: { evidenceId, engineeringDecisionId: { not: null } },
        select: {
          id: true,
          note: true,
          createdAt: true,
          engineeringDecision: { select: { id: true, identifier: true, title: true } },
        },
      }),
      client.evidenceLink.findMany({
        where: { evidenceId, verificationActivityId: { not: null } },
        select: {
          id: true,
          note: true,
          createdAt: true,
          verificationActivity: { select: { id: true, identifier: true, title: true } },
        },
      }),
      client.evidenceLink.findMany({
        where: { evidenceId, suppliedItemId: { not: null } },
        select: {
          id: true,
          note: true,
          createdAt: true,
          suppliedItem: { select: { id: true, identifier: true, name: true } },
        },
      }),
      client.evidenceLink.findMany({
        where: { evidenceId, supplierQualificationId: { not: null } },
        select: {
          id: true,
          note: true,
          createdAt: true,
          supplierQualification: {
            select: { id: true, title: true, supplier: { select: { identifier: true } } },
          },
        },
      }),
      client.evidenceLink.findMany({
        where: { evidenceId, complianceItemId: { not: null } },
        select: {
          id: true,
          note: true,
          createdAt: true,
          complianceItem: { select: { id: true, identifier: true, title: true } },
        },
      }),
    ]);

  return [
    ...requirements.map((row) => ({
      id: evidenceLinkKey("REQUIREMENT", row.id),
      relation: "REQUIREMENT" as const,
      targetId: row.requirement!.id,
      identifier: row.requirement!.identifier,
      title: row.requirement!.title,
      note: row.note,
      createdAt: row.createdAt,
    })),
    ...decisions.map((row) => ({
      id: evidenceLinkKey("ENGINEERING_DECISION", row.id),
      relation: "ENGINEERING_DECISION" as const,
      targetId: row.engineeringDecision!.id,
      identifier: row.engineeringDecision!.identifier,
      title: row.engineeringDecision!.title,
      note: row.note,
      createdAt: row.createdAt,
    })),
    ...verifications.map((row) => ({
      id: evidenceLinkKey("VERIFICATION_ACTIVITY", row.id),
      relation: "VERIFICATION_ACTIVITY" as const,
      targetId: row.verificationActivity!.id,
      identifier: row.verificationActivity!.identifier,
      title: row.verificationActivity!.title,
      note: row.note,
      createdAt: row.createdAt,
    })),
    ...suppliedItems.map((row) => ({
      id: evidenceLinkKey("SUPPLIED_ITEM", row.id),
      relation: "SUPPLIED_ITEM" as const,
      targetId: row.suppliedItem!.id,
      identifier: row.suppliedItem!.identifier,
      title: row.suppliedItem!.name,
      note: row.note,
      createdAt: row.createdAt,
    })),
    ...qualifications.map((row) => ({
      id: evidenceLinkKey("SUPPLIER_QUALIFICATION", row.id),
      relation: "SUPPLIER_QUALIFICATION" as const,
      targetId: row.supplierQualification!.id,
      // A qualification carries no identifier of its own; its supplier's is
      // the one an engineer would recognize it by.
      identifier: row.supplierQualification!.supplier.identifier,
      title: row.supplierQualification!.title,
      note: row.note,
      createdAt: row.createdAt,
    })),
    ...complianceItems.map((row) => ({
      id: evidenceLinkKey("COMPLIANCE_ITEM", row.id),
      relation: "COMPLIANCE_ITEM" as const,
      targetId: row.complianceItem!.id,
      identifier: row.complianceItem!.identifier,
      title: row.complianceItem!.title,
      note: row.note,
      createdAt: row.createdAt,
    })),
  ];
}

/**
 * Certification findings that name this evidence as their supporting record.
 *
 * Read-only, and deliberately so: this relationship is a plain foreign key
 * set only by `CertificationFindingService.resolveFinding`/`acceptFinding`,
 * not by this evidence's own link/unlink path — editing it here would bypass
 * the certification workflow that owns it.
 */
export async function listFindingsCitingEvidence(
  evidenceId: string,
  client: DbClient = prisma,
): Promise<EvidenceCitingFinding[]> {
  const rows = await client.certificationFinding.findMany({
    where: { evidenceId },
    select: { id: true, identifier: true, title: true, complianceItemId: true },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
  });
  return rows;
}
