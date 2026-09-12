import { describe, expect, it } from "vitest";
import { GRAPH_NODE_TYPES, type GraphNodeType } from "./graph";
import {
  TRACEABILITY_SELECTABLE_NODE_TYPES,
  TRACEABILITY_UNSELECTABLE_REASONS,
  graphEdgeTypeLabel,
  graphNodeTypeLabel,
  humanizeGraphToken,
  traceabilityDetailRoute,
  traceabilityNodeTypeSchema,
} from "./traceability";

describe("selectable node types", () => {
  it("partitions every registered node type into exactly one of selectable or documented-unselectable", () => {
    const selectable = new Set<string>(TRACEABILITY_SELECTABLE_NODE_TYPES);
    const unselectable = new Set(Object.keys(TRACEABILITY_UNSELECTABLE_REASONS));

    for (const type of GRAPH_NODE_TYPES) {
      const inSelectable = selectable.has(type);
      const inUnselectable = unselectable.has(type);
      expect(inSelectable || inUnselectable, `${type} is in neither list`).toBe(true);
      expect(inSelectable && inUnselectable, `${type} is in both lists`).toBe(false);
    }

    // No stale entries naming a type the registry no longer has.
    const allTypes = new Set<string>(GRAPH_NODE_TYPES);
    for (const type of selectable) expect(allTypes).toContain(type);
    for (const type of unselectable) expect(allTypes).toContain(type);
  });

  it("gives every unselectable reason real, non-trivial text", () => {
    for (const reason of Object.values(TRACEABILITY_UNSELECTABLE_REASONS)) {
      expect(typeof reason).toBe("string");
      expect((reason as string).length).toBeGreaterThan(20);
    }
  });

  it("has no duplicate entries in the selectable list", () => {
    expect(new Set(TRACEABILITY_SELECTABLE_NODE_TYPES).size).toBe(
      TRACEABILITY_SELECTABLE_NODE_TYPES.length,
    );
  });
});

describe("traceabilityNodeTypeSchema", () => {
  it("accepts every selectable type", () => {
    for (const type of TRACEABILITY_SELECTABLE_NODE_TYPES) {
      expect(traceabilityNodeTypeSchema.parse(type)).toBe(type);
    }
  });

  it("rejects a real graph node type that is not selectable as a root", () => {
    expect(() => traceabilityNodeTypeSchema.parse("PROJECT")).toThrow();
    expect(() => traceabilityNodeTypeSchema.parse("DECISION_ALTERNATIVE")).toThrow();
  });

  it("rejects garbage input", () => {
    expect(() => traceabilityNodeTypeSchema.parse("NOT_A_TYPE")).toThrow();
    expect(() => traceabilityNodeTypeSchema.parse(123)).toThrow();
    expect(() => traceabilityNodeTypeSchema.parse(null)).toThrow();
  });
});

describe("humanizeGraphToken", () => {
  it("formats node type constants", () => {
    expect(graphNodeTypeLabel("RISK")).toBe("Risk");
    expect(graphNodeTypeLabel("ENGINEERING_DECISION")).toBe("Engineering decision");
    expect(graphNodeTypeLabel("COMPLIANCE_ITEM")).toBe("Compliance item");
    expect(graphNodeTypeLabel("CERTIFICATION_REVIEW_FINDING")).toBe("Certification review finding");
  });

  it("formats edge type constants", () => {
    expect(graphEdgeTypeLabel("RISK_AFFECTS_REQUIREMENT")).toBe("Risk affects requirement");
    expect(graphEdgeTypeLabel("CHANGE_IMPACTS_OBJECT")).toBe("Change impacts object");
    expect(graphEdgeTypeLabel("COMPLIANCE_ITEM_LINKED_TO_OBJECT")).toBe(
      "Compliance item linked to object",
    );
  });

  it("is derived from the type name alone, so every node and edge type produces some label", () => {
    for (const type of GRAPH_NODE_TYPES) {
      expect(humanizeGraphToken(type).length).toBeGreaterThan(0);
    }
  });
});

describe("traceabilityDetailRoute", () => {
  const projectId = "proj1aaaaaaaaaaaaaaaaaa";
  const id = "obj1aaaaaaaaaaaaaaaaaaaa";

  it("returns the real dynamic route for types with a standalone detail page", () => {
    expect(traceabilityDetailRoute("REQUIREMENT", projectId, id)).toBe(
      `/projects/${projectId}/requirements/${id}`,
    );
    expect(traceabilityDetailRoute("RISK", projectId, id)).toBe(`/projects/${projectId}/risks/${id}`);
    expect(traceabilityDetailRoute("ISSUE", projectId, id)).toBe(`/projects/${projectId}/issues/${id}`);
    expect(traceabilityDetailRoute("CHANGE_REQUEST", projectId, id)).toBe(
      `/projects/${projectId}/changes/${id}`,
    );
    expect(traceabilityDetailRoute("COMPLIANCE_ITEM", projectId, id)).toBe(
      `/projects/${projectId}/certification/items/${id}`,
    );
    // Evidence gained a real detail page and a real project-wide listing in
    // the Evidence Management capability, after this map was first built —
    // this was a stale gap, closed here rather than carried forward.
    expect(traceabilityDetailRoute("EVIDENCE", projectId, id)).toBe(
      `/projects/${projectId}/evidence/${id}`,
    );
  });

  it("returns null for a selectable root that has no standalone detail page", () => {
    // Selectability and having a detail page are independent — these three
    // are real picker options with no dynamic route to open.
    expect(traceabilityDetailRoute("CERTIFICATION_BASIS", projectId, id)).toBeNull();
    expect(traceabilityDetailRoute("CERTIFICATION_REVIEW", projectId, id)).toBeNull();
    expect(traceabilityDetailRoute("OPERATIONAL_OBSERVATION", projectId, id)).toBeNull();
    expect(traceabilityDetailRoute("DRIFT_ASSESSMENT", projectId, id)).toBeNull();
  });

  it("returns null for an unselectable, unreachable-as-root type", () => {
    expect(traceabilityDetailRoute("DECISION_ALTERNATIVE", projectId, id)).toBeNull();
    expect(traceabilityDetailRoute("DRIFT_FINDING", projectId, id)).toBeNull();
    expect(traceabilityDetailRoute("PROJECT", projectId, id)).toBeNull();
  });

  it("never returns a route for a type without a mapping entry, for the full registry", () => {
    const mapped: GraphNodeType[] = [
      "REQUIREMENT",
      "STAKEHOLDER_NEED",
      "DESIGN_ITEM",
      "VERIFICATION_ACTIVITY",
      "ENGINEERING_DECISION",
      "CHANGE_REQUEST",
      "RISK",
      "ISSUE",
      "SUPPLIER",
      "SUPPLIED_ITEM",
      "SUPPLIER_QUALIFICATION",
      "ENGINEERING_BASELINE",
      "COMPLIANCE_ITEM",
      "EVIDENCE",
    ];
    for (const type of GRAPH_NODE_TYPES) {
      const route = traceabilityDetailRoute(type, projectId, id);
      if (mapped.includes(type)) {
        expect(route).not.toBeNull();
      } else {
        expect(route).toBeNull();
      }
    }
  });
});
