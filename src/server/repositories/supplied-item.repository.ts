import type {
  SuppliedItem,
  SuppliedItemLinkSummary,
  SuppliedItemRelation,
  SuppliedItemStatus,
  SuppliedItemType,
} from "@/domain";
import { type DbClient, prisma } from "@/lib/db";
import { rethrowAsConflict } from "./prisma-error";

/**
 * Supplied item data access, including its engineering relationships.
 *
 * The relationship helpers write and read five typed join tables plus the
 * shared evidence table. Each is named explicitly — there is no dynamic table
 * dispatch and no `entityType + entityId` pair anywhere, so a relation the
 * domain does not declare cannot reach the database.
 *
 * Every read and write is constrained to the project on *both* ends. A caller
 * who has proved access to one project therefore cannot create, see or remove a
 * link whose other end lives somewhere else.
 */

export interface CreateSuppliedItemData {
  projectId: string;
  supplierId: string;
  identifier: string;
  name: string;
  description: string | null;
  itemType: SuppliedItemType;
  status?: SuppliedItemStatus | undefined;
}

export async function createSuppliedItem(
  data: CreateSuppliedItemData,
  client: DbClient = prisma,
): Promise<SuppliedItem> {
  try {
    return await client.suppliedItem.create({
      data: {
        projectId: data.projectId,
        supplierId: data.supplierId,
        identifier: data.identifier,
        name: data.name,
        description: data.description,
        itemType: data.itemType,
        ...(data.status ? { status: data.status } : {}),
      },
    });
  } catch (error) {
    rethrowAsConflict(error, `Supplied item ${data.identifier} already exists in this project.`);
  }
}

export async function findSuppliedItemInProject(
  projectId: string,
  suppliedItemId: string,
  client: DbClient = prisma,
): Promise<SuppliedItem | null> {
  return client.suppliedItem.findFirst({ where: { id: suppliedItemId, projectId } });
}

export interface SupplierSummary {
  id: string;
  identifier: string;
  name: string;
  status: string;
}

export interface SuppliedItemWithSupplier extends SuppliedItem {
  supplier: SupplierSummary;
}

export async function listSuppliedItemsInProject(
  projectId: string,
  options: {
    supplierId?: string;
    itemType?: SuppliedItemType;
    status?: SuppliedItemStatus;
  } = {},
  client: DbClient = prisma,
): Promise<SuppliedItemWithSupplier[]> {
  const rows = await client.suppliedItem.findMany({
    where: {
      projectId,
      supplierId: options.supplierId,
      itemType: options.itemType,
      status: options.status,
    },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
    include: {
      supplier: { select: { id: true, identifier: true, name: true, status: true } },
    },
  });
  return rows;
}

export interface UpdateSuppliedItemData {
  name?: string | undefined;
  description?: string | null | undefined;
  itemType?: SuppliedItemType | undefined;
  status?: SuppliedItemStatus | undefined;
}

export async function updateSuppliedItem(
  id: string,
  data: UpdateSuppliedItemData,
  client: DbClient = prisma,
): Promise<SuppliedItem> {
  return client.suppliedItem.update({ where: { id }, data });
}

// --- Relationships ----------------------------------------------------------

/**
 * Whether a link target really exists inside this project.
 *
 * The project id is part of every `where` clause, so an id belonging to another
 * project — and therefore any other organization — cannot be linked. Each branch
 * names its own table.
 */
export async function suppliedItemLinkTargetExists(
  relation: SuppliedItemRelation,
  targetId: string,
  projectId: string,
  client: DbClient = prisma,
): Promise<boolean> {
  const where = { id: targetId, projectId };

  switch (relation) {
    case "DESIGN_ITEM":
      return (await client.designItem.findFirst({ where, select: { id: true } })) !== null;
    case "REQUIREMENT":
      return (await client.requirement.findFirst({ where, select: { id: true } })) !== null;
    case "VERIFICATION_ACTIVITY":
      return (
        (await client.verificationActivity.findFirst({ where, select: { id: true } })) !== null
      );
    case "ENGINEERING_DECISION":
      return (
        (await client.engineeringDecision.findFirst({ where, select: { id: true } })) !== null
      );
    case "RISK":
      return (await client.risk.findFirst({ where, select: { id: true } })) !== null;
    case "EVIDENCE":
      return (await client.evidence.findFirst({ where, select: { id: true } })) !== null;
  }
}

