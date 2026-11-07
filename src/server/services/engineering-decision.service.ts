import {
  type DecisionAlternative,
  type DecisionAssumption,
  type DecisionExpectation,
  type DecisionLinkSummary,
  type DecisionStatus,
  type EngineeringDecision,
  allowedDecisionTransitions,
  areAssumptionsEditable,
  areDecisionLinksEditable,
  assignDecisionOwnerRequestSchema,
  canTransitionDecision,
  createAlternativeRequestSchema,
  createAssumptionRequestSchema,
  createDecisionRequestSchema,
  decisionLinkRequestSchema,
  decisionStatusSchema,
  decisionUnlinkRequestSchema,
  entityIdSchema,
  isDecisionContentEditable,
  isDecisionOwnerAssignable,
  isExpectationEditable,
  setExpectationRequestSchema,
  transitionDecisionRequestSchema,
  updateAlternativeRequestSchema,
  updateAssumptionRequestSchema,
  updateDecisionRequestSchema,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import type { AuditEventSummary } from "@/server/repositories/audit-log.repository";
import * as alternativeRepository from "@/server/repositories/decision-alternative.repository";
import * as assumptionRepository from "@/server/repositories/decision-assumption.repository";
import * as expectationRepository from "@/server/repositories/decision-expectation.repository";
import * as decisionRepository from "@/server/repositories/engineering-decision.repository";
import type {
  DecisionListItem,
  DecisionOwnerSummary,
} from "@/server/repositories/engineering-decision.repository";
import * as projectArtifactsRepository from "@/server/repositories/project-artifacts.repository";
import { parseOrThrow } from "@/server/validation";
import { requireAssignableOwner } from "./authorization.service";
import {
  artifactAuditEvent,
  requireProjectInOrganization,
  requireProjectApproveAccess,
  requireProjectWriteAccess,
} from "./project-scope";
import { withRecordIdentifier } from "./record-identifier";

/** Only APPROVED represents the decision passing under review authority; every other transition is ordinary content work. */
const APPROVAL_TRANSITIONS = new Set<DecisionStatus>(["APPROVED"]);

/**
 * Engineering decision application service — the decision memory core.
 *
 * A decision record only earns its keep if a reader years later can
 * reconstruct not just what was decided but why, what else was on the table,
 * what had to be true, and whether what was expected actually happened. Each
 * of those is a separate operation here rather than a field on one blob,
 * because each is separately mutable, separately auditable, and eventually
 * separately watchable.
 *
 * Three rules hold across all of it:
 *
 *  - **Tenancy.** The organization comes from the session; the project must
 *    belong to it; child records are always reached through their decision. A
 *    decision outside the caller's tenancy reads as "not found".
 *  - **Lifecycle.** Status changes only through
 *    {@link transitionDecisionStatus}. The update contract has no status
 *    field at all, so a generic PATCH cannot move a decision through its
 *    lifecycle.
 *  - **Auditability.** Every mutation writes its audit event in the same
 *    transaction, attributed to the authenticated actor.
 */

export const DECISION_ENTITY_TYPE = "EngineeringDecision";

export const DECISION_AUDIT_ACTIONS = {
  created: "decision.created",
  updated: "decision.updated",
  transitioned: "decision.status_transitioned",
  ownerAssigned: "decision.owner_assigned",
  ownerCleared: "decision.owner_cleared",
  alternativeAdded: "decision.alternative_added",
  alternativeUpdated: "decision.alternative_updated",
  alternativeRemoved: "decision.alternative_removed",
  assumptionAdded: "decision.assumption_added",
  assumptionUpdated: "decision.assumption_updated",
  assumptionRemoved: "decision.assumption_removed",
  expectationSet: "decision.expectation_set",
  expectationCleared: "decision.expectation_cleared",
  linkAdded: "decision.link_added",
  linkRemoved: "decision.link_removed",
} as const;

/**
 * The whole memory of one decision, as the detail page needs it.
 *
 * The legacy `alternativesConsidered` and `assumptions` **text columns are
 * deliberately omitted**. They predate the first-class
 * `DecisionAlternative` / `DecisionAssumption` records, which are now the
 * authoritative representation; exposing both would create two competing
 * sources of truth for the same information. The columns remain in the
 * schema so existing rows are not destroyed, but nothing reads them into a
 * response and no write path populates them.
 */
export interface DecisionDetail
  extends Omit<EngineeringDecision, "alternativesConsidered" | "assumptions"> {
  owner: DecisionOwnerSummary | null;
  alternatives: DecisionAlternative[];
  assumptions: DecisionAssumption[];
  expectation: DecisionExpectation | null;
  links: DecisionLinkSummary[];
  /** Only the transitions actually legal from the current status. */
  availableTransitions: readonly DecisionStatus[];
  editable: { content: boolean; owner: boolean; assumptions: boolean; links: boolean };
  history: AuditEventSummary[];
}

async function requireDecision(
  projectId: string,
  decisionId: unknown,
  client?: Parameters<typeof decisionRepository.findDecisionInProject>[2],
): Promise<EngineeringDecision> {
  const id = parseOrThrow(entityIdSchema, decisionId, "Invalid decision id");
  const decision = await decisionRepository.findDecisionInProject(projectId, id, client);

  if (!decision) {
    throw new NotFoundError(`Decision ${id} was not found.`);
  }
  return decision;
}

function audit(
  context: OrganizationContext,
  action: string,
  decisionId: string,
  metadata: Record<string, unknown>,
) {
  return artifactAuditEvent(context, action, DECISION_ENTITY_TYPE, decisionId, metadata);
}

// --- Decision ---------------------------------------------------------------

export async function createDecision(
  context: OrganizationContext,
  projectId: unknown,
  input: unknown,
): Promise<EngineeringDecision> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const data = parseOrThrow(createDecisionRequestSchema, input, "Invalid decision");

  if (data.ownerId) {
    await requireAssignableOwner(context, scopedProjectId, data.ownerId);
  }

  return withRecordIdentifier(data.identifier, "decision", scopedProjectId, (identifier) =>
    prisma.$transaction(async (tx) => {
      const decision = await decisionRepository.createDecision(
        {
          projectId: scopedProjectId,
          identifier,
          title: data.title,
          statement: data.statement,
          rationale: data.rationale,
          ownerId: data.ownerId ?? null,
          decidedAt: data.decidedAt ?? null,
        },
        tx,
      );

      await auditLogRepository.recordAuditEvent(
        audit(context, DECISION_AUDIT_ACTIONS.created, decision.id, {
          identifier: decision.identifier,
          projectId: scopedProjectId,
        }),
        tx,
      );

      return decision;
    }),
  );
}

