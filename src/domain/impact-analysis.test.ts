import { describe, expect, it } from "vitest";
import {
  ARTIFACT_DOMAINS,
  CONTEXT_EDGE_TYPES,
  GRAPH_EDGE_DEFINITIONS,
  GRAPH_EDGE_TYPES,
  GRAPH_NODE_TYPES,
  IMPACT_BASIS_MARKERS,
  IMPACT_CLASSIFICATIONS,
  IMPACT_ENGINE_VERSION,
  IMPACT_FINDING_STATUSES,
  IMPACT_LIMITS,
  IMPACT_PROPAGATION,
  PROPAGATING_EDGE_TYPES,
  type ImpactAnalysisReport,
  type ImpactFinding,
  analysisSignature,
  artifactDomain,
  basisForNodeType,
  compareFindings,
  crossesDomain,
  normalizeBasis,
  runImpactAnalysisRequestSchema,
  statusForClassification,
  strongerClassification,
} from "@/domain";

describe("the engine version", () => {
  it("is a stable non-empty identifier", () => {
    // Findings are only comparable within a version, so this has to be
    // something a stored analysis can be matched against. Bumped to "2" when
    // the supplier engineering edges joined the propagation policy, and to "3"
    // when the certification workspace edges did: the set of relationships the
    // engine walks is part of what an analysis means.
    expect(IMPACT_ENGINE_VERSION).toBe("3");
  });
});

describe("the propagation policy", () => {
  it("has exactly one rule per canonical edge type", () => {
    expect(Object.keys(IMPACT_PROPAGATION).sort()).toEqual([...GRAPH_EDGE_TYPES].sort());
  });

  it("keys every rule by its own edge type", () => {
    for (const [key, rule] of Object.entries(IMPACT_PROPAGATION)) {
      expect(rule.type).toBe(key);
    }
  });

  it("explains every rule in engineering terms", () => {
    for (const rule of Object.values(IMPACT_PROPAGATION)) {
      expect(rule.rationale.length).toBeGreaterThan(20);
    }
  });

  it("is written against edges that actually exist in the graph registry", () => {
    for (const rule of Object.values(IMPACT_PROPAGATION)) {
      expect(GRAPH_EDGE_DEFINITIONS[rule.type]).toBeDefined();
    }
  });

  it("never propagates along the declared-impact edge", () => {
    // The roots are that edge's targets. Traversing it would restate the
    // change's own scope; following it inbound would drag in other changes.
    expect(IMPACT_PROPAGATION.CHANGE_IMPACTS_OBJECT.propagates).toBe(false);
    expect(IMPACT_PROPAGATION.CHANGE_IMPACTS_OBJECT.context).toBe(false);
    expect(PROPAGATING_EDGE_TYPES).not.toContain("CHANGE_IMPACTS_OBJECT");
    expect(CONTEXT_EDGE_TYPES).not.toContain("CHANGE_IMPACTS_OBJECT");
  });

  it("does not propagate forward from an approval", () => {
    // Changing an approval record does not alter what it approved.
    expect(IMPACT_PROPAGATION.APPROVAL_RELATES_TO_OBJECT.propagates).toBe(false);
    // But an approval standing against a changed object is worth surfacing.
    expect(IMPACT_PROPAGATION.APPROVAL_RELATES_TO_OBJECT.context).toBe(true);
  });

  it("propagates along the core traceability spine", () => {
    for (const edgeType of [
      "STAKEHOLDER_NEED_DERIVES_REQUIREMENT",
      "REQUIREMENT_ALLOCATED_TO_DESIGN",
      "REQUIREMENT_VERIFIED_BY",
      "REQUIREMENT_LINKED_TO_DECISION",
      "DECISION_AFFECTS_DESIGN",
      "DESIGN_CONNECTS_INTERFACE",
      "DESIGN_CHILD_OF_DESIGN",
    ] as const) {
      expect(IMPACT_PROPAGATION[edgeType].propagates).toBe(true);
    }
  });

  it("reaches decision memory so a later engine can consume it", () => {
    for (const edgeType of [
      "DECISION_HAS_ASSUMPTION",
      "DECISION_HAS_EXPECTATION",
      "DECISION_HAS_ALTERNATIVE",
    ] as const) {
      expect(IMPACT_PROPAGATION[edgeType].propagates).toBe(true);
    }
  });

  it("derives the traversal sets from the policy, sorted", () => {
    expect([...PROPAGATING_EDGE_TYPES]).toEqual([...PROPAGATING_EDGE_TYPES].sort());
    expect([...CONTEXT_EDGE_TYPES]).toEqual([...CONTEXT_EDGE_TYPES].sort());

    expect(PROPAGATING_EDGE_TYPES).toEqual(
      GRAPH_EDGE_TYPES.filter((type) => IMPACT_PROPAGATION[type].propagates).sort(),
    );
  });
});