export interface SuppliedItemLinkData {
  suppliedItemId: string;
  relation: SuppliedItemRelation;
  targetId: string;
  note: string | null;
  createdById: string | null;
}

/**
 * Records one relationship.
 *
 * A duplicate is a conflict rather than a silent no-op: asserting a relationship
 * that already exists usually means the caller believed it did not, and telling
 * them so is more useful than pretending the write happened.
 */
export async function linkSuppliedItem(
  data: SuppliedItemLinkData,
  client: DbClient = prisma,
): Promise<string> {
  const base = {
    suppliedItemId: data.suppliedItemId,
    note: data.note,
    createdById: data.createdById,
  };

  try {
    switch (data.relation) {
      case "DESIGN_ITEM": {
        const row = await client.suppliedItemDesignLink.create({
          data: { ...base, designItemId: data.targetId },
          select: { id: true },
        });
        return row.id;
      }
      case "REQUIREMENT": {
        const row = await client.suppliedItemRequirementLink.create({
          data: { ...base, requirementId: data.targetId },
          select: { id: true },
        });
        return row.id;
      }
      case "VERIFICATION_ACTIVITY": {
        const row = await client.suppliedItemVerificationLink.create({
          data: { ...base, verificationActivityId: data.targetId },
          select: { id: true },
        });
        return row.id;
      }
      case "ENGINEERING_DECISION": {
        const row = await client.suppliedItemDecisionLink.create({
          data: { ...base, engineeringDecisionId: data.targetId },
          select: { id: true },
        });
        return row.id;
      }
      case "RISK": {
        const row = await client.suppliedItemRiskLink.create({
          data: { ...base, riskId: data.targetId },
          select: { id: true },
        });
        return row.id;
      }
      case "EVIDENCE": {
        // Evidence reuses the shared table, in its own subject column. The
        // widened CHECK constraint guarantees exactly one subject per row.
        const row = await client.evidenceLink.create({
          data: {
            evidenceId: data.targetId,
            suppliedItemId: data.suppliedItemId,
            note: data.note,
            createdById: data.createdById,
          },
          select: { id: true },
        });
        return row.id;
      }
    }
  } catch (error) {
    rethrowAsConflict(error, "That relationship is already recorded for this supplied item.");
  }
}

/** Removes one relationship. Returns whether a row was actually deleted. */
export async function unlinkSuppliedItem(
  suppliedItemId: string,
  relation: SuppliedItemRelation,
  targetId: string,
  client: DbClient = prisma,
): Promise<boolean> {
  switch (relation) {
    case "DESIGN_ITEM": {
      const { count } = await client.suppliedItemDesignLink.deleteMany({
        where: { suppliedItemId, designItemId: targetId },
      });
      return count > 0;
    }
    case "REQUIREMENT": {
      const { count } = await client.suppliedItemRequirementLink.deleteMany({
        where: { suppliedItemId, requirementId: targetId },
      });
      return count > 0;
    }
    case "VERIFICATION_ACTIVITY": {
      const { count } = await client.suppliedItemVerificationLink.deleteMany({
        where: { suppliedItemId, verificationActivityId: targetId },
      });
      return count > 0;
    }
    case "ENGINEERING_DECISION": {
      const { count } = await client.suppliedItemDecisionLink.deleteMany({
        where: { suppliedItemId, engineeringDecisionId: targetId },
      });
      return count > 0;
    }
    case "RISK": {
      const { count } = await client.suppliedItemRiskLink.deleteMany({
        where: { suppliedItemId, riskId: targetId },
      });
      return count > 0;
    }
    case "EVIDENCE": {
      const { count } = await client.evidenceLink.deleteMany({
        where: { suppliedItemId, evidenceId: targetId },
      });
      return count > 0;
    }
  }
}

