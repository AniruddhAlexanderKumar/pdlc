import {
  type Risk,
  type RiskLinkSummary,
  type RiskStatus,
  allowedRiskTransitions,
  areRiskLinksEditable,
  assignRiskOwnerRequestSchema,
  canTransitionRisk,
  createRiskRequestSchema,
  entityIdSchema,
  isRiskContentEditable,
  isRiskOwnerAssignable,
  parseRiskLinkKey,
  riskLinkRequestSchema,
  riskStatusSchema,
  transitionRiskRequestSchema,
  updateRiskRequestSchema,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import type { AuditEventSummary } from "@/server/repositories/audit-log.repository";
import * as projectArtifactsRepository from "@/server/repositories/project-artifacts.repository";
import { requireAssignableOwner } from "./authorization.service";
import {
  requireProjectInOrganization,
  requireProjectWriteAccess,
} from "./project-scope";
import * as riskRepository from "@/server/repositories/risk.repository";
import type { RiskListItem, RiskOwnerSummary } from "@/server/repositories/risk.repository";
import { parseOrThrow } from "@/server/validation";

/**
 * Risk application service.
 *
 * Everything an engineer can do to a risk passes through here, and three
 * rules hold for all of it:
 *
 *  - **Tenancy.** The organization comes from the session and the project must
 *    belong to it. A risk in someone else's project reads as "not found",
 *    never "forbidden".
 *  - **Lifecycle.** Status changes only through {@link transitionRisk},
 *    validated against the domain's transition table. A generic update can
 *    never move a risk through its lifecycle.
 *  - **Auditability.** Each mutation writes its audit event in the same
 *    transaction, attributed to the authenticated actor.
 *
 * There is no numerical risk score anywhere in this file, and no code path
 * derives one — the domain carries none, so nothing here invents one either.
 */

export const RISK_ENTITY_TYPE = "Risk";

export const RISK_AUDIT_ACTIONS = {
  created: "risk.created",
  updated: "risk.updated",
  transitioned: "risk.status_transitioned",
  ownerAssigned: "risk.owner_assigned",
  ownerCleared: "risk.owner_cleared",
  linkAdded: "risk.link_added",
  linkRemoved: "risk.link_removed",
} as const;

/** A risk plus the parts the UI needs but the table does not hold. */
export interface RiskDetail extends Risk {
  owner: RiskOwnerSummary | null;
  links: RiskLinkSummary[];
  /** Only the transitions actually legal from the current status. */
  availableTransitions: readonly RiskStatus[];
  editable: { content: boolean; owner: boolean; links: boolean };
  history: AuditEventSummary[];
}

const requireProject = requireProjectInOrganization;

async function requireRisk(
  projectId: string,
  riskId: unknown,
  client?: Parameters<typeof riskRepository.findRiskInProject>[2],
): Promise<Risk> {
  const id = parseOrThrow(entityIdSchema, riskId, "Invalid risk id");
  const risk = await riskRepository.findRiskInProject(projectId, id, client);

  if (!risk) {
    throw new NotFoundError(`Risk ${id} was not found.`);
  }
  return risk;
}

function auditEvent(context: OrganizationContext, action: string, riskId: string, metadata: Record<string, unknown>) {
  return {
    organizationId: context.organizationId,
    actorId: context.actorId,
    action,
    entityType: RISK_ENTITY_TYPE,
    entityId: riskId,
    metadata,
  };
}

export async function createRisk(context: OrganizationContext, projectId: unknown, input: unknown): Promise<Risk> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const data = parseOrThrow(createRiskRequestSchema, input, "Invalid risk");

  if (data.ownerId) {
    await requireAssignableOwner(context, scopedProjectId, data.ownerId);
  }

  return prisma.$transaction(async (tx) => {
    const risk = await riskRepository.createRisk(
      {
        projectId: scopedProjectId,
        identifier: data.identifier,
        title: data.title,
        description: data.description,
        cause: data.cause ?? null,
        consequence: data.consequence ?? null,
        // A risk always begins open; callers cannot choose.
        status: "OPEN",
        ownerId: data.ownerId ?? null,
      },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      auditEvent(context, RISK_AUDIT_ACTIONS.created, risk.id, {
        identifier: risk.identifier,
        projectId: scopedProjectId,
      }),
      tx,
    );

    return risk;
  });
}

