import { describe, expect, it } from "vitest";
import {
  TECHNICAL_FINDING_STATUS_PRECEDENCE,
  TECHNICAL_READINESS_BASIS_MARKERS,
  TECHNICAL_READINESS_CATEGORIES,
  TECHNICAL_READINESS_FINDING_STATUSES,
  TECHNICAL_READINESS_GATES,
  TECHNICAL_READINESS_RULES,
  TECHNICAL_READINESS_STATUSES,
  TECHNICAL_READINESS_VERSION,
  TECHNICAL_SCOPE_ROLES,
  type TechnicalReadinessFinding,
  type TechnicalReadinessFindingStatus,
  type TechnicalReadinessScope,
  type TechnicalScopeObject,
  blockingRuleIdsForGate,
  compareTechnicalFindings,
  emptyScopeCounts,
  evaluateTechnicalReadinessRequestSchema,
  gateOrder,
  isBlockingTechnicalRule,
  normalizeTechnicalBasis,
  ruleAppliesToGate,
  rulesForGate,
  severityForTechnicalFindingStatus,
  technicalReadinessFingerprint,
  technicalReadinessFreshnessOf,
  technicalReadinessGateLabel,
  technicalReadinessGateQuestion,
  technicalReadinessRule,
  technicalReadinessRuleIds,
  technicalReadinessStatusFor,
} from "@/domain";

/**
 * The gate rule registry and the pure functions built on it.
 *
 * Everything here runs without a database on purpose: gate policy is a property
 * of the domain, and if precedence or the fingerprint could only be checked
 * through PostgreSQL they would be much harder to trust.
 */

// --- Version and gates ------------------------------------------------------

describe("the readiness version", () => {
  it("is a stable non-empty identifier", () => {
    expect(TECHNICAL_READINESS_VERSION).toBe("1");
  });
});

describe("the gate vocabulary", () => {
  it("defines the five internal gates in programme order", () => {
    expect([...TECHNICAL_READINESS_GATES]).toEqual([
      "SYSTEM_DEFINITION",
      "DESIGN_REVIEW",
      "DESIGN_FREEZE",
      "VERIFICATION_READY",
      "RELEASE_READY",
    ]);
  });

  it("orders gates deterministically", () => {
    expect(gateOrder("SYSTEM_DEFINITION")).toBeLessThan(gateOrder("DESIGN_REVIEW"));
    expect(gateOrder("DESIGN_FREEZE")).toBeLessThan(gateOrder("RELEASE_READY"));
  });

  it("gives every gate a label and the question it answers", () => {
    for (const gate of TECHNICAL_READINESS_GATES) {
      expect(technicalReadinessGateLabel(gate).length).toBeGreaterThan(3);
      expect(technicalReadinessGateQuestion(gate)).toMatch(/\?$/);
    }
  });

  it("names no external regulatory milestone", () => {
    // These are internal engineering gates. Naming one PDR or CDR would imply
    // the system knows what that milestone requires.
    const text = TECHNICAL_READINESS_GATES.join(" ");
    expect(text).not.toMatch(/PDR|CDR|TRR|CERTIF|AIRWORTH/i);
  });
});

// --- Registry validity ------------------------------------------------------

