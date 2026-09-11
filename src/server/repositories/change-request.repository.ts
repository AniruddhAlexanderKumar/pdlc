import {
  type ChangeImpactTargetType,
  type ChangeRequest,
  type ChangeRequestFilter,
  type CreateChangeRequestInput,
  type DeclaredImpact,
  type UpdateChangeRequestInput,
  changeRequestFilterSchema,
  createChangeRequestInputSchema,
  updateChangeRequestInputSchema,
} from "@/domain";
import { type DbClient, prisma } from "@/lib/db";
import { AppError } from "@/server/errors";
import { parseOrThrow } from "@/server/validation";
import { toChangeRequest } from "./mappers";
import { rethrowAsConflict } from "./prisma-error";

/**
 * Change request data access.
 *
 * Two rules run through all of it:
 *
 *  - **Project scope.** Every read that a caller can reach takes the project
 *    id, so a change request id guessed from another project resolves to
 *    nothing rather than to someone else's record.
 *  - **Parent scope for children.** A declared impact is always reached through
 *    its change request. Mutating one by id alone would let a guessed id from a
 *    different change be deleted.
 */

export interface ChangeRequesterSummary {
  id: string;
  name: string;
}

/** A change as the list needs it: the row plus who asked for it. */
export interface ChangeRequestListItem extends ChangeRequest {
  requestedBy: ChangeRequesterSummary | null;
}

/**
 * Newest first, because a change list is read as a queue of recent activity.
 * Identifier and id break ties so the order never depends on row layout.
 */
const LIST_ORDER = [
  { createdAt: "desc" as const },
  { identifier: "asc" as const },
  { id: "asc" as const },
];

export async function createChangeRequest(
  input: CreateChangeRequestInput,
  client: DbClient = prisma,
): Promise<ChangeRequest> {
  const data = parseOrThrow(createChangeRequestInputSchema, input, "Invalid change request");

  try {
    const row = await client.changeRequest.create({
      data: {
        projectId: data.projectId,
        identifier: data.identifier,
        title: data.title,
        description: data.description,
        reason: data.reason,
        status: data.status,
        requestedById: data.requestedById,
      },
    });
    return toChangeRequest(row);
  } catch (error) {
    rethrowAsConflict(error, `Change request ${data.identifier} already exists in this project.`);
  }
}

/** Scoped by project: an id from another project simply is not found. */
export async function findChangeRequestInProject(
  projectId: string,
  id: string,
  client: DbClient = prisma,
): Promise<ChangeRequest | null> {
  const row = await client.changeRequest.findFirst({ where: { id, projectId } });
  return row ? toChangeRequest(row) : null;
}

export async function listChangeRequestsInProject(
  filter: ChangeRequestFilter,
  client: DbClient = prisma,
): Promise<ChangeRequestListItem[]> {
  const where = parseOrThrow(changeRequestFilterSchema, filter, "Invalid change request filter");

  const rows = await client.changeRequest.findMany({
    where: {
      projectId: where.projectId,
      status: where.status,
      requestedById: where.requestedById,
    },
    include: { requestedBy: { select: { id: true, name: true } } },
    orderBy: LIST_ORDER,
  });

  return rows.map((row) => ({
    ...toChangeRequest(row),
    requestedBy: row.requestedBy,
  }));
}

export async function findChangeRequester(
  userId: string,
  client: DbClient = prisma,
): Promise<ChangeRequesterSummary | null> {
  return client.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });
}

export async function updateChangeRequest(
  id: string,
  input: UpdateChangeRequestInput,
  client: DbClient = prisma,
): Promise<ChangeRequest> {
  const data = parseOrThrow(updateChangeRequestInputSchema, input, "Invalid change request update");

  const row = await client.changeRequest.update({
    where: { id },
    data: {
      title: data.title,
      description: data.description,
      reason: data.reason,
      status: data.status,
    },
  });
  return toChangeRequest(row);
}

// --- Declared impacts -------------------------------------------------------

