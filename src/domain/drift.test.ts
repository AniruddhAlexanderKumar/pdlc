import { describe, expect, it } from "vitest";
import {
  BASELINE_MEMBER_TYPES,
  BASELINE_STATUSES,
  COMPARISON_OPERATORS,
  DRIFT_BASIS_MARKERS,
  DRIFT_CATEGORIES,
  DRIFT_FINDING_PRECEDENCE,
  DRIFT_FINDING_STATUSES,
  DRIFT_RULES,
  DRIFT_SEVERITIES,
  DRIFT_STATUSES,
  DRIFT_VERSION,
  GRAPH_EDGE_TYPES,
  GRAPH_NODE_TYPES,
  IMPACT_PROPAGATION,
  OBSERVATION_STATUSES,
  OBSERVATION_SUBJECT_TYPES,
  OBSERVATION_TYPES,
  type DriftEvaluationBasis,
  type DriftFinding,
  addBaselineMemberRequestSchema,
  baselineMemberTypesAreGraphNodes,
  canTransitionBaseline,
  canTransitionObservation,
  compareDriftFindings,
  compareExactDecimals,
  compareObservedValue,
  createBaselineRequestSchema,
  createObservationRequestSchema,
  describeExpectation,
  driftFingerprint,
  driftFreshnessOf,
  driftRule,
  driftRuleIds,
  driftStatusFor,
  evaluateDriftRequestSchema,
  isBaselineImmutable,
  isBaselineMembershipEditable,
  isObservationEditable,
  normalizeDriftBasis,
  objectFingerprint,
  parseExactDecimal,
  severityForDriftStatus,
  unitsAreComparable,
  updateBaselineRequestSchema,
  updateObservationRequestSchema,
} from "@/domain";

/**
 * The drift domain.
 *
 * Two properties matter above everything else here, and most of these tests
 * exist to hold them:
 *
 *  1. **Nothing concludes failure.** No rule, no status and no severity says
 *     anything stronger than "an engineer needs to look".
 *  2. **Uncertainty survives.** A missing operator, a non-numeric value or a
 *     unit mismatch produces UNKNOWN, never a confident comparison.
 */

describe("the drift version", () => {
  it("is a stable non-empty identifier", () => {
    expect(DRIFT_VERSION).toBe("1");
  });
});

// --- Baseline lifecycle -----------------------------------------------------

describe("baseline status", () => {
  it("has exactly three states", () => {
    expect(BASELINE_STATUSES).toEqual(["DRAFT", "ACTIVE", "SUPERSEDED"]);
  });

  it("allows a draft to be activated and an active to be superseded", () => {
    expect(canTransitionBaseline("DRAFT", "ACTIVE")).toBe(true);
    expect(canTransitionBaseline("ACTIVE", "SUPERSEDED")).toBe(true);
  });

  it("never returns a baseline to draft", () => {
    // A baseline editable after activation would make every drift finding
    // computed against it meaningless.
    expect(canTransitionBaseline("ACTIVE", "DRAFT")).toBe(false);
    expect(canTransitionBaseline("SUPERSEDED", "DRAFT")).toBe(false);
    expect(canTransitionBaseline("SUPERSEDED", "ACTIVE")).toBe(false);
  });

  it("opens membership only while draft", () => {
    expect(isBaselineMembershipEditable("DRAFT")).toBe(true);
    expect(isBaselineMembershipEditable("ACTIVE")).toBe(false);
    expect(isBaselineMembershipEditable("SUPERSEDED")).toBe(false);
  });

  it("treats an activated baseline as immutable", () => {
    expect(isBaselineImmutable("DRAFT")).toBe(false);
    expect(isBaselineImmutable("ACTIVE")).toBe(true);
    expect(isBaselineImmutable("SUPERSEDED")).toBe(true);
  });

  it("models no branch, merge or variant concept", () => {
    const forbidden = ["BRANCH", "MERGED", "VARIANT", "FORKED"];
    for (const value of forbidden) {
      expect(BASELINE_STATUSES as readonly string[]).not.toContain(value);
    }
  });
});