export async function listDecisions(
  context: OrganizationContext,
  projectId: unknown,
  filter: { status?: unknown } = {},
): Promise<DecisionListItem[]> {
  const scopedProjectId = await requireProjectInOrganization(context, projectId);

  const status =
    filter.status === undefined || filter.status === null || filter.status === ""
      ? undefined
      : parseOrThrow(decisionStatusSchema, filter.status, "Invalid status filter");

  return decisionRepository.listDecisionsInProject(scopedProjectId, status ? { status } : {});
}

/** The full decision memory: alternatives, assumptions, expectation, links, history. */
export async function getDecision(
  context: OrganizationContext,
  projectId: unknown,
  decisionId: unknown,
): Promise<DecisionDetail> {
  const scopedProjectId = await requireProjectInOrganization(context, projectId);
  const decision = await requireDecision(scopedProjectId, decisionId);

  const [owner, alternatives, assumptions, expectation, links, history] = await Promise.all([
    decision.ownerId ? decisionRepository.findDecisionOwner(decision.ownerId) : null,
    alternativeRepository.listAlternatives(decision.id),
    assumptionRepository.listAssumptions(decision.id),
    expectationRepository.findExpectation(decision.id),
    decisionRepository.listDecisionLinks(decision.id),
    auditLogRepository.listAuditEventsForEntity({
      organizationId: context.organizationId,
      entityType: DECISION_ENTITY_TYPE,
      entityId: decision.id,
    }),
  ]);

  // Actually drop the legacy columns, not merely omit them from the type: a
  // spread would otherwise serialize them to the client and recreate the
  // second source of truth these records replaced.
  const {
    alternativesConsidered: _legacyAlternatives,
    assumptions: _legacyAssumptions,
    ...core
  } = decision;

  return {
    ...core,
    owner,
    alternatives,
    assumptions,
    expectation,
    links,
    availableTransitions: allowedDecisionTransitions(decision.status),
    editable: {
      content: isDecisionContentEditable(decision.status),
      owner: isDecisionOwnerAssignable(decision.status),
      assumptions: areAssumptionsEditable(decision.status),
      links: areDecisionLinksEditable(decision.status),
    },
    history,
  };
}

