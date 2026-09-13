import {
  type VerificationActivity,
  allowedVerificationTransitions,
  assignVerificationOwnerRequestSchema,
  canTransitionVerification,
  createVerificationActivityRequestSchema,
  entityIdSchema,
  isTerminalVerificationStatus,
  isVerificationEditable,
  transitionVerificationRequestSchema,
  updateVerificationActivityRequestSchema,
  verificationEvidenceLinkRequestSchema,
  verificationEvidenceUnlinkRequestSchema,
  verificationStatusSchema,
} from "@/domain";
import type {
  VerificationReadinessScope,
  VerificationReadinessStatus,
  VerificationStatus,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import type { AuditEventSummary } from "@/server/repositories/audit-log.repository";
import type { OwnerSummary } from "@/server/repositories/design-item.repository";
import type { LinkedRequirementSummary } from "@/server/repositories/stakeholder-need.repository";
import * as verificationRepository from "@/server/repositories/verification-activity.repository";
import type {
  LinkedEvidenceSummary,
  VerificationActivityWithOwner,
} from "@/server/repositories/verification-activity.repository";
import * as readinessRepository from "@/server/repositories/verification-readiness.repository";
import { parseOrThrow } from "@/server/validation";
import { requireAssignableOwner } from "./authorization.service";
import {
  artifactAuditEvent,
  requireProjectInOrganization,
  requireProjectWriteAccess,
} from "./project-scope";

/**
 * Verification activity application service.
 *
 * Records what verification is planned and how it turned out. The lifecycle
 * is the substantive rule here: an outcome is a statement about one
 * execution, so PASSED, FAILED and WAIVED are terminal and the transition
 * that reaches one stamps `completedDate`. Re-verifying means a new activity,
 * not editing an old verdict.
 */

export const VERIFICATION_ENTITY_TYPE = "VerificationActivity";

export const VERIFICATION_AUDIT_ACTIONS = {
  created: "verification_activity.created",
  updated: "verification_activity.updated",
  transitioned: "verification_activity.status_transitioned",
  ownerAssigned: "verification_activity.owner_assigned",
  ownerCleared: "verification_activity.owner_cleared",
  evidenceLinked: "verification_activity.evidence_linked",
  evidenceUnlinked: "verification_activity.evidence_unlinked",
} as const;

export interface VerificationActivityDetail extends VerificationActivity {
  owner: OwnerSummary | null;
  requirements: LinkedRequirementSummary[];
  /** Evidence already attached — a real evidence record per row, real records now that the evidence module exists. */
  evidence: LinkedEvidenceSummary[];
  availableTransitions: readonly VerificationStatus[];
  editable: boolean;
  history: AuditEventSummary[];
}

async function requireActivity(
  projectId: string,
  activityId: unknown,
  client?: Parameters<typeof verificationRepository.findVerificationActivityInProject>[2],
): Promise<VerificationActivity> {
  const id = parseOrThrow(entityIdSchema, activityId, "Invalid verification activity id");
  const activity = await verificationRepository.findVerificationActivityInProject(
    projectId,
    id,
    client,
  );

  if (!activity) {
    throw new NotFoundError(`Verification activity ${id} was not found.`);
  }
  return activity;
}

export async function createVerificationActivity(
  context: OrganizationContext,
  projectId: unknown,
  input: unknown,
): Promise<VerificationActivity> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const data = parseOrThrow(
    createVerificationActivityRequestSchema,
    input,
    "Invalid verification activity",
  );

  if (data.ownerId) {
    await requireAssignableOwner(context, scopedProjectId, data.ownerId);
  }

  return prisma.$transaction(async (tx) => {
    const activity = await verificationRepository.createVerificationActivity(
      {
        projectId: scopedProjectId,
        identifier: data.identifier,
        title: data.title,
        description: data.description ?? null,
        method: data.method,
        plannedDate: data.plannedDate ?? null,
        ownerId: data.ownerId ?? null,
        // Status is not accepted from callers: an activity always starts PLANNED.
      },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      artifactAuditEvent(
        context,
        VERIFICATION_AUDIT_ACTIONS.created,
        VERIFICATION_ENTITY_TYPE,
        activity.id,
        { identifier: activity.identifier, method: activity.method, projectId: scopedProjectId },
      ),
      tx,
    );

    return activity;
  });
}

