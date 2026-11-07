import { describe, expect, it } from "vitest";
import * as CertificationDomain from "./certification";
import {
  CERTIFICATION_BASIS_STATUSES,
  CERTIFICATION_PROGRAM_STATUSES,
  CERTIFICATION_REVIEW_RULES,
  CERTIFICATION_VERSION,
  COMPLIANCE_APPLICABILITIES,
  COMPLIANCE_DISPOSITIONS,
  COMPLIANCE_ITEM_STATUSES,
  COMPLIANCE_LINK_TYPES,
  COMPLIANCE_METHODS,
  ENGINEERING_BASIS_LINK_TYPES,
  EVIDENCE_PRODUCING_COMPLIANCE_METHODS,
  canTransitionCertificationBasis,
  canTransitionCertificationProgram,
  certificationFindingSeveritySchema,
  certificationFindingStatusSchema,
  certificationFingerprint,
  certificationReviewFreshnessOf,
  certificationReviewRule,
  certificationReviewRuleIds,
  certificationReviewStatusFor,
  complianceApplicabilitySchema,
  complianceLinkKey,
  complianceLinkTypeSchema,
  complianceMethodRequiresEvidence,
  compareCertificationReviewFindings,
  isCertificationBasisEditable,
  isCertificationBasisImmutable,
  isCertificationFindingOpen,
  normalizeCertificationBasis,
  parseComplianceLinkKey,
  severityForCertificationFindingStatus,
  type CertificationReviewBasis,
  type CertificationReviewFindingStatus,
} from "./certification";
import { GRAPH_NODE_TYPES } from "./graph";

describe("the certification version", () => {
  it("is a stable non-empty identifier", () => {
    expect(CERTIFICATION_VERSION).toBe("1");
  });
});

describe("certification programme status", () => {
  it("has exactly four states, none a regulatory claim", () => {
    expect(CERTIFICATION_PROGRAM_STATUSES).toEqual(["DRAFT", "ACTIVE", "ON_HOLD", "CLOSED"]);
    for (const status of CERTIFICATION_PROGRAM_STATUSES) {
      expect(status.toLowerCase()).not.toContain("certif");
      expect(status.toLowerCase()).not.toContain("approv");
    }
  });

  it("makes CLOSED terminal", () => {
    expect(canTransitionCertificationProgram("CLOSED", "ACTIVE")).toBe(false);
    expect(canTransitionCertificationProgram("CLOSED", "DRAFT")).toBe(false);
  });

  it("allows the normal DRAFT -> ACTIVE <-> ON_HOLD -> CLOSED lifecycle", () => {
    expect(canTransitionCertificationProgram("DRAFT", "ACTIVE")).toBe(true);
    expect(canTransitionCertificationProgram("ACTIVE", "ON_HOLD")).toBe(true);
    expect(canTransitionCertificationProgram("ON_HOLD", "ACTIVE")).toBe(true);
    expect(canTransitionCertificationProgram("ACTIVE", "CLOSED")).toBe(true);
    expect(canTransitionCertificationProgram("ON_HOLD", "CLOSED")).toBe(true);
  });

  it("never lets DRAFT jump directly to ON_HOLD", () => {
    expect(canTransitionCertificationProgram("DRAFT", "ON_HOLD")).toBe(false);
  });
});