/**
 * Whether a declared-impact target really exists inside this project.
 *
 * The project id is part of every `where` clause, so a target belonging to
 * another project — and therefore to any other organization — cannot be
 * declared as impacted. Each branch names its own table: there is no dynamic
 * dispatch and no way to reach a table the enum does not cover.
 */
export async function changeImpactTargetExistsInProject(
  type: ChangeImpactTargetType,
  targetId: string,
  projectId: string,
  client: DbClient = prisma,
): Promise<boolean> {
  const where = { id: targetId, projectId };

  switch (type) {
    case "REQUIREMENT":
      return (await client.requirement.findFirst({ where, select: { id: true } })) !== null;
    case "DESIGN_ITEM":
      return (await client.designItem.findFirst({ where, select: { id: true } })) !== null;
    case "ENGINEERING_DECISION":
      return (
        (await client.engineeringDecision.findFirst({ where, select: { id: true } })) !== null
      );
    case "VERIFICATION_ACTIVITY":
      return (
        (await client.verificationActivity.findFirst({ where, select: { id: true } })) !== null
      );
    case "RISK":
      return (await client.risk.findFirst({ where, select: { id: true } })) !== null;
    case "ISSUE":
      return (await client.issue.findFirst({ where, select: { id: true } })) !== null;
    case "SUPPLIER":
      return (await client.supplier.findFirst({ where, select: { id: true } })) !== null;
    case "SUPPLIED_ITEM":
      return (await client.suppliedItem.findFirst({ where, select: { id: true } })) !== null;
  }
}

/** Maps the domain's tagged target onto the one foreign key column that holds it. */
function targetColumn(
  type: ChangeImpactTargetType,
  id: string,
): Record<string, string> {
  switch (type) {
    case "REQUIREMENT":
      return { requirementId: id };
    case "DESIGN_ITEM":
      return { designItemId: id };
    case "ENGINEERING_DECISION":
      return { engineeringDecisionId: id };
    case "VERIFICATION_ACTIVITY":
      return { verificationActivityId: id };
    case "RISK":
      return { riskId: id };
    case "ISSUE":
      return { issueId: id };
    case "SUPPLIER":
      return { supplierId: id };
    case "SUPPLIED_ITEM":
      return { suppliedItemId: id };
  }
}

export interface CreateDeclaredImpactInput {
  changeRequestId: string;
  type: ChangeImpactTargetType;
  targetId: string;
  note: string | null;
  createdById: string | null;
}

/**
 * Records one declared impact.
 *
 * Stored in the target's own foreign key column, so the database still enforces
 * that the referenced artifact exists — the declaration cannot outlive what it
 * points at, and a cascade removes it when the artifact goes.
 */
export async function createDeclaredImpact(
  input: CreateDeclaredImpactInput,
  client: DbClient = prisma,
): Promise<string> {
  try {
    const row = await client.changeRequestImpact.create({
      data: {
        changeRequestId: input.changeRequestId,
        ...targetColumn(input.type, input.targetId),
        note: input.note,
        createdById: input.createdById,
      },
      select: { id: true },
    });
    return row.id;
  } catch (error) {
    rethrowAsConflict(error, "That artifact is already declared as impacted by this change.");
  }
}

/**
 * One declared impact, reached through its parent change.
 *
 * The change request id is part of the lookup on purpose: without it, an
 * impact id guessed from a different change could be deleted by a caller who
 * only has access to this one.
 */
export async function findDeclaredImpactForChange(
  changeRequestId: string,
  impactId: string,
  client: DbClient = prisma,
): Promise<{ id: string } | null> {
  return client.changeRequestImpact.findFirst({
    where: { id: impactId, changeRequestId },
    select: { id: true },
  });
}

export async function deleteDeclaredImpact(
  impactId: string,
  client: DbClient = prisma,
): Promise<void> {
  await client.changeRequestImpact.delete({ where: { id: impactId } });
}