/**
 * One row of the verification list.
 *
 * `lastReadiness` is the most recent assessment *as it was recorded*, and
 * deliberately carries no freshness verdict. Deciding whether an assessment
 * still holds means re-resolving that activity's engineering basis, which is
 * per-row work this list must not do — so the interface presents these as
 * "last recorded" and the activity's own page is where currency is established.
 * Null means nobody has ever evaluated it, which is not the same as a verdict.
 */
export interface VerificationActivityListItem extends VerificationActivityWithOwner {
  lastReadiness: {
    id: string;
    status: VerificationReadinessStatus;
    scope: VerificationReadinessScope;
    readinessVersion: string;
    evaluatedAt: Date;
    blockingCount: number;
  } | null;
}

export async function listVerificationActivities(
  context: OrganizationContext,
  projectId: unknown,
  filter: { status?: unknown } = {},
): Promise<VerificationActivityListItem[]> {
  const scopedProjectId = await requireProjectInOrganization(context, projectId);

  const status =
    filter.status === undefined || filter.status === null || filter.status === ""
      ? undefined
      : parseOrThrow(verificationStatusSchema, filter.status, "Invalid status filter");

  const activities = await verificationRepository.listVerificationActivitiesInProject(
    scopedProjectId,
    status ? { status } : {},
  );

  // One batched read for the whole page rather than one per row.
  const latest = await readinessRepository.findLatestForActivities(
    scopedProjectId,
    activities.map((activity) => activity.id),
  );

  return activities.map((activity) => {
    const assessment = latest.get(activity.id);
    return {
      ...activity,
      lastReadiness: assessment
        ? {
            id: assessment.id,
            status: assessment.status,
            scope: assessment.scope,
            readinessVersion: assessment.readinessVersion,
            evaluatedAt: assessment.evaluatedAt,
            blockingCount: assessment.summary.blocking,
          }
        : null,
    };
  });
}

export async function getVerificationActivity(
  context: OrganizationContext,
  projectId: unknown,
  activityId: unknown,
): Promise<VerificationActivityDetail> {
  const scopedProjectId = await requireProjectInOrganization(context, projectId);
  const activity = await requireActivity(scopedProjectId, activityId);

  const [owner, requirements, evidence, history] = await Promise.all([
    activity.ownerId
      ? verificationRepository.findVerificationActivityOwner(activity.ownerId)
      : null,
    verificationRepository.listRequirementsForVerification(scopedProjectId, activity.id),
    verificationRepository.listEvidenceForVerification(activity.id),
    auditLogRepository.listAuditEventsForEntity({
      organizationId: context.organizationId,
      entityType: VERIFICATION_ENTITY_TYPE,
      entityId: activity.id,
    }),
  ]);

  return {
    ...activity,
    owner,
    requirements,
    evidence,
    availableTransitions: allowedVerificationTransitions(activity.status),
    editable: isVerificationEditable(activity.status),
    history,
  };
}

/** Content update. Refused once the activity has concluded. */
export async function updateVerificationActivity(
  context: OrganizationContext,
  projectId: unknown,
  activityId: unknown,
  input: unknown,
): Promise<VerificationActivity> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const data = parseOrThrow(
    updateVerificationActivityRequestSchema,
    input,
    "Invalid verification activity update",
  );

  return prisma.$transaction(async (tx) => {
    const existing = await requireActivity(scopedProjectId, activityId, tx);

    if (!isVerificationEditable(existing.status)) {
      throw new ConflictError(
        `This activity is ${existing.status} and can no longer be edited. Plan a new activity to re-verify.`,
      );
    }

    const activity = await verificationRepository.updateVerificationActivity(
      existing.id,
      data,
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      artifactAuditEvent(
        context,
        VERIFICATION_AUDIT_ACTIONS.updated,
        VERIFICATION_ENTITY_TYPE,
        activity.id,
        { changedFields: Object.keys(data) },
      ),
      tx,
    );

    return activity;
  });
}

/**
 * The only path that changes status.
 *
 * Reaching a terminal outcome stamps `completedDate` from the server clock, so
 * the completion time and the status can never contradict each other.
 */
