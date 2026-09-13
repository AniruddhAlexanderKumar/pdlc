import {
  VERIFICATION_READINESS_VERSION,
  type GraphNodeType,
  type LatestVerificationReadiness,
  type ReadinessBasisChange,
  type ReadinessBasisMonitoring,
  type ReadinessBasisObject,
  type ReadinessBasisRelationship,
  type ReadinessBasisRole,
  type ReadinessFreshness,
  type VerificationActivity,
  type VerificationReadinessAssessment,
  type VerificationReadinessBasis,
  type VerificationReadinessBasisMarker,
  type VerificationReadinessFinding,
  type VerificationReadinessReport,
  type VerificationReadinessScope,
  compareReadinessBasisObjects,
  compareReadinessFindings,
  consumedAnalysisFreshness,
  entityIdSchema,
  evaluateVerificationReadinessRequestSchema,
  graphNodeKey,
  normalizeReadinessBasis,
  readinessFingerprint,
  readinessFreshnessOf,
  readinessRule,
  readinessScopeFor,
  readinessStatusFor,
  ruleAppliesInScope,
  severityForFindingStatus,
  verificationReadinessIdSchema,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { AppError, NotFoundError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import * as monitoringRepository from "@/server/repositories/assumption-monitoring.repository";
import { computeProjectFingerprint } from "@/server/repositories/project-revision.repository";
import * as verificationRepository from "@/server/repositories/verification-activity.repository";
import * as basisRepository from "@/server/repositories/verification-readiness-basis.repository";
import type { ReadinessSubjectRef } from "@/server/repositories/verification-readiness-basis.repository";
import * as readinessRepository from "@/server/repositories/verification-readiness.repository";
import type { PersistReadinessFindingInput } from "@/server/repositories/verification-readiness.repository";
import {
  EngineeringGraphService,
  engineeringGraphService,
} from "@/server/services/engineering-graph.service";
import { parseOrThrow } from "@/server/validation";
import {
  artifactAuditEvent,
  requireProjectReadAccess,
  requireProjectWriteAccess,
} from "./project-scope";

/**
 * The verification readiness engine.
 *
 * It answers one question about one activity — *can this be executed, or
 * concluded, responsibly given what the record actually says?* — and it answers
 * it the same way every time: resolve a bounded, activity-specific basis from
 * the engineering graph, evaluate `VERIFICATION_READINESS_RULES` against it,
 * and persist what fired.
 *
 * **The service owns no readiness policy.** Every finding it emits comes from a
 * rule in the registry, looked up by id; `emit` refuses an id the registry does
 * not define. Whether a condition blocks, warns, informs or is indeterminate is
 * declared there and nowhere else, so no `if` in this file can quietly
 * introduce a rule nobody wrote down.
 *
 * **It owns no topology.** Every relationship read goes through
 * {@link EngineeringGraphService}, in four batched hops. There is no second
 * traceability mechanism, and no query in this file walks a link table to
 * discover an object.
 *
 * **It computes nothing another engine owns.** Change impact is read from the
 * analyses the impact engine wrote; assumption state is read from the records
 * the monitoring engine wrote. This service never runs either, and never writes
 * to a source artifact — an evaluation reads, judges, and appends.
 *
 * **What it refuses to conclude.** READY is not PASSED. NOT_READY is not a
 * defect in the requirement. A missing owner is not a blocker, because the
 * domain does not require one. Absent evidence before execution is not a
 * failure, because evidence is what verification produces. Where the record
 * cannot answer a question, the answer is UNKNOWN — never a pass, and never a
 * failure inferred from silence.
 */

export const VERIFICATION_READINESS_ENTITY_TYPE = "VerificationReadinessAssessment";

export const VERIFICATION_READINESS_AUDIT_ACTIONS = {
  evaluationStarted: "verification_readiness.evaluation_started",
  evaluated: "verification_readiness.evaluated",
} as const;

/** Raised when the basis cannot be read well enough to judge anything. */
export class VerificationReadinessFailure extends AppError {
  constructor(message: string) {
    super(message, {
      statusCode: 422,
      code: "VERIFICATION_READINESS_FAILED",
      isOperational: true,
    });
  }
}

/** The object a finding is about, in the shape the persisted row needs. */
interface FindingSubject {
  type: GraphNodeType;
  id: string;
  identifier: string | null;
  label: string;
}

/**
 * A finding before it is ordered and written.
 *
 * Identical to the persisted shape by design: nothing is added or dropped
 * between deciding a finding and storing it, so what a reader sees later is
 * exactly what the engine concluded.
 */
type DraftFinding = PersistReadinessFindingInput;

/** One resolved basis object plus the state the rules read from it. */
interface BasisEntry {
  role: ReadinessBasisRole;
  type: GraphNodeType;
  id: string;
  identifier: string | null;
  label: string;
  state: string | null;
}

/** Everything one evaluation needs, resolved once. */
interface ReadinessContext {
  activity: VerificationActivity;
  scope: VerificationReadinessScope;
  basis: VerificationReadinessBasis;
  requirements: BasisEntry[];
  designItems: BasisEntry[];
  decisions: BasisEntry[];
  assumptions: Array<BasisEntry & { monitoring: ReadinessBasisMonitoring }>;
  evidence: BasisEntry[];
  /** Links whose requirement could not be read inside this project. */
  unresolvedRequirementLinks: Array<{ relationshipId: string; requirementId: string }>;
  requirementLinkCount: number;
  changes: ReadinessBasisChange[];
}

export class VerificationReadinessService {
  constructor(private readonly graph: EngineeringGraphService = engineeringGraphService) {}

  /**
   * Evaluates readiness and appends an immutable assessment.
   *
   * Explicit: nothing triggers this on a page load. An assessment is a claim
   * about a moment, and silently recomputing it would make "when was this
   * judged, and against what?" unanswerable.
   */
  async evaluateVerificationReadiness(
    context: OrganizationContext,
    projectId: unknown,
    activityId: unknown,
    request: unknown = {},
  ): Promise<VerificationReadinessReport> {
    const scopedProjectId = await requireProjectWriteAccess(context, projectId);
    // Strict and empty: no rule outcome, status or finding may be supplied by a
    // caller. A client that tries is rejected rather than silently ignored.
    parseOrThrow(
      evaluateVerificationReadinessRequestSchema,
      request ?? {},
      "Invalid readiness request",
    );

    const activity = await this.requireActivity(scopedProjectId, activityId);

    await auditLogRepository
      .recordAuditEvent(
        artifactAuditEvent(
          context,
          VERIFICATION_READINESS_AUDIT_ACTIONS.evaluationStarted,
          "VerificationActivity",
          activity.id,
          { projectId: scopedProjectId, readinessVersion: VERIFICATION_READINESS_VERSION },
        ),
      )
      // Losing the "started" marker must not prevent the evaluation itself.
      .catch(() => {});

    const resolved = await this.resolveContext(context, scopedProjectId, activity);
    const findings = this.evaluate(resolved);
    const status = readinessStatusFor(findings);
    const fingerprint = readinessFingerprint(resolved.basis);
    const counts = tally(findings);

    const assessment = await prisma.$transaction(async (tx) => {
      const written = await readinessRepository.createAssessment(
        {
          projectId: scopedProjectId,
          verificationActivityId: activity.id,
          status,
          scope: resolved.scope,
          readinessVersion: VERIFICATION_READINESS_VERSION,
          fingerprint,
          basis: resolved.basis,
          evaluatedById: context.actorId,
          ...counts,
        },
        tx,
      );

      await readinessRepository.createFindings(written.id, findings, tx);

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          VERIFICATION_READINESS_AUDIT_ACTIONS.evaluated,
          VERIFICATION_READINESS_ENTITY_TYPE,
          written.id,
          {
            projectId: scopedProjectId,
            verificationActivityId: activity.id,
            status,
            scope: resolved.scope,
            readinessVersion: VERIFICATION_READINESS_VERSION,
            blockingCount: counts.blockingCount,
            findingCount: counts.findingCount,
          },
        ),
        tx,
      );

      return written;
    });

    // Read the findings back so the report describes rows that are committed,
    // not the in-memory intent to write them.
    const persisted = await readinessRepository.listFindings(assessment.id);

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
   * findings would read as "we checked and found nothing wrong", which is a far
   * stronger claim than "nobody has assessed this".
   *
   * Reading never evaluates. A stale assessment is reported as stale and left
   * exactly as it was written.
   */
  async getLatestVerificationReadiness(
    context: OrganizationContext,
    projectId: unknown,
    activityId: unknown,
  ): Promise<LatestVerificationReadiness> {
    const scopedProjectId = await requireProjectReadAccess(context, projectId);
    const activity = await this.requireActivity(scopedProjectId, activityId);

    const latest = await readinessRepository.findLatestAssessment(scopedProjectId, activity.id);
    if (!latest) {
      return {
        status: "NOT_EVALUATED",
        verificationActivityId: activity.id,
        readinessVersion: VERIFICATION_READINESS_VERSION,
      };
    }

    return this.buildReport(context, scopedProjectId, activity, latest);
  }

  /** Every assessment for one activity, newest first. Nothing is overwritten. */
  async listVerificationReadinessHistory(
    context: OrganizationContext,
    projectId: unknown,
    activityId: unknown,
  ): Promise<VerificationReadinessAssessment[]> {
    const scopedProjectId = await requireProjectReadAccess(context, projectId);
    const activity = await this.requireActivity(scopedProjectId, activityId);

    return readinessRepository.listAssessments(scopedProjectId, activity.id);
  }

  /**
   * One assessment in full, by id, with the findings and basis it was written
   * with — and its freshness against the state as it stands now.
   *
   * A historical assessment is shown exactly as it was recorded. It is never
   * re-judged under today's state, because the value of the record is that it
   * says what was believed then.
   */
  async explainVerificationReadiness(
    context: OrganizationContext,
    projectId: unknown,
    assessmentId: unknown,
  ): Promise<VerificationReadinessReport> {
    const scopedProjectId = await requireProjectReadAccess(context, projectId);
    const id = parseOrThrow(verificationReadinessIdSchema, assessmentId, "Invalid assessment id");

    const assessment = await readinessRepository.findAssessmentInProject(scopedProjectId, id);
    if (!assessment) {
      throw new NotFoundError(`Verification readiness assessment ${id} was not found.`);
    }

    const activity = await this.requireActivity(
      scopedProjectId,
      assessment.verificationActivityId,
    );
    return this.buildReport(context, scopedProjectId, activity, assessment);
  }

  // --- Internals ------------------------------------------------------------

  private async requireActivity(
    projectId: string,
    activityId: unknown,
  ): Promise<VerificationActivity> {
    const id = parseOrThrow(entityIdSchema, activityId, "Invalid verification activity id");
    const activity = await verificationRepository.findVerificationActivityInProject(projectId, id);
    if (!activity) {
      throw new NotFoundError(`Verification activity ${id} was not found.`);
    }
    return activity;
  }

  /**
   * Assembles a stored assessment into a report.
   *
   * Freshness is derived by resolving the activity's basis again and comparing
   * fingerprints — the assessment record itself is never touched, and a stale
   * one is never quietly recomputed and presented as current.
   */
  private async buildReport(
    context: OrganizationContext,
    projectId: string,
    activity: VerificationActivity,
    assessment: VerificationReadinessAssessment,
  ): Promise<VerificationReadinessReport> {
    const [findings, storedBasis, freshness] = await Promise.all([
      readinessRepository.listFindings(assessment.id),
      readinessRepository.readAssessmentBasis(assessment),
      this.deriveFreshness(context, projectId, activity, assessment),
    ]);

    return { assessment, freshness, findings, basis: storedBasis };
  }

  /**
   * Whether the stored assessment still rests on the state it was written from.
   *
   * A basis that cannot be resolved at all reports UNKNOWN rather than
   * pretending either way — the one thing this must never do is answer
   * "current" because it failed to check.
   */
  private async deriveFreshness(
    context: OrganizationContext,
    projectId: string,
    activity: VerificationActivity,
    assessment: VerificationReadinessAssessment,
  ): Promise<ReadinessFreshness> {
    try {
      const resolved = await this.resolveContext(context, projectId, activity);
      return readinessFreshnessOf(
        assessment.fingerprint,
        readinessFingerprint(resolved.basis),
        assessment.readinessVersion,
      );
    } catch {
      return "UNKNOWN";
    }
  }

  /**
   * Resolves what this assessment stands on.
   *
   * Four batched graph hops, and nothing beyond them:
   *
   *   1. out of the activity — the requirements it verifies, the evidence on it
   *   2. out of those requirements — the design they are allocated to, and the
   *      decisions taken to address them
   *   3. into those design items — the decisions that shaped them
   *   4. out of those decisions — their recorded assumptions
   *
   * The walk stops there. The cost is bounded by the activity's own
   * neighbourhood rather than by the size of the project, and each hop is one
   * batched read over a whole frontier — never a query per node.
   *
   * The *decision* boundary is deliberate. A decision counts as a dependency
   * when it addresses a verified requirement or shapes a prerequisite design
   * item; a requirement merely *derived from* a decision is upstream
   * provenance, not something the verification stands on, and pulling every
   * connected decision in would make the rule fire on records nobody would
   * call prerequisites.
   */
  private async resolveContext(
    context: OrganizationContext,
    projectId: string,
    activity: VerificationActivity,
  ): Promise<ReadinessContext> {
    const scope = readinessScopeFor(activity.status);
    const activityRef = { type: "VERIFICATION_ACTIVITY" as const, id: activity.id };

    const relationships = new Map<string, ReadinessBasisRelationship>();
    const recordRelationship = (
      edge: { type: ReadinessBasisRelationship["edgeType"]; relationshipId: string; linkType: string | null },
      from: { type: GraphNodeType; id: string },
      to: { type: GraphNodeType; id: string },
    ) => {
      relationships.set(`${edge.type}:${edge.relationshipId}`, {
        edgeType: edge.type,
        relationshipId: edge.relationshipId,
        fromType: from.type,
        fromId: from.id,
        toType: to.type,
        toId: to.id,
        linkType: edge.linkType,
      });
    };

    // Hop 1 — the activity's own neighbourhood.
    const activityHop = await this.graph.getNeighborhoods(
      context,
      projectId,
      [activityRef],
      "BOTH",
      ["REQUIREMENT_VERIFIED_BY", "VERIFICATION_HAS_EVIDENCE"],
    );

    const requirementNodes = new Map<string, { id: string; identifier: string | null; label: string }>();
    const evidenceNodes = new Map<string, { id: string; identifier: string | null; label: string }>();

    for (const connection of activityHop.get(graphNodeKey(activityRef)) ?? []) {
      const { edge, neighbor, direction } = connection;

      if (edge.type === "REQUIREMENT_VERIFIED_BY" && direction === "INBOUND") {
        requirementNodes.set(neighbor.id, {
          id: neighbor.id,
          identifier: neighbor.identifier,
          label: neighbor.label,
        });
        recordRelationship(edge, { type: neighbor.type, id: neighbor.id }, activityRef);
      }

      if (edge.type === "VERIFICATION_HAS_EVIDENCE" && direction === "OUTBOUND") {
        evidenceNodes.set(neighbor.id, {
          id: neighbor.id,
          identifier: neighbor.identifier,
          label: neighbor.label,
        });
        recordRelationship(edge, activityRef, { type: neighbor.type, id: neighbor.id });
      }
    }

    // Hop 2 — design and decisions reached from the verified requirements.
    const requirementRefs = [...requirementNodes.keys()].map((id) => ({
      type: "REQUIREMENT" as const,
      id,
    }));

    const designNodes = new Map<string, { id: string; identifier: string | null; label: string }>();
    const decisionNodes = new Map<string, { id: string; identifier: string | null; label: string }>();

    if (requirementRefs.length > 0) {
      const requirementHop = await this.graph.getNeighborhoods(
        context,
        projectId,
        requirementRefs,
        "OUTBOUND",
        ["REQUIREMENT_ALLOCATED_TO_DESIGN", "REQUIREMENT_LINKED_TO_DECISION"],
      );

      for (const ref of requirementRefs) {
        for (const connection of requirementHop.get(graphNodeKey(ref)) ?? []) {
          const { edge, neighbor } = connection;

          if (edge.type === "REQUIREMENT_ALLOCATED_TO_DESIGN") {
            // Both ALLOCATED_TO and SATISFIED_BY say the requirement is met by
            // this element, so both make it a prerequisite of verifying it.
            designNodes.set(neighbor.id, {
              id: neighbor.id,
              identifier: neighbor.identifier,
              label: neighbor.label,
            });
            recordRelationship(edge, ref, { type: neighbor.type, id: neighbor.id });
          }

          if (
            edge.type === "REQUIREMENT_LINKED_TO_DECISION" &&
            edge.linkType === "DECISION_ADDRESSES_REQUIREMENT"
          ) {
            decisionNodes.set(neighbor.id, {
              id: neighbor.id,
              identifier: neighbor.identifier,
              label: neighbor.label,
            });
            recordRelationship(edge, ref, { type: neighbor.type, id: neighbor.id });
          }
        }
      }
    }

    // Hop 3 — decisions that shaped a prerequisite design item.
    const designRefs = [...designNodes.keys()].map((id) => ({ type: "DESIGN_ITEM" as const, id }));

    if (designRefs.length > 0) {
      const designHop = await this.graph.getNeighborhoods(
        context,
        projectId,
        designRefs,
        "INBOUND",
        ["DECISION_AFFECTS_DESIGN"],
      );

      for (const ref of designRefs) {
        for (const connection of designHop.get(graphNodeKey(ref)) ?? []) {
          const { edge, neighbor } = connection;
          if (edge.type !== "DECISION_AFFECTS_DESIGN") continue;

          decisionNodes.set(neighbor.id, {
            id: neighbor.id,
            identifier: neighbor.identifier,
            label: neighbor.label,
          });
          recordRelationship(edge, { type: neighbor.type, id: neighbor.id }, ref);
        }
      }
    }

    // Hop 4 — the assumptions those decisions were taken on.
    const decisionRefs = [...decisionNodes.keys()].map((id) => ({
      type: "ENGINEERING_DECISION" as const,
      id,
    }));

    const assumptionNodes = new Map<string, { id: string; label: string }>();

    if (decisionRefs.length > 0) {
      const decisionHop = await this.graph.getNeighborhoods(
        context,
        projectId,
        decisionRefs,
        "OUTBOUND",
        ["DECISION_HAS_ASSUMPTION"],
      );

      for (const ref of decisionRefs) {
        for (const connection of decisionHop.get(graphNodeKey(ref)) ?? []) {
          const { edge, neighbor } = connection;
          if (edge.type !== "DECISION_HAS_ASSUMPTION") continue;

          assumptionNodes.set(neighbor.id, { id: neighbor.id, label: neighbor.label });
          recordRelationship(edge, ref, { type: neighbor.type, id: neighbor.id });
        }
      }
    }

    const assumptionRefs = [...assumptionNodes.keys()].map((id) => ({
      type: "DECISION_ASSUMPTION" as const,
      id,
    }));
    const evidenceRefs = [...evidenceNodes.keys()].map((id) => ({ type: "EVIDENCE" as const, id }));

    // State the rules read, plus revision stamps — every read batched.
    const [
      revisions,
      requirementStates,
      designStates,
      decisionStates,
      assumptionStates,
      monitoring,
      links,
    ] = await Promise.all([
      this.graph.getNodeRevisions(context, projectId, [
        activityRef,
        ...requirementRefs,
        ...designRefs,
        ...decisionRefs,
        ...assumptionRefs,
        ...evidenceRefs,
      ]),
      basisRepository.loadRequirementStates(projectId, [...requirementNodes.keys()]),
      basisRepository.loadDesignItemStates(projectId, [...designNodes.keys()]),
      basisRepository.loadDecisionStates(projectId, [...decisionNodes.keys()]),
      basisRepository.loadAssumptionStates(projectId, [...assumptionNodes.keys()]),
      monitoringRepository.findLatestForAssumptions(projectId, [...assumptionNodes.keys()]),
      basisRepository.loadRequirementVerificationLinks(projectId, activity.id),
    ]);

    const requirements: BasisEntry[] = [...requirementNodes.values()]
      .map((node) => ({
        role: "VERIFIED_REQUIREMENT" as const,
        type: "REQUIREMENT" as const,
        id: node.id,
        identifier: requirementStates.get(node.id)?.identifier ?? node.identifier,
        label: requirementStates.get(node.id)?.title ?? node.label,
        state: requirementStates.get(node.id)?.status ?? null,
      }))
      .sort(compareEntries);

    const designItems: BasisEntry[] = [...designNodes.values()]
      .map((node) => ({
        role: "PREREQUISITE_DESIGN_ITEM" as const,
        type: "DESIGN_ITEM" as const,
        id: node.id,
        identifier: designStates.get(node.id)?.identifier ?? node.identifier,
        label: designStates.get(node.id)?.name ?? node.label,
        state: designStates.get(node.id)?.status ?? null,
      }))
      .sort(compareEntries);

    const decisions: BasisEntry[] = [...decisionNodes.values()]
      .map((node) => ({
        role: "RELEVANT_DECISION" as const,
        type: "ENGINEERING_DECISION" as const,
        id: node.id,
        identifier: decisionStates.get(node.id)?.identifier ?? node.identifier,
        label: decisionStates.get(node.id)?.title ?? node.label,
        state: decisionStates.get(node.id)?.status ?? null,
      }))
      .sort(compareEntries);

    const assumptions = [...assumptionNodes.values()]
      .map((node) => {
        const record = monitoring.get(node.id) ?? null;
        return {
          role: "DECISION_ASSUMPTION" as const,
          type: "DECISION_ASSUMPTION" as const,
          id: node.id,
          identifier: null,
          label: assumptionStates.get(node.id)?.statement ?? node.label,
          state: assumptionStates.get(node.id)?.status ?? null,
          monitoring: {
            assumptionId: node.id,
            recordId: record ? record.id : null,
            // Consumed, never written: NOT_EVALUATED means nobody has looked,
            // which is different from having looked and found nothing.
            monitoringStatus: record ? record.status : ("NOT_EVALUATED" as const),
            basisFingerprint: record ? record.basisFingerprint : null,
          } satisfies ReadinessBasisMonitoring,
        };
      })
      .sort(compareEntries);

    const evidence: BasisEntry[] = [...evidenceNodes.values()]
      .map((node) => ({
        role: "ATTACHED_EVIDENCE" as const,
        type: "EVIDENCE" as const,
        id: node.id,
        identifier: node.identifier,
        label: node.label,
        state: null,
      }))
      .sort(compareEntries);

    const activityEntry: BasisEntry = {
      role: "VERIFICATION_ACTIVITY",
      type: "VERIFICATION_ACTIVITY",
      id: activity.id,
      identifier: activity.identifier,
      label: activity.title,
      state: activity.status,
    };

    // Change impact — read from what the impact engine already wrote.
    const subjects: ReadinessSubjectRef[] = [
      { type: "VERIFICATION_ACTIVITY", id: activity.id },
      ...requirementRefs,
      ...designRefs,
      ...decisionRefs,
    ];
    const changeRows = await basisRepository.loadChangeImpactContext(projectId, subjects);

    // The project fingerprint is only needed to judge an analysis's freshness,
    // so it is only computed when an analysis is actually part of the basis.
    const needsFingerprint = changeRows.some((row) => row.analysis !== null);
    const projectFingerprint = needsFingerprint
      ? await computeProjectFingerprint(projectId)
      : null;

    const changes: ReadinessBasisChange[] = changeRows
      .map((row) => ({
        changeRequestId: row.changeRequestId,
        identifier: row.identifier,
        title: row.title,
        status: row.status,
        analysisId: row.analysis ? row.analysis.id : null,
        analysisFingerprint: row.analysis ? row.analysis.sourceFingerprint : null,
        // Shared with every other engine that reads impact analyses, so none of
        // them can drift into treating a stale result as current.
        analysisFreshness: consumedAnalysisFreshness(row.analysis, projectFingerprint),
        declaredSubjects: row.declaredSubjects.map(graphNodeKey).sort(),
        affectedSubjects: row.affectedSubjects.map(graphNodeKey).sort(),
      }))
      .sort((a, b) => (a.changeRequestId < b.changeRequestId ? -1 : a.changeRequestId > b.changeRequestId ? 1 : 0));

    const stamped = (entry: BasisEntry): ReadinessBasisObject => {
      const revision = revisions.get(graphNodeKey({ type: entry.type, id: entry.id }));
      return {
        role: entry.role,
        type: entry.type,
        id: entry.id,
        identifier: entry.identifier,
        label: entry.label,
        // The object's own last revision — never "now". This is what makes
        // "has the basis moved?" answerable without storing a copy of it.
        revision: revision ? revision.toISOString() : "unresolved",
        state: entry.state,
      };
    };

    const basis: VerificationReadinessBasis = {
      verificationActivityId: activity.id,
      scope,
      objects: [
        stamped(activityEntry),
        ...requirements.map(stamped),
        ...designItems.map(stamped),
        ...decisions.map(stamped),
        ...assumptions.map(stamped),
        ...evidence.map(stamped),
      ].sort(compareReadinessBasisObjects),
      relationships: [...relationships.values()].sort(compareRelationships),
      monitoring: assumptions.map((entry) => entry.monitoring),
      changes,
    };

    return {
      activity,
      scope,
      basis,
      requirements,
      designItems,
      decisions,
      assumptions,
      evidence,
      unresolvedRequirementLinks: links
        .filter((link) => !link.inProject)
        .map((link) => ({ relationshipId: link.relationshipId, requirementId: link.requirementId })),
      requirementLinkCount: links.length,
      changes,
    };
  }

  /**
   * Evaluates the rule registry against a resolved basis.
   *
   * Pure: it reads the resolved context and returns findings. No database, no
   * clock, no randomness — the same basis produces the same findings in the
   * same order, which is what makes two evaluations comparable.
   */
  private evaluate(resolved: ReadinessContext): DraftFinding[] {
    const { activity, scope } = resolved;
    const drafts: DraftFinding[] = [];

    /**
     * Records one rule outcome.
     *
     * The registry is the authority: category, status, severity and the base
     * markers all come from the rule, and a rule that does not apply in this
     * scope produces nothing. An unknown rule id is a programming error and is
     * refused loudly rather than silently dropping a condition.
     */
    const emit = (
      ruleId: string,
      subject: FindingSubject,
      message: string,
      extraBasis: readonly VerificationReadinessBasisMarker[] = [],
    ): void => {
      const rule = readinessRule(ruleId);
      if (!rule) {
        throw new VerificationReadinessFailure(
          "The readiness evaluation referenced a rule that is not defined in the registry.",
        );
      }
      if (!ruleAppliesInScope(rule, scope)) return;

      drafts.push({
        ruleId: rule.id,
        category: rule.category,
        status: rule.status,
        severity: severityForFindingStatus(rule.status),
        subjectType: subject.type,
        subjectId: subject.id,
        subjectIdentifier: subject.identifier,
        subjectLabel: subject.label,
        message,
        basis: normalizeReadinessBasis([...rule.basis, ...extraBasis]),
        sequence: 0,
      });
    };

    const activitySubject: FindingSubject = {
      type: "VERIFICATION_ACTIVITY",
      id: activity.id,
      identifier: activity.identifier,
      label: activity.title,
    };
    const name = activity.identifier;

    // --- Lifecycle: which question is being answered at all -----------------
    emit(
      "VR-LIFE-001",
      activitySubject,
      `${name} is PLANNED. This assessment answers whether it can be executed, not whether it has passed.`,
    );
    emit(
      "VR-LIFE-002",
      activitySubject,
      `${name} is IN_PROGRESS. Execution has already begun, so this assessment answers whether it can be concluded responsibly rather than whether it can be started.`,
    );
    emit(
      "VR-LIFE-003",
      activitySubject,
      `${name} concluded as ${activity.status}${
        activity.completedDate ? ` on ${isoDate(activity.completedDate)}` : ""
      }. A recorded outcome is final, so there is no readiness question left to answer. Plan a new activity to re-verify.`,
    );

    // A concluded activity has exactly one thing to say. Everything below is
    // scoped out by the registry, so evaluating it would add nothing.
    if (scope === "NOT_APPLICABLE") return order(drafts);

    // --- Definition ---------------------------------------------------------
    if (activity.title.trim().length === 0) {
      emit(
        "VR-DEF-001",
        activitySubject,
        `${name} has no title. An activity nobody can name cannot be assigned, executed or reported.`,
      );
    }
    if (!activity.method) {
      emit(
        "VR-DEF-002",
        activitySubject,
        `${name} declares no verification method. Without one there is no statement of how the requirement would be shown to be met.`,
      );
    }

    // --- Owner --------------------------------------------------------------
    if (!activity.ownerId) {
      emit(
        "VR-OWN-001",
        activitySubject,
        `${name} has no owner assigned, so nobody is accountable for performing it. This does not block readiness: the domain models ownership as optional and no operation refuses to run without it.`,
      );
    }

    // --- Traceability -------------------------------------------------------
    if (resolved.requirementLinkCount === 0) {
      emit(
        "VR-TRACE-001",
        activitySubject,
        `${name} verifies no requirement. Verification demonstrates that a requirement is met, so with no requirement linked there is no baseline against which readiness could be judged.`,
      );
    }

    for (const link of resolved.unresolvedRequirementLinks) {
      // The subject is the activity, not the unreadable requirement: the
      // activity is the object whose readiness is in question, and naming a
      // record outside the caller's project — even by id — would leak the fact
      // that it exists. The relationship row is this project's own, so citing
      // it is safe and is what someone would need to investigate.
      emit(
        "VR-TRACE-002",
        activitySubject,
        `${name} is linked to a requirement that cannot be read in this project (relationship ${link.relationshipId}). Its state cannot be judged in either direction, so this condition is indeterminate rather than satisfied or failed.`,
      );
    }

    // --- Requirement state --------------------------------------------------
    for (const requirement of resolved.requirements) {
      const subject = toSubject(requirement);
      const label = requirement.identifier ?? requirement.id;

      if (requirement.state === "DRAFT" || requirement.state === "IN_REVIEW") {
        emit(
          "VR-REQ-001",
          subject,
          `Requirement ${label} is ${requirement.state}. A verification activity cannot be considered ready until the requirement reaches APPROVED or BASELINED.`,
        );
      } else if (requirement.state === "OBSOLETE") {
        emit(
          "VR-REQ-002",
          subject,
          `Requirement ${label} is OBSOLETE. It has been withdrawn from the baseline, so verifying it would produce a result about a statement the programme no longer holds.`,
        );
      } else if (requirement.state === "APPROVED" || requirement.state === "BASELINED") {
        emit(
          "VR-REQ-003",
          subject,
          `Requirement ${label} is ${requirement.state}, so the statement being verified is under configuration control.`,
        );
      } else {
        emit(
          "VR-TRACE-002",
          subject,
          `Requirement ${label} is linked to ${name} but its lifecycle state could not be read, so the requirement-state condition is indeterminate.`,
          ["SUBJECT_UNRESOLVED"],
        );
      }
    }

    // --- Design state -------------------------------------------------------
    for (const design of resolved.designItems) {
      const subject = toSubject(design);
      const label = design.identifier ?? design.id;

      if (design.state === "OBSOLETE") {
        emit(
          "VR-DES-001",
          subject,
          `Design item ${label} is OBSOLETE, and a requirement this activity verifies is recorded as being met by it. The verification would describe a configuration the programme has withdrawn.`,
        );
      } else if (design.state === "DRAFT" || design.state === "IN_REVIEW") {
        emit(
          "VR-DES-002",
          subject,
          `Design item ${label} is ${design.state}, so the configuration being verified can still move. This is not blocking: the domain permits verifying against an uncontrolled design.`,
        );
      } else if (design.state === "APPROVED" || design.state === "BASELINED") {
        emit(
          "VR-DES-003",
          subject,
          `Design item ${label} is ${design.state}, so the configuration being verified is under control.`,
        );
      }
    }

    // --- Decision state -----------------------------------------------------
    for (const decision of resolved.decisions) {
      const subject = toSubject(decision);
      const label = decision.identifier ?? decision.id;

      if (decision.state === "PROPOSED" || decision.state === "UNDER_REVIEW") {
        emit(
          "VR-DEC-001",
          subject,
          `Decision ${label} is ${decision.state}. The decision that establishes the configuration being verified has not been taken, so a result obtained now could be invalidated by the decision itself.`,
        );
      } else if (decision.state === "REJECTED") {
        emit(
          "VR-DEC-002",
          subject,
          `Decision ${label} is REJECTED, yet the record still says it addresses a verified requirement or shapes a prerequisite design item. Those two statements cannot both hold, and verification must not proceed on the contradiction.`,
        );
      } else if (decision.state === "SUPERSEDED") {
        emit(
          "VR-DEC-003",
          subject,
          `Decision ${label} is SUPERSEDED. The record does not link a superseded decision to its successor, so the engine cannot say which decision now governs — a person must confirm it.`,
        );
      } else if (decision.state === "APPROVED") {
        emit(
          "VR-DEC-004",
          subject,
          `Decision ${label} is APPROVED. This records that the decision was taken; it is not a claim that its content is correct.`,
        );
      }
    }

    // --- Assumption state ---------------------------------------------------
    for (const assumption of resolved.assumptions) {
      const subject = toSubject(assumption);
      const label = truncate(assumption.label);

      if (assumption.state === "INVALIDATED") {
        emit(
          "VR-ASM-005",
          subject,
          `An engineer recorded the assumption "${label}" as INVALIDATED, and it stands behind a decision this verification depends on. This consumes that judgement; nothing here sets an assumption's status.`,
        );
      }

      switch (assumption.monitoring.monitoringStatus) {
        case "REVIEW_REQUIRED":
          emit(
            "VR-ASM-001",
            subject,
            `Assumption monitoring reports REVIEW_REQUIRED for "${label}". Somebody had judged this assumption and the basis that judgement rested on has since moved, so the verification would stand on a conclusion nobody has re-confirmed.`,
          );
          break;
        case "BASIS_CHANGED":
          emit(
            "VR-ASM-002",
            subject,
            `Assumption monitoring reports BASIS_CHANGED for "${label}". The recorded basis moved, but no explicit judgement rested on it, so there is nothing to re-confirm.`,
          );
          break;
        case "CURRENT":
          emit(
            "VR-ASM-004",
            subject,
            `Assumption monitoring reports CURRENT for "${label}".`,
          );
          break;
        case "NOT_EVALUATED":
          emit(
            "VR-ASM-003",
            subject,
            `Assumption "${label}" stands behind a decision this verification depends on and has never been monitored. Nobody has checked its basis — which is not evidence that it fails, so this condition is indeterminate rather than blocking.`,
          );
          break;
      }
    }

    // --- Evidence -----------------------------------------------------------
    //
    // The distinction this section exists to hold: evidence is an *output* of
    // verification, not an input to readiness.
    if (resolved.evidence.length > 0) {
      for (const item of resolved.evidence) {
        emit(
          "VR-EVD-001",
          toSubject(item),
          `Evidence "${truncate(item.label)}" is attached to ${name}.`,
        );
      }
    } else {
      emit(
        "VR-EVD-002",
        activitySubject,
        `${name} has no evidence attached. That is expected before execution — verification evidence is what verification produces — and is not a readiness deficiency.`,
      );
      emit(
        "VR-EVD-003",
        activitySubject,
        `${name} is in progress and carries no evidence, so concluding it now would leave an outcome with no supporting record. Not blocking: the domain does not require evidence to conclude an activity.`,
      );
    }

    // --- Change impact ------------------------------------------------------
    for (const change of resolved.changes) {
      const subject: FindingSubject = {
        type: "CHANGE_REQUEST",
        id: change.changeRequestId,
        identifier: change.identifier,
        label: change.title,
      };
      const label = change.identifier ?? change.changeRequestId;

      if (change.analysisFreshness === "NOT_RUN") {
        emit(
          "VR-CHG-004",
          subject,
          `Change request ${label} is ${change.status} and touches this activity's engineering basis, and no completed impact analysis exists for it. How far it reaches has not been computed, so the engine cannot claim this activity is unaffected.`,
        );
        continue;
      }

      if (change.analysisFreshness === "STALE" || change.analysisFreshness === "UNKNOWN") {
        emit(
          "VR-CHG-003",
          subject,
          `Change request ${label} is ${change.status} and its impact analysis is ${
            change.analysisFreshness === "STALE" ? "stale" : "not comparable"
          }: it was computed against a project state that has since moved. Reading it as current would present an out-of-date impact assessment as evidence.`,
        );
        continue;
      }

      const affected = new Set(change.affectedSubjects);
      const requirementKeys = resolved.requirements.map((requirement) =>
        graphNodeKey({ type: requirement.type, id: requirement.id }),
      );

      if (affected.has(graphNodeKey({ type: "VERIFICATION_ACTIVITY", id: activity.id }))) {
        emit(
          "VR-CHG-001",
          subject,
          `Change request ${label} is ${change.status} and its current impact analysis reaches ${name} itself. Executing or closing the activity now would produce a result about a plan under revision.`,
        );
        continue;
      }

      const reached = requirementKeys.filter((key) => affected.has(key));
      if (reached.length > 0) {
        const names = resolved.requirements
          .filter((requirement) =>
            reached.includes(graphNodeKey({ type: requirement.type, id: requirement.id })),
          )
          .map((requirement) => requirement.identifier ?? requirement.id)
          .join(", ");
        emit(
          "VR-CHG-002",
          subject,
          `Change request ${label} is ${change.status} and its current impact analysis reaches ${names}, which ${name} verifies. The statement being verified is itself under proposed change.`,
        );
        continue;
      }

      if (affected.size > 0) {
        emit(
          "VR-CHG-005",
          subject,
          `Change request ${label} is ${change.status} and its current impact analysis reaches a prerequisite design item or decision, but neither ${name} nor a requirement it verifies. Worth reading before proceeding; not on its own a reason to stop.`,
        );
      }
    }

    return order(drafts);
  }
}

/**
 * Deterministic order, with the sequence written onto each row.
 *
 * Storing the position means the order rows are read back in is the order the
 * engine produced, rather than whatever the database returns.
 */
function order(drafts: DraftFinding[]): DraftFinding[] {
  return [...drafts]
    .sort(compareReadinessFindings)
    .map((draft, index) => ({ ...draft, sequence: index }));
}

/** Counts, derived from the findings actually about to be written. */
function tally(findings: readonly DraftFinding[]) {
  let blockingCount = 0;
  let warningCount = 0;
  let informationalCount = 0;
  let unknownCount = 0;

  for (const finding of findings) {
    if (finding.status === "BLOCKING") blockingCount += 1;
    else if (finding.status === "WARNING") warningCount += 1;
    else if (finding.status === "INFORMATIONAL") informationalCount += 1;
    else unknownCount += 1;
  }

  return {
    findingCount: findings.length,
    blockingCount,
    warningCount,
    informationalCount,
    unknownCount,
  };
}

function toSubject(entry: BasisEntry): FindingSubject {
  return {
    type: entry.type,
    id: entry.id,
    identifier: entry.identifier,
    label: entry.label,
  };
}

function compareEntries(a: BasisEntry, b: BasisEntry): number {
  const left = a.identifier ?? a.id;
  const right = b.identifier ?? b.id;
  if (left !== right) return left < right ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

function compareRelationships(
  a: ReadinessBasisRelationship,
  b: ReadinessBasisRelationship,
): number {
  if (a.edgeType !== b.edgeType) return a.edgeType < b.edgeType ? -1 : 1;
  if (a.relationshipId === b.relationshipId) return 0;
  return a.relationshipId < b.relationshipId ? -1 : 1;
}

/** Keeps a free-text statement readable inside a one-line finding message. */
function truncate(value: string, max = 120): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

/** Re-exported so callers name the same finding type as the domain. */
export type { VerificationReadinessFinding };

export const verificationReadinessService = new VerificationReadinessService();