describe("the rule registry", () => {
  it("defines rules", () => {
    expect(TECHNICAL_READINESS_RULES.length).toBeGreaterThan(0);
  });

  it("gives every rule a unique id", () => {
    const ids = TECHNICAL_READINESS_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names every rule in the TR-<AREA>-<NNN> house convention", () => {
    for (const rule of TECHNICAL_READINESS_RULES) {
      expect(rule.id).toMatch(/^TR-[A-Z]+-\d{3}$/);
    }
  });

  it("uses only declared categories, statuses and subject types", () => {
    for (const rule of TECHNICAL_READINESS_RULES) {
      expect(TECHNICAL_READINESS_CATEGORIES).toContain(rule.category);
      expect(TECHNICAL_READINESS_FINDING_STATUSES).toContain(rule.status);
      expect(typeof rule.subjectType).toBe("string");
    }
  });

  it("applies every rule to at least one real gate", () => {
    for (const rule of TECHNICAL_READINESS_RULES) {
      expect(rule.gates.length).toBeGreaterThan(0);
      for (const gate of rule.gates) {
        expect(TECHNICAL_READINESS_GATES).toContain(gate);
      }
    }
  });

  it("cites at least one real basis marker per rule", () => {
    // A finding that cannot say what it was read from is an assertion, not a
    // derivation.
    for (const rule of TECHNICAL_READINESS_RULES) {
      expect(rule.basis.length).toBeGreaterThan(0);
      for (const marker of rule.basis) {
        expect(TECHNICAL_READINESS_BASIS_MARKERS).toContain(marker);
      }
    }
  });

  it("states a condition and a rationale for every rule", () => {
    for (const rule of TECHNICAL_READINESS_RULES) {
      expect(rule.description.length).toBeGreaterThan(10);
      expect(rule.condition.length).toBeGreaterThan(10);
      expect(rule.rationale.length).toBeGreaterThan(20);
    }
  });

  it("is resolvable by id, and refuses an id it does not define", () => {
    expect(technicalReadinessRule("TR-REQ-002")?.category).toBe("REQUIREMENT");
    expect(technicalReadinessRule("TR-NOT-REAL")).toBeNull();
  });

  it("derives blocking from the rule's own status rather than a second flag", () => {
    for (const rule of TECHNICAL_READINESS_RULES) {
      expect(isBlockingTechnicalRule(rule)).toBe(rule.status === "BLOCKING");
    }
  });

  it("covers every category the domain declares", () => {
    const covered = new Set(TECHNICAL_READINESS_RULES.map((rule) => rule.category));
    for (const category of TECHNICAL_READINESS_CATEGORIES) {
      expect(covered.has(category)).toBe(true);
    }
  });

  it("gives every gate at least one blocking rule and one always-emitted rule", () => {
    for (const gate of TECHNICAL_READINESS_GATES) {
      expect(blockingRuleIdsForGate(gate).length).toBeGreaterThan(0);
      // TR-SCP-001 always emits, so an empty finding list can only mean the
      // evaluation did not run.
      expect(rulesForGate(gate).map((rule) => rule.id)).toContain("TR-SCP-001");
    }
  });
});

describe("gate applicability", () => {
  it("returns rules in a stable registry order", () => {
    const first = rulesForGate("DESIGN_FREEZE").map((rule) => rule.id);
    const second = rulesForGate("DESIGN_FREEZE").map((rule) => rule.id);
    expect(first).toEqual(second);
  });

  it("orders rules by declaration, not alphabetically", () => {
    const declared = TECHNICAL_READINESS_RULES.filter((rule) =>
      ruleAppliesToGate(rule, "DESIGN_FREEZE"),
    ).map((rule) => rule.id);
    expect(rulesForGate("DESIGN_FREEZE").map((rule) => rule.id)).toEqual(declared);
  });

  it("tightens the requirement condition from review to freeze", () => {
    // The same recorded state carries a different weight at a later gate, and
    // that is two rules rather than one rule with a hidden branch.
    expect(technicalReadinessRule("TR-REQ-003")?.status).toBe("WARNING");
    expect(technicalReadinessRule("TR-REQ-003")?.gates).toContain("DESIGN_REVIEW");
    expect(technicalReadinessRule("TR-REQ-004")?.status).toBe("BLOCKING");
    expect(technicalReadinessRule("TR-REQ-004")?.gates).toContain("DESIGN_FREEZE");
    expect(technicalReadinessRule("TR-REQ-003")?.gates).not.toContain("DESIGN_FREEZE");
  });

  it("tightens the decision condition the same way", () => {
    expect(technicalReadinessRule("TR-DEC-001")?.status).toBe("WARNING");
    expect(technicalReadinessRule("TR-DEC-002")?.status).toBe("BLOCKING");
    expect(technicalReadinessRule("TR-DEC-002")?.gates).toEqual(
      expect.arrayContaining(["DESIGN_FREEZE", "VERIFICATION_READY", "RELEASE_READY"]),
    );
  });

  it("consumes verification readiness only at the gate that asks about it", () => {
    for (const ruleId of ["TR-VER-001", "TR-VER-002", "TR-VER-003", "TR-VER-004"]) {
      expect(technicalReadinessRule(ruleId)?.gates).toEqual(["VERIFICATION_READY"]);
    }
  });

  it("evaluates verification outcomes only at the release gate", () => {
    for (const ruleId of ["TR-VER-006", "TR-VER-007", "TR-VER-008", "TR-EVD-001"]) {
      expect(technicalReadinessRule(ruleId)?.gates).toEqual(["RELEASE_READY"]);
    }
  });

  it("keeps the deliberate non-blocking boundaries", () => {
    // Each of these would be wrong as a blocker, and the registry records why.
    expect(technicalReadinessRule("TR-TRC-002")?.status).toBe("WARNING");
    expect(technicalReadinessRule("TR-DES-005")?.status).toBe("WARNING");
    expect(technicalReadinessRule("TR-VER-008")?.status).toBe("WARNING");
    expect(technicalReadinessRule("TR-ISS-004")?.status).toBe("INFORMATIONAL");
  });

  it("never ranks a risk, because the model records no severity", () => {
    for (const ruleId of ["TR-RSK-001", "TR-RSK-002", "TR-RSK-003"]) {
      expect(technicalReadinessRule(ruleId)?.basis).toContain("RISK_SEVERITY_NOT_MODELLED");
    }
  });

  it("reads issue severity, which a person actually recorded", () => {
    expect(technicalReadinessRule("TR-ISS-001")?.basis).toContain("ISSUE_SEVERITY");
    expect(technicalReadinessRule("TR-ISS-001")?.gates).toEqual([...TECHNICAL_READINESS_GATES]);
  });

  it("treats missing information as indeterminate rather than as a pass", () => {
    expect(technicalReadinessRule("TR-ASM-004")?.status).toBe("UNKNOWN");
    expect(technicalReadinessRule("TR-CHG-001")?.status).toBe("UNKNOWN");
    expect(technicalReadinessRule("TR-CHG-003")?.status).toBe("UNKNOWN");
    expect(technicalReadinessRule("TR-VER-002")?.status).toBe("UNKNOWN");
    expect(technicalReadinessRule("TR-VER-004")?.status).toBe("UNKNOWN");
  });

  it("lists rule ids deterministically", () => {
    expect(technicalReadinessRuleIds()).toEqual([...technicalReadinessRuleIds()].sort());
  });
});