export async function transitionVerificationStatus(
  context: OrganizationContext,
  projectId: unknown,
  activityId: unknown,
  input: unknown,
): Promise<VerificationActivity> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const { to, rationale } = parseOrThrow(
    transitionVerificationRequestSchema,
    input,
    "Invalid transition",
  );

  return prisma.$transaction(async (tx) => {
    const existing = await requireActivity(scopedProjectId, activityId, tx);

    if (existing.status === to) {
      throw new ConflictError(`This activity is already ${to}.`);
    }

    if (!canTransitionVerification(existing.status, to)) {
      const legal = allowedVerificationTransitions(existing.status);
      throw new ConflictError(
        legal.length === 0
          ? `This activity is ${existing.status}, which is a final outcome. Plan a new activity to re-verify.`
          : `An activity in ${existing.status} cannot move to ${to}. Allowed: ${legal.join(", ")}.`,
      );
    }

    const activity = await verificationRepository.transitionStatusGuarded(
      existing.id,
      existing.status,
      {
        status: to,
        ...(isTerminalVerificationStatus(to) ? { completedDate: new Date() } : {}),
      },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      artifactAuditEvent(
        context,
        VERIFICATION_AUDIT_ACTIONS.transitioned,
        VERIFICATION_ENTITY_TYPE,
        activity.id,
        { from: existing.status, to, ...(rationale ? { rationale } : {}) },
      ),
      tx,
    );

    return activity;
  });
}

// --- Evidence -----------------------------------------------------------------

/**
 * Attaches an existing evidence record to this activity, recording its
 * execution or result. Real evidence, never uploaded here — this project's
 * evidence module records it; this endpoint only links it.
 *
 * Deliberately available regardless of `isVerificationEditable`: attaching
 * the result is exactly what happens as an activity concludes.
 */
export async function linkVerificationEvidence(
  context: OrganizationContext,
  projectId: unknown,
  activityId: unknown,
  input: unknown,
): Promise<LinkedEvidenceSummary[]> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const request = parseOrThrow(
    verificationEvidenceLinkRequestSchema,
    input,
    "Invalid evidence link",
  );

  const activity = await prisma.$transaction(async (tx) => {
    const existing = await requireActivity(scopedProjectId, activityId, tx);

    const evidenceExists = await verificationRepository.evidenceExistsInProject(
      request.evidenceId,
      scopedProjectId,
      tx,
    );
    if (!evidenceExists) {
      throw new ValidationError("That evidence does not exist in this project.");
    }

    await verificationRepository.linkVerificationEvidence(
      existing.id,
      request.evidenceId,
      request.note ?? null,
      context.actorId,
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      artifactAuditEvent(
        context,
        VERIFICATION_AUDIT_ACTIONS.evidenceLinked,
        VERIFICATION_ENTITY_TYPE,
        existing.id,
        { evidenceId: request.evidenceId },
      ),
      tx,
    );

    return existing;
  });

  return verificationRepository.listEvidenceForVerification(activity.id);
}

export async function unlinkVerificationEvidence(
  context: OrganizationContext,
  projectId: unknown,
  activityId: unknown,
  input: unknown,
): Promise<LinkedEvidenceSummary[]> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const request = parseOrThrow(
    verificationEvidenceUnlinkRequestSchema,
    input,
    "Invalid evidence unlink",
  );

  const activity = await prisma.$transaction(async (tx) => {
    const existing = await requireActivity(scopedProjectId, activityId, tx);

    const removed = await verificationRepository.unlinkVerificationEvidence(
      existing.id,
      request.evidenceId,
      tx,
    );
    if (!removed) {
      throw new NotFoundError("That evidence is not attached to this verification activity.");
    }

    await auditLogRepository.recordAuditEvent(
      artifactAuditEvent(
        context,
        VERIFICATION_AUDIT_ACTIONS.evidenceUnlinked,
        VERIFICATION_ENTITY_TYPE,
        existing.id,
        { evidenceId: request.evidenceId },
      ),
      tx,
    );

    return existing;
  });

  return verificationRepository.listEvidenceForVerification(activity.id);
}

export async function assignVerificationOwner(
  context: OrganizationContext,
  projectId: unknown,
  activityId: unknown,
  input: unknown,
): Promise<VerificationActivity> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const { ownerId } = parseOrThrow(
    assignVerificationOwnerRequestSchema,
    input,
    "Invalid owner assignment",
  );

  if (ownerId) {
    await requireAssignableOwner(context, scopedProjectId, ownerId);
  }

  return prisma.$transaction(async (tx) => {
    const existing = await requireActivity(scopedProjectId, activityId, tx);
    const activity = await verificationRepository.updateVerificationActivity(
      existing.id,
      { ownerId },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      artifactAuditEvent(
        context,
        ownerId
          ? VERIFICATION_AUDIT_ACTIONS.ownerAssigned
          : VERIFICATION_AUDIT_ACTIONS.ownerCleared,
        VERIFICATION_ENTITY_TYPE,
        activity.id,
        { previousOwnerId: existing.ownerId, ownerId },
      ),
      tx,
    );

    return activity;
  });
}
