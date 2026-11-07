import { describe, expect, it } from "vitest";
import {
  READINESS_BASIS_ROLES,
  READINESS_FINDING_STATUS_PRECEDENCE,
  VERIFICATION_READINESS_BASIS_MARKERS,
  VERIFICATION_READINESS_CATEGORIES,
  VERIFICATION_READINESS_FINDING_STATUSES,
  VERIFICATION_READINESS_RULES,
  VERIFICATION_READINESS_SCOPES,
  VERIFICATION_READINESS_STATUSES,
  VERIFICATION_READINESS_VERSION,
  type ReadinessBasisObject,
  type VerificationReadinessBasis,
  type VerificationReadinessFinding,
  type VerificationReadinessFindingStatus,
  blockingReadinessRuleIds,
  compareReadinessFindings,
  evaluateVerificationReadinessRequestSchema,
  isBlockingRule,
  normalizeReadinessBasis,
  readinessFingerprint,
  readinessFreshnessOf,
  readinessRule,
  readinessRuleIds,
  readinessScopeFor,
  readinessStatusFor,
  ruleAppliesInScope,
  rulesForScope,
  severityForFindingStatus,
} from "@/domain";

/**
 * The readiness rule registry and the pure functions built on it.
 *
 * Everything here runs without a database on purpose: readiness policy is a
 * property of the domain, and if the precedence rule or the fingerprint could
 * only be checked through PostgreSQL they would be much harder to trust.
 */

// --- Registry validity ------------------------------------------------------

describe("the readiness version", () => {
  it("is a stable non-empty identifier", () => {
    // Assessments are only comparable within a version, so a stored one has to
    // be matchable against this.
    expect(VERIFICATION_READINESS_VERSION).toBe("1");
  });
});

describe("the rule registry", () => {
  it("defines at least one rule", () => {
    expect(VERIFICATION_READINESS_RULES.length).toBeGreaterThan(0);
  });

  it("gives every rule a unique id", () => {
    const ids = VERIFICATION_READINESS_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names every rule in the VR-<AREA>-<NNN> house convention", () => {
    for (const rule of VERIFICATION_READINESS_RULES) {
      expect(rule.id).toMatch(/^VR-[A-Z]+-\d{3}$/);
    }
  });

  it("uses only declared categories and finding statuses", () => {
    for (const rule of VERIFICATION_READINESS_RULES) {
      expect(VERIFICATION_READINESS_CATEGORIES).toContain(rule.category);
      expect(VERIFICATION_READINESS_FINDING_STATUSES).toContain(rule.status);
    }
  });

  it("cites at least one real basis marker per rule", () => {
    // A finding that cannot say what it was read from is an assertion, not a
    // derivation.
    for (const rule of VERIFICATION_READINESS_RULES) {
      expect(rule.basis.length).toBeGreaterThan(0);
      for (const marker of rule.basis) {
        expect(VERIFICATION_READINESS_BASIS_MARKERS).toContain(marker);
      }
    }
  });

  it("states a condition and a rationale for every rule", () => {
    for (const rule of VERIFICATION_READINESS_RULES) {
      expect(rule.description.length).toBeGreaterThan(10);
      expect(rule.condition.length).toBeGreaterThan(10);
      expect(rule.rationale.length).toBeGreaterThan(20);
    }
  });

  it("applies every rule in at least one real scope", () => {
    for (const rule of VERIFICATION_READINESS_RULES) {
      expect(rule.scopes.length).toBeGreaterThan(0);
      for (const scope of rule.scopes) {
        expect(VERIFICATION_READINESS_SCOPES).toContain(scope);
      }
    }
  });

  it("is resolvable by id, and refuses an id it does not define", () => {
    expect(readinessRule("VR-REQ-001")?.category).toBe("REQUIREMENT_STATE");
    expect(readinessRule("VR-NOT-REAL")).toBeNull();
  });

  it("derives blocking from the rule's own status rather than a second flag", () => {
    for (const rule of VERIFICATION_READINESS_RULES) {
      expect(isBlockingRule(rule)).toBe(rule.status === "BLOCKING");
    }
  });

  it("covers every category the domain declares except the fallback", () => {
    const covered = new Set(VERIFICATION_READINESS_RULES.map((rule) => rule.category));
    for (const category of VERIFICATION_READINESS_CATEGORIES) {
      if (category === "UNKNOWN") continue;
      expect(covered.has(category)).toBe(true);
    }
  });

  it("keeps the deliberate non-blocking boundaries", () => {
    // Two rules that would be wrong if they blocked, and the reasons are
    // recorded in the registry rather than only in a commit message.
    expect(readinessRule("VR-OWN-001")?.status).toBe("WARNING");
    expect(readinessRule("VR-EVD-002")?.status).toBe("INFORMATIONAL");
  });

  it("never treats an unmonitored assumption as a failure", () => {
    // Absence of monitoring is absence of information, not evidence against.
    expect(readinessRule("VR-ASM-003")?.status).toBe("UNKNOWN");
  });

  it("never treats a stale or absent impact analysis as a clean result", () => {
    expect(readinessRule("VR-CHG-003")?.status).toBe("UNKNOWN");
    expect(readinessRule("VR-CHG-004")?.status).toBe("UNKNOWN");
  });
});

