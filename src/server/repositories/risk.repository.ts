import {
  type CreateRiskInput,
  type Risk,
  type RiskFilter,
  type RiskLinkSummary,
  type RiskRelation,
  type RiskStatus,
  type UpdateRiskInput,
  createRiskInputSchema,
  riskFilterSchema,
  riskLinkKey,
  updateRiskInputSchema,
} from "@/domain";
import { type DbClient, prisma } from "@/lib/db";
import { parseOrThrow } from "@/server/validation";
import { toRisk } from "./mappers";
import { rethrowAsConflict } from "./prisma-error";

/** Risk data access, including the trace edges that hang off a risk. */

export async function createRisk(input: CreateRiskInput, client: DbClient = prisma): Promise<Risk> {
  const data = parseOrThrow(createRiskInputSchema, input, "Invalid risk");

  try {
    const row = await client.risk.create({
      data: {
        projectId: data.projectId,
        identifier: data.identifier,
        title: data.title,
        description: data.description,
        cause: data.cause ?? null,
        consequence: data.consequence ?? null,
        status: data.status,
        ownerId: data.ownerId ?? null,
      },
    });
    return toRisk(row);
  } catch (error) {
    rethrowAsConflict(error, `Risk ${data.identifier} already exists in this project.`);
  }
}

export async function findRiskInProject(
  projectId: string,
  riskId: string,
  client: DbClient = prisma,
): Promise<Risk | null> {
  const row = await client.risk.findFirst({ where: { id: riskId, projectId } });
  return row ? toRisk(row) : null;
}

export async function listRisks(filter: RiskFilter, client: DbClient = prisma): Promise<Risk[]> {
  const where = parseOrThrow(riskFilterSchema, filter, "Invalid risk filter");

  const rows = await client.risk.findMany({
    where: { projectId: where.projectId, status: where.status, ownerId: where.ownerId },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
  });
  return rows.map(toRisk);
}

export async function updateRisk(
  id: string,
  input: UpdateRiskInput,
  client: DbClient = prisma,
): Promise<Risk> {
  const data = parseOrThrow(updateRiskInputSchema, input, "Invalid risk update");

  const row = await client.risk.update({
    where: { id },
    data: {
      title: data.title,
      description: data.description,
      cause: data.cause,
      consequence: data.consequence,
      status: data.status,
      ownerId: data.ownerId,
    },
  });
  return toRisk(row);
}

export interface RiskOwnerSummary {
  id: string;
  name: string;
  email: string;
}

export interface RiskListItem extends Risk {
  owner: RiskOwnerSummary | null;
}

/** Risks in a project, ordered by identifier then id. */
export async function listRisksInProject(
  projectId: string,
  options: { status?: RiskStatus } = {},
  client: DbClient = prisma,
): Promise<RiskListItem[]> {
  const rows = await client.risk.findMany({
    where: { projectId, status: options.status },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
    include: { owner: { select: { id: true, name: true, email: true } } },
  });
  return rows.map((row) => ({ ...toRisk(row), owner: row.owner }));
}

/** The owner record for a risk, or null. Never selects credential fields. */
export async function findRiskOwner(
  ownerId: string,
  client: DbClient = prisma,
): Promise<RiskOwnerSummary | null> {
  return client.user.findUnique({ where: { id: ownerId }, select: { id: true, name: true, email: true } });
}

// --- Traceability -------------------------------------------------------------

/**
 * Confirms a link target exists *and* sits in the same project.
 *
 * Every relation is checked against its own table with `projectId` in the
 * where clause, so a target from another project (or another organization,
 * which necessarily means another project) cannot be linked.
 */
export async function riskLinkTargetExistsInProject(
  relation: RiskRelation,
  targetId: string,
  projectId: string,
  client: DbClient = prisma,
): Promise<boolean> {
  const where = { id: targetId, projectId };

  switch (relation) {
    case "REQUIREMENT":
      return (await client.requirement.findFirst({ where, select: { id: true } })) !== null;
    case "DESIGN_ITEM":
      return (await client.designItem.findFirst({ where, select: { id: true } })) !== null;
    case "ENGINEERING_DECISION":
      return (await client.engineeringDecision.findFirst({ where, select: { id: true } })) !== null;
  }
}

export interface CreateRiskLinkInput {
  riskId: string;
  relation: RiskRelation;
  targetId: string;
  note?: string | null | undefined;
  createdById: string | null;
}

export interface CreatedLinkRow {
  rowId: string;
}