// --- Severity ---------------------------------------------------------------

describe("severity", () => {
  it("is a one-to-one restatement of the finding status", () => {
    expect(severityForTechnicalFindingStatus("BLOCKING")).toBe("BLOCKER");
    expect(severityForTechnicalFindingStatus("WARNING")).toBe("ADVISORY");
    expect(severityForTechnicalFindingStatus("INFORMATIONAL")).toBe("NOTE");
    expect(severityForTechnicalFindingStatus("UNKNOWN")).toBe("INDETERMINATE");
  });

  it("introduces no judgement of its own", () => {
    const mapped = TECHNICAL_READINESS_FINDING_STATUSES.map(severityForTechnicalFindingStatus);
    expect(new Set(mapped).size).toBe(TECHNICAL_READINESS_FINDING_STATUSES.length);
  });
});

// --- Status precedence ------------------------------------------------------

function outcomes(
  ...statuses: TechnicalReadinessFindingStatus[]
): Array<{ status: TechnicalReadinessFindingStatus }> {
  return statuses.map((status) => ({ status }));
}

describe("gate verdict precedence", () => {
  it("ranks blocking above unknown above the advisory statuses", () => {
    expect(TECHNICAL_FINDING_STATUS_PRECEDENCE.BLOCKING).toBeGreaterThan(
      TECHNICAL_FINDING_STATUS_PRECEDENCE.UNKNOWN,
    );
    expect(TECHNICAL_FINDING_STATUS_PRECEDENCE.UNKNOWN).toBeGreaterThan(
      TECHNICAL_FINDING_STATUS_PRECEDENCE.WARNING,
    );
    expect(TECHNICAL_FINDING_STATUS_PRECEDENCE.WARNING).toBeGreaterThan(
      TECHNICAL_FINDING_STATUS_PRECEDENCE.INFORMATIONAL,
    );
  });

  it("is READY when everything was evaluated and nothing blocks", () => {
    expect(technicalReadinessStatusFor(outcomes("INFORMATIONAL", "INFORMATIONAL"))).toBe("READY");
  });

  it("is NOT_READY as soon as one condition blocks", () => {
    expect(technicalReadinessStatusFor(outcomes("INFORMATIONAL", "BLOCKING"))).toBe("NOT_READY");
  });

  it("is UNKNOWN when nothing blocks but something could not be determined", () => {
    expect(technicalReadinessStatusFor(outcomes("INFORMATIONAL", "UNKNOWN"))).toBe("UNKNOWN");
  });

  it("lets blocking outrank unknown", () => {
    expect(technicalReadinessStatusFor(outcomes("UNKNOWN", "BLOCKING"))).toBe("NOT_READY");
  });

  it("does not let a warning change the verdict", () => {
    expect(technicalReadinessStatusFor(outcomes("WARNING", "INFORMATIONAL"))).toBe("READY");
    expect(technicalReadinessStatusFor(outcomes("WARNING", "WARNING"))).toBe("READY");
  });

  it("refuses to let silence produce READY", () => {
    // Every gate has rules that always emit, so no findings means the
    // evaluation did not happen.
    expect(technicalReadinessStatusFor([])).toBe("UNKNOWN");
  });

  it("only ever produces a declared status", () => {
    for (const combination of [
      outcomes("BLOCKING"),
      outcomes("UNKNOWN"),
      outcomes("WARNING"),
      outcomes("INFORMATIONAL"),
      [],
    ]) {
      expect(TECHNICAL_READINESS_STATUSES).toContain(
        technicalReadinessStatusFor(combination),
      );
    }
  });
});

