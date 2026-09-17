import { describe, expect, it } from "vitest";
import { simulateRequirementChange } from "./requirement-impact-simulator";

describe("Requirement Impact Simulator Engine", () => {
  const currentReq = {
    id: "req_042",
    identifier: "REQ-042",
    title: "Payload Bay Thermal Dissipation Ceiling",
    statement: "The system shall maintain payload bay thermal dissipation within 500 W under nominal operation.",
    priority: "HIGH",
    rationale: "Required for thermal loop margin.",
  };

  it("calculates 1st, 2nd, and 3rd order ripple impacts for proposed change", () => {
    const proposed = {
      statement: "The system shall maintain payload bay thermal dissipation within 420 W under nominal operation.",
    };

    const sim = simulateRequirementChange(currentReq, proposed);

    expect(sim.requirementId).toBe("req_042");
    expect(sim.diffSummary.statementChanged).toBe(true);
    expect(sim.diffSummary.boundsChanged).toBe(true);

    // Verify multi-order ripple classification
    expect(sim.summaryByOrder.firstOrderCount).toBeGreaterThan(0);
    expect(sim.summaryByOrder.secondOrderCount).toBeGreaterThan(0);
    expect(sim.summaryByOrder.thirdOrderCount).toBeGreaterThan(0);

    // Verify confidence layer presence
    expect(sim.impacts.some((i) => i.confidence === "DIRECT")).toBe(true);
    expect(sim.impacts.some((i) => i.confidence === "EVIDENCE_BACKED")).toBe(true);
    expect(sim.impacts.some((i) => i.confidence === "INFERRED")).toBe(true);
  });

  it("flags approved downstream artifacts as APPROVAL_POTENTIALLY_INVALIDATED", () => {
    const sim = simulateRequirementChange(currentReq, {
      statement: "The system shall maintain payload bay thermal dissipation within 350 W.",
    });

    const regated = sim.impacts.filter((i) => i.regatingStatus === "APPROVAL_POTENTIALLY_INVALIDATED");
    expect(regated.length).toBeGreaterThan(0);
  });

  it("builds a complete Revalidation Checklist of required engineering tasks", () => {
    const sim = simulateRequirementChange(currentReq, {
      statement: "The system shall maintain payload bay thermal dissipation within 400 W.",
    });

    expect(sim.revalidationChecklist.totalTasksCount).toBeGreaterThan(0);
    expect(sim.revalidationChecklist.requirementsRequiringReview.length).toBeGreaterThan(0);
    expect(sim.revalidationChecklist.testsRequiringModification.length).toBeGreaterThan(0);
    expect(sim.revalidationChecklist.stakeholdersRequiringReapproval.length).toBeGreaterThan(0);
  });
});
