import { describe, expect, it } from "vitest";
import {
  PROGRESS_STAGE_DEFINITIONS,
  type ProgressStage,
  type ProjectProgressFacts,
  emptyProgressFacts,
  nextProgressStep,
  progressDestinationHref,
  progressSteps,
} from "./project-progress";

/** Start from an empty project and change only what a test is about. */
function facts(edit: (f: ProjectProgressFacts) => void): ProjectProgressFacts {
  const f = emptyProgressFacts();
  edit(f);
  return f;
}

function stage(f: ProjectProgressFacts, which: ProgressStage) {
  return progressSteps(f).find((step) => step.stage === which)!;
}

/** A project with the first four stages genuinely finished. */
function builtAndVerified(f: ProjectProgressFacts) {
  f.requirements = { total: 4, draft: 0, inReview: 0, withoutCheck: 0 };
  f.designItems = { total: 3, draft: 0, inReview: 0 };
  f.decisions = { total: 2, proposed: 0, underReview: 0 };
  f.checks = { total: 4, notRun: 0, failed: 0, passedWithoutProof: 0 };
}

describe("the stages", () => {
  it("are the six the product is organised around, in order", () => {
    expect(progressSteps(emptyProgressFacts()).map((step) => step.stage)).toEqual([
      "DEFINE",
      "DESIGN",
      "DECIDE",
      "VERIFY",
      "CONTROL",
      "RELEASE",
    ]);
  });

  it("all start as not started in an empty project", () => {
    for (const step of progressSteps(emptyProgressFacts())) {
      expect(step.state, step.stage).toBe("NOT_STARTED");
    }
  });

  it("each pose a question and explain themselves in plain words", () => {
    for (const definition of PROGRESS_STAGE_DEFINITIONS) {
      expect(definition.question).toMatch(/\?$/);
      expect(definition.explanation.length).toBeGreaterThan(50);
      expect(definition.explanation).not.toMatch(
        /verification activit|artifact|traceability|allocat|baseline|engineering basis|stakeholder/i,
      );
    }
  });
});

describe("Define", () => {
  it("is not started with no requirements, and points at existing stakeholder needs", () => {
    const step = stage(facts((f) => (f.stakeholderNeeds = { total: 3, draft: 0 })), "DEFINE");

    expect(step.state).toBe("NOT_STARTED");
    expect(step.facts[0]).toContain("3 stakeholder needs");
  });

  it("is in progress while any requirement is a draft", () => {
    const step = stage(facts((f) => (f.requirements = { total: 5, draft: 2, inReview: 1, withoutCheck: 0 })), "DEFINE");

    expect(step.state).toBe("IN_PROGRESS");
    expect(step.facts).toContain("2 requirements are drafts.");
    expect(step.facts).toContain("1 requirement is waiting for review.");
  });

  it("needs review once nothing is a draft but something awaits a reviewer", () => {
    const step = stage(facts((f) => (f.requirements = { total: 5, draft: 0, inReview: 1, withoutCheck: 0 })), "DEFINE");
    expect(step.state).toBe("NEEDS_REVIEW");
  });

  it("is ready only when every requirement is approved", () => {
    const step = stage(facts((f) => (f.requirements = { total: 5, draft: 0, inReview: 0, withoutCheck: 0 })), "DEFINE");

    expect(step.state).toBe("READY");
    expect(step.facts[0]).toBe("5 requirements: 5 approved.");
  });
});