/**
 * Content update. Refused once approved: rewriting the statement of an
 * approved decision would change what was agreed after the fact.
 */
export async function updateDecision(
  context: OrganizationContext,
  projectId: unknown,
  decisionId: unknown,
  input: unknown,
): Promise<EngineeringDecision> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const data = parseOrThrow(updateDecisionRequestSchema, input, "Invalid decision update");

  return prisma.$transaction(async (tx) => {
    const existing = await requireDecision(scopedProjectId, decisionId, tx);

    if (!isDecisionContentEditable(existing.status)) {
      throw new ConflictError(
        `A decision in ${existing.status} can no longer be edited. Supersede it with a new decision instead.`,
      );
    }

    const decision = await decisionRepository.updateDecision(existing.id, data, tx);

    await auditLogRepository.recordAuditEvent(
      audit(context, DECISION_AUDIT_ACTIONS.updated, decision.id, {
        changedFields: Object.keys(data),
      }),
      tx,
    );

    return decision;
  });
}

/** The only path by which a decision's status changes. */
export async function transitionDecisionStatus(
  context: OrganizationContext,
  projectId: unknown,
  decisionId: unknown,
  input: unknown,
): Promise<EngineeringDecision> {
  const { to, rationale } = parseOrThrow(
    transitionDecisionRequestSchema,
    input,
    "Invalid transition",
  );
  const scopedProjectId = APPROVAL_TRANSITIONS.has(to)
    ? await requireProjectApproveAccess(context, projectId)
    : await requireProjectWriteAccess(context, projectId);

  return prisma.$transaction(async (tx) => {
    const existing = await requireDecision(scopedProjectId, decisionId, tx);

    if (existing.status === to) {
      throw new ConflictError(`This decision is already ${to}.`);
    }

    if (!canTransitionDecision(existing.status, to)) {
      const legal = allowedDecisionTransitions(existing.status);
      throw new ConflictError(
        legal.length === 0
          ? `A decision in ${existing.status} is final and cannot change status.`
          : `A decision in ${existing.status} cannot move to ${to}. Allowed: ${legal.join(", ")}.`,
      );
    }

    const decision = await decisionRepository.transitionStatusGuarded(
      existing.id,
      existing.status,
      {
        status: to,
        // Approving records when the decision was actually taken, if the
        // author did not already say.
        ...(to === "APPROVED" && !existing.decidedAt ? { decidedAt: new Date() } : {}),
      },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      audit(context, DECISION_AUDIT_ACTIONS.transitioned, decision.id, {
        from: existing.status,
        to,
        ...(rationale ? { rationale } : {}),
      }),
      tx,
    );

    return decision;
  });
}

export async function assignDecisionOwner(
  context: OrganizationContext,
  projectId: unknown,
  decisionId: unknown,
  input: unknown,
): Promise<EngineeringDecision> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const { ownerId } = parseOrThrow(
    assignDecisionOwnerRequestSchema,
    input,
    "Invalid owner assignment",
  );

  if (ownerId) {
    await requireAssignableOwner(context, scopedProjectId, ownerId);
  }

  return prisma.$transaction(async (tx) => {
    const existing = await requireDecision(scopedProjectId, decisionId, tx);

    if (!isDecisionOwnerAssignable(existing.status)) {
      throw new ConflictError(
        `A decision in ${existing.status} is a closed record and its owner cannot be changed.`,
      );
    }

    const decision = await decisionRepository.updateDecision(existing.id, { ownerId }, tx);

    await auditLogRepository.recordAuditEvent(
      audit(
        context,
        ownerId ? DECISION_AUDIT_ACTIONS.ownerAssigned : DECISION_AUDIT_ACTIONS.ownerCleared,
        decision.id,
        { previousOwnerId: existing.ownerId, ownerId },
      ),
      tx,
    );

    return decision;
  });
}

// --- Alternatives -----------------------------------------------------------

/** Alternatives are part of the decision's substance, so they follow content editability. */
async function requireEditableDecision(
  projectId: string,
  decisionId: unknown,
  client: Parameters<typeof decisionRepository.findDecisionInProject>[2],
  what: string,
): Promise<EngineeringDecision> {
  const decision = await requireDecision(projectId, decisionId, client);

  if (!isDecisionContentEditable(decision.status)) {
    throw new ConflictError(
      `A decision in ${decision.status} can no longer be edited, so its ${what} are fixed.`,
    );
  }
  return decision;
}

