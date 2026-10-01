import {
  type ChangeRequest,
  type ChangeRequestStatus,
  type DeclaredImpact,
  allowedChangeRequestTransitions,
  areDeclaredImpactsEditable,
  canTransitionChangeRequest,
  changeRequestStatusSchema,
  createChangeRequestRequestSchema,
  declareImpactRequestSchema,
  entityIdSchema,
  isChangeDefinitionEditable,
  transitionChangeRequestRequestSchema,
  updateChangeRequestRequestSchema,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import type { AuditEventSummary } from "@/server/repositories/audit-log.repository";
import * as changeRepository from "@/server/repositories/change-request.repository";
import type {
  ChangeRequestListItem,
  ChangeRequesterSummary,
} from "@/server/repositories/change-request.repository";
import * as projectArtifactsRepository from "@/server/repositories/project-artifacts.repository";
import type { ChangeImpactTargetOptions } from "@/server/repositories/project-artifacts.repository";
import { parseOrThrow } from "@/server/validation";
import {
  artifactAuditEvent,
  requireProjectInOrganization,
  requireProjectApproveAccess,
  requireProjectWriteAccess,
} from "./project-scope";
import { withRecordIdentifier } from "./record-identifier";

/** APPROVED and REJECTED are the change's disposition — the decision a reviewer, not any author, makes. */
const APPROVAL_TRANSITIONS = new Set<ChangeRequestStatus>(["APPROVED", "REJECTED"]);

/**
 * Change request application service.
 *
 * A change request is the engineering event that says some part of the
 * product's basis is proposed to alter. This service owns four guarantees:
 *
 *  - **Tenancy.** The organization comes from the session; the project must
 *    belong to it. A change outside the caller's tenancy reads as "not found",
 *    never as "forbidden".
 *  - **Requester identity.** `requestedById` is taken from the authenticated
 *    session and from nowhere else. No HTTP contract accepts it, so a client
 *    cannot raise a change in someone else's name.
 *  - **Lifecycle.** Status changes only through {@link transitionChangeRequest}.
 *    The update contract has no status field, so an ordinary PATCH cannot move
 *    a change towards approval.
 *  - **Auditability.** Every mutation writes its audit event in the same
 *    transaction, attributed to the authenticated actor.
 *
 * **Declared impact only.** Everything here records what an engineer asserted a
 * change affects. Nothing traverses the graph and nothing computes an affected
 * set. That is deliberate: the declaration is evidence of what a person
 * believed, and a later impact engine has to be able to compare its own
 * derivation against it. Presenting a computed number here — a blast radius, a
 * count, a score — would destroy that comparison and assert knowledge the
 * system does not have.
 */

export const CHANGE_ENTITY_TYPE = "ChangeRequest";

export const CHANGE_AUDIT_ACTIONS = {
  created: "change.created",
  updated: "change.updated",
  transitioned: "change.status_transitioned",
  impactDeclared: "change.declared_impact_added",
  impactWithdrawn: "change.declared_impact_removed",
} as const;

/** The whole change, as the detail page needs it. */
export interface ChangeRequestDetail extends ChangeRequest {
  requestedBy: ChangeRequesterSummary | null;
  declaredImpacts: DeclaredImpact[];
  /** Only the transitions actually legal from the current status. */
  availableTransitions: readonly ChangeRequestStatus[];
  editable: { definition: boolean; declaredImpacts: boolean };
  history: AuditEventSummary[];
}

async function requireChangeRequest(
  projectId: string,
  changeId: unknown,
  client?: Parameters<typeof changeRepository.findChangeRequestInProject>[2],
): Promise<ChangeRequest> {
  const id = parseOrThrow(entityIdSchema, changeId, "Invalid change request id");
  const change = await changeRepository.findChangeRequestInProject(projectId, id, client);

  if (!change) {
    throw new NotFoundError(`Change request ${id} was not found.`);
  }
  return change;
}

function audit(
  context: OrganizationContext,
  action: string,
  changeId: string,
  metadata: Record<string, unknown>,
) {
  return artifactAuditEvent(context, action, CHANGE_ENTITY_TYPE, changeId, metadata);
}

// --- Change request ---------------------------------------------------------

/**
 * Raises a change in DRAFT.
 *
 * The requester is `context.actorId` — the authenticated session's user, whose
 * organization *is* `context.organizationId`. Membership therefore needs no
 * separate check: the session binds the two, and the project has already been
 * proved to belong to that same organization.
 */
export async function createChangeRequest(
  context: OrganizationContext,
  projectId: unknown,
  input: unknown,
): Promise<ChangeRequest> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const data = parseOrThrow(createChangeRequestRequestSchema, input, "Invalid change request");

  // The schema restricts deletion of a requester for a reason: a change must
  // stay attributable. A context with no actor is a system context, which
  // cannot raise one.
  const requestedById = context.actorId;
  if (!requestedById) {
    throw new ValidationError("A change request must record who requested it.");
  }

  return withRecordIdentifier(data.identifier, "changeRequest", scopedProjectId, (identifier) =>
    prisma.$transaction(async (tx) => {
      const change = await changeRepository.createChangeRequest(
        {
          projectId: scopedProjectId,
          identifier,
          title: data.title,
          description: data.description,
          reason: data.reason,
          status: "DRAFT",
          requestedById,
        },
        tx,
      );

      await auditLogRepository.recordAuditEvent(
        audit(context, CHANGE_AUDIT_ACTIONS.created, change.id, {
          identifier: change.identifier,
          projectId: scopedProjectId,
        }),
        tx,
      );

      return change;
    }),
  );
}

