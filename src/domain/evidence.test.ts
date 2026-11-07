import { describe, expect, it } from "vitest";
import {
  EVIDENCE_RELATIONS,
  EVIDENCE_TRANSITIONS,
  allowedEvidenceTransitions,
  areEvidenceLinksEditable,
  canTransitionEvidence,
  createEvidenceRequestSchema,
  evidenceLinkKey,
  evidenceLinkRequestSchema,
  evidenceRelationLabel,
  evidenceStatusLabel,
  evidenceTypeLabel,
  isEvidenceContentEditable,
  parseEvidenceLinkKey,
  supersedeEvidenceRequestSchema,
  updateEvidenceRequestSchema,
  validateEvidenceRequestSchema,
} from "./evidence";
import { EVIDENCE_STATUSES, EVIDENCE_TYPES } from "./shared/enums";

describe("evidence lifecycle", () => {
  it("allows DRAFT to move to VALIDATED or SUPERSEDED", () => {
    expect(allowedEvidenceTransitions("DRAFT")).toEqual(["VALIDATED", "SUPERSEDED"]);
    expect(canTransitionEvidence("DRAFT", "VALIDATED")).toBe(true);
    expect(canTransitionEvidence("DRAFT", "SUPERSEDED")).toBe(true);
  });

  it("allows VALIDATED to move only to SUPERSEDED", () => {
    expect(allowedEvidenceTransitions("VALIDATED")).toEqual(["SUPERSEDED"]);
    expect(canTransitionEvidence("VALIDATED", "SUPERSEDED")).toBe(true);
    expect(canTransitionEvidence("VALIDATED", "DRAFT")).toBe(false);
  });

  it("makes SUPERSEDED terminal — no reopen", () => {
    expect(allowedEvidenceTransitions("SUPERSEDED")).toEqual([]);
    expect(canTransitionEvidence("SUPERSEDED", "DRAFT")).toBe(false);
    expect(canTransitionEvidence("SUPERSEDED", "VALIDATED")).toBe(false);
  });

  it("rejects a self-transition for every status", () => {
    for (const status of EVIDENCE_STATUSES) {
      expect(canTransitionEvidence(status, status)).toBe(false);
    }
  });

  it("covers every status in the transition table", () => {
    for (const status of EVIDENCE_STATUSES) {
      expect(EVIDENCE_TRANSITIONS[status]).toBeDefined();
    }
  });
});

describe("editability", () => {
  it("content is editable only while DRAFT", () => {
    expect(isEvidenceContentEditable("DRAFT")).toBe(true);
    expect(isEvidenceContentEditable("VALIDATED")).toBe(false);
    expect(isEvidenceContentEditable("SUPERSEDED")).toBe(false);
  });

  it("links remain editable through VALIDATED, frozen only at SUPERSEDED", () => {
    expect(areEvidenceLinksEditable("DRAFT")).toBe(true);
    expect(areEvidenceLinksEditable("VALIDATED")).toBe(true);
    expect(areEvidenceLinksEditable("SUPERSEDED")).toBe(false);
  });
});

describe("createEvidenceRequestSchema", () => {
  const base = {
    identifier: "EV-001",
    title: "Hot fire report",
    evidenceType: "TEST_RESULT",
    sourceReference: "TR-2026-014",
  };

  it("accepts a minimal valid request", () => {
    expect(createEvidenceRequestSchema.safeParse(base).success).toBe(true);
  });

  it("rejects status, recordedById, organizationId, actorId and timestamps", () => {
    for (const extra of [
      { status: "VALIDATED" },
      { recordedById: "user1" },
      { organizationId: "org1" },
      { actorId: "user1" },
      { createdAt: new Date().toISOString() },
      { updatedAt: new Date().toISOString() },
    ]) {
      expect(createEvidenceRequestSchema.safeParse({ ...base, ...extra }).success).toBe(false);
    }
  });

  it("rejects a missing required field", () => {
    const { sourceReference: _drop, ...withoutSource } = base;
    expect(createEvidenceRequestSchema.safeParse(withoutSource).success).toBe(false);
  });

  it("rejects probability/impact/score/matrix fields on creation", () => {
    for (const extra of [
      { probability: 0.5 },
      { impact: 5 },
      { score: 10 },
      { riskMatrix: "high" },
    ]) {
      expect(createEvidenceRequestSchema.safeParse({ ...base, ...extra }).success).toBe(false);
    }
  });
});