const IMPACT_SELECT = {
  id: true,
  changeRequestId: true,
  note: true,
  createdAt: true,
  createdBy: { select: { id: true, name: true } },
  requirement: { select: { id: true, identifier: true, title: true } },
  designItem: { select: { id: true, identifier: true, name: true } },
  engineeringDecision: { select: { id: true, identifier: true, title: true } },
  verificationActivity: { select: { id: true, identifier: true, title: true } },
  risk: { select: { id: true, identifier: true, title: true } },
  issue: { select: { id: true, identifier: true, title: true } },
  supplier: { select: { id: true, identifier: true, name: true } },
  suppliedItem: { select: { id: true, identifier: true, name: true } },
} as const;

interface ImpactRow {
  id: string;
  changeRequestId: string;
  note: string | null;
  createdAt: Date;
  createdBy: { id: string; name: string } | null;
  requirement: { id: string; identifier: string; title: string } | null;
  designItem: { id: string; identifier: string; name: string } | null;
  engineeringDecision: { id: string; identifier: string; title: string } | null;
  verificationActivity: { id: string; identifier: string; title: string } | null;
  risk: { id: string; identifier: string; title: string } | null;
  issue: { id: string; identifier: string; title: string } | null;
  supplier: { id: string; identifier: string; name: string } | null;
  suppliedItem: { id: string; identifier: string; name: string } | null;
}

/**
 * Resolves the one populated target column into the tagged target plus enough
 * identity for a reader to recognise the artifact without a second request.
 */
function toDeclaredImpact(row: ImpactRow): DeclaredImpact {
  const base = {
    id: row.id,
    changeRequestId: row.changeRequestId,
    note: row.note,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
  };

  if (row.requirement) {
    return {
      ...base,
      target: { type: "REQUIREMENT", id: row.requirement.id },
      targetIdentifier: row.requirement.identifier,
      targetTitle: row.requirement.title,
    };
  }
  if (row.designItem) {
    return {
      ...base,
      target: { type: "DESIGN_ITEM", id: row.designItem.id },
      targetIdentifier: row.designItem.identifier,
      // Design items call it `name`; a reader only needs the heading.
      targetTitle: row.designItem.name,
    };
  }
  if (row.engineeringDecision) {
    return {
      ...base,
      target: { type: "ENGINEERING_DECISION", id: row.engineeringDecision.id },
      targetIdentifier: row.engineeringDecision.identifier,
      targetTitle: row.engineeringDecision.title,
    };
  }
  if (row.verificationActivity) {
    return {
      ...base,
      target: { type: "VERIFICATION_ACTIVITY", id: row.verificationActivity.id },
      targetIdentifier: row.verificationActivity.identifier,
      targetTitle: row.verificationActivity.title,
    };
  }
  if (row.risk) {
    return {
      ...base,
      target: { type: "RISK", id: row.risk.id },
      targetIdentifier: row.risk.identifier,
      targetTitle: row.risk.title,
    };
  }
  if (row.issue) {
    return {
      ...base,
      target: { type: "ISSUE", id: row.issue.id },
      targetIdentifier: row.issue.identifier,
      targetTitle: row.issue.title,
    };
  }
  if (row.supplier) {
    return {
      ...base,
      target: { type: "SUPPLIER", id: row.supplier.id },
      targetIdentifier: row.supplier.identifier,
      // Suppliers and supplied items call it `name`; a reader only needs the
      // heading, and the field name is a persistence detail.
      targetTitle: row.supplier.name,
    };
  }
  if (row.suppliedItem) {
    return {
      ...base,
      target: { type: "SUPPLIED_ITEM", id: row.suppliedItem.id },
      targetIdentifier: row.suppliedItem.identifier,
      targetTitle: row.suppliedItem.name,
    };
  }

  // A CHECK constraint enforces exactly one target, so this is unreachable
  // unless the schema has been altered underneath us. Not operational: it means
  // the data is wrong, not that the caller asked for something wrong.
  throw new AppError(`Change request impact ${row.id} has no target artifact`, {
    isOperational: false,
  });
}

/** Everything this change declares it affects, oldest declaration first. */
export async function listDeclaredImpacts(
  changeRequestId: string,
  client: DbClient = prisma,
): Promise<DeclaredImpact[]> {
  const rows = await client.changeRequestImpact.findMany({
    where: { changeRequestId },
    select: IMPACT_SELECT,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map(toDeclaredImpact);
}