export async function listChangeRequests(
  context: OrganizationContext,
  projectId: unknown,
  filter: { status?: unknown } = {},
): Promise<ChangeRequestListItem[]> {
  const scopedProjectId = await requireProjectInOrganization(context, projectId);

  const status =
    filter.status === undefined || filter.status === null || filter.status === ""
      ? undefined
      : parseOrThrow(changeRequestStatusSchema, filter.status, "Invalid status filter");

  return changeRepository.listChangeRequestsInProject({
    projectId: scopedProjectId,
    ...(status ? { status } : {}),
  });
}

export async function getChangeRequest(
  context: OrganizationContext,
  projectId: unknown,
  changeId: unknown,
): Promise<ChangeRequestDetail> {
  const scopedProjectId = await requireProjectInOrganization(context, projectId);
  const change = await requireChangeRequest(scopedProjectId, changeId);

  const [requestedBy, declaredImpacts, history] = await Promise.all([
    changeRepository.findChangeRequester(change.requestedById),
    changeRepository.listDeclaredImpacts(change.id),
    auditLogRepository.listAuditEventsForEntity({
      organizationId: context.organizationId,
      entityType: CHANGE_ENTITY_TYPE,
      entityId: change.id,
    }),
  ]);

  return {
    ...change,
    requestedBy,
    declaredImpacts,
    availableTransitions: allowedChangeRequestTransitions(change.status),
    editable: {
      definition: isChangeDefinitionEditable(change.status),
      declaredImpacts: areDeclaredImpactsEditable(change.status),
    },
    history,
  };
}

/**
 * Content update. Refused from review onward: a change already in front of a
 * reviewer must not silently become a different change.
 */
export async function updateChangeRequest(
  context: OrganizationContext,
  projectId: unknown,
  changeId: unknown,
  input: unknown,
): Promise<ChangeRequest> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const data = parseOrThrow(
    updateChangeRequestRequestSchema,
    input,
    "Invalid change request update",
  );

  return prisma.$transaction(async (tx) => {
    const existing = await requireChangeRequest(scopedProjectId, changeId, tx);

    if (!isChangeDefinitionEditable(existing.status)) {
      throw new ConflictError(
        `A change request in ${existing.status} can no longer be edited. ` +
          "Raise a new change request instead.",
      );
    }

    const change = await changeRepository.updateChangeRequest(existing.id, data, tx);

    await auditLogRepository.recordAuditEvent(
      audit(context, CHANGE_AUDIT_ACTIONS.updated, change.id, {
        changedFields: Object.keys(data),
      }),
      tx,
    );

    return change;
  });
}

/** The only path by which a change request's status changes. */
export async function transitionChangeRequest(
  context: OrganizationContext,
  projectId: unknown,
  changeId: unknown,
  input: unknown,
): Promise<ChangeRequest> {
  const { to, rationale } = parseOrThrow(
    transitionChangeRequestRequestSchema,
    input,
    "Invalid transition",
  );
  const scopedProjectId = APPROVAL_TRANSITIONS.has(to)
    ? await requireProjectApproveAccess(context, projectId)
    : await requireProjectWriteAccess(context, projectId);

  return prisma.$transaction(async (tx) => {
    const existing = await requireChangeRequest(scopedProjectId, changeId, tx);

    if (existing.status === to) {
      throw new ConflictError(`This change request is already ${to}.`);
    }

    if (!canTransitionChangeRequest(existing.status, to)) {
      const legal = allowedChangeRequestTransitions(existing.status);
      throw new ConflictError(
        legal.length === 0
          ? `A change request in ${existing.status} is final and cannot change status.`
          : `A change request in ${existing.status} cannot move to ${to}. ` +
            `Allowed: ${legal.join(", ")}.`,
      );
    }

    const change = await changeRepository.transitionStatusGuarded(existing.id, existing.status, to, tx);

    await auditLogRepository.recordAuditEvent(
      audit(context, CHANGE_AUDIT_ACTIONS.transitioned, change.id, {
        from: existing.status,
        to,
        rationale: rationale ?? null,
      }),
      tx,
    );

    return change;
  });
}