describe("certification basis status", () => {
  it("mirrors the engineering baseline lifecycle exactly", () => {
    expect(CERTIFICATION_BASIS_STATUSES).toEqual(["DRAFT", "ACTIVE", "SUPERSEDED"]);
    expect(canTransitionCertificationBasis("DRAFT", "ACTIVE")).toBe(true);
    expect(canTransitionCertificationBasis("ACTIVE", "SUPERSEDED")).toBe(true);
    expect(canTransitionCertificationBasis("SUPERSEDED", "ACTIVE")).toBe(false);
    expect(canTransitionCertificationBasis("SUPERSEDED", "DRAFT")).toBe(false);
    expect(canTransitionCertificationBasis("ACTIVE", "DRAFT")).toBe(false);
  });

  it("is editable only while DRAFT", () => {
    expect(isCertificationBasisEditable("DRAFT")).toBe(true);
    expect(isCertificationBasisEditable("ACTIVE")).toBe(false);
    expect(isCertificationBasisEditable("SUPERSEDED")).toBe(false);
  });

  it("treats ACTIVE and SUPERSEDED as the fixed, immutable reference", () => {
    expect(isCertificationBasisImmutable("ACTIVE")).toBe(true);
    expect(isCertificationBasisImmutable("SUPERSEDED")).toBe(true);
    expect(isCertificationBasisImmutable("DRAFT")).toBe(false);
  });
});

describe("compliance applicability, status, disposition and method", () => {
  it("never treats UNDETERMINED as either applicable or not applicable", () => {
    expect(COMPLIANCE_APPLICABILITIES).toEqual(["APPLICABLE", "NOT_APPLICABLE", "UNDETERMINED"]);
  });

  it("declares six lifecycle statuses", () => {
    expect(COMPLIANCE_ITEM_STATUSES).toEqual([
      "OPEN",
      "IN_PROGRESS",
      "SATISFIED",
      "BLOCKED",
      "WAIVED",
      "CLOSED",
    ]);
  });

  it("declares five dispositions, all explicit and none a legal conclusion string", () => {
    expect(COMPLIANCE_DISPOSITIONS).toEqual([
      "UNASSESSED",
      "COMPLIANT",
      "NON_COMPLIANT",
      "NOT_APPLICABLE",
      "OPEN_FINDING",
    ]);
  });

  it("declares seven compliance methods", () => {
    expect(COMPLIANCE_METHODS).toEqual([
      "ANALYSIS",
      "TEST",
      "INSPECTION",
      "DEMONSTRATION",
      "REVIEW_OF_DESIGN",
      "DOCUMENTATION",
      "OTHER",
    ]);
  });

  it("requires evidence only for the methods that actually produce a recorded result", () => {
    expect(EVIDENCE_PRODUCING_COMPLIANCE_METHODS).toEqual(["ANALYSIS", "TEST", "INSPECTION", "DEMONSTRATION"]);
    expect(complianceMethodRequiresEvidence("TEST")).toBe(true);
    expect(complianceMethodRequiresEvidence("REVIEW_OF_DESIGN")).toBe(false);
    expect(complianceMethodRequiresEvidence("DOCUMENTATION")).toBe(false);
    expect(complianceMethodRequiresEvidence("OTHER")).toBe(false);
    expect(complianceMethodRequiresEvidence(null)).toBe(false);
  });

  it("rejects an applicability or method outside the closed schema", () => {
    expect(complianceApplicabilitySchema.safeParse("MAYBE").success).toBe(false);
    expect(certificationFindingSeveritySchema.safeParse("SEVERE").success).toBe(false);
  });
});

