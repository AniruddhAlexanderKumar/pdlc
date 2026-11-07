import type { DecisionAlternative } from "@/domain";
import { type DbClient, prisma } from "@/lib/db";
import { toDecisionAlternative } from "./mappers";

/**
 * Alternatives considered for a decision.
 *
 * Every read and write is scoped by `engineeringDecisionId` as well as the
 * row's own id, so an alternative belonging to another decision — and
 * therefore possibly another project — can never be reached by guessing its
 * id. The caller proves the decision is in scope first.
 */

export interface CreateAlternativeData {
  engineeringDecisionId: string;
  title: string;
  description: string | null;
  reasonRejected: string | null;
}

export async function createAlternative(
  data: CreateAlternativeData,
  client: DbClient = prisma,
): Promise<DecisionAlternative> {
  const row = await client.decisionAlternative.create({ data });
  return toDecisionAlternative(row);
}

export async function listAlternatives(
  engineeringDecisionId: string,
  client: DbClient = prisma,
): Promise<DecisionAlternative[]> {
  const rows = await client.decisionAlternative.findMany({
    where: { engineeringDecisionId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows.map(toDecisionAlternative);
}

/** Scoped lookup — the alternative must belong to this decision. */
export async function findAlternativeForDecision(
  engineeringDecisionId: string,
  alternativeId: string,
  client: DbClient = prisma,
): Promise<DecisionAlternative | null> {
  const row = await client.decisionAlternative.findFirst({
    where: { id: alternativeId, engineeringDecisionId },
  });
  return row ? toDecisionAlternative(row) : null;
}

export interface UpdateAlternativeData {
  title?: string | undefined;
  description?: string | null | undefined;
  reasonRejected?: string | null | undefined;
}

export async function updateAlternative(
  id: string,
  data: UpdateAlternativeData,
  client: DbClient = prisma,
): Promise<DecisionAlternative> {
  const row = await client.decisionAlternative.update({ where: { id }, data });
  return toDecisionAlternative(row);
}

/**
 * Deletes by id *and* decision, so a mismatched pair removes nothing. Returns
 * the count so the caller can 404 rather than silently succeeding.
 */
export async function deleteAlternative(
  engineeringDecisionId: string,
  alternativeId: string,
  client: DbClient = prisma,
): Promise<number> {
  const { count } = await client.decisionAlternative.deleteMany({
    where: { id: alternativeId, engineeringDecisionId },
  });
  return count;
}