/** Writes one trace edge into its own typed table, returning the new row's id. */
export async function createRiskLink(
  input: CreateRiskLinkInput,
  client: DbClient = prisma,
): Promise<CreatedLinkRow> {
  const { riskId, targetId, note, createdById } = input;

  switch (input.relation) {
    case "REQUIREMENT": {
      const row = await client.riskRequirementLink.create({
        data: { riskId, requirementId: targetId, note: note ?? null, createdById },
        select: { id: true },
      });
      return { rowId: row.id };
    }
    case "DESIGN_ITEM": {
      const row = await client.riskDesignLink.create({
        data: { riskId, designItemId: targetId, note: note ?? null, createdById },
        select: { id: true },
      });
      return { rowId: row.id };
    }
    case "ENGINEERING_DECISION": {
      const row = await client.decisionRiskLink.create({
        data: { riskId, engineeringDecisionId: targetId, note: note ?? null, createdById },
        select: { id: true },
      });
      return { rowId: row.id };
    }
  }
}

/** Whether this exact edge already exists — the service turns a hit into a client error. */
export async function riskLinkExists(
  riskId: string,
  relation: RiskRelation,
  targetId: string,
  client: DbClient = prisma,
): Promise<boolean> {
  switch (relation) {
    case "REQUIREMENT":
      return (
        (await client.riskRequirementLink.findUnique({
          where: { riskId_requirementId: { riskId, requirementId: targetId } },
          select: { id: true },
        })) !== null
      );
    case "DESIGN_ITEM":
      return (
        (await client.riskDesignLink.findUnique({
          where: { riskId_designItemId: { riskId, designItemId: targetId } },
          select: { id: true },
        })) !== null
      );
    case "ENGINEERING_DECISION":
      return (
        (await client.decisionRiskLink.findUnique({
          where: { engineeringDecisionId_riskId: { engineeringDecisionId: targetId, riskId } },
          select: { id: true },
        })) !== null
      );
  }
}

/** Removes a trace edge by its row id. Returns how many rows went, so the caller can 404 on none. */
export async function deleteRiskLink(
  riskId: string,
  relation: RiskRelation,
  rowId: string,
  client: DbClient = prisma,
): Promise<number> {
  switch (relation) {
    case "REQUIREMENT": {
      const { count } = await client.riskRequirementLink.deleteMany({ where: { id: rowId, riskId } });
      return count;
    }
    case "DESIGN_ITEM": {
      const { count } = await client.riskDesignLink.deleteMany({ where: { id: rowId, riskId } });
      return count;
    }
    case "ENGINEERING_DECISION": {
      const { count } = await client.decisionRiskLink.deleteMany({ where: { id: rowId, riskId } });
      return count;
    }
  }
}

/**
 * Every edge on a risk, with enough of each target to display it.
 *
 * Three queries rather than one union: each relation lives in its own typed
 * table, and each target type names its heading differently (`title` for
 * requirements and decisions, `name` for design items).
 */
export async function listRiskLinks(
  riskId: string,
  client: DbClient = prisma,
): Promise<RiskLinkSummary[]> {
  const [requirements, designItems, decisions] = await Promise.all([
    client.riskRequirementLink.findMany({
      where: { riskId },
      select: { id: true, note: true, createdAt: true, requirement: { select: { id: true, identifier: true, title: true } } },
    }),
    client.riskDesignLink.findMany({
      where: { riskId },
      select: { id: true, note: true, createdAt: true, designItem: { select: { id: true, identifier: true, name: true } } },
    }),
    client.decisionRiskLink.findMany({
      where: { riskId },
      select: {
        id: true,
        note: true,
        createdAt: true,
        engineeringDecision: { select: { id: true, identifier: true, title: true } },
      },
    }),
  ]);

  return [
    ...requirements.map((row) => ({
      id: riskLinkKey("REQUIREMENT", row.id),
      relation: "REQUIREMENT" as const,
      targetId: row.requirement.id,
      identifier: row.requirement.identifier,
      title: row.requirement.title,
      note: row.note,
      createdAt: row.createdAt,
    })),
    ...designItems.map((row) => ({
      id: riskLinkKey("DESIGN_ITEM", row.id),
      relation: "DESIGN_ITEM" as const,
      targetId: row.designItem.id,
      identifier: row.designItem.identifier,
      title: row.designItem.name,
      note: row.note,
      createdAt: row.createdAt,
    })),
    ...decisions.map((row) => ({
      id: riskLinkKey("ENGINEERING_DECISION", row.id),
      relation: "ENGINEERING_DECISION" as const,
      targetId: row.engineeringDecision.id,
      identifier: row.engineeringDecision.identifier,
      title: row.engineeringDecision.title,
      note: row.note,
      createdAt: row.createdAt,
    })),
  ];
}