// --- Declared impacts -------------------------------------------------------

export async function listDeclaredImpacts(
  context: OrganizationContext,
  projectId: unknown,
  changeId: unknown,
): Promise<DeclaredImpact[]> {
  const scopedProjectId = await requireProjectInOrganization(context, projectId);
  const change = await requireChangeRequest(scopedProjectId, changeId);

  return changeRepository.listDeclaredImpacts(change.id);
}

/**
 * Records that the requester believes this change affects an artifact.
 *
 * The target is validated against the change's *own* project before anything is
 * written, so a caller cannot declare an impact on an artifact belonging to
 * another project — and therefore cannot reach another organization's data
 * through a change they legitimately own.
 */
export async function addDeclaredImpact(
  context: OrganizationContext,
  projectId: unknown,
  changeId: unknown,
  input: unknown,
): Promise<DeclaredImpact[]> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const data = parseOrThrow(declareImpactRequestSchema, input, "Invalid declared impact");

  return prisma.$transaction(async (tx) => {
    const change = await requireChangeRequest(scopedProjectId, changeId, tx);

    if (!areDeclaredImpactsEditable(change.status)) {
      throw new ConflictError(
        `The declared scope of a change request in ${change.status} is fixed.`,
      );
    }

    const targetExists = await changeRepository.changeImpactTargetExistsInProject(
      data.target.type,
      data.target.id,
      scopedProjectId,
      tx,
    );
    if (!targetExists) {
      // Deliberately the same message whether the artifact is missing or lives
      // in another project: the API does not confirm the existence of things
      // outside the caller's project.
      throw new ValidationError("That artifact was not found in this project.");
    }

    const impactId = await changeRepository.createDeclaredImpact(
      {
        changeRequestId: change.id,
        type: data.target.type,
        targetId: data.target.id,
        note: data.note ?? null,
        createdById: context.actorId,
      },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      audit(context, CHANGE_AUDIT_ACTIONS.impactDeclared, change.id, {
        impactId,
        targetType: data.target.type,
        targetId: data.target.id,
      }),
      tx,
    );

    return changeRepository.listDeclaredImpacts(change.id, tx);
  });
}

/**
 * Withdraws a declared impact.
 *
 * The impact is looked up through its change request, so an id belonging to a
 * different change cannot be deleted by guessing it.
 */
export async function removeDeclaredImpact(
  context: OrganizationContext,
  projectId: unknown,
  changeId: unknown,
  impactId: unknown,
): Promise<DeclaredImpact[]> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const id = parseOrThrow(entityIdSchema, impactId, "Invalid declared impact id");

  return prisma.$transaction(async (tx) => {
    const change = await requireChangeRequest(scopedProjectId, changeId, tx);

    if (!areDeclaredImpactsEditable(change.status)) {
      throw new ConflictError(
        `The declared scope of a change request in ${change.status} is fixed.`,
      );
    }

    const existing = await changeRepository.findDeclaredImpactForChange(change.id, id, tx);
    if (!existing) {
      throw new NotFoundError(`Declared impact ${id} was not found on this change request.`);
    }

    await changeRepository.deleteDeclaredImpact(existing.id, tx);

    await auditLogRepository.recordAuditEvent(
      audit(context, CHANGE_AUDIT_ACTIONS.impactWithdrawn, change.id, { impactId: existing.id }),
      tx,
    );

    return changeRepository.listDeclaredImpacts(change.id, tx);
  });
}

/** Everything in the project a change may declare an impact on. */
export async function listChangeImpactTargets(
  context: OrganizationContext,
  projectId: unknown,
): Promise<ChangeImpactTargetOptions> {
  const scopedProjectId = await requireProjectInOrganization(context, projectId);
  return projectArtifactsRepository.listChangeImpactTargets(scopedProjectId);
}
