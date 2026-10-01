import {
  type Requirement,
  type RequirementLinkSummary,
  type RequirementStatus,
  allowedTransitions,
  areLinksEditable,
  assignRequirementOwnerRequestSchema,
  canTransition,
  createRequirementRequestSchema,
  entityIdSchema,
  isContentEditable,
  isOwnerAssignable,
  requirementLinkRequestSchema,
  requirementStatusSchema,
  requirementUnlinkRequestSchema,
  transitionRequirementRequestSchema,
  updateRequirementRequestSchema,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import type { AuditEventSummary } from "@/server/repositories/audit-log.repository";
import * as projectArtifactsRepository from "@/server/repositories/project-artifacts.repository";
import { requireAssignableOwner } from "./authorization.service";
import {
  requireProjectApproveAccess,
  requireProjectReadAccess,
  requireProjectWriteAccess,
} from "./project-scope";
import * as requirementRepository from "@/server/repositories/requirement.repository";
import type {
  RequirementListItem,
  RequirementOwnerSummary,
} from "@/server/repositories/requirement.repository";
import { parseOrThrow } from "@/server/validation";
import { withRecordIdentifier } from "./record-identifier";

/**
 * Requirement application service.
 *
 * Everything an engineer can do to a requirement passes through here, and
 * three rules hold for all of it:
 *
 *  - **Access.** Every entry point requires a real `ProjectMembership` row
 *    (or organization `OWNER`) at the tier the action needs — read, write, or
 *    approve — never organization membership alone. A project the caller
 *    cannot read (whether it belongs to another organization or simply one
 *    they have not been added to) reads as "not found", never "forbidden":
 *    this API does not confirm the existence of a project it will not show.
 *  - **Lifecycle.** Status changes only through {@link transitionRequirementStatus},
 *    validated against the domain's transition table. A generic update can
 *    never move a requirement through its lifecycle.
 *  - **Auditability.** Each mutation writes its audit event in the same
 *    transaction, attributed to the authenticated actor.
 */

export const REQUIREMENT_ENTITY_TYPE = "Requirement";

export const REQUIREMENT_AUDIT_ACTIONS = {
  created: "requirement.created",
  updated: "requirement.updated",
  transitioned: "requirement.status_transitioned",
  ownerAssigned: "requirement.owner_assigned",
  ownerCleared: "requirement.owner_cleared",
  linkAdded: "requirement.link_added",
  linkRemoved: "requirement.link_removed",
} as const;

/** A requirement plus the parts the UI needs but the table does not hold. */
export interface RequirementDetail extends Requirement {
  owner: RequirementOwnerSummary | null;
  links: RequirementLinkSummary[];
  /** Only the transitions actually legal from the current status. */
  availableTransitions: readonly RequirementStatus[];
  editable: { content: boolean; owner: boolean; links: boolean };
  history: AuditEventSummary[];
}

/**
 * Which transitions are the domain's own "approval" moment — APPROVED and
 * BASELINED both put a requirement under configuration control, the exact
 * kind of action `ProjectRole`'s REVIEWER authority exists for. Every other
 * transition (submitting for review, marking obsolete) is ordinary
 * engineering work, gated the same as create/update.
 */
const APPROVAL_TRANSITIONS = new Set<RequirementStatus>(["APPROVED", "BASELINED"]);

async function requireRequirement(
  projectId: string,
  requirementId: unknown,
  client?: Parameters<typeof requirementRepository.findRequirementInProject>[2],
): Promise<Requirement> {
  const id = parseOrThrow(entityIdSchema, requirementId, "Invalid requirement id");
  const requirement = await requirementRepository.findRequirementInProject(projectId, id, client);

  if (!requirement) {
    throw new NotFoundError(`Requirement ${id} was not found.`);
  }
  return requirement;
}

function auditEvent(
  context: OrganizationContext,
  action: string,
  requirementId: string,
  metadata: Record<string, unknown>,
) {
  return {
    organizationId: context.organizationId,
    actorId: context.actorId,
    action,
    entityType: REQUIREMENT_ENTITY_TYPE,
    entityId: requirementId,
    metadata,
  };
}

export async function createRequirement(
  context: OrganizationContext,
  projectId: unknown,
  input: unknown,
): Promise<Requirement> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const data = parseOrThrow(createRequirementRequestSchema, input, "Invalid requirement");

  if (data.ownerId) {
    await requireAssignableOwner(context, scopedProjectId, data.ownerId);
  }

  return withRecordIdentifier(data.identifier, "requirement", scopedProjectId, (identifier) =>
    prisma.$transaction(async (tx) => {
      const requirement = await requirementRepository.createRequirement(
        {
          projectId: scopedProjectId,
          identifier,
          title: data.title,
          statement: data.statement,
          rationale: data.rationale ?? null,
          // A requirement always begins as a draft; callers cannot choose.
          status: "DRAFT",
          priority: data.priority ?? "MEDIUM",
          source: data.source ?? null,
          ownerId: data.ownerId ?? null,
        },
        tx,
      );

      await auditLogRepository.recordAuditEvent(
        auditEvent(context, REQUIREMENT_AUDIT_ACTIONS.created, requirement.id, {
          identifier: requirement.identifier,
          projectId: scopedProjectId,
        }),
        tx,
      );

      return requirement;
    }),
  );
}

