import {
  ASSUMPTION_MONITORING_VERSION,
  DECISION_BASIS_EDGE_TYPES,
  REQUIREMENT_BASIS_EDGE_TYPES,
  type AssumptionBasis,
  type AssumptionMonitoringRecord,
  type AssumptionMonitoringState,
  type AssumptionMonitoringSummary,
  type AssumptionStatus,
  type BasisObject,
  type DecisionAssumption,
  type GraphNodeRef,
  basisComponentFor,
  basisFingerprint,
  componentFingerprint,
  diffBasis,
  entityIdSchema,
  findingFor,
  graphNodeKey,
  monitoringStatusFor,
  reviewAssumptionRequestSchema,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { NotFoundError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import * as assumptionRepository from "@/server/repositories/decision-assumption.repository";
import * as decisionRepository from "@/server/repositories/engineering-decision.repository";
import * as monitoringRepository from "@/server/repositories/assumption-monitoring.repository";
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
 * Assumption monitoring.
 *
 * Watches the *recorded basis* of a decision assumption — the decision it
 * belongs to, the evidence gathered for it, the requirements and design it
 * stands on — and reports when that basis moves.
 *
 * **The hard rule, enforced here.** This service never writes an assumption's
 * status. `updateAssumption` is called from exactly one place: the explicit
 * review operation, and only when an authenticated engineer supplied a new
 * status. A VALIDATED assumption whose basis changed stays VALIDATED, with a
 * monitoring verdict of REVIEW_REQUIRED. The system says "the ground moved,
 * look at this"; it never says "this is now false".
 *
 * **Assumption-specific, not project-wide.** The basis is resolved by a bounded
 * two-hop walk from the owning decision under `ASSUMPTION_BASIS_POLICY`, so an
 * unrelated edit elsewhere in the project cannot flag it. That is the
 * deliberate improvement over the conservative project-wide fingerprint impact
 * analysis uses, and it is what makes a flag worth reading.
 *
 * Topology comes from `EngineeringGraphService`; this service issues no
 * relationship queries of its own.
 */

export const ASSUMPTION_ENTITY_TYPE = "DecisionAssumption";

export const ASSUMPTION_MONITORING_AUDIT_ACTIONS = {
  evaluated: "assumption.monitoring_evaluated",
  reviewed: "assumption.reviewed",
  statusChanged: "assumption.status_changed_on_review",
  projectSweep: "assumption.project_monitoring_evaluated",
} as const;

/** An assumption with the decision that owns it, both proved to be in scope. */
interface ScopedAssumption {
  assumption: DecisionAssumption;
  decisionId: string;
}

export class AssumptionMonitoringService {
  constructor(private readonly graph: EngineeringGraphService = engineeringGraphService) {}

  /**
   * Evaluates one assumption and appends the result to its history.
   *
   * Explicit: nothing runs this on a page load. A monitoring verdict is a claim
   * about a moment, and silently recomputing it would make "when was this last
   * checked?" unanswerable.
   */
  async evaluateAssumption(
    context: OrganizationContext,
    projectId: unknown,
    decisionId: unknown,
    assumptionId: unknown,
  ): Promise<AssumptionMonitoringState> {
    const scopedProjectId = await requireProjectWriteAccess(context, projectId);
    const scoped = await this.requireAssumption(
      scopedProjectId,
      decisionId,
      assumptionId,
    );

    const record = await this.evaluate(context, scopedProjectId, scoped);
    return this.buildState(scopedProjectId, scoped.assumption, record);
  }

  /**
   * Evaluates every assumption in the project.
   *
   * Sequential on purpose: a sweep is an explicit, bounded operation, and
   * running the graph walks in parallel would multiply database load for no
   * benefit at the sizes this handles. There is no queue and no scheduler —
   * background surveillance is later work.
   */
  async evaluateProjectAssumptions(
    context: OrganizationContext,
    projectId: unknown,
  ): Promise<AssumptionMonitoringSummary> {
    const scopedProjectId = await requireProjectWriteAccess(context, projectId);
    const assumptions = await monitoringRepository.listProjectAssumptions(scopedProjectId);

    const summary: AssumptionMonitoringSummary = {
      evaluated: 0,
      unchanged: 0,
      reviewRequired: 0,
      basisChanged: 0,
      unknown: 0,
    };

    // One query for every assumption's full row, not one per assumption —
    // listProjectAssumptions's own select is deliberately lighter (it joins
    // in the decision identifier for display) and omits columns evaluate()
    // needs, so a full re-fetch is unavoidable; batching it is not.
    const fullAssumptionsById = await assumptionRepository.findAssumptionsByIds(
      assumptions.map((row) => row.id),
    );

    for (const row of assumptions) {
      const assumption = fullAssumptionsById.get(row.id);
      if (!assumption) continue;

      const record = await this.evaluate(context, scopedProjectId, {
        assumption,
        decisionId: row.engineeringDecisionId,
      });

      summary.evaluated += 1;
      if (record.status === "REVIEW_REQUIRED") summary.reviewRequired += 1;
      else if (record.status === "BASIS_CHANGED") summary.basisChanged += 1;
      else summary.unchanged += 1;

      if (record.finding === "UNKNOWN") summary.unknown += 1;
    }

    await auditLogRepository.recordAuditEvent(
      artifactAuditEvent(
        context,
        ASSUMPTION_MONITORING_AUDIT_ACTIONS.projectSweep,
        "Project",
        scopedProjectId,
        { ...summary, monitoringVersion: ASSUMPTION_MONITORING_VERSION },
      ),
    );

    return summary;
  }

  /** Current monitoring state for one assumption, derived from its history. */
  async getAssumptionStatus(
    context: OrganizationContext,
    projectId: unknown,
    decisionId: unknown,
    assumptionId: unknown,
  ): Promise<AssumptionMonitoringState> {
    const scopedProjectId = await requireProjectReadAccess(context, projectId);
    const scoped = await this.requireAssumption(scopedProjectId, decisionId, assumptionId);

    const latest = await monitoringRepository.findLatestRecord(
      scopedProjectId,
      scoped.assumption.id,
    );
    return this.buildState(scopedProjectId, scoped.assumption, latest);
  }

  /** The full append-only history, newest first. */
  async getMonitoringHistory(
    context: OrganizationContext,
    projectId: unknown,
    decisionId: unknown,
    assumptionId: unknown,
  ): Promise<AssumptionMonitoringRecord[]> {
    const scopedProjectId = await requireProjectReadAccess(context, projectId);
    const scoped = await this.requireAssumption(scopedProjectId, decisionId, assumptionId);

    return monitoringRepository.listHistory(scopedProjectId, scoped.assumption.id);
  }

  /**
   * An engineer's explicit review.
   *
   * This is the only path by which monitoring interacts with an assumption's
   * status, and even here the change is the reviewer's, not the engine's: the
   * status only moves if they supplied one. A review with no status is a real
   * and common outcome — "I looked, and it still holds".
   *
   * The review records the fingerprint it acknowledged, which re-baselines the
   * assumption: the next evaluation compares against the basis the reviewer
   * actually saw.
   */
  async reviewAssumption(
    context: OrganizationContext,
    projectId: unknown,
    decisionId: unknown,
    assumptionId: unknown,
    input: unknown,
  ): Promise<AssumptionMonitoringState> {
    const scopedProjectId = await requireProjectWriteAccess(context, projectId);
    const scoped = await this.requireAssumption(scopedProjectId, decisionId, assumptionId);
    const request = parseOrThrow(reviewAssumptionRequestSchema, input, "Invalid review");

    const basis = await this.resolveBasis(context, scopedProjectId, scoped);
    const statusBefore = scoped.assumption.status;
    const statusAfter = request.status ?? statusBefore;

    const record = await prisma.$transaction(async (tx) => {
      if (request.status && request.status !== statusBefore) {
        await assumptionRepository.updateAssumption(
          scoped.assumption.id,
          { status: request.status },
          tx,
        );

        await auditLogRepository.recordAuditEvent(
          artifactAuditEvent(
            context,
            ASSUMPTION_MONITORING_AUDIT_ACTIONS.statusChanged,
            ASSUMPTION_ENTITY_TYPE,
            scoped.assumption.id,
            { from: statusBefore, to: request.status, decisionId: scoped.decisionId },
          ),
          tx,
        );
      }

      const written = await monitoringRepository.createRecord(
        {
          assumptionId: scoped.assumption.id,
          kind: "REVIEW",
          // A reviewer has looked at the basis as it stands, so it is current
          // again — regardless of what they concluded about the assumption.
          status: "CURRENT",
          finding: "NO_CHANGE",
          basisFingerprint: basisFingerprint(basis),
          decisionFingerprint: componentFingerprint(basis, "DECISION"),
          evidenceFingerprint: componentFingerprint(basis, "EVIDENCE"),
          linkedFingerprint: componentFingerprint(basis, "LINKED"),
          basisSnapshot: basis.objects,
          changedObjects: [],
          assumptionStatus: statusAfter,
          actorId: context.actorId,
          reviewNote: request.note ?? null,
          reviewedAt: new Date(),
          statusBefore,
          statusAfter,
        },
        tx,
      );

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          ASSUMPTION_MONITORING_AUDIT_ACTIONS.reviewed,
          ASSUMPTION_ENTITY_TYPE,
          scoped.assumption.id,
          {
            decisionId: scoped.decisionId,
            statusBefore,
            statusAfter,
            statusChanged: statusBefore !== statusAfter,
          },
        ),
        tx,
      );

      return written;
    });

    const refreshed = await assumptionRepository.findAssumptionForDecision(
      scoped.decisionId,
      scoped.assumption.id,
    );
    return this.buildState(scopedProjectId, refreshed ?? scoped.assumption, record);
  }

  // --- Internals ------------------------------------------------------------

  /**
   * Proves the project → decision → assumption hierarchy in one place.
   *
   * Each level is looked up through its parent, so a request naming a real
   * decision and a real assumption that do not belong together resolves to
   * nothing rather than succeeding.
   */
  private async requireAssumption(
    projectId: string,
    decisionId: unknown,
    assumptionId: unknown,
  ): Promise<ScopedAssumption> {
    const scopedDecisionId = parseOrThrow(entityIdSchema, decisionId, "Invalid decision id");
    const scopedAssumptionId = parseOrThrow(
      entityIdSchema,
      assumptionId,
      "Invalid assumption id",
    );

    const decision = await decisionRepository.findDecisionInProject(projectId, scopedDecisionId);
    if (!decision) {
      throw new NotFoundError(`Decision ${scopedDecisionId} was not found.`);
    }

    const assumption = await assumptionRepository.findAssumptionForDecision(
      decision.id,
      scopedAssumptionId,
    );
    if (!assumption) {
      throw new NotFoundError(`Assumption ${scopedAssumptionId} was not found.`);
    }

    return { assumption, decisionId: decision.id };
  }

  /** Runs one evaluation and appends it. Shared by the single and sweep paths. */
  private async evaluate(
    context: OrganizationContext,
    projectId: string,
    scoped: ScopedAssumption,
  ): Promise<AssumptionMonitoringRecord> {
    const basis = await this.resolveBasis(context, projectId, scoped);
    const previous = await monitoringRepository.findLatestRecord(projectId, scoped.assumption.id);

    const current = {
      decision: componentFingerprint(basis, "DECISION"),
      evidence: componentFingerprint(basis, "EVIDENCE"),
      linked: componentFingerprint(basis, "LINKED"),
    };

    const finding = basis.resolved
      ? findingFor(
          previous
            ? {
                decision: previous.decisionFingerprint,
                evidence: previous.evidenceFingerprint,
                linked: previous.linkedFingerprint,
              }
            : null,
          current,
        )
      : "UNKNOWN";

    const status = monitoringStatusFor(finding, scoped.assumption.status, {
      hasBaseline: previous !== null,
      basisResolved: basis.resolved,
    });

    const changedObjects = previous ? diffBasis(previous.basisSnapshot, basis.objects) : [];

    const record = await prisma.$transaction(async (tx) => {
      const written = await monitoringRepository.createRecord(
        {
          assumptionId: scoped.assumption.id,
          kind: "EVALUATION",
          status,
          finding,
          basisFingerprint: basisFingerprint(basis),
          decisionFingerprint: current.decision,
          evidenceFingerprint: current.evidence,
          linkedFingerprint: current.linked,
          basisSnapshot: basis.objects,
          changedObjects,
          // Observed, never set. The assumption's own status is untouched by
          // everything in this method.
          assumptionStatus: scoped.assumption.status,
          actorId: context.actorId,
        },
        tx,
      );

      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          ASSUMPTION_MONITORING_AUDIT_ACTIONS.evaluated,
          ASSUMPTION_ENTITY_TYPE,
          scoped.assumption.id,
          {
            decisionId: scoped.decisionId,
            monitoringStatus: status,
            finding,
            monitoringVersion: ASSUMPTION_MONITORING_VERSION,
          },
        ),
        tx,
      );

      return written;
    });

    return record;
  }

  /**
   * Resolves what this assumption stands on.
   *
   * Two bounded hops from the owning decision, following only the edges
   * `ASSUMPTION_BASIS_POLICY` names:
   *
   *   1. out of the decision — its requirements, design, risks, issues, evidence
   *   2. out of each of those requirements — allocation, verification, evidence
   *
   * Nothing goes further. The cost is one graph call for the decision plus one
   * per basis requirement, which is bounded by how many requirements a single
   * decision addresses, not by the size of the project.
   */
  private async resolveBasis(
    context: OrganizationContext,
    projectId: string,
    scoped: ScopedAssumption,
  ): Promise<AssumptionBasis> {
    const decisionRef: GraphNodeRef = {
      type: "ENGINEERING_DECISION",
      id: scoped.decisionId,
    };

    let decisionNeighborhood;
    try {
      decisionNeighborhood = await this.graph.getDirectConnections(
        context,
        projectId,
        decisionRef,
        "BOTH",
        DECISION_BASIS_EDGE_TYPES,
      );
    } catch {
      // The owning decision could not be read from the project's graph. That is
      // not "nothing changed" and it is not "the assumption is wrong" — it is
      // an inability to compare, reported as such.
      return {
        assumptionId: scoped.assumption.id,
        resolved: false,
        objects: [],
        relationshipIds: [],
      };
    }

    const objects = new Map<string, BasisObject>();
    const relationshipIds = new Set<string>();
    const refs: GraphNodeRef[] = [decisionRef];

    // The decision itself is the first component of the basis.
    objects.set(graphNodeKey(decisionRef), {
      type: "ENGINEERING_DECISION",
      id: scoped.decisionId,
      identifier: decisionNeighborhood.node.identifier,
      label: decisionNeighborhood.node.label,
      revision: "",
      component: "DECISION",
    });

    const requirementRefs: GraphNodeRef[] = [];

    for (const connection of decisionNeighborhood.connections) {
      const component = basisComponentFor(connection.edge.type);
      if (!component) continue;

      const neighbor = connection.neighbor;
      const key = graphNodeKey(neighbor);
      relationshipIds.add(`${connection.edge.type}:${connection.edge.relationshipId}`);

      if (!objects.has(key)) {
        objects.set(key, {
          type: neighbor.type,
          id: neighbor.id,
          identifier: neighbor.identifier,
          label: neighbor.label,
          revision: "",
          component,
        });
        refs.push({ type: neighbor.type, id: neighbor.id });
      }

      if (neighbor.type === "REQUIREMENT") {
        requirementRefs.push({ type: neighbor.type, id: neighbor.id });
      }
    }

    // Second hop, out of the basis requirements only.
    for (const requirementRef of requirementRefs) {
      const neighborhood = await this.graph.getDirectConnections(
        context,
        projectId,
        requirementRef,
        "OUTBOUND",
        REQUIREMENT_BASIS_EDGE_TYPES,
      );

      for (const connection of neighborhood.connections) {
        const component = basisComponentFor(connection.edge.type);
        if (!component) continue;

        const neighbor = connection.neighbor;
        const key = graphNodeKey(neighbor);
        relationshipIds.add(`${connection.edge.type}:${connection.edge.relationshipId}`);

        if (!objects.has(key)) {
          objects.set(key, {
            type: neighbor.type,
            id: neighbor.id,
            identifier: neighbor.identifier,
            label: neighbor.label,
            revision: "",
            component,
          });
          refs.push({ type: neighbor.type, id: neighbor.id });
        }
      }
    }

    // Stamp every basis object with its own last revision. This is what makes
    // "did it change?" answerable without storing a copy of the artifact.
    const revisions = await this.graph.getNodeRevisions(context, projectId, refs);
    const stamped: BasisObject[] = [];
    for (const [key, object] of objects) {
      const revision = revisions.get(key);
      stamped.push({ ...object, revision: revision ? revision.toISOString() : "unresolved" });
    }

    return {
      assumptionId: scoped.assumption.id,
      resolved: true,
      objects: stamped.sort(compareBasisObjects),
      relationshipIds: [...relationshipIds].sort(),
    };
  }

  /** Assembles the current state from the latest record, without re-evaluating. */
  private async buildState(
    projectId: string,
    assumption: DecisionAssumption,
    latest: AssumptionMonitoringRecord | null,
  ): Promise<AssumptionMonitoringState> {
    const [lastEvaluation, lastReview] = await Promise.all([
      monitoringRepository.findLatestOfKind(projectId, assumption.id, "EVALUATION"),
      monitoringRepository.findLatestOfKind(projectId, assumption.id, "REVIEW"),
    ]);

    return {
      assumptionId: assumption.id,
      assumptionStatus: assumption.status,
      monitoringStatus: latest ? latest.status : "NOT_EVALUATED",
      finding: latest ? latest.finding : null,
      lastEvaluatedAt: lastEvaluation ? lastEvaluation.monitoredAt : null,
      lastReviewedAt: lastReview ? lastReview.reviewedAt : null,
      reviewRequired: latest?.status === "REVIEW_REQUIRED",
      changedObjects: latest ? latest.changedObjects : [],
      basisObjectCount: latest ? latest.basisSnapshot.length : 0,
      monitoringVersion: ASSUMPTION_MONITORING_VERSION,
    };
  }
}