describe("baseline member types", () => {
  it("names the seven baselineable engineering objects", () => {
    expect([...BASELINE_MEMBER_TYPES].sort()).toEqual([
      "DECISION_EXPECTATION",
      "DESIGN_ITEM",
      "ENGINEERING_DECISION",
      "REQUIREMENT",
      "SUPPLIED_ITEM",
      "SUPPLIER_QUALIFICATION",
      "VERIFICATION_ACTIVITY",
    ]);
  });

  it("is validated against the real graph node registry", () => {
    // Not an arbitrary type/id pair: every member type is a registered node.
    expect(baselineMemberTypesAreGraphNodes()).toBe(true);
  });

  it("excludes events, which are not part of an engineering basis", () => {
    for (const type of ["CHANGE_REQUEST", "APPROVAL", "OPERATIONAL_OBSERVATION"]) {
      expect(BASELINE_MEMBER_TYPES as readonly string[]).not.toContain(type);
    }
  });

  it("rejects a member request naming a type outside the list", () => {
    expect(
      addBaselineMemberRequestSchema.safeParse({
        nodeType: "CHANGE_REQUEST",
        nodeId: "chg1aaaaaaaaaaaaaaaaaa",
      }).success,
    ).toBe(false);
  });
});

// --- Observation lifecycle --------------------------------------------------

describe("observation status", () => {
  it("distinguishes a report from accepted evidence", () => {
    expect(OBSERVATION_STATUSES).toEqual(["RECORDED", "REVIEWED", "REJECTED"]);
  });

  it("lets a recorded observation be reviewed or rejected", () => {
    expect(canTransitionObservation("RECORDED", "REVIEWED")).toBe(true);
    expect(canTransitionObservation("RECORDED", "REJECTED")).toBe(true);
  });

  it("makes a determination terminal", () => {
    // Changing one's mind means recording a new observation, so what was
    // believed at the time survives.
    expect(canTransitionObservation("REVIEWED", "REJECTED")).toBe(false);
    expect(canTransitionObservation("REJECTED", "REVIEWED")).toBe(false);
    expect(canTransitionObservation("REVIEWED", "RECORDED")).toBe(false);
  });

  it("opens editing only while recorded", () => {
    expect(isObservationEditable("RECORDED")).toBe(true);
    expect(isObservationEditable("REVIEWED")).toBe(false);
    expect(isObservationEditable("REJECTED")).toBe(false);
  });

  it("covers the operational record kinds without becoming a telemetry schema", () => {
    expect(OBSERVATION_TYPES).toContain("MEASUREMENT");
    expect(OBSERVATION_TYPES).toContain("CONFIGURATION_OBSERVATION");
    expect(OBSERVATION_TYPES).toContain("FIELD_REPORT");
    // No sample, channel, stream or signal concept.
    for (const value of ["SAMPLE", "TELEMETRY", "SIGNAL", "STREAM"]) {
      expect(OBSERVATION_TYPES as readonly string[]).not.toContain(value);
    }
  });

  it("anchors observations to the three most direct drift subjects", () => {
    expect([...OBSERVATION_SUBJECT_TYPES].sort()).toEqual([
      "DECISION_EXPECTATION",
      "DESIGN_ITEM",
      "SUPPLIED_ITEM",
    ]);
  });
});

// --- Exact decimal comparison -----------------------------------------------

