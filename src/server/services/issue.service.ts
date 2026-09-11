import {
  type Issue,
  type IssueLinkSummary,
  type IssueStatus,
  allowedIssueTransitions,
  areIssueLinksEditable,
  assignIssueOwnerRequestSchema,
  canTransitionIssue,
  createIssueRequestSchema,
  entityIdSchema,
  isIssueContentEditable,
  isIssueOwnerAssignable,
  issueLinkRequestSchema,
  issueSeveritySchema,
  issueStatusSchema,
  parseIssueLinkKey,
  transitionIssueRequestSchema,
  updateIssueRequestSchema,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import type { AuditEventSummary } from "@/server/repositories/audit-log.repository";
import * as issueRepository from "@/server/repositories/issue.repository";
import type { IssueListItem, IssueOwnerSummary } from "@/server/repositories/issue.repository";
import * as projectArtifactsRepository from "@/server/repositories/project-artifacts.repository";
import { requireProjectInOrganization } from "./project-scope";
import * as userRepository from "@/server/repositories/user.repository";
import { parseOrThrow } from "@/server/validation";

/**
 * Issue application service.
 *
 * Everything an engineer can do to an issue passes through here, and three
 * rules hold for all of it:
 *
 *  - **Tenancy.** The organization comes from the session and the project must
 *    belong to it. An issue in someone else's project reads as "not found",
 *    never "forbidden".
 *  - **Lifecycle.** Status changes only through {@link transitionIssue},
 *    validated against the domain's transition table. A generic update can
 *    never move an issue through its lifecycle.
 *  - **Auditability.** Each mutation writes its audit event in the same
 *    transaction, attributed to the authenticated actor.
 *
 * `severity` is recorded exactly as a person sets it. Nothing here ranks
 * issues against each other or derives severity from anything.
 */

export const ISSUE_ENTITY_TYPE = "Issue";

export const ISSUE_AUDIT_ACTIONS = {
  created: "issue.created",
  updated: "issue.updated",
  transitioned: "issue.status_transitioned",
  ownerAssigned: "issue.owner_assigned",
  ownerCleared: "issue.owner_cleared",
  linkAdded: "issue.link_added",
  linkRemoved: "issue.link_removed",
} as const;

/** An issue plus the parts the UI needs but the table does not hold. */
export interface IssueDetail extends Issue {
  owner: IssueOwnerSummary | null;
  links: IssueLinkSummary[];
  /** Only the transitions actually legal from the current status. */
  availableTransitions: readonly IssueStatus[];
  editable: { content: boolean; owner: boolean; links: boolean };
  history: AuditEventSummary[];
}

const requireProject = requireProjectInOrganization;

async function requireIssue(
  projectId: string,
  issueId: unknown,
  client?: Parameters<typeof issueRepository.findIssueInProject>[2],
): Promise<Issue> {
  const id = parseOrThrow(entityIdSchema, issueId, "Invalid issue id");
  const issue = await issueRepository.findIssueInProject(projectId, id, client);

  if (!issue) {
    throw new NotFoundError(`Issue ${id} was not found.`);
  }
  return issue;
}

/** Owners must be real members of the caller's organization — never an arbitrary id. */
async function requireOrganizationMember(context: OrganizationContext, ownerId: string): Promise<void> {
  if (!(await userRepository.isMemberOfOrganization(ownerId, context.organizationId))) {
    throw new ValidationError("That user is not a member of this organization.");
  }
}

function auditEvent(context: OrganizationContext, action: string, issueId: string, metadata: Record<string, unknown>) {
  return {
    organizationId: context.organizationId,
    actorId: context.actorId,
    action,
    entityType: ISSUE_ENTITY_TYPE,
    entityId: issueId,
    metadata,
  };
}

export async function createIssue(context: OrganizationContext, projectId: unknown, input: unknown): Promise<Issue> {
  const scopedProjectId = await requireProject(context, projectId);
  const data = parseOrThrow(createIssueRequestSchema, input, "Invalid issue");

  if (data.ownerId) {
    await requireOrganizationMember(context, data.ownerId);
  }

  return prisma.$transaction(async (tx) => {
    const issue = await issueRepository.createIssue(
      {
        projectId: scopedProjectId,
        identifier: data.identifier,
        title: data.title,
        description: data.description,
        severity: data.severity,
        // An issue always begins open; callers cannot choose.
        status: "OPEN",
        ownerId: data.ownerId ?? null,
      },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      auditEvent(context, ISSUE_AUDIT_ACTIONS.created, issue.id, {
        identifier: issue.identifier,
        projectId: scopedProjectId,
      }),
      tx,
    );

    return issue;
  });
}

export async function listIssues(
  context: OrganizationContext,
  projectId: unknown,
  filter: { status?: unknown; severity?: unknown } = {},
): Promise<IssueListItem[]> {
  const scopedProjectId = await requireProject(context, projectId);

  const status =
    filter.status === undefined || filter.status === null || filter.status === ""
      ? undefined
      : parseOrThrow(issueStatusSchema, filter.status, "Invalid status filter");
  const severity =
    filter.severity === undefined || filter.severity === null || filter.severity === ""
      ? undefined
      : parseOrThrow(issueSeveritySchema, filter.severity, "Invalid severity filter");

  return issueRepository.listIssuesInProject(scopedProjectId, {
    ...(status ? { status } : {}),
    ...(severity ? { severity } : {}),
  });
}

/** Full detail: the issue, its owner, links, legal transitions and history. */
export async function getIssue(
  context: OrganizationContext,
  projectId: unknown,
  issueId: unknown,
): Promise<IssueDetail> {
  const scopedProjectId = await requireProject(context, projectId);
  const issue = await requireIssue(scopedProjectId, issueId);

  const [owner, links, history] = await Promise.all([
    issue.ownerId ? issueRepository.findIssueOwner(issue.ownerId) : null,
    issueRepository.listIssueLinks(issue.id),
    auditLogRepository.listAuditEventsForEntity({
      organizationId: context.organizationId,
      entityType: ISSUE_ENTITY_TYPE,
      entityId: issue.id,
    }),
  ]);

  return {
    ...issue,
    owner,
    links,
    availableTransitions: allowedIssueTransitions(issue.status),
    editable: {
      content: isIssueContentEditable(issue.status),
      owner: isIssueOwnerAssignable(issue.status),
      links: areIssueLinksEditable(issue.status),
    },
    history,
  };
}

/** Content update. Refuses once the issue is resolved or closed. */
export async function updateIssue(
  context: OrganizationContext,
  projectId: unknown,
  issueId: unknown,
  input: unknown,
): Promise<Issue> {
  const scopedProjectId = await requireProject(context, projectId);
  const data = parseOrThrow(updateIssueRequestSchema, input, "Invalid issue update");

  return prisma.$transaction(async (tx) => {
    const existing = await requireIssue(scopedProjectId, issueId, tx);

    if (!isIssueContentEditable(existing.status)) {
      throw new ConflictError(
        `An issue that is ${existing.status} cannot be edited. Only OPEN and IN_PROGRESS issues are editable.`,
      );
    }

    const issue = await issueRepository.updateIssue(
      existing.id,
      { title: data.title, description: data.description, severity: data.severity },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      auditEvent(context, ISSUE_AUDIT_ACTIONS.updated, issue.id, { changedFields: Object.keys(data) }),
      tx,
    );

    return issue;
  });
}

/** The only path by which an issue's status changes. */
export async function transitionIssue(
  context: OrganizationContext,
  projectId: unknown,
  issueId: unknown,
  input: unknown,
): Promise<Issue> {
  const scopedProjectId = await requireProject(context, projectId);
  const { to, rationale } = parseOrThrow(transitionIssueRequestSchema, input, "Invalid transition");

  return prisma.$transaction(async (tx) => {
    const existing = await requireIssue(scopedProjectId, issueId, tx);

    if (existing.status === to) {
      throw new ConflictError(`This issue is already ${to}.`);
    }

    if (!canTransitionIssue(existing.status, to)) {
      const legal = allowedIssueTransitions(existing.status);
      throw new ConflictError(
        legal.length === 0
          ? `An issue that is ${existing.status} is final and cannot change status.`
          : `An issue that is ${existing.status} cannot move to ${to}. Allowed: ${legal.join(", ")}.`,
      );
    }

    const issue = await issueRepository.updateIssue(existing.id, { status: to }, tx);

    await auditLogRepository.recordAuditEvent(
      auditEvent(context, ISSUE_AUDIT_ACTIONS.transitioned, issue.id, {
        from: existing.status,
        to,
        ...(rationale ? { rationale } : {}),
      }),
      tx,
    );

    return issue;
  });
}

/** Assigns an owner, or clears one when `ownerId` is null. */
export async function assignIssueOwner(
  context: OrganizationContext,
  projectId: unknown,
  issueId: unknown,
  input: unknown,
): Promise<Issue> {
  const scopedProjectId = await requireProject(context, projectId);
  const { ownerId } = parseOrThrow(assignIssueOwnerRequestSchema, input, "Invalid owner assignment");

  if (ownerId) {
    await requireOrganizationMember(context, ownerId);
  }

  return prisma.$transaction(async (tx) => {
    const existing = await requireIssue(scopedProjectId, issueId, tx);

    if (!isIssueOwnerAssignable(existing.status)) {
      throw new ConflictError(`An issue that is ${existing.status} is read-only and its owner cannot be changed.`);
    }

    const issue = await issueRepository.updateIssue(existing.id, { ownerId }, tx);

    await auditLogRepository.recordAuditEvent(
      auditEvent(context, ownerId ? ISSUE_AUDIT_ACTIONS.ownerAssigned : ISSUE_AUDIT_ACTIONS.ownerCleared, issue.id, {
        previousOwnerId: existing.ownerId,
        ownerId,
      }),
      tx,
    );

    return issue;
  });
}

export async function listIssueLinks(
  context: OrganizationContext,
  projectId: unknown,
  issueId: unknown,
): Promise<IssueLinkSummary[]> {
  const scopedProjectId = await requireProject(context, projectId);
  const issue = await requireIssue(scopedProjectId, issueId);
  return issueRepository.listIssueLinks(issue.id);
}

/**
 * Adds one trace edge.
 *
 * The target must exist *in the same project*, which is checked against the
 * target's own table with `projectId` in the query — so a link to another
 * project's artifact (and therefore any other organization's) is rejected
 * rather than silently written.
 */
export async function linkIssue(
  context: OrganizationContext,
  projectId: unknown,
  issueId: unknown,
  input: unknown,
): Promise<IssueLinkSummary> {
  const scopedProjectId = await requireProject(context, projectId);
  const request = parseOrThrow(issueLinkRequestSchema, input, "Invalid traceability link");

  return prisma.$transaction(async (tx) => {
    const issue = await requireIssue(scopedProjectId, issueId, tx);

    if (!areIssueLinksEditable(issue.status)) {
      throw new ConflictError(`An issue that is ${issue.status} is read-only and its traceability cannot be changed.`);
    }

    const targetInProject = await issueRepository.issueLinkTargetExistsInProject(
      request.relation,
      request.targetId,
      scopedProjectId,
      tx,
    );
    if (!targetInProject) {
      throw new ValidationError("That target does not exist in this project. Issues can only be linked to artifacts in the same project.");
    }

    const already = await issueRepository.issueLinkExists(issue.id, request.relation, request.targetId, tx);
    if (already) {
      throw new ValidationError("That link already exists on this issue.");
    }

    await issueRepository.createIssueLink(
      { issueId: issue.id, relation: request.relation, targetId: request.targetId, note: request.note ?? null, createdById: context.actorId },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      auditEvent(context, ISSUE_AUDIT_ACTIONS.linkAdded, issue.id, { relation: request.relation, targetId: request.targetId }),
      tx,
    );

    const links = await issueRepository.listIssueLinks(issue.id, tx);
    const created = links.find((link) => link.relation === request.relation && link.targetId === request.targetId);
    if (!created) {
      throw new ValidationError("The link could not be read back after creation.");
    }
    return created;
  });
}

export async function unlinkIssue(
  context: OrganizationContext,
  projectId: unknown,
  issueId: unknown,
  linkId: unknown,
): Promise<void> {
  const scopedProjectId = await requireProject(context, projectId);
  const key = typeof linkId === "string" ? parseIssueLinkKey(linkId) : null;
  if (!key) {
    throw new ValidationError("Invalid issue link id.");
  }

  await prisma.$transaction(async (tx) => {
    const issue = await requireIssue(scopedProjectId, issueId, tx);

    if (!areIssueLinksEditable(issue.status)) {
      throw new ConflictError(`An issue that is ${issue.status} is read-only and its traceability cannot be changed.`);
    }

    const removed = await issueRepository.deleteIssueLink(issue.id, key.relation, key.rowId, tx);
    if (removed === 0) {
      throw new NotFoundError("That traceability link does not exist.");
    }

    await auditLogRepository.recordAuditEvent(
      auditEvent(context, ISSUE_AUDIT_ACTIONS.linkRemoved, issue.id, { relation: key.relation }),
      tx,
    );
  });
}

/** Artifacts in the project that an issue may be linked to — powers the selectors. */
export async function listLinkTargets(
  context: OrganizationContext,
  projectId: unknown,
): Promise<projectArtifactsRepository.IssueLinkTargetOptions> {
  const scopedProjectId = await requireProject(context, projectId);
  return projectArtifactsRepository.listIssueLinkTargets(scopedProjectId);
}
