import type { TraceabilityMatrix } from "@/domain";
import type { OrganizationContext } from "@/server/context/organization-context";
import * as requirementRepository from "@/server/repositories/requirement.repository";
import * as verificationActivityRepository from "@/server/repositories/verification-activity.repository";
import { requireProjectReadAccess } from "./project-scope";

/**
 * The Requirement × Verification Activity traceability matrix (Master
 * Prompt 4 §4).
 *
 * Question this answers: *which requirements are verified by what, and
 * where are the holes?* A pure composition over the same
 * `RequirementVerificationLink` rows `RequirementService.linkRequirement`
 * already writes — no second graph, no cached/derived coverage state to
 * go stale. Every read here is authoritative at the instant it runs.
 */
export async function getRequirementVerificationMatrix(
  context: OrganizationContext,
  projectId: unknown,
): Promise<TraceabilityMatrix> {
  const scopedProjectId = await requireProjectReadAccess(context, projectId);

  const [requirements, activities, links] = await Promise.all([
    requirementRepository.listRequirementsInProject(scopedProjectId),
    verificationActivityRepository.listVerificationActivitiesInProject(scopedProjectId),
    requirementRepository.listRequirementVerificationLinksInProject(scopedProjectId),
  ]);

  const rows = requirements.map((r) => ({ id: r.id, identifier: r.identifier, title: r.title }));
  const columns = activities.map((a) => ({ id: a.id, identifier: a.identifier, title: a.title }));

  // A link can name a requirement or activity that existed when it was
  // created but has since been deleted from under it — cascades in this
  // schema mean that should not happen for this specific edge, but the
  // matrix only ever draws a cell for endpoints it can actually place on
  // an axis, rather than trusting the link row's ids blindly.
  const rowIds = new Set(rows.map((r) => r.id));
  const columnIds = new Set(columns.map((c) => c.id));

  const cells = links
    .filter((link) => rowIds.has(link.requirementId) && columnIds.has(link.verificationActivityId))
    .map((link) => ({
      rowId: link.requirementId,
      columnId: link.verificationActivityId,
      linkId: link.id,
      note: link.note,
      createdAt: link.createdAt.toISOString(),
      createdById: link.createdById,
    }));

  const coveredRowIds = new Set(cells.map((c) => c.rowId));
  const coveredColumnIds = new Set(cells.map((c) => c.columnId));

  return {
    rowAxis: "REQUIREMENT",
    columnAxis: "VERIFICATION_ACTIVITY",
    rows,
    columns,
    cells,
    uncoveredRowIds: rows.filter((r) => !coveredRowIds.has(r.id)).map((r) => r.id),
    uncoveredColumnIds: columns.filter((c) => !coveredColumnIds.has(c.id)).map((c) => c.id),
  };
}
