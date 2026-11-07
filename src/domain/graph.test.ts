import { describe, expect, it } from "vitest";
import {
  edgeTypesFrom,
  edgeTypesInto,
  GRAPH_EDGE_DEFINITIONS,
  GRAPH_EDGE_TYPES,
  GRAPH_LIMITS,
  GRAPH_NODE_TYPES,
  graphEdgeKey,
  graphNodeKey,
  graphTraversalRequestSchema,
  isValidEdgeEndpointPair,
} from "./graph";

const REQUIREMENT_ID = "req1aaaaaaaaaaaaaaaaaaa";

describe("the edge registry", () => {
  it("declares every edge type exactly once, keyed by its own type", () => {
    expect(Object.keys(GRAPH_EDGE_DEFINITIONS).sort()).toEqual([...GRAPH_EDGE_TYPES].sort());

    for (const [key, definition] of Object.entries(GRAPH_EDGE_DEFINITIONS)) {
      expect(definition.type).toBe(key);
    }
  });

  it("only names node types that exist", () => {
    const nodeTypes = new Set<string>(GRAPH_NODE_TYPES);

    for (const definition of Object.values(GRAPH_EDGE_DEFINITIONS)) {
      expect(nodeTypes).toContain(definition.source);
      expect(definition.targets.length).toBeGreaterThan(0);
      for (const target of definition.targets) {
        expect(nodeTypes).toContain(target);
      }
    }
  });

  it("explains what every edge means", () => {
    for (const definition of Object.values(GRAPH_EDGE_DEFINITIONS)) {
      expect(definition.meaning.length).toBeGreaterThan(10);
    }
  });

  it("finds the edges leaving a node type", () => {
    expect(edgeTypesFrom("STAKEHOLDER_NEED")).toEqual(["STAKEHOLDER_NEED_DERIVES_REQUIREMENT"]);
    expect(edgeTypesFrom("REQUIREMENT")).toContain("REQUIREMENT_ALLOCATED_TO_DESIGN");
    // A stakeholder need is nobody's target.
    expect(edgeTypesInto("STAKEHOLDER_NEED")).toEqual([]);
  });

  it("finds the edges arriving at a node type", () => {
    const intoRequirement = edgeTypesInto("REQUIREMENT");

    expect(intoRequirement).toContain("STAKEHOLDER_NEED_DERIVES_REQUIREMENT");
    expect(intoRequirement).toContain("RISK_AFFECTS_REQUIREMENT");
    // Polymorphic edges count as arriving at each type they can point at.
    expect(intoRequirement).toContain("CHANGE_IMPACTS_OBJECT");
    expect(intoRequirement).toContain("APPROVAL_RELATES_TO_OBJECT");
  });

  it("puts every edge type on some node type's outgoing list", () => {
    const reachable = new Set(GRAPH_NODE_TYPES.flatMap((type) => edgeTypesFrom(type)));

    expect([...reachable].sort()).toEqual([...GRAPH_EDGE_TYPES].sort());
  });

  it("says which relationships allow more than one edge between a pair", () => {
    // These mirror the unique constraints the tables actually carry. An
    // approval history is many-per-artifact by design, and a decision's
    // children — like a supplier's items and qualifications — are their own
    // targets read from a parent foreign key, so neither can be a duplicate.
    const notUnique = GRAPH_EDGE_TYPES.filter(
      (type) => !GRAPH_EDGE_DEFINITIONS[type].uniquePerPair,
    );

    expect(notUnique.sort()).toEqual([
      "APPROVAL_RELATES_TO_OBJECT",
      "BASELINE_HAS_MEMBER",
      "CERTIFICATION_BASIS_HAS_COMPLIANCE_ITEM",
      "CERTIFICATION_PROGRAM_HAS_BASIS",
      "CERTIFICATION_PROGRAM_HAS_REVIEW",
      "CERTIFICATION_REVIEW_HAS_FINDING",
      "COMPLIANCE_ITEM_HAS_FINDING",
      "DECISION_HAS_ALTERNATIVE",
      "DECISION_HAS_ASSUMPTION",
      "DECISION_HAS_EXPECTATION",
      "DRIFT_ASSESSMENT_HAS_FINDING",
      "SUPPLIED_ITEM_QUALIFIED_BY",
      "SUPPLIER_HAS_QUALIFICATION",
      "SUPPLIER_PROVIDES_ITEM",
    ]);
  });

  it("validates endpoint pairs against the registry", () => {
    expect(isValidEdgeEndpointPair("REQUIREMENT_VERIFIED_BY", "REQUIREMENT", "VERIFICATION_ACTIVITY")).toBe(true);
    // Right types, wrong way round.
    expect(isValidEdgeEndpointPair("REQUIREMENT_VERIFIED_BY", "VERIFICATION_ACTIVITY", "REQUIREMENT")).toBe(false);
    expect(isValidEdgeEndpointPair("REQUIREMENT_VERIFIED_BY", "REQUIREMENT", "RISK")).toBe(false);
  });

  it("accepts every target a polymorphic edge declares", () => {
    for (const target of GRAPH_EDGE_DEFINITIONS.CHANGE_IMPACTS_OBJECT.targets) {
      expect(isValidEdgeEndpointPair("CHANGE_IMPACTS_OBJECT", "CHANGE_REQUEST", target)).toBe(true);
    }
  });
});

