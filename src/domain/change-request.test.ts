import { describe, expect, it } from "vitest";
import {
  CHANGE_REQUEST_STATUSES,
  CHANGE_REQUEST_TRANSITIONS,
  allowedChangeRequestTransitions,
  areDeclaredImpactsEditable,
  canTransitionChangeRequest,
  createChangeRequestRequestSchema,
  declareImpactRequestSchema,
  isChangeDefinitionEditable,
  isChangeRequestTerminal,
  transitionChangeRequestRequestSchema,
  updateChangeRequestRequestSchema,
} from "@/domain";

const REQUIREMENT_ID = "req1aaaaaaaaaaaaaaaaaaa";

describe("the change lifecycle", () => {
  it("covers every status", () => {
    expect(Object.keys(CHANGE_REQUEST_TRANSITIONS).sort()).toEqual(
      [...CHANGE_REQUEST_STATUSES].sort(),
    );
  });

  it("allows the documented forward path", () => {
    expect(canTransitionChangeRequest("DRAFT", "SUBMITTED")).toBe(true);
    expect(canTransitionChangeRequest("SUBMITTED", "UNDER_REVIEW")).toBe(true);
    expect(canTransitionChangeRequest("UNDER_REVIEW", "APPROVED")).toBe(true);
    expect(canTransitionChangeRequest("UNDER_REVIEW", "REJECTED")).toBe(true);
    expect(canTransitionChangeRequest("APPROVED", "IMPLEMENTED")).toBe(true);
  });

  it("allows cancellation from every state that has not concluded", () => {
    expect(canTransitionChangeRequest("DRAFT", "CANCELLED")).toBe(true);
    expect(canTransitionChangeRequest("SUBMITTED", "CANCELLED")).toBe(true);
    expect(canTransitionChangeRequest("UNDER_REVIEW", "CANCELLED")).toBe(true);
  });

  it("never lets approval skip review", () => {
    // The whole point of the lifecycle: a change that alters the engineering
    // basis has to have been looked at before it is approved.
    expect(canTransitionChangeRequest("DRAFT", "APPROVED")).toBe(false);
    expect(canTransitionChangeRequest("SUBMITTED", "APPROVED")).toBe(false);
    expect(canTransitionChangeRequest("REJECTED", "APPROVED")).toBe(false);
    expect(canTransitionChangeRequest("IMPLEMENTED", "APPROVED")).toBe(false);
    expect(canTransitionChangeRequest("CANCELLED", "APPROVED")).toBe(false);
  });

  it("treats rejection, implementation and cancellation as final", () => {
    for (const terminal of ["REJECTED", "IMPLEMENTED", "CANCELLED"] as const) {
      expect(allowedChangeRequestTransitions(terminal)).toEqual([]);
      expect(isChangeRequestTerminal(terminal)).toBe(true);

      for (const target of CHANGE_REQUEST_STATUSES) {
        expect(canTransitionChangeRequest(terminal, target)).toBe(false);
      }
    }
  });

  it("does not treat an approved change as final — it still has to be implemented", () => {
    expect(isChangeRequestTerminal("APPROVED")).toBe(false);
    expect(allowedChangeRequestTransitions("APPROVED")).toEqual(["IMPLEMENTED"]);
  });

  it("refuses to move a change backwards out of review", () => {
    expect(canTransitionChangeRequest("UNDER_REVIEW", "DRAFT")).toBe(false);
    expect(canTransitionChangeRequest("UNDER_REVIEW", "SUBMITTED")).toBe(false);
    expect(canTransitionChangeRequest("APPROVED", "UNDER_REVIEW")).toBe(false);
  });

  it("never names a status that does not exist", () => {
    const known = new Set<string>(CHANGE_REQUEST_STATUSES);

    for (const targets of Object.values(CHANGE_REQUEST_TRANSITIONS)) {
      for (const target of targets) expect(known).toContain(target);
    }
  });
});

describe("editability", () => {
  it("keeps the definition open while drafting and once submitted", () => {
    expect(isChangeDefinitionEditable("DRAFT")).toBe(true);
    expect(isChangeDefinitionEditable("SUBMITTED")).toBe(true);
  });

  it("freezes the definition from review onward", () => {
    // A change already in front of a reviewer must not silently become a
    // different change.
    for (const frozen of ["UNDER_REVIEW", "APPROVED", "REJECTED", "IMPLEMENTED", "CANCELLED"] as const) {
      expect(isChangeDefinitionEditable(frozen)).toBe(false);
    }
  });

  it("keeps the declared scope open through review", () => {
    // Getting the declared scope right is much of what review is for.
    expect(areDeclaredImpactsEditable("DRAFT")).toBe(true);
    expect(areDeclaredImpactsEditable("SUBMITTED")).toBe(true);
    expect(areDeclaredImpactsEditable("UNDER_REVIEW")).toBe(true);
  });

  it("freezes the declared scope from approval onward", () => {
    for (const frozen of ["APPROVED", "REJECTED", "IMPLEMENTED", "CANCELLED"] as const) {
      expect(areDeclaredImpactsEditable(frozen)).toBe(false);
    }
  });
});

