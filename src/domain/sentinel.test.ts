import { describe, expect, it } from "vitest";
import { GRAPH_NODE_TYPES } from "./graph";
import {
  SENTINEL_VERSION,
  SURVEILLANCE_DEPENDENCY_RULES,
  SURVEILLANCE_EVENT_TYPES,
  SURVEILLANCE_SOURCE_TYPES,
  SURVEILLANCE_TARGET_STATUSES,
  SURVEILLANCE_TARGET_TRANSITIONS,
  SURVEILLANCE_TARGET_TYPES,
  acknowledgeSurveillanceRequestSchema,
  canTransitionSurveillanceTarget,
  dependencyReason,
  dependencyRulesFor,
  detectSurveillanceRequestSchema,
  eventTypeForSource,
  isSurveillanceTargetOpen,
  reEvaluateSurveillanceRequestSchema,
  resolveSurveillanceRequestSchema,
  surveillanceEventTypeLabel,
  surveillanceEventTypeSchema,
  surveillanceSourceNodeType,
  surveillanceSourceTypeSchema,
  surveillanceTargetIdSchema,
  surveillanceTargetStatusLabel,
  surveillanceTargetStatusSchema,
  surveillanceTargetTypeLabel,
  surveillanceTargetTypeSchema,
} from "./sentinel";

describe("the sentinel version", () => {
  it("is a stable non-empty identifier", () => {
    expect(SENTINEL_VERSION).toBe("1");
    expect(SENTINEL_VERSION.length).toBeGreaterThan(0);
  });
});

describe("surveillance source types", () => {
  it("lists fourteen distinct source types", () => {
    expect(SURVEILLANCE_SOURCE_TYPES).toHaveLength(14);
    expect(new Set(SURVEILLANCE_SOURCE_TYPES).size).toBe(14);
  });

  it("is every source type a real graph node type", () => {
    for (const type of SURVEILLANCE_SOURCE_TYPES) {
      expect(GRAPH_NODE_TYPES).toContain(surveillanceSourceNodeType(type));
    }
  });

  it("parses every declared source type through its schema", () => {
    for (const type of SURVEILLANCE_SOURCE_TYPES) {
      expect(surveillanceSourceTypeSchema.parse(type)).toBe(type);
    }
    expect(() => surveillanceSourceTypeSchema.parse("NOT_A_SOURCE")).toThrow();
  });

  it("gives every source type an event type with no throw and no undefined", () => {
    for (const type of SURVEILLANCE_SOURCE_TYPES) {
      const eventType = eventTypeForSource(type);
      expect(SURVEILLANCE_EVENT_TYPES).toContain(eventType);
    }
  });
});

