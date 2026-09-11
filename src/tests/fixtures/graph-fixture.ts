import {
  graphNodeKey,
  type GraphDirection,
  type GraphEdge,
  type GraphEdgeType,
  type GraphNode,
  type GraphNodeRef,
  type GraphNodeType,
} from "@/domain";
import type { AuditEdge, RawEdge } from "@/server/repositories/graph-edge-resolvers";
import type { GraphReader } from "@/server/repositories/graph-repository";

/**
 * An in-memory graph, for testing traversal without a database.
 *
 * This is a graph fixture, not a database fake: it holds nodes and edges
 * directly and never pretends to implement Prisma's query semantics. It exists
 * so the breadth-first algorithm, the caps and the project boundary can be
 * driven over graph shapes that would be tedious to build in SQL. The real
 * resolvers are exercised against PostgreSQL in the integration suite, and
 * nothing here substitutes for that.
 */
export class GraphFixture implements GraphReader {
  /** Rows the consistency check should see, keyed by edge type. */
  readonly audit = new Map<GraphEdgeType, AuditEdge[]>();

  /** Per-node revision stamps, for monitoring tests. */
  private readonly revisions = new Map<string, Date>();

  constructor(
    private readonly nodes: GraphNode[],
    private readonly edges: RawEdge[],
  ) {}

  /** Mirrors the repository's fail-closed rule: both ends must be in the project. */
  private visible(projectId: string): RawEdge[] {
    const inProject = new Set(
      this.nodes.filter((n) => n.projectId === projectId).map((n) => graphNodeKey(n)),
    );
    return this.edges.filter(
      (e) => inProject.has(graphNodeKey(e.source)) && inProject.has(graphNodeKey(e.target)),
    );
  }

  async resolveNodes(projectId: string, refs: readonly GraphNodeRef[]) {
    const wanted = new Set(refs.map(graphNodeKey));
    const resolved = new Map<string, GraphNode>();
    for (const candidate of this.nodes) {
      if (candidate.projectId !== projectId) continue;
      const key = graphNodeKey(candidate);
      if (wanted.has(key)) resolved.set(key, candidate);
    }
    return resolved;
  }

  async getNode(projectId: string, ref: GraphNodeRef) {
    return (await this.resolveNodes(projectId, [ref])).get(graphNodeKey(ref)) ?? null;
  }

  async getOutgoingEdges(
    projectId: string,
    refs: readonly GraphNodeRef[],
    edgeTypes?: readonly GraphEdgeType[],
  ) {
    const keys = new Set(refs.map(graphNodeKey));
    return this.visible(projectId)
      .filter((e) => keys.has(graphNodeKey(e.source)))
      .filter((e) => !edgeTypes || edgeTypes.includes(e.type));
  }

  async getIncomingEdges(
    projectId: string,
    refs: readonly GraphNodeRef[],
    edgeTypes?: readonly GraphEdgeType[],
  ) {
    const keys = new Set(refs.map(graphNodeKey));
    return this.visible(projectId)
      .filter((e) => keys.has(graphNodeKey(e.target)))
      .filter((e) => !edgeTypes || edgeTypes.includes(e.type));
  }