describe("artifact domains", () => {
  it("assigns a domain to every node type", () => {
    expect(Object.keys(ARTIFACT_DOMAINS).sort()).toEqual([...GRAPH_NODE_TYPES].sort());
  });

  it("keeps decision memory inside the decision domain", () => {
    // Moving from a decision to its own assumption is not a domain transition
    // an engineer needs flagged.
    expect(artifactDomain("DECISION_ASSUMPTION")).toBe(artifactDomain("ENGINEERING_DECISION"));
    expect(artifactDomain("DECISION_EXPECTATION")).toBe(artifactDomain("ENGINEERING_DECISION"));
    expect(crossesDomain("ENGINEERING_DECISION", "DECISION_ASSUMPTION")).toBe(false);
  });

  it("keeps interfaces inside the design domain", () => {
    expect(crossesDomain("DESIGN_ITEM", "INTERFACE_DEFINITION")).toBe(false);
  });

  it("treats requirement to design and design to verification as crossings", () => {
    expect(crossesDomain("REQUIREMENT", "DESIGN_ITEM")).toBe(true);
    expect(crossesDomain("DESIGN_ITEM", "VERIFICATION_ACTIVITY")).toBe(true);
    expect(crossesDomain("REQUIREMENT", "VERIFICATION_ACTIVITY")).toBe(true);
  });

  it("does not treat requirement decomposition as a crossing", () => {
    // Multi-hop is not the same as cross-domain.
    expect(crossesDomain("REQUIREMENT", "REQUIREMENT")).toBe(false);
  });
});

describe("classification precedence", () => {
  it("lets a declared object stay DIRECT when it is also discovered", () => {
    // What the engineer asserted outranks what the walk inferred.
    expect(strongerClassification("DIRECT", "DOWNSTREAM")).toBe("DIRECT");
    expect(strongerClassification("DOWNSTREAM", "DIRECT")).toBe("DIRECT");
    expect(strongerClassification("DIRECT", "CROSS_DOMAIN")).toBe("DIRECT");
    expect(strongerClassification("DIRECT", "UPSTREAM_CONTEXT")).toBe("DIRECT");
  });

  it("prefers a crossing over staying inside one domain", () => {
    expect(strongerClassification("CROSS_DOMAIN", "DOWNSTREAM")).toBe("CROSS_DOMAIN");
  });

  it("prefers any propagated finding over mere context", () => {
    expect(strongerClassification("DOWNSTREAM", "UPSTREAM_CONTEXT")).toBe("DOWNSTREAM");
    expect(strongerClassification("UPSTREAM_CONTEXT", "CROSS_DOMAIN")).toBe("CROSS_DOMAIN");
  });

  it("prefers anything over unknown", () => {
    for (const classification of IMPACT_CLASSIFICATIONS) {
      expect(strongerClassification(classification, "UNKNOWN")).toBe(classification);
    }
  });

  it("is idempotent", () => {
    for (const classification of IMPACT_CLASSIFICATIONS) {
      expect(strongerClassification(classification, classification)).toBe(classification);
    }
  });
});