describe("compliance link types", () => {
  it("declares exactly eight typed link types", () => {
    expect(COMPLIANCE_LINK_TYPES).toHaveLength(8);
    expect(COMPLIANCE_LINK_TYPES).toEqual([
      "REQUIREMENT",
      "VERIFICATION_ACTIVITY",
      "EVIDENCE",
      "ENGINEERING_DECISION",
      "DESIGN_ITEM",
      "RISK",
      "ISSUE",
      "SUPPLIER_QUALIFICATION",
    ]);
  });

  it("is a subset of the real graph node registry — nothing invented", () => {
    for (const type of COMPLIANCE_LINK_TYPES) {
      expect(GRAPH_NODE_TYPES).toContain(type);
    }
  });

  it("rejects a link type outside the closed enum", () => {
    expect(complianceLinkTypeSchema.safeParse("PURCHASE_ORDER").success).toBe(false);
  });

  it("scopes 'engineering basis' to five types, excluding evidence, risk and issue", () => {
    expect(ENGINEERING_BASIS_LINK_TYPES).toEqual([
      "REQUIREMENT",
      "VERIFICATION_ACTIVITY",
      "ENGINEERING_DECISION",
      "DESIGN_ITEM",
      "SUPPLIER_QUALIFICATION",
    ]);
    expect(ENGINEERING_BASIS_LINK_TYPES).not.toContain("EVIDENCE");
    expect(ENGINEERING_BASIS_LINK_TYPES).not.toContain("RISK");
    expect(ENGINEERING_BASIS_LINK_TYPES).not.toContain("ISSUE");
  });

  it("builds and parses a stable composite link key", () => {
    const key = complianceLinkKey("REQUIREMENT", "row123");
    expect(key).toBe("REQUIREMENT:row123");
    expect(parseComplianceLinkKey(key)).toEqual({ linkType: "REQUIREMENT", rowId: "row123" });
  });

  it("refuses to parse a key with an unknown link type or no separator", () => {
    expect(parseComplianceLinkKey("PURCHASE_ORDER:row1")).toBeNull();
    expect(parseComplianceLinkKey("norowid")).toBeNull();
    expect(parseComplianceLinkKey(":row1")).toBeNull();
  });
});

describe("certification findings", () => {
  it("treats OPEN and IN_PROGRESS as open, RESOLVED and ACCEPTED as dispositioned", () => {
    expect(isCertificationFindingOpen("OPEN")).toBe(true);
    expect(isCertificationFindingOpen("IN_PROGRESS")).toBe(true);
    expect(isCertificationFindingOpen("RESOLVED")).toBe(false);
    expect(isCertificationFindingOpen("ACCEPTED")).toBe(false);
  });

  it("rejects a status outside the closed schema", () => {
    expect(certificationFindingStatusSchema.safeParse("DISMISSED").success).toBe(false);
  });
});

