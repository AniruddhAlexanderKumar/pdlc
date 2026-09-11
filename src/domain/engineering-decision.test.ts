import { describe, expect, it } from "vitest";
import { DECISION_STATUSES, decisionStatusSchema } from "@/domain";
import {
  createEngineeringDecisionInputSchema,
  updateEngineeringDecisionInputSchema,
} from "@/domain/engineering-decision";

const VALID_INPUT = {
  projectId: "clh1project0000000000000",
  identifier: "ED-014",
  title: "Composite over aluminium for the aft fairing",
  statement: "The aft fairing shall be manufactured from carbon composite laminate.",
  rationale: "Mass saving of 18% against the aluminium baseline at acceptable recurring cost.",
};

describe("engineering decision lifecycle", () => {
  it.each(DECISION_STATUSES)("accepts the %s lifecycle state", (status) => {
    expect(decisionStatusSchema.parse(status)).toBe(status);
  });

  it.each(["ACCEPTED", "approved", "IN_REVIEW", "OBSOLETE"])("rejects %s", (status) => {
    expect(decisionStatusSchema.safeParse(status).success).toBe(false);
  });

  it("covers the full proposed-to-resolved lifecycle", () => {
    expect(DECISION_STATUSES).toEqual([
      "PROPOSED",
      "UNDER_REVIEW",
      "APPROVED",
      "REJECTED",
      "SUPERSEDED",
    ]);
  });

  it("rejects an unknown status on a create payload", () => {
    const result = createEngineeringDecisionInputSchema.safeParse({
      ...VALID_INPUT,
      status: "ACCEPTED",
    });
    expect(result.success).toBe(false);
  });
});

describe("engineering decision content", () => {
  it("requires a rationale — a decision without one is just a note", () => {
    const { rationale: _omitted, ...withoutRationale } = VALID_INPUT;
    const result = createEngineeringDecisionInputSchema.safeParse(withoutRationale);

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.includes("rationale"))).toBe(true);
  });

  it("rejects a blank rationale", () => {
    const result = createEngineeringDecisionInputSchema.safeParse({
      ...VALID_INPUT,
      rationale: "   ",
    });
    expect(result.success).toBe(false);
  });

  it("keeps alternatives and assumptions optional", () => {
    const parsed = createEngineeringDecisionInputSchema.parse(VALID_INPUT);
    expect(parsed.alternativesConsidered).toBeUndefined();
    expect(parsed.assumptions).toBeUndefined();
  });

  it("rejects an empty update payload", () => {
    expect(updateEngineeringDecisionInputSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a status transition as an update", () => {
    const parsed = updateEngineeringDecisionInputSchema.parse({ status: "APPROVED" });
    expect(parsed.status).toBe("APPROVED");
  });
});
