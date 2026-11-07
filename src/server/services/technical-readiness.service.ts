import {
  ACTIVE_SCOPE_LABEL,
  TECHNICAL_READINESS_VERSION,
  type ConsumedAssumptionMonitoring,
  type ConsumedChangeImpact,
  type ConsumedVerificationReadiness,
  type GraphNodeType,
  type LatestTechnicalReadiness,
  type TechnicalReadinessAssessment,
  type TechnicalReadinessBasisMarker,
  type TechnicalReadinessFreshness,
  type TechnicalReadinessGate,
  type TechnicalReadinessReport,
  type TechnicalReadinessScope,
  type TechnicalScopeObject,
  type TechnicalScopeRelationship,
  type TechnicalScopeRole,
  compareScopeObjects,
  compareTechnicalFindings,
  consumedAnalysisFreshness,
  emptyScopeCounts,
  evaluateTechnicalReadinessRequestSchema,
  graphNodeKey,
  hasVerificationReadiness,
  normalizeTechnicalBasis,
  ruleAppliesToGate,
  severityForTechnicalFindingStatus,
  technicalReadinessFingerprint,
  technicalReadinessFreshnessOf,
  technicalReadinessGateLabel,
  technicalReadinessIdSchema,
  technicalReadinessRule,
  technicalReadinessStatusFor,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { AppError, NotFoundError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import * as monitoringRepository from "@/server/repositories/assumption-monitoring.repository";
import { computeProjectFingerprint } from "@/server/repositories/project-revision.repository";
import * as projectRepository from "@/server/repositories/project.repository";
import * as scopeRepository from "@/server/repositories/technical-readiness-scope.repository";
import type {
  ScopedAssumption,
  ScopedChangeRequest,
  ScopedDecision,
  ScopedDesignItem,
  ScopedIssue,
  ScopedRequirement,
  ScopedRisk,
  ScopedStakeholderNeed,
  ScopedVerificationActivity,
} from "@/server/repositories/technical-readiness-scope.repository";
import * as readinessRepository from "@/server/repositories/technical-readiness.repository";
import type { PersistTechnicalFindingInput } from "@/server/repositories/technical-readiness.repository";
import * as verificationReadinessRepository from "@/server/repositories/verification-readiness.repository";
import {
  EngineeringGraphService,
  engineeringGraphService,
} from "@/server/services/engineering-graph.service";
import {
  VerificationReadinessService,
  verificationReadinessService,
} from "@/server/services/verification-readiness.service";
import { parseOrThrow } from "@/server/validation";
import {
  artifactAuditEvent,
  requireProjectReadAccess,
  requireProjectWriteAccess,
} from "./project-scope";

/**
 * The technical readiness engine.
 *
 * It answers one question about one project at one gate — *based on the current
 * recorded engineering state, is this ready to enter this gate?* — and it
 * answers it the same way every time: resolve the project's active engineering
 * scope, evaluate the gate's rules from `TECHNICAL_READINESS_RULES` against it,
 * and persist what fired.
 *
 * **The service owns no gate policy.** Every finding it emits comes from a rule
 * in the registry, looked up by id; `emitFinding` refuses an id the registry
 * does not define and refuses a rule that does not apply to the gate being
 * evaluated. No `if` in this file can introduce a condition nobody wrote down,
 * and no client can add one — the request contract carries a gate and nothing
 * else.
 *
 * **It aggregates; it does not duplicate.** Verification readiness, change
 * impact and assumption monitoring are consumed as verdicts from the engines
 * that own them. This service does not re-derive their rules, does not run them,
 * and never writes to anything it reads. An evaluation reads, judges, appends.
 *
 * **What it refuses to conclude.** There is no percentage, no score and no
 * confidence. READY is a statement about the record, not a decision to hold a
 * gate — a person still holds the gate. And missing information produces
 * UNKNOWN, never a pass: an unmonitored assumption, an un-run impact analysis, a
 * verification activity nobody has assessed. That refusal is the property the
 * whole capability rests on.
 *
 * **This is not certification.** `RELEASE_READY` is an internal engineering
 * gate. It is not a claim of regulatory or airworthiness approval, and
 * compliance evidence has its own semantics in a capability that does not exist.
 */

export const TECHNICAL_READINESS_ENTITY_TYPE = "TechnicalReadinessAssessment";

export const TECHNICAL_READINESS_AUDIT_ACTIONS = {
  evaluationStarted: "technical_readiness.evaluation_started",
  evaluated: "technical_readiness.evaluated",
} as const;

/** Raised when the project's state cannot be read well enough to judge a gate. */
export class TechnicalReadinessFailure extends AppError {
  constructor(message: string) {
    super(message, {
      statusCode: 422,
      code: "TECHNICAL_READINESS_FAILED",
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

/** A finding before it is ordered and written. */
type DraftFinding = PersistTechnicalFindingInput;

/** One verification activity with the readiness verdict consumed for it. */
interface ActivityWithReadiness {
  activity: ScopedVerificationActivity;
  readiness: ConsumedVerificationReadiness;
  /** Evidence rows attached to it. Loaded only where a rule reads them. */
  evidenceCount: number;
}

/** One assumption with the monitoring verdict consumed for it. */
interface AssumptionWithMonitoring {
  assumption: ScopedAssumption;
  monitoring: ConsumedAssumptionMonitoring;
}

/** Everything one gate evaluation needs, resolved once. */
interface ResolvedScope {
  gate: TechnicalReadinessGate;
  project: { id: string; name: string };
  scope: TechnicalReadinessScope;

  /** Requirements that have not been withdrawn. */
  liveRequirements: ScopedRequirement[];
  /** Every requirement, so "withdrawn" can be told from "absent". */
  allRequirements: ScopedRequirement[];

  designItems: ScopedDesignItem[];
  /** Design items that a live requirement is allocated to, by design item id. */
  allocatedDesignIds: Set<string>;
  /** Which live requirements reach each design item, for explainable messages. */
  designAllocatedFrom: Map<string, ScopedRequirement[]>;

  decisions: ScopedDecision[];
  assumptions: AssumptionWithMonitoring[];

  activities: ActivityWithReadiness[];
  needs: ScopedStakeholderNeed[];

  /** Live requirements with no design allocation recorded. */
  requirementsWithoutDesign: ScopedRequirement[];
  /** Live requirements with no verification activity recorded. */
  requirementsWithoutVerification: ScopedRequirement[];
  /** Stakeholder needs from which no requirement is derived. */
  needsWithoutRequirement: ScopedStakeholderNeed[];

  risks: ScopedRisk[];
  issues: ScopedIssue[];
  changes: Array<{ change: ScopedChangeRequest; consumed: ConsumedChangeImpact }>;
}

export class TechnicalReadinessService {
  constructor(
    private readonly graph: EngineeringGraphService = engineeringGraphService,
    private readonly verificationReadiness: VerificationReadinessService = verificationReadinessService,
  ) {}

  /**
   * Evaluates a gate and appends an immutable assessment.
   *
   * Explicit: nothing triggers this on a page load, and nothing schedules it. A
   * gate assessment is a claim about a moment, and silently recomputing one
   * would make "when was this judged, and against what?" unanswerable — which is
   * exactly the question a gate record exists to answer.
   */
  async evaluateTechnicalReadiness(
    context: OrganizationContext,
    projectId: unknown,
    request: unknown,
  ): Promise<TechnicalReadinessReport> {
    const scopedProjectId = await requireProjectWriteAccess(context, projectId);
    // The gate, and nothing else. A client that tries to send a verdict, a rule,
    // an actor or a version is rejected rather than having it silently dropped.
    const { gate } = parseOrThrow(
      evaluateTechnicalReadinessRequestSchema,
      request ?? {},
      "Invalid technical readiness request",
    );

    await auditLogRepository
      .recordAuditEvent(
        artifactAuditEvent(
          context,
          TECHNICAL_READINESS_AUDIT_ACTIONS.evaluationStarted,
          "Project",
          scopedProjectId,
          { gate, readinessVersion: TECHNICAL_READINESS_VERSION },
        ),
      )
      // Losing the "started" marker must not prevent the evaluation itself.
      .catch(() => {});

    const resolved = await this.resolveScope(context, scopedProjectId, gate);
    const findings = this.evaluate(resolved);
    const status = technicalReadinessStatusFor(findings);
    const fingerprint = technicalReadinessFingerprint(resolved.scope);
    const counts = tally(findings);

    const assessment = await prisma.$transaction(async (tx) => {
      const written = await readinessRepository.createAssessment(
        {
          projectId: scopedProjectId,
          gate,
          status,
          readinessVersion: TECHNICAL_READINESS_VERSION,
          fingerprint,
          scope: resolved.scope,
          evaluatedById: context.actorId,
          ...counts,
        },
        tx,
      );

      await readinessRepository.createFindings(written.id, findings, tx);

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          TECHNICAL_READINESS_AUDIT_ACTIONS.evaluated,
          TECHNICAL_READINESS_ENTITY_TYPE,
          written.id,
          {
            projectId: scopedProjectId,
            gate,
            status,
            readinessVersion: TECHNICAL_READINESS_VERSION,
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
      // Just written from this scope, so it is current by construction.
      freshness: "CURRENT",
      findings: persisted,
      scope: resolved.scope,
    };
  }

  /**
   * The most recent assessment of one gate, with freshness derived at read time.
   *
   * Returns a distinct `NOT_EVALUATED` shape when the gate has never been
   * assessed: zero findings would read as "we checked and found nothing wrong",
   * a far stronger claim than "nobody has assessed this gate".
   *
   * Reading never evaluates. A stale assessment is reported as stale and left
   * exactly as it was written.
   */
  async getLatestTechnicalReadiness(
    context: OrganizationContext,
    projectId: unknown,
    gate: unknown,
  ): Promise<LatestTechnicalReadiness> {
    const scopedProjectId = await requireProjectReadAccess(context, projectId);
    const { gate: scopedGate } = parseOrThrow(
      evaluateTechnicalReadinessRequestSchema,
      { gate },
      "Invalid gate",
    );

    const latest = await readinessRepository.findLatestAssessment(scopedProjectId, scopedGate);
    if (!latest) {
      return {
        status: "NOT_EVALUATED",
        projectId: scopedProjectId,
        gate: scopedGate,
        readinessVersion: TECHNICAL_READINESS_VERSION,
      };
    }

    return this.buildReport(context, scopedProjectId, latest);
  }

  /**
   * Assessments for a project, newest first, optionally for one gate.
   *
   * Nothing is ever overwritten, so this is the full record of how a gate has
   * moved over the life of the programme.
   */
  async listTechnicalReadinessHistory(
    context: OrganizationContext,
    projectId: unknown,
    gate?: unknown,
  ): Promise<TechnicalReadinessAssessment[]> {
    const scopedProjectId = await requireProjectReadAccess(context, projectId);

    const scopedGate =
      gate === undefined || gate === null || gate === ""
        ? undefined
        : parseOrThrow(evaluateTechnicalReadinessRequestSchema, { gate }, "Invalid gate").gate;

    return readinessRepository.listAssessments(scopedProjectId, scopedGate);
  }

  /**
   * One assessment in full, by id, with the findings and scope it was written
   * with — and its freshness against the state as it stands now.
   *
   * A historical assessment is shown exactly as it was recorded. It is never
   * re-judged under today's state, because the value of a gate record is that it
   * says what was believed then.
   */
  async explainTechnicalReadiness(
    context: OrganizationContext,
    projectId: unknown,
    assessmentId: unknown,
  ): Promise<TechnicalReadinessReport> {
    const scopedProjectId = await requireProjectReadAccess(context, projectId);
    const id = parseOrThrow(technicalReadinessIdSchema, assessmentId, "Invalid assessment id");

    const assessment = await readinessRepository.findAssessmentInProject(scopedProjectId, id);
    if (!assessment) {
      throw new NotFoundError(`Technical readiness assessment ${id} was not found.`);
    }

    return this.buildReport(context, scopedProjectId, assessment);
  }

  // --- Internals ------------------------------------------------------------

  /**
   * Assembles a stored assessment into a report.
   *
   * Freshness is derived by resolving the gate's scope again and comparing
   * fingerprints — the assessment record itself is never touched, and a stale
   * one is never quietly recomputed and presented as current.
   */
  private async buildReport(
    context: OrganizationContext,
    projectId: string,
    assessment: TechnicalReadinessAssessment,
  ): Promise<TechnicalReadinessReport> {
    const [findings, storedScope, freshness] = await Promise.all([
      readinessRepository.listFindings(assessment.id),
      readinessRepository.readAssessmentScope(assessment),
      this.deriveFreshness(context, projectId, assessment),
    ]);

    return { assessment, freshness, findings, scope: storedScope };
  }

  /**
   * Whether the stored assessment still rests on the state it was written from.
   *
   * A scope that cannot be resolved reports UNKNOWN rather than pretending
   * either way — the one thing this must never do is answer "current" because
   * it failed to check.
   */
  private async deriveFreshness(
    context: OrganizationContext,
    projectId: string,
    assessment: TechnicalReadinessAssessment,
  ): Promise<TechnicalReadinessFreshness> {
    try {
      const resolved = await this.resolveScope(context, projectId, assessment.gate);
      return technicalReadinessFreshnessOf(
        assessment.fingerprint,
        technicalReadinessFingerprint(resolved.scope),
        assessment.readinessVersion,
      );
    } catch {
      return "UNKNOWN";
    }
  }

  /**
   * Resolves the project's current active engineering scope for one gate.
   *
   * Artifact state comes from batched, project-scoped reads — one query per
   * type, never one per object. Topology comes from `EngineeringGraphService`
   * in four batched hops:
   *
   *   1. stakeholder needs → the requirements derived from them
   *   2. requirements → the design they are allocated to, the activities that
   *      verify them, and the decisions they are linked to
   *   3. design items → the decisions that shape them
   *   4. verification activities → their evidence (release gate only)
   *
   * Two consumptions are deliberately gate-conditional, because only one gate's
   * rules read them and paying for them elsewhere would be waste that also
   * widened the fingerprint beyond the gate's real basis:
   *
   *   - **Verification readiness** is consumed only at `VERIFICATION_READY`.
   *     Each activity's verdict comes from the engine that owns it, so freshness
   *     is that engine's judgement rather than a second implementation of it.
   *     The cost is one readiness read per in-scope activity; an activity nobody
   *     has assessed short-circuits before any graph work.
   *   - **Evidence** is loaded only at `RELEASE_READY`.
   *
   * Change impact and assumption monitoring are consumed at every gate, both
   * through batched reads.
   */
  private async resolveScope(
    context: OrganizationContext,
    projectId: string,
    gate: TechnicalReadinessGate,
  ): Promise<ResolvedScope> {
    const project = await projectRepository.findProjectInOrganization(
      context.organizationId,
      projectId,
    );
    if (!project) {
      throw new NotFoundError(`Project ${projectId} was not found.`);
    }

    const [allRequirements, designItems, allDecisions, activities, needs, risks, issues, changes] =
      await Promise.all([
        scopeRepository.loadRequirements(projectId),
        scopeRepository.loadDesignItems(projectId),
        scopeRepository.loadDecisions(projectId),
        scopeRepository.loadVerificationActivities(projectId),
        scopeRepository.loadStakeholderNeeds(projectId),
        scopeRepository.loadRisks(projectId),
        scopeRepository.loadIssues(projectId),
        scopeRepository.loadActiveChangeRequests(projectId),
      ]);

    // "Live" is the honest boundary for the active engineering scope: a
    // withdrawn requirement is not something a gate is about, but it must stay
    // visible so "withdrawn" can be told from "never existed".
    const liveRequirements = allRequirements.filter(
      (requirement) => requirement.status !== "OBSOLETE",
    );

    const relationships = new Map<string, TechnicalScopeRelationship>();
    const record = (
      edgeType: TechnicalScopeRelationship["edgeType"],
      relationshipId: string,
      from: { type: GraphNodeType; id: string },
      to: { type: GraphNodeType; id: string },
    ) => {
      relationships.set(`${edgeType}:${relationshipId}`, {
        edgeType,
        relationshipId,
        fromType: from.type,
        fromId: from.id,
        toType: to.type,
        toId: to.id,
      });
    };

    // Hop 1 — needs to the requirements derived from them.
    const needRefs = needs.map((need) => ({ type: "STAKEHOLDER_NEED" as const, id: need.id }));
    const needsWithRequirement = new Set<string>();

    if (needRefs.length > 0) {
      const hop = await this.graph.getNeighborhoods(context, projectId, needRefs, "OUTBOUND", [
        "STAKEHOLDER_NEED_DERIVES_REQUIREMENT",
      ]);
      for (const ref of needRefs) {
        for (const connection of hop.get(graphNodeKey(ref)) ?? []) {
          if (connection.edge.type !== "STAKEHOLDER_NEED_DERIVES_REQUIREMENT") continue;
          needsWithRequirement.add(ref.id);
          record(connection.edge.type, connection.edge.relationshipId, ref, {
            type: connection.neighbor.type,
            id: connection.neighbor.id,
          });
        }
      }
    }

    // Hop 2 — everything a live requirement reaches.
    const requirementRefs = liveRequirements.map((r) => ({
      type: "REQUIREMENT" as const,
      id: r.id,
    }));

    const allocatedDesignIds = new Set<string>();
    const designAllocatedFrom = new Map<string, ScopedRequirement[]>();
    const requirementsWithDesign = new Set<string>();
    const requirementsWithVerification = new Set<string>();
    const linkedDecisionIds = new Set<string>();
    const verifyingActivityIds = new Set<string>();
    const requirementById = new Map(liveRequirements.map((r) => [r.id, r]));

    if (requirementRefs.length > 0) {
      const hop = await this.graph.getNeighborhoods(
        context,
        projectId,
        requirementRefs,
        "OUTBOUND",
        [
          "REQUIREMENT_ALLOCATED_TO_DESIGN",
          "REQUIREMENT_VERIFIED_BY",
          "REQUIREMENT_LINKED_TO_DECISION",
        ],
      );

      for (const ref of requirementRefs) {
        const requirement = requirementById.get(ref.id);
        for (const connection of hop.get(graphNodeKey(ref)) ?? []) {
          const { edge, neighbor } = connection;
          record(edge.type, edge.relationshipId, ref, { type: neighbor.type, id: neighbor.id });

          if (edge.type === "REQUIREMENT_ALLOCATED_TO_DESIGN") {
            requirementsWithDesign.add(ref.id);
            allocatedDesignIds.add(neighbor.id);
            if (requirement) {
              const from = designAllocatedFrom.get(neighbor.id) ?? [];
              from.push(requirement);
              designAllocatedFrom.set(neighbor.id, from);
            }
          } else if (edge.type === "REQUIREMENT_VERIFIED_BY") {
            requirementsWithVerification.add(ref.id);
            verifyingActivityIds.add(neighbor.id);
          } else if (edge.type === "REQUIREMENT_LINKED_TO_DECISION") {
            // Both link directions count here. A decision taken to address a
            // requirement and one a requirement was derived from are equally
            // part of the recorded basis a project-level gate rests on — which
            // is a wider boundary than verification readiness draws for a single
            // activity, and deliberately so.
            linkedDecisionIds.add(neighbor.id);
          }
        }
      }
    }

    // A design item is in scope when it has not been withdrawn, or when a live
    // requirement is still allocated to it — the second case is exactly the
    // contradiction TR-DES-002 exists to report.
    const scopedDesignItems = designItems.filter(
      (item) => item.status !== "OBSOLETE" || allocatedDesignIds.has(item.id),
    );

    // Hop 3 — decisions that shape an in-scope design item.
    const designRefs = scopedDesignItems.map((item) => ({
      type: "DESIGN_ITEM" as const,
      id: item.id,
    }));

    if (designRefs.length > 0) {
      const hop = await this.graph.getNeighborhoods(context, projectId, designRefs, "INBOUND", [
        "DECISION_AFFECTS_DESIGN",
      ]);
      for (const ref of designRefs) {
        for (const connection of hop.get(graphNodeKey(ref)) ?? []) {
          if (connection.edge.type !== "DECISION_AFFECTS_DESIGN") continue;
          linkedDecisionIds.add(connection.neighbor.id);
          record(
            connection.edge.type,
            connection.edge.relationshipId,
            { type: connection.neighbor.type, id: connection.neighbor.id },
            ref,
          );
        }
      }
    }

    // Only decisions the record actually connects to something in scope. A
    // decision nothing references is not part of what this gate is about.
    const decisions = allDecisions.filter((decision) => linkedDecisionIds.has(decision.id));

    // Verification activities that verify a live requirement.
    const scopedActivities = activities.filter((activity) =>
      verifyingActivityIds.has(activity.id),
    );

    // Hop 4 — evidence, at the one gate whose rules read it.
    const evidenceByActivity = new Map<string, string[]>();
    if (gate === "RELEASE_READY" && scopedActivities.length > 0) {
      const activityRefs = scopedActivities.map((activity) => ({
        type: "VERIFICATION_ACTIVITY" as const,
        id: activity.id,
      }));
      const hop = await this.graph.getNeighborhoods(
        context,
        projectId,
        activityRefs,
        "OUTBOUND",
        ["VERIFICATION_HAS_EVIDENCE"],
      );
      for (const ref of activityRefs) {
        const found: string[] = [];
        for (const connection of hop.get(graphNodeKey(ref)) ?? []) {
          if (connection.edge.type !== "VERIFICATION_HAS_EVIDENCE") continue;
          found.push(connection.neighbor.id);
          record(connection.edge.type, connection.edge.relationshipId, ref, {
            type: connection.neighbor.type,
            id: connection.neighbor.id,
          });
        }
        evidenceByActivity.set(ref.id, found);
      }
    }

    // --- Consumed verdicts -------------------------------------------------

    const assumptionRows = await scopeRepository.loadAssumptions(
      projectId,
      decisions.map((decision) => decision.id),
    );
    const monitoringStates = await monitoringRepository.findLatestForAssumptions(
      projectId,
      assumptionRows.map((assumption) => assumption.id),
    );

    const assumptions: AssumptionWithMonitoring[] = assumptionRows.map((assumption) => {
      const record_ = monitoringStates.get(assumption.id) ?? null;
      return {
        assumption,
        monitoring: {
          assumptionId: assumption.id,
          decisionId: assumption.engineeringDecisionId,
          // Consumed, never written. NOT_EVALUATED means nobody has looked,
          // which is different from having looked and found nothing.
          monitoringStatus: record_ ? record_.status : "NOT_EVALUATED",
          assumptionStatus: assumption.status,
        },
      };
    });

    // Verification readiness, consumed at exactly the depth each gate asks for.
    //
    // At DESIGN_FREEZE only the *existence* of an assessment matters, which is
    // one batched query. At VERIFICATION_READY the verdict and its freshness
    // matter, and both come from the engine that owns them — one read per
    // activity, which is the price of not reimplementing its freshness rule.
    const existingAssessments =
      gate === "DESIGN_FREEZE"
        ? await verificationReadinessRepository.findLatestForActivities(
            projectId,
            scopedActivities.map((activity) => activity.id),
          )
        : new Map();

    const activityReadiness: ActivityWithReadiness[] = [];
    for (const activity of scopedActivities) {
      let consumed: ConsumedVerificationReadiness = {
        verificationActivityId: activity.id,
        assessmentId: null,
        status: null,
        freshness: null,
        blockingCount: null,
      };

      if (gate === "DESIGN_FREEZE") {
        const existing = existingAssessments.get(activity.id);
        if (existing) {
          // Existence only. This gate does not ask what the verdict was, so it
          // must not depend on it — reading further would make the freeze gate
          // stale whenever a readiness assessment moved.
          consumed = { ...consumed, assessmentId: existing.id };
        }
      } else if (gate === "VERIFICATION_READY") {
        const latest = await this.verificationReadiness.getLatestVerificationReadiness(
          context,
          projectId,
          activity.id,
        );
        if (hasVerificationReadiness(latest)) {
          consumed = {
            verificationActivityId: activity.id,
            assessmentId: latest.assessment.id,
            status: latest.assessment.status,
            freshness: latest.freshness,
            blockingCount: latest.assessment.summary.blocking,
          };
        }
      }

      activityReadiness.push({
        activity,
        readiness: consumed,
        evidenceCount: (evidenceByActivity.get(activity.id) ?? []).length,
      });
    }

    // Change impact. The project fingerprint is computed once, not per change.
    const latestAnalyses = await scopeRepository.loadLatestAnalyses(
      projectId,
      changes.map((change) => change.id),
    );
    const needsFingerprint = latestAnalyses.size > 0;
    const projectFingerprint = needsFingerprint
      ? await computeProjectFingerprint(projectId)
      : null;

    const scopeNodeIds = [
      ...liveRequirements.map((r) => r.id),
      ...scopedDesignItems.map((d) => d.id),
      ...decisions.map((d) => d.id),
      ...scopedActivities.map((a) => a.id),
    ];
    const scopeKeys = new Set([
      ...liveRequirements.map((r) => `REQUIREMENT:${r.id}`),
      ...scopedDesignItems.map((d) => `DESIGN_ITEM:${d.id}`),
      ...decisions.map((d) => `ENGINEERING_DECISION:${d.id}`),
      ...scopedActivities.map((a) => `VERIFICATION_ACTIVITY:${a.id}`),
    ]);

    const reachRows = await scopeRepository.loadAnalysisReach(
      [...latestAnalyses.values()].map((analysis) => analysis.id),
      scopeNodeIds,
    );
    const reachByAnalysis = new Map<string, Set<string>>();
    for (const row of reachRows) {
      const key = `${row.nodeType}:${row.nodeId}`;
      // Ids are unique per table, not globally, so the pair is re-checked here.
      if (!scopeKeys.has(key)) continue;
      const reached = reachByAnalysis.get(row.analysisId) ?? new Set<string>();
      reached.add(key);
      reachByAnalysis.set(row.analysisId, reached);
    }

    const consumedChanges = changes.map((change) => {
      const analysis = latestAnalyses.get(change.id) ?? null;
      const reached = analysis ? [...(reachByAnalysis.get(analysis.id) ?? [])].sort() : [];
      return {
        change,
        consumed: {
          changeRequestId: change.id,
          identifier: change.identifier,
          status: change.status,
          analysisId: analysis ? analysis.id : null,
          // Shared with every other engine that reads impact analyses, so none
          // of them can drift into treating a stale result as current.
          analysisFreshness: consumedAnalysisFreshness(analysis, projectFingerprint),
          reachedScopeKeys: reached,
        } satisfies ConsumedChangeImpact,
      };
    });

    // --- The persisted scope snapshot --------------------------------------

    // Risks and issues that someone has closed out are not part of what a gate
    // is about; a resolved issue is likewise done. Everything else is kept with
    // the state a rule reads.
    const openRisks = risks.filter((risk) => risk.status !== "CLOSED");
    const unresolvedIssues = issues.filter(
      (issue) => issue.status !== "CLOSED" && issue.status !== "RESOLVED",
    );

    const evidenceIds = [...new Set([...evidenceByActivity.values()].flat())];

    const refs = [
      ...liveRequirements.map((r) => ({ type: "REQUIREMENT" as const, id: r.id })),
      ...scopedDesignItems.map((d) => ({ type: "DESIGN_ITEM" as const, id: d.id })),
      ...decisions.map((d) => ({ type: "ENGINEERING_DECISION" as const, id: d.id })),
      ...assumptions.map((a) => ({ type: "DECISION_ASSUMPTION" as const, id: a.assumption.id })),
      ...scopedActivities.map((a) => ({ type: "VERIFICATION_ACTIVITY" as const, id: a.id })),
      ...needs.map((n) => ({ type: "STAKEHOLDER_NEED" as const, id: n.id })),
      ...evidenceIds.map((id) => ({ type: "EVIDENCE" as const, id })),
      ...changes.map((c) => ({ type: "CHANGE_REQUEST" as const, id: c.id })),
      ...openRisks.map((r) => ({ type: "RISK" as const, id: r.id })),
      ...unresolvedIssues.map((i) => ({ type: "ISSUE" as const, id: i.id })),
    ];
    const revisions = await this.graph.getNodeRevisions(context, projectId, refs);

    const stamp = (
      role: TechnicalScopeRole,
      type: GraphNodeType,
      id: string,
      identifier: string | null,
      state: string | null,
    ): TechnicalScopeObject => {
      const revision = revisions.get(graphNodeKey({ type, id }));
      return {
        role,
        type,
        id,
        identifier,
        state,
        // The object's own last revision — never "now". This is what makes
        // "has the scope moved?" answerable without storing a copy of it.
        revision: revision ? revision.toISOString() : "unresolved",
      };
    };

    const objects: TechnicalScopeObject[] = [
      ...liveRequirements.map((r) => stamp("REQUIREMENT", "REQUIREMENT", r.id, r.identifier, r.status)),
      ...scopedDesignItems.map((d) => stamp("DESIGN_ITEM", "DESIGN_ITEM", d.id, d.identifier, d.status)),
      ...decisions.map((d) =>
        stamp("ENGINEERING_DECISION", "ENGINEERING_DECISION", d.id, d.identifier, d.status),
      ),
      ...assumptions.map((a) =>
        stamp(
          "DECISION_ASSUMPTION",
          "DECISION_ASSUMPTION",
          a.assumption.id,
          null,
          a.assumption.status,
        ),
      ),
      ...scopedActivities.map((a) =>
        stamp("VERIFICATION_ACTIVITY", "VERIFICATION_ACTIVITY", a.id, a.identifier, a.status),
      ),
      ...needs.map((n) => stamp("STAKEHOLDER_NEED", "STAKEHOLDER_NEED", n.id, n.identifier, null)),
      ...evidenceIds.map((id) => stamp("EVIDENCE", "EVIDENCE", id, null, null)),
      ...changes.map((c) => stamp("CHANGE_REQUEST", "CHANGE_REQUEST", c.id, c.identifier, c.status)),
      ...openRisks.map((r) => stamp("RISK", "RISK", r.id, r.identifier, r.status)),
      ...unresolvedIssues.map((i) =>
        stamp("ISSUE", "ISSUE", i.id, i.identifier, `${i.severity}/${i.status}`),
      ),
    ].sort(compareScopeObjects);

    const counts = emptyScopeCounts();
    for (const object of objects) counts[object.role] += 1;

    const scope: TechnicalReadinessScope = {
      gate,
      label: ACTIVE_SCOPE_LABEL,
      counts,
      objects,
      relationships: [...relationships.values()].sort(compareRelationships),
      consumed: {
        verificationReadiness: activityReadiness
          .map((entry) => entry.readiness)
          .sort((a, b) =>
            a.verificationActivityId < b.verificationActivityId
              ? -1
              : a.verificationActivityId > b.verificationActivityId
                ? 1
                : 0,
          ),
        changeImpact: consumedChanges
          .map((entry) => entry.consumed)
          .sort((a, b) =>
            a.changeRequestId < b.changeRequestId ? -1 : a.changeRequestId > b.changeRequestId ? 1 : 0,
          ),
        assumptionMonitoring: assumptions
          .map((entry) => entry.monitoring)
          .sort((a, b) => (a.assumptionId < b.assumptionId ? -1 : a.assumptionId > b.assumptionId ? 1 : 0)),
      },
    };

    return {
      gate,
      project: { id: project.id, name: project.name },
      scope,
      liveRequirements,
      allRequirements,
      designItems: scopedDesignItems,
      allocatedDesignIds,
      designAllocatedFrom,
      decisions,
      assumptions,
      activities: activityReadiness,
      needs,
      requirementsWithoutDesign: liveRequirements.filter(
        (requirement) => !requirementsWithDesign.has(requirement.id),
      ),
      requirementsWithoutVerification: liveRequirements.filter(
        (requirement) => !requirementsWithVerification.has(requirement.id),
      ),
      needsWithoutRequirement: needs.filter((need) => !needsWithRequirement.has(need.id)),
      risks: openRisks,
      issues: unresolvedIssues,
      changes: consumedChanges,
    };
  }

  /**
   * Evaluates the gate's rules against a resolved scope.
   *
   * Pure: it reads the resolved scope and returns findings. No database, no
   * clock, no randomness — the same scope produces the same findings in the same
   * order, which is what makes two evaluations comparable.
   */
  private evaluate(resolved: ResolvedScope): DraftFinding[] {
    const { gate } = resolved;
    const drafts: DraftFinding[] = [];

    const projectSubject: FindingSubject = {
      type: "PROJECT",
      id: resolved.project.id,
      identifier: null,
      label: resolved.project.name,
    };

    /**
     * Records one rule outcome.
     *
     * The registry is the authority: category, status, severity and the base
     * markers all come from the rule, and a rule that does not apply to this
     * gate produces nothing. An unknown rule id is a programming error and is
     * refused loudly rather than silently dropping a condition.
     */
    const emitFinding = (
      ruleId: string,
      subject: FindingSubject,
      message: string,
      extraBasis: readonly TechnicalReadinessBasisMarker[] = [],
    ): void => {
      const rule = technicalReadinessRule(ruleId);
      if (!rule) {
        throw new TechnicalReadinessFailure(
          "The gate evaluation referenced a rule that is not defined in the registry.",
        );
      }
      if (!ruleAppliesToGate(rule, gate)) return;

      drafts.push({
        ruleId: rule.id,
        category: rule.category,
        status: rule.status,
        severity: severityForTechnicalFindingStatus(rule.status),
        subjectType: subject.type,
        subjectId: subject.id,
        subjectIdentifier: subject.identifier,
        subjectLabel: subject.label,
        message,
        basis: normalizeTechnicalBasis([...rule.basis, ...extraBasis]),
        sequence: 0,
      });
    };

    const gateName = technicalReadinessGateLabel(gate).toLowerCase();
    const { counts } = resolved.scope;

    // --- Scope --------------------------------------------------------------
    emitFinding(
      "TR-SCP-001",
      projectSubject,
      `Evaluated the ${resolved.scope.label.toLowerCase()}: ${counts.REQUIREMENT} requirement(s), ${counts.DESIGN_ITEM} design item(s), ${counts.ENGINEERING_DECISION} decision(s), ${counts.DECISION_ASSUMPTION} assumption(s), ${counts.VERIFICATION_ACTIVITY} verification activity(ies), ${counts.CHANGE_REQUEST} in-flight change(s), ${counts.RISK} open risk(s) and ${counts.ISSUE} unresolved issue(s).`,
    );

    // --- Requirements -------------------------------------------------------
    if (resolved.allRequirements.length === 0) {
      emitFinding(
        "TR-REQ-001",
        projectSubject,
        `${resolved.project.name} records no requirement, so there is no engineering state to assess against the ${gateName} gate.`,
      );
    }

    for (const requirement of resolved.liveRequirements) {
      const subject = artifactSubject("REQUIREMENT", requirement.id, requirement.identifier, requirement.title);

      if (requirement.status === "DRAFT") {
        emitFinding(
          "TR-REQ-002",
          subject,
          `Requirement ${requirement.identifier} is DRAFT. It has not been through review, so nothing downstream of it can be relied on at the ${gateName} gate.`,
        );
      } else if (requirement.status === "IN_REVIEW") {
        emitFinding(
          "TR-REQ-003",
          subject,
          `Requirement ${requirement.identifier} is IN_REVIEW. Review in progress is expected at this stage; it is recorded so a reviewer knows what is still moving.`,
        );
        emitFinding(
          "TR-REQ-004",
          subject,
          `Requirement ${requirement.identifier} is IN_REVIEW. The ${gateName} gate rests on a settled requirement set, and a statement that can still change invalidates the configuration, the verification plan and the release argument built on it.`,
        );
      } else if (requirement.status === "APPROVED") {
        emitFinding(
          "TR-REQ-005",
          subject,
          `Requirement ${requirement.identifier} is APPROVED but not BASELINED. A release argument is a claim about a fixed set of statements, and only a baseline records which version the product was shown to meet.`,
        );
      }
    }

    const controlled = resolved.liveRequirements.filter(
      (requirement) => requirement.status === "APPROVED" || requirement.status === "BASELINED",
    ).length;
    const baselined = resolved.liveRequirements.filter((r) => r.status === "BASELINED").length;
    emitFinding(
      "TR-REQ-006",
      projectSubject,
      `${controlled} of ${resolved.liveRequirements.length} live requirement(s) are APPROVED or BASELINED, of which ${baselined} are BASELINED. ${resolved.allRequirements.length - resolved.liveRequirements.length} requirement(s) are OBSOLETE and outside this scope.`,
    );

    // --- Traceability -------------------------------------------------------
    for (const need of resolved.needsWithoutRequirement) {
      emitFinding(
        "TR-TRC-001",
        artifactSubject("STAKEHOLDER_NEED", need.id, need.identifier, need.title),
        `Stakeholder need ${need.identifier} has no requirement derived from it, so nothing in the requirement set answers what was asked for.`,
      );
    }

    for (const requirement of resolved.requirementsWithoutDesign) {
      emitFinding(
        "TR-TRC-002",
        artifactSubject("REQUIREMENT", requirement.id, requirement.identifier, requirement.title),
        `Requirement ${requirement.identifier} is not allocated to any design item, so nothing in the recorded product structure is answerable for it. Not blocking: the record does not say whether this is a product requirement or a process one.`,
      );
    }

    for (const requirement of resolved.requirementsWithoutVerification) {
      emitFinding(
        "TR-TRC-003",
        artifactSubject("REQUIREMENT", requirement.id, requirement.identifier, requirement.title),
        `Requirement ${requirement.identifier} has no verification activity planned. Verification planning may still be in progress at freeze, so this is surfaced rather than treated as disqualifying.`,
      );
      emitFinding(
        "TR-TRC-004",
        artifactSubject("REQUIREMENT", requirement.id, requirement.identifier, requirement.title),
        `Requirement ${requirement.identifier} has no verification activity, so nothing in the record could show that it is met.`,
      );
    }

    emitFinding(
      "TR-TRC-005",
      projectSubject,
      `Walked ${resolved.scope.relationships.length} relationship row(s): ${resolved.liveRequirements.length - resolved.requirementsWithoutDesign.length} requirement(s) allocated to design, ${resolved.liveRequirements.length - resolved.requirementsWithoutVerification.length} with a verification activity, and ${resolved.needs.length - resolved.needsWithoutRequirement.length} of ${resolved.needs.length} stakeholder need(s) traced to a requirement.`,
    );

    // --- Design -------------------------------------------------------------
    if (resolved.designItems.length === 0) {
      emitFinding(
        "TR-DES-001",
        projectSubject,
        `${resolved.project.name} records no design item, so there is no product structure to review, freeze or release.`,
      );
    }

    for (const item of resolved.designItems) {
      const subject = artifactSubject("DESIGN_ITEM", item.id, item.identifier, item.name);

      if (item.status === "OBSOLETE") {
        if (this.isAllocated(resolved, item.id)) {
          const from = (resolved.designAllocatedFrom.get(item.id) ?? [])
            .map((requirement) => requirement.identifier)
            .join(", ");
          emitFinding(
            "TR-DES-002",
            subject,
            `Design item ${item.identifier} is OBSOLETE, yet ${from || "a live requirement"} is still allocated to it. The record cannot both say the requirement is met here and that this element has been withdrawn.`,
          );
        }
        continue;
      }

      if (item.status === "DRAFT" || item.status === "IN_REVIEW") {
        emitFinding(
          "TR-DES-003",
          subject,
          `Design item ${item.identifier} is ${item.status}. Reviewing a design that is still being drafted is what a design review is for, so this is recorded rather than treated as a defect.`,
        );
        emitFinding(
          "TR-DES-004",
          subject,
          `Design item ${item.identifier} is ${item.status}. The ${gateName} gate states what the configuration is, and an element that can still change outside change control makes that statement untrue.`,
        );
      } else if (item.status === "APPROVED") {
        emitFinding(
          "TR-DES-005",
          subject,
          `Design item ${item.identifier} is APPROVED but not BASELINED. The domain does not require baselining a design item, so this does not block; a release record is clearer when the configuration it describes is baselined.`,
        );
      }
    }

    const controlledDesign = resolved.designItems.filter(
      (item) => item.status === "APPROVED" || item.status === "BASELINED",
    ).length;
    emitFinding(
      "TR-DES-006",
      projectSubject,
      `${controlledDesign} of ${resolved.designItems.length} in-scope design item(s) are APPROVED or BASELINED.`,
    );

    // --- Decisions ----------------------------------------------------------
    for (const decision of resolved.decisions) {
      const subject = artifactSubject(
        "ENGINEERING_DECISION",
        decision.id,
        decision.identifier,
        decision.title,
      );

      if (decision.status === "PROPOSED" || decision.status === "UNDER_REVIEW") {
        emitFinding(
          "TR-DEC-001",
          subject,
          `Decision ${decision.identifier} is ${decision.status}. Open decisions are normal while the system is being defined and the design reviewed; it is recorded so a reviewer knows what is still in play.`,
        );
        emitFinding(
          "TR-DEC-002",
          subject,
          `Decision ${decision.identifier} is ${decision.status}. The decision establishing part of the configuration has not been taken, so the configuration the ${gateName} gate is about is not the one that will exist.`,
        );
      } else if (decision.status === "REJECTED") {
        emitFinding(
          "TR-DEC-003",
          subject,
          `Decision ${decision.identifier} is REJECTED, yet the record still connects it to an in-scope requirement or design item. Those two statements cannot both hold, and a person must resolve the contradiction before a gate rests on it.`,
        );
      } else if (decision.status === "SUPERSEDED") {
        emitFinding(
          "TR-DEC-004",
          subject,
          `Decision ${decision.identifier} is SUPERSEDED. The record does not link a superseded decision to its successor, so the engine cannot say which decision now governs — a person must confirm it.`,
        );
      }
    }

    const approvedDecisions = resolved.decisions.filter((d) => d.status === "APPROVED").length;
    emitFinding(
      "TR-DEC-005",
      projectSubject,
      `${approvedDecisions} of ${resolved.decisions.length} in-scope decision(s) are APPROVED. An approved decision means the decision was taken, not that its content is correct.`,
    );

    // --- Assumptions --------------------------------------------------------
    const decisionIdentifiers = new Map(
      resolved.decisions.map((decision) => [decision.id, decision.identifier]),
    );

    for (const entry of resolved.assumptions) {
      const { assumption, monitoring } = entry;
      const decisionName = decisionIdentifiers.get(monitoring.decisionId) ?? monitoring.decisionId;
      const subject = artifactSubject(
        "DECISION_ASSUMPTION",
        assumption.id,
        null,
        assumption.statement,
      );
      const label = truncate(assumption.statement);

      if (assumption.status === "INVALIDATED") {
        emitFinding(
          "TR-ASM-005",
          subject,
          `An engineer recorded the assumption "${label}" behind decision ${decisionName} as INVALIDATED. Something that decision needed is stated not to be true.`,
        );
      }

      switch (monitoring.monitoringStatus) {
        case "REVIEW_REQUIRED":
          emitFinding(
            "TR-ASM-001",
            subject,
            `Assumption monitoring reports REVIEW_REQUIRED for "${label}" behind decision ${decisionName}. A judgement someone made now rests on a basis that has moved, and the ${gateName} gate would be held against a conclusion nobody has re-confirmed.`,
          );
          emitFinding(
            "TR-ASM-002",
            subject,
            `Assumption monitoring reports REVIEW_REQUIRED for "${label}" behind decision ${decisionName}. Worth a reviewer's attention while the definition and design are still moving.`,
          );
          break;
        case "BASIS_CHANGED":
          emitFinding(
            "TR-ASM-003",
            subject,
            `Assumption monitoring reports BASIS_CHANGED for "${label}" behind decision ${decisionName}. The recorded basis moved, but no explicit judgement rested on it, so there is nothing to re-confirm.`,
          );
          break;
        case "NOT_EVALUATED":
          emitFinding(
            "TR-ASM-004",
            subject,
            `Assumption "${label}" behind decision ${decisionName} has never been monitored, so nobody has checked whether what it stands on still holds. That is not evidence it fails — it is missing information, and it must not read as a pass.`,
          );
          break;
        case "CURRENT":
          break;
      }
    }

    const monitoredCurrent = resolved.assumptions.filter(
      (entry) => entry.monitoring.monitoringStatus === "CURRENT",
    ).length;
    const unmonitored = resolved.assumptions.filter(
      (entry) => entry.monitoring.monitoringStatus === "NOT_EVALUATED",
    ).length;
    emitFinding(
      "TR-ASM-006",
      projectSubject,
      `${monitoredCurrent} of ${resolved.assumptions.length} in-scope assumption(s) have a current monitoring verdict; ${unmonitored} have never been monitored.`,
    );

    // --- Verification -------------------------------------------------------
    for (const entry of resolved.activities) {
      const { activity, readiness } = entry;
      const subject = artifactSubject(
        "VERIFICATION_ACTIVITY",
        activity.id,
        activity.identifier,
        activity.title,
      );

      if (readiness.assessmentId === null) {
        emitFinding(
          "TR-VER-001",
          subject,
          `Verification activity ${activity.identifier} has never had its readiness assessed, so the record does not say whether it can actually be performed. Evaluate its readiness on the activity's own page.`,
        );
        emitFinding(
          "TR-VER-010",
          subject,
          `Verification activity ${activity.identifier} has never had its readiness assessed. Readiness is legitimately established after the freeze, so this is surfaced rather than treated as disqualifying.`,
        );
      } else if (readiness.freshness !== "CURRENT") {
        emitFinding(
          "TR-VER-002",
          subject,
          `The readiness assessment for ${activity.identifier} is ${readiness.freshness === "STALE" ? "stale" : "not comparable"}: it was made against a basis that has since moved. Reading it as current would carry an out-of-date verdict into this gate.`,
        );
      } else if (readiness.status === "NOT_READY") {
        emitFinding(
          "TR-VER-003",
          subject,
          `Verification activity ${activity.identifier} is NOT_READY with ${readiness.blockingCount ?? 0} blocking finding(s). The verification-readiness engine already established why against that activity's own basis; open its assessment for the detail.`,
        );
      } else if (readiness.status === "UNKNOWN") {
        emitFinding(
          "TR-VER-004",
          subject,
          `The readiness of ${activity.identifier} is UNKNOWN: the verification-readiness engine declined to claim readiness it could not support. That cannot be treated as satisfied here.`,
        );
      }

      if (activity.status === "PLANNED" || activity.status === "IN_PROGRESS") {
        emitFinding(
          "TR-VER-006",
          subject,
          `Verification activity ${activity.identifier} is ${activity.status} and has not concluded. A release argument is a claim that the product was shown to meet its requirements, and verification that has not been performed shows nothing.`,
        );
      } else if (activity.status === "FAILED") {
        emitFinding(
          "TR-VER-007",
          subject,
          `Verification activity ${activity.identifier} recorded FAILED. The record states the product did not do what was required; a new activity would have to be planned and its result recorded for that to change.`,
        );
      } else if (activity.status === "WAIVED") {
        emitFinding(
          "TR-VER-008",
          subject,
          `Verification activity ${activity.identifier} was WAIVED — a recorded decision not to verify. It is surfaced so the release argument includes it; the engine does not overrule that judgement.`,
        );
      } else if (activity.status === "PASSED" && entry.evidenceCount === 0) {
        emitFinding(
          "TR-EVD-001",
          subject,
          `Verification activity ${activity.identifier} is PASSED but has no evidence attached, so the verdict has nothing recorded behind it.`,
        );
      }
    }

    if (gate === "VERIFICATION_READY") {
      const assessed = resolved.activities.filter((e) => e.readiness.assessmentId !== null);
      const readyNow = assessed.filter(
        (e) => e.readiness.freshness === "CURRENT" && e.readiness.status === "READY",
      ).length;
      emitFinding(
        "TR-VER-005",
        projectSubject,
        `${readyNow} of ${resolved.activities.length} in-scope verification activity(ies) hold a current READY assessment; ${resolved.activities.length - assessed.length} have never been assessed.`,
      );
    }

    if (gate === "RELEASE_READY") {
      const concluded = resolved.activities.filter(
        (e) => e.activity.status !== "PLANNED" && e.activity.status !== "IN_PROGRESS",
      );
      const passed = concluded.filter((e) => e.activity.status === "PASSED");
      emitFinding(
        "TR-VER-009",
        projectSubject,
        `${concluded.length} of ${resolved.activities.length} in-scope verification activity(ies) have concluded: ${passed.length} PASSED, ${concluded.filter((e) => e.activity.status === "FAILED").length} FAILED, ${concluded.filter((e) => e.activity.status === "WAIVED").length} WAIVED.`,
      );
      emitFinding(
        "TR-EVD-002",
        projectSubject,
        `${passed.filter((e) => e.evidenceCount > 0).length} of ${passed.length} passed activity(ies) carry evidence. Evidence existing is not the same as the product being correct; this records only what is attached.`,
      );
    }

    // --- Change impact ------------------------------------------------------
    for (const entry of resolved.changes) {
      const { change, consumed } = entry;
      const subject = artifactSubject(
        "CHANGE_REQUEST",
        change.id,
        change.identifier,
        change.title,
      );

      if (consumed.analysisFreshness === "NOT_RUN") {
        emitFinding(
          "TR-CHG-001",
          subject,
          `Change request ${change.identifier} is ${change.status} and has no completed impact analysis, so how far it reaches has not been computed. The engine will not assume it is harmless.`,
        );
        emitFinding(
          "TR-CHG-002",
          subject,
          `Change request ${change.identifier} is ${change.status} and has no completed impact analysis. Un-analysed changes are normal at this stage; the gap is surfaced.`,
        );
        continue;
      }

      if (consumed.analysisFreshness !== "CURRENT") {
        emitFinding(
          "TR-CHG-003",
          subject,
          `The impact analysis for change request ${change.identifier} is ${consumed.analysisFreshness === "STALE" ? "stale" : "not comparable"}: it was computed against a project state that has since moved.`,
        );
        emitFinding(
          "TR-CHG-004",
          subject,
          `The impact analysis for change request ${change.identifier} is out of date and should be re-run before this gate is relied on.`,
        );
        continue;
      }

      if (
        (change.status === "UNDER_REVIEW" || change.status === "APPROVED") &&
        consumed.reachedScopeKeys.length > 0
      ) {
        const reach = `${consumed.reachedScopeKeys.length} object(s) in the evaluated scope`;
        emitFinding(
          "TR-CHG-005",
          subject,
          `Change request ${change.identifier} is ${change.status} and its current impact analysis reaches ${reach}. Holding the ${gateName} gate would fix or release something already agreed to be moving.`,
        );
        emitFinding(
          "TR-CHG-006",
          subject,
          `Change request ${change.identifier} is ${change.status} and its current impact analysis reaches ${reach}. Worth reading before holding this gate, though it does not by itself disqualify it.`,
        );
      }
    }

    const analysed = resolved.changes.filter(
      (entry) => entry.consumed.analysisFreshness === "CURRENT",
    ).length;
    emitFinding(
      "TR-CHG-007",
      projectSubject,
      `${resolved.changes.length} change request(s) are in flight; ${analysed} have a current impact analysis.`,
    );

    // --- Risks --------------------------------------------------------------
    const openRisks = resolved.risks.filter((risk) => risk.status === "OPEN");
    for (const risk of openRisks) {
      const subject = artifactSubject("RISK", risk.id, risk.identifier, risk.title);
      emitFinding(
        "TR-RSK-001",
        subject,
        `Risk ${risk.identifier} is OPEN — nobody has mitigated, accepted or closed it, so the record contains no decision about it. The Risk model carries no severity, so the engine does not rank it.`,
      );
      emitFinding(
        "TR-RSK-002",
        subject,
        `Risk ${risk.identifier} is OPEN. Open risks are expected while the programme is running; it is surfaced without being ranked, because the record does not say how serious it is.`,
      );
    }

    emitFinding(
      "TR-RSK-003",
      projectSubject,
      `${openRisks.length} of ${resolved.risks.length} risk(s) in scope are OPEN. The domain records no risk severity, so at this gate the engine reports them without turning them into a gate condition.`,
    );

    // --- Issues -------------------------------------------------------------
    const unresolved = resolved.issues.filter(
      (issue) => issue.status === "OPEN" || issue.status === "IN_PROGRESS",
    );

    for (const issue of unresolved) {
      const subject = artifactSubject("ISSUE", issue.id, issue.identifier, issue.title);

      if (issue.severity === "CRITICAL") {
        emitFinding(
          "TR-ISS-001",
          subject,
          `Issue ${issue.identifier} is CRITICAL and ${issue.status}. Severity was recorded by a person; an unresolved critical issue is a statement that something is wrong now.`,
        );
      } else if (issue.severity === "HIGH") {
        emitFinding(
          "TR-ISS-002",
          subject,
          `Issue ${issue.identifier} is HIGH severity and ${issue.status}. Holding the ${gateName} gate would carry a known defect across the line.`,
        );
        emitFinding(
          "TR-ISS-003",
          subject,
          `Issue ${issue.identifier} is HIGH severity and ${issue.status}. Working through open problems is expected at this stage, so it is surfaced rather than treated as disqualifying.`,
        );
      }
    }

    const lower = unresolved.filter(
      (issue) => issue.severity === "MEDIUM" || issue.severity === "LOW",
    ).length;
    emitFinding(
      "TR-ISS-004",
      projectSubject,
      `${unresolved.length} unresolved issue(s) in scope, of which ${lower} are MEDIUM or LOW. Lower-severity issues are reported as context; turning them into a gate condition would invent a threshold the domain does not state.`,
    );

    return order(drafts);
  }

  /** Whether a live requirement is still allocated to this design item. */
  private isAllocated(resolved: ResolvedScope, designItemId: string): boolean {
    return resolved.allocatedDesignIds.has(designItemId);
  }
}

function artifactSubject(
  type: GraphNodeType,
  id: string,
  identifier: string | null,
  label: string,
): FindingSubject {
  return { type, id, identifier, label };
}

/**
 * Deterministic order, with the sequence written onto each row.
 *
 * Storing the position means the order rows are read back in is the order the
 * engine produced, rather than whatever the database returns.
 */
function order(drafts: DraftFinding[]): DraftFinding[] {
  return [...drafts]
    .sort(compareTechnicalFindings)
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

function compareRelationships(
  a: TechnicalScopeRelationship,
  b: TechnicalScopeRelationship,
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

export const technicalReadinessService = new TechnicalReadinessService();
