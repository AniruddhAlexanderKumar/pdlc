import { describe, expect, it } from "vitest";
import { GUIDE_CATEGORIES } from "./step-by-step-guide-data";

describe("step-by-step-guide-data", () => {
  it("contains all 8 required core engineering categories", () => {
    expect(GUIDE_CATEGORIES.length).toBeGreaterThanOrEqual(8);

    const categoryIds = GUIDE_CATEGORIES.map((c) => c.id);
    expect(categoryIds).toContain("setup");
    expect(categoryIds).toContain("requirements");
    expect(categoryIds).toContain("stakeholders");
    expect(categoryIds).toContain("questions");
    expect(categoryIds).toContain("traceability");
    expect(categoryIds).toContain("simulator");
    expect(categoryIds).toContain("verification");
    expect(categoryIds).toContain("sentinel");
  });

  it("ensures every step has title, action, uiTarget, and description", () => {
    for (const category of GUIDE_CATEGORIES) {
      expect(category.title).toBeTruthy();
      expect(category.steps.length).toBeGreaterThan(0);

      category.steps.forEach((step, idx) => {
        expect(step.stepNumber).toBe(idx + 1);
        expect(step.title).toBeTruthy();
        expect(step.action).toBeTruthy();
        expect(step.uiTarget).toBeTruthy();
        expect(step.description).toBeTruthy();
      });
    }
  });

  it("includes interactive practice scenarios on key quality & simulator categories", () => {
    const requirementsCategory = GUIDE_CATEGORIES.find((c) => c.id === "requirements");
    expect(requirementsCategory?.practiceScenario).toBeDefined();
    expect(requirementsCategory?.practiceScenario?.interactiveType).toBe("quality");

    const simulatorCategory = GUIDE_CATEGORIES.find((c) => c.id === "simulator");
    expect(simulatorCategory?.practiceScenario).toBeDefined();
    expect(simulatorCategory?.practiceScenario?.interactiveType).toBe("impact");
  });
});