describe("what the engine will assert", () => {
  it("only calls propagated findings potentially affected", () => {
    expect(statusForClassification("DIRECT")).toBe("POTENTIALLY_AFFECTED");
    expect(statusForClassification("DOWNSTREAM")).toBe("POTENTIALLY_AFFECTED");
    expect(statusForClassification("CROSS_DOMAIN")).toBe("POTENTIALLY_AFFECTED");
  });

  it("declines to evaluate context findings", () => {
    // Surfaced so a person can look. The engine does not claim they are hit.
    expect(statusForClassification("UPSTREAM_CONTEXT")).toBe("NOT_EVALUATED");
  });

  it("says unknown when it cannot classify", () => {
    expect(statusForClassification("UNKNOWN")).toBe("UNKNOWN");
  });

  it("has no status that claims confirmation", () => {
    // Confirmation would need evidence this system does not gather.
    expect(IMPACT_FINDING_STATUSES).not.toContain("CONFIRMED");
    expect(IMPACT_FINDING_STATUSES).not.toContain("AFFECTED");
  });

  it("offers no severity, score or probability anywhere in the vocabulary", () => {
    const vocabulary = [
      ...IMPACT_CLASSIFICATIONS,
      ...IMPACT_FINDING_STATUSES,
      ...IMPACT_BASIS_MARKERS,
    ].join(" ");

    expect(vocabulary).not.toMatch(/SEVERITY|SCORE|PROBABILITY|CONFIDENCE|RISK_LEVEL/);
  });
});

describe("basis markers", () => {
  it("pairs an assumption with an explicit refusal to judge it", () => {
    expect(basisForNodeType("DECISION_ASSUMPTION")).toEqual([
      "ASSUMPTION_PRESENT",
      "ASSUMPTION_VALIDITY_NOT_EVALUATED",
    ]);
  });

  it("pairs an expectation with an explicit refusal to evaluate it", () => {
    expect(basisForNodeType("DECISION_EXPECTATION")).toEqual([
      "EXPECTATION_PRESENT",
      "EXPECTATION_OUTCOME_NOT_EVALUATED",
    ]);
  });

  it("marks a verification activity as affected without claiming it failed", () => {
    const markers = basisForNodeType("VERIFICATION_ACTIVITY");

    expect(markers).toContain("VERIFICATION_ACTIVITY_AFFECTED");
    expect(markers).toContain("VERIFICATION_OUTCOME_NOT_EVALUATED");
    expect(markers.join(" ")).not.toMatch(/FAIL/);
  });

  it("adds nothing for artifact types that need no annotation", () => {
    expect(basisForNodeType("REQUIREMENT")).toEqual([]);
    expect(basisForNodeType("DESIGN_ITEM")).toEqual([]);
  });

  it("deduplicates and sorts, so identical findings carry identical lists", () => {
    expect(
      normalizeBasis(["GRAPH_PROPAGATION", "DECLARED_IMPACT", "GRAPH_PROPAGATION"]),
    ).toEqual(["DECLARED_IMPACT", "GRAPH_PROPAGATION"]);
  });

  it("only ever emits markers from the declared vocabulary", () => {
    const known = new Set<string>(IMPACT_BASIS_MARKERS);

    for (const nodeType of GRAPH_NODE_TYPES) {
      for (const marker of basisForNodeType(nodeType)) {
        expect(known).toContain(marker);
      }
    }
  });
});