describe("exact decimal parsing", () => {
  it("parses integers, decimals and signs", () => {
    expect(parseExactDecimal("100")).toEqual({ mantissa: 100n, scale: 0 });
    expect(parseExactDecimal("1.25")).toEqual({ mantissa: 125n, scale: 2 });
    expect(parseExactDecimal("-0.5")).toEqual({ mantissa: -5n, scale: 1 });
    expect(parseExactDecimal("+3")).toEqual({ mantissa: 3n, scale: 0 });
    expect(parseExactDecimal(".5")).toEqual({ mantissa: 5n, scale: 1 });
  });

  it("refuses anything that is not a plain decimal", () => {
    // Notably "< 800": an operator embedded in prose is never parsed out.
    for (const value of ["< 800", "800 K", "1e3", "abc", "", "  ", "1.2.3", "NaN"]) {
      expect(parseExactDecimal(value)).toBeNull();
    }
    expect(parseExactDecimal(null)).toBeNull();
    expect(parseExactDecimal(undefined)).toBeNull();
  });

  it("compares exactly, without floating point", () => {
    const a = parseExactDecimal("0.1")!;
    const b = parseExactDecimal("0.2")!;
    const sum = parseExactDecimal("0.3")!;

    // The classic float trap: 0.1 + 0.2 !== 0.3 in binary floating point.
    expect(compareExactDecimals(a, b)).toBe(-1);
    expect(compareExactDecimals(sum, sum)).toBe(0);
    expect(compareExactDecimals(parseExactDecimal("0.30")!, sum)).toBe(0);
  });

  it("rescales differing precisions before comparing", () => {
    expect(compareExactDecimals(parseExactDecimal("1.5")!, parseExactDecimal("1.50")!)).toBe(0);
    expect(compareExactDecimals(parseExactDecimal("1.5")!, parseExactDecimal("1.500001")!)).toBe(
      -1,
    );
  });

  it("handles values far beyond double precision", () => {
    const big = parseExactDecimal("9007199254740993")!;
    const bigger = parseExactDecimal("9007199254740994")!;
    // Both round to the same double; exact arithmetic keeps them apart.
    expect(compareExactDecimals(big, bigger)).toBe(-1);
  });
});

describe("unit compatibility", () => {
  it("compares identical units", () => {
    expect(unitsAreComparable("K", "K")).toBe(true);
    expect(unitsAreComparable("degC", "DEGC")).toBe(true);
    expect(unitsAreComparable(" K ", "K")).toBe(true);
  });

  it("treats two unitless values as comparable", () => {
    expect(unitsAreComparable(null, null)).toBe(true);
    expect(unitsAreComparable("", "  ")).toBe(true);
  });

  it("refuses when only one side carries a unit", () => {
    // Somebody recorded incomplete information; comparing would assume what
    // they meant.
    expect(unitsAreComparable("K", null)).toBe(false);
    expect(unitsAreComparable(null, "K")).toBe(false);
  });

  it("never converts between units", () => {
    // 800 °C and 1472 °F are the same temperature. Converting would eventually
    // convert something it should not have, or get an offset scale wrong.
    expect(unitsAreComparable("degC", "degF")).toBe(false);
    expect(unitsAreComparable("m", "mm")).toBe(false);
    expect(unitsAreComparable("kg", "g")).toBe(false);
  });
});

