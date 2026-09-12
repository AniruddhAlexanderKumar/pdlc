// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GRAPH_EDGE_TYPES, type GraphNode } from "@/domain";
import { NotFoundError, ValidationError } from "@/server/errors";
import {
  buildTraceabilityFixture,
  FIXTURE_OTHER_PROJECT,
  FIXTURE_PROJECT,
  GraphFixture,
  graphEdge,
  graphNode,
  nodeRef,
} from "@/tests/fixtures/graph-fixture";
import { EngineeringGraphService } from "./engineering-graph.service";

/**
 * The traversal algorithm, driven over hand-built graphs.
 *
 * The organization boundary, the breadth-first walk, the caps and the
 * consistency rules all live in the service, so all of them are tested here.
 * The SQL underneath is exercised against PostgreSQL in
 * `src/tests/integration/graph.test.ts` — nothing in this file claims to cover
 * it.
 */

vi.mock("@/server/repositories/project.repository", () => ({
  findProjectInOrganization: vi.fn(),
}));

vi.mock("@/server/repositories/user.repository", () => ({
  isMemberOfOrganization: vi.fn(),
  getOrganizationRole: vi.fn(),
}));

vi.mock("@/server/repositories/project-membership.repository", () => ({ findMembership: vi.fn() }));

const projectRepository = await import("@/server/repositories/project.repository");
const userRepository = await import("@/server/repositories/user.repository");
const membershipRepository = await import("@/server/repositories/project-membership.repository");

const PROJECT = FIXTURE_PROJECT;

const CONTEXT = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
};

let fixture: GraphFixture;
let service: EngineeringGraphService;
let requirement: GraphNode;
let designItem: GraphNode;
let verification: GraphNode;
let risk: GraphNode;

beforeEach(() => {
  vi.mocked(projectRepository.findProjectInOrganization).mockReset();
  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue({
    id: PROJECT,
  } as never);
  // CONTEXT's actor is treated as the organization owner — full implicit
  // project access with no explicit ProjectMembership row needed.
  vi.mocked(membershipRepository.findMembership).mockReset();
  vi.mocked(membershipRepository.findMembership).mockResolvedValue(null);
  vi.mocked(userRepository.getOrganizationRole).mockReset();
  vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("OWNER");

  const built = buildTraceabilityFixture();
  fixture = built.fixture;
  requirement = built.requirement;
  designItem = built.designItem;
  verification = built.verification;
  risk = built.risk;
  service = new EngineeringGraphService(fixture);
});