export async function listRisks(
  context: OrganizationContext,
  projectId: unknown,
  filter: { status?: unknown } = {},
): Promise<RiskListItem[]> {
  const scopedProjectId = await requireProject(context, projectId);

  const status =
    filter.status === undefined || filter.status === null || filter.status === ""
      ? undefined
      : parseOrThrow(riskStatusSchema, filter.status, "Invalid status filter");

  return riskRepository.listRisksInProject(scopedProjectId, status ? { status } : {});
}

/** Full detail: the risk, its owner, links, legal transitions and history. */
export async function getRisk(
  context: OrganizationContext,
  projectId: unknown,
  riskId: unknown,
): Promise<RiskDetail> {
  const scopedProjectId = await requireProject(context, projectId);
  const risk = await requireRisk(scopedProjectId, riskId);

  const [owner, links, history] = await Promise.all([
    risk.ownerId ? riskRepository.findRiskOwner(risk.ownerId) : null,
    riskRepository.listRiskLinks(risk.id),
    auditLogRepository.listAuditEventsForEntity({
      organizationId: context.organizationId,
      entityType: RISK_ENTITY_TYPE,
      entityId: risk.id,
    }),
  ]);

  return {
    ...risk,
    owner,
    links,
    availableTransitions: allowedRiskTransitions(risk.status),
    editable: {
      content: isRiskContentEditable(risk.status),
      owner: isRiskOwnerAssignable(risk.status),
      links: areRiskLinksEditable(risk.status),
    },
    history,
  };
}

/** Content update. Refuses once the risk is closed. */
export async function updateRisk(
  context: OrganizationContext,
  projectId: unknown,
  riskId: unknown,
  input: unknown,
): Promise<Risk> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const data = parseOrThrow(updateRiskRequestSchema, input, "Invalid risk update");

  return prisma.$transaction(async (tx) => {
    const existing = await requireRisk(scopedProjectId, riskId, tx);

    if (!isRiskContentEditable(existing.status)) {
      throw new ConflictError(`A risk that is CLOSED cannot be edited.`);
    }

    const risk = await riskRepository.updateRisk(
      existing.id,
      {
        title: data.title,
        description: data.description,
        cause: data.cause,
        consequence: data.consequence,
      },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      auditEvent(context, RISK_AUDIT_ACTIONS.updated, risk.id, { changedFields: Object.keys(data) }),
      tx,
    );

    return risk;
  });
}

/** The only path by which a risk's status changes. */
export async function transitionRisk(
  context: OrganizationContext,
  projectId: unknown,
  riskId: unknown,
  input: unknown,
): Promise<Risk> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const { to, rationale } = parseOrThrow(transitionRiskRequestSchema, input, "Invalid transition");

  return prisma.$transaction(async (tx) => {
    const existing = await requireRisk(scopedProjectId, riskId, tx);

    if (existing.status === to) {
      throw new ConflictError(`This risk is already ${to}.`);
    }

    if (!canTransitionRisk(existing.status, to)) {
      const legal = allowedRiskTransitions(existing.status);
      throw new ConflictError(
        legal.length === 0
          ? `A risk that is ${existing.status} is final and cannot change status.`
          : `A risk that is ${existing.status} cannot move to ${to}. Allowed: ${legal.join(", ")}.`,
      );
    }

    const risk = await riskRepository.transitionStatusGuarded(existing.id, existing.status, to, tx);

    await auditLogRepository.recordAuditEvent(
      auditEvent(context, RISK_AUDIT_ACTIONS.transitioned, risk.id, {
        from: existing.status,
        to,
        ...(rationale ? { rationale } : {}),
      }),
      tx,
    );

    return risk;
  });
}