describe("Verify", () => {
  it("is not started with no checks, and says why when there is nothing to verify", () => {
    const step = stage(emptyProgressFacts(), "VERIFY");

    expect(step.state).toBe("NOT_STARTED");
    expect(step.facts[0]).toMatch(/nothing to verify yet/);
  });

  /** A failed check is the one gap that says something is actually wrong. */
  it("needs review when any check has failed, ahead of every other gap", () => {
    const step = stage(
      facts((f) => {
        f.requirements = { total: 4, draft: 0, inReview: 0, withoutCheck: 2 };
        f.checks = { total: 3, notRun: 1, failed: 1, passedWithoutProof: 1 };
      }),
      "VERIFY",
    );

    expect(step.state).toBe("NEEDS_REVIEW");
    expect(step.actionLabel).toBe("Review failed checks");
    expect(step.facts[0]).toBe("1 check failed.");
  });

  it("sends the reader to plan checks when a requirement has none", () => {
    const step = stage(
      facts((f) => {
        f.requirements = { total: 4, draft: 0, inReview: 0, withoutCheck: 2 };
        f.checks = { total: 2, notRun: 0, failed: 0, passedWithoutProof: 0 };
      }),
      "VERIFY",
    );

    expect(step.state).toBe("IN_PROGRESS");
    expect(step.destination).toBe("verification");
    expect(step.facts).toContain("2 requirements have no check yet.");
  });

  it("sends the reader to attach proof when a pass has nothing to show for it", () => {
    const step = stage(
      facts((f) => {
        f.requirements = { total: 2, draft: 0, inReview: 0, withoutCheck: 0 };
        f.checks = { total: 2, notRun: 0, failed: 0, passedWithoutProof: 1 };
      }),
      "VERIFY",
    );

    expect(step.actionLabel).toBe("Attach proof");
    expect(step.destination).toBe("evidence");
  });

  it("is ready only when every requirement has a check, every check has passed and every pass has proof", () => {
    expect(stage(facts(builtAndVerified), "VERIFY").state).toBe("READY");
  });
});