export async function addAlternative(
  context: OrganizationContext,
  projectId: unknown,
  decisionId: unknown,
  input: unknown,
): Promise<DecisionAlternative> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const data = parseOrThrow(createAlternativeRequestSchema, input, "Invalid alternative");

  return prisma.$transaction(async (tx) => {
    const decision = await requireEditableDecision(scopedProjectId, decisionId, tx, "alternatives");

    const alternative = await alternativeRepository.createAlternative(
      {
        engineeringDecisionId: decision.id,
        title: data.title,
        description: data.description ?? null,
        reasonRejected: data.reasonRejected ?? null,
      },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      audit(context, DECISION_AUDIT_ACTIONS.alternativeAdded, decision.id, {
        alternativeId: alternative.id,
        title: alternative.title,
      }),
      tx,
    );

    return alternative;
  });
}

export async function listAlternatives(
  context: OrganizationContext,
  projectId: unknown,
  decisionId: unknown,
): Promise<DecisionAlternative[]> {
  const scopedProjectId = await requireProjectInOrganization(context, projectId);
  const decision = await requireDecision(scopedProjectId, decisionId);
  return alternativeRepository.listAlternatives(decision.id);
}

export async function updateAlternative(
  context: OrganizationContext,
  projectId: unknown,
  decisionId: unknown,
  alternativeId: unknown,
  input: unknown,
): Promise<DecisionAlternative> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const id = parseOrThrow(entityIdSchema, alternativeId, "Invalid alternative id");
  const data = parseOrThrow(updateAlternativeRequestSchema, input, "Invalid alternative update");

  return prisma.$transaction(async (tx) => {
    const decision = await requireEditableDecision(scopedProjectId, decisionId, tx, "alternatives");

    // Scoped to the decision: an alternative from elsewhere does not match.
    const existing = await alternativeRepository.findAlternativeForDecision(decision.id, id, tx);
    if (!existing) {
      throw new NotFoundError("That alternative was not found on this decision.");
    }

    const alternative = await alternativeRepository.updateAlternative(existing.id, data, tx);

    await auditLogRepository.recordAuditEvent(
      audit(context, DECISION_AUDIT_ACTIONS.alternativeUpdated, decision.id, {
        alternativeId: alternative.id,
        changedFields: Object.keys(data),
      }),
      tx,
    );

    return alternative;
  });
}

export async function removeAlternative(
  context: OrganizationContext,
  projectId: unknown,
  decisionId: unknown,
  alternativeId: unknown,
): Promise<void> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const id = parseOrThrow(entityIdSchema, alternativeId, "Invalid alternative id");

  await prisma.$transaction(async (tx) => {
    const decision = await requireEditableDecision(scopedProjectId, decisionId, tx, "alternatives");

    const removed = await alternativeRepository.deleteAlternative(decision.id, id, tx);
    if (removed === 0) {
      throw new NotFoundError("That alternative was not found on this decision.");
    }

    await auditLogRepository.recordAuditEvent(
      audit(context, DECISION_AUDIT_ACTIONS.alternativeRemoved, decision.id, {
        alternativeId: id,
      }),
      tx,
    );
  });
}

// --- Assumptions ------------------------------------------------------------

/**
 * Assumptions stay editable after approval.
 *
 * Deliberately wider than content editability: discovering that an assumption
 * behind an approved decision no longer holds is exactly the event this
 * record exists to capture, and it almost always happens after approval. Only
 * a closed record (rejected or superseded) freezes them.
 */
async function requireAssumptionEditableDecision(
  projectId: string,
  decisionId: unknown,
  client: Parameters<typeof decisionRepository.findDecisionInProject>[2],
): Promise<EngineeringDecision> {
  const decision = await requireDecision(projectId, decisionId, client);

  if (!areAssumptionsEditable(decision.status)) {
    throw new ConflictError(
      `A decision in ${decision.status} is a closed record and its assumptions are fixed.`,
    );
  }
  return decision;
}

export async function addAssumption(
  context: OrganizationContext,
  projectId: unknown,
  decisionId: unknown,
  input: unknown,
): Promise<DecisionAssumption> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const data = parseOrThrow(createAssumptionRequestSchema, input, "Invalid assumption");

  return prisma.$transaction(async (tx) => {
    const decision = await requireAssumptionEditableDecision(scopedProjectId, decisionId, tx);

    const assumption = await assumptionRepository.createAssumption(
      {
        engineeringDecisionId: decision.id,
        statement: data.statement,
        // Absent means UNKNOWN — recording an assumption is not a claim that
        // it has been checked.
        status: data.status,
        rationale: data.rationale ?? null,
      },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      audit(context, DECISION_AUDIT_ACTIONS.assumptionAdded, decision.id, {
        assumptionId: assumption.id,
        status: assumption.status,
      }),
      tx,
    );

    return assumption;
  });
}

