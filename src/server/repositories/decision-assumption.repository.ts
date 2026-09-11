import type { AssumptionStatus, DecisionAssumption } from "@/domain";
import { type DbClient, prisma } from "@/lib/db";
import { toDecisionAssumption } from "./mappers";

/**
 * Assumptions a decision depends on.
 *
 * Scoped by `engineeringDecisionId` throughout, so an assumption from another
 * decision cannot be read or mutated by guessing its id.
 *
 * Status is only ever what a caller set. Nothing here infers or advances it —
 * a future surveillance layer will, and these rows are what it will watch.
 */

export interface CreateAssumptionData {
  engineeringDecisionId: string;
  statement: string;
  status?: AssumptionStatus | undefined;
  rationale: string | null;
}

export async function createAssumption(
  data: CreateAssumptionData,
  client: DbClient = prisma,
): Promise<DecisionAssumption> {
  const row = await client.decisionAssumption.create({
    data: {
      engineeringDecisionId: data.engineeringDecisionId,
      statement: data.statement,
      rationale: data.rationale,
      // Omitted when absent so the schema default (UNKNOWN) applies: writing
      // an assumption down is not the same as having checked it.
      ...(data.status ? { status: data.status } : {}),
    },
  });
  return toDecisionAssumption(row);
}

export async function listAssumptions(
  engineeringDecisionId: string,
  client: DbClient = prisma,
): Promise<DecisionAssumption[]> {
  const rows = await client.decisionAssumption.findMany({
    where: { engineeringDecisionId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map(toDecisionAssumption);
}

export async function findAssumptionForDecision(
  engineeringDecisionId: string,
  assumptionId: string,
  client: DbClient = prisma,
): Promise<DecisionAssumption | null> {
  const row = await client.decisionAssumption.findFirst({
    where: { id: assumptionId, engineeringDecisionId },
  });
  return row ? toDecisionAssumption(row) : null;
}

export interface UpdateAssumptionData {
  statement?: string | undefined;
  status?: AssumptionStatus | undefined;
  rationale?: string | null | undefined;
}

export async function updateAssumption(
  id: string,
  data: UpdateAssumptionData,
  client: DbClient = prisma,
): Promise<DecisionAssumption> {
  const row = await client.decisionAssumption.update({ where: { id }, data });
  return toDecisionAssumption(row);
}

export async function deleteAssumption(
  engineeringDecisionId: string,
  assumptionId: string,
  client: DbClient = prisma,
): Promise<number> {
  const { count } = await client.decisionAssumption.deleteMany({
    where: { id: assumptionId, engineeringDecisionId },
  });
  return count;
}
