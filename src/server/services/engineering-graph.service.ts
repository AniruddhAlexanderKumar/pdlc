import {
  GRAPH_EDGE_DEFINITIONS,
  GRAPH_EDGE_TYPES,
  graphEdgeKey,
  graphNodeKey,
  graphNodeRefSchema,
  graphTraversalRequestSchema,
  isValidEdgeEndpointPair,
  type GraphAnomaly,
  type GraphConsistencyReport,
  type GraphDirection,
  type GraphEdge,
  type GraphEdgeType,
  type GraphNode,
  type GraphNodeRef,
  type TraversalLimits,
  type TraversalNode,
  type TraversalResult,
  type TraversalStep,
} from "@/domain";
import type { OrganizationContext } from "@/server/context/organization-context";
import { NotFoundError } from "@/server/errors";
import type { RawEdge } from "@/server/repositories/graph-edge-resolvers";
import {
  engineeringGraphRepository,
  type GraphReader,
} from "@/server/repositories/graph-repository";
import { parseOrThrow } from "@/server/validation";
import { requireProjectInOrganization } from "./project-scope";

/**
 * Read-only traversal over the engineering graph.
 *
 * The service owns three things the repository deliberately does not: the
 * organization boundary, the breadth-first algorithm with its caps, and the
 * decision about what counts as an anomaly.
 *
 * It writes nothing. There is no audit event for reading a graph, and no
 * repair path — see `checkConsistency`.
 */

/** A single hop, resolved. Returned by the direct-connections query. */
export interface GraphConnection {
  edge: GraphEdge;
  /** The node at the other end, whichever end that is. */
  neighbor: GraphNode;
  /** Which way the edge points relative to the node that was asked about. */
  direction: "OUTBOUND" | "INBOUND";
}

export interface GraphNeighborhood {
  node: GraphNode;
  connections: GraphConnection[];
}

export class EngineeringGraphService {
  constructor(private readonly repository: GraphReader = engineeringGraphRepository) {}

  /**
   * Resolves one node.
   *
   * Throws `NotFoundError` when the node does not exist, is in another project,
   * or is in another organization — all three are indistinguishable from
   * outside, which is the point.
   */
  async getNode(
    context: OrganizationContext,
    projectId: unknown,
    ref: unknown,
  ): Promise<GraphNode> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const parsed = parseOrThrow(graphNodeRefSchema, ref, "Invalid graph node reference");

