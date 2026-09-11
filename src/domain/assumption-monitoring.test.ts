import { describe, expect, it } from "vitest";
import {
  ASSUMPTION_BASIS_POLICY,
  ASSUMPTION_MONITORING_FINDINGS,
  ASSUMPTION_MONITORING_STATUSES,
  ASSUMPTION_MONITORING_VERSION,
  ASSUMPTION_STATUSES,
  DECISION_BASIS_EDGE_TYPES,
  GRAPH_EDGE_DEFINITIONS,
  REQUIREMENT_BASIS_EDGE_TYPES,
  type AssumptionBasis,
  type BasisObject,
  basisComponentFor,
  basisFingerprint,
  componentFingerprint,
  diffBasis,
  excludedBasisEdgeTypes,
  findingFor,
  hasExplicitJudgement,
  isBasisMovement,
  monitoringStatusFor,
  reviewAssumptionRequestSchema,
  strongestFinding,
} from "@/domain";

const ASSUMPTION_ID = "asm1aaaaaaaaaaaaaaaaaaa";

function object(overrides: Partial<BasisObject> = {}): BasisObject {
  return {
    type: "REQUIREMENT",
    id: "req1",
    identifier: "REQ-001",
    label: "Maximum chamber pressure",
    revision: "2026-01-01T00:00:00.000Z",
    component: "LINKED",
    ...overrides,
  };
}

function basis(objects: BasisObject[], relationshipIds: string[] = []): AssumptionBasis {
  return { assumptionId: ASSUMPTION_ID, resolved: true, objects, relationshipIds };
}

describe("the monitoring vocabulary", () => {
  it("never contains a word that asserts the assumption is false", () => {
    // The engine can report that a basis moved. It cannot report a verdict on
    // the hypothesis, and no status name may suggest otherwise.
    const vocabulary = [...ASSUMPTION_MONITORING_STATUSES, ...ASSUMPTION_MONITORING_FINDINGS].join(
      " ",
    );

    expect(vocabulary).not.toMatch(/INVALID|FALSE|BROKEN|VIOLATED|FAILED/);
  });

  it("carries no score, confidence or probability", () => {
    const vocabulary = [...ASSUMPTION_MONITORING_STATUSES, ...ASSUMPTION_MONITORING_FINDINGS].join(
      " ",
    );

    expect(vocabulary).not.toMatch(/SCORE|CONFIDENCE|PROBABILITY|LIKELIHOOD|SEVERITY/);
  });

  it("records which rule set produced a verdict", () => {
    expect(ASSUMPTION_MONITORING_VERSION).toBe("1");
  });

  it("keeps NOT_EVALUATED distinct from CURRENT", () => {
    // "Nobody has looked" is not the same claim as "the basis is unchanged".
    expect(ASSUMPTION_MONITORING_STATUSES).toContain("NOT_EVALUATED");
    expect(ASSUMPTION_MONITORING_STATUSES).toContain("CURRENT");
  });
});

describe("finding precedence", () => {
  it("puts the decision above everything else", () => {
    expect(
      strongestFinding(["LINKED_OBJECT_CHANGED", "EVIDENCE_CHANGED", "DECISION_BASIS_CHANGED"]),
    ).toBe("DECISION_BASIS_CHANGED");
  });

  it("puts evidence above other linked objects", () => {
    expect(strongestFinding(["LINKED_OBJECT_CHANGED", "EVIDENCE_CHANGED"])).toBe(
      "EVIDENCE_CHANGED",
    );
  });

  it("puts any movement above no change", () => {
    expect(strongestFinding(["NO_CHANGE", "LINKED_OBJECT_CHANGED"])).toBe(
      "LINKED_OBJECT_CHANGED",
    );
  });

  it("returns no change for an empty set", () => {
    expect(strongestFinding([])).toBe("NO_CHANGE");
  });

  it("is deterministic regardless of input order", () => {
    const findings = ["EVIDENCE_CHANGED", "DECISION_BASIS_CHANGED", "LINKED_OBJECT_CHANGED"] as const;

    expect(strongestFinding(findings)).toBe(strongestFinding([...findings].reverse()));
  });

  it("distinguishes real movement from unknown and no change", () => {
    expect(isBasisMovement("DECISION_BASIS_CHANGED")).toBe(true);
    expect(isBasisMovement("EVIDENCE_CHANGED")).toBe(true);
    expect(isBasisMovement("LINKED_OBJECT_CHANGED")).toBe(true);
    // Not knowing is not the same as detecting a change.
    expect(isBasisMovement("UNKNOWN")).toBe(false);
    expect(isBasisMovement("NO_CHANGE")).toBe(false);
  });
});

