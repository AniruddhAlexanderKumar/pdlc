import {
  ACTIVE_CHANGE_REQUEST_STATUSES,
  canTransitionSurveillanceTarget,
  dependencyRulesFor,
  entityIdSchema,
  eventTypeForSource,
  hasCertificationReview,
  hasVerificationReadiness,
  isSurveillanceTargetOpen,
  resolveSurveillanceRequestSchema,
  acknowledgeSurveillanceRequestSchema,
  detectSurveillanceRequestSchema,
  reEvaluateSurveillanceRequestSchema,
  TECHNICAL_READINESS_GATES,
  type DetectionSummary,
  type SentinelEvent,
  type SurveillanceEventType,
  type SurveillanceSourceType,
  type SurveillanceTarget,
  type SurveillanceTargetType,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError, NotFoundError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import * as baselineRepository from "@/server/repositories/engineering-baseline.repository";
import * as baselineMemberRepository from "@/server/repositories/baseline-member.repository";
import * as impactAnalysisRepository from "@/server/repositories/impact-analysis.repository";
import * as monitoringRepository from "@/server/repositories/assumption-monitoring.repository";
import * as certificationProgramRepository from "@/server/repositories/certification-program.repository";
import * as certificationBasisRepository from "@/server/repositories/certification-basis.repository";
import * as certificationReviewRepository from "@/server/repositories/certification-review.repository";
import * as verificationReadinessRepository from "@/server/repositories/verification-readiness.repository";
import * as technicalReadinessRepository from "@/server/repositories/technical-readiness.repository";
import * as sentinelEventRepository from "@/server/repositories/sentinel-event.repository";
import * as surveillanceTargetRepository from "@/server/repositories/surveillance-target.repository";
import type {
  SurveillanceCounts,
  SurveillanceTargetWithSource,
} from "@/server/repositories/surveillance-target.repository";
import { assumptionMonitoringService } from "./assumption-monitoring.service";
import { certificationReviewService } from "./certification-review.service";
import { changeImpactAnalysisService } from "./change-impact-analysis.service";
import { driftDetectionService } from "./drift-detection.service";
import { technicalReadinessService } from "./technical-readiness.service";
import { verificationReadinessService } from "./verification-readiness.service";
import { parseOrThrow } from "@/server/validation";
import {
  artifactAuditEvent,
  requireProjectInOrganization,
  requireProjectApproveAccess,
  requireProjectWriteAccess,
} from "./project-scope";

/**
 * The Decision Sentinel.
 *
 * Turns "engineers manually run analysis" into "the system continuously
 * knows which analyses or reviews have become relevant because the
 * underlying engineering state changed." Nothing more.
 *
 * **What this service never does.** It never writes to a Requirement, a
 * Decision, an Assumption, a Baseline, a readiness verdict, or a
 * certification disposition. It never concludes "not ready", "non-compliant"
 * or "invalid" — those conclusions belong entirely to the six engines it
 * points at. `reEvaluateTarget` is the one place this service calls another
 * engine, and it calls the real one, unmodified — there is no second
 * readiness/impact/drift/assumption/certification calculation anywhere in
 * this file.
 *
 * **Detection has two phases**, and they are genuinely separate concerns:
 *
 *   1. *What changed* — `SentinelEvent` rows, sourced from the objects'
 *      own `updatedAt` revisions (content changes) and from `AuditLog`
 *      (relationship changes). Idempotent by construction: the same
 *      revision is recorded at most once, enforced by a database unique
 *      constraint, not a check-then-insert.
 *   2. *What it might affect* — for each new event, `SURVEILLANCE_DEPENDENCY_RULES`
 *      names candidate target domains, and each candidate is confirmed
 *      against that domain's own real, already-stored assessment basis
 *      before a `SurveillanceTarget` is ever created. A candidate the
 *      registry allows but whose current assessment does not actually
 *      reference the changed object produces nothing — "unrelated object
 *      creates no target" is a hard requirement, not a nicety.
 */

export const SENTINEL_EVENT_ENTITY_TYPE = "SentinelEvent";
export const SURVEILLANCE_TARGET_ENTITY_TYPE = "SurveillanceTarget";

export const SENTINEL_AUDIT_ACTIONS = {
  detectionRun: "sentinel.detection_run",
  targetDetected: "sentinel.target_detected",
  targetUpdated: "sentinel.target_updated",
  targetAcknowledged: "sentinel.target_acknowledged",
  targetResolved: "sentinel.target_resolved",
  targetSuperseded: "sentinel.target_superseded",
} as const;

interface BasisObjectLike {
  type: string;
  id: string;
}

function basisContains(objects: readonly BasisObjectLike[] | undefined, sourceType: string, sourceId: string): boolean {
  if (!objects) return false;
  return objects.some((object) => object.type === sourceType && object.id === sourceId);
}

/**
 * One candidate detection, before it becomes a persisted event.
 *
 * `eventType` is carried on the candidate itself, not derived from
 * `sourceType` alone at write time — `loadRelationshipChangeCandidates`
 * and the content/observation loaders both watch the same source types
 * (e.g. `REQUIREMENT`), but a relationship change and a content change to
 * the same kind of object are genuinely different events. Deriving the type
 * from `sourceType` at the point of writing would make `RELATIONSHIP_CHANGED`
 * unreachable.
 */
interface CandidateEvent {
  eventType: SurveillanceEventType;
  sourceType: SurveillanceSourceType;
  sourceId: string;
  sourceIdentifier: string | null;
  sourceLabel: string;
  sourceRevision: string;
}

/** Actions that indicate a relationship (not content) changed, and which source type owns the entity. */
const RELATIONSHIP_AUDIT_ACTIONS: ReadonlyArray<{
  action: string;
  entityType: string;
  sourceType: SurveillanceSourceType;
}> = [
  { action: "requirement.link_added", entityType: "Requirement", sourceType: "REQUIREMENT" },
  { action: "requirement.link_removed", entityType: "Requirement", sourceType: "REQUIREMENT" },
  { action: "decision.link_added", entityType: "EngineeringDecision", sourceType: "ENGINEERING_DECISION" },
  { action: "decision.link_removed", entityType: "EngineeringDecision", sourceType: "ENGINEERING_DECISION" },
  { action: "decision.assumption_added", entityType: "EngineeringDecision", sourceType: "ENGINEERING_DECISION" },
  { action: "decision.assumption_updated", entityType: "EngineeringDecision", sourceType: "ENGINEERING_DECISION" },
  { action: "decision.expectation_set", entityType: "EngineeringDecision", sourceType: "ENGINEERING_DECISION" },
  { action: "decision.expectation_cleared", entityType: "EngineeringDecision", sourceType: "ENGINEERING_DECISION" },
];

export class DecisionSentinelService {
  // --- Detection ------------------------------------------------------------

  async detectProjectChanges(
    context: OrganizationContext,
    projectId: unknown,
    input: unknown = {},
  ): Promise<DetectionSummary> {
    const scopedProjectId = await requireProjectWriteAccess(context, projectId);
    parseOrThrow(detectSurveillanceRequestSchema, input ?? {}, "Invalid detection request");

    const candidates = [
      ...(await this.loadContentChangeCandidates(scopedProjectId)),
      ...(await this.loadObservationCandidates(scopedProjectId)),
      ...(await this.loadRelationshipChangeCandidates(context, scopedProjectId)),
    ];

    const events = await sentinelEventRepository.createEvents(
      scopedProjectId,
      await Promise.all(
        candidates.map(async (candidate) => ({
          projectId: scopedProjectId,
          eventType: candidate.eventType,
          sourceType: candidate.sourceType,
          sourceId: candidate.sourceId,
          sourceIdentifier: candidate.sourceIdentifier,
          sourceLabel: candidate.sourceLabel,
          sourceRevision: candidate.sourceRevision,
          actorId: await this.resolveActor(context, candidate.sourceType, candidate.sourceId),
        })),
      ),
    );

    let targetsOpened = 0;
    let targetsUpdated = 0;

    // Sequential and bounded: detection is an explicit, occasional action —
    // the same philosophy AssumptionMonitoringService's own project sweep
    // follows — not a per-request hot path that would justify parallelizing
    // database load.
    for (const event of events) {
      const result = await this.evaluateTargetsForEvent(context, scopedProjectId, event);
      targetsOpened += result.opened;
      targetsUpdated += result.updated;
    }

    if (events.length > 0) {
      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(context, SENTINEL_AUDIT_ACTIONS.detectionRun, "Project", scopedProjectId, {
          eventsCreated: events.length,
          targetsOpened,
          targetsUpdated,
        }),
      );
    }

    return { eventsCreated: events.length, targetsOpened, targetsUpdated };
  }

  async listOpenSurveillance(
    context: OrganizationContext,
    projectId: unknown,
  ): Promise<SurveillanceTargetWithSource[]> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    return surveillanceTargetRepository.listOpenTargets(scopedProjectId);
  }

  async listSurveillanceHistory(
    context: OrganizationContext,
    projectId: unknown,
  ): Promise<SurveillanceTargetWithSource[]> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    return surveillanceTargetRepository.listTargetsForProject(scopedProjectId, {
      status: ["RESOLVED", "SUPERSEDED"],
    });
  }

  async getSurveillanceCounts(context: OrganizationContext, projectId: unknown): Promise<SurveillanceCounts> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    return surveillanceTargetRepository.countByStatus(scopedProjectId);
  }

  async getSurveillanceTarget(
    context: OrganizationContext,
    projectId: unknown,
    id: unknown,
  ): Promise<SurveillanceTargetWithSource> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    return this.requireTarget(scopedProjectId, id);
  }

  async acknowledgeSurveillance(
    context: OrganizationContext,
    projectId: unknown,
    id: unknown,
    input: unknown,
  ): Promise<SurveillanceTarget> {
    const scopedProjectId = await requireProjectWriteAccess(context, projectId);
    const data = parseOrThrow(acknowledgeSurveillanceRequestSchema, input ?? {}, "Invalid acknowledgement");

    return prisma.$transaction(async (tx) => {
      const existing = await this.requireTarget(scopedProjectId, id, tx);
      if (!canTransitionSurveillanceTarget(existing.status, "ACKNOWLEDGED")) {
        throw new ConflictError(
          `This surveillance target is ${existing.status} and cannot be acknowledged. Acknowledgement does not mean "fixed" or "safe" — it means an engineer has seen it.`,
        );
      }

      const target = await surveillanceTargetRepository.acknowledgeTarget(
        existing.id,
        context.actorId,
        data.note ?? null,
        tx,
      );

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(context, SENTINEL_AUDIT_ACTIONS.targetAcknowledged, SURVEILLANCE_TARGET_ENTITY_TYPE, target.id, {
          targetType: target.targetType,
          targetId: target.targetId,
        }),
        tx,
      );

      return target;
    });
  }

  /** Resolution always requires objective evidence, recorded as a note. Never silent. */
  async resolveSurveillance(
    context: OrganizationContext,
    projectId: unknown,
    id: unknown,
    input: unknown,
  ): Promise<SurveillanceTarget> {
    const scopedProjectId = await requireProjectApproveAccess(context, projectId);
    const data = parseOrThrow(resolveSurveillanceRequestSchema, input, "Invalid resolution");
    return this.completeResolution(context, scopedProjectId, id, data.note);
  }

  /**
   * The resolve-and-audit core, shared by the human-facing
   * {@link resolveSurveillance} and by {@link reEvaluateTarget}'s automatic
   * resolution. Both callers have already established project access before
   * reaching here, so this performs no access check of its own — it is not
   * itself a route entry point.
   */
  private async completeResolution(
    context: OrganizationContext,
    scopedProjectId: string,
    id: unknown,
    note: string,
  ): Promise<SurveillanceTarget> {
    return prisma.$transaction(async (tx) => {
      const existing = await this.requireTarget(scopedProjectId, id, tx);
      if (!canTransitionSurveillanceTarget(existing.status, "RESOLVED")) {
        throw new ConflictError(`This surveillance target is already ${existing.status}.`);
      }

      const target = await surveillanceTargetRepository.resolveTarget(existing.id, context.actorId, note, tx);

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(context, SENTINEL_AUDIT_ACTIONS.targetResolved, SURVEILLANCE_TARGET_ENTITY_TYPE, target.id, {
          targetType: target.targetType,
          targetId: target.targetId,
        }),
        tx,
      );

      return target;
    });
  }

  /**
   * Invokes the real engine for this target's domain — never a second
   * calculation. On success the target is resolved automatically, because a
   * fresh evaluation is exactly the "new current assessment" the resolution
   * policy accepts as objective evidence; on failure the target stays open
   * with the failure recorded as its reason, never silently dropped.
   *
   * Automatic resolution here is objective-evidence-driven, not an approval
   * judgement, so triggering a re-evaluation only needs the same write-tier
   * access as any other ordinary engineering action — not the approve-tier
   * access a human resolving a target by hand requires.
   */
  async reEvaluateTarget(
    context: OrganizationContext,
    projectId: unknown,
    id: unknown,
    input: unknown = {},
  ): Promise<SurveillanceTarget> {
    const scopedProjectId = await requireProjectWriteAccess(context, projectId);
    parseOrThrow(reEvaluateSurveillanceRequestSchema, input ?? {}, "Invalid reevaluation request");
    const existing = await this.requireTarget(scopedProjectId, id);
    if (!isSurveillanceTargetOpen(existing.status)) {
      throw new ConflictError(`This surveillance target is already ${existing.status}.`);
    }

    await this.dispatchReevaluation(context, scopedProjectId, existing.targetType, existing.targetId);

    return this.completeResolution(
      context,
      scopedProjectId,
      existing.id,
      `Resolved automatically: a new ${existing.targetType.toLowerCase().replaceAll("_", " ")} evaluation was run and reflects the current engineering state.`,
    );
  }

  // --- Detection: content-change candidates ----------------------------------

  private async loadContentChangeCandidates(projectId: string): Promise<CandidateEvent[]> {
    const [requirements, designItems, decisions, assumptions, activities, suppliers, suppliedItems, qualifications, changes, bases, risks, issues, evidence] =
      await Promise.all([
        prisma.requirement.findMany({
          where: { projectId },
          select: { id: true, identifier: true, title: true, createdAt: true, updatedAt: true },
        }),
        prisma.designItem.findMany({
          where: { projectId },
          select: { id: true, identifier: true, name: true, createdAt: true, updatedAt: true },
        }),
        prisma.engineeringDecision.findMany({
          where: { projectId },
          select: { id: true, identifier: true, title: true, createdAt: true, updatedAt: true },
        }),
        prisma.decisionAssumption.findMany({
          where: { engineeringDecision: { projectId } },
          select: { id: true, statement: true, createdAt: true, updatedAt: true },
        }),
        prisma.verificationActivity.findMany({
          where: { projectId },
          select: { id: true, identifier: true, title: true, createdAt: true, updatedAt: true },
        }),
        prisma.supplier.findMany({
          where: { projectId },
          select: { id: true, identifier: true, name: true, createdAt: true, updatedAt: true },
        }),
        prisma.suppliedItem.findMany({
          where: { projectId },
          select: { id: true, identifier: true, name: true, createdAt: true, updatedAt: true },
        }),
        prisma.supplierQualification.findMany({
          where: { projectId },
          select: { id: true, title: true, createdAt: true, updatedAt: true },
        }),
        prisma.changeRequest.findMany({
          where: { projectId },
          select: { id: true, identifier: true, title: true, createdAt: true, updatedAt: true },
        }),
        prisma.certificationBasis.findMany({
          where: { certificationProgram: { projectId } },
          select: { id: true, identifier: true, title: true, createdAt: true, updatedAt: true },
        }),
        prisma.risk.findMany({
          where: { projectId },
          select: { id: true, identifier: true, title: true, createdAt: true, updatedAt: true },
        }),
        prisma.issue.findMany({
          where: { projectId },
          select: { id: true, identifier: true, title: true, createdAt: true, updatedAt: true },
        }),
        prisma.evidence.findMany({
          where: { projectId },
          select: { id: true, identifier: true, title: true, createdAt: true, updatedAt: true },
        }),
      ]);

    const changed = <T extends { id: string; createdAt: Date; updatedAt: Date }>(
      rows: T[],
      sourceType: SurveillanceSourceType,
      identifierOf: (row: T) => string | null,
      labelOf: (row: T) => string,
    ): CandidateEvent[] =>
      rows
        .filter((row) => row.updatedAt.getTime() !== row.createdAt.getTime())
        .map((row) => ({
          eventType: eventTypeForSource(sourceType),
          sourceType,
          sourceId: row.id,
          sourceIdentifier: identifierOf(row),
          sourceLabel: labelOf(row),
          sourceRevision: row.updatedAt.toISOString(),
        }));

    return [
      ...changed(requirements, "REQUIREMENT", (r) => r.identifier, (r) => r.title),
      ...changed(designItems, "DESIGN_ITEM", (r) => r.identifier, (r) => r.name),
      ...changed(decisions, "ENGINEERING_DECISION", (r) => r.identifier, (r) => r.title),
      ...changed(assumptions, "DECISION_ASSUMPTION", () => null, (r) => r.statement),
      ...changed(activities, "VERIFICATION_ACTIVITY", (r) => r.identifier, (r) => r.title),
      ...changed(suppliers, "SUPPLIER", (r) => r.identifier, (r) => r.name),
      ...changed(suppliedItems, "SUPPLIED_ITEM", (r) => r.identifier, (r) => r.name),
      ...changed(qualifications, "SUPPLIER_QUALIFICATION", () => null, (r) => r.title),
      ...changed(changes, "CHANGE_REQUEST", (r) => r.identifier, (r) => r.title),
      ...changed(bases, "CERTIFICATION_BASIS", (r) => r.identifier, (r) => r.title),
      ...changed(risks, "RISK", (r) => r.identifier, (r) => r.title),
      ...changed(issues, "ISSUE", (r) => r.identifier, (r) => r.title),
      ...changed(evidence, "EVIDENCE", (r) => r.identifier, (r) => r.title),
    ];
  }

  /**
   * Every observation not yet covered by an event, at its current revision.
   * Unlike every other source type, a brand-new observation is itself the
   * surveillance-worthy act — recording it is what matters, not editing it.
   */
  private async loadObservationCandidates(projectId: string): Promise<CandidateEvent[]> {
    const observations = await prisma.operationalObservation.findMany({
      where: { projectId },
      select: { id: true, identifier: true, title: true, updatedAt: true },
    });
    return observations.map((row) => ({
      eventType: "OBSERVATION_RECORDED" as const,
      sourceType: "OPERATIONAL_OBSERVATION" as const,
      sourceId: row.id,
      sourceIdentifier: row.identifier,
      sourceLabel: row.title,
      sourceRevision: row.updatedAt.toISOString(),
    }));
  }

  /**
   * Relationship changes, read from the audit log rather than an object's
   * own revision — a link table has no single owning row whose `updatedAt`
   * would capture "a link was added or removed". `sourceRevision` is the
   * audit row's own id, prefixed so it is visibly distinct from a content
   * revision and can never collide with one.
   */
  private async loadRelationshipChangeCandidates(
    context: OrganizationContext,
    projectId: string,
  ): Promise<CandidateEvent[]> {
    const [requirementIds, decisionRows] = await Promise.all([
      prisma.requirement.findMany({ where: { projectId }, select: { id: true, identifier: true, title: true } }),
      prisma.engineeringDecision.findMany({ where: { projectId }, select: { id: true, identifier: true, title: true } }),
    ]);
    const requirementById = new Map(requirementIds.map((r) => [r.id, r]));
    const decisionById = new Map(decisionRows.map((d) => [d.id, d]));

    const entityIds = [...requirementById.keys(), ...decisionById.keys()];
    if (entityIds.length === 0) return [];

    // organizationId scoping is defense in depth: entityIds are already
    // narrowed to this project's own requirement/decision rows above, so this
    // query cannot reach another tenant's audit rows regardless.
    const rows = await prisma.auditLog.findMany({
      where: {
        organizationId: context.organizationId,
        entityId: { in: entityIds },
        action: { in: RELATIONSHIP_AUDIT_ACTIONS.map((a) => a.action) },
      },
      select: { id: true, action: true, entityType: true, entityId: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }],
      take: 500,
    });

    const candidates: CandidateEvent[] = [];
    for (const row of rows) {
      const rule = RELATIONSHIP_AUDIT_ACTIONS.find((a) => a.action === row.action && a.entityType === row.entityType);
      if (!rule) continue;
      const label =
        rule.sourceType === "REQUIREMENT"
          ? requirementById.get(row.entityId)
          : decisionById.get(row.entityId);
      if (!label) continue;
      candidates.push({
        eventType: "RELATIONSHIP_CHANGED",
        sourceType: rule.sourceType,
        sourceId: row.entityId,
        sourceIdentifier: label.identifier,
        sourceLabel: label.title,
        sourceRevision: `audit:${row.id}`,
      });
    }
    return candidates;
  }

  private async resolveActor(
    context: OrganizationContext,
    sourceType: SurveillanceSourceType,
    sourceId: string,
  ): Promise<string | null> {
    const latest = await prisma.auditLog.findFirst({
      where: { organizationId: context.organizationId, entityId: sourceId },
      orderBy: [{ createdAt: "desc" }],
      select: { actorId: true },
    });
    return latest?.actorId ?? null;
  }

  // --- Dependency resolution ---------------------------------------------

  private async evaluateTargetsForEvent(
    context: OrganizationContext,
    projectId: string,
    event: SentinelEvent,
  ): Promise<{ opened: number; updated: number }> {
    let opened = 0;
    let updated = 0;

    for (const rule of dependencyRulesFor(event.sourceType)) {
      const candidates = await this.resolveTargetCandidates(projectId, event, rule.targetType);
      for (const candidate of candidates) {
        const { id, inserted } = await prisma.$transaction(async (tx) => {
          const result = await surveillanceTargetRepository.upsertOpenTarget(
            {
              projectId,
              targetType: rule.targetType,
              targetId: candidate.targetId,
              targetIdentifier: candidate.targetIdentifier,
              targetLabel: candidate.targetLabel,
              reason: rule.reason,
              sourceEventId: event.id,
            },
            tx,
          );

          if (result.inserted) {
            const supersededCount = await surveillanceTargetRepository.supersedeAcknowledged(
              projectId,
              rule.targetType,
              candidate.targetId,
              result.id,
              tx,
            );
            if (supersededCount > 0) {
              await auditLogRepository.recordAuditEvent(
                artifactAuditEvent(
                  context,
                  SENTINEL_AUDIT_ACTIONS.targetSuperseded,
                  SURVEILLANCE_TARGET_ENTITY_TYPE,
                  result.id,
                  { targetType: rule.targetType, targetId: candidate.targetId, supersededCount },
                ),
                tx,
              );
            }
          }

          // Not "acknowledged" — that action means a human explicitly saw this
          // target. When detection re-affirms an already-open target, nothing
          // was acknowledged; the row was only updated.
          await auditLogRepository.recordAuditEvent(
            artifactAuditEvent(
              context,
              result.inserted ? SENTINEL_AUDIT_ACTIONS.targetDetected : SENTINEL_AUDIT_ACTIONS.targetUpdated,
              SURVEILLANCE_TARGET_ENTITY_TYPE,
              result.id,
              { targetType: rule.targetType, targetId: candidate.targetId, sourceEventId: event.id },
            ),
            tx,
          );

          return result;
        });
        if (inserted) opened += 1;
        else updated += 1;
        void id;
      }
    }

    return { opened, updated };
  }

  private async resolveTargetCandidates(
    projectId: string,
    event: SentinelEvent,
    targetType: SurveillanceTargetType,
  ): Promise<Array<{ targetId: string; targetIdentifier: string | null; targetLabel: string }>> {
    switch (targetType) {
      case "VERIFICATION_READINESS":
        return this.candidatesFromVerificationReadiness(projectId, event);
      case "TECHNICAL_READINESS":
        return this.candidatesFromTechnicalReadiness(projectId, event);
      case "IMPACT_ANALYSIS":
        return this.candidatesFromImpactAnalysis(projectId, event);
      case "ASSUMPTION_MONITORING":
        return this.candidatesFromAssumptionMonitoring(projectId, event);
      case "DRIFT_ASSESSMENT":
        return this.candidatesFromDrift(projectId, event);
      case "CERTIFICATION_REVIEW":
        return this.candidatesFromCertification(projectId, event);
    }
  }

  private async candidatesFromVerificationReadiness(projectId: string, event: SentinelEvent) {
    const activities = await prisma.verificationActivity.findMany({
      where: { projectId },
      select: { id: true, identifier: true, title: true },
    });
    const latest = await verificationReadinessRepository.findLatestForActivities(
      projectId,
      activities.map((a) => a.id),
    );

    const results: Array<{ targetId: string; targetIdentifier: string | null; targetLabel: string }> = [];
    for (const activity of activities) {
      const assessment = latest.get(activity.id);
      if (!assessment) continue;
      const basis = await verificationReadinessRepository.readAssessmentBasis(assessment);
      if (basisContains(basis.objects, event.sourceType, event.sourceId)) {
        results.push({ targetId: activity.id, targetIdentifier: activity.identifier, targetLabel: activity.title });
      }
    }
    return results;
  }

  private async candidatesFromTechnicalReadiness(projectId: string, event: SentinelEvent) {
    const latestByGate = await technicalReadinessRepository.findLatestPerGate(projectId);
    const results: Array<{ targetId: string; targetIdentifier: string | null; targetLabel: string }> = [];
    for (const gate of TECHNICAL_READINESS_GATES) {
      const assessment = latestByGate.get(gate);
      if (!assessment) continue;
      const scope = await technicalReadinessRepository.readAssessmentScope(assessment);
      if (basisContains(scope.objects, event.sourceType, event.sourceId)) {
        results.push({ targetId: gate, targetIdentifier: null, targetLabel: gate.replaceAll("_", " ") });
      }
    }
    return results;
  }

  private async candidatesFromImpactAnalysis(projectId: string, event: SentinelEvent) {
    const changes = await prisma.changeRequest.findMany({
      where: { projectId, status: { in: [...ACTIVE_CHANGE_REQUEST_STATUSES] } },
      select: { id: true, identifier: true, title: true },
    });

    const results: Array<{ targetId: string; targetIdentifier: string | null; targetLabel: string }> = [];
    for (const change of changes) {
      const analysis = await impactAnalysisRepository.findLatestAnalysis(projectId, change.id);
      if (!analysis || analysis.status !== "COMPLETED") continue;

      const nodeType = event.sourceType;
      const [rootHit, findingHit] = await Promise.all([
        prisma.impactAnalysisRoot.count({ where: { analysisId: analysis.id, nodeType, nodeId: event.sourceId } }),
        prisma.impactFinding.count({ where: { analysisId: analysis.id, nodeType, nodeId: event.sourceId } }),
      ]);
      if (rootHit > 0 || findingHit > 0) {
        results.push({ targetId: change.id, targetIdentifier: change.identifier, targetLabel: change.title });
      }
    }
    return results;
  }

  private async candidatesFromAssumptionMonitoring(projectId: string, event: SentinelEvent) {
    const assumptions = await monitoringRepository.listProjectAssumptions(projectId);
    const latest = await monitoringRepository.findLatestForAssumptions(
      projectId,
      assumptions.map((a) => a.id),
    );

    const results: Array<{ targetId: string; targetIdentifier: string | null; targetLabel: string }> = [];
    for (const assumption of assumptions) {
      // The assumption's own change always concerns its own monitoring.
      if (event.sourceType === "DECISION_ASSUMPTION" && event.sourceId === assumption.id) {
        results.push({
          targetId: assumption.id,
          targetIdentifier: assumption.decisionIdentifier,
          targetLabel: assumption.statement,
        });
        continue;
      }
      const record = latest.get(assumption.id);
      if (record && basisContains(record.basisSnapshot, event.sourceType, event.sourceId)) {
        results.push({
          targetId: assumption.id,
          targetIdentifier: assumption.decisionIdentifier,
          targetLabel: assumption.statement,
        });
      }
    }
    return results;
  }

  private async candidatesFromDrift(projectId: string, event: SentinelEvent) {
    const baseline = await baselineRepository.findActiveBaseline(projectId);
    if (!baseline) return [];

    // A new observation is inherently drift-relevant by definition.
    if (event.sourceType === "OPERATIONAL_OBSERVATION") {
      return [{ targetId: baseline.id, targetIdentifier: baseline.identifier, targetLabel: baseline.name }];
    }

    const members = await baselineMemberRepository.listMembers(baseline.id);
    const isMember = members.some((member) => member.nodeType === event.sourceType && member.nodeId === event.sourceId);
    if (!isMember) return [];
    return [{ targetId: baseline.id, targetIdentifier: baseline.identifier, targetLabel: baseline.name }];
  }

  private async candidatesFromCertification(projectId: string, event: SentinelEvent) {
    const program = await certificationProgramRepository.findProgramInProject(projectId);
    if (!program) return [];

    if (event.sourceType === "CERTIFICATION_BASIS") {
      const activeBasis = await certificationBasisRepository.findActiveBasis(program.id);
      if (activeBasis && activeBasis.id === event.sourceId) {
        return [{ targetId: program.id, targetIdentifier: program.identifier, targetLabel: program.name }];
      }
      return [];
    }

    const latestReview = await certificationReviewRepository.findLatestReview(program.id);
    if (!latestReview) return [];
    const basis = await certificationReviewRepository.readReviewBasis(latestReview);
    if (basisContains(basis.objects, event.sourceType, event.sourceId)) {
      return [{ targetId: program.id, targetIdentifier: program.identifier, targetLabel: program.name }];
    }
    return [];
  }

  // --- Reevaluation dispatch -----------------------------------------------

  /**
   * The one controlled dispatch point. Every branch calls the real engine's
   * own public evaluate method, unmodified — this function contains no
   * readiness, impact, drift, assumption, or certification logic of its own.
   */
  private async dispatchReevaluation(
    context: OrganizationContext,
    projectId: string,
    targetType: SurveillanceTargetType,
    targetId: string,
  ): Promise<void> {
    switch (targetType) {
      case "IMPACT_ANALYSIS":
        await changeImpactAnalysisService.runImpactAnalysis(context, projectId, targetId, {});
        return;
      case "VERIFICATION_READINESS":
        await verificationReadinessService.evaluateVerificationReadiness(context, projectId, targetId, {});
        return;
      case "TECHNICAL_READINESS":
        await technicalReadinessService.evaluateTechnicalReadiness(context, projectId, { gate: targetId });
        return;
      case "DRIFT_ASSESSMENT":
        await driftDetectionService.evaluateDrift(context, projectId, { baselineId: targetId });
        return;
      case "CERTIFICATION_REVIEW":
        await certificationReviewService.evaluateCertificationReview(context, projectId, {});
        return;
      case "ASSUMPTION_MONITORING": {
        const assumption = await prisma.decisionAssumption.findUnique({
          where: { id: targetId },
          select: { engineeringDecisionId: true },
        });
        if (!assumption) {
          throw new NotFoundError(`Assumption ${targetId} was not found.`);
        }
        await assumptionMonitoringService.evaluateAssumption(
          context,
          projectId,
          assumption.engineeringDecisionId,
          targetId,
        );
        return;
      }
    }
  }

  // --- Internals --------------------------------------------------------

  private async requireTarget(
    projectId: string,
    id: unknown,
    client?: Parameters<typeof surveillanceTargetRepository.findTargetInProject>[2],
  ): Promise<SurveillanceTargetWithSource> {
    const parsedId = parseOrThrow(entityIdSchema, id, "Invalid surveillance target id");
    const target = await surveillanceTargetRepository.findTargetInProject(projectId, parsedId, client);
    if (!target) {
      throw new NotFoundError(`Surveillance target ${parsedId} was not found.`);
    }
    return target;
  }
}

export const decisionSentinelService = new DecisionSentinelService();

// Re-exported so callers can narrow a union without importing the domain
// module separately.
export { hasVerificationReadiness, hasCertificationReview };
