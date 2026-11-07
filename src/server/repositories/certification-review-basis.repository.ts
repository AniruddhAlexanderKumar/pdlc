import type { AssumptionStatus } from "@/domain";
import { type DbClient, prisma } from "@/lib/db";
import * as monitoringRepository from "./assumption-monitoring.repository";

/** One assumption behind a linked decision, with its latest monitoring verdict. */
export interface AssumptionContextRow {
  assumptionId: string;
  decisionId: string;
  statement: string;
  assumptionStatus: AssumptionStatus;
  monitoringStatus: "CURRENT" | "BASIS_CHANGED" | "REVIEW_REQUIRED" | "NOT_EVALUATED";
}

/**
 * Assumptions behind a set of linked decisions, with the latest monitoring
 * record for each — two batched queries regardless of how many decisions are
 * in scope. Consumed, never written: `NOT_EVALUATED` means nobody has
 * monitored the assumption, which is not evidence against it.
 */
export async function loadAssumptionContext(
  projectId: string,
  decisionIds: readonly string[],
  client: DbClient = prisma,
): Promise<AssumptionContextRow[]> {
  if (decisionIds.length === 0) return [];

  const assumptions = await client.decisionAssumption.findMany({
    where: { engineeringDecisionId: { in: [...decisionIds] } },
    select: { id: true, statement: true, status: true, engineeringDecisionId: true },
  });
  if (assumptions.length === 0) return [];

  const monitoring = await monitoringRepository.findLatestForAssumptions(
    projectId,
    assumptions.map((assumption) => assumption.id),
    client,
  );

  return assumptions.map((assumption) => {
    const record = monitoring.get(assumption.id) ?? null;
    return {
      assumptionId: assumption.id,
      decisionId: assumption.engineeringDecisionId,
      statement: assumption.statement,
      assumptionStatus: assumption.status,
      monitoringStatus: record ? record.status : "NOT_EVALUATED",
    };
  });
}