describe("the analysis request", () => {
  it("fills in the documented defaults", () => {
    const parsed = runImpactAnalysisRequestSchema.parse({});

    expect(parsed.maxDepth).toBe(IMPACT_LIMITS.defaultMaxDepth);
    expect(parsed.maxNodes).toBe(IMPACT_LIMITS.defaultMaxNodes);
    expect(parsed.maxEdges).toBe(IMPACT_LIMITS.defaultMaxEdges);
  });

  it("rejects a request for more than the caps allow", () => {
    // Rejected, not clamped: being told the answer is complete when the server
    // shrank the question is worse than being refused.
    expect(() =>
      runImpactAnalysisRequestSchema.parse({ maxDepth: IMPACT_LIMITS.maxMaxDepth + 1 }),
    ).toThrow();
    expect(() =>
      runImpactAnalysisRequestSchema.parse({ maxNodes: IMPACT_LIMITS.maxMaxNodes + 1 }),
    ).toThrow();
    expect(() =>
      runImpactAnalysisRequestSchema.parse({ maxEdges: IMPACT_LIMITS.maxMaxEdges + 1 }),
    ).toThrow();
  });

  it("rejects limits below one", () => {
    expect(() => runImpactAnalysisRequestSchema.parse({ maxDepth: 0 })).toThrow();
    expect(() => runImpactAnalysisRequestSchema.parse({ maxNodes: -1 })).toThrow();
  });

  it("rejects anything the engine does not accept", () => {
    expect(() => runImpactAnalysisRequestSchema.parse({ roots: ["req1"] })).toThrow();
    expect(() => runImpactAnalysisRequestSchema.parse({ projectId: "proj1" })).toThrow();
    expect(() => runImpactAnalysisRequestSchema.parse({ engineVersion: "2" })).toThrow();
  });

  it("never permits a walk deeper than the graph engine itself allows", () => {
    // The impact caps must stay inside the graph's own ceilings, or the graph
    // would reject the traversal the engine asks it for.
    expect(IMPACT_LIMITS.maxMaxDepth).toBeLessThanOrEqual(5);
    expect(IMPACT_LIMITS.maxMaxNodes).toBeLessThanOrEqual(500);
    expect(IMPACT_LIMITS.maxMaxEdges).toBeLessThanOrEqual(2000);
  });
});

describe("deterministic ordering", () => {
  function finding(overrides: Partial<ImpactFinding>): ImpactFinding {
    return {
      id: "f1",
      analysisId: "a1",
      rootId: "r1",
      node: { type: "REQUIREMENT", id: "req1" },
      identifier: "REQ-001",
      label: "Requirement",
      classification: "DOWNSTREAM",
      status: "POTENTIALLY_AFFECTED",
      depth: 1,
      basis: [],
      path: [],
      alternatePathCount: 0,
      createdAt: new Date(0),
      ...overrides,
    };
  }

  it("leads with the strongest classification", () => {
    const sorted = [
      finding({ classification: "UPSTREAM_CONTEXT", node: { type: "RISK", id: "r" } }),
      finding({ classification: "DIRECT", node: { type: "REQUIREMENT", id: "a" } }),
      finding({ classification: "DOWNSTREAM", node: { type: "DESIGN_ITEM", id: "d" } }),
      finding({ classification: "CROSS_DOMAIN", node: { type: "DESIGN_ITEM", id: "c" } }),
    ].sort(compareFindings);

    expect(sorted.map((f) => f.classification)).toEqual([
      "DIRECT",
      "CROSS_DOMAIN",
      "DOWNSTREAM",
      "UPSTREAM_CONTEXT",
    ]);
  });

  it("then orders by depth, then node type, then id", () => {
    const sorted = [
      finding({ depth: 2, node: { type: "REQUIREMENT", id: "b" } }),
      finding({ depth: 1, node: { type: "REQUIREMENT", id: "z" } }),
      finding({ depth: 1, node: { type: "DESIGN_ITEM", id: "a" } }),
      finding({ depth: 1, node: { type: "REQUIREMENT", id: "a" } }),
    ].sort(compareFindings);

    expect(sorted.map((f) => `${f.depth}:${f.node.type}:${f.node.id}`)).toEqual([
      "1:DESIGN_ITEM:a",
      "1:REQUIREMENT:a",
      "1:REQUIREMENT:z",
      "2:REQUIREMENT:b",
    ]);
  });

  it("is a total order — no pair compares equal unless it is the same node", () => {
    const a = finding({ node: { type: "REQUIREMENT", id: "a" } });
    const b = finding({ node: { type: "REQUIREMENT", id: "b" } });

    expect(compareFindings(a, b)).toBeLessThan(0);
    expect(compareFindings(b, a)).toBeGreaterThan(0);
    expect(compareFindings(a, { ...a, id: "different-row-id" })).toBe(0);
  });
});