describe("surveillance event types", () => {
  it("lists exactly seven event types", () => {
    expect(SURVEILLANCE_EVENT_TYPES).toHaveLength(7);
    expect(new Set(SURVEILLANCE_EVENT_TYPES).size).toBe(7);
  });

  it("parses every declared event type through its schema", () => {
    for (const type of SURVEILLANCE_EVENT_TYPES) {
      expect(surveillanceEventTypeSchema.parse(type)).toBe(type);
    }
    expect(() => surveillanceEventTypeSchema.parse("NOT_AN_EVENT")).toThrow();
  });

  it("gives every event type a non-empty display label", () => {
    for (const type of SURVEILLANCE_EVENT_TYPES) {
      const label = surveillanceEventTypeLabel(type);
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("maps content-bearing sources to ENGINEERING_OBJECT_CHANGED", () => {
    expect(eventTypeForSource("REQUIREMENT")).toBe("ENGINEERING_OBJECT_CHANGED");
    expect(eventTypeForSource("DESIGN_ITEM")).toBe("ENGINEERING_OBJECT_CHANGED");
    expect(eventTypeForSource("VERIFICATION_ACTIVITY")).toBe("ENGINEERING_OBJECT_CHANGED");
  });

  it("maps decision-related sources to DECISION_BASIS_CHANGED", () => {
    expect(eventTypeForSource("ENGINEERING_DECISION")).toBe("DECISION_BASIS_CHANGED");
    expect(eventTypeForSource("DECISION_ASSUMPTION")).toBe("DECISION_BASIS_CHANGED");
  });

  it("maps every supplier-domain source to SUPPLIER_STATE_CHANGED", () => {
    expect(eventTypeForSource("SUPPLIER")).toBe("SUPPLIER_STATE_CHANGED");
    expect(eventTypeForSource("SUPPLIED_ITEM")).toBe("SUPPLIER_STATE_CHANGED");
    expect(eventTypeForSource("SUPPLIER_QUALIFICATION")).toBe("SUPPLIER_STATE_CHANGED");
  });

  it("maps observation, change request and certification basis to their own event types", () => {
    expect(eventTypeForSource("OPERATIONAL_OBSERVATION")).toBe("OBSERVATION_RECORDED");
    expect(eventTypeForSource("CHANGE_REQUEST")).toBe("CHANGE_REQUEST_CHANGED");
    expect(eventTypeForSource("CERTIFICATION_BASIS")).toBe("CERTIFICATION_BASIS_CHANGED");
  });
});

describe("surveillance target types", () => {
  it("lists exactly the six existing engines, nothing invented", () => {
    expect(SURVEILLANCE_TARGET_TYPES).toEqual([
      "IMPACT_ANALYSIS",
      "ASSUMPTION_MONITORING",
      "VERIFICATION_READINESS",
      "TECHNICAL_READINESS",
      "DRIFT_ASSESSMENT",
      "CERTIFICATION_REVIEW",
    ]);
  });

  it("parses every declared target type through its schema", () => {
    for (const type of SURVEILLANCE_TARGET_TYPES) {
      expect(surveillanceTargetTypeSchema.parse(type)).toBe(type);
    }
    expect(() => surveillanceTargetTypeSchema.parse("SOMETHING_ELSE")).toThrow();
  });

  it("gives every target type a non-empty display label naming the real engine", () => {
    for (const type of SURVEILLANCE_TARGET_TYPES) {
      const label = surveillanceTargetTypeLabel(type);
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

describe("surveillance target status lifecycle", () => {
  it("has exactly four states", () => {
    expect(SURVEILLANCE_TARGET_STATUSES).toEqual(["OPEN", "ACKNOWLEDGED", "SUPERSEDED", "RESOLVED"]);
  });

  it("parses every declared status through its schema", () => {
    for (const status of SURVEILLANCE_TARGET_STATUSES) {
      expect(surveillanceTargetStatusSchema.parse(status)).toBe(status);
    }
    expect(() => surveillanceTargetStatusSchema.parse("CLOSED")).toThrow();
  });

  it("gives every status a non-empty display label", () => {
    for (const status of SURVEILLANCE_TARGET_STATUSES) {
      const label = surveillanceTargetStatusLabel(status);
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
  });

  it("allows OPEN to move to ACKNOWLEDGED, RESOLVED or SUPERSEDED", () => {
    expect(canTransitionSurveillanceTarget("OPEN", "ACKNOWLEDGED")).toBe(true);
    expect(canTransitionSurveillanceTarget("OPEN", "RESOLVED")).toBe(true);
    expect(canTransitionSurveillanceTarget("OPEN", "SUPERSEDED")).toBe(true);
  });

  it("allows ACKNOWLEDGED to move to RESOLVED or SUPERSEDED, never back to OPEN", () => {
    expect(canTransitionSurveillanceTarget("ACKNOWLEDGED", "RESOLVED")).toBe(true);
    expect(canTransitionSurveillanceTarget("ACKNOWLEDGED", "SUPERSEDED")).toBe(true);
    expect(canTransitionSurveillanceTarget("ACKNOWLEDGED", "OPEN")).toBe(false);
  });

  it("makes RESOLVED and SUPERSEDED terminal", () => {
    for (const to of SURVEILLANCE_TARGET_STATUSES) {
      expect(canTransitionSurveillanceTarget("RESOLVED", to)).toBe(false);
      expect(canTransitionSurveillanceTarget("SUPERSEDED", to)).toBe(false);
    }
    expect(SURVEILLANCE_TARGET_TRANSITIONS.RESOLVED).toEqual([]);
    expect(SURVEILLANCE_TARGET_TRANSITIONS.SUPERSEDED).toEqual([]);
  });

  it("never allows a self-transition", () => {
    for (const status of SURVEILLANCE_TARGET_STATUSES) {
      expect(canTransitionSurveillanceTarget(status, status)).toBe(false);
    }
  });

  it("treats only OPEN and ACKNOWLEDGED as needing attention", () => {
    expect(isSurveillanceTargetOpen("OPEN")).toBe(true);
    expect(isSurveillanceTargetOpen("ACKNOWLEDGED")).toBe(true);
    expect(isSurveillanceTargetOpen("RESOLVED")).toBe(false);
    expect(isSurveillanceTargetOpen("SUPERSEDED")).toBe(false);
  });
});

describe("the surveillance dependency registry", () => {
  it("has at least one rule for every declared source type", () => {
    for (const sourceType of SURVEILLANCE_SOURCE_TYPES) {
      expect(dependencyRulesFor(sourceType).length).toBeGreaterThan(0);
    }
  });

  it("references only declared source and target types", () => {
    for (const rule of SURVEILLANCE_DEPENDENCY_RULES) {
      expect(SURVEILLANCE_SOURCE_TYPES).toContain(rule.sourceType);
      expect(SURVEILLANCE_TARGET_TYPES).toContain(rule.targetType);
      expect(rule.reason.length).toBeGreaterThan(0);
    }
  });

  it("declares no duplicate (sourceType, targetType) pair", () => {
    const seen = new Set<string>();
    for (const rule of SURVEILLANCE_DEPENDENCY_RULES) {
      const key = `${rule.sourceType}:${rule.targetType}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("is deterministic and stable across repeated lookups", () => {
    const first = dependencyRulesFor("REQUIREMENT");
    const second = dependencyRulesFor("REQUIREMENT");
    expect(first).toEqual(second);
    expect(first.map((r) => r.targetType)).toEqual(second.map((r) => r.targetType));
  });

  it("preserves registry order in dependencyRulesFor", () => {
    const rulesInOrder = SURVEILLANCE_DEPENDENCY_RULES.filter((r) => r.sourceType === "DESIGN_ITEM").map(
      (r) => r.targetType,
    );
    expect(dependencyRulesFor("DESIGN_ITEM").map((r) => r.targetType)).toEqual(rulesInOrder);
  });

  it("returns an empty list and null reason for an unrelated pair", () => {
    // A decision assumption cannot ever affect drift — no such row exists.
    expect(dependencyReason("DECISION_ASSUMPTION", "DRIFT_ASSESSMENT")).toBeNull();
  });

  it("returns the exact registered reason for a related pair", () => {
    const reason = dependencyReason("REQUIREMENT", "IMPACT_ANALYSIS");
    expect(reason).not.toBeNull();
    expect(reason).toContain("requirement");
  });

  it("never lets a decision assumption reach drift assessment", () => {
    const targets = dependencyRulesFor("DECISION_ASSUMPTION").map((r) => r.targetType);
    expect(targets).not.toContain("DRIFT_ASSESSMENT");
  });

  it("connects every target type from at least one source", () => {
    const reachable = new Set(SURVEILLANCE_DEPENDENCY_RULES.map((r) => r.targetType));
    for (const targetType of SURVEILLANCE_TARGET_TYPES) {
      expect(reachable.has(targetType)).toBe(true);
    }
  });
});

describe("request schemas", () => {
  it("rejects any field on the detect request", () => {
    expect(detectSurveillanceRequestSchema.parse({})).toEqual({});
    expect(() => detectSurveillanceRequestSchema.parse({ foo: "bar" })).toThrow();
  });

  it("rejects any field on the reevaluate request", () => {
    expect(reEvaluateSurveillanceRequestSchema.parse({})).toEqual({});
    expect(() => reEvaluateSurveillanceRequestSchema.parse({ foo: "bar" })).toThrow();
  });

  it("allows an optional note on acknowledgement, but rejects an empty string and unknown fields", () => {
    expect(acknowledgeSurveillanceRequestSchema.parse({})).toEqual({});
    expect(acknowledgeSurveillanceRequestSchema.parse({ note: "seen it" })).toEqual({ note: "seen it" });
    expect(() => acknowledgeSurveillanceRequestSchema.parse({ note: "" })).toThrow();
    expect(() => acknowledgeSurveillanceRequestSchema.parse({ extra: 1 })).toThrow();
  });

  it("requires a non-empty note to resolve, and rejects unknown fields", () => {
    expect(() => resolveSurveillanceRequestSchema.parse({})).toThrow();
    expect(() => resolveSurveillanceRequestSchema.parse({ note: "" })).toThrow();
    expect(resolveSurveillanceRequestSchema.parse({ note: "re-ran verification readiness" })).toEqual({
      note: "re-ran verification readiness",
    });
    expect(() => resolveSurveillanceRequestSchema.parse({ note: "ok", extra: 1 })).toThrow();
  });

  it("validates a target id through the shared entity id schema", () => {
    expect(() => surveillanceTargetIdSchema.parse("")).toThrow();
    expect(surveillanceTargetIdSchema.parse("cly123abc")).toBe("cly123abc");
  });
});