describe("updateEvidenceRequestSchema", () => {
  it("accepts a partial content update", () => {
    expect(updateEvidenceRequestSchema.safeParse({ title: "New title" }).success).toBe(true);
  });

  it("rejects status and identifier", () => {
    expect(updateEvidenceRequestSchema.safeParse({ status: "VALIDATED" }).success).toBe(false);
    expect(updateEvidenceRequestSchema.safeParse({ identifier: "EV-002" }).success).toBe(false);
  });

  it("rejects an empty update", () => {
    expect(updateEvidenceRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("validateEvidenceRequestSchema", () => {
  it("accepts an empty body", () => {
    expect(validateEvidenceRequestSchema.safeParse({}).success).toBe(true);
  });

  it("accepts an optional rationale", () => {
    expect(validateEvidenceRequestSchema.safeParse({ rationale: "Reviewed and sound." }).success).toBe(
      true,
    );
  });

  it("rejects an unknown field", () => {
    expect(validateEvidenceRequestSchema.safeParse({ to: "VALIDATED" }).success).toBe(false);
  });
});

describe("supersedeEvidenceRequestSchema", () => {
  it("requires newEvidenceId", () => {
    expect(supersedeEvidenceRequestSchema.safeParse({}).success).toBe(false);
    expect(
      supersedeEvidenceRequestSchema.safeParse({ newEvidenceId: "ev1aaaaaaaaaaaaaaaaaaaa" }).success,
    ).toBe(true);
  });

  it("rejects an unknown field", () => {
    expect(
      supersedeEvidenceRequestSchema.safeParse({
        newEvidenceId: "ev1aaaaaaaaaaaaaaaaaaaa",
        status: "SUPERSEDED",
      }).success,
    ).toBe(false);
  });
});

describe("evidence link contract", () => {
  it("accepts every declared relation", () => {
    for (const relation of EVIDENCE_RELATIONS) {
      expect(
        evidenceLinkRequestSchema.safeParse({ relation, targetId: "target1aaaaaaaaaaaaaaaa" }).success,
      ).toBe(true);
    }
  });

  it("rejects an unrecognized relation", () => {
    expect(
      evidenceLinkRequestSchema.safeParse({ relation: "DESIGN_ITEM", targetId: "target1aaaaaaaaaaaaaaaa" })
        .success,
    ).toBe(false);
    expect(
      evidenceLinkRequestSchema.safeParse({ relation: "RISK", targetId: "target1aaaaaaaaaaaaaaaa" }).success,
    ).toBe(false);
  });

  it("rejects a linkType — none of the six subject columns carry one", () => {
    expect(
      evidenceLinkRequestSchema.safeParse({
        relation: "REQUIREMENT",
        targetId: "target1aaaaaaaaaaaaaaaa",
        linkType: "SOMETHING",
      }).success,
    ).toBe(false);
  });

  it("round-trips the composite key", () => {
    const key = evidenceLinkKey("REQUIREMENT", "row1aaaaaaaaaaaaaaaaaaa");
    expect(key).toBe("REQUIREMENT:row1aaaaaaaaaaaaaaaaaaa");
    expect(parseEvidenceLinkKey(key)).toEqual({ relation: "REQUIREMENT", rowId: "row1aaaaaaaaaaaaaaaaaaa" });
  });

  it("rejects a malformed composite key", () => {
    expect(parseEvidenceLinkKey("not-a-key")).toBeNull();
    expect(parseEvidenceLinkKey("UNKNOWN_RELATION:row1")).toBeNull();
    expect(parseEvidenceLinkKey(":row1")).toBeNull();
    expect(parseEvidenceLinkKey("REQUIREMENT:")).toBeNull();
  });
});

describe("display helpers", () => {
  it("labels every status", () => {
    for (const status of EVIDENCE_STATUSES) {
      expect(evidenceStatusLabel(status).length).toBeGreaterThan(0);
    }
  });

  it("labels every evidence type", () => {
    for (const type of EVIDENCE_TYPES) {
      expect(evidenceTypeLabel(type).length).toBeGreaterThan(0);
    }
  });

  it("labels every relation", () => {
    for (const relation of EVIDENCE_RELATIONS) {
      expect(evidenceRelationLabel(relation).length).toBeGreaterThan(0);
    }
  });
});
