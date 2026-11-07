import { describe, expect, it } from "vitest";
import * as workflowExperience from "./use-workflow-experience";

describe("use-workflow-experience", () => {
  it("defines the storage key for the guide's detail level", () => {
    expect(workflowExperience.WORKFLOW_ADVANCED_MODE_KEY).toBe("pdlc:workflow-advanced-mode");
  });

  /**
   * `AUTO_SHOW_GUIDE_KEY` was exported here and surfaced in Settings as a
   * switch, but nothing in the product ever read the flag — the control was
   * its own only reader. Asserting its absence keeps it from drifting back
   * in as an inert preference.
   */
  it("exports no key for a preference nothing reads", () => {
    expect(workflowExperience).not.toHaveProperty("AUTO_SHOW_GUIDE_KEY");
  });
});
