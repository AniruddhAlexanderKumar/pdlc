import { describe, expect, it } from "vitest";
import { GUIDE_CATEGORIES, guideCategoryForRoute } from "./step-by-step-guide-data";

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

  it("ensures every category has a plain-English simpleSummary", () => {
    for (const category of GUIDE_CATEGORIES) {
      expect(category.simpleSummary).toBeDefined();
      expect(category.simpleSummary.whatItDoes).toBeTruthy();
      expect(category.simpleSummary.whereToClick).toBeTruthy();
      expect(category.simpleSummary.whatYouGet).toBeTruthy();
    }
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

describe("guideCategoryForRoute", () => {
  /**
   * The guard that matters: this mapping is only useful if every id it
   * returns is a section that actually exists. A typo here would open the
   * guide filtered to nothing, which looks like an empty guide rather than
   * a broken link.
   */
  it("only ever names a category that exists", () => {
    const known = new Set(GUIDE_CATEGORIES.map((category) => category.id));
    const routes = [
      "/projects/p1/requirements",
      "/projects/p1/stakeholder-needs",
      "/projects/p1/changes",
      "/projects/p1/traceability",
      "/projects/p1/verification",
      "/projects/p1/sentinel",
    ];

    for (const route of routes) {
      const id = guideCategoryForRoute(route);
      expect(id, `no category for ${route}`).not.toBeNull();
      expect(known.has(id!), `${id} is not a real category`).toBe(true);
    }
  });

  it("returns null for a route no section covers, rather than guessing", () => {
    expect(guideCategoryForRoute("/dashboard")).toBeNull();
    expect(guideCategoryForRoute("/settings")).toBeNull();
    expect(guideCategoryForRoute("/organization")).toBeNull();
  });

  it("ignores a query string", () => {
    expect(guideCategoryForRoute("/projects/p1/requirements?status=DRAFT")).toBe("requirements");
  });

  it("matches a detail route as well as its list", () => {
    expect(guideCategoryForRoute("/projects/p1/requirements/req_9")).toBe("requirements");
  });
});
