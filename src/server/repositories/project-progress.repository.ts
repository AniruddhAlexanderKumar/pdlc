import type { ProjectProgressCounts } from "@/domain/project-progress";
import { type DbClient, prisma } from "@/lib/db";

/** Change requests still in play. Everything else has reached an outcome. */
const OPEN_CHANGE_STATUSES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW"] as const;

/**
 * The six counts `nextProgressStep` needs, each a plain `count` over real
 * rows, run concurrently — six small indexed queries regardless of how big
 * the project is.
 *
 * "Has no check" and "has no proof" are expressed as `none: {}` on the
 * link relation, so they mean exactly what they say: not one linking row
 * exists. An obsolete requirement is excluded throughout — it has been
 * retired, and asking someone to plan a check for it would be asking them
 * to do pointless work.
 *
 * The caller must already have authorized read access to `projectId`; this
 * layer scopes every query by it and trusts nothing else.
 */
export async function countsForProject(
  projectId: string,
  client: DbClient = prisma,
): Promise<ProjectProgressCounts> {
  const activeRequirement = { projectId, status: { not: "OBSOLETE" as const } };

  const [
    stakeholderNeeds,
    requirements,
    requirementsWithoutCheck,
    verificationActivities,
    checksWithoutProof,
    openChanges,
  ] = await Promise.all([
    client.stakeholderNeed.count({ where: { projectId } }),
    client.requirement.count({ where: activeRequirement }),
    client.requirement.count({ where: { ...activeRequirement, verificationLinks: { none: {} } } }),
    client.verificationActivity.count({ where: { projectId } }),
    client.verificationActivity.count({ where: { projectId, evidenceLinks: { none: {} } } }),
    client.changeRequest.count({
      where: { projectId, status: { in: [...OPEN_CHANGE_STATUSES] } },
    }),
  ]);

  return {
    stakeholderNeeds,
    requirements,
    requirementsWithoutCheck,
    verificationActivities,
    checksWithoutProof,
    openChanges,
  };
}
