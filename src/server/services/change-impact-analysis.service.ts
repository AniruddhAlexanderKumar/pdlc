import {
  CONTEXT_EDGE_TYPES,
  IMPACT_CLASSIFICATIONS,
  IMPACT_ENGINE_VERSION,
  PROPAGATING_EDGE_TYPES,
  type DeclaredImpact,
  type GraphNode,
  type GraphNodeRef,
  type ImpactAnalysis,
  type ImpactAnalysisReport,
  type ImpactBasisMarker,
  type ImpactClassification,
  type LatestImpactAnalysis,
  type TraversalStep,
  basisForNodeType,
  compareFindings,
  compareRoots,
  crossesDomain,
  graphNodeKey,
  impactAnalysisIdSchema,
  normalizeBasis,
  runImpactAnalysisRequestSchema,
  statusForClassification,
  strongerClassification,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { AppError, NotFoundError } from "@/server/errors";
import { logger } from "@/lib/logger";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import * as changeRepository from "@/server/repositories/change-request.repository";
import * as analysisRepository from "@/server/repositories/impact-analysis.repository";
import type {
  PersistFindingInput,
  PersistRootInput,
} from "@/server/repositories/impact-analysis.repository";
import { computeProjectFingerprint } from "@/server/repositories/project-revision.repository";
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
 * The change-impact analysis engine.
 *
 * It takes a change's *declared* scope, walks the existing engineering graph
 * under the propagation policy, and records what it reached and why. It owns
 * policy, classification, persistence and freshness. It owns no topology: every
 * relationship read goes through {@link EngineeringGraphService}, so there is
 * one implementation of graph traversal in the system and one place where the
 * project boundary is enforced.
 *
 * The engine never rewrites the declared scope. Declared impact is what a
 * person asserted; computed impact is what the walk found. Both survive, and a
 * later reader can tell which is which.
 *
 * **What it refuses to conclude.** Reaching an object means it is *reachable*,
 * not that it is broken. A verification activity in the path is not a failed
 * verification; an assumption in the path is not an invalidated assumption.
 * Those judgements need engines that do not exist yet, and V1 marks the gap
 * explicitly rather than filling it with a guess.
 */

export const IMPACT_ENTITY_TYPE = "ImpactAnalysis";

export const IMPACT_AUDIT_ACTIONS = {
  analysisRun: "change.impact_analysis_run",
  analysisFailed: "change.impact_analysis_failed",
} as const;

/** Raised when the walk cannot produce a trustworthy result. */
export class ImpactAnalysisFailure extends AppError {
  constructor(message: string) {
    super(message, { statusCode: 422, code: "IMPACT_ANALYSIS_FAILED", isOperational: true });
  }
}

/** One object the walk reached, before it becomes a persisted finding. */
interface Reached {
  node: GraphNode;
  rootKey: string;
  classification: ImpactClassification;
  depth: number;
  path: TraversalStep[];
  basis: ImpactBasisMarker[];
  alternatePathCount: number;
}

export class ChangeImpactAnalysisService {
  constructor(private readonly graph: EngineeringGraphService = engineeringGraphService) {}

  /**
   * Runs an analysis and persists it.
   *
   * Explicit: nothing triggers this on a page load. An analysis is a claim
   * about a moment, and silently recomputing it would make "when was this
   * assessed?" unanswerable.
   */
  async runImpactAnalysis(
    context: OrganizationContext,
    projectId: unknown,
    changeId: unknown,
    request: unknown = {},
  ): Promise<ImpactAnalysisReport> {
    const scopedProjectId = await requireProjectWriteAccess(context, projectId);
    const limits = parseOrThrow(
      runImpactAnalysisRequestSchema,
      request ?? {},
      "Invalid analysis request",
    );

    const change = await this.requireChange(scopedProjectId, changeId);
    const declared = await changeRepository.listDeclaredImpacts(change.id);

    // Opened before the walk so a crash leaves an honest record rather than
    // silence, which would be indistinguishable from "never attempted".
    const analysis = await analysisRepository.createAnalysis({
      projectId: scopedProjectId,
      changeRequestId: change.id,
      engineVersion: IMPACT_ENGINE_VERSION,
      requestedById: context.actorId,
      maxDepth: limits.maxDepth,
      maxNodes: limits.maxNodes,
      maxEdges: limits.maxEdges,
    });

    try {
      const walk = await this.walk(context, scopedProjectId, declared, limits);
      const fingerprint = await computeProjectFingerprint(scopedProjectId);

      return await prisma.$transaction(async (tx) => {
        const rootIds = await analysisRepository.createRoots(analysis.id, walk.roots, tx);

        const findings: PersistFindingInput[] = [];
        for (const reached of walk.reached) {
          const rootId = rootIds.get(reached.rootKey);
          // Every reached node was discovered from a root that was just
          // written, so a miss would mean the walk and the roots disagree.
          if (!rootId) continue;

          findings.push({
            rootId,
            nodeType: reached.node.type,
            nodeId: reached.node.id,
            identifier: reached.node.identifier,
            label: reached.node.label,
            classification: reached.classification,
            status: statusForClassification(reached.classification),
            depth: reached.depth,
            basis: reached.basis,
            path: reached.path,
            alternatePathCount: reached.alternatePathCount,
          });
        }

        await analysisRepository.createFindings(analysis.id, findings, tx);

        const counts = tally(findings);
        const completed = await analysisRepository.completeAnalysis(
          analysis.id,
          {
            sourceFingerprint: fingerprint,
            rootCount: walk.roots.length,
            findingCount: findings.length,
            ...counts,
            truncated: walk.truncated,
            truncatedBy: walk.truncatedBy,
          },
          tx,
        );

        await auditLogRepository.recordAuditEvent(
          artifactAuditEvent(
            context,
            IMPACT_AUDIT_ACTIONS.analysisRun,
            IMPACT_ENTITY_TYPE,
            analysis.id,
            {
              changeRequestId: change.id,
              engineVersion: IMPACT_ENGINE_VERSION,
              rootCount: walk.roots.length,
              findingCount: findings.length,
            },
          ),
          tx,
        );

        // Read back through the same transaction so the report describes rows
        // that are actually committed, not the in-memory intent to write them.
        const [roots, persisted] = await Promise.all([
          analysisRepository.listRoots(analysis.id, tx),
          analysisRepository.listFindings(analysis.id, tx),
        ]);

        return {
          analysis: {
            ...completed,
            summary: { ...completed.summary, declaredImpacts: declared.length },
          },
          freshness: "CURRENT" as const,
          roots: roots.sort(compareRoots),
          findings: persisted.sort(compareFindings),
        };
      });
    } catch (error) {
      // A failed run must be visible as failed, never left RUNNING and never
      // reported as a partial success.
      const reason =
        error instanceof ImpactAnalysisFailure
          ? error.message
          : "The analysis could not be completed. The engineering graph could not be read.";

      await analysisRepository.failAnalysis(analysis.id, reason).catch(() => {
        // Losing the failure marker must not mask the original error.
      });

      await auditLogRepository
        .recordAuditEvent(
          artifactAuditEvent(
            context,
            IMPACT_AUDIT_ACTIONS.analysisFailed,
            IMPACT_ENTITY_TYPE,
            analysis.id,
            { changeRequestId: change.id, engineVersion: IMPACT_ENGINE_VERSION },
          ),
        )
        .catch(() => {});

      logger.error("Impact analysis failed", { err: error, analysisId: analysis.id });
      throw error instanceof AppError ? error : new ImpactAnalysisFailure(reason);
    }
  }

  /**
   * The most recent run, with freshness derived at read time.
   *
   * Returns a distinct `NOT_RUN` shape when nothing has been run: zero counts
   * would read as "we looked and found nothing", which is a much stronger claim
   * than "nobody has looked".
   */
  async getLatestImpactAnalysis(
    context: OrganizationContext,
    projectId: unknown,
    changeId: unknown,
  ): Promise<LatestImpactAnalysis> {
    const scopedProjectId = await requireProjectReadAccess(context, projectId);
    const change = await this.requireChange(scopedProjectId, changeId);

    const latest = await analysisRepository.findLatestAnalysis(scopedProjectId, change.id);
    if (!latest) {
      return {
        status: "NOT_RUN",
        changeRequestId: change.id,
        engineVersion: IMPACT_ENGINE_VERSION,
      };
    }

    return this.buildReport(scopedProjectId, latest);
  }

  /** Every run for a change, newest first. Nothing is ever overwritten. */
  async listImpactAnalyses(
    context: OrganizationContext,
    projectId: unknown,
    changeId: unknown,
  ): Promise<ImpactAnalysis[]> {
    const scopedProjectId = await requireProjectReadAccess(context, projectId);
    const change = await this.requireChange(scopedProjectId, changeId);

    return analysisRepository.listAnalyses(scopedProjectId, change.id);
  }

  /** One analysis by id, scoped to the project so a guessed id is not found. */
  async getImpactAnalysis(
    context: OrganizationContext,
    projectId: unknown,
    analysisId: unknown,
  ): Promise<ImpactAnalysisReport> {
    const scopedProjectId = await requireProjectReadAccess(context, projectId);
    const id = parseOrThrow(impactAnalysisIdSchema, analysisId, "Invalid analysis id");

    const analysis = await analysisRepository.findAnalysisInProject(scopedProjectId, id);
    if (!analysis) {
      throw new NotFoundError(`Impact analysis ${id} was not found.`);
    }

    return this.buildReport(scopedProjectId, analysis);
  }

  // --- Internals ------------------------------------------------------------

  private async requireChange(projectId: string, changeId: unknown) {
    const id = parseOrThrow(impactAnalysisIdSchema, changeId, "Invalid change request id");
    const change = await changeRepository.findChangeRequestInProject(projectId, id);
    if (!change) {
      throw new NotFoundError(`Change request ${id} was not found.`);
    }
    return change;
  }

  private async buildReport(
    projectId: string,
    analysis: ImpactAnalysis,
  ): Promise<ImpactAnalysisReport> {
    const [roots, findings, declared, fingerprint] = await Promise.all([
      analysisRepository.listRoots(analysis.id),
      analysisRepository.listFindings(analysis.id),
      changeRepository.listDeclaredImpacts(analysis.changeRequestId),
      computeProjectFingerprint(projectId),
    ]);

    return {
      analysis: {
        ...analysis,
        summary: { ...analysis.summary, declaredImpacts: declared.length },
      },
      freshness: freshnessOf(analysis, fingerprint),
      roots: roots.sort(compareRoots),
      findings: findings.sort(compareFindings),
    };
  }

  /**
   * Walks the graph from every declared root.
   *
   * Two passes, deliberately separate:
   *
   *  1. **Propagation** — outbound over the propagating edge types, multi-hop.
   *     This is impact.
   *  2. **Context** — inbound over the context edge types, one hop from each
   *     root only. This is *not* impact, and is classified and bounded so that
   *     it cannot be mistaken for it. One hop keeps it bounded by the number of
   *     declared roots rather than by the size of the reachable set.
   *
   * Both passes call the graph service, which batches its reads per
   * breadth-first level. Nothing here queries a relationship table.
   */
  private async walk(
    context: OrganizationContext,
    projectId: string,
    declared: readonly DeclaredImpact[],
    limits: { maxDepth: number; maxNodes: number; maxEdges: number },
  ): Promise<{
    roots: PersistRootInput[];
    reached: Reached[];
    truncated: boolean;
    truncatedBy: string | null;
  }> {
    // Declared impacts are sorted before anything else happens, so the run does
    // not depend on the order they were entered in.
    const sortedDeclared = [...declared].sort((a, b) => {
      if (a.target.type !== b.target.type) return a.target.type < b.target.type ? -1 : 1;
      if (a.target.id === b.target.id) return 0;
      return a.target.id < b.target.id ? -1 : 1;
    });

    const roots: PersistRootInput[] = [];
    const merged = new Map<string, Reached>();
    let truncated = false;
    let truncatedBy: string | null = null;

    for (const declaration of sortedDeclared) {
      const ref: GraphNodeRef = declaration.target;
      const rootKey = graphNodeKey(ref);

      const rootNode = await this.resolveRoot(context, projectId, ref);
      if (!rootNode) {
        // A declaration whose target the project's graph cannot resolve — a
        // cross-project impact row, for instance. Recorded honestly as unknown
        // rather than dropped, because silently ignoring a declaration would
        // hide that the change references something unreachable.
        roots.push({
          nodeType: ref.type,
          nodeId: ref.id,
          identifier: declaration.targetIdentifier,
          label: declaration.targetTitle,
          resolved: false,
          declaredImpactId: declaration.id,
        });
        this.merge(merged, {
          node: {
            type: ref.type,
            id: ref.id,
            projectId,
            identifier: declaration.targetIdentifier,
            label: declaration.targetTitle,
          },
          rootKey,
          classification: "UNKNOWN",
          depth: 0,
          path: [],
          basis: normalizeBasis(["DECLARED_IMPACT", "ROOT_NOT_RESOLVABLE"]),
          alternatePathCount: 0,
        });
        continue;
      }

      roots.push({
        nodeType: rootNode.type,
        nodeId: rootNode.id,
        identifier: rootNode.identifier,
        label: rootNode.label,
        resolved: true,
        declaredImpactId: declaration.id,
      });

      // The root itself. DIRECT because a person declared it, not because the
      // walk found it.
      this.merge(merged, {
        node: rootNode,
        rootKey,
        classification: "DIRECT",
        depth: 0,
        path: [],
        basis: normalizeBasis(["DECLARED_IMPACT", ...basisForNodeType(rootNode.type)]),
        alternatePathCount: 0,
      });

      const propagation = await this.graph.traverse(context, projectId, {
        root: ref,
        direction: "OUTBOUND",
        maxDepth: limits.maxDepth,
        maxNodes: limits.maxNodes,
        maxEdges: limits.maxEdges,
        edgeTypes: PROPAGATING_EDGE_TYPES,
      });

      if (propagation.limits.truncated) {
        truncated = true;
        truncatedBy = truncatedBy ?? propagation.limits.truncatedBy;
      }

      for (const visited of propagation.nodes) {
        if (visited.depth === 0) continue;

        // Measured against the *root*, not the previous hop: the question an
        // engineer is asking is whether this change reached out of the domain
        // it was declared in, which a last-hop comparison would not answer.
        const crossed = crossesDomain(rootNode.type, visited.node.type);
        this.merge(merged, {
          node: visited.node,
          rootKey,
          classification: crossed ? "CROSS_DOMAIN" : "DOWNSTREAM",
          depth: visited.depth,
          path: visited.path,
          basis: normalizeBasis([
            "GRAPH_PROPAGATION",
            ...(crossed ? (["DOMAIN_BOUNDARY_CROSSED"] as const) : []),
            ...basisForNodeType(visited.node.type),
          ]),
          alternatePathCount: 0,
        });
      }

      // Context: one hop inbound. Bounded by the root's in-degree, and never
      // expanded further — otherwise "what surrounds this" would quietly become
      // "what is affected by this".
      const contextWalk = await this.graph.traverse(context, projectId, {
        root: ref,
        direction: "INBOUND",
        maxDepth: 1,
        maxNodes: limits.maxNodes,
        maxEdges: limits.maxEdges,
        edgeTypes: CONTEXT_EDGE_TYPES,
      });

      for (const visited of contextWalk.nodes) {
        if (visited.depth === 0) continue;

        this.merge(merged, {
          node: visited.node,
          rootKey,
          classification: "UPSTREAM_CONTEXT",
          depth: visited.depth,
          path: visited.path,
          basis: normalizeBasis([
            "UPSTREAM_CONTEXT_EDGE",
            ...basisForNodeType(visited.node.type),
          ]),
          alternatePathCount: 0,
        });
      }

      if (merged.size > limits.maxNodes) {
        truncated = true;
        truncatedBy = truncatedBy ?? "MAX_NODES";
      }
    }

    return {
      roots,
      reached: [...merged.values()].sort(compareReached),
      truncated,
      truncatedBy,
    };
  }

  /**
   * Resolves a declared target to a graph node, or null when the project's
   * graph cannot see it.
   */
  private async resolveRoot(
    context: OrganizationContext,
    projectId: string,
    ref: GraphNodeRef,
  ): Promise<GraphNode | null> {
    try {
      return await this.graph.getNode(context, projectId, ref);
    } catch (error) {
      if (error instanceof NotFoundError) return null;
      throw error;
    }
  }

  /**
   * Records a reached object, keeping the stronger claim when it is reached
   * twice.
   *
   * A declared object that is also discovered downstream stays DIRECT — what
   * the engineer asserted outranks what the walk inferred. Where classification
   * ties, the shorter path wins, so the stored provenance is the simplest
   * explanation available. Extra paths are counted, not stored: keeping every
   * path is how provenance turns into an unbounded blob.
   */
  private merge(into: Map<string, Reached>, candidate: Reached): void {
    const key = graphNodeKey(candidate.node);
    const existing = into.get(key);

    if (!existing) {
      into.set(key, candidate);
      return;
    }

    const alternates = existing.alternatePathCount + 1;
    const classification = strongerClassification(
      existing.classification,
      candidate.classification,
    );

    // Keep whichever record explains the object best: strongest claim, then
    // shortest path.
    const keepExisting =
      existing.classification === classification &&
      (candidate.classification !== classification || existing.depth <= candidate.depth);

    const winner = keepExisting ? existing : candidate;

    into.set(key, {
      ...winner,
      classification,
      basis: normalizeBasis([...existing.basis, ...candidate.basis]),
      alternatePathCount: alternates,
    });
  }
}

/**
 * Deterministic order for the walk's output, before persistence.
 *
 * Same rule as {@link compareFindings}, expressed over the pre-persistence
 * shape so the order rows are written in already matches the order they are
 * read back in.
 */
function compareReached(a: Reached, b: Reached): number {
  const rank = (classification: ImpactClassification) =>
    IMPACT_CLASSIFICATIONS.indexOf(classification);

  if (a.classification !== b.classification) {
    return rank(a.classification) - rank(b.classification);
  }
  if (a.depth !== b.depth) return a.depth - b.depth;
  if (a.node.type !== b.node.type) return a.node.type < b.node.type ? -1 : 1;
  if (a.node.id === b.node.id) return 0;
  return a.node.id < b.node.id ? -1 : 1;
}

/** Counts, derived from the findings actually about to be written. */
function tally(findings: readonly PersistFindingInput[]) {
  let directCount = 0;
  let downstreamCount = 0;
  let crossDomainCount = 0;
  let upstreamContextCount = 0;
  let unknownCount = 0;
  let notEvaluatedCount = 0;

  for (const finding of findings) {
    if (finding.classification === "DIRECT") directCount += 1;
    else if (finding.classification === "DOWNSTREAM") downstreamCount += 1;
    else if (finding.classification === "CROSS_DOMAIN") crossDomainCount += 1;
    else if (finding.classification === "UPSTREAM_CONTEXT") upstreamContextCount += 1;
    else unknownCount += 1;

    if (finding.status === "NOT_EVALUATED") notEvaluatedCount += 1;
  }

  return {
    directCount,
    downstreamCount,
    crossDomainCount,
    upstreamContextCount,
    unknownCount,
    notEvaluatedCount,
  };
}

/**
 * Whether a stored analysis still describes the current project state.
 *
 * Only a completed run can be current; a failed one describes nothing. An
 * analysis written before fingerprints existed, or one whose fingerprint is
 * empty, reports UNKNOWN rather than claiming either way.
 */
export function freshnessOf(
  analysis: ImpactAnalysis,
  currentFingerprint: string,
): "CURRENT" | "STALE" | "UNKNOWN" {
  if (analysis.status !== "COMPLETED") return "UNKNOWN";
  if (!analysis.sourceFingerprint) return "UNKNOWN";
  return analysis.sourceFingerprint === currentFingerprint ? "CURRENT" : "STALE";
}

export const changeImpactAnalysisService = new ChangeImpactAnalysisService();