  async getEdges(
    projectId: string,
    refs: readonly GraphNodeRef[],
    direction: GraphDirection,
    edgeTypes?: readonly GraphEdgeType[],
  ) {
    if (direction === "OUTBOUND") return this.getOutgoingEdges(projectId, refs, edgeTypes);
    if (direction === "INBOUND") return this.getIncomingEdges(projectId, refs, edgeTypes);

    const [out, into] = await Promise.all([
      this.getOutgoingEdges(projectId, refs, edgeTypes),
      this.getIncomingEdges(projectId, refs, edgeTypes),
    ]);
    const seen = new Set<string>();
    return [...out, ...into].filter((e) => {
      const key = `${e.type}:${e.relationshipId}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  async materializeEdges(projectId: string, raw: readonly RawEdge[]) {
    const nodes = await this.resolveNodes(
      projectId,
      raw.flatMap((e) => [e.source, e.target]),
    );
    const edges: GraphEdge[] = [];
    for (const e of raw) {
      const source = nodes.get(graphNodeKey(e.source));
      const target = nodes.get(graphNodeKey(e.target));
      if (!source || !target) continue;
      edges.push({ ...e, source, target });
    }
    return { edges, nodes };
  }

  async getNeighbors(
    projectId: string,
    ref: GraphNodeRef,
    direction: GraphDirection,
    edgeTypes?: readonly GraphEdgeType[],
  ) {
    const raw = await this.getEdges(projectId, [ref], direction, edgeTypes);
    const { edges } = await this.materializeEdges(projectId, raw);
    return edges;
  }

  async auditEdges(_projectId: string, edgeTypes: readonly GraphEdgeType[]) {
    const result = new Map<GraphEdgeType, AuditEdge[]>();
    for (const type of edgeTypes) result.set(type, this.audit.get(type) ?? []);
    return result;
  }

  async findExistingRefs(projectId: string, refs: readonly GraphNodeRef[]) {
    return new Set((await this.resolveNodes(projectId, refs)).keys());
  }

  /**
   * Revision stamps for the fixture's nodes.
   *
   * Tests set these through {@link setRevision} so a "someone edited this
   * artifact" scenario can be expressed without a database. Anything never
   * stamped reports a fixed epoch, so an unmodified fixture is deterministic.
   */
  async getNodeRevisions(projectId: string, refs: readonly GraphNodeRef[]) {
    const resolved = await this.resolveNodes(projectId, refs);
    const revisions = new Map<string, Date>();
    for (const key of resolved.keys()) {
      revisions.set(key, this.revisions.get(key) ?? BASELINE_REVISION);
    }
    return revisions;
  }

  /** Marks a node as having been edited at `at`. */
  setRevision(ref: GraphNodeRef, at: Date): void {
    this.revisions.set(graphNodeKey(ref), at);
  }
}

/** What an unedited fixture node reports as its revision. */
export const BASELINE_REVISION = new Date(Date.UTC(2026, 0, 1));

export const FIXTURE_PROJECT = "proj1aaaaaaaaaaaaaaaaaa";
export const FIXTURE_OTHER_PROJECT = "proj2aaaaaaaaaaaaaaaaaa";

/** Monotonic so that edge ordering in expectations is explicit rather than incidental. */
let clock = 0;

export function resetGraphClock(): void {
  clock = 0;
}

export function graphNode(
  type: GraphNodeType,
  id: string,
  projectId = FIXTURE_PROJECT,
): GraphNode {
  return { type, id, projectId, identifier: id.toUpperCase(), label: `${type} ${id}` };
}

export function graphEdge(
  type: GraphEdgeType,
  source: GraphNodeRef,
  target: GraphNodeRef,
  relationshipId = `rel${(clock += 1)}`,
): RawEdge {
  return {
    type,
    relationshipId,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, (clock += 1))),
    createdById: "user1aaaaaaaaaaaaaaaaaaa",
    note: null,
    linkType: null,
    source,
    target,
  };
}

export const nodeRef = (node: GraphNode): GraphNodeRef => ({ type: node.type, id: node.id });

/**
 * A small but real slice of the domain:
 *
 *   SN-1 ──derives──▶ REQ-1 ──allocated──▶ DI-1 ──connects──▶ IF-1
 *                       │
 *                       └──verified by──▶ VA-1
 *   RISK-1 ──affects──▶ REQ-1
 */
export function buildTraceabilityFixture() {
  resetGraphClock();

  const need = graphNode("STAKEHOLDER_NEED", "sn1");
  const requirement = graphNode("REQUIREMENT", "req1");
  const designItem = graphNode("DESIGN_ITEM", "di1");
  const interfaceDefinition = graphNode("INTERFACE_DEFINITION", "if1");
  const verification = graphNode("VERIFICATION_ACTIVITY", "va1");
  const risk = graphNode("RISK", "risk1");

  const fixture = new GraphFixture(
    [need, requirement, designItem, interfaceDefinition, verification, risk],
    [
      graphEdge("STAKEHOLDER_NEED_DERIVES_REQUIREMENT", nodeRef(need), nodeRef(requirement), "relNeedReq"),
      graphEdge("REQUIREMENT_ALLOCATED_TO_DESIGN", nodeRef(requirement), nodeRef(designItem), "relReqDesign"),
      graphEdge("REQUIREMENT_VERIFIED_BY", nodeRef(requirement), nodeRef(verification), "relReqVer"),
      graphEdge("DESIGN_CONNECTS_INTERFACE", nodeRef(designItem), nodeRef(interfaceDefinition), "relDesignIf"),
      graphEdge("RISK_AFFECTS_REQUIREMENT", nodeRef(risk), nodeRef(requirement), "relRiskReq"),
    ],
  );

  return { fixture, need, requirement, designItem, interfaceDefinition, verification, risk };
}