describe("finding ordering", () => {
  const finding = (
    status: TechnicalReadinessFindingStatus,
    ruleId: string,
    subjectId: string,
  ): Pick<TechnicalReadinessFinding, "status" | "ruleId" | "subjectType" | "subjectId"> => ({
    status,
    ruleId,
    subjectType: "REQUIREMENT",
    subjectId,
  });

  it("leads with blocking, then unknown, then advisory", () => {
    const ordered = [
      finding("INFORMATIONAL", "TR-REQ-006", "a"),
      finding("BLOCKING", "TR-REQ-002", "b"),
      finding("WARNING", "TR-TRC-002", "c"),
      finding("UNKNOWN", "TR-ASM-004", "d"),
    ].sort(compareTechnicalFindings);

    expect(ordered.map((f) => f.status)).toEqual([
      "BLOCKING",
      "UNKNOWN",
      "WARNING",
      "INFORMATIONAL",
    ]);
  });

  it("is a total order — two shuffles of the same set sort identically", () => {
    const set = [
      finding("BLOCKING", "TR-DEC-002", "d1"),
      finding("BLOCKING", "TR-REQ-002", "r1"),
      finding("UNKNOWN", "TR-CHG-001", "c1"),
      finding("WARNING", "TR-DES-003", "x1"),
      finding("INFORMATIONAL", "TR-REQ-006", "r2"),
    ];
    const forward = [...set].sort(compareTechnicalFindings).map((f) => f.ruleId + f.subjectId);
    const reverse = [...set]
      .reverse()
      .sort(compareTechnicalFindings)
      .map((f) => f.ruleId + f.subjectId);
    expect(forward).toEqual(reverse);
  });
});

describe("basis markers", () => {
  it("deduplicates and sorts, so identical findings carry identical lists", () => {
    expect(
      normalizeTechnicalBasis([
        "REQUIREMENT_LIFECYCLE_STATE",
        "PROJECT_SCOPE",
        "REQUIREMENT_LIFECYCLE_STATE",
      ]),
    ).toEqual(["PROJECT_SCOPE", "REQUIREMENT_LIFECYCLE_STATE"]);
  });
});

// --- Scope and fingerprint --------------------------------------------------

