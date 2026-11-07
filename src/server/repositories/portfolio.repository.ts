import { type DbClient, prisma } from "@/lib/db";

/**
 * Cross-project counts for the executive portfolio.
 *
 * Deliberately one grouped query per artifact type over *all* the
 * organization's projects at once, rather than the obvious loop of
 * per-project counts: the portfolio's whole purpose is to widen as an
 * organization grows, and a per-project loop would make the page slower
 * for exactly the reader most likely to have many projects. Three
 * `groupBy` calls cost the same at three projects as at three hundred.
 *
 * Every filter here mirrors what `project-command-center.service.ts`
 * already treats as "open", so a project's own Command Center and its row
 * in the portfolio can never disagree about the same number:
 * risks `OPEN`; issues `OPEN` or `IN_PROGRESS`; surveillance targets
 * `OPEN`.
 */

export interface PortfolioCounts {
  openRisks: number;
  openIssues: number;
  attentionIssues: number;
  openSentinel: number;
}

function emptyCounts(): PortfolioCounts {
  return { openRisks: 0, openIssues: 0, attentionIssues: 0, openSentinel: 0 };
}

export async function countsByProject(
  projectIds: string[],
  client: DbClient = prisma,
): Promise<Map<string, PortfolioCounts>> {
  const counts = new Map<string, PortfolioCounts>();
  for (const id of projectIds) counts.set(id, emptyCounts());

  if (projectIds.length === 0) return counts;

  const [risks, issues, attention, sentinel] = await Promise.all([
    client.risk.groupBy({
      by: ["projectId"],
      where: { projectId: { in: projectIds }, status: "OPEN" },
      _count: { _all: true },
    }),
    client.issue.groupBy({
      by: ["projectId"],
      where: { projectId: { in: projectIds }, status: { in: ["OPEN", "IN_PROGRESS"] } },
      _count: { _all: true },
    }),
    client.issue.groupBy({
      by: ["projectId"],
      where: {
        projectId: { in: projectIds },
        status: { in: ["OPEN", "IN_PROGRESS"] },
        severity: { in: ["HIGH", "CRITICAL"] },
      },
      _count: { _all: true },
    }),
    client.surveillanceTarget.groupBy({
      by: ["projectId"],
      where: { projectId: { in: projectIds }, status: "OPEN" },
      _count: { _all: true },
    }),
  ]);

  for (const row of risks) {
    const entry = counts.get(row.projectId);
    if (entry) entry.openRisks = row._count._all;
  }
  for (const row of issues) {
    const entry = counts.get(row.projectId);
    if (entry) entry.openIssues = row._count._all;
  }
  for (const row of attention) {
    const entry = counts.get(row.projectId);
    if (entry) entry.attentionIssues = row._count._all;
  }
  for (const row of sentinel) {
    const entry = counts.get(row.projectId);
    if (entry) entry.openSentinel = row._count._all;
  }

  return counts;
}
