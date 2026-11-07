import type { ProjectProgressFacts, ReleaseGateFact } from "@/domain/project-progress";
import { type DbClient, prisma } from "@/lib/db";

type Tally = Record<string, number>;

/** `groupBy` rows → `{ STATUS: count }`, so an absent status reads as zero. */
function tally(rows: ReadonlyArray<{ status: string; _count: { _all: number } }>): Tally {
  return Object.fromEntries(rows.map((row) => [row.status, row._count._all]));
}

function sum(tally: Tally, statuses: readonly string[]): number {
  return statuses.reduce((total, status) => total + (tally[status] ?? 0), 0);
}

/**
 * The record-level facts `project-progress.ts` computes stages from.
 *
 * One grouped query per kind of record — ten in all, run concurrently,
 * however large the project is. Retired records (rejected, obsolete,
 * superseded) are left out of every total, because nobody needs to act on
 * them and counting them would make a project look further from done than
 * it is.
 *
 * "Has no check" and "has no proof" are `none: {}` on the link relation, so
 * they mean exactly "not one linking row exists".
 *
 * The release gate is *not* read here: whether the last release check is
 * still current depends on re-resolving its scope, which belongs to the
 * technical-readiness engine. The service asks that engine and passes the
 * answer in, rather than this file growing a second copy of its rule.
 *
 * The caller must already have authorized read access to `projectId`.
 */
export async function recordFactsForProject(
  projectId: string,
  client: DbClient = prisma,
): Promise<Omit<ProjectProgressFacts, "release"> & { release: Omit<ProjectProgressFacts["release"], "gate"> }> {
  const byStatus = { by: ["status"] as ["status"], where: { projectId }, _count: { _all: true } } as const;

  const [
    needs,
    requirements,
    requirementsWithoutCheck,
    designItems,
    decisions,
    checks,
    passedWithoutProof,
    changes,
    risks,
    issues,
    baselines,
  ] = await Promise.all([
    client.stakeholderNeed.groupBy(byStatus),
    client.requirement.groupBy(byStatus),
    client.requirement.count({
      where: { projectId, status: { not: "OBSOLETE" }, verificationLinks: { none: {} } },
    }),
    client.designItem.groupBy(byStatus),
    client.engineeringDecision.groupBy(byStatus),
    client.verificationActivity.groupBy(byStatus),
    client.verificationActivity.count({
      where: { projectId, status: "PASSED", evidenceLinks: { none: {} } },
    }),
    client.changeRequest.groupBy(byStatus),
    client.risk.groupBy(byStatus),
    client.issue.groupBy(byStatus),
    client.engineeringBaseline.groupBy(byStatus),
  ]);

  const n = tally(needs);
  const r = tally(requirements);
  const d = tally(designItems);
  const e = tally(decisions);
  const v = tally(checks);
  const c = tally(changes);
  const k = tally(risks);
  const i = tally(issues);
  const b = tally(baselines);

  const all = (t: Tally) => Object.values(t).reduce((a, x) => a + x, 0);

  return {
    stakeholderNeeds: {
      total: sum(n, ["DRAFT", "ACCEPTED"]),
      draft: sum(n, ["DRAFT"]),
    },
    requirements: {
      total: sum(r, ["DRAFT", "IN_REVIEW", "APPROVED", "BASELINED"]),
      draft: sum(r, ["DRAFT"]),
      inReview: sum(r, ["IN_REVIEW"]),
      withoutCheck: requirementsWithoutCheck,
    },
    designItems: {
      total: sum(d, ["DRAFT", "IN_REVIEW", "APPROVED", "BASELINED"]),
      draft: sum(d, ["DRAFT"]),
      inReview: sum(d, ["IN_REVIEW"]),
    },
    decisions: {
      total: sum(e, ["PROPOSED", "UNDER_REVIEW", "APPROVED"]),
      proposed: sum(e, ["PROPOSED"]),
      underReview: sum(e, ["UNDER_REVIEW"]),
    },
    checks: {
      total: all(v),
      notRun: sum(v, ["PLANNED", "IN_PROGRESS"]),
      failed: sum(v, ["FAILED"]),
      passedWithoutProof,
    },
    control: {
      draftChanges: sum(c, ["DRAFT"]),
      changesAwaitingReview: sum(c, ["SUBMITTED", "UNDER_REVIEW"]),
      openRisks: sum(k, ["OPEN"]),
      openIssues: sum(i, ["OPEN", "IN_PROGRESS"]),
      everRecorded: all(c) + all(k) + all(i),
    },
    release: {
      activeBaseline: (b["ACTIVE"] ?? 0) > 0,
      draftBaseline: (b["DRAFT"] ?? 0) > 0,
    },
  };
}

export type { ReleaseGateFact };