describe("the analysis signature", () => {
  function report(findings: ImpactFinding[]): ImpactAnalysisReport {
    return {
      analysis: {
        id: "a1",
        projectId: "p1",
        changeRequestId: "c1",
        status: "COMPLETED",
        engineVersion: IMPACT_ENGINE_VERSION,
        sourceFingerprint: "fp",
        failureReason: null,
        startedAt: new Date(0),
        completedAt: new Date(1),
        requestedById: "u1",
        summary: {
          declaredImpacts: 1,
          roots: 1,
          findings: findings.length,
          direct: 1,
          downstream: 0,
          crossDomain: 0,
          upstreamContext: 0,
          unknown: 0,
          notEvaluated: 0,
        },
        limits: {
          maxDepth: 3,
          maxNodes: 200,
          maxEdges: 1000,
          truncated: false,
          truncatedBy: null,
        },
      },
      freshness: "CURRENT",
      roots: [
        {
          id: "r1",
          analysisId: "a1",
          node: { type: "REQUIREMENT", id: "req1" },
          identifier: "REQ-001",
          label: "Requirement",
          resolved: true,
          declaredImpactId: "imp1",
        },
      ],
      findings,
    };
  }

  const base: ImpactFinding = {
    id: "f1",
    analysisId: "a1",
    rootId: "r1",
    node: { type: "DESIGN_ITEM", id: "di1" },
    identifier: "DI-001",
    label: "Chamber",
    classification: "CROSS_DOMAIN",
    status: "POTENTIALLY_AFFECTED",
    depth: 1,
    basis: ["GRAPH_PROPAGATION"],
    path: [
      {
        edgeType: "REQUIREMENT_ALLOCATED_TO_DESIGN",
        relationshipId: "rel1",
        traversed: "FORWARD",
        from: { type: "REQUIREMENT", id: "req1" },
        to: { type: "DESIGN_ITEM", id: "di1" },
      },
    ],
    alternatePathCount: 0,
    createdAt: new Date(0),
  };

  it("ignores row ids and timestamps, which differ between equivalent runs", () => {
    const first = analysisSignature(report([base]));
    const second = analysisSignature(
      report([{ ...base, id: "different", createdAt: new Date(99_999) }]),
    );

    expect(second).toBe(first);
  });

  it("ignores the order findings happen to arrive in", () => {
    const other: ImpactFinding = {
      ...base,
      id: "f2",
      node: { type: "VERIFICATION_ACTIVITY", id: "va1" },
      depth: 2,
    };

    expect(analysisSignature(report([base, other]))).toBe(
      analysisSignature(report([other, base])),
    );
  });

  it("changes when a classification changes", () => {
    expect(analysisSignature(report([{ ...base, classification: "DOWNSTREAM" }]))).not.toBe(
      analysisSignature(report([base])),
    );
  });

  it("changes when the provenance path changes", () => {
    const rerouted: ImpactFinding = {
      ...base,
      path: [{ ...base.path[0]!, relationshipId: "rel-different" }],
    };

    // Same object, different reason for being there — not the same conclusion.
    expect(analysisSignature(report([rerouted]))).not.toBe(analysisSignature(report([base])));
  });

  it("changes when the engine version changes", () => {
    const original = report([base]);
    const upgraded: ImpactAnalysisReport = {
      ...original,
      // Deliberately not a literal: it has to differ from whatever the current
      // version is, so bumping the engine cannot quietly make this a no-op.
      analysis: { ...original.analysis, engineVersion: `${IMPACT_ENGINE_VERSION}-next` },
    };

    expect(analysisSignature(upgraded)).not.toBe(analysisSignature(original));
  });
});