describe("resolving a node", () => {
  it("returns the node's identity, not the whole artifact", async () => {
    const resolved = await service.getNode(CONTEXT, PROJECT, nodeRef(requirement));

    expect(resolved).toEqual(requirement);
    expect(Object.keys(resolved).sort()).toEqual([
      "id",
      "identifier",
      "label",
      "projectId",
      "type",
    ]);
  });

  it("404s for a node that does not exist", async () => {
    await expect(
      service.getNode(CONTEXT, PROJECT, { type: "REQUIREMENT", id: "nope" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("404s when the id exists but under a different node type", async () => {
    await expect(
      service.getNode(CONTEXT, PROJECT, { type: "RISK", id: requirement.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("404s when the project is not in the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    // Not 403: the API does not confirm the existence of a project it will not
    // show you.
    await expect(service.getNode(CONTEXT, PROJECT, nodeRef(requirement))).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  it("rejects a malformed node reference before touching the graph", async () => {
    await expect(
      service.getNode(CONTEXT, PROJECT, { type: "SPACECRAFT", id: requirement.id }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("direct connections", () => {
  it("reports both directions with the neighbour on the far end", async () => {
    const { connections } = await service.getDirectConnections(
      CONTEXT,
      PROJECT,
      nodeRef(requirement),
    );

    expect(connections.map((c) => [c.direction, c.edge.type, c.neighbor.id]).sort()).toEqual(
      [
        ["OUTBOUND", "REQUIREMENT_ALLOCATED_TO_DESIGN", "di1"],
        ["OUTBOUND", "REQUIREMENT_VERIFIED_BY", "va1"],
        ["INBOUND", "STAKEHOLDER_NEED_DERIVES_REQUIREMENT", "sn1"],
        ["INBOUND", "RISK_AFFECTS_REQUIREMENT", "risk1"],
      ].sort(),
    );
  });

  it("returns only what the node points at when asked for OUTBOUND", async () => {
    const { connections } = await service.getDirectConnections(
      CONTEXT,
      PROJECT,
      nodeRef(requirement),
      "OUTBOUND",
    );

    expect(connections.every((c) => c.direction === "OUTBOUND")).toBe(true);
    expect(connections.map((c) => c.neighbor.id).sort()).toEqual(["di1", "va1"]);
  });

  it("returns only what points at the node when asked for INBOUND", async () => {
    const { connections } = await service.getDirectConnections(
      CONTEXT,
      PROJECT,
      nodeRef(requirement),
      "INBOUND",
    );

    expect(connections.map((c) => c.neighbor.id).sort()).toEqual(["risk1", "sn1"]);
  });

  it("narrows to the requested edge types", async () => {
    const { connections } = await service.getDirectConnections(
      CONTEXT,
      PROJECT,
      nodeRef(requirement),
      "BOTH",
      ["REQUIREMENT_VERIFIED_BY"],
    );

    expect(connections).toHaveLength(1);
    expect(connections[0]?.neighbor.id).toBe("va1");
  });

  it("is one hop only", async () => {
    const { connections } = await service.getDirectConnections(
      CONTEXT,
      PROJECT,
      nodeRef(requirement),
    );

    // IF-1 is two hops away, via the design item.
    expect(connections.map((c) => c.neighbor.id)).not.toContain("if1");
  });

  it("carries the node itself alongside its connections", async () => {
    const neighborhood = await service.getNeighbors(CONTEXT, PROJECT, nodeRef(designItem));

    expect(neighborhood.node).toEqual(designItem);
  });
});

describe("traversal", () => {
  it("walks outward and records how far each node is", async () => {
    const result = await service.traverse(CONTEXT, PROJECT, {
      root: nodeRef(requirement),
      direction: "OUTBOUND",
    });

    expect(result.root).toEqual(requirement);
    expect(result.nodes.map((n) => [n.node.id, n.depth])).toEqual([
      ["req1", 0],
      ["di1", 1],
      ["va1", 1],
      ["if1", 2],
    ]);
  });

  it("records the path that reached each node, with its provenance", async () => {
    const result = await service.traverse(CONTEXT, PROJECT, {
      root: nodeRef(requirement),
      direction: "OUTBOUND",
    });

    const iface = result.nodes.find((n) => n.node.id === "if1");
    expect(iface?.path).toEqual([
      {
        edgeType: "REQUIREMENT_ALLOCATED_TO_DESIGN",
        relationshipId: "relReqDesign",
        traversed: "FORWARD",
        from: { type: "REQUIREMENT", id: "req1" },
        to: { type: "DESIGN_ITEM", id: "di1" },
      },
      {
        edgeType: "DESIGN_CONNECTS_INTERFACE",
        relationshipId: "relDesignIf",
        traversed: "FORWARD",
        from: { type: "DESIGN_ITEM", id: "di1" },
        to: { type: "INTERFACE_DEFINITION", id: "if1" },
      },
    ]);
  });

  it("marks an edge followed against its direction as REVERSE", async () => {
    const result = await service.traverse(CONTEXT, PROJECT, {
      root: nodeRef(requirement),
      direction: "INBOUND",
    });

    const fromNeed = result.nodes.find((n) => n.node.id === "sn1");
    expect(fromNeed?.path).toEqual([
      {
        edgeType: "STAKEHOLDER_NEED_DERIVES_REQUIREMENT",
        relationshipId: "relNeedReq",
        traversed: "REVERSE",
        from: { type: "REQUIREMENT", id: "req1" },
        to: { type: "STAKEHOLDER_NEED", id: "sn1" },
      },
    ]);
  });

  it("returns the root alone when nothing connects to it", async () => {
    const lonely = graphNode("EVIDENCE", "ev1");
    service = new EngineeringGraphService(new GraphFixture([lonely], []));

    const result = await service.traverse(CONTEXT, PROJECT, { root: nodeRef(lonely) });

    expect(result.nodes).toEqual([{ node: lonely, depth: 0, path: [] }]);
    expect(result.edges).toEqual([]);
    expect(result.limits.truncated).toBe(false);
  });

  it("terminates on a cycle and visits each node once", async () => {
    const a = graphNode("REQUIREMENT", "a");
    const b = graphNode("REQUIREMENT", "b");
    const c = graphNode("REQUIREMENT", "c");
    service = new EngineeringGraphService(
      new GraphFixture(
        [a, b, c],
        [
          graphEdge("REQUIREMENT_DEPENDS_ON_REQUIREMENT", nodeRef(a), nodeRef(b), "ab"),
          graphEdge("REQUIREMENT_DEPENDS_ON_REQUIREMENT", nodeRef(b), nodeRef(c), "bc"),
          graphEdge("REQUIREMENT_DEPENDS_ON_REQUIREMENT", nodeRef(c), nodeRef(a), "ca"),
        ],
      ),
    );

    const result = await service.traverse(CONTEXT, PROJECT, {
      root: nodeRef(a),
      direction: "OUTBOUND",
      maxDepth: 5,
    });

    expect(result.nodes.map((n) => n.node.id).sort()).toEqual(["a", "b", "c"]);
    expect(result.edges).toHaveLength(3);
    expect(result.limits.truncated).toBe(false);
  });

  it("handles a self-referential edge without looping", async () => {
    const a = graphNode("REQUIREMENT", "a");
    service = new EngineeringGraphService(
      new GraphFixture(
        [a],
        [graphEdge("REQUIREMENT_DEPENDS_ON_REQUIREMENT", nodeRef(a), nodeRef(a), "self")],
      ),
    );

    const result = await service.traverse(CONTEXT, PROJECT, {
      root: nodeRef(a),
      direction: "BOTH",
    });

    expect(result.nodes).toHaveLength(1);
    expect(result.edges).toHaveLength(1);
  });

  it("reaches every node by its shortest path", async () => {
    const a = graphNode("REQUIREMENT", "a");
    const b = graphNode("REQUIREMENT", "b");
    const c = graphNode("REQUIREMENT", "c");
    service = new EngineeringGraphService(
      new GraphFixture(
        [a, b, c],
        [
          // A long way round, recorded first, and a direct edge recorded later.
          graphEdge("REQUIREMENT_DEPENDS_ON_REQUIREMENT", nodeRef(a), nodeRef(b), "ab"),
          graphEdge("REQUIREMENT_DEPENDS_ON_REQUIREMENT", nodeRef(b), nodeRef(c), "bc"),
          graphEdge("REQUIREMENT_DEPENDS_ON_REQUIREMENT", nodeRef(a), nodeRef(c), "ac"),
        ],
      ),
    );

    const result = await service.traverse(CONTEXT, PROJECT, {
      root: nodeRef(a),
      direction: "OUTBOUND",
    });

    const toC = result.nodes.find((n) => n.node.id === "c");
    expect(toC?.depth).toBe(1);
    expect(toC?.path.map((s) => s.relationshipId)).toEqual(["ac"]);
  });

  it("stops at the requested depth", async () => {
    const result = await service.traverse(CONTEXT, PROJECT, {
      root: nodeRef(requirement),
      direction: "OUTBOUND",
      maxDepth: 1,
    });

    expect(result.nodes.map((n) => n.node.id).sort()).toEqual(["di1", "req1", "va1"]);
    expect(result.limits.truncated).toBe(true);
    expect(result.limits.truncatedBy).toBe("MAX_DEPTH");
  });

  it("does not claim truncation when the depth cap happened to be enough", async () => {
    const result = await service.traverse(CONTEXT, PROJECT, {
      root: nodeRef(requirement),
      direction: "OUTBOUND",
      maxDepth: 2,
    });

    expect(result.nodes).toHaveLength(4);
    expect(result.limits.truncated).toBe(false);
    expect(result.limits.truncatedBy).toBeNull();
  });

  it("stops at the node cap and says so", async () => {
    const result = await service.traverse(CONTEXT, PROJECT, {
      root: nodeRef(requirement),
      direction: "OUTBOUND",
      maxNodes: 2,
    });

    expect(result.nodes).toHaveLength(2);
    expect(result.limits.truncated).toBe(true);
    expect(result.limits.truncatedBy).toBe("MAX_NODES");
  });

  it("stops at the edge cap and says so", async () => {
    const result = await service.traverse(CONTEXT, PROJECT, {
      root: nodeRef(requirement),
      direction: "BOTH",
      maxEdges: 1,
    });

    expect(result.edges).toHaveLength(1);
    expect(result.limits.truncated).toBe(true);
    expect(result.limits.truncatedBy).toBe("MAX_EDGES");
  });

  it("reports the limits it actually applied", async () => {
    const result = await service.traverse(CONTEXT, PROJECT, {
      root: nodeRef(requirement),
      maxDepth: 2,
      maxNodes: 10,
      maxEdges: 20,
    });

    expect(result.limits.maxDepth).toBe(2);
    expect(result.limits.maxNodes).toBe(10);
    expect(result.limits.maxEdges).toBe(20);
  });

  it("visits only the node types it was asked for", async () => {
    const result = await service.traverse(CONTEXT, PROJECT, {
      root: nodeRef(requirement),
      direction: "OUTBOUND",
      nodeTypes: ["DESIGN_ITEM", "INTERFACE_DEFINITION"],
    });

    // The verification activity is one hop away but excluded by type.
    expect(result.nodes.map((n) => n.node.id).sort()).toEqual(["di1", "if1", "req1"]);
  });

  it("follows only the edge types it was asked for", async () => {
    const result = await service.traverse(CONTEXT, PROJECT, {
      root: nodeRef(requirement),
      direction: "OUTBOUND",
      edgeTypes: ["REQUIREMENT_VERIFIED_BY"],
    });

    expect(result.nodes.map((n) => n.node.id).sort()).toEqual(["req1", "va1"]);
    expect(result.edges.map((e) => e.type)).toEqual(["REQUIREMENT_VERIFIED_BY"]);
  });

  it("is deterministic across repeated runs", async () => {
    const request = { root: nodeRef(requirement), direction: "BOTH" as const, maxDepth: 3 };

    const first = await service.traverse(CONTEXT, PROJECT, request);
    const second = await service.traverse(CONTEXT, PROJECT, { ...request });

    expect(JSON.stringify(first)).toBe(JSON.stringify(second));
  });

  it("404s for a root that is not in the project", async () => {
    await expect(
      service.traverse(CONTEXT, PROJECT, { root: { type: "REQUIREMENT", id: "ghost" } }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects a request that exceeds the caps", async () => {
    await expect(
      service.traverse(CONTEXT, PROJECT, { root: nodeRef(requirement), maxDepth: 99 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("never crosses a project boundary", async () => {
    const foreign = graphNode("DESIGN_ITEM", "di-other", FIXTURE_OTHER_PROJECT);
    service = new EngineeringGraphService(
      new GraphFixture(
        [requirement, foreign],
        [
          graphEdge(
            "REQUIREMENT_ALLOCATED_TO_DESIGN",
            nodeRef(requirement),
            nodeRef(foreign),
            "relCross",
          ),
        ],
      ),
    );

    const result = await service.traverse(CONTEXT, PROJECT, {
      root: nodeRef(requirement),
      direction: "OUTBOUND",
    });

    // The row exists, but the edge does not: the graph fails closed.
    expect(result.nodes.map((n) => n.node.id)).toEqual(["req1"]);
    expect(result.edges).toEqual([]);
  });
});

describe("the query helpers", () => {
  it("looks the opposite way for upstream and downstream", async () => {
    const upstream = await service.getUpstreamDependencies(CONTEXT, PROJECT, nodeRef(requirement));
    const downstream = await service.getDownstreamDependents(
      CONTEXT,
      PROJECT,
      nodeRef(requirement),
    );

    expect(upstream.nodes.map((n) => n.node.id).sort()).toEqual(["req1", "risk1", "sn1"]);
    expect(downstream.nodes.map((n) => n.node.id).sort()).toEqual(["di1", "if1", "req1", "va1"]);
  });

  it("takes both directions for a subgraph", async () => {
    const subgraph = await service.getSubgraph(CONTEXT, PROJECT, nodeRef(requirement));

    expect(subgraph.nodes.map((n) => n.node.id).sort()).toEqual([
      "di1",
      "if1",
      "req1",
      "risk1",
      "sn1",
      "va1",
    ]);
  });

  it("honours a depth given to a helper", async () => {
    const subgraph = await service.getSubgraph(CONTEXT, PROJECT, nodeRef(requirement), 1);

    expect(subgraph.limits.maxDepth).toBe(1);
    expect(subgraph.nodes.map((n) => n.node.id)).not.toContain("if1");
  });
});

describe("the consistency check", () => {
  it("reports nothing for a sound graph", async () => {
    fixture.audit.set("REQUIREMENT_ALLOCATED_TO_DESIGN", [
      {
        type: "REQUIREMENT_ALLOCATED_TO_DESIGN",
        relationshipId: "relReqDesign",
        source: nodeRef(requirement),
        target: nodeRef(designItem),
        targetProjectId: PROJECT,
        linkType: null,
      },
    ]);

    const report = await service.checkConsistency(CONTEXT, PROJECT, [
      "REQUIREMENT_ALLOCATED_TO_DESIGN",
    ]);

    expect(report.anomalies).toEqual([]);
    expect(report.edgesChecked).toBe(1);
    expect(report.projectId).toBe(PROJECT);
    expect(report.checkedEdgeTypes).toEqual(["REQUIREMENT_ALLOCATED_TO_DESIGN"]);
  });

  it("reports a target in another project without repairing it", async () => {
    fixture.audit.set("REQUIREMENT_ALLOCATED_TO_DESIGN", [
      {
        type: "REQUIREMENT_ALLOCATED_TO_DESIGN",
        relationshipId: "relCross",
        source: nodeRef(requirement),
        target: { type: "DESIGN_ITEM", id: "di-other" },
        targetProjectId: FIXTURE_OTHER_PROJECT,
        linkType: null,
      },
    ]);

    const report = await service.checkConsistency(CONTEXT, PROJECT, [
      "REQUIREMENT_ALLOCATED_TO_DESIGN",
    ]);

    expect(report.anomalies).toHaveLength(1);
    expect(report.anomalies[0]?.kind).toBe("CROSS_PROJECT_ENDPOINT");
    expect(report.anomalies[0]?.relationshipId).toBe("relCross");
    expect(report.anomalies[0]?.detail).toContain(FIXTURE_OTHER_PROJECT);
  });

  it("reports a target that does not exist", async () => {
    fixture.audit.set("REQUIREMENT_VERIFIED_BY", [
      {
        type: "REQUIREMENT_VERIFIED_BY",
        relationshipId: "relDangling",
        source: nodeRef(requirement),
        target: { type: "VERIFICATION_ACTIVITY", id: "gone" },
        targetProjectId: null,
        linkType: null,
      },
    ]);

    const report = await service.checkConsistency(CONTEXT, PROJECT, ["REQUIREMENT_VERIFIED_BY"]);

    expect(report.anomalies.map((a) => a.kind)).toEqual(["MISSING_ENDPOINT"]);
  });

  it("reports a relationship row with no target at all", async () => {
    fixture.audit.set("CHANGE_IMPACTS_OBJECT", [
      {
        type: "CHANGE_IMPACTS_OBJECT",
        relationshipId: "relEmpty",
        source: { type: "CHANGE_REQUEST", id: "cr1" },
        target: null,
        targetProjectId: null,
        linkType: null,
      },
    ]);

    const report = await service.checkConsistency(CONTEXT, PROJECT, ["CHANGE_IMPACTS_OBJECT"]);

    expect(report.anomalies.map((a) => a.kind)).toEqual(["MALFORMED_RELATIONSHIP"]);
  });

  it("reports endpoints the registry does not permit", async () => {
    fixture.audit.set("REQUIREMENT_VERIFIED_BY", [
      {
        type: "REQUIREMENT_VERIFIED_BY",
        relationshipId: "relWrongTypes",
        source: nodeRef(risk),
        target: nodeRef(verification),
        targetProjectId: PROJECT,
        linkType: null,
      },
    ]);

    const report = await service.checkConsistency(CONTEXT, PROJECT, ["REQUIREMENT_VERIFIED_BY"]);

    expect(report.anomalies[0]?.kind).toBe("MALFORMED_RELATIONSHIP");
    expect(report.anomalies[0]?.detail).toContain("not permitted");
  });

  it("reports a second row asserting the same relationship", async () => {
    fixture.audit.set("REQUIREMENT_ALLOCATED_TO_DESIGN", [
      {
        type: "REQUIREMENT_ALLOCATED_TO_DESIGN",
        relationshipId: "relFirst",
        source: nodeRef(requirement),
        target: nodeRef(designItem),
        targetProjectId: PROJECT,
        linkType: null,
      },
      {
        type: "REQUIREMENT_ALLOCATED_TO_DESIGN",
        relationshipId: "relSecond",
        source: nodeRef(requirement),
        target: nodeRef(designItem),
        targetProjectId: PROJECT,
        linkType: null,
      },
    ]);

    const report = await service.checkConsistency(CONTEXT, PROJECT, [
      "REQUIREMENT_ALLOCATED_TO_DESIGN",
    ]);

    expect(report.anomalies).toHaveLength(1);
    expect(report.anomalies[0]?.kind).toBe("DUPLICATE_EDGE");
    expect(report.anomalies[0]?.relationshipId).toBe("relSecond");
    expect(report.anomalies[0]?.detail).toContain("relFirst");
  });

  it("treats a different link type between the same pair as a different assertion", async () => {
    // `requirement_design_links` is unique on (requirement, design, linkType),
    // so ALLOCATED_TO and SATISFIED_BY between the same pair are two legitimate
    // rows, not a repeat of one.
    fixture.audit.set("REQUIREMENT_ALLOCATED_TO_DESIGN", [
      {
        type: "REQUIREMENT_ALLOCATED_TO_DESIGN",
        relationshipId: "relAllocated",
        source: nodeRef(requirement),
        target: nodeRef(designItem),
        targetProjectId: PROJECT,
        linkType: "ALLOCATED_TO",
      },
      {
        type: "REQUIREMENT_ALLOCATED_TO_DESIGN",
        relationshipId: "relSatisfied",
        source: nodeRef(requirement),
        target: nodeRef(designItem),
        targetProjectId: PROJECT,
        linkType: "SATISFIED_BY",
      },
    ]);

    const report = await service.checkConsistency(CONTEXT, PROJECT, [
      "REQUIREMENT_ALLOCATED_TO_DESIGN",
    ]);

    expect(report.anomalies).toEqual([]);
  });

  it("does not report an approval history as duplicates", async () => {
    // `approvals` carries no unique constraint: an artifact accumulates
    // approvals over time, and flagging the second would be a false alarm.
    fixture.audit.set("APPROVAL_RELATES_TO_OBJECT", [
      {
        type: "APPROVAL_RELATES_TO_OBJECT",
        relationshipId: "approval1",
        source: { type: "APPROVAL", id: "approval1" },
        target: nodeRef(requirement),
        targetProjectId: PROJECT,
        linkType: null,
      },
      {
        type: "APPROVAL_RELATES_TO_OBJECT",
        relationshipId: "approval2",
        source: { type: "APPROVAL", id: "approval2" },
        target: nodeRef(requirement),
        targetProjectId: PROJECT,
        linkType: null,
      },
    ]);

    const report = await service.checkConsistency(CONTEXT, PROJECT, [
      "APPROVAL_RELATES_TO_OBJECT",
    ]);

    expect(report.anomalies.filter((a) => a.kind === "DUPLICATE_EDGE")).toEqual([]);
  });

  it("checks every edge type when none is named", async () => {
    const report = await service.checkConsistency(CONTEXT, PROJECT);

    // Derived from the registry: adding an edge type should extend the check,
    // not break this assertion.
    expect(report.checkedEdgeTypes).toHaveLength(GRAPH_EDGE_TYPES.length);
  });

  it("404s when the project is not in the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    await expect(service.checkConsistency(CONTEXT, PROJECT)).rejects.toBeInstanceOf(NotFoundError);
  });
});