describe("node and edge keys", () => {
  it("keys a node by type as well as id", () => {
    // Ids are unique per table, not globally, so type has to be part of the key.
    expect(graphNodeKey({ type: "REQUIREMENT", id: REQUIREMENT_ID })).not.toBe(
      graphNodeKey({ type: "RISK", id: REQUIREMENT_ID }),
    );
  });

  it("keys an edge by type as well as relationship id", () => {
    expect(graphEdgeKey("RISK_AFFECTS_DESIGN", "rel1")).toBe("RISK_AFFECTS_DESIGN:rel1");
  });
});

describe("the traversal request", () => {
  const root = { type: "REQUIREMENT" as const, id: REQUIREMENT_ID };

  it("fills in the documented defaults", () => {
    const parsed = graphTraversalRequestSchema.parse({ root });

    expect(parsed.direction).toBe("BOTH");
    expect(parsed.maxDepth).toBe(GRAPH_LIMITS.defaultMaxDepth);
    expect(parsed.maxNodes).toBe(GRAPH_LIMITS.defaultMaxNodes);
    expect(parsed.maxEdges).toBe(GRAPH_LIMITS.defaultMaxEdges);
    expect(parsed.nodeTypes).toBeUndefined();
    expect(parsed.edgeTypes).toBeUndefined();
  });

  it("rejects a request for more than the caps allow", () => {
    // Rejected, not clamped: a caller must never be told it got a full answer
    // when the server silently reduced the request.
    expect(() =>
      graphTraversalRequestSchema.parse({ root, maxDepth: GRAPH_LIMITS.maxMaxDepth + 1 }),
    ).toThrow();
    expect(() =>
      graphTraversalRequestSchema.parse({ root, maxNodes: GRAPH_LIMITS.maxMaxNodes + 1 }),
    ).toThrow();
    expect(() =>
      graphTraversalRequestSchema.parse({ root, maxEdges: GRAPH_LIMITS.maxMaxEdges + 1 }),
    ).toThrow();
  });

  it("rejects limits below one", () => {
    expect(() => graphTraversalRequestSchema.parse({ root, maxDepth: 0 })).toThrow();
    expect(() => graphTraversalRequestSchema.parse({ root, maxNodes: 0 })).toThrow();
  });

  it("rejects an unknown node type in the root", () => {
    expect(() =>
      graphTraversalRequestSchema.parse({ root: { type: "SPACECRAFT", id: REQUIREMENT_ID } }),
    ).toThrow();
  });

  it("rejects an unknown edge-type filter", () => {
    expect(() =>
      graphTraversalRequestSchema.parse({ root, edgeTypes: ["REQUIREMENT_IS_NICE"] }),
    ).toThrow();
  });

  it("rejects unknown properties", () => {
    expect(() => graphTraversalRequestSchema.parse({ root, followEverything: true })).toThrow();
  });

  it("rejects an empty filter list rather than treating it as no filter", () => {
    expect(() => graphTraversalRequestSchema.parse({ root, nodeTypes: [] })).toThrow();
    expect(() => graphTraversalRequestSchema.parse({ root, edgeTypes: [] })).toThrow();
  });

  it("keeps the filters it is given", () => {
    const parsed = graphTraversalRequestSchema.parse({
      root,
      direction: "OUTBOUND",
      maxDepth: 2,
      nodeTypes: ["DESIGN_ITEM"],
      edgeTypes: ["REQUIREMENT_ALLOCATED_TO_DESIGN"],
    });

    expect(parsed.direction).toBe("OUTBOUND");
    expect(parsed.maxDepth).toBe(2);
    expect(parsed.nodeTypes).toEqual(["DESIGN_ITEM"]);
    expect(parsed.edgeTypes).toEqual(["REQUIREMENT_ALLOCATED_TO_DESIGN"]);
  });
});
