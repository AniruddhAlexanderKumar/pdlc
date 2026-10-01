import { describe, expect, it } from "vitest";
import { codeLabel, codeWords } from "./code-label";

describe("codeLabel", () => {
  it("reads a stored constant as a label", () => {
    expect(codeLabel("NOT_READY")).toBe("Not ready");
    expect(codeLabel("DRIFT_DETECTED")).toBe("Drift detected");
    expect(codeLabel("SUPPLIED_ITEM")).toBe("Supplied item");
    expect(codeLabel("OPEN")).toBe("Open");
  });

  it("leaves text that is already words, or is not a constant, as it is", () => {
    expect(codeLabel("Ready")).toBe("Ready");
    expect(codeLabel("SCN-42182754-REQ-001")).toBe("SCN-42182754-REQ-001");
    expect(codeLabel("")).toBe("");
  });
});

describe("codeWords", () => {
  it("reads a stored constant for the middle of a sentence", () => {
    expect(codeWords("UNDER_REVIEW")).toBe("under review");
    expect(codeWords("CRITICAL")).toBe("critical");
  });

  it("leaves non-constants alone", () => {
    expect(codeWords("RSK-001")).toBe("RSK-001");
  });
});