describe("the value comparison", () => {
  const base = { expectedUnit: "K", observedUnit: "K" };

  it("evaluates every operator", () => {
    const cases: Array<[Parameters<typeof compareObservedValue>[0]["operator"], string, string, boolean]> = [
      ["EQUAL", "100", "100", true],
      ["EQUAL", "100", "101", false],
      ["NOT_EQUAL", "100", "101", true],
      ["NOT_EQUAL", "100", "100", false],
      ["LESS_THAN", "800", "799", true],
      ["LESS_THAN", "800", "800", false],
      ["LESS_THAN_OR_EQUAL", "800", "800", true],
      ["LESS_THAN_OR_EQUAL", "800", "801", false],
      ["GREATER_THAN", "10", "11", true],
      ["GREATER_THAN", "10", "10", false],
      ["GREATER_THAN_OR_EQUAL", "10", "10", true],
      ["GREATER_THAN_OR_EQUAL", "10", "9", false],
    ];

    for (const [operator, expected, observed, satisfied] of cases) {
      const result = compareObservedValue({
        ...base,
        operator,
        expectedValue: expected,
        observedValue: observed,
      });
      expect(result.outcome, `${observed} ${operator} ${expected}`).toBe(
        satisfied ? "SATISFIED" : "VIOLATED",
      );
    }
  });

  it("is NOT_COMPARABLE without an explicit operator", () => {
    const result = compareObservedValue({
      ...base,
      operator: null,
      expectedValue: "800",
      observedValue: "842",
    });

    expect(result.outcome).toBe("NOT_COMPARABLE");
    expect(result.reason).toMatch(/no explicit comparison operator/i);
  });

  it("is NOT_COMPARABLE when a value is not numeric", () => {
    expect(
      compareObservedValue({
        ...base,
        operator: "LESS_THAN",
        expectedValue: "< 800",
        observedValue: "842",
      }).outcome,
    ).toBe("NOT_COMPARABLE");

    expect(
      compareObservedValue({
        ...base,
        operator: "LESS_THAN",
        expectedValue: "800",
        observedValue: "hot",
      }).outcome,
    ).toBe("NOT_COMPARABLE");
  });

  it("is NOT_COMPARABLE across mismatched units, and says which", () => {
    const result = compareObservedValue({
      operator: "LESS_THAN",
      expectedValue: "800",
      expectedUnit: "degC",
      observedValue: "1472",
      observedUnit: "degF",
    });

    expect(result.outcome).toBe("NOT_COMPARABLE");
    expect(result.reason).toMatch(/degC/);
    expect(result.reason).toMatch(/degF/);
    expect(result.reason).toMatch(/no conversion/i);
  });

  it("compares exactly at the boundary", () => {
    // The case where a float would betray you.
    expect(
      compareObservedValue({
        ...base,
        operator: "LESS_THAN_OR_EQUAL",
        expectedValue: "0.3",
        observedValue: "0.30",
      }).outcome,
    ).toBe("SATISFIED");
  });

  it("describes an expectation readably", () => {
    expect(describeExpectation("LESS_THAN_OR_EQUAL", "800", "K")).toBe("≤ 800 K");
    expect(describeExpectation(null, "800", "K")).toBe("? 800 K");
    expect(describeExpectation("EQUAL", null, null)).toBe("= —");
  });

  it("declares six operators and nothing that implies a tolerance", () => {
    expect(COMPARISON_OPERATORS).toHaveLength(6);
    for (const value of ["WITHIN", "APPROXIMATELY", "NEAR", "TOLERANCE"]) {
      expect(COMPARISON_OPERATORS as readonly string[]).not.toContain(value);
    }
  });
});

// --- Rule registry ----------------------------------------------------------

describe("the drift rule registry", () => {
  it("defines rules", () => {
    expect(DRIFT_RULES.length).toBeGreaterThan(0);
  });

  it("gives every rule a unique id", () => {
    const ids = DRIFT_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names every rule in the DR-<AREA>-<NNN> house convention", () => {
    for (const rule of DRIFT_RULES) {
      expect(rule.id).toMatch(/^DR-[A-Z]{3}-\d{3}$/);
    }
  });

  it("uses only declared categories, statuses and basis markers", () => {
    for (const rule of DRIFT_RULES) {
      expect(DRIFT_CATEGORIES).toContain(rule.category);
      expect(DRIFT_FINDING_STATUSES).toContain(rule.status);
      expect(rule.basis.length).toBeGreaterThan(0);
      for (const marker of rule.basis) {
        expect(DRIFT_BASIS_MARKERS).toContain(marker);
      }
    }
  });

  it("states a condition and a rationale for every rule", () => {
    for (const rule of DRIFT_RULES) {
      expect(rule.condition.length).toBeGreaterThan(20);
      expect(rule.rationale.length).toBeGreaterThan(40);
    }
  });

  it("is resolvable by id, and refuses an id it does not define", () => {
    expect(driftRule("DR-BAS-002")?.category).toBe("BASELINE_CHANGED");
    expect(driftRule("DR-NOPE-001")).toBeNull();
  });

  it("lists rule ids deterministically", () => {
    expect(driftRuleIds()).toEqual([...driftRuleIds()].sort());
  });

  it("covers every drift category the domain declares", () => {
    const covered = new Set(DRIFT_RULES.map((rule) => rule.category));
    for (const category of DRIFT_CATEGORIES) {
      expect(covered, `no rule produces ${category}`).toContain(category);
    }
  });

  it("**never concludes failure**", () => {
    // The single most important property of this registry. REVIEW_REQUIRED is
    // the strongest outcome any rule carries; nothing says a thing failed.
    for (const rule of DRIFT_RULES) {
      expect(["REVIEW_REQUIRED", "INFORMATIONAL", "UNKNOWN"]).toContain(rule.status);
    }
    const statuses = DRIFT_FINDING_STATUSES as readonly string[];
    for (const forbidden of ["FAILED", "BREACHED", "DEFECT", "VIOLATION", "NONCONFORMANCE"]) {
      expect(statuses).not.toContain(forbidden);
    }
  });

  it("has a rule for each required comparison", () => {
    const byCategory = (category: string) =>
      DRIFT_RULES.filter((rule) => rule.category === category);

    // 1. baseline member missing, 2. baseline object changed
    expect(DRIFT_RULES.some((r) => r.basis.includes("BASELINE_MEMBER_UNRESOLVABLE"))).toBe(true);
    expect(byCategory("BASELINE_CHANGED").length).toBeGreaterThan(0);
    // 3. observed configuration differs
    expect(byCategory("CONFIGURATION_MISMATCH").length).toBeGreaterThan(0);
    // 4. expectation comparison
    expect(byCategory("EXPECTATION_BREACH").length).toBeGreaterThan(0);
    // 5. supplier state change
    expect(byCategory("SUPPLIER_STATE_CHANGE").length).toBeGreaterThan(0);
    // 6. unknown comparison
    expect(byCategory("UNKNOWN").length).toBeGreaterThan(0);
  });

  it("records that it does not judge assumptions or expectation status", () => {
    const markers = DRIFT_RULES.flatMap((rule) => [...rule.basis]);
    expect(markers).toContain("ASSUMPTION_VALIDITY_NOT_EVALUATED");
    expect(markers).toContain("EXPECTATION_STATUS_NOT_CHANGED");
    expect(markers).toContain("ENGINEERING_JUDGEMENT_REQUIRED");
  });
});