export async function listAssumptions(
  context: OrganizationContext,
  projectId: unknown,
  decisionId: unknown,
): Promise<DecisionAssumption[]> {
  const scopedProjectId = await requireProjectInOrganization(context, projectId);
  const decision = await requireDecision(scopedProjectId, decisionId);
  return assumptionRepository.listAssumptions(decision.id);
}

export async function updateAssumption(
  context: OrganizationContext,
  projectId: unknown,
  decisionId: unknown,
  assumptionId: unknown,
  input: unknown,
): Promise<DecisionAssumption> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const id = parseOrThrow(entityIdSchema, assumptionId, "Invalid assumption id");
  const data = parseOrThrow(updateAssumptionRequestSchema, input, "Invalid assumption update");

  return prisma.$transaction(async (tx) => {
    const decision = await requireAssumptionEditableDecision(scopedProjectId, decisionId, tx);

    const existing = await assumptionRepository.findAssumptionForDecision(decision.id, id, tx);
    if (!existing) {
      throw new NotFoundError("That assumption was not found on this decision.");
    }

    const assumption = await assumptionRepository.updateAssumption(existing.id, data, tx);

    await auditLogRepository.recordAuditEvent(
      audit(context, DECISION_AUDIT_ACTIONS.assumptionUpdated, decision.id, {
        assumptionId: assumption.id,
        // The status change is the interesting part of the history here.
        ...(data.status ? { from: existing.status, to: data.status } : {}),
        changedFields: Object.keys(data),
      }),
      tx,
    );

    return assumption;
  });
}

export async function removeAssumption(
  context: OrganizationContext,
  projectId: unknown,
  decisionId: unknown,
  assumptionId: unknown,
): Promise<void> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const id = parseOrThrow(entityIdSchema, assumptionId, "Invalid assumption id");

  await prisma.$transaction(async (tx) => {
    const decision = await requireAssumptionEditableDecision(scopedProjectId, decisionId, tx);

    const removed = await assumptionRepository.deleteAssumption(decision.id, id, tx);
    if (removed === 0) {
      throw new NotFoundError("That assumption was not found on this decision.");
    }

    await auditLogRepository.recordAuditEvent(
      audit(context, DECISION_AUDIT_ACTIONS.assumptionRemoved, decision.id, { assumptionId: id }),
      tx,
    );
  });
}

// --- Expectation ------------------------------------------------------------

/**
 * Creates or replaces the decision's single expectation.
 *
 * An observation may be recorded here, but it is never inferred: supplying an
 * `actualValue` does not make the expectation HELD. Someone has to say so.
 */
export async function setExpectation(
  context: OrganizationContext,
  projectId: unknown,
  decisionId: unknown,
  input: unknown,
): Promise<DecisionExpectation> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const data = parseOrThrow(setExpectationRequestSchema, input, "Invalid expectation");

  return prisma.$transaction(async (tx) => {
    const decision = await requireDecision(scopedProjectId, decisionId, tx);

    if (!isExpectationEditable(decision.status)) {
      throw new ConflictError(
        `A decision in ${decision.status} is a closed record and its expectation is fixed.`,
      );
    }

    const expectation = await expectationRepository.setExpectation(
      {
        engineeringDecisionId: decision.id,
        statement: data.statement,
        measure: data.measure ?? null,
        expectedValue: data.expectedValue ?? null,
        unit: data.unit ?? null,
        comparisonOperator: data.comparisonOperator ?? null,
        dueAt: data.dueAt ?? null,
        status: data.status,
        actualValue: data.actualValue ?? null,
        observedAt: data.observedAt ?? null,
      },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      audit(context, DECISION_AUDIT_ACTIONS.expectationSet, decision.id, {
        status: expectation.status,
        observed: expectation.actualValue !== null,
      }),
      tx,
    );

    return expectation;
  });
}

export async function getExpectation(
  context: OrganizationContext,
  projectId: unknown,
  decisionId: unknown,
): Promise<DecisionExpectation | null> {
  const scopedProjectId = await requireProjectInOrganization(context, projectId);
  const decision = await requireDecision(scopedProjectId, decisionId);
  return expectationRepository.findExpectation(decision.id);
}

