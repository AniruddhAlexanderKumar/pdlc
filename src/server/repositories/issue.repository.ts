import {
  type CreateIssueInput,
  type Issue,
  type IssueFilter,
  type IssueLinkSummary,
  type IssueRelation,
  type IssueSeverity,
  type IssueStatus,
  type UpdateIssueInput,
  createIssueInputSchema,
  issueFilterSchema,
  issueLinkKey,
  updateIssueInputSchema,
} from "@/domain";
import { type DbClient, prisma } from "@/lib/db";
import { parseOrThrow } from "@/server/validation";
import { toIssue } from "./mappers";
import { assertGuardedTransition, rethrowAsConflict } from "./prisma-error";

/** Issue data access, including the trace edges that hang off an issue. */

export async function createIssue(input: CreateIssueInput, client: DbClient = prisma): Promise<Issue> {
  const data = parseOrThrow(createIssueInputSchema, input, "Invalid issue");

  try {
    const row = await client.issue.create({
      data: {
        projectId: data.projectId,
        identifier: data.identifier,
        title: data.title,
        description: data.description,
        severity: data.severity,
        status: data.status,
        ownerId: data.ownerId ?? null,
      },
    });
    return toIssue(row);
  } catch (error) {
    rethrowAsConflict(error, `Issue ${data.identifier} already exists in this project.`);
  }
}

export async function findIssueInProject(
  projectId: string,
  issueId: string,
  client: DbClient = prisma,
): Promise<Issue | null> {
  const row = await client.issue.findFirst({ where: { id: issueId, projectId } });
  return row ? toIssue(row) : null;
}

export async function listIssues(filter: IssueFilter, client: DbClient = prisma): Promise<Issue[]> {
  const where = parseOrThrow(issueFilterSchema, filter, "Invalid issue filter");

  const rows = await client.issue.findMany({
    where: {
      projectId: where.projectId,
      status: where.status,
      severity: where.severity,
      ownerId: where.ownerId,
    },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
  });
  return rows.map(toIssue);
}

export async function updateIssue(
  id: string,
  input: UpdateIssueInput,
  client: DbClient = prisma,
): Promise<Issue> {
  const data = parseOrThrow(updateIssueInputSchema, input, "Invalid issue update");

  const row = await client.issue.update({
    where: { id },
    data: {
      title: data.title,
      description: data.description,
      severity: data.severity,
      status: data.status,
      ownerId: data.ownerId,
    },
  });
  return toIssue(row);
}

/**
 * The status write behind `transitionIssue`. Guarded, unlike
 * {@link updateIssue}: see `assertGuardedTransition`.
 */
export async function transitionStatusGuarded(
  id: string,
  fromStatus: IssueStatus,
  toStatus: IssueStatus,
  client: DbClient = prisma,
): Promise<Issue> {
  const result = await client.issue.updateMany({
    where: { id, status: fromStatus },
    data: { status: toStatus },
  });
  assertGuardedTransition(
    result.count,
    "This issue's status was changed by someone else first. Reload and try again.",
  );
  const row = await client.issue.findUniqueOrThrow({ where: { id } });
  return toIssue(row);
}

export interface IssueOwnerSummary {
  id: string;
  name: string;
  email: string;
}

export interface IssueListItem extends Issue {
  owner: IssueOwnerSummary | null;
}

/** Issues in a project, ordered by identifier then id. */
export async function listIssuesInProject(
  projectId: string,
  options: { status?: IssueStatus; severity?: IssueSeverity } = {},
  client: DbClient = prisma,
): Promise<IssueListItem[]> {
  const rows = await client.issue.findMany({
    where: { projectId, status: options.status, severity: options.severity },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
    include: { owner: { select: { id: true, name: true, email: true } } },
  });
  return rows.map((row) => ({ ...toIssue(row), owner: row.owner }));
}