function scopeObject(
  overrides: Partial<TechnicalScopeObject> = {},
): TechnicalScopeObject {
  return {
    role: "REQUIREMENT",
    type: "REQUIREMENT",
    id: "req1",
    identifier: "REQ-001",
    state: "APPROVED",
    revision: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

function scope(overrides: Partial<TechnicalReadinessScope> = {}): TechnicalReadinessScope {
  const counts = emptyScopeCounts();
  counts.REQUIREMENT = 1;

  return {
    gate: "DESIGN_REVIEW",
    label: "Current active engineering scope",
    counts,
    objects: [scopeObject()],
    relationships: [
      {
        edgeType: "REQUIREMENT_ALLOCATED_TO_DESIGN",
        relationshipId: "rel1",
        fromType: "REQUIREMENT",
        fromId: "req1",
        toType: "DESIGN_ITEM",
        toId: "di1",
      },
    ],
    consumed: {
      verificationReadiness: [],
      changeImpact: [],
      assumptionMonitoring: [],
    },
    ...overrides,
  };
}

describe("scope roles", () => {
  it("names every kind of object a gate can be evaluated against", () => {
    expect(Object.keys(emptyScopeCounts()).sort()).toEqual([...TECHNICAL_SCOPE_ROLES].sort());
  });

  it("starts every count at zero rather than at a guess", () => {
    expect(Object.values(emptyScopeCounts()).every((count) => count === 0)).toBe(true);
  });
});

describe("the gate fingerprint", () => {
  it("is deterministic — the same scope digests identically", () => {
    expect(technicalReadinessFingerprint(scope())).toBe(technicalReadinessFingerprint(scope()));
  });

  it("does not depend on the order objects were collected in", () => {
    const two = scope({
      objects: [scopeObject(), scopeObject({ id: "req2", identifier: "REQ-002" })],
    });
    const reversed = scope({ objects: [...two.objects].reverse() });
    expect(technicalReadinessFingerprint(reversed)).toBe(technicalReadinessFingerprint(two));
  });

  it("never mixes in the current time", () => {
    // Two digests taken a moment apart from the same scope must match, or every
    // assessment would be stale the instant it was written.
    expect(technicalReadinessFingerprint(scope())).toBe(technicalReadinessFingerprint(scope()));
  });

  it("distinguishes two gates over the same project state", () => {
    expect(technicalReadinessFingerprint(scope({ gate: "DESIGN_FREEZE" }))).not.toBe(
      technicalReadinessFingerprint(scope()),
    );
  });

  it("moves when a scope object's recorded state changes", () => {
    const after = technicalReadinessFingerprint(
      scope({ objects: [scopeObject({ state: "DRAFT" })] }),
    );
    expect(after).not.toBe(technicalReadinessFingerprint(scope()));
  });

  it("moves when a scope object is revised without changing state", () => {
    const after = technicalReadinessFingerprint(
      scope({ objects: [scopeObject({ revision: "2026-06-01T00:00:00.000Z" })] }),
    );
    expect(after).not.toBe(technicalReadinessFingerprint(scope()));
  });

  it("moves when an object enters or leaves the scope", () => {
    expect(technicalReadinessFingerprint(scope({ objects: [] }))).not.toBe(
      technicalReadinessFingerprint(scope()),
    );
  });

  it("moves when a relationship row is added or removed", () => {
    expect(technicalReadinessFingerprint(scope({ relationships: [] }))).not.toBe(
      technicalReadinessFingerprint(scope()),
    );
  });

  it("moves when a consumed verification-readiness verdict changes", () => {
    const ready = technicalReadinessFingerprint(
      scope({
        consumed: {
          verificationReadiness: [
            {
              verificationActivityId: "va1",
              assessmentId: "vra1",
              status: "READY",
              freshness: "CURRENT",
              blockingCount: 0,
            },
          ],
          changeImpact: [],
          assumptionMonitoring: [],
        },
      }),
    );
    const stale = technicalReadinessFingerprint(
      scope({
        consumed: {
          verificationReadiness: [
            {
              verificationActivityId: "va1",
              assessmentId: "vra1",
              status: "READY",
              freshness: "STALE",
              blockingCount: 0,
            },
          ],
          changeImpact: [],
          assumptionMonitoring: [],
        },
      }),
    );
    expect(stale).not.toBe(ready);
  });

  it("moves when a consumed impact analysis stops being current", () => {
    const build = (analysisFreshness: "CURRENT" | "STALE") =>
      technicalReadinessFingerprint(
        scope({
          consumed: {
            verificationReadiness: [],
            changeImpact: [
              {
                changeRequestId: "chg1",
                identifier: "CR-001",
                status: "UNDER_REVIEW",
                analysisId: "ana1",
                analysisFreshness,
                reachedScopeKeys: ["REQUIREMENT:req1"],
              },
            ],
            assumptionMonitoring: [],
          },
        }),
      );
    expect(build("STALE")).not.toBe(build("CURRENT"));
  });

  it("moves when assumption monitoring records a new verdict", () => {
    const build = (monitoringStatus: "CURRENT" | "REVIEW_REQUIRED") =>
      technicalReadinessFingerprint(
        scope({
          consumed: {
            verificationReadiness: [],
            changeImpact: [],
            assumptionMonitoring: [
              {
                assumptionId: "asm1",
                decisionId: "ed1",
                monitoringStatus,
                assumptionStatus: "VALIDATED",
              },
            ],
          },
        }),
      );
    expect(build("REVIEW_REQUIRED")).not.toBe(build("CURRENT"));
  });

  it("is insensitive to display metadata that is not part of the basis", () => {
    // An identifier is display text; it moves only alongside a revision.
    const renamed = technicalReadinessFingerprint(
      scope({ objects: [scopeObject({ identifier: "REQ-001 (renamed)" })] }),
    );
    expect(renamed).toBe(technicalReadinessFingerprint(scope()));
  });

  it("contains nothing that describes the project as a whole", () => {
    // The point of a scope-specific digest: an artifact outside the evaluated
    // scope has no representation in the input, so it cannot move the result.
    const withExtra = scope({
      objects: [scopeObject(), scopeObject({ id: "req9", identifier: "REQ-009" })],
    });
    expect(technicalReadinessFingerprint(withExtra)).not.toBe(
      technicalReadinessFingerprint(scope()),
    );
    // ...and removing it returns to exactly the original digest.
    expect(
      technicalReadinessFingerprint(scope({ objects: [scopeObject()] })),
    ).toBe(technicalReadinessFingerprint(scope()));
  });
});

describe("freshness", () => {
  it("is CURRENT only when the digests match under the same version", () => {
    expect(technicalReadinessFreshnessOf("abc", "abc", TECHNICAL_READINESS_VERSION)).toBe(
      "CURRENT",
    );
  });

  it("is STALE when the scope has moved", () => {
    expect(technicalReadinessFreshnessOf("abc", "def", TECHNICAL_READINESS_VERSION)).toBe(
      "STALE",
    );
  });

  it("is UNKNOWN across rule versions rather than guessing compatibility", () => {
    expect(technicalReadinessFreshnessOf("abc", "abc", "0")).toBe("UNKNOWN");
  });

  it("is UNKNOWN when either digest is missing", () => {
    expect(technicalReadinessFreshnessOf("", "abc", TECHNICAL_READINESS_VERSION)).toBe("UNKNOWN");
    expect(technicalReadinessFreshnessOf("abc", "", TECHNICAL_READINESS_VERSION)).toBe("UNKNOWN");
  });
});

// --- Contracts --------------------------------------------------------------

describe("the evaluation request contract", () => {
  it("accepts a gate", () => {
    expect(
      evaluateTechnicalReadinessRequestSchema.safeParse({ gate: "DESIGN_FREEZE" }).success,
    ).toBe(true);
  });

  it("rejects a gate it does not define", () => {
    expect(
      evaluateTechnicalReadinessRequestSchema.safeParse({ gate: "CERTIFICATION_READY" }).success,
    ).toBe(false);
    expect(evaluateTechnicalReadinessRequestSchema.safeParse({}).success).toBe(false);
  });

  it("rejects any attempt to supply a verdict, a rule or an identity", () => {
    // Rule selection belongs to the backend. A client that tries to influence
    // it is refused outright rather than having the field quietly dropped.
    for (const attempt of [
      { gate: "DESIGN_REVIEW", status: "READY" },
      { gate: "DESIGN_REVIEW", rules: ["TR-REQ-002"] },
      { gate: "DESIGN_REVIEW", findings: [] },
      { gate: "DESIGN_REVIEW", organizationId: "org9" },
      { gate: "DESIGN_REVIEW", projectId: "proj9" },
      { gate: "DESIGN_REVIEW", evaluatedById: "user9" },
      { gate: "DESIGN_REVIEW", readinessVersion: "99" },
    ]) {
      expect(evaluateTechnicalReadinessRequestSchema.safeParse(attempt).success).toBe(false);
    }
  });
});