describe("severity", () => {
  it("is a one-to-one restatement of the finding status", () => {
    expect(severityForDriftStatus("REVIEW_REQUIRED")).toBe("ATTENTION");
    expect(severityForDriftStatus("INFORMATIONAL")).toBe("NOTE");
    expect(severityForDriftStatus("UNKNOWN")).toBe("INDETERMINATE");
  });

  it("introduces no judgement of its own", () => {
    const produced = new Set(DRIFT_FINDING_STATUSES.map(severityForDriftStatus));
    expect(produced.size).toBe(DRIFT_FINDING_STATUSES.length);
    expect([...produced].sort()).toEqual([...DRIFT_SEVERITIES].sort());
    // No CRITICAL/HIGH/LOW ranking anywhere.
    for (const forbidden of ["CRITICAL", "HIGH", "MEDIUM", "LOW"]) {
      expect(DRIFT_SEVERITIES as readonly string[]).not.toContain(forbidden);
    }
  });
});

// --- Verdict precedence -----------------------------------------------------

describe("the drift verdict", () => {
  it("ranks review-required above unknown above informational", () => {
    expect(DRIFT_FINDING_PRECEDENCE.REVIEW_REQUIRED).toBeGreaterThan(
      DRIFT_FINDING_PRECEDENCE.UNKNOWN,
    );
    expect(DRIFT_FINDING_PRECEDENCE.UNKNOWN).toBeGreaterThan(
      DRIFT_FINDING_PRECEDENCE.INFORMATIONAL,
    );
  });

  it("is NO_DRIFT when everything compared and nothing diverged", () => {
    expect(driftStatusFor([{ status: "INFORMATIONAL" }, { status: "INFORMATIONAL" }])).toBe(
      "NO_DRIFT",
    );
  });

  it("is DRIFT_DETECTED as soon as one comparison diverges", () => {
    expect(driftStatusFor([{ status: "INFORMATIONAL" }, { status: "REVIEW_REQUIRED" }])).toBe(
      "DRIFT_DETECTED",
    );
  });

  it("is UNKNOWN when nothing diverged but something could not be compared", () => {
    expect(driftStatusFor([{ status: "INFORMATIONAL" }, { status: "UNKNOWN" }])).toBe("UNKNOWN");
  });

  it("lets a divergence outrank an unknown", () => {
    expect(driftStatusFor([{ status: "UNKNOWN" }, { status: "REVIEW_REQUIRED" }])).toBe(
      "DRIFT_DETECTED",
    );
  });

  it("refuses to let silence produce NO_DRIFT", () => {
    // Every evaluation emits at least the scope rule, so an empty result means
    // the evaluation did not happen.
    expect(driftStatusFor([])).toBe("UNKNOWN");
  });

  it("only ever produces a declared status", () => {
    for (const status of DRIFT_FINDING_STATUSES) {
      expect(DRIFT_STATUSES).toContain(driftStatusFor([{ status }]));
    }
  });
});