describe("rule ordering and scope selection", () => {
  it("returns rules in a stable registry order", () => {
    const first = rulesForScope("EXECUTION").map((rule) => rule.id);
    const second = rulesForScope("EXECUTION").map((rule) => rule.id);
    expect(first).toEqual(second);
  });

  it("orders rules identically to their declaration, not alphabetically", () => {
    const declared = VERIFICATION_READINESS_RULES.filter((rule) =>
      ruleAppliesInScope(rule, "EXECUTION"),
    ).map((rule) => rule.id);
    expect(rulesForScope("EXECUTION").map((rule) => rule.id)).toEqual(declared);
  });

  it("asks only the concluded-record question of a concluded activity", () => {
    // Everything else is a question about something still ahead of the
    // activity, and asking it of a closed record would be noise.
    expect(rulesForScope("NOT_APPLICABLE").map((rule) => rule.id)).toEqual(["VR-LIFE-003"]);
  });

  it("evaluates the same conditions before and after execution starts", () => {
    const execution = rulesForScope("EXECUTION").map((rule) => rule.id);
    const closure = rulesForScope("CLOSURE").map((rule) => rule.id);

    // The scopes differ only in the lifecycle and evidence rules that name one.
    expect(execution).toContain("VR-LIFE-001");
    expect(execution).toContain("VR-EVD-002");
    expect(closure).toContain("VR-LIFE-002");
    expect(closure).toContain("VR-EVD-003");
    expect(execution).not.toContain("VR-LIFE-002");
    expect(closure).not.toContain("VR-LIFE-001");
  });

  it("lists rule ids and blocking rule ids deterministically", () => {
    expect(readinessRuleIds()).toEqual([...readinessRuleIds()].sort());
    expect(blockingReadinessRuleIds()).toEqual(
      VERIFICATION_READINESS_RULES.filter((rule) => rule.status === "BLOCKING")
        .map((rule) => rule.id)
        .sort(),
    );
  });
});

describe("the readiness scope", () => {
  it("asks about execution before the activity starts", () => {
    expect(readinessScopeFor("PLANNED")).toBe("EXECUTION");
  });

  it("asks about closure once it is running", () => {
    expect(readinessScopeFor("IN_PROGRESS")).toBe("CLOSURE");
  });

  it("asks nothing of a concluded record, whatever the outcome was", () => {
    expect(readinessScopeFor("PASSED")).toBe("NOT_APPLICABLE");
    expect(readinessScopeFor("FAILED")).toBe("NOT_APPLICABLE");
    expect(readinessScopeFor("WAIVED")).toBe("NOT_APPLICABLE");
  });
});

// --- Severity ---------------------------------------------------------------

describe("severity", () => {
  it("is a one-to-one restatement of the finding status", () => {
    expect(severityForFindingStatus("BLOCKING")).toBe("BLOCKER");
    expect(severityForFindingStatus("WARNING")).toBe("ADVISORY");
    expect(severityForFindingStatus("INFORMATIONAL")).toBe("NOTE");
    expect(severityForFindingStatus("UNKNOWN")).toBe("INDETERMINATE");
  });

  it("introduces no judgement of its own", () => {
    // Every status maps to exactly one severity and no two share one, so
    // severity carries no information the status did not already carry — which
    // is what stops it becoming a covert risk score.
    const mapped = VERIFICATION_READINESS_FINDING_STATUSES.map(severityForFindingStatus);
    expect(new Set(mapped).size).toBe(VERIFICATION_READINESS_FINDING_STATUSES.length);
  });
});

// --- Status precedence ------------------------------------------------------

function outcomes(
  ...statuses: VerificationReadinessFindingStatus[]
): Array<{ status: VerificationReadinessFindingStatus }> {
  return statuses.map((status) => ({ status }));
}