export async function listRequirements(
  context: OrganizationContext,
  projectId: unknown,
  filter: { status?: unknown } = {},
): Promise<RequirementListItem[]> {
  const scopedProjectId = await requireProjectReadAccess(context, projectId);

  const status =
    filter.status === undefined || filter.status === null || filter.status === ""
      ? undefined
      : parseOrThrow(requirementStatusSchema, filter.status, "Invalid status filter");

  return requirementRepository.listRequirementsInProject(
    scopedProjectId,
    status ? { status } : {},
  );
}

/** Full detail: the requirement, its owner, links, legal transitions and history. */
export async function getRequirement(
  context: OrganizationContext,
  projectId: unknown,
  requirementId: unknown,
): Promise<RequirementDetail> {
  const scopedProjectId = await requireProjectReadAccess(context, projectId);
  const requirement = await requireRequirement(scopedProjectId, requirementId);

  const [owner, links, history] = await Promise.all([
    requirement.ownerId ? requirementRepository.findRequirementOwner(requirement.ownerId) : null,
    requirementRepository.listRequirementLinks(requirement.id),
    auditLogRepository.listAuditEventsForEntity({
      organizationId: context.organizationId,
      entityType: REQUIREMENT_ENTITY_TYPE,
      entityId: requirement.id,
    }),
  ]);

  return {
    ...requirement,
    owner,
    links,
    availableTransitions: allowedTransitions(requirement.status),
    editable: {
      content: isContentEditable(requirement.status),
      owner: isOwnerAssignable(requirement.status),
      links: areLinksEditable(requirement.status),
    },
    history,
  };
}

/**
 * Content update.
 *
 * Refuses once the requirement is APPROVED or beyond: editing the text of an
 * approved requirement would quietly invalidate the approval that was granted
 * against the old wording.
 */
export async function updateRequirement(
  context: OrganizationContext,
  projectId: unknown,
  requirementId: unknown,
  input: unknown,
): Promise<Requirement> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const data = parseOrThrow(updateRequirementRequestSchema, input, "Invalid requirement update");

  return prisma.$transaction(async (tx) => {
    const existing = await requireRequirement(scopedProjectId, requirementId, tx);

    if (!isContentEditable(existing.status)) {
      throw new ConflictError(
        `A requirement in ${existing.status} cannot be edited. Only DRAFT and IN_REVIEW requirements are editable.`,
      );
    }

    const requirement = await requirementRepository.updateRequirement(
      existing.id,
      {
        title: data.title,
        statement: data.statement,
        rationale: data.rationale,
        priority: data.priority,
        source: data.source,
      },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      auditEvent(context, REQUIREMENT_AUDIT_ACTIONS.updated, requirement.id, {
        changedFields: Object.keys(data),
      }),
      tx,
    );

    return requirement;
  });
}

/**
 * The only path by which a requirement's status changes.
 *
 * Validated against the domain transition table, so DRAFT → APPROVED and
 * anything out of OBSOLETE are rejected as conflicts rather than quietly
 * applied.
 */
export async function transitionRequirementStatus(
  context: OrganizationContext,
  projectId: unknown,
  requirementId: unknown,
  input: unknown,
): Promise<Requirement> {
  const { to, rationale } = parseOrThrow(
    transitionRequirementRequestSchema,
    input,
    "Invalid transition",
  );
  // Approving/baselining is the domain's own review authority (REVIEWER or
  // MANAGER); every other transition is ordinary engineering work (ENGINEER
  // or MANAGER) — never "any project member may transition anything".
  const scopedProjectId = APPROVAL_TRANSITIONS.has(to)
    ? await requireProjectApproveAccess(context, projectId)
    : await requireProjectWriteAccess(context, projectId);

  return prisma.$transaction(async (tx) => {
    const existing = await requireRequirement(scopedProjectId, requirementId, tx);

    if (existing.status === to) {
      throw new ConflictError(`This requirement is already ${to}.`);
    }

    if (!canTransition(existing.status, to)) {
      const legal = allowedTransitions(existing.status);
      throw new ConflictError(
        legal.length === 0
          ? `A requirement in ${existing.status} is final and cannot change status.`
          : `A requirement in ${existing.status} cannot move to ${to}. Allowed: ${legal.join(", ")}.`,
      );
    }

    const requirement = await requirementRepository.transitionStatusGuarded(
      existing.id,
      existing.status,
      to,
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      auditEvent(context, REQUIREMENT_AUDIT_ACTIONS.transitioned, requirement.id, {
        from: existing.status,
        to,
        ...(rationale ? { rationale } : {}),
      }),
      tx,
    );

    return requirement;
  });
}