const LINK_ORDER = [{ createdAt: "asc" as const }, { id: "asc" as const }];

/**
 * Every engineering object this supplied item is linked to.
 *
 * Six queries issued together rather than one per link row — the detail view
 * needs all six categories, and a per-row lookup is how a page with a handful of
 * links becomes a page with fifty queries.
 */
export async function listSuppliedItemLinks(
  suppliedItemId: string,
  projectId: string,
  client: DbClient = prisma,
): Promise<SuppliedItemLinkSummary[]> {
  const [designs, requirements, verifications, decisions, risks, evidence] = await Promise.all([
    client.suppliedItemDesignLink.findMany({
      where: { suppliedItemId, designItem: { projectId } },
      select: {
        note: true,
        createdAt: true,
        designItem: { select: { id: true, identifier: true, name: true } },
      },
      orderBy: LINK_ORDER,
    }),
    client.suppliedItemRequirementLink.findMany({
      where: { suppliedItemId, requirement: { projectId } },
      select: {
        note: true,
        createdAt: true,
        requirement: { select: { id: true, identifier: true, title: true } },
      },
      orderBy: LINK_ORDER,
    }),
    client.suppliedItemVerificationLink.findMany({
      where: { suppliedItemId, verificationActivity: { projectId } },
      select: {
        note: true,
        createdAt: true,
        verificationActivity: { select: { id: true, identifier: true, title: true } },
      },
      orderBy: LINK_ORDER,
    }),
    client.suppliedItemDecisionLink.findMany({
      where: { suppliedItemId, engineeringDecision: { projectId } },
      select: {
        note: true,
        createdAt: true,
        engineeringDecision: { select: { id: true, identifier: true, title: true } },
      },
      orderBy: LINK_ORDER,
    }),
    client.suppliedItemRiskLink.findMany({
      where: { suppliedItemId, risk: { projectId } },
      select: {
        note: true,
        createdAt: true,
        risk: { select: { id: true, identifier: true, title: true } },
      },
      orderBy: LINK_ORDER,
    }),
    client.evidenceLink.findMany({
      where: { suppliedItemId, evidence: { projectId } },
      select: {
        note: true,
        createdAt: true,
        evidence: { select: { id: true, title: true, sourceReference: true } },
      },
      orderBy: LINK_ORDER,
    }),
  ]);

  return [
    ...designs.map((row) => ({
      relation: "DESIGN_ITEM" as const,
      targetId: row.designItem.id,
      identifier: row.designItem.identifier,
      title: row.designItem.name,
      note: row.note,
      createdAt: row.createdAt,
    })),
    ...requirements.map((row) => ({
      relation: "REQUIREMENT" as const,
      targetId: row.requirement.id,
      identifier: row.requirement.identifier,
      title: row.requirement.title,
      note: row.note,
      createdAt: row.createdAt,
    })),
    ...verifications.map((row) => ({
      relation: "VERIFICATION_ACTIVITY" as const,
      targetId: row.verificationActivity.id,
      identifier: row.verificationActivity.identifier,
      title: row.verificationActivity.title,
      note: row.note,
      createdAt: row.createdAt,
    })),
    ...decisions.map((row) => ({
      relation: "ENGINEERING_DECISION" as const,
      targetId: row.engineeringDecision.id,
      identifier: row.engineeringDecision.identifier,
      title: row.engineeringDecision.title,
      note: row.note,
      createdAt: row.createdAt,
    })),
    ...risks.map((row) => ({
      relation: "RISK" as const,
      targetId: row.risk.id,
      identifier: row.risk.identifier,
      title: row.risk.title,
      note: row.note,
      createdAt: row.createdAt,
    })),
    ...evidence.map((row) => ({
      relation: "EVIDENCE" as const,
      targetId: row.evidence.id,
      // Evidence carries no project-scoped identifier; its source reference is
      // what an engineer would actually cite.
      identifier: row.evidence.sourceReference,
      title: row.evidence.title,
      note: row.note,
      createdAt: row.createdAt,
    })),
  ];
}
