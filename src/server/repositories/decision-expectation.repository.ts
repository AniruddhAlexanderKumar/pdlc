import type { ComparisonOperator, DecisionExpectation, ExpectationStatus } from "@/domain";
import { type DbClient, prisma } from "@/lib/db";
import { toDecisionExpectation } from "./mappers";

/**
 * The expectation attached to a decision — at most one, enforced by a unique
 * index on `engineeringDecisionId`.
 *
 * Expected and actual are separate columns on purpose: recording what
 * happened must never overwrite what was predicted, or the record loses the
 * only thing that made it worth keeping. Nothing here compares the two.
 */

export interface SetExpectationData {
  engineeringDecisionId: string;
  statement: string;
  measure: string | null;
  expectedValue: string | null;
  unit: string | null;
  /** Explicit, never inferred. Null means "not mechanically comparable". */
  comparisonOperator: ComparisonOperator | null;
  dueAt: Date | null;
  status?: ExpectationStatus | undefined;
  actualValue: string | null;
  observedAt: Date | null;
}

/**
 * Creates or replaces the decision's expectation.
 *
 * An upsert because the relationship is 1:1 and `PUT` should be idempotent —
 * the caller does not have to know whether one already exists.
 */
export async function setExpectation(
  data: SetExpectationData,
  client: DbClient = prisma,
): Promise<DecisionExpectation> {
  const { engineeringDecisionId, status, ...fields } = data;

  const row = await client.decisionExpectation.upsert({
    where: { engineeringDecisionId },
    create: {
      engineeringDecisionId,
      ...fields,
      // Omitted when absent so the schema default (NOT_OBSERVED) applies.
      ...(status ? { status } : {}),
    },
    update: {
      ...fields,
      ...(status ? { status } : {}),
    },
  });
  return toDecisionExpectation(row);
}

export async function findExpectation(
  engineeringDecisionId: string,
  client: DbClient = prisma,
): Promise<DecisionExpectation | null> {
  const row = await client.decisionExpectation.findUnique({ where: { engineeringDecisionId } });
  return row ? toDecisionExpectation(row) : null;
}

/** Returns how many rows went, so clearing an absent expectation can 404. */
export async function deleteExpectation(
  engineeringDecisionId: string,
  client: DbClient = prisma,
): Promise<number> {
  const { count } = await client.decisionExpectation.deleteMany({
    where: { engineeringDecisionId },
  });
  return count;
}