/** Assigns an owner, or clears one when `ownerId` is null. */
export async function assignRequirementOwner(
  context: OrganizationContext,
  projectId: unknown,
  requirementId: unknown,
  input: unknown,
): Promise<Requirement> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const { ownerId } = parseOrThrow(
    assignRequirementOwnerRequestSchema,
    input,
    "Invalid owner assignment",
  );

  if (ownerId) {
    await requireAssignableOwner(context, scopedProjectId, ownerId);
  }

  return prisma.$transaction(async (tx) => {
    const existing = await requireRequirement(scopedProjectId, requirementId, tx);

    if (!isOwnerAssignable(existing.status)) {
      throw new ConflictError(
        `A requirement in ${existing.status} is read-only and its owner cannot be changed.`,
      );
    }

    const requirement = await requirementRepository.updateRequirement(
      existing.id,
      { ownerId },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      auditEvent(
        context,
        ownerId ? REQUIREMENT_AUDIT_ACTIONS.ownerAssigned : REQUIREMENT_AUDIT_ACTIONS.ownerCleared,
        requirement.id,
        { previousOwnerId: existing.ownerId, ownerId },
      ),
      tx,
    );

    return requirement;
  });
}

export async function listRequirementLinks(
  context: OrganizationContext,
  projectId: unknown,
  requirementId: unknown,
): Promise<RequirementLinkSummary[]> {
  const scopedProjectId = await requireProjectReadAccess(context, projectId);
  const requirement = await requireRequirement(scopedProjectId, requirementId);
  return requirementRepository.listRequirementLinks(requirement.id);
}

/**
 * Adds one trace edge.
 *
 * The target must exist *in the same project*, which is checked against the
 * target's own table with `projectId` in the query — so a link to another
 * project's artifact (and therefore any other organization's) is rejected
 * rather than silently written.
 */
export async function linkRequirement(
  context: OrganizationContext,
  projectId: unknown,
  requirementId: unknown,
  input: unknown,
): Promise<RequirementLinkSummary[]> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const request = parseOrThrow(requirementLinkRequestSchema, input, "Invalid traceability link");

  return prisma.$transaction(async (tx) => {
    const requirement = await requireRequirement(scopedProjectId, requirementId, tx);

    if (!areLinksEditable(requirement.status)) {
      throw new ConflictError(
        `A requirement in ${requirement.status} is read-only and its traceability cannot be changed.`,
      );
    }

    const targetInProject = await requirementRepository.linkTargetExistsInProject(
      request.relation,
      request.targetId,
      scopedProjectId,
      tx,
    );

    if (!targetInProject) {
      throw new ValidationError(
        "That target does not exist in this project. Requirements can only be linked to artifacts in the same project.",
      );
    }

    await requirementRepository.createRequirementLink(
      {
        requirementId: requirement.id,
        relation: request.relation,
        targetId: request.targetId,
        linkType: "linkType" in request ? request.linkType : undefined,
        note: "note" in request ? request.note : undefined,
        createdById: context.actorId,
      },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      auditEvent(context, REQUIREMENT_AUDIT_ACTIONS.linkAdded, requirement.id, {
        relation: request.relation,
        targetId: request.targetId,
        ...("linkType" in request && request.linkType ? { linkType: request.linkType } : {}),
      }),
      tx,
    );

    return requirementRepository.listRequirementLinks(requirement.id, tx);
  });
}

export async function unlinkRequirement(
  context: OrganizationContext,
  projectId: unknown,
  requirementId: unknown,
  input: unknown,
): Promise<RequirementLinkSummary[]> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const request = parseOrThrow(requirementUnlinkRequestSchema, input, "Invalid unlink request");

  return prisma.$transaction(async (tx) => {
    const requirement = await requireRequirement(scopedProjectId, requirementId, tx);

    if (!areLinksEditable(requirement.status)) {
      throw new ConflictError(
        `A requirement in ${requirement.status} is read-only and its traceability cannot be changed.`,
      );
    }

    const removed = await requirementRepository.deleteRequirementLink(
      {
        requirementId: requirement.id,
        relation: request.relation,
        targetId: request.targetId,
        linkType: request.linkType,
      },
      tx,
    );

    if (removed === 0) {
      throw new NotFoundError("That traceability link does not exist.");
    }

    await auditLogRepository.recordAuditEvent(
      auditEvent(context, REQUIREMENT_AUDIT_ACTIONS.linkRemoved, requirement.id, {
        relation: request.relation,
        targetId: request.targetId,
      }),
      tx,
    );

    return requirementRepository.listRequirementLinks(requirement.id, tx);
  });
}

/** Artifacts in the project that a requirement may be linked to — powers the selectors. */
export async function listLinkTargets(
  context: OrganizationContext,
  projectId: unknown,
): Promise<projectArtifactsRepository.LinkTargetOptions> {
  const scopedProjectId = await requireProjectReadAccess(context, projectId);
  return projectArtifactsRepository.listLinkTargets(scopedProjectId);
}