export async function clearExpectation(
  context: OrganizationContext,
  projectId: unknown,
  decisionId: unknown,
): Promise<void> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);

  await prisma.$transaction(async (tx) => {
    const decision = await requireDecision(scopedProjectId, decisionId, tx);

    if (!isExpectationEditable(decision.status)) {
      throw new ConflictError(
        `A decision in ${decision.status} is a closed record and its expectation is fixed.`,
      );
    }

    const removed = await expectationRepository.deleteExpectation(decision.id, tx);
    if (removed === 0) {
      throw new NotFoundError("This decision has no expectation to clear.");
    }

    await auditLogRepository.recordAuditEvent(
      audit(context, DECISION_AUDIT_ACTIONS.expectationCleared, decision.id, {}),
      tx,
    );
  });
}

// --- Traceability -----------------------------------------------------------

export async function listDecisionLinks(
  context: OrganizationContext,
  projectId: unknown,
  decisionId: unknown,
): Promise<DecisionLinkSummary[]> {
  const scopedProjectId = await requireProjectInOrganization(context, projectId);
  const decision = await requireDecision(scopedProjectId, decisionId);
  return decisionRepository.listDecisionLinks(decision.id);
}

/**
 * Adds one trace edge.
 *
 * The target must exist *in the same project*, checked against the target's
 * own table with `projectId` in the query, so a link to another project's
 * artifact — and therefore any other organization's — is rejected rather than
 * written.
 */
export async function linkDecision(
  context: OrganizationContext,
  projectId: unknown,
  decisionId: unknown,
  input: unknown,
): Promise<DecisionLinkSummary[]> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const request = parseOrThrow(decisionLinkRequestSchema, input, "Invalid traceability link");

  return prisma.$transaction(async (tx) => {
    const decision = await requireDecision(scopedProjectId, decisionId, tx);

    if (!areDecisionLinksEditable(decision.status)) {
      throw new ConflictError(
        `A decision in ${decision.status} is a closed record and its traceability is fixed.`,
      );
    }

    const targetInProject = await decisionRepository.decisionLinkTargetExistsInProject(
      request.relation,
      request.targetId,
      scopedProjectId,
      tx,
    );

    if (!targetInProject) {
      throw new ValidationError(
        "That target does not exist in this project. Decisions can only be linked to artifacts in the same project.",
      );
    }

    await decisionRepository.createDecisionLink(
      {
        engineeringDecisionId: decision.id,
        relation: request.relation,
        targetId: request.targetId,
        linkType: "linkType" in request ? request.linkType : undefined,
        note: "note" in request ? request.note : undefined,
        createdById: context.actorId,
      },
      tx,
    );

    await auditLogRepository.recordAuditEvent(
      audit(context, DECISION_AUDIT_ACTIONS.linkAdded, decision.id, {
        relation: request.relation,
        targetId: request.targetId,
      }),
      tx,
    );

    return decisionRepository.listDecisionLinks(decision.id, tx);
  });
}

export async function unlinkDecision(
  context: OrganizationContext,
  projectId: unknown,
  decisionId: unknown,
  input: unknown,
): Promise<DecisionLinkSummary[]> {
  const scopedProjectId = await requireProjectWriteAccess(context, projectId);
  const request = parseOrThrow(decisionUnlinkRequestSchema, input, "Invalid unlink request");

  return prisma.$transaction(async (tx) => {
    const decision = await requireDecision(scopedProjectId, decisionId, tx);

    if (!areDecisionLinksEditable(decision.status)) {
      throw new ConflictError(
        `A decision in ${decision.status} is a closed record and its traceability is fixed.`,
      );
    }

    const removed = await decisionRepository.deleteDecisionLink(
      {
        engineeringDecisionId: decision.id,
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
      audit(context, DECISION_AUDIT_ACTIONS.linkRemoved, decision.id, {
        relation: request.relation,
        targetId: request.targetId,
      }),
      tx,
    );

    return decisionRepository.listDecisionLinks(decision.id, tx);
  });
}

/** Artifacts in the project a decision may be linked to — powers the selectors. */
export async function listDecisionLinkTargets(
  context: OrganizationContext,
  projectId: unknown,
): Promise<projectArtifactsRepository.DecisionLinkTargetOptions> {
  const scopedProjectId = await requireProjectInOrganization(context, projectId);
  return projectArtifactsRepository.listDecisionLinkTargets(scopedProjectId);
}