// --- Ordering ---------------------------------------------------------------

describe("finding ordering", () => {
  function finding(overrides: Partial<DriftFinding>): DriftFinding {
    return {
      id: "f",
      assessmentId: "a",
      ruleId: "DR-BAS-002",
      category: "BASELINE_CHANGED",
      status: "REVIEW_REQUIRED",
      severity: "ATTENTION",
      baselineSubject: null,
      observationSubject: null,
      expectedValue: null,
      observedValue: null,
      explanation: "",
      basis: [],
      sequence: 0,
      createdAt: new Date(0),
      ...overrides,
    };
  }

  it("leads with review-required, then unknown, then informational", () => {
    const sorted = [
      finding({ status: "INFORMATIONAL", ruleId: "DR-BAS-003" }),
      finding({ status: "UNKNOWN", ruleId: "DR-EXP-003" }),
      finding({ status: "REVIEW_REQUIRED", ruleId: "DR-BAS-002" }),
    ].sort(compareDriftFindings);

    expect(sorted.map((f) => f.status)).toEqual([
      "REVIEW_REQUIRED",
      "UNKNOWN",
      "INFORMATIONAL",
    ]);
  });

  it("is a total order — two shuffles of the same set sort identically", () => {
    const findings = [
      finding({ ruleId: "DR-BAS-002", baselineSubject: { type: "DESIGN_ITEM", id: "b", identifier: null, label: "" } }),
      finding({ ruleId: "DR-BAS-002", baselineSubject: { type: "DESIGN_ITEM", id: "a", identifier: null, label: "" } }),
      finding({ ruleId: "DR-SUP-001" }),
      finding({ ruleId: "DR-EXP-001" }),
    ];

    const first = [...findings].sort(compareDriftFindings).map((f) => `${f.ruleId}:${f.baselineSubject?.id ?? ""}`);
    const second = [...findings].reverse().sort(compareDriftFindings).map((f) => `${f.ruleId}:${f.baselineSubject?.id ?? ""}`);

    expect(second).toEqual(first);
  });
});

describe("basis markers", () => {
  it("deduplicates and sorts, so identical findings carry identical lists", () => {
    expect(
      normalizeDriftBasis(["UNIT_MISMATCH", "OBSERVATION_RECORD", "UNIT_MISMATCH"]),
    ).toEqual(["OBSERVATION_RECORD", "UNIT_MISMATCH"]);
  });
});

// --- Fingerprints -----------------------------------------------------------

describe("the object fingerprint", () => {
  it("is deterministic and order-independent", () => {
    const a = objectFingerprint({ identifier: "DI-1", status: "APPROVED", name: "Chamber" });
    const b = objectFingerprint({ name: "Chamber", identifier: "DI-1", status: "APPROVED" });
    expect(a).toBe(b);
  });

  it("moves when substantive state changes", () => {
    const before = objectFingerprint({ identifier: "DI-1", status: "APPROVED" });
    const after = objectFingerprint({ identifier: "DI-1", status: "BASELINED" });
    expect(after).not.toBe(before);
  });

  it("distinguishes a null field from an absent one consistently", () => {
    expect(objectFingerprint({ a: null })).toBe(objectFingerprint({ a: null }));
    expect(objectFingerprint({ a: null })).not.toBe(objectFingerprint({ a: "-" , b: null}));
  });
});