describe("assessment status precedence", () => {
  it("ranks blocking above unknown above the advisory statuses", () => {
    expect(READINESS_FINDING_STATUS_PRECEDENCE.BLOCKING).toBeGreaterThan(
      READINESS_FINDING_STATUS_PRECEDENCE.UNKNOWN,
    );
    expect(READINESS_FINDING_STATUS_PRECEDENCE.UNKNOWN).toBeGreaterThan(
      READINESS_FINDING_STATUS_PRECEDENCE.WARNING,
    );
    expect(READINESS_FINDING_STATUS_PRECEDENCE.WARNING).toBeGreaterThan(
      READINESS_FINDING_STATUS_PRECEDENCE.INFORMATIONAL,
    );
  });

  it("is READY when every condition was evaluated and none blocks", () => {
    expect(readinessStatusFor(outcomes("INFORMATIONAL", "INFORMATIONAL"))).toBe("READY");
  });

  it("is NOT_READY as soon as one condition blocks", () => {
    expect(readinessStatusFor(outcomes("INFORMATIONAL", "BLOCKING"))).toBe("NOT_READY");
  });

  it("is UNKNOWN when nothing blocks but something could not be determined", () => {
    expect(readinessStatusFor(outcomes("INFORMATIONAL", "UNKNOWN"))).toBe("UNKNOWN");
  });

  it("lets blocking outrank unknown", () => {
    expect(readinessStatusFor(outcomes("UNKNOWN", "BLOCKING"))).toBe("NOT_READY");
  });

  it("does not let a warning change the verdict", () => {
    // A rule that should disqualify says so in the registry. Warnings inform.
    expect(readinessStatusFor(outcomes("WARNING", "INFORMATIONAL"))).toBe("READY");
    expect(readinessStatusFor(outcomes("WARNING", "WARNING", "WARNING"))).toBe("READY");
  });

  it("refuses to call an empty evaluation ready", () => {
    // Every scope has a rule that always emits, so no findings means the
    // evaluation did not happen — and readiness must never be claimed from
    // silence.
    expect(readinessStatusFor([])).toBe("UNKNOWN");
  });

  it("only ever produces a declared status", () => {
    for (const combination of [
      outcomes("BLOCKING"),
      outcomes("UNKNOWN"),
      outcomes("WARNING"),
      outcomes("INFORMATIONAL"),
      [],
    ]) {
      expect(VERIFICATION_READINESS_STATUSES).toContain(readinessStatusFor(combination));
    }
  });
});

describe("finding ordering", () => {
  const finding = (
    status: VerificationReadinessFindingStatus,
    ruleId: string,
    subjectId: string,
  ): Pick<VerificationReadinessFinding, "status" | "ruleId" | "subjectType" | "subjectId"> => ({
    status,
    ruleId,
    subjectType: "REQUIREMENT",
    subjectId,
  });

  it("leads with blocking, then unknown, then advisory", () => {
    const ordered = [
      finding("INFORMATIONAL", "VR-REQ-003", "a"),
      finding("BLOCKING", "VR-REQ-001", "b"),
      finding("WARNING", "VR-OWN-001", "c"),
      finding("UNKNOWN", "VR-ASM-003", "d"),
    ].sort(compareReadinessFindings);

    expect(ordered.map((f) => f.status)).toEqual([
      "BLOCKING",
      "UNKNOWN",
      "WARNING",
      "INFORMATIONAL",
    ]);
  });

  it("breaks ties by rule then subject, never by insertion order", () => {
    const a = finding("BLOCKING", "VR-REQ-001", "req-b");
    const b = finding("BLOCKING", "VR-REQ-001", "req-a");
    expect([a, b].sort(compareReadinessFindings)[0]?.subjectId).toBe("req-a");
    expect([b, a].sort(compareReadinessFindings)[0]?.subjectId).toBe("req-a");
  });

  it("is a total order — two shuffles of the same set sort identically", () => {
    const set = [
      finding("BLOCKING", "VR-DEC-001", "d1"),
      finding("BLOCKING", "VR-REQ-001", "r1"),
      finding("UNKNOWN", "VR-CHG-004", "c1"),
      finding("WARNING", "VR-DES-002", "x1"),
      finding("INFORMATIONAL", "VR-REQ-003", "r2"),
    ];
    const forward = [...set].sort(compareReadinessFindings).map((f) => f.ruleId + f.subjectId);
    const reverse = [...set]
      .reverse()
      .sort(compareReadinessFindings)
      .map((f) => f.ruleId + f.subjectId);
    expect(forward).toEqual(reverse);
  });
});