describe("the monitoring verdict", () => {
  const settled = { hasBaseline: true, basisResolved: true };

  it("says current when nothing moved", () => {
    expect(monitoringStatusFor("NO_CHANGE", "VALIDATED", settled)).toBe("CURRENT");
  });

  it("demands review when the basis moved under an established judgement", () => {
    for (const status of ["VALIDATED", "INVALIDATED", "ACTIVE"] as const) {
      expect(monitoringStatusFor("EVIDENCE_CHANGED", status, settled)).toBe("REVIEW_REQUIRED");
    }
  });

  it("only notes the change when nobody had judged the assumption", () => {
    // Nothing is standing on the old basis, so there is nothing to re-confirm.
    expect(monitoringStatusFor("EVIDENCE_CHANGED", "UNKNOWN", settled)).toBe("BASIS_CHANGED");
  });

  it("treats a first evaluation as a baseline, not as a change", () => {
    expect(
      monitoringStatusFor("UNKNOWN", "VALIDATED", { hasBaseline: false, basisResolved: true }),
    ).toBe("CURRENT");
  });

  it("asks for a look when the basis could not be read at all", () => {
    // Not a change, and not reassurance either.
    expect(
      monitoringStatusFor("UNKNOWN", "VALIDATED", { hasBaseline: true, basisResolved: false }),
    ).toBe("REVIEW_REQUIRED");
  });

  it("never returns an assumption status", () => {
    // The function's whole return type is monitoring vocabulary. Belt and
    // braces: assert none of the assumption statuses can come out of it.
    for (const assumptionStatus of ASSUMPTION_STATUSES) {
      for (const finding of ASSUMPTION_MONITORING_FINDINGS) {
        const verdict = monitoringStatusFor(finding, assumptionStatus, settled);
        expect(ASSUMPTION_STATUSES).not.toContain(verdict);
      }
    }
  });

  it("never turns a changed basis into an invalidation", () => {
    // The single most important property in this module.
    for (const finding of ASSUMPTION_MONITORING_FINDINGS) {
      const verdict = monitoringStatusFor(finding, "VALIDATED", settled);
      expect(verdict).not.toBe("INVALIDATED");
      expect(["CURRENT", "BASIS_CHANGED", "REVIEW_REQUIRED"]).toContain(verdict);
    }
  });

  it("treats only UNKNOWN as the absence of a judgement", () => {
    expect(hasExplicitJudgement("UNKNOWN")).toBe(false);
    expect(hasExplicitJudgement("ACTIVE")).toBe(true);
    expect(hasExplicitJudgement("VALIDATED")).toBe(true);
    expect(hasExplicitJudgement("INVALIDATED")).toBe(true);
  });
});

