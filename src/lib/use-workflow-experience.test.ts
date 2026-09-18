import { describe, expect, it } from "vitest";
import { AUTO_SHOW_GUIDE_KEY, WORKFLOW_ADVANCED_MODE_KEY } from "./use-workflow-experience";

describe("use-workflow-experience", () => {
  it("defines standard storage keys for workflow experience customization", () => {
    expect(WORKFLOW_ADVANCED_MODE_KEY).toBe("pdlc:workflow-advanced-mode");
    expect(AUTO_SHOW_GUIDE_KEY).toBe("pdlc:auto-show-guide");
  });
});