describe("basis markers", () => {
  it("deduplicates and sorts, so identical findings carry identical lists", () => {
    expect(
      normalizeReadinessBasis([
        "REQUIREMENT_LIFECYCLE_STATE",
        "REQUIREMENT_VERIFICATION_LINK",
        "REQUIREMENT_LIFECYCLE_STATE",
      ]),
    ).toEqual(["REQUIREMENT_LIFECYCLE_STATE", "REQUIREMENT_VERIFICATION_LINK"]);
  });
});

// --- Fingerprint ------------------------------------------------------------

function basisObject(
  overrides: Partial<ReadinessBasisObject> = {},
): ReadinessBasisObject {
  return {
    role: "VERIFIED_REQUIREMENT",
    type: "REQUIREMENT",
    id: "req1",
    identifier: "REQ-001",
    label: "Maximum chamber pressure",
    revision: "2026-03-01T00:00:00.000Z",
    state: "APPROVED",
    ...overrides,
  };
}

function basis(overrides: Partial<VerificationReadinessBasis> = {}): VerificationReadinessBasis {
  return {
    verificationActivityId: "va1",
    scope: "EXECUTION",
    objects: [
      basisObject({
        role: "VERIFICATION_ACTIVITY",
        type: "VERIFICATION_ACTIVITY",
        id: "va1",
        identifier: "VA-001",
        label: "Proof pressure test",
        state: "PLANNED",
      }),
      basisObject(),
    ],
    relationships: [
      {
        edgeType: "REQUIREMENT_VERIFIED_BY",
        relationshipId: "rel1",
        fromType: "REQUIREMENT",
        fromId: "req1",
        toType: "VERIFICATION_ACTIVITY",
        toId: "va1",
        linkType: null,
      },
    ],
    monitoring: [],
    changes: [],
    ...overrides,
  };
}

describe("the readiness fingerprint", () => {
  it("is deterministic — the same basis digests identically", () => {
    expect(readinessFingerprint(basis())).toBe(readinessFingerprint(basis()));
  });

  it("does not depend on the order objects were collected in", () => {
    const forward = basis();
    const reversed = basis({ objects: [...forward.objects].reverse() });
    expect(readinessFingerprint(reversed)).toBe(readinessFingerprint(forward));
  });

  it("never mixes in the current time", () => {
    // Two digests taken a moment apart from the same basis must match, or
    // every assessment would be stale the instant it was written.
    const first = readinessFingerprint(basis());
    const second = readinessFingerprint(basis());
    expect(first).toBe(second);
  });

  it("moves when a basis object's recorded state changes", () => {
    const before = readinessFingerprint(basis());
    const after = readinessFingerprint(
      basis({
        objects: [
          basis().objects[0] as ReadinessBasisObject,
          basisObject({ state: "DRAFT" }),
        ],
      }),
    );
    expect(after).not.toBe(before);
  });

  it("moves when a basis object is revised without changing state", () => {
    const after = readinessFingerprint(
      basis({
        objects: [
          basis().objects[0] as ReadinessBasisObject,
          basisObject({ revision: "2026-06-01T00:00:00.000Z" }),
        ],
      }),
    );
    expect(after).not.toBe(readinessFingerprint(basis()));
  });

  it("moves when a relationship is added or removed", () => {
    const withoutLink = readinessFingerprint(basis({ relationships: [] }));
    expect(withoutLink).not.toBe(readinessFingerprint(basis()));
  });

  it("moves when the relationship's link type changes", () => {
    const relinked = readinessFingerprint(
      basis({
        relationships: [
          {
            edgeType: "REQUIREMENT_ALLOCATED_TO_DESIGN",
            relationshipId: "rel1",
            fromType: "REQUIREMENT",
            fromId: "req1",
            toType: "DESIGN_ITEM",
            toId: "di1",
            linkType: "SATISFIED_BY",
          },
        ],
      }),
    );
    expect(relinked).not.toBe(readinessFingerprint(basis()));
  });

  it("moves when assumption monitoring records a new verdict", () => {
    const monitored = readinessFingerprint(
      basis({
        monitoring: [
          {
            assumptionId: "asm1",
            recordId: "rec1",
            monitoringStatus: "CURRENT",
            basisFingerprint: "abc",
          },
        ],
      }),
    );
    const rerun = readinessFingerprint(
      basis({
        monitoring: [
          {
            assumptionId: "asm1",
            recordId: "rec2",
            monitoringStatus: "REVIEW_REQUIRED",
            basisFingerprint: "def",
          },
        ],
      }),
    );
    expect(rerun).not.toBe(monitored);
  });

  it("moves when a consumed impact analysis stops being current", () => {
    // The assessment relied on "this change's analysis is current". When that
    // stops being true, what it relied on has genuinely changed.
    const current = readinessFingerprint(
      basis({
        changes: [
          {
            changeRequestId: "chg1",
            identifier: "CR-001",
            title: "Raise burst margin",
            status: "UNDER_REVIEW",
            analysisId: "ana1",
            analysisFingerprint: "fp-a",
            analysisFreshness: "CURRENT",
            declaredSubjects: ["REQUIREMENT:req1"],
            affectedSubjects: ["REQUIREMENT:req1"],
          },
        ],
      }),
    );
    const stale = readinessFingerprint(
      basis({
        changes: [
          {
            changeRequestId: "chg1",
            identifier: "CR-001",
            title: "Raise burst margin",
            status: "UNDER_REVIEW",
            analysisId: "ana1",
            analysisFingerprint: "fp-a",
            analysisFreshness: "STALE",
            declaredSubjects: ["REQUIREMENT:req1"],
            affectedSubjects: ["REQUIREMENT:req1"],
          },
        ],
      }),
    );
    expect(stale).not.toBe(current);
  });

  it("moves when the activity's readiness scope changes", () => {
    expect(readinessFingerprint(basis({ scope: "CLOSURE" }))).not.toBe(
      readinessFingerprint(basis()),
    );
  });

  it("is insensitive to project state that is not in the basis", () => {
    // The whole point of an activity-specific digest: an unrelated edit
    // somewhere else in the project cannot appear here, because nothing in the
    // input describes the project as a whole.
    const label = readinessFingerprint(
      basis({
        objects: [
          basis().objects[0] as ReadinessBasisObject,
          basisObject({ label: "Maximum chamber pressure (renamed elsewhere?)" }),
        ],
      }),
    );
    // A label is display text, not basis: it moves only alongside a revision.
    expect(label).toBe(readinessFingerprint(basis()));
  });

  it("distinguishes two activities with otherwise identical bases", () => {
    expect(readinessFingerprint(basis({ verificationActivityId: "va2" }))).not.toBe(
      readinessFingerprint(basis()),
    );
  });
});