describe("the basis policy", () => {
  it("only names edges the graph actually has", () => {
    for (const rule of ASSUMPTION_BASIS_POLICY) {
      expect(GRAPH_EDGE_DEFINITIONS[rule.type]).toBeDefined();
    }
  });

  it("explains the engineering reasoning for every included edge", () => {
    for (const rule of ASSUMPTION_BASIS_POLICY) {
      expect(rule.rationale.length).toBeGreaterThan(30);
    }
  });

  it("names each edge only once", () => {
    const types = ASSUMPTION_BASIS_POLICY.map((rule) => rule.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it("excludes a decision's own memory records", () => {
    // A sibling assumption or a rejected alternative is a record *of* the
    // decision, not something this assumption stands on. Including them would
    // mean editing one assumption flagged every other one.
    const excluded = excludedBasisEdgeTypes();

    expect(excluded).toContain("DECISION_HAS_ASSUMPTION");
    expect(excluded).toContain("DECISION_HAS_ALTERNATIVE");
    expect(excluded).toContain("DECISION_HAS_EXPECTATION");
  });

  it("excludes change requests and approvals", () => {
    const excluded = excludedBasisEdgeTypes();

    expect(excluded).toContain("CHANGE_IMPACTS_OBJECT");
    expect(excluded).toContain("APPROVAL_RELATES_TO_OBJECT");
  });

  it("splits the walk into a decision hop and a requirement hop", () => {
    expect(DECISION_BASIS_EDGE_TYPES).toContain("REQUIREMENT_LINKED_TO_DECISION");
    expect(DECISION_BASIS_EDGE_TYPES).toContain("DECISION_HAS_EVIDENCE");
    expect(REQUIREMENT_BASIS_EDGE_TYPES).toContain("REQUIREMENT_VERIFIED_BY");
    expect(REQUIREMENT_BASIS_EDGE_TYPES).toContain("REQUIREMENT_ALLOCATED_TO_DESIGN");

    // Disjoint: each edge is walked at exactly one hop.
    const overlap = DECISION_BASIS_EDGE_TYPES.filter((type) =>
      REQUIREMENT_BASIS_EDGE_TYPES.includes(type),
    );
    expect(overlap).toEqual([]);
  });

  it("sorts both edge sets, so the walk is deterministic", () => {
    expect([...DECISION_BASIS_EDGE_TYPES]).toEqual([...DECISION_BASIS_EDGE_TYPES].sort());
    expect([...REQUIREMENT_BASIS_EDGE_TYPES]).toEqual([...REQUIREMENT_BASIS_EDGE_TYPES].sort());
  });

  it("files evidence edges under evidence and the rest under linked", () => {
    expect(basisComponentFor("DECISION_HAS_EVIDENCE")).toBe("EVIDENCE");
    expect(basisComponentFor("REQUIREMENT_HAS_EVIDENCE")).toBe("EVIDENCE");
    expect(basisComponentFor("REQUIREMENT_LINKED_TO_DECISION")).toBe("LINKED");
    expect(basisComponentFor("REQUIREMENT_VERIFIED_BY")).toBe("LINKED");
    // An excluded edge contributes nothing.
    expect(basisComponentFor("DECISION_HAS_ASSUMPTION")).toBeNull();
  });
});

describe("the basis fingerprint", () => {
  it("is deterministic for the same basis", () => {
    const a = basis([object()], ["rel1"]);
    const b = basis([object()], ["rel1"]);

    expect(basisFingerprint(b)).toBe(basisFingerprint(a));
  });

  it("does not depend on the order objects were resolved in", () => {
    const first = object({ id: "req1" });
    const second = object({ id: "req2" });

    expect(basisFingerprint(basis([first, second]))).toBe(
      basisFingerprint(basis([second, first])),
    );
  });

  it("changes when a basis object is revised", () => {
    const before = basis([object({ revision: "2026-01-01T00:00:00.000Z" })]);
    const after = basis([object({ revision: "2026-02-01T00:00:00.000Z" })]);

    expect(basisFingerprint(after)).not.toBe(basisFingerprint(before));
  });

  it("changes when an object joins or leaves the basis", () => {
    const before = basis([object()]);
    const after = basis([object(), object({ id: "req2", identifier: "REQ-002" })]);

    expect(basisFingerprint(after)).not.toBe(basisFingerprint(before));
  });

  it("changes when a relationship is added or removed", () => {
    // Linking a requirement to the decision changes what the assumption stands
    // on even though no artifact was edited.
    const before = basis([object()], ["rel1"]);
    const after = basis([object()], ["rel1", "rel2"]);

    expect(basisFingerprint(after)).not.toBe(basisFingerprint(before));
  });

  it("is assumption-specific, so two assumptions never share a fingerprint", () => {
    const shared = [object()];
    const mine = { ...basis(shared), assumptionId: "asm-a" };
    const theirs = { ...basis(shared), assumptionId: "asm-b" };

    expect(basisFingerprint(theirs)).not.toBe(basisFingerprint(mine));
  });

  it("ignores an object that is not in the basis at all", () => {
    // The point of an assumption-specific fingerprint: an unrelated project
    // edit cannot appear here, because it never enters the basis.
    const unchanged = basis([object()]);

    expect(basisFingerprint(unchanged)).toBe(basisFingerprint(basis([object()])));
  });

  it("contains no timestamp of its own", () => {
    // Fingerprinting "now" would make every evaluation look like a change.
    const fixed = basis([object()]);
    const first = basisFingerprint(fixed);

    expect(basisFingerprint(fixed)).toBe(first);
    expect(basisFingerprint(basis([object()]))).toBe(first);
  });

  it("attributes a change to the component it happened in", () => {
    const before = basis([
      object({ component: "EVIDENCE", type: "EVIDENCE", id: "ev1" }),
      object({ component: "LINKED", id: "req1" }),
    ]);
    const after = basis([
      object({ component: "EVIDENCE", type: "EVIDENCE", id: "ev1", revision: "2026-03-01T00:00:00.000Z" }),
      object({ component: "LINKED", id: "req1" }),
    ]);

    expect(componentFingerprint(after, "EVIDENCE")).not.toBe(
      componentFingerprint(before, "EVIDENCE"),
    );
    // The untouched component must not move, or the finding would be wrong.
    expect(componentFingerprint(after, "LINKED")).toBe(componentFingerprint(before, "LINKED"));
  });
});

describe("attributing a change", () => {
  const unchanged = { decision: "d1", evidence: "e1", linked: "l1" };

  it("reports unknown when there is nothing to compare against", () => {
    // A first evaluation. Saying "no change" would be a claim about a period
    // that does not exist.
    expect(findingFor(null, unchanged)).toBe("UNKNOWN");
  });

  it("reports no change when every component matches", () => {
    expect(findingFor(unchanged, unchanged)).toBe("NO_CHANGE");
  });

  it("names the decision when the decision moved", () => {
    expect(findingFor(unchanged, { ...unchanged, decision: "d2" })).toBe(
      "DECISION_BASIS_CHANGED",
    );
  });

  it("names evidence when evidence moved", () => {
    expect(findingFor(unchanged, { ...unchanged, evidence: "e2" })).toBe("EVIDENCE_CHANGED");
  });

  it("names linked objects when those moved", () => {
    expect(findingFor(unchanged, { ...unchanged, linked: "l2" })).toBe("LINKED_OBJECT_CHANGED");
  });

  it("follows precedence when several moved at once", () => {
    expect(findingFor(unchanged, { decision: "d2", evidence: "e2", linked: "l2" })).toBe(
      "DECISION_BASIS_CHANGED",
    );
    expect(findingFor(unchanged, { ...unchanged, evidence: "e2", linked: "l2" })).toBe(
      "EVIDENCE_CHANGED",
    );
  });
});

describe("explaining a change", () => {
  it("names the objects that were revised", () => {
    const before = [object({ id: "req1", revision: "2026-01-01T00:00:00.000Z" })];
    const after = [object({ id: "req1", revision: "2026-02-01T00:00:00.000Z" })];

    expect(diffBasis(before, after)).toEqual([
      { kind: "UPDATED", object: after[0] },
    ]);
  });

  it("names objects that joined and left", () => {
    const before = [object({ id: "req1" })];
    const after = [object({ id: "req2", identifier: "REQ-002" })];

    const changes = diffBasis(before, after);
    expect(changes.map((change) => [change.kind, change.object.id])).toEqual([
      ["ADDED", "req2"],
      ["REMOVED", "req1"],
    ]);
  });

  it("reports nothing when nothing moved", () => {
    expect(diffBasis([object()], [object()])).toEqual([]);
  });

  it("is deterministically ordered", () => {
    const before = [object({ id: "a" }), object({ id: "b" })];
    const after = [object({ id: "b" }), object({ id: "c" })];

    expect(diffBasis(before, after)).toEqual(diffBasis(before, [...after].reverse()));
  });

  it("carries the identifier, so a finding can name a real record", () => {
    const before = [object({ id: "req1", identifier: "REQ-104", revision: "a" })];
    const after = [object({ id: "req1", identifier: "REQ-104", revision: "b" })];

    expect(diffBasis(before, after)[0]?.object.identifier).toBe("REQ-104");
  });
});

describe("the review contract", () => {
  it("accepts a review that changes nothing", () => {
    // "I looked, and it still holds" is a real and common outcome.
    expect(reviewAssumptionRequestSchema.parse({})).toEqual({});
  });

  it("accepts a note and an explicit new status", () => {
    expect(
      reviewAssumptionRequestSchema.parse({ note: "Re-checked against TR-14.", status: "VALIDATED" }),
    ).toEqual({ note: "Re-checked against TR-14.", status: "VALIDATED" });
  });

  it("allows an engineer to invalidate — only an engineer", () => {
    expect(reviewAssumptionRequestSchema.parse({ status: "INVALIDATED" }).status).toBe(
      "INVALIDATED",
    );
  });

  it("rejects a reviewer supplied by the client", () => {
    // The reviewer is the session. Rejected outright rather than dropped, so an
    // attempt to sign someone else's name fails loudly.
    expect(() =>
      reviewAssumptionRequestSchema.parse({ reviewedById: "user9aaaaaaaaaaaaaaaa" }),
    ).toThrow();
    expect(() => reviewAssumptionRequestSchema.parse({ reviewer: "Ada" })).toThrow();
  });

  it("rejects an attempt to set the monitoring verdict directly", () => {
    expect(() =>
      reviewAssumptionRequestSchema.parse({ monitoringStatus: "CURRENT" }),
    ).toThrow();
    expect(() => reviewAssumptionRequestSchema.parse({ finding: "NO_CHANGE" })).toThrow();
  });

  it("rejects a status that is not an assumption status", () => {
    expect(() => reviewAssumptionRequestSchema.parse({ status: "BASIS_CHANGED" })).toThrow();
  });
});
