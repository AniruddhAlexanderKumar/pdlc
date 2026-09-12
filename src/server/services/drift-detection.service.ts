import {
  DRIFT_VERSION,
  type BaselineComparisonMember,
  type BaselineComparisonReport,
  type BaselineMemberType,
  type DriftAssessment,
  type DriftBasisMarker,
  type DriftEvaluationBasis,
  type DriftFreshness,
  type DriftReport,
  type DriftSubject,
  type EngineeringBaseline,
  type EngineeringBaselineMember,
  type ComparisonOperator,
  type LatestDrift,
  type OperationalObservation,
  activateBaselineRequestSchema,
  addBaselineMemberRequestSchema,
  canTransitionBaseline,
  canTransitionObservation,
  classifyBaselineMemberComparison,
  compareDriftFindings,
  compareObservedValue,
  createBaselineRequestSchema,
  createObservationRequestSchema,
  describeExpectation,
  driftFingerprint,
  driftFreshnessOf,
  driftIdSchema,
  driftRule,
  driftStatusFor,
  entityIdSchema,
  evaluateDriftRequestSchema,
  isBaselineMembershipEditable,
  isObservationEditable,
  normalizeDriftBasis,
  observationStatusSchema,
  observationTypeSchema,
  reviewObservationRequestSchema,
  severityForDriftStatus,
  summarizeBaselineComparison,
  updateBaselineRequestSchema,
  updateObservationRequestSchema,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { AppError, ConflictError, NotFoundError, ValidationError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import * as memberRepository from "@/server/repositories/baseline-member.repository";
import type { BaselineableObject } from "@/server/repositories/baseline-member.repository";
import * as assessmentRepository from "@/server/repositories/drift-assessment.repository";
import type { PersistDriftFindingInput } from "@/server/repositories/drift-assessment.repository";
import * as baselineRepository from "@/server/repositories/engineering-baseline.repository";
import type { BaselineWithCounts } from "@/server/repositories/engineering-baseline.repository";
import * as observationRepository from "@/server/repositories/operational-observation.repository";
import * as projectArtifactsRepository from "@/server/repositories/project-artifacts.repository";
import type { BaselineMemberTargetOptions } from "@/server/repositories/project-artifacts.repository";
import { parseOrThrow } from "@/server/validation";
import { artifactAuditEvent, requireProjectInOrganization } from "./project-scope";

/**
 * The design / operations drift engine.
 *
 * It answers one question about one project against one baseline — *where does
 * the operational state that has since been recorded no longer match the
 * engineering basis that was approved?* — and it answers it the same way every
 * time: resolve the baseline's members, read their current state, read the
 * observations, and apply the rules in `DRIFT_RULES`.
 *
 * **The service owns no comparison policy.** Every finding it emits comes from a
 * rule in the registry, looked up by id; `emitFinding` refuses an id the registry
 * does not define. No `if` in this file can introduce a comparison nobody wrote
 * down, and no client can add one — the request contract carries a baseline id
 * and nothing else.
 *
 * **What it refuses to do**, in the order the temptations arrive:
 *
 *  - **It never rewrites a baseline.** An object that changed since it was
 *    baselined produces a finding. Quietly re-snapshotting it would erase the
 *    only evidence drift ever produces, and it is the single most plausible
 *    "helpful" behaviour to get wrong.
 *  - **It never concludes failure.** The strongest outcome any rule carries is
 *    REVIEW_REQUIRED. Expected 100, observed 103 is a difference between two
 *    numbers; whether it matters depends on margin and intent, neither of which
 *    is recorded anywhere in this system.
 *  - **It never sets another engine's state.** No expectation moves to BREACHED,
 *    no assumption is invalidated, no qualification is failed, no requirement is
 *    reopened. Those are determinations people make, and two of them belong to
 *    engines that own them.
 *  - **It never converts units.** 800 °C and 1472 °F are the same temperature and
 *    this engine will still report UNKNOWN, because the alternative is a system
 *    that converts something it should not have.
 *
 * Reading never evaluates, and evaluation is explicit. Nothing here runs on a
 * page load or on a schedule.
 */

export const BASELINE_ENTITY_TYPE = "EngineeringBaseline";
export const OBSERVATION_ENTITY_TYPE = "OperationalObservation";
export const DRIFT_ENTITY_TYPE = "DriftAssessment";

export const DRIFT_AUDIT_ACTIONS = {
  baselineCreated: "baseline.created",
  baselineUpdated: "baseline.updated",
  baselineMemberAdded: "baseline.member_added",
  baselineMemberRemoved: "baseline.member_removed",
  baselineActivated: "baseline.activated",
  baselineSuperseded: "baseline.superseded",
  observationCreated: "observation.created",
  observationUpdated: "observation.updated",
  observationReviewed: "observation.reviewed",
  observationRejected: "observation.rejected",
  driftEvaluated: "drift.evaluated",
} as const;

/** Raised when the recorded state cannot be read well enough to compare. */
export class DriftEvaluationFailure extends AppError {
  constructor(message: string) {
    super(message, { statusCode: 422, code: "DRIFT_EVALUATION_FAILED", isOperational: true });
  }
}

export interface BaselineDetail extends EngineeringBaseline {
  members: Array<
    EngineeringBaselineMember & {
      /** Null when the object no longer resolves inside the project. */
      currentFingerprint: string | null;
      currentLabel: string | null;
      currentState: string | null;
      /** Whether the object has moved since it was baselined. */
      changed: boolean;
    }
  >;
  history: Awaited<ReturnType<typeof auditLogRepository.listAuditEventsForEntity>>;
}

/** A finding before it is ordered and written. */
type DraftFinding = PersistDriftFindingInput;

/** Everything one evaluation needs, resolved once. */
interface ResolvedEvaluation {
  baseline: EngineeringBaseline;
  members: EngineeringBaselineMember[];
  current: Map<string, BaselineableObject>;
  observations: OperationalObservation[];
  /** In-flight changes already declared against members, keyed `TYPE:id`. */
  changeContext: Map<
    string,
    Array<{ changeRequestId: string; identifier: string; status: string }>
  >;
  basis: DriftEvaluationBasis;
}

const memberKey = (nodeType: string, nodeId: string): string => `${nodeType}:${nodeId}`;

export class DriftDetectionService {
  // --- Baselines ------------------------------------------------------------

  async createBaseline(
    context: OrganizationContext,
    projectId: unknown,
    input: unknown,
  ): Promise<EngineeringBaseline> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const data = parseOrThrow(createBaselineRequestSchema, input, "Invalid baseline");

    return prisma.$transaction(async (tx) => {
      const baseline = await baselineRepository.createBaseline(
        {
          projectId: scopedProjectId,
          identifier: data.identifier,
          name: data.name,
          description: data.description ?? null,
          createdById: context.actorId,
        },
        tx,
      );

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          DRIFT_AUDIT_ACTIONS.baselineCreated,
          BASELINE_ENTITY_TYPE,
          baseline.id,
          { identifier: baseline.identifier, projectId: scopedProjectId },
        ),
        tx,
      );

      return baseline;
    });
  }

  async listBaselines(
    context: OrganizationContext,
    projectId: unknown,
  ): Promise<BaselineWithCounts[]> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    return baselineRepository.listBaselinesInProject(scopedProjectId);
  }

  /**
   * One baseline with its membership, and whether each member has moved.
   *
   * The `changed` flag here is the same comparison the evaluation performs, so
   * the detail page can show what an evaluation would find. It is a *read*: it
   * records nothing and changes nothing.
   */
  async getBaseline(
    context: OrganizationContext,
    projectId: unknown,
    baselineId: unknown,
  ): Promise<BaselineDetail> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const { baseline, members, current } = await this.resolveMembersWithCurrent(
      scopedProjectId,
      baselineId,
    );

    const history = await auditLogRepository.listAuditEventsForEntity({
      organizationId: context.organizationId,
      entityType: BASELINE_ENTITY_TYPE,
      entityId: baseline.id,
    });

    return {
      ...baseline,
      members: members.map((member) => {
        const now = current.get(memberKey(member.nodeType, member.nodeId)) ?? null;
        return {
          ...member,
          currentFingerprint: now?.fingerprint ?? null,
          currentLabel: now?.label ?? null,
          currentState: now?.state ?? null,
          changed: now !== null && now.fingerprint !== member.fingerprint,
        };
      }),
      history,
    };
  }

  /**
   * Deterministic snapshot-vs-current comparison for one baseline, in any
   * status (DRAFT included) — the formal classification behind the `changed`
   * flag `getBaseline` already exposes, plus any declared change requests
   * already on record against a changed member.
   *
   * Not a drift evaluation: nothing here reads an observation, applies a
   * `DRIFT_RULES` rule, or writes anything. Calling this twice in a row
   * always returns the same shape for the same underlying state, and never
   * persists a row — there is nothing here for a later read to find stale.
   */
  async compareBaseline(
    context: OrganizationContext,
    projectId: unknown,
    baselineId: unknown,
  ): Promise<BaselineComparisonReport> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const { baseline, members, current } = await this.resolveMembersWithCurrent(
      scopedProjectId,
      baselineId,
    );

    const refs = members.map((member) => ({ nodeType: member.nodeType, nodeId: member.nodeId }));
    const declaredChanges = await assessmentRepository.loadChangeContext(scopedProjectId, refs);

    const comparisonMembers: BaselineComparisonMember[] = members
      .map((member) => {
        const now = current.get(memberKey(member.nodeType, member.nodeId)) ?? null;
        return {
          memberId: member.id,
          nodeType: member.nodeType,
          nodeId: member.nodeId,
          identifier: member.identifierSnapshot,
          label: member.labelSnapshot,
          baselinedState: member.stateSnapshot,
          currentState: now?.state ?? null,
          baselinedFingerprint: member.fingerprint,
          currentFingerprint: now?.fingerprint ?? null,
          status: classifyBaselineMemberComparison(member.fingerprint, now),
          declaredChanges: declaredChanges.get(memberKey(member.nodeType, member.nodeId)) ?? [],
        };
      })
      .sort((a, b) => (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0));

    return {
      baselineId: baseline.id,
      baselineIdentifier: baseline.identifier,
      baselineName: baseline.name,
      baselineStatus: baseline.status,
      comparedAt: new Date(),
      members: comparisonMembers,
      summary: summarizeBaselineComparison(comparisonMembers),
    };
  }

  async updateBaseline(
    context: OrganizationContext,
    projectId: unknown,
    baselineId: unknown,
    input: unknown,
  ): Promise<EngineeringBaseline> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const data = parseOrThrow(updateBaselineRequestSchema, input, "Invalid baseline update");

    return prisma.$transaction(async (tx) => {
      const existing = await this.requireBaseline(scopedProjectId, baselineId, tx);
      this.requireDraft(existing, "edited");

      const baseline = await baselineRepository.updateBaseline(existing.id, data, tx);

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          DRIFT_AUDIT_ACTIONS.baselineUpdated,
          BASELINE_ENTITY_TYPE,
          baseline.id,
          { changedFields: Object.keys(data) },
        ),
        tx,
      );

      return baseline;
    });
  }

  // --- Membership -----------------------------------------------------------

  /**
   * Everything in this project that may be added to a baseline.
   *
   * Project-scoped, so the picker can only ever offer objects the caller already
   * has access to — the same boundary the membership write enforces.
   */
  async listBaselineMemberTargets(
    context: OrganizationContext,
    projectId: unknown,
  ): Promise<BaselineMemberTargetOptions> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    return projectArtifactsRepository.listBaselineMemberTargets(scopedProjectId);
  }

  async listBaselineMembers(
    context: OrganizationContext,
    projectId: unknown,
    baselineId: unknown,
  ): Promise<EngineeringBaselineMember[]> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const baseline = await this.requireBaseline(scopedProjectId, baselineId);
    return memberRepository.listMembers(baseline.id);
  }

  /**
   * Adds one engineering object to a DRAFT baseline, capturing its state.
   *
   * The snapshot is taken here, from the object as it stands right now. That is
   * the point at which "what exactly did we baseline?" becomes answerable, and
   * it is why membership cannot be added after activation — a member added later
   * would carry a snapshot from a different moment than its siblings, and the
   * baseline would no longer describe a single coherent state.
   */
  async addBaselineMember(
    context: OrganizationContext,
    projectId: unknown,
    baselineId: unknown,
    input: unknown,
  ): Promise<EngineeringBaselineMember> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const request = parseOrThrow(addBaselineMemberRequestSchema, input, "Invalid baseline member");

    return prisma.$transaction(async (tx) => {
      const baseline = await this.requireBaseline(scopedProjectId, baselineId, tx);
      this.requireDraft(baseline, "changed");

      // Resolved inside the already-scoped project: an id belonging to another
      // project simply does not resolve, so a baseline can never reach across a
      // tenancy boundary.
      const resolved = await memberRepository.loadBaselineableObjects(
        scopedProjectId,
        [{ nodeType: request.nodeType, nodeId: request.nodeId }],
        tx,
      );
      const object = resolved.get(memberKey(request.nodeType, request.nodeId));
      if (!object) {
        throw new ValidationError(
          `That ${request.nodeType.replaceAll("_", " ").toLowerCase()} does not exist in this project.`,
        );
      }

      const member = await memberRepository.createMember(
        {
          baselineId: baseline.id,
          nodeType: request.nodeType,
          nodeId: request.nodeId,
          identifierSnapshot: object.identifier,
          labelSnapshot: object.label,
          stateSnapshot: object.state,
          fingerprint: object.fingerprint,
          revisionSnapshot: object.revision,
        },
        tx,
      );

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          DRIFT_AUDIT_ACTIONS.baselineMemberAdded,
          BASELINE_ENTITY_TYPE,
          baseline.id,
          {
            memberId: member.id,
            nodeType: member.nodeType,
            nodeId: member.nodeId,
            identifier: member.identifierSnapshot,
          },
        ),
        tx,
      );

      return member;
    });
  }

  async removeBaselineMember(
    context: OrganizationContext,
    projectId: unknown,
    baselineId: unknown,
    memberId: unknown,
  ): Promise<void> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const id = parseOrThrow(entityIdSchema, memberId, "Invalid member id");

    await prisma.$transaction(async (tx) => {
      const baseline = await this.requireBaseline(scopedProjectId, baselineId, tx);
      this.requireDraft(baseline, "changed");

      const member = await memberRepository.findMemberInBaseline(baseline.id, id, tx);
      if (!member) {
        throw new NotFoundError("That member was not found on this baseline.");
      }

      await memberRepository.deleteMember(member.id, tx);

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          DRIFT_AUDIT_ACTIONS.baselineMemberRemoved,
          BASELINE_ENTITY_TYPE,
          baseline.id,
          { memberId: member.id, nodeType: member.nodeType, nodeId: member.nodeId },
        ),
        tx,
      );
    });
  }

  // --- Activation and supersession -----------------------------------------

  /**
   * Fixes the baseline as the approved engineering basis.
   *
   * Refuses if another baseline is already ACTIVE, unless the caller explicitly
   * asks to supersede it. **Nothing is replaced silently**: swapping out an
   * engineering basis as a side effect of activating a new one is exactly the
   * kind of quiet state change that makes a later drift result impossible to
   * interpret.
   */
  async activateBaseline(
    context: OrganizationContext,
    projectId: unknown,
    baselineId: unknown,
    input: unknown,
  ): Promise<EngineeringBaseline> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const { supersedeActive } = parseOrThrow(
      activateBaselineRequestSchema,
      input ?? {},
      "Invalid activation request",
    );

    return prisma.$transaction(async (tx) => {
      const baseline = await this.requireBaseline(scopedProjectId, baselineId, tx);

      if (!canTransitionBaseline(baseline.status, "ACTIVE")) {
        throw new ConflictError(
          `A ${baseline.status.toLowerCase()} baseline cannot be activated.`,
        );
      }

      const members = await memberRepository.listMembers(baseline.id, tx);
      if (members.length === 0) {
        throw new ValidationError(
          "A baseline with no members records no engineering basis, so there would be nothing to compare against.",
        );
      }

      const active = await baselineRepository.findActiveBaseline(scopedProjectId, tx);
      if (active && active.id !== baseline.id) {
        if (!supersedeActive) {
          throw new ConflictError(
            `Baseline ${active.identifier} is already active. Supersede it explicitly, or send supersedeActive to do both in one step.`,
          );
        }

        await baselineRepository.supersedeBaseline(active.id, baseline.id, tx);
        await auditLogRepository.recordAuditEvent(
          artifactAuditEvent(
            context,
            DRIFT_AUDIT_ACTIONS.baselineSuperseded,
            BASELINE_ENTITY_TYPE,
            active.id,
            { supersededById: baseline.id, reason: "Replaced on activation" },
          ),
          tx,
        );
      }

      const activated = await baselineRepository.activateBaseline(
        baseline.id,
        context.actorId,
        tx,
      );

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          DRIFT_AUDIT_ACTIONS.baselineActivated,
          BASELINE_ENTITY_TYPE,
          activated.id,
          {
            identifier: activated.identifier,
            memberCount: members.length,
            supersededBaselineId: active && active.id !== baseline.id ? active.id : null,
          },
        ),
        tx,
      );

      return activated;
    });
  }

  async supersedeBaseline(
    context: OrganizationContext,
    projectId: unknown,
    baselineId: unknown,
  ): Promise<EngineeringBaseline> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);

    return prisma.$transaction(async (tx) => {
      const baseline = await this.requireBaseline(scopedProjectId, baselineId, tx);

      if (!canTransitionBaseline(baseline.status, "SUPERSEDED")) {
        throw new ConflictError(
          `A ${baseline.status.toLowerCase()} baseline cannot be superseded.`,
        );
      }

      const superseded = await baselineRepository.supersedeBaseline(baseline.id, null, tx);

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          DRIFT_AUDIT_ACTIONS.baselineSuperseded,
          BASELINE_ENTITY_TYPE,
          superseded.id,
          { identifier: superseded.identifier, supersededById: null },
        ),
        tx,
      );

      return superseded;
    });
  }

  // --- Observations ---------------------------------------------------------

  async recordObservation(
    context: OrganizationContext,
    projectId: unknown,
    input: unknown,
  ): Promise<OperationalObservation> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const data = parseOrThrow(createObservationRequestSchema, input, "Invalid observation");

    return prisma.$transaction(async (tx) => {
      const subject = data.subject ?? null;
      if (subject) {
        const exists = await observationRepository.observationSubjectExistsInProject(
          subject.type,
          subject.id,
          scopedProjectId,
          tx,
        );
        if (!exists) {
          throw new ValidationError(
            `That ${subject.type.replaceAll("_", " ").toLowerCase()} does not exist in this project.`,
          );
        }
      }

      const observation = await observationRepository.createObservation(
        {
          projectId: scopedProjectId,
          identifier: data.identifier,
          title: data.title,
          description: data.description,
          observationType: data.observationType,
          source: data.source ?? null,
          observedAt: new Date(data.observedAt),
          subjectLabel: data.subjectLabel ?? null,
          numericValue: data.numericValue ?? null,
          unit: data.unit ?? null,
          textValue: data.textValue ?? null,
          subject,
          createdById: context.actorId,
        },
        tx,
      );

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          DRIFT_AUDIT_ACTIONS.observationCreated,
          OBSERVATION_ENTITY_TYPE,
          observation.id,
          {
            identifier: observation.identifier,
            observationType: observation.observationType,
            projectId: scopedProjectId,
          },
        ),
        tx,
      );

      return observation;
    });
  }

  async listObservations(
    context: OrganizationContext,
    projectId: unknown,
    filter: { status?: unknown; observationType?: unknown } = {},
  ): Promise<OperationalObservation[]> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);

    const optional = <T>(value: unknown, parse: (v: unknown) => T): T | undefined =>
      value === undefined || value === null || value === "" ? undefined : parse(value);

    const status = optional(filter.status, (value) =>
      parseOrThrow(observationStatusSchema, value, "Invalid observation status filter"),
    );
    const observationType = optional(filter.observationType, (value) =>
      parseOrThrow(observationTypeSchema, value, "Invalid observation type filter"),
    );

    return observationRepository.listObservationsInProject(scopedProjectId, {
      ...(status ? { status } : {}),
      ...(observationType ? { observationType } : {}),
    });
  }

  async getObservation(
    context: OrganizationContext,
    projectId: unknown,
    observationId: unknown,
  ): Promise<OperationalObservation> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    return this.requireObservation(scopedProjectId, observationId);
  }

  /**
   * Edits an observation's substance.
   *
   * Only while RECORDED. Once an engineer has reviewed or rejected it, the
   * record is a determination about evidence, and editing it underneath that
   * determination would rewrite history.
   */
  async updateObservation(
    context: OrganizationContext,
    projectId: unknown,
    observationId: unknown,
    input: unknown,
  ): Promise<OperationalObservation> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const data = parseOrThrow(updateObservationRequestSchema, input, "Invalid observation update");

    return prisma.$transaction(async (tx) => {
      const existing = await this.requireObservation(scopedProjectId, observationId, tx);

      if (!isObservationEditable(existing.status)) {
        throw new ConflictError(
          `This observation is ${existing.status.toLowerCase()}. Its content is fixed, because an engineer has already made a determination about it — record a new observation instead.`,
        );
      }

      const observation = await observationRepository.updateObservation(
        existing.id,
        {
          ...(data.title !== undefined ? { title: data.title } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.observationType !== undefined
            ? { observationType: data.observationType }
            : {}),
          ...(data.source !== undefined ? { source: data.source ?? null } : {}),
          ...(data.observedAt !== undefined ? { observedAt: new Date(data.observedAt) } : {}),
          ...(data.subjectLabel !== undefined ? { subjectLabel: data.subjectLabel ?? null } : {}),
          ...(data.numericValue !== undefined ? { numericValue: data.numericValue ?? null } : {}),
          ...(data.unit !== undefined ? { unit: data.unit ?? null } : {}),
          ...(data.textValue !== undefined ? { textValue: data.textValue ?? null } : {}),
        },
        tx,
      );

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          DRIFT_AUDIT_ACTIONS.observationUpdated,
          OBSERVATION_ENTITY_TYPE,
          observation.id,
          { changedFields: Object.keys(data) },
        ),
        tx,
      );

      return observation;
    });
  }

  /** An engineer accepts the observation as a record of what happened. */
  async reviewObservation(
    context: OrganizationContext,
    projectId: unknown,
    observationId: unknown,
    input: unknown,
  ): Promise<OperationalObservation> {
    return this.transitionObservation(context, projectId, observationId, "REVIEWED", input);
  }

  /** An engineer does not accept it. Kept, not deleted. */
  async rejectObservation(
    context: OrganizationContext,
    projectId: unknown,
    observationId: unknown,
    input: unknown,
  ): Promise<OperationalObservation> {
    return this.transitionObservation(context, projectId, observationId, "REJECTED", input);
  }

  private async transitionObservation(
    context: OrganizationContext,
    projectId: unknown,
    observationId: unknown,
    to: "REVIEWED" | "REJECTED",
    input: unknown,
  ): Promise<OperationalObservation> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const { note } = parseOrThrow(
      reviewObservationRequestSchema,
      input ?? {},
      "Invalid review request",
    );

    return prisma.$transaction(async (tx) => {
      const existing = await this.requireObservation(scopedProjectId, observationId, tx);

      if (!canTransitionObservation(existing.status, to)) {
        throw new ConflictError(
          `An observation that is ${existing.status.toLowerCase()} cannot be ${to.toLowerCase()}.`,
        );
      }

      const observation = await observationRepository.transitionObservation(
        existing.id,
        to,
        context.actorId,
        tx,
      );

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          to === "REVIEWED"
            ? DRIFT_AUDIT_ACTIONS.observationReviewed
            : DRIFT_AUDIT_ACTIONS.observationRejected,
          OBSERVATION_ENTITY_TYPE,
          observation.id,
          { from: existing.status, to, note: note ?? null },
        ),
        tx,
      );

      return observation;
    });
  }

  // --- Drift evaluation -----------------------------------------------------

  /**
   * Compares current state against a baseline and appends an immutable
   * assessment.
   *
   * Explicit: nothing triggers this on a page load, and nothing schedules it. A
   * drift assessment is a claim about a moment, and silently recomputing one
   * would make "when did this diverge, and from what?" unanswerable.
   */
  async evaluateDrift(
    context: OrganizationContext,
    projectId: unknown,
    request: unknown,
  ): Promise<DriftReport> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const { baselineId } = parseOrThrow(
      evaluateDriftRequestSchema,
      request ?? {},
      "Invalid drift evaluation request",
    );

    const resolved = await this.resolveEvaluation(scopedProjectId, baselineId);
    const findings = this.evaluate(resolved);
    const status = driftStatusFor(findings);
    const fingerprint = driftFingerprint(resolved.basis);
    const counts = tally(findings);

    const assessment = await prisma.$transaction(async (tx) => {
      const written = await assessmentRepository.createAssessment(
        {
          projectId: scopedProjectId,
          baselineId: resolved.baseline.id,
          status,
          driftVersion: DRIFT_VERSION,
          fingerprint,
          basis: resolved.basis,
          evaluatedById: context.actorId,
          ...counts,
        },
        tx,
      );

      await assessmentRepository.createFindings(written.id, findings, tx);

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          DRIFT_AUDIT_ACTIONS.driftEvaluated,
          DRIFT_ENTITY_TYPE,
          written.id,
          {
            projectId: scopedProjectId,
            baselineId: resolved.baseline.id,
            status,
            driftVersion: DRIFT_VERSION,
            findingCount: counts.findingCount,
            reviewRequiredCount: counts.reviewRequiredCount,
          },
        ),
        tx,
      );

      return written;
    });

    // Read the findings back so the report describes rows that are committed,
    // not the in-memory intent to write them.
    const persisted = await assessmentRepository.listFindings(assessment.id);

    return {
      assessment,
      // Just written from this basis, so it is current by construction.
      freshness: "CURRENT",
      findings: persisted,
      basis: resolved.basis,
    };
  }

  /**
   * The most recent assessment, with freshness derived at read time.
   *
   * Returns a distinct `NOT_EVALUATED` shape when nothing has been run: zero
   * findings would read as "we compared everything and nothing has drifted",
   * which is a far stronger claim than "nobody has run this".
   *
   * Reading never evaluates. A stale assessment is reported as stale and left
   * exactly as it was written.
   */
  async getLatestDriftAssessment(
    context: OrganizationContext,
    projectId: unknown,
    baselineId?: unknown,
  ): Promise<LatestDrift> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const scopedBaselineId =
      baselineId === undefined || baselineId === null || baselineId === ""
        ? undefined
        : parseOrThrow(entityIdSchema, baselineId, "Invalid baseline id");

    const latest = await assessmentRepository.findLatestAssessment(
      scopedProjectId,
      scopedBaselineId,
    );
    if (!latest) {
      return { status: "NOT_EVALUATED", projectId: scopedProjectId, driftVersion: DRIFT_VERSION };
    }

    return this.buildReport(scopedProjectId, latest);
  }

  /** Every assessment, newest first. Nothing is ever overwritten. */
  async listDriftHistory(
    context: OrganizationContext,
    projectId: unknown,
    baselineId?: unknown,
  ): Promise<DriftAssessment[]> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const scopedBaselineId =
      baselineId === undefined || baselineId === null || baselineId === ""
        ? undefined
        : parseOrThrow(entityIdSchema, baselineId, "Invalid baseline id");

    return assessmentRepository.listAssessments(scopedProjectId, scopedBaselineId);
  }

  /**
   * One assessment in full, shown exactly as it was recorded.
   *
   * Never re-judged under today's state — the value of a drift record is that it
   * says what had diverged *then*. Its freshness against the present is reported
   * alongside, so a reader sees both.
   */
  async explainDrift(
    context: OrganizationContext,
    projectId: unknown,
    assessmentId: unknown,
  ): Promise<DriftReport> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const id = parseOrThrow(driftIdSchema, assessmentId, "Invalid assessment id");

    const assessment = await assessmentRepository.findAssessmentInProject(scopedProjectId, id);
    if (!assessment) {
      throw new NotFoundError(`Drift assessment ${id} was not found.`);
    }

    return this.buildReport(scopedProjectId, assessment);
  }

  // --- Internals ------------------------------------------------------------

  /**
   * Resolves one baseline, its membership, and every member's current state
   * — the one read `getBaseline` and `compareBaseline` both need, kept in one
   * place so "what does this baseline's membership look like against the
   * record right now" is answered identically by both.
   */
  private async resolveMembersWithCurrent(
    projectId: string,
    baselineId: unknown,
  ): Promise<{
    baseline: EngineeringBaseline;
    members: EngineeringBaselineMember[];
    current: Map<string, BaselineableObject>;
  }> {
    const baseline = await this.requireBaseline(projectId, baselineId);
    const members = await memberRepository.listMembers(baseline.id);
    const current = await memberRepository.loadBaselineableObjects(
      projectId,
      members.map((member) => ({ nodeType: member.nodeType, nodeId: member.nodeId })),
    );
    return { baseline, members, current };
  }

  private async requireBaseline(
    projectId: string,
    baselineId: unknown,
    client?: Parameters<typeof baselineRepository.findBaselineInProject>[2],
  ): Promise<EngineeringBaseline> {
    const id = parseOrThrow(entityIdSchema, baselineId, "Invalid baseline id");
    const baseline = await baselineRepository.findBaselineInProject(projectId, id, client);
    if (!baseline) {
      throw new NotFoundError(`Baseline ${id} was not found.`);
    }
    return baseline;
  }

  private async requireObservation(
    projectId: string,
    observationId: unknown,
    client?: Parameters<typeof observationRepository.findObservationInProject>[2],
  ): Promise<OperationalObservation> {
    const id = parseOrThrow(entityIdSchema, observationId, "Invalid observation id");
    const observation = await observationRepository.findObservationInProject(
      projectId,
      id,
      client,
    );
    if (!observation) {
      throw new NotFoundError(`Observation ${id} was not found.`);
    }
    return observation;
  }

  /** The membership rule, in one place: only a DRAFT baseline may change. */
  private requireDraft(baseline: EngineeringBaseline, verb: string): void {
    if (!isBaselineMembershipEditable(baseline.status)) {
      throw new ConflictError(
        `Baseline ${baseline.identifier} is ${baseline.status.toLowerCase()} and cannot be ${verb}. An active baseline is the fixed reference every drift assessment is computed against; record a new baseline instead.`,
      );
    }
  }

  private async buildReport(
    projectId: string,
    assessment: DriftAssessment,
  ): Promise<DriftReport> {
    const [findings, storedBasis, freshness] = await Promise.all([
      assessmentRepository.listFindings(assessment.id),
      assessmentRepository.readAssessmentBasis(assessment),
      this.deriveFreshness(projectId, assessment),
    ]);

    return { assessment, freshness, findings, basis: storedBasis };
  }

  /**
   * Whether the stored assessment still rests on the state it was written from.
   *
   * A basis that cannot be resolved reports UNKNOWN rather than pretending
   * either way — the one thing this must never do is answer "current" because it
   * failed to check.
   */
  private async deriveFreshness(
    projectId: string,
    assessment: DriftAssessment,
  ): Promise<DriftFreshness> {
    try {
      const resolved = await this.resolveEvaluation(projectId, assessment.baselineId);
      return driftFreshnessOf(
        assessment.fingerprint,
        driftFingerprint(resolved.basis),
        assessment.driftVersion,
      );
    } catch {
      return "UNKNOWN";
    }
  }

  /**
   * Resolves everything one evaluation compares.
   *
   * Three batched reads and no more: the baseline's members, the current state
   * of every member (one query per node type present), and the project's
   * observations. Nothing is loaded per object.
   */
  private async resolveEvaluation(
    projectId: string,
    baselineId: string,
  ): Promise<ResolvedEvaluation> {
    const baseline = await baselineRepository.findBaselineInProject(projectId, baselineId);
    if (!baseline) {
      throw new NotFoundError(`Baseline ${baselineId} was not found.`);
    }

    const members = await memberRepository.listMembers(baseline.id);
    const refs = members.map((member) => ({
      nodeType: member.nodeType,
      nodeId: member.nodeId,
    }));

    const [current, observations, changeContext] = await Promise.all([
      memberRepository.loadBaselineableObjects(projectId, refs),
      observationRepository.listObservationsForEvaluation(projectId),
      // Declared impacts only. Nothing here runs or reads a change-impact
      // analysis — the change engine remains the change engine.
      assessmentRepository.loadChangeContext(projectId, refs),
    ]);

    const basis: DriftEvaluationBasis = {
      baselineId: baseline.id,
      baselineIdentifier: baseline.identifier,
      baselineName: baseline.name,
      baselineStatus: baseline.status,
      members: members
        .map((member) => ({
          memberId: member.id,
          nodeType: member.nodeType,
          nodeId: member.nodeId,
          identifier: member.identifierSnapshot,
          baselinedFingerprint: member.fingerprint,
          currentFingerprint:
            current.get(memberKey(member.nodeType, member.nodeId))?.fingerprint ?? null,
        }))
        .sort((a, b) => (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0)),
      observations: observations
        .map((observation) => ({
          observationId: observation.id,
          identifier: observation.identifier,
          status: observation.status,
          subjectType: observation.subject?.type ?? null,
          subjectId: observation.subject?.id ?? null,
          revision: observation.updatedAt.toISOString(),
        }))
        .sort((a, b) =>
          a.observationId < b.observationId ? -1 : a.observationId > b.observationId ? 1 : 0,
        ),
    };

    return { baseline, members, current, observations, changeContext, basis };
  }

  /**
   * Applies the rules to a resolved evaluation.
   *
   * Pure: it reads the resolved state and returns findings. No database, no
   * clock, no randomness — the same state produces the same findings in the same
   * order, which is what makes two evaluations comparable.
   */
  private evaluate(resolved: ResolvedEvaluation): DraftFinding[] {
    const drafts: DraftFinding[] = [];

    /**
     * Records one rule outcome.
     *
     * The registry is the authority: category, status, severity and the base
     * markers all come from the rule. An unknown rule id is a programming error
     * and is refused loudly rather than silently dropping a comparison.
     */
    const emitFinding = (
      ruleId: string,
      detail: {
        baselineSubject?: DriftSubject | null;
        observationSubject?: DriftSubject | null;
        expectedValue?: string | null;
        observedValue?: string | null;
        explanation: string;
        extraBasis?: readonly DriftBasisMarker[];
      },
    ): void => {
      const rule = driftRule(ruleId);
      if (!rule) {
        throw new DriftEvaluationFailure(
          "The drift evaluation referenced a rule that is not defined in the registry.",
        );
      }

      drafts.push({
        ruleId: rule.id,
        category: rule.category,
        status: rule.status,
        severity: severityForDriftStatus(rule.status),
        baselineSubject: detail.baselineSubject ?? null,
        observationSubject: detail.observationSubject ?? null,
        expectedValue: detail.expectedValue ?? null,
        observedValue: detail.observedValue ?? null,
        explanation: detail.explanation,
        basis: normalizeDriftBasis([...rule.basis, ...(detail.extraBasis ?? [])]),
        sequence: 0,
      });
    };

    const { baseline, members, current, observations } = resolved;

    const reviewed = observations.filter((observation) => observation.status === "REVIEWED");
    const unreviewed = observations.filter((observation) => observation.status === "RECORDED");

    // --- Scope ------------------------------------------------------------
    emitFinding("DR-SCP-001", {
      explanation: `Compared ${members.length} baselined object(s) from ${baseline.identifier} against ${reviewed.length} reviewed observation(s). ${unreviewed.length} observation(s) are still unreviewed and were not compared.`,
    });

    // --- Baseline members -------------------------------------------------
    const changedMembers = new Set<string>();

    for (const member of members) {
      const subject: DriftSubject = {
        type: member.nodeType,
        id: member.nodeId,
        identifier: member.identifierSnapshot,
        label: member.labelSnapshot,
      };
      const now = current.get(memberKey(member.nodeType, member.nodeId)) ?? null;

      if (!now) {
        emitFinding("DR-BAS-001", {
          baselineSubject: subject,
          explanation: `${describeMember(member)} was part of baseline ${baseline.identifier} but can no longer be resolved in this project. Whether it was removed or is out of scope cannot be determined from the record.`,
        });
        continue;
      }

      if (now.fingerprint !== member.fingerprint) {
        changedMembers.add(memberKey(member.nodeType, member.nodeId));

        const stateNote =
          member.stateSnapshot && now.state && member.stateSnapshot !== now.state
            ? ` Its state moved from ${member.stateSnapshot} to ${now.state}.`
            : "";

        emitFinding("DR-BAS-002", {
          baselineSubject: subject,
          expectedValue: member.fingerprint.slice(0, 16),
          observedValue: now.fingerprint.slice(0, 16),
          explanation: `${describeMember(member)} has changed since baseline ${baseline.identifier} was activated.${stateNote} This records that the approved basis and the current object differ; it is not a finding that the change was wrong.`,
        });

        // Supplier-side state changes get their own category so a reader can
        // tell "the supply basis moved" from "the design moved".
        if (member.nodeType === "SUPPLIER_QUALIFICATION" && member.stateSnapshot !== now.state) {
          emitFinding("DR-SUP-001", {
            baselineSubject: subject,
            expectedValue: member.stateSnapshot,
            observedValue: now.state,
            explanation: `Qualification "${member.labelSnapshot}" was baselined as ${member.stateSnapshot ?? "unknown"} and is now ${now.state ?? "unknown"}. This is a recorded state change, not a finding that the item is unqualified — a lapsed qualification may have been renewed under a separate record.`,
          });
        }
        if (member.nodeType === "SUPPLIED_ITEM" && member.stateSnapshot !== now.state) {
          emitFinding("DR-SUP-002", {
            baselineSubject: subject,
            expectedValue: member.stateSnapshot,
            observedValue: now.state,
            explanation: `Supplied item ${member.identifierSnapshot ?? member.nodeId} was baselined as ${member.stateSnapshot ?? "unknown"} and is now ${now.state ?? "unknown"}.`,
          });
        }

        if (member.nodeType === "VERIFICATION_ACTIVITY") {
          emitFinding("DR-CTX-003", {
            baselineSubject: subject,
            explanation: `Verification activity ${member.identifierSnapshot ?? member.nodeId} is itself part of the baseline and has changed. It may already cover what needs re-verifying; no activity has been created or altered.`,
          });
        }

        // Change context for the object that drifted. Consumed, not computed:
        // these are declared impacts an engineer entered, not analysis output.
        const changes = resolved.changeContext.get(memberKey(member.nodeType, member.nodeId));
        if (changes && changes.length > 0) {
          emitFinding("DR-CTX-001", {
            baselineSubject: subject,
            explanation: `${describeMember(member)} is declared as impacted by ${changes.map((change) => `${change.identifier} (${change.status.toLowerCase().replaceAll("_", " ")})`).join(", ")}. It may have changed through that change request. No impact analysis was run or read.`,
          });
        }
      } else {
        emitFinding("DR-BAS-003", {
          baselineSubject: subject,
          expectedValue: member.fingerprint.slice(0, 16),
          observedValue: now.fingerprint.slice(0, 16),
          explanation: `${describeMember(member)} still matches the state it was baselined in.`,
        });
      }
    }

    // --- Observations -----------------------------------------------------
    const expectationMembers = new Map(
      members
        .filter((member) => member.nodeType === "DECISION_EXPECTATION")
        .map((member) => [member.nodeId, member]),
    );
    const designMembers = new Map(
      members
        .filter((member) => member.nodeType === "DESIGN_ITEM")
        .map((member) => [member.nodeId, member]),
    );

    for (const observation of reviewed) {
      const observationSubject: DriftSubject = {
        type: "OPERATIONAL_OBSERVATION",
        id: observation.id,
        identifier: observation.identifier,
        label: observation.title,
      };

      if (!observation.subject) continue;

      if (observation.subject.type === "DECISION_EXPECTATION") {
        const member = expectationMembers.get(observation.subject.id);
        const expectation = member
          ? current.get(memberKey("DECISION_EXPECTATION", observation.subject.id))
          : undefined;

        // The expectation's comparison terms come from the *current* object,
        // read through the same loader the baseline used.
        const terms = expectation ? expectationTermsFor(expectation) : null;

        const baselineSubject: DriftSubject | null = member
          ? {
              type: member.nodeType,
              id: member.nodeId,
              identifier: member.identifierSnapshot,
              label: member.labelSnapshot,
            }
          : null;

        if (!terms) {
          emitFinding("DR-EXP-003", {
            baselineSubject,
            observationSubject,
            observedValue: formatValue(observation.numericValue, observation.unit),
            explanation: `Observation ${observation.identifier} concerns an expectation that is not part of baseline ${baseline.identifier}, or whose comparison terms could not be read. No comparison was performed.`,
            extraBasis: ["EXPECTATION_OPERATOR_ABSENT"],
          });
          continue;
        }

        const result = compareObservedValue({
          operator: terms.operator,
          expectedValue: terms.expectedValue,
          expectedUnit: terms.unit,
          observedValue: observation.numericValue,
          observedUnit: observation.unit,
        });

        const expectedText = describeExpectation(terms.operator, terms.expectedValue, terms.unit);
        const observedText = formatValue(observation.numericValue, observation.unit);

        if (result.outcome === "NOT_COMPARABLE") {
          emitFinding("DR-EXP-003", {
            baselineSubject,
            observationSubject,
            expectedValue: expectedText,
            observedValue: observedText,
            explanation: `Observation ${observation.identifier} could not be compared against expectation "${terms.statement}". ${result.reason ?? ""} No conversion is performed and no comparison is assumed.`.trim(),
          });
        } else if (result.outcome === "VIOLATED") {
          emitFinding("DR-EXP-001", {
            baselineSubject,
            observationSubject,
            expectedValue: expectedText,
            observedValue: observedText,
            explanation: `Expectation "${terms.statement}" records ${expectedText}; observation ${observation.identifier} recorded ${observedText}. The comparison does not hold. The expectation's status has not been changed — whether this constitutes a breach is an engineering determination.`,
          });
        } else {
          emitFinding("DR-EXP-002", {
            baselineSubject,
            observationSubject,
            expectedValue: expectedText,
            observedValue: observedText,
            explanation: `Expectation "${terms.statement}" records ${expectedText}; observation ${observation.identifier} recorded ${observedText}. The comparison holds. This does not set the expectation to HELD.`,
          });
        }

        // Assumptions behind the same decision are context an engineer will
        // want; nothing here judges them.
        emitFinding("DR-CTX-002", {
          baselineSubject,
          observationSubject,
          explanation: `Observation ${observation.identifier} concerns an expectation of a recorded decision. Any assumptions behind that decision are worth re-reading; their validity has not been evaluated here, and assumption monitoring remains responsible for them.`,
        });
        continue;
      }

      if (observation.subject.type === "DESIGN_ITEM") {
        const member = designMembers.get(observation.subject.id);

        if (!member) {
          emitFinding("DR-CFG-002", {
            observationSubject,
            explanation: `Observation ${observation.identifier} concerns a design item that is not part of baseline ${baseline.identifier}. There is nothing approved to compare it against.`,
          });
          continue;
        }

        if (
          observation.observationType === "CONFIGURATION_OBSERVATION" &&
          changedMembers.has(memberKey("DESIGN_ITEM", observation.subject.id))
        ) {
          emitFinding("DR-CFG-001", {
            baselineSubject: {
              type: member.nodeType,
              id: member.nodeId,
              identifier: member.identifierSnapshot,
              label: member.labelSnapshot,
            },
            observationSubject,
            expectedValue: member.stateSnapshot,
            observedValue: observation.textValue ?? observation.subjectLabel,
            explanation: `Configuration observation ${observation.identifier} concerns ${describeMember(member)}, which has changed since it was baselined. Whether the observation describes the baselined state, the current state, or a third configuration cannot be determined from the record.`,
          });
        }
        continue;
      }

      if (observation.subject.type === "SUPPLIED_ITEM") {
        const member = members.find(
          (candidate) =>
            candidate.nodeType === "SUPPLIED_ITEM" && candidate.nodeId === observation.subject?.id,
        );
        const isMeasurement =
          observation.observationType === "MEASUREMENT" ||
          observation.observationType === "PERFORMANCE_RESULT";

        if (member && isMeasurement && observation.numericValue !== null) {
          emitFinding("DR-VAL-001", {
            baselineSubject: {
              type: member.nodeType,
              id: member.nodeId,
              identifier: member.identifierSnapshot,
              label: member.labelSnapshot,
            },
            observationSubject,
            observedValue: formatValue(observation.numericValue, observation.unit),
            explanation: `Measurement ${observation.identifier} recorded ${formatValue(observation.numericValue, observation.unit)} for ${describeMember(member)}. No baselined expectation covers this item, so the value is surfaced rather than compared.`,
            extraBasis: ["EXPECTATION_OPERATOR_ABSENT"],
          });
        }
      }
    }

    // --- Observation hygiene ----------------------------------------------
    if (unreviewed.length > 0) {
      emitFinding("DR-OBS-001", {
        explanation: `${unreviewed.length} observation(s) are recorded but not reviewed, so no comparison was performed against them. An unreviewed observation is somebody's report, not established engineering evidence.`,
      });
    }

    return order(drafts);
  }
}