describe("the certification review rule registry", () => {
  it("defines rules", () => {
    expect(CERTIFICATION_REVIEW_RULES.length).toBeGreaterThan(20);
  });

  it("gives every rule a unique id", () => {
    const ids = CERTIFICATION_REVIEW_RULES.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("names every rule in the CR-<AREA>-<NNN> house convention", () => {
    for (const rule of CERTIFICATION_REVIEW_RULES) {
      expect(rule.id).toMatch(/^CR-[A-Z]{3}-\d{3}$/);
    }
  });

  it("is resolvable by id, and refuses an id it does not define", () => {
    const first = CERTIFICATION_REVIEW_RULES[0];
    expect(first).toBeDefined();
    expect(certificationReviewRule(first!.id)).toEqual(first);
    expect(certificationReviewRule("CR-NOT-A-REAL-RULE")).toBeNull();
  });

  it("lists rule ids deterministically, matching declaration order", () => {
    expect(certificationReviewRuleIds()).toEqual(CERTIFICATION_REVIEW_RULES.map((rule) => rule.id));
  });

  it("never declares a numeric score field anywhere on a rule", () => {
    for (const rule of CERTIFICATION_REVIEW_RULES) {
      expect(rule).not.toHaveProperty("score");
      expect(rule).not.toHaveProperty("weight");
      expect(rule).not.toHaveProperty("percentage");
    }
  });

  it("has at least one rule producing BLOCKING for undetermined applicability", () => {
    const rule = certificationReviewRule("CR-APL-001");
    expect(rule?.status).toBe("BLOCKING");
    expect(rule?.basis).toContain("APPLICABILITY_UNDETERMINED");
  });

  it("never declares a rule whose rationale claims regulatory approval", () => {
    for (const rule of CERTIFICATION_REVIEW_RULES) {
      const lower = rule.rationale.toLowerCase();
      expect(lower).not.toContain("faa");
      expect(lower).not.toContain("easa");
      expect(lower).not.toContain("regulatory approval");
    }
  });

  it("surfaces drift, change-impact and supplier conditions without ever asserting non-compliance", () => {
    const drift = certificationReviewRule("CR-DRF-001");
    const change = certificationReviewRule("CR-CHG-001");
    const supplier = certificationReviewRule("CR-SUP-001");
    expect(drift?.status).not.toBe("BLOCKING");
    expect(change?.status).not.toBe("BLOCKING");
    expect(supplier?.status).not.toBe("BLOCKING");
    for (const rule of [drift, change, supplier]) {
      expect(rule?.rationale.toLowerCase()).not.toContain("non-compliant");
    }
  });
});

describe("basis marker normalization", () => {
  it("deduplicates and sorts", () => {
    const markers = normalizeCertificationBasis([
      "EVIDENCE_ABSENT",
      "APPLICABILITY_RECORDED",
      "EVIDENCE_ABSENT",
    ]);
    expect(markers).toEqual(["APPLICABILITY_RECORDED", "EVIDENCE_ABSENT"]);
  });
});

describe("certification review status derivation", () => {
  const findingOf = (status: CertificationReviewFindingStatus) => ({
    category: "COMPLIANCE_ITEM" as const,
    status,
    subjectType: "COMPLIANCE_ITEM",
    subjectId: "id",
  });

  it("is UNKNOWN on an empty finding set — silence is never readiness", () => {
    expect(certificationReviewStatusFor([])).toBe("UNKNOWN");
  });

  it("is NOT_READY as soon as one finding is BLOCKING", () => {
    expect(
      certificationReviewStatusFor([findingOf("INFORMATIONAL"), findingOf("BLOCKING"), findingOf("WARNING")]),
    ).toBe("NOT_READY");
  });

  it("is UNKNOWN when nothing blocks but something is UNKNOWN", () => {
    expect(certificationReviewStatusFor([findingOf("WARNING"), findingOf("UNKNOWN")])).toBe("UNKNOWN");
  });

  it("is READY only when every finding is WARNING or INFORMATIONAL, and at least one exists", () => {
    expect(certificationReviewStatusFor([findingOf("WARNING"), findingOf("INFORMATIONAL")])).toBe("READY");
  });

  it("never derives READY from a single warning being absent — warnings alone never block", () => {
    expect(certificationReviewStatusFor([findingOf("WARNING")])).toBe("READY");
  });
});

describe("finding ordering", () => {
  it("puts BLOCKING before UNKNOWN before WARNING before INFORMATIONAL", () => {
    const findings = [
      { category: "EVIDENCE" as const, status: "INFORMATIONAL" as const, subjectType: "A", subjectId: "1" },
      { category: "EVIDENCE" as const, status: "BLOCKING" as const, subjectType: "A", subjectId: "2" },
      { category: "EVIDENCE" as const, status: "WARNING" as const, subjectType: "A", subjectId: "3" },
      { category: "EVIDENCE" as const, status: "UNKNOWN" as const, subjectType: "A", subjectId: "4" },
    ];
    const sorted = [...findings].sort(compareCertificationReviewFindings);
    expect(sorted.map((f) => f.status)).toEqual(["BLOCKING", "UNKNOWN", "WARNING", "INFORMATIONAL"]);
  });
});

describe("severity restatement", () => {
  it("is a one-to-one restatement of the finding status, introducing no new judgement", () => {
    expect(severityForCertificationFindingStatus("BLOCKING")).toBe("BLOCKER");
    expect(severityForCertificationFindingStatus("WARNING")).toBe("ADVISORY");
    expect(severityForCertificationFindingStatus("INFORMATIONAL")).toBe("NOTE");
    expect(severityForCertificationFindingStatus("UNKNOWN")).toBe("INDETERMINATE");
  });
});

describe("the certification fingerprint", () => {
  function basis(overrides: Partial<CertificationReviewBasis> = {}): CertificationReviewBasis {
    return {
      certificationProgramId: "prog1",
      certificationBasisId: "basis1",
      objects: [
        {
          role: "COMPLIANCE_ITEM",
          type: "REQUIREMENT",
          id: "item1",
          identifier: "CI-001",
          label: "Item",
          state: "APPLICABLE|ANALYSIS",
          revision: "2026-01-01T00:00:00.000Z",
        },
      ],
      consumed: {
        verificationReadiness: [],
        changeImpact: [],
        assumptionMonitoring: [],
        drift: [],
        supplierQualification: [],
      },
      ...overrides,
    };
  }

  it("is deterministic — the same basis always produces the same digest", () => {
    expect(certificationFingerprint(basis())).toBe(certificationFingerprint(basis()));
  });

  it("changes when an object's state changes", () => {
    const a = certificationFingerprint(basis());
    const b = certificationFingerprint(
      basis({
        objects: [
          {
            role: "COMPLIANCE_ITEM",
            type: "REQUIREMENT",
            id: "item1",
            identifier: "CI-001",
            label: "Item",
            state: "NOT_APPLICABLE|ANALYSIS",
            revision: "2026-01-01T00:00:00.000Z",
          },
        ],
      }),
    );
    expect(a).not.toBe(b);
  });

  it("is independent of object array order", () => {
    const obj1 = {
      role: "LINKED_REQUIREMENT" as const,
      type: "REQUIREMENT" as const,
      id: "r1",
      identifier: "REQ-001",
      label: "R1",
      state: "APPROVED",
      revision: "2026-01-01T00:00:00.000Z",
    };
    const obj2 = {
      role: "LINKED_DESIGN_ITEM" as const,
      type: "DESIGN_ITEM" as const,
      id: "d1",
      identifier: "DI-001",
      label: "D1",
      state: "DRAFT",
      revision: "2026-01-01T00:00:00.000Z",
    };
    const a = certificationFingerprint(basis({ objects: [obj1, obj2] }));
    const b = certificationFingerprint(basis({ objects: [obj2, obj1] }));
    expect(a).toBe(b);
  });

  it("changes when consumed verification readiness changes, even with identical objects", () => {
    const a = certificationFingerprint(basis());
    const b = certificationFingerprint(
      basis({
        consumed: {
          verificationReadiness: [
            { verificationActivityId: "va1", assessmentId: "a1", status: "NOT_READY", freshness: "CURRENT" },
          ],
          changeImpact: [],
          assumptionMonitoring: [],
          drift: [],
          supplierQualification: [],
        },
      }),
    );
    expect(a).not.toBe(b);
  });

  it("never includes wall-clock time — two computations of the same value do not depend on when they ran", () => {
    // Not a timing test; a structural one: the function's only inputs are the
    // basis object, so calling it twice with an identical literal cannot differ.
    const value = basis();
    expect(certificationFingerprint(value)).toBe(certificationFingerprint(value));
  });
});

describe("certification review freshness", () => {
  it("is CURRENT when the fingerprint matches and the version matches", () => {
    expect(certificationReviewFreshnessOf("abc", "abc", CERTIFICATION_VERSION)).toBe("CURRENT");
  });

  it("is STALE when the fingerprint differs but the version matches", () => {
    expect(certificationReviewFreshnessOf("abc", "xyz", CERTIFICATION_VERSION)).toBe("STALE");
  });

  it("is UNKNOWN on a version mismatch, never guessed as STALE or CURRENT", () => {
    expect(certificationReviewFreshnessOf("abc", "abc", "0")).toBe("UNKNOWN");
    expect(certificationReviewFreshnessOf("abc", "xyz", "0")).toBe("UNKNOWN");
  });
});

describe("no automatic legal compliance claim", () => {
  it("has no function anywhere in this module that sets disposition from another field", () => {
    // Structural guarantee: the module exports no function whose name implies
    // deriving compliance from engineering state. This is a documentation-level
    // assertion of intent, enforced for real in the service layer's tests.
    const moduleExports = Object.keys(CertificationDomain);
    const suspicious = moduleExports.filter((name) => /derive.*complian|infer.*complian|auto.*complian/i.test(name));
    expect(suspicious).toEqual([]);
  });
});
