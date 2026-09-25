import { describe, expect, it } from "vitest";
import {
  type ProjectProgressCounts,
  nextProgressStep,
  progressSteps,
} from "./project-progress";

const EMPTY: ProjectProgressCounts = {
  stakeholderNeeds: 0,
  requirements: 0,
  requirementsWithoutCheck: 0,
  verificationActivities: 0,
  checksWithoutProof: 0,
  openChanges: 0,
};

function counts(overrides: Partial<ProjectProgressCounts>): ProjectProgressCounts {
  return { ...EMPTY, ...overrides };
}

describe("nextProgressStep", () => {
  it("tells a brand-new project to write its first requirement", () => {
    const step = nextProgressStep(EMPTY);

    expect(step.stage).toBe("DEFINE");
    expect(step.actionLabel).toBe("Write the first requirement");
    expect(step.module).toBe("requirements");
  });

  it("points at existing stakeholder needs when there are some to turn into requirements", () => {
    const step = nextProgressStep(counts({ stakeholderNeeds: 3 }));

    expect(step.stage).toBe("DEFINE");
    expect(step.status).toContain("3 stakeholder needs");
  });

  it("moves on to planning checks once requirements exist without them", () => {
    const step = nextProgressStep(counts({ requirements: 5, requirementsWithoutCheck: 2 }));

    expect(step.stage).toBe("PLAN_CHECKS");
    expect(step.status).toBe("2 requirements have no check yet.");
    expect(step.module).toBe("verification");
  });

  it("asks for proof once every requirement has a check", () => {
    const step = nextProgressStep(
      counts({ requirements: 5, verificationActivities: 4, checksWithoutProof: 1 }),
    );

    expect(step.stage).toBe("ATTACH_PROOF");
    expect(step.status).toBe("1 check has no proof attached.");
  });

  it("settles on keeping the record current when the first three are genuinely done", () => {
    const step = nextProgressStep(counts({ requirements: 5, verificationActivities: 4 }));

    expect(step.stage).toBe("KEEP_CURRENT");
  });

  /** "No check lacks proof" is vacuously true when there are no checks at all. */
  it("never calls proof done when there are no checks to prove", () => {
    const steps = progressSteps(counts({ requirements: 2, verificationActivities: 0 }));
    const proof = steps.find((step) => step.stage === "ATTACH_PROOF")!;

    expect(proof.done).toBe(false);
  });
});

describe("progressSteps", () => {
  it("always returns the four stages, in lifecycle order", () => {
    expect(progressSteps(EMPTY).map((step) => step.stage)).toEqual([
      "DEFINE",
      "PLAN_CHECKS",
      "ATTACH_PROOF",
      "KEEP_CURRENT",
    ]);
  });

  it("never marks keeping current as done — it is ongoing, not a box to tick", () => {
    const steps = progressSteps(counts({ requirements: 9, verificationActivities: 9 }));
    expect(steps.find((step) => step.stage === "KEEP_CURRENT")!.done).toBe(false);
  });

  it("does not report a later stage done while an earlier one is not", () => {
    const steps = progressSteps(counts({ requirements: 0, verificationActivities: 3 }));

    expect(steps[0]!.done).toBe(false);
    expect(steps[1]!.done).toBe(false);
    expect(steps[2]!.done).toBe(false);
  });

  it("uses singular and plural correctly", () => {
    expect(nextProgressStep(counts({ requirements: 1, requirementsWithoutCheck: 1 })).status).toBe(
      "1 requirement has no check yet.",
    );
  });

  /**
   * The product's central rule, applied where it would be easiest to break:
   * a "your progress" panel is exactly where a percentage or an "x of y"
   * would look natural. Each stage states its own count instead.
   */
  it("produces no percentage, ratio, score or rating anywhere", () => {
    const scenarios = [
      EMPTY,
      counts({ stakeholderNeeds: 4 }),
      counts({ requirements: 7, requirementsWithoutCheck: 3 }),
      counts({ requirements: 7, verificationActivities: 6, checksWithoutProof: 2 }),
      counts({ requirements: 7, verificationActivities: 6, openChanges: 1 }),
    ];

    for (const scenario of scenarios) {
      const text = JSON.stringify(progressSteps(scenario)).toLowerCase();
      expect(text).not.toMatch(/\d\s*%|\bpercent|\bscore|\brating|\b\d+\s*(of|\/)\s*\d+\b/);
    }
  });

  it("explains every stage in words a newcomer can act on", () => {
    for (const step of progressSteps(EMPTY)) {
      expect(step.explanation.length).toBeGreaterThan(40);
      expect(step.explanation).not.toMatch(/verification activity|artifact|traceability/i);
    }
  });
});