describe("the create contract", () => {
  const valid = {
    identifier: "CR-001",
    title: "Raise the chamber pressure limit",
    description: "Raise the limit from 120 to 130 bar.",
    reason: "Performance shortfall found in hot fire.",
  };

  it("accepts a well-formed change", () => {
    expect(createChangeRequestRequestSchema.parse(valid)).toEqual(valid);
  });

  it("rejects a requester supplied by the client", () => {
    // Rejected rather than dropped: a client trying to raise a change in
    // someone else's name should fail loudly.
    expect(() =>
      createChangeRequestRequestSchema.parse({ ...valid, requestedById: "user1aaaaaaaaaaaaaaaa" }),
    ).toThrow();
  });

  it("rejects a status supplied by the client", () => {
    expect(() => createChangeRequestRequestSchema.parse({ ...valid, status: "APPROVED" })).toThrow();
  });

  it("rejects an organization or project supplied by the client", () => {
    expect(() =>
      createChangeRequestRequestSchema.parse({ ...valid, organizationId: "org1aaaaaaaaaaaaaaa" }),
    ).toThrow();
    expect(() =>
      createChangeRequestRequestSchema.parse({ ...valid, projectId: "proj1aaaaaaaaaaaaaaa" }),
    ).toThrow();
  });

  it("rejects timestamps supplied by the client", () => {
    expect(() =>
      createChangeRequestRequestSchema.parse({ ...valid, createdAt: new Date().toISOString() }),
    ).toThrow();
  });

  it("requires what is changing and why", () => {
    expect(() => createChangeRequestRequestSchema.parse({ ...valid, description: "" })).toThrow();
    expect(() => createChangeRequestRequestSchema.parse({ ...valid, reason: "  " })).toThrow();
  });

  it("requires a project-scoped identifier in house format", () => {
    expect(() => createChangeRequestRequestSchema.parse({ ...valid, identifier: "cr-1" })).toThrow();
    expect(() => createChangeRequestRequestSchema.parse({ ...valid, identifier: "C" })).toThrow();
  });
});

describe("the update contract", () => {
  it("accepts a partial content edit", () => {
    expect(updateChangeRequestRequestSchema.parse({ title: "Revised title" })).toEqual({
      title: "Revised title",
    });
  });

  it("has no status field at all, so a PATCH cannot approve a change", () => {
    expect(() => updateChangeRequestRequestSchema.parse({ status: "APPROVED" })).toThrow();
    expect(() =>
      updateChangeRequestRequestSchema.parse({ title: "Fine", status: "APPROVED" }),
    ).toThrow();
  });

  it("refuses to move the change to another project or requester", () => {
    expect(() =>
      updateChangeRequestRequestSchema.parse({ projectId: "proj2aaaaaaaaaaaaaaa" }),
    ).toThrow();
    expect(() =>
      updateChangeRequestRequestSchema.parse({ requestedById: "user2aaaaaaaaaaaaaaa" }),
    ).toThrow();
  });

  it("refuses an empty update", () => {
    expect(() => updateChangeRequestRequestSchema.parse({})).toThrow();
  });
});

describe("the transition contract", () => {
  it("accepts a target status with an optional rationale", () => {
    expect(transitionChangeRequestRequestSchema.parse({ to: "SUBMITTED" })).toEqual({
      to: "SUBMITTED",
    });
    expect(
      transitionChangeRequestRequestSchema.parse({ to: "REJECTED", rationale: "Out of scope." }),
    ).toEqual({ to: "REJECTED", rationale: "Out of scope." });
  });

  it("rejects an unknown status", () => {
    expect(() => transitionChangeRequestRequestSchema.parse({ to: "MERGED" })).toThrow();
  });

  it("rejects anything else in the body", () => {
    expect(() =>
      transitionChangeRequestRequestSchema.parse({ to: "SUBMITTED", title: "sneaky" }),
    ).toThrow();
  });
});

describe("the declared impact contract", () => {
  it("accepts a typed target", () => {
    expect(
      declareImpactRequestSchema.parse({
        target: { type: "REQUIREMENT", id: REQUIREMENT_ID },
        note: "Limit is stated here.",
      }),
    ).toEqual({
      target: { type: "REQUIREMENT", id: REQUIREMENT_ID },
      note: "Limit is stated here.",
    });
  });

  it("accepts every target type the impact table has a column for", () => {
    for (const type of [
      "REQUIREMENT",
      "DESIGN_ITEM",
      "ENGINEERING_DECISION",
      "VERIFICATION_ACTIVITY",
      "RISK",
      "ISSUE",
    ] as const) {
      expect(
        declareImpactRequestSchema.parse({ target: { type, id: REQUIREMENT_ID } }).target.type,
      ).toBe(type);
    }
  });

  it("rejects a target type the schema cannot store", () => {
    expect(() =>
      declareImpactRequestSchema.parse({
        target: { type: "STAKEHOLDER_NEED", id: REQUIREMENT_ID },
      }),
    ).toThrow();
    expect(() =>
      declareImpactRequestSchema.parse({ target: { type: "EVIDENCE", id: REQUIREMENT_ID } }),
    ).toThrow();
  });

  it("rejects an untyped target", () => {
    expect(() => declareImpactRequestSchema.parse({ target: REQUIREMENT_ID })).toThrow();
    expect(() => declareImpactRequestSchema.parse({ targetId: REQUIREMENT_ID })).toThrow();
  });

  it("rejects a creator supplied by the client", () => {
    expect(() =>
      declareImpactRequestSchema.parse({
        target: { type: "REQUIREMENT", id: REQUIREMENT_ID },
        createdById: "user1aaaaaaaaaaaaaaaa",
      }),
    ).toThrow();
  });
});