describe("Control change", () => {
  /** Absence is never readiness: nobody having looked is not the same as nothing being there. */
  it("is not started — never ready — when nothing has been recorded", () => {
    const step = stage(emptyProgressFacts(), "CONTROL");

    expect(step.state).toBe("NOT_STARTED");
    expect(step.facts[0]).toMatch(/doesn't mean there are none/);
  });

  it("needs review while a change waits for a reviewer", () => {
    const step = stage(
      facts((f) => (f.control = { ...f.control, changesAwaitingReview: 1, everRecorded: 1 })),
      "CONTROL",
    );

    expect(step.state).toBe("NEEDS_REVIEW");
    expect(step.destination).toBe("changes");
  });

  it("is in progress while a risk has no handling decided", () => {
    const step = stage(facts((f) => (f.control = { ...f.control, openRisks: 2, everRecorded: 2 })), "CONTROL");

    expect(step.state).toBe("IN_PROGRESS");
    expect(step.destination).toBe("risks");
  });

  /** Accepted and mitigated risks are dealt with — a project can release with known, accepted risk. */
  it("is ready once everything recorded has been dealt with", () => {
    const step = stage(facts((f) => (f.control = { ...f.control, everRecorded: 6 })), "CONTROL");
    expect(step.state).toBe("READY");
  });
});

describe("Review & release", () => {
  function withGate(f: ProjectProgressFacts, gate: ProjectProgressFacts["release"]["gate"], activeBaseline = true) {
    f.release = { activeBaseline, draftBaseline: false, gate };
  }

  it("is not started with no locked design and no release check", () => {
    expect(stage(emptyProgressFacts(), "RELEASE").state).toBe("NOT_STARTED");
  });

  it("is in progress with the design locked but the release check never run", () => {
    const step = stage(facts((f) => withGate(f, { assessed: false })), "RELEASE");

    expect(step.state).toBe("IN_PROGRESS");
    expect(step.actionLabel).toBe("Run the release check");
    expect(step.destination).toBe("release-check");
  });

  it("is ready only with the design locked and a current release check that says ready", () => {
    const step = stage(
      facts((f) =>
        withGate(f, { assessed: true, status: "READY", current: true, evaluatedAt: "2026-09-01T00:00:00.000Z", openFindings: 0 }),
      ),
      "RELEASE",
    );
    expect(step.state).toBe("READY");
  });

  /** The central rule, three ways: a stale READY, an UNKNOWN, and a READY with nothing locked. */
  it("never reads a stale ready verdict as ready", () => {
    const step = stage(
      facts((f) =>
        withGate(f, { assessed: true, status: "READY", current: false, evaluatedAt: "2026-09-01T00:00:00.000Z", openFindings: 0 }),
      ),
      "RELEASE",
    );

    expect(step.state).toBe("NEEDS_REVIEW");
    expect(step.actionLabel).toBe("Run the release check again");
    expect(step.facts.join(" ")).toMatch(/out of date/);
  });

  it("never reads an unknown verdict as ready", () => {
    const step = stage(
      facts((f) =>
        withGate(f, { assessed: true, status: "UNKNOWN", current: true, evaluatedAt: "2026-09-01T00:00:00.000Z", openFindings: 3 }),
      ),
      "RELEASE",
    );

    expect(step.state).toBe("NEEDS_REVIEW");
    expect(step.facts.join(" ")).toContain("3 things are unknown");
  });

  it("is not ready while nothing is locked, even if the check said ready", () => {
    const step = stage(
      facts((f) =>
        withGate(
          f,
          { assessed: true, status: "READY", current: true, evaluatedAt: "2026-09-01T00:00:00.000Z", openFindings: 0 },
          false,
        ),
      ),
      "RELEASE",
    );
    expect(step.state).toBe("IN_PROGRESS");
    expect(step.destination).toBe("baselines");
  });
});

describe("nextProgressStep", () => {
  it("tells a brand-new project to write its first requirement", () => {
    const next = nextProgressStep(emptyProgressFacts());

    expect(next.stage).toBe("DEFINE");
    expect(next.actionLabel).toBe("Write the first requirement");
  });

  /** Something waiting on a person is the most actionable thing in the project. */
  it("puts anything needing review first, even ahead of an earlier unfinished stage", () => {
    const next = nextProgressStep(
      facts((f) => {
        f.requirements = { total: 3, draft: 1, inReview: 0, withoutCheck: 3 };
        f.control = { ...f.control, changesAwaitingReview: 1, everRecorded: 1 };
      }),
    );
    expect(next.stage).toBe("CONTROL");
  });

  /**
   * A team that went straight from requirements to checks has chosen to
   * skip recording design items; the suggestion should not keep pulling
   * them back. The stage still shows as not started — nothing is hidden.
   */
  it("passes over a stage not started when a later one has begun, but still shows it", () => {
    const f = facts((f) => {
      f.requirements = { total: 2, draft: 0, inReview: 0, withoutCheck: 1 };
      f.checks = { total: 1, notRun: 1, failed: 0, passedWithoutProof: 0 };
    });

    expect(nextProgressStep(f).stage).toBe("VERIFY");
    expect(stage(f, "DESIGN").state).toBe("NOT_STARTED");
  });

  it("does not pass over an earlier stage that is under way", () => {
    const next = nextProgressStep(
      facts((f) => {
        f.requirements = { total: 2, draft: 1, inReview: 0, withoutCheck: 2 };
        f.checks = { total: 1, notRun: 1, failed: 0, passedWithoutProof: 0 };
      }),
    );
    expect(next.stage).toBe("DEFINE");
  });

  it("moves to release once the rest is genuinely done", () => {
    const next = nextProgressStep(
      facts((f) => {
        builtAndVerified(f);
        f.control = { ...f.control, everRecorded: 2 };
      }),
    );
    expect(next.stage).toBe("RELEASE");
  });
});

describe("destinations", () => {
  it("link a module stage to that module", () => {
    expect(progressDestinationHref("p1", "requirements")).toBe("/projects/p1/requirements");
  });

  it("link the release check to the readiness panel with the release gate chosen", () => {
    expect(progressDestinationHref("p1", "release-check")).toBe("/projects/p1?gate=RELEASE_READY#release-check");
  });
});

/**
 * The product's central rule, applied where it would be easiest to break:
 * a progress view is exactly where "4 of 6" or a percentage looks natural.
 */
describe("no aggregate", () => {
  it("produces no percentage, ratio, score or rating in any state", () => {
    const scenarios = [
      emptyProgressFacts(),
      facts((f) => (f.stakeholderNeeds = { total: 4, draft: 1 })),
      facts((f) => (f.requirements = { total: 7, draft: 2, inReview: 1, withoutCheck: 3 })),
      facts((f) => {
        builtAndVerified(f);
        f.control = { ...f.control, openRisks: 1, everRecorded: 3 };
        f.release = {
          activeBaseline: true,
          draftBaseline: false,
          gate: { assessed: true, status: "NOT_READY", current: true, evaluatedAt: "2026-09-01T00:00:00.000Z", openFindings: 2 },
        };
      }),
    ];

    for (const scenario of scenarios) {
      const text = JSON.stringify(progressSteps(scenario)).toLowerCase();
      expect(text).not.toMatch(/\d\s*%|\bpercent|\bscore|\brating|\b\d+\s*(of|\/)\s*\d+\b/);
    }
  });
});