    const node = await this.repository.getNode(scopedProjectId, parsed);
    if (!node) {
      throw new NotFoundError(`${parsed.type} ${parsed.id} was not found in this project.`);
    }
    return node;
  }

  /** Every edge one hop from a node, in the requested direction. */
  async getDirectConnections(
    context: OrganizationContext,
    projectId: unknown,
    ref: unknown,
    direction: GraphDirection = "BOTH",
    edgeTypes?: readonly GraphEdgeType[],
  ): Promise<GraphNeighborhood> {
    const node = await this.getNode(context, projectId, ref);
    const edges = await this.repository.getNeighbors(
      node.projectId,
      { type: node.type, id: node.id },
      direction,
      edgeTypes,
    );

    const selfKey = graphNodeKey(node);
    const connections: GraphConnection[] = [];
    for (const edge of edges) {
      // A self-loop is genuinely both an outbound and an inbound connection,
      // and is reported as both rather than being hidden.
      if (graphNodeKey(edge.source) === selfKey && direction !== "INBOUND") {
        connections.push({ edge, neighbor: edge.target, direction: "OUTBOUND" });
      }
      if (graphNodeKey(edge.target) === selfKey && direction !== "OUTBOUND") {
        connections.push({ edge, neighbor: edge.source, direction: "INBOUND" });
      }
    }
    return { node, connections };
  }

  /**
   * One hop from *several* nodes at once, keyed by `graphNodeKey`.
   *
   * The single-node {@link getDirectConnections} is the right shape when a
   * caller has one node; issuing it in a loop is how a bounded walk turns into
   * a query per node. This resolves a whole frontier in one batched read — the
   * same primitive the traversal uses per breadth-first level — and is what the
   * readiness engine walks its basis with.
   *
   * Nodes are resolved first, so a reference outside the project contributes
   * nothing rather than leaking the fact that it exists elsewhere. A node that
   * resolves but has no matching edges appears with an empty list, which is a
   * different and useful answer from being absent.
   */
  async getNeighborhoods(
    context: OrganizationContext,
    projectId: unknown,
    refs: readonly GraphNodeRef[],
    direction: GraphDirection = "BOTH",
    edgeTypes?: readonly GraphEdgeType[],
  ): Promise<Map<string, GraphConnection[]>> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const result = new Map<string, GraphConnection[]>();
    if (refs.length === 0) return result;

    const parsed = refs.map((ref) =>
      parseOrThrow(graphNodeRefSchema, ref, "Invalid graph node reference"),
    );
    const resolved = await this.repository.resolveNodes(scopedProjectId, parsed);
    const known = [...resolved.values()].map((node) => ({ type: node.type, id: node.id }));
    if (known.length === 0) return result;

    for (const ref of known) result.set(graphNodeKey(ref), []);

    const raw = await this.repository.getEdges(scopedProjectId, known, direction, edgeTypes);
    const { edges } = await this.repository.materializeEdges(scopedProjectId, raw);

    for (const edge of orderEdges(edges)) {
      const sourceKey = graphNodeKey(edge.source);
      const targetKey = graphNodeKey(edge.target);

      // A self-loop is genuinely both directions and is reported as both,
      // exactly as the single-node query does.
      if (result.has(sourceKey) && direction !== "INBOUND") {
        result.get(sourceKey)?.push({ edge, neighbor: edge.target, direction: "OUTBOUND" });
      }
      if (result.has(targetKey) && direction !== "OUTBOUND") {
        result.get(targetKey)?.push({ edge, neighbor: edge.source, direction: "INBOUND" });
      }
    }

    return result;
  }

  /**
   * Revision stamps for a set of nodes.
   *
   * Exposed on the service so callers that need to know *when an artifact last
   * moved* -- assumption monitoring, so far -- get it through the graph layer
   * rather than reaching into artifact tables themselves.
   */
  async getNodeRevisions(
    context: OrganizationContext,
    projectId: unknown,
    refs: readonly GraphNodeRef[],
  ): Promise<Map<string, Date>> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    if (refs.length === 0) return new Map();

    return this.repository.getNodeRevisions(scopedProjectId, refs);
  }

  /** Alias that reads naturally at call sites that want one hop of context. */
  async getNeighbors(
    context: OrganizationContext,
    projectId: unknown,
    ref: unknown,
    direction: GraphDirection = "BOTH",
    edgeTypes?: readonly GraphEdgeType[],
  ): Promise<GraphNeighborhood> {
    return this.getDirectConnections(context, projectId, ref, direction, edgeTypes);
  }

  /**
   * Breadth-first traversal from a root node.
   *
   * Breadth-first, not depth-first, because the useful question is "what is
   * near this?" — and BFS reaches every node by a shortest path first, so the
   * recorded path is the shortest one and a depth cap means what it says.
   *
   * The result is deterministic: the frontier is expanded in a stable order and
   * edges are sorted before they are followed, so the same graph and the same
   * request always produce the same node order, the same paths, and the same
   * truncation point.
   */
  async traverse(
    context: OrganizationContext,
    projectId: unknown,
    request: unknown,
  ): Promise<TraversalResult> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const parsed = parseOrThrow(graphTraversalRequestSchema, request, "Invalid traversal request");

    const root = await this.repository.getNode(scopedProjectId, parsed.root);
    if (!root) {
      throw new NotFoundError(
        `${parsed.root.type} ${parsed.root.id} was not found in this project.`,
      );
    }

    const allowedNodeTypes = parsed.nodeTypes ? new Set(parsed.nodeTypes) : null;
    const limits: TraversalLimits = {
      maxDepth: parsed.maxDepth,
      maxNodes: parsed.maxNodes,
      maxEdges: parsed.maxEdges,
      truncated: false,
      truncatedBy: null,
    };

    const visited = new Map<string, TraversalNode>();
    const rootEntry: TraversalNode = { node: root, depth: 0, path: [] };
    visited.set(graphNodeKey(root), rootEntry);

    const collectedEdges = new Map<string, GraphEdge>();
    let frontier: TraversalNode[] = [rootEntry];

    for (let depth = 0; depth < parsed.maxDepth && frontier.length > 0; depth += 1) {
      const refs = frontier.map((entry) => ({
        type: entry.node.type,
        id: entry.node.id,
      })) satisfies GraphNodeRef[];

      const raw = await this.repository.getEdges(
        scopedProjectId,
        refs,
        parsed.direction,
        parsed.edgeTypes,
      );
      const { edges } = await this.repository.materializeEdges(scopedProjectId, raw);

      // Index the frontier so each edge can be attributed to the node it was
      // found from, which is what makes the recorded path truthful.
      const frontierByKey = new Map(frontier.map((entry) => [graphNodeKey(entry.node), entry]));
      const nextFrontier: TraversalNode[] = [];

      for (const edge of orderEdges(edges)) {
        if (limits.truncated) break;

        for (const step of stepsFromEdge(edge, frontierByKey, parsed.direction)) {
          const edgeKey = graphEdgeKey(edge.type, edge.relationshipId);
          if (!collectedEdges.has(edgeKey)) {
            if (collectedEdges.size >= parsed.maxEdges) {
              limits.truncated = true;
              limits.truncatedBy = "MAX_EDGES";
              break;
            }
            collectedEdges.set(edgeKey, edge);
          }

          const neighborKey = graphNodeKey(step.neighbor);
          if (visited.has(neighborKey)) continue;
          if (allowedNodeTypes && !allowedNodeTypes.has(step.neighbor.type)) continue;

          if (visited.size >= parsed.maxNodes) {
            limits.truncated = true;
            limits.truncatedBy = "MAX_NODES";
            break;
          }

          const entry: TraversalNode = {
            node: step.neighbor,
            depth: depth + 1,
            path: [...step.from.path, step.step],
          };
          visited.set(neighborKey, entry);
          nextFrontier.push(entry);
        }
      }

      if (limits.truncated) break;
      frontier = nextFrontier;
    }

    // Reaching the depth cap with somewhere still to go is a truncation too,
    // and the caller deserves to know the answer is partial.
    if (!limits.truncated && frontier.length > 0) {
      const refs = frontier.map((entry) => ({ type: entry.node.type, id: entry.node.id }));
      const remaining = await this.repository.getEdges(
        scopedProjectId,
        refs,
        parsed.direction,
        parsed.edgeTypes,
      );
      if (hasUnvisitedEndpoint(remaining, visited)) {
        limits.truncated = true;
        limits.truncatedBy = "MAX_DEPTH";
      }
    }

    const nodes = [...visited.values()].sort(compareTraversalNodes);
    const edges = [...collectedEdges.values()].sort(compareEdges);
    return { root, nodes, edges, limits };
  }

  /**
   * What this node depends on: everything reachable by following edges
   * *towards* their sources.
   *
   * "Upstream" is defined by edge direction, which the registry fixes once. For
   * a requirement, upstream reaches the stakeholder need it derives from; for a
   * design item, the requirements allocated to it.
   */
  async getUpstreamDependencies(
    context: OrganizationContext,
    projectId: unknown,
    ref: unknown,
    maxDepth?: number,
  ): Promise<TraversalResult> {
    return this.traverse(context, projectId, {
      root: ref,
      direction: "INBOUND",
      ...(maxDepth === undefined ? {} : { maxDepth }),
    });
  }

  /** What depends on this node: everything reachable by following edges forward. */
  async getDownstreamDependents(
    context: OrganizationContext,
    projectId: unknown,
    ref: unknown,
    maxDepth?: number,
  ): Promise<TraversalResult> {
    return this.traverse(context, projectId, {
      root: ref,
      direction: "OUTBOUND",
      ...(maxDepth === undefined ? {} : { maxDepth }),
    });
  }

  /** The neighbourhood around a node in both directions, to a bounded depth. */
  async getSubgraph(
    context: OrganizationContext,
    projectId: unknown,
    ref: unknown,
    maxDepth?: number,
  ): Promise<TraversalResult> {
    return this.traverse(context, projectId, {
      root: ref,
      direction: "BOTH",
      ...(maxDepth === undefined ? {} : { maxDepth }),
    });
  }

  /**
   * Reports structural anomalies in the project's relationships.
   *
   * **Reports, never repairs.** A relationship row that points somewhere it
   * should not is evidence that something wrote it, and quietly deleting it
   * destroys that evidence. Worse, an impact analysis run over a
   * silently-corrected graph is more dangerous than one run over a graph known
   * to be broken, because nobody knows to distrust it.
   *
   * Under the schema as migrated — foreign keys on every endpoint, and CHECK
   * constraints enforcing exactly-one-subject on the polymorphic tables — most
   * of these anomalies should be unreachable. The check exists for the case
   * where that is not true: a constraint dropped by hand, a partially applied
   * migration, or a future table added without them.
   */
  async checkConsistency(
    context: OrganizationContext,
    projectId: unknown,
    edgeTypes?: readonly GraphEdgeType[],
  ): Promise<GraphConsistencyReport> {
    const scopedProjectId = await requireProjectInOrganization(context, projectId);
    const checkedEdgeTypes = edgeTypes ? [...edgeTypes] : [...GRAPH_EDGE_TYPES];

    const audited = await this.repository.auditEdges(scopedProjectId, checkedEdgeTypes);
    const anomalies: GraphAnomaly[] = [];
    let edgesChecked = 0;

    // Resolve every endpoint that is claimed to be in this project, in one
    // batch per node type, so a missing endpoint can be told from a
    // cross-project one.
    const candidateRefs: GraphNodeRef[] = [];
    for (const rows of audited.values()) {
      for (const row of rows) {
        candidateRefs.push(row.source);
        if (row.target) candidateRefs.push(row.target);
      }
    }
    const existing = await this.repository.findExistingRefs(scopedProjectId, candidateRefs);

    for (const edgeType of checkedEdgeTypes) {
      const rows = audited.get(edgeType) ?? [];
      const seenPairs = new Map<string, string>();

      for (const row of rows) {
        edgesChecked += 1;

        if (!row.target) {
          anomalies.push({
            kind: "MALFORMED_RELATIONSHIP",
            edgeType,
            relationshipId: row.relationshipId,
            detail: "The relationship row has no target set on any of its target columns.",
          });
          continue;
        }

        if (!isValidEdgeEndpointPair(edgeType, row.source.type, row.target.type)) {
          const definition = GRAPH_EDGE_DEFINITIONS[edgeType];
          anomalies.push({
            kind: "MALFORMED_RELATIONSHIP",
            edgeType,
            relationshipId: row.relationshipId,
            detail:
              `Endpoints ${row.source.type} → ${row.target.type} are not permitted for this ` +
              `edge type, which the registry defines as ${definition.source} → ` +
              `${definition.targets.join(" | ")}.`,
          });
          continue;
        }

        if (row.targetProjectId === null) {
          anomalies.push({
            kind: "MISSING_ENDPOINT",
            edgeType,
            relationshipId: row.relationshipId,
            detail: `Target ${row.target.type} ${row.target.id} does not exist.`,
          });
        } else if (row.targetProjectId !== scopedProjectId) {
          anomalies.push({
            kind: "CROSS_PROJECT_ENDPOINT",
            edgeType,
            relationshipId: row.relationshipId,
            detail:
              `Target ${row.target.type} ${row.target.id} belongs to project ` +
              `${row.targetProjectId}, not ${scopedProjectId}. The traversal excludes this edge.`,
          });
        }

        if (!existing.has(graphNodeKey(row.source))) {
          anomalies.push({
            kind: "MISSING_ENDPOINT",
            edgeType,
            relationshipId: row.relationshipId,
            detail: `Source ${row.source.type} ${row.source.id} does not exist in this project.`,
          });
        }

        // Two rows asserting the same relationship between the same pair are
        // redundant rather than corrupt, but they double-count in any analysis
        // built on top, so they are worth surfacing.
        //
        // Only where the schema says a pair is unique, though. Approvals
        // deliberately accumulate — an artifact has an approval history — and
        // the link type is part of the key in the five tables that carry one,
        // so a DECOMPOSES_TO and a DEPENDS_ON between the same requirements are
        // two different assertions, not a repeat of one.
        if (!GRAPH_EDGE_DEFINITIONS[edgeType].uniquePerPair) continue;

        const pairKey =
          `${graphNodeKey(row.source)}->${graphNodeKey(row.target)}` +
          (row.linkType ? `#${row.linkType}` : "");
        const firstSeen = seenPairs.get(pairKey);
        if (firstSeen) {
          anomalies.push({
            kind: "DUPLICATE_EDGE",
            edgeType,
            relationshipId: row.relationshipId,
            detail:
              `A second ${edgeType} row connects the same pair; the first is ${firstSeen}. ` +
              "Both are reported by the traversal.",
          });
        } else {
          seenPairs.set(pairKey, row.relationshipId);
        }
      }
    }

    return {
      projectId: scopedProjectId,
      checkedEdgeTypes,
      anomalies: anomalies.sort(compareAnomalies),
      edgesChecked,
    };
  }
}