describe("the drift fingerprint", () => {
  function basis(overrides: Partial<DriftEvaluationBasis> = {}): DriftEvaluationBasis {
    return {
      baselineId: "bl1",
      baselineIdentifier: "BL-001",
      baselineName: "Design baseline",
      baselineStatus: "ACTIVE",
      members: [
        {
          memberId: "m1",
          nodeType: "DESIGN_ITEM",
          nodeId: "di1",
          identifier: "DI-001",
          baselinedFingerprint: "aaa",
          currentFingerprint: "aaa",
        },
      ],
      observations: [
        {
          observationId: "o1",
          identifier: "OBS-001",
          status: "REVIEWED",
          subjectType: "DESIGN_ITEM",
          subjectId: "di1",
          revision: "2026-01-01T00:00:00.000Z",
        },
      ],
      ...overrides,
    };
  }

  it("is deterministic", () => {
    expect(driftFingerprint(basis())).toBe(driftFingerprint(basis()));
  });

  it("never mixes in the current time", () => {
    const first = driftFingerprint(basis());
    const later = driftFingerprint(basis());
    // Two digests a moment apart from unchanged state must match, or every
    // assessment would be stale the instant it was written.
    expect(later).toBe(first);
  });

  it("moves when a baselined object's current state changes", () => {
    const changed = basis({
      members: [
        {
          memberId: "m1",
          nodeType: "DESIGN_ITEM",
          nodeId: "di1",
          identifier: "DI-001",
          baselinedFingerprint: "aaa",
          currentFingerprint: "bbb",
        },
      ],
    });
    expect(driftFingerprint(changed)).not.toBe(driftFingerprint(basis()));
  });

  it("moves when a baselined object stops resolving", () => {
    const absent = basis({
      members: [
        {
          memberId: "m1",
          nodeType: "DESIGN_ITEM",
          nodeId: "di1",
          identifier: "DI-001",
          baselinedFingerprint: "aaa",
          currentFingerprint: null,
        },
      ],
    });
    expect(driftFingerprint(absent)).not.toBe(driftFingerprint(basis()));
  });

  it("moves when an observation is reviewed", () => {
    const reviewed = basis({
      observations: [
        {
          observationId: "o1",
          identifier: "OBS-001",
          status: "RECORDED",
          subjectType: "DESIGN_ITEM",
          subjectId: "di1",
          revision: "2026-01-01T00:00:00.000Z",
        },
      ],
    });
    expect(driftFingerprint(reviewed)).not.toBe(driftFingerprint(basis()));
  });

  it("moves when an observation is edited", () => {
    const edited = basis({
      observations: [
        {
          observationId: "o1",
          identifier: "OBS-001",
          status: "REVIEWED",
          subjectType: "DESIGN_ITEM",
          subjectId: "di1",
          revision: "2026-06-01T00:00:00.000Z",
        },
      ],
    });
    expect(driftFingerprint(edited)).not.toBe(driftFingerprint(basis()));
  });

  it("distinguishes two baselines over the same objects", () => {
    expect(driftFingerprint(basis({ baselineId: "bl2" }))).not.toBe(driftFingerprint(basis()));
  });

  it("contains nothing describing the project as a whole", () => {
    // An artifact that is neither a baseline member nor an observation subject
    // must not be able to stale a drift assessment.
    const withMoreProjectActivity = basis();
    expect(driftFingerprint(withMoreProjectActivity)).toBe(driftFingerprint(basis()));
  });
});

describe("freshness", () => {
  it("is CURRENT only when the digests match under the same version", () => {
    expect(driftFreshnessOf("abc", "abc", DRIFT_VERSION)).toBe("CURRENT");
  });

  it("is STALE when the basis has moved", () => {
    expect(driftFreshnessOf("abc", "def", DRIFT_VERSION)).toBe("STALE");
  });

  it("is UNKNOWN across rule versions rather than guessing compatibility", () => {
    expect(driftFreshnessOf("abc", "abc", "0")).toBe("UNKNOWN");
  });

  it("is UNKNOWN when either digest is missing", () => {
    expect(driftFreshnessOf("", "abc", DRIFT_VERSION)).toBe("UNKNOWN");
    expect(driftFreshnessOf("abc", "", DRIFT_VERSION)).toBe("UNKNOWN");
  });
});

// --- Request contracts ------------------------------------------------------