describe("freshness", () => {
  it("is CURRENT only when the digests match under the same version", () => {
    expect(readinessFreshnessOf("abc", "abc", VERIFICATION_READINESS_VERSION)).toBe("CURRENT");
  });

  it("is STALE when the basis has moved", () => {
    expect(readinessFreshnessOf("abc", "def", VERIFICATION_READINESS_VERSION)).toBe("STALE");
  });

  it("is UNKNOWN across rule versions rather than guessing either way", () => {
    expect(readinessFreshnessOf("abc", "abc", "0")).toBe("UNKNOWN");
  });

  it("is UNKNOWN when either digest is missing", () => {
    expect(readinessFreshnessOf("", "abc", VERIFICATION_READINESS_VERSION)).toBe("UNKNOWN");
    expect(readinessFreshnessOf("abc", "", VERIFICATION_READINESS_VERSION)).toBe("UNKNOWN");
  });
});

// --- Contracts --------------------------------------------------------------

describe("the evaluation request contract", () => {
  it("accepts an empty body", () => {
    expect(evaluateVerificationReadinessRequestSchema.safeParse({}).success).toBe(true);
  });

  it("rejects any attempt to supply a verdict or a finding", () => {
    // Readiness is derived from recorded state. A client that tries to assert
    // it is refused outright rather than having the field quietly dropped.
    for (const attempt of [
      { status: "READY" },
      { findings: [] },
      { ruleId: "VR-REQ-001" },
      { projectId: "proj9" },
    ]) {
      expect(evaluateVerificationReadinessRequestSchema.safeParse(attempt).success).toBe(false);
    }
  });
});

describe("basis roles", () => {
  it("names every role the engine can put in a basis", () => {
    expect(READINESS_BASIS_ROLES).toContain("VERIFICATION_ACTIVITY");
    expect(READINESS_BASIS_ROLES).toContain("VERIFIED_REQUIREMENT");
    expect(READINESS_BASIS_ROLES).toContain("PREREQUISITE_DESIGN_ITEM");
    expect(READINESS_BASIS_ROLES).toContain("RELEVANT_DECISION");
    expect(READINESS_BASIS_ROLES).toContain("DECISION_ASSUMPTION");
    expect(READINESS_BASIS_ROLES).toContain("ATTACHED_EVIDENCE");
  });
});