/** One traversable direction of one edge, from a node already in the frontier. */
interface EdgeStep {
  from: TraversalNode;
  neighbor: GraphNode;
  step: TraversalStep;
}

/**
 * Works out which ends of an edge are on the frontier, and produces a step for
 * each traversable direction.
 *
 * An edge between two frontier nodes yields a step from each end; whichever
 * side is processed first claims the neighbour, and the other is skipped as
 * already visited.
 */
function stepsFromEdge(
  edge: GraphEdge,
  frontierByKey: ReadonlyMap<string, TraversalNode>,
  direction: GraphDirection,
): EdgeStep[] {
  const sourceKey = graphNodeKey(edge.source);
  const targetKey = graphNodeKey(edge.target);
  const steps: EdgeStep[] = [];

  const from = frontierByKey.get(sourceKey);
  if (from && direction !== "INBOUND") {
    steps.push({
      from,
      neighbor: edge.target,
      step: {
        edgeType: edge.type,
        relationshipId: edge.relationshipId,
        traversed: "FORWARD",
        from: { type: edge.source.type, id: edge.source.id },
        to: { type: edge.target.type, id: edge.target.id },
      },
    });
  }

  const into = frontierByKey.get(targetKey);
  if (into && direction !== "OUTBOUND") {
    steps.push({
      from: into,
      neighbor: edge.source,
      step: {
        edgeType: edge.type,
        relationshipId: edge.relationshipId,
        traversed: "REVERSE",
        from: { type: edge.target.type, id: edge.target.id },
        to: { type: edge.source.type, id: edge.source.id },
      },
    });
  }

  return steps;
}