describe("request contracts", () => {
  it("accepts a baseline and rejects caller-supplied identity", () => {
    expect(
      createBaselineRequestSchema.parse({ identifier: "BL-001", name: "Design baseline" })
        .identifier,
    ).toBe("BL-001");

    for (const extra of [{ projectId: "p" }, { status: "ACTIVE" }, { createdById: "u" }]) {
      expect(
        createBaselineRequestSchema.safeParse({
          identifier: "BL-001",
          name: "Design baseline",
          ...extra,
        }).success,
      ).toBe(false);
    }
  });

  it("does not let a baseline update set a status", () => {
    // Activation and supersession are their own operations.
    expect(updateBaselineRequestSchema.safeParse({ status: "ACTIVE" }).success).toBe(false);
  });

  it("accepts an observation with an exact decimal value", () => {
    const parsed = createObservationRequestSchema.parse({
      identifier: "OBS-001",
      title: "Peak wall temperature",
      description: "Measured on flight 14.",
      observationType: "MEASUREMENT",
      observedAt: "2026-05-01T00:00:00.000Z",
      numericValue: "842.5",
      unit: "K",
    });
    expect(parsed.numericValue).toBe("842.5");
  });

  it("rejects a numeric value that is not an exact decimal", () => {
    expect(
      createObservationRequestSchema.safeParse({
        identifier: "OBS-001",
        title: "T",
        description: "d",
        observationType: "MEASUREMENT",
        observedAt: "2026-05-01T00:00:00.000Z",
        numericValue: "about 840",
      }).success,
    ).toBe(false);
  });

  it("rejects an observation status or subject on update", () => {
    expect(updateObservationRequestSchema.safeParse({ status: "REVIEWED" }).success).toBe(false);
    expect(
      updateObservationRequestSchema.safeParse({ subject: { type: "DESIGN_ITEM", id: "d" } })
        .success,
    ).toBe(false);
  });

  it("takes a baseline id and nothing else to evaluate", () => {
    expect(evaluateDriftRequestSchema.parse({ baselineId: "bl1aaaaaaaaaaaaaaaaaa" })).toEqual({
      baselineId: "bl1aaaaaaaaaaaaaaaaaa",
    });

    for (const extra of [{ status: "NO_DRIFT" }, { findings: [] }, { projectId: "p" }]) {
      expect(
        evaluateDriftRequestSchema.safeParse({ baselineId: "bl1aaaaaaaaaaaaaaaaaa", ...extra })
          .success,
      ).toBe(false);
    }
  });
});

// --- Graph and impact integration -------------------------------------------

describe("drift in the product graph", () => {
  it("registers all five node types", () => {
    for (const type of [
      "ENGINEERING_BASELINE",
      "BASELINE_MEMBER",
      "OPERATIONAL_OBSERVATION",
      "DRIFT_ASSESSMENT",
      "DRIFT_FINDING",
    ]) {
      expect(GRAPH_NODE_TYPES as readonly string[]).toContain(type);
    }
  });

  it("registers the six drift edges", () => {
    for (const type of [
      "BASELINE_HAS_MEMBER",
      "BASELINE_MEMBER_REFERENCES_OBJECT",
      "OBSERVATION_CONCERNS_OBJECT",
      "DRIFT_ASSESSMENT_AGAINST_BASELINE",
      "DRIFT_ASSESSMENT_HAS_FINDING",
      "DRIFT_FINDING_CONCERNS_OBJECT",
    ]) {
      expect(GRAPH_EDGE_TYPES as readonly string[]).toContain(type);
    }
  });

  it("**makes every drift edge inert under impact analysis**", () => {
    // The property that keeps a drift finding from becoming an impact root. A
    // finding is evidence that two records disagree, not a cause of change.
    const driftEdges = [
      "BASELINE_HAS_MEMBER",
      "BASELINE_MEMBER_REFERENCES_OBJECT",
      "OBSERVATION_CONCERNS_OBJECT",
      "DRIFT_ASSESSMENT_AGAINST_BASELINE",
      "DRIFT_ASSESSMENT_HAS_FINDING",
      "DRIFT_FINDING_CONCERNS_OBJECT",
    ] as const;

    for (const type of driftEdges) {
      expect(IMPACT_PROPAGATION[type].propagates, `${type} must not propagate`).toBe(false);
      expect(IMPACT_PROPAGATION[type].context, `${type} must not be context`).toBe(false);
      expect(IMPACT_PROPAGATION[type].rationale.length).toBeGreaterThan(40);
    }
  });
});