/** Assigns an owner, or clears one when `ownerId` is null. */
export async function assignRiskOwner(
  context: OrganizationContext,
  projectId: unknown,
  riskId: unknown,
  input: unknown,
): Promise<Risk> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const { ownerId } = parseOrThrow(assignRiskOwnerRequestSchema, input, "Invalid owner assignment");

  if (ownerId) {
    await requireAssignableOwner(context, scopedProjectId, ownerId);
  }

  return prisma.$transaction(async (tx) => {
    const existing = await requireRisk(scopedProjectId, riskId, tx);

    if (!isRiskOwnerAssignable(existing.status)) {
      throw new ConflictError(`A risk that is ${existing.status} is read-only and its owner cannot be changed.`);
    }

    const risk = await riskRepository.updateRisk(existing.id, { ownerId }, tx);

    await auditLogRepository.recordAuditEvent(
      auditEvent(context, ownerId ? RISK_AUDIT_ACTIONS.ownerAssigned : RISK_AUDIT_ACTIONS.ownerCleared, risk.id, {
        previousOwnerId: existing.ownerId,
        ownerId,
      }),
      tx,
    );

    return risk;
  });
}

export async function listRiskLinks(
  context: OrganizationContext,
  projectId: unknown,
  riskId: unknown,
): Promise<RiskLinkSummary[]> {
  const scopedProjectId = await requireProject(context, projectId);
  const risk = await requireRisk(scopedProjectId, riskId);
  return riskRepository.listRiskLinks(risk.id);
}

/**
 * Adds one trace edge.
 *
 * The target must exist *in the same project*, which is checked against the
 * target's own table with `projectId` in the query — so a link to another
 * project's artifact (and therefore any other organization's) is rejected
 * rather than silently written.
 */
export async function linkRisk(
  context: OrganizationContext,
  projectId: unknown,
  riskId: unknown,
  input: unknown,
): Promise<RiskLinkSummary> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const request = parseOrThrow(riskLinkRequestSchema, input, "Invalid traceability link");

  return prisma.$transaction(async (tx) => {
    const risk = await requireRisk(scopedProjectId, riskId, tx);

    if (!areRiskLinksEditable(risk.status)) {
      throw new ConflictError(`A risk that is ${risk.status} is read-only and its traceability cannot be changed.`);
    }

    const targetInProject = await riskRepository.riskLinkTargetExistsInProject(
      request.relation,
      request.targetId,
      scopedProjectId,
      tx,
    );
    if (!targetInProject) {
      throw new ValidationError("That target does not exist in this project. Risks can only be linked to artifacts in the same project.");
    }

    const already = await riskRepository.riskLinkExists(risk.id, request.relation, request.targetId, tx);
    if (already) {
      throw new ValidationError("That link already exists on this risk.");
    }

    await riskRepository.createRiskLink(
      { riskId: risk.id, relation: request.relation, targetId: request.targetId, note: request.note ?? null, createdById: context.actorId },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      auditEvent(context, RISK_AUDIT_ACTIONS.linkAdded, risk.id, { relation: request.relation, targetId: request.targetId }),
      tx,
    );

    const links = await riskRepository.listRiskLinks(risk.id, tx);
    const created = links.find((link) => link.relation === request.relation && link.targetId === request.targetId);
    if (!created) {
      throw new ValidationError("The link could not be read back after creation.");
    }
    return created;
  });
}

export async function unlinkRisk(
  context: OrganizationContext,
  projectId: unknown,
  riskId: unknown,
  linkId: unknown,
): Promise<void> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const key = typeof linkId === "string" ? parseRiskLinkKey(linkId) : null;
  if (!key) {
    throw new ValidationError("Invalid risk link id.");
  }

  await prisma.$transaction(async (tx) => {
    const risk = await requireRisk(scopedProjectId, riskId, tx);

    if (!areRiskLinksEditable(risk.status)) {
      throw new ConflictError(`A risk that is ${risk.status} is read-only and its traceability cannot be changed.`);
    }

    const removed = await riskRepository.deleteRiskLink(risk.id, key.relation, key.rowId, tx);
    if (removed === 0) {
      throw new NotFoundError("That traceability link does not exist.");
    }

    await auditLogRepository.recordAuditEvent(
      auditEvent(context, RISK_AUDIT_ACTIONS.linkRemoved, risk.id, { relation: key.relation }),
      tx,
    );
  });
}

/** Artifacts in the project that a risk may be linked to — powers the selectors. */
export async function listLinkTargets(
  context: OrganizationContext,
  projectId: unknown,
): Promise<projectArtifactsRepository.RiskLinkTargetOptions> {
  const scopedProjectId = await requireProject(context, projectId);
  return projectArtifactsRepository.listRiskLinkTargets(scopedProjectId);
}