function hasUnvisitedEndpoint(
  raw: readonly RawEdge[],
  visited: ReadonlyMap<string, TraversalNode>,
): boolean {
  return raw.some(
    (edge) => !visited.has(graphNodeKey(edge.source)) || !visited.has(graphNodeKey(edge.target)),
  );
}

/** Stable expansion order, independent of how the database returned rows. */
function orderEdges(edges: readonly GraphEdge[]): GraphEdge[] {
  return [...edges].sort(compareEdges);
}

function compareEdges(a: GraphEdge, b: GraphEdge): number {
  const byTime = a.createdAt.getTime() - b.createdAt.getTime();
  if (byTime !== 0) return byTime;
  if (a.type !== b.type) return a.type < b.type ? -1 : 1;
  if (a.relationshipId === b.relationshipId) return 0;
  return a.relationshipId < b.relationshipId ? -1 : 1;
}

function compareTraversalNodes(a: TraversalNode, b: TraversalNode): number {
  if (a.depth !== b.depth) return a.depth - b.depth;
  if (a.node.type !== b.node.type) return a.node.type < b.node.type ? -1 : 1;
  if (a.node.id === b.node.id) return 0;
  return a.node.id < b.node.id ? -1 : 1;
}

function compareAnomalies(a: GraphAnomaly, b: GraphAnomaly): number {
  if (a.edgeType !== b.edgeType) return a.edgeType < b.edgeType ? -1 : 1;
  if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
  if (a.relationshipId === b.relationshipId) return 0;
  return a.relationshipId < b.relationshipId ? -1 : 1;
}

export const engineeringGraphService = new EngineeringGraphService();