/**
 * The comparison terms an expectation carries, read off the loaded object.
 *
 * No cache and no second query: the terms were loaded alongside the fingerprint,
 * so what a rule compares against is provably the same read the fingerprint was
 * computed from.
 */
function expectationTermsFor(object: BaselineableObject): {
  statement: string;
  operator: ComparisonOperator | null;
  expectedValue: string | null;
  unit: string | null;
} | null {
  if (!object.comparisonTerms) return null;
  return { statement: object.label, ...object.comparisonTerms };
}

/** "REQ-100 (Requirement)". */
function describeMember(member: {
  nodeType: BaselineMemberType;
  identifierSnapshot: string | null;
  labelSnapshot: string;
}): string {
  const kind = member.nodeType.replaceAll("_", " ").toLowerCase();
  return member.identifierSnapshot
    ? `${member.identifierSnapshot} (${kind})`
    : `"${member.labelSnapshot}" (${kind})`;
}

/** "842 °C", or "—" where nothing numeric was recorded. */
function formatValue(value: string | null, unit: string | null): string {
  if (value === null) return "—";
  return unit ? `${value} ${unit}` : value;
}

/**
 * Assigns the deterministic order and writes the sequence with each row.
 *
 * Nothing falls back to insertion order, so two evaluations over the same state
 * list their findings identically.
 */
function order(drafts: DraftFinding[]): DraftFinding[] {
  return [...drafts]
    .sort(compareDriftFindings)
    .map((draft, index) => ({ ...draft, sequence: index }));
}

function tally(findings: readonly DraftFinding[]) {
  return {
    findingCount: findings.length,
    reviewRequiredCount: findings.filter((f) => f.status === "REVIEW_REQUIRED").length,
    informationalCount: findings.filter((f) => f.status === "INFORMATIONAL").length,
    unknownCount: findings.filter((f) => f.status === "UNKNOWN").length,
  };
}

export const driftDetectionService = new DriftDetectionService();