/** Stable order, so two runs over the same basis snapshot it identically. */
function compareBasisObjects(a: BasisObject, b: BasisObject): number {
  if (a.component !== b.component) return a.component < b.component ? -1 : 1;
  if (a.type !== b.type) return a.type < b.type ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}

/**
 * Latest monitoring state for several assumptions at once.
 *
 * The decision detail page needs a badge per assumption; this keeps that to one
 * query rather than one per row. Returns only what has already been evaluated —
 * reading never triggers an evaluation.
 */
export async function getMonitoringStatesForAssumptions(
  projectId: string,
  assumptions: readonly DecisionAssumption[],
): Promise<Map<string, AssumptionMonitoringState>> {
  const latest = await monitoringRepository.findLatestForAssumptions(
    projectId,
    assumptions.map((assumption) => assumption.id),
  );

  const states = new Map<string, AssumptionMonitoringState>();
  for (const assumption of assumptions) {
    const record = latest.get(assumption.id) ?? null;
    states.set(assumption.id, {
      assumptionId: assumption.id,
      assumptionStatus: assumption.status,
      monitoringStatus: record ? record.status : "NOT_EVALUATED",
      finding: record ? record.finding : null,
      lastEvaluatedAt: record && record.kind === "EVALUATION" ? record.monitoredAt : null,
      lastReviewedAt: record?.reviewedAt ?? null,
      reviewRequired: record?.status === "REVIEW_REQUIRED",
      changedObjects: record ? record.changedObjects : [],
      basisObjectCount: record ? record.basisSnapshot.length : 0,
      monitoringVersion: ASSUMPTION_MONITORING_VERSION,
    });
  }
  return states;
}

export const assumptionMonitoringService = new AssumptionMonitoringService();

/** Re-exported so tests and routes name the same status type as the domain. */
export type { AssumptionStatus };