/** The owner record for an issue, or null. Never selects credential fields. */
export async function findIssueOwner(
  ownerId: string,
  client: DbClient = prisma,
): Promise<IssueOwnerSummary | null> {
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
export async function issueLinkTargetExistsInProject(
  relation: IssueRelation,
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

export interface CreateIssueLinkInput {
  issueId: string;
  relation: IssueRelation;
  targetId: string;
  note?: string | null | undefined;
  createdById: string | null;
}

export interface CreatedLinkRow {
  rowId: string;
}

/** Writes one trace edge into its own typed table, returning the new row's id. */
export async function createIssueLink(
  input: CreateIssueLinkInput,
  client: DbClient = prisma,
): Promise<CreatedLinkRow> {
  const { issueId, targetId, note, createdById } = input;

  switch (input.relation) {
    case "REQUIREMENT": {
      const row = await client.issueRequirementLink.create({
        data: { issueId, requirementId: targetId, note: note ?? null, createdById },
        select: { id: true },
      });
      return { rowId: row.id };
    }
    case "DESIGN_ITEM": {
      const row = await client.issueDesignLink.create({
        data: { issueId, designItemId: targetId, note: note ?? null, createdById },
        select: { id: true },
      });
      return { rowId: row.id };
    }
    case "ENGINEERING_DECISION": {
      const row = await client.decisionIssueLink.create({
        data: { issueId, engineeringDecisionId: targetId, note: note ?? null, createdById },
        select: { id: true },
      });
      return { rowId: row.id };
    }
  }
}

/** Whether this exact edge already exists — the service turns a hit into a client error. */
export async function issueLinkExists(
  issueId: string,
  relation: IssueRelation,
  targetId: string,
  client: DbClient = prisma,
): Promise<boolean> {
  switch (relation) {
    case "REQUIREMENT":
      return (
        (await client.issueRequirementLink.findUnique({
          where: { issueId_requirementId: { issueId, requirementId: targetId } },
          select: { id: true },
        })) !== null
      );
    case "DESIGN_ITEM":
      return (
        (await client.issueDesignLink.findUnique({
          where: { issueId_designItemId: { issueId, designItemId: targetId } },
          select: { id: true },
        })) !== null
      );
    case "ENGINEERING_DECISION":
      return (
        (await client.decisionIssueLink.findUnique({
          where: { engineeringDecisionId_issueId: { engineeringDecisionId: targetId, issueId } },
          select: { id: true },
        })) !== null
      );
  }
}

/** Removes a trace edge by its row id. Returns how many rows went, so the caller can 404 on none. */
export async function deleteIssueLink(
  issueId: string,
  relation: IssueRelation,
  rowId: string,
  client: DbClient = prisma,
): Promise<number> {
  switch (relation) {
    case "REQUIREMENT": {
      const { count } = await client.issueRequirementLink.deleteMany({ where: { id: rowId, issueId } });
      return count;
    }
    case "DESIGN_ITEM": {
      const { count } = await client.issueDesignLink.deleteMany({ where: { id: rowId, issueId } });
      return count;
    }
    case "ENGINEERING_DECISION": {
      const { count } = await client.decisionIssueLink.deleteMany({ where: { id: rowId, issueId } });
      return count;
    }
  }
}

/**
 * Every edge on an issue, with enough of each target to display it.
 *
 * Three queries rather than one union: each relation lives in its own typed
 * table, and each target type names its heading differently (`title` for
 * requirements and decisions, `name` for design items).
 */
export async function listIssueLinks(
  issueId: string,
  client: DbClient = prisma,
): Promise<IssueLinkSummary[]> {
  const [requirements, designItems, decisions] = await Promise.all([
    client.issueRequirementLink.findMany({
      where: { issueId },
      select: { id: true, note: true, createdAt: true, requirement: { select: { id: true, identifier: true, title: true } } },
    }),
    client.issueDesignLink.findMany({
      where: { issueId },
      select: { id: true, note: true, createdAt: true, designItem: { select: { id: true, identifier: true, name: true } } },
    }),
    client.decisionIssueLink.findMany({
      where: { issueId },
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
      id: issueLinkKey("REQUIREMENT", row.id),
      relation: "REQUIREMENT" as const,
      targetId: row.requirement.id,
      identifier: row.requirement.identifier,
      title: row.requirement.title,
      note: row.note,
      createdAt: row.createdAt,
    })),
    ...designItems.map((row) => ({
      id: issueLinkKey("DESIGN_ITEM", row.id),
      relation: "DESIGN_ITEM" as const,
      targetId: row.designItem.id,
      identifier: row.designItem.identifier,
      title: row.designItem.name,
      note: row.note,
      createdAt: row.createdAt,
    })),
    ...decisions.map((row) => ({
      id: issueLinkKey("ENGINEERING_DECISION", row.id),
      relation: "ENGINEERING_DECISION" as const,
      targetId: row.engineeringDecision.id,
      identifier: row.engineeringDecision.identifier,
      title: row.engineeringDecision.title,
      note: row.note,
      createdAt: row.createdAt,
    })),
  ];
}
