import { describe, expect, it } from "vitest";
import {
  BASELINE_COMPARISON_STATUSES,
  baselineComparisonStatusLabel,
  classifyBaselineMemberComparison,
  summarizeBaselineComparison,
} from "./baseline-comparison";

describe("classifyBaselineMemberComparison", () => {
  it("classifies matching fingerprints as UNCHANGED", () => {
    expect(classifyBaselineMemberComparison("fp1", { fingerprint: "fp1" })).toBe("UNCHANGED");
  });

  it("classifies differing fingerprints as CHANGED", () => {
    expect(classifyBaselineMemberComparison("fp1", { fingerprint: "fp2" })).toBe("CHANGED");
  });

  it("classifies an absent current object as OBJECT_MISSING", () => {
    expect(classifyBaselineMemberComparison("fp1", null)).toBe("OBJECT_MISSING");
  });

  it("classifies an empty captured fingerprint as UNKNOWN, never as CHANGED", () => {
    expect(classifyBaselineMemberComparison("", { fingerprint: "fp1" })).toBe("UNKNOWN");
    expect(classifyBaselineMemberComparison("", null)).toBe("UNKNOWN");
  });

  it("is pure and deterministic: the same inputs always classify the same way", () => {
    const inputs: Array<[string, { fingerprint: string } | null]> = [
      ["fp1", { fingerprint: "fp1" }],
      ["fp1", { fingerprint: "fp2" }],
      ["fp1", null],
    ];
    for (const [baselined, current] of inputs) {
      const first = classifyBaselineMemberComparison(baselined, current);
      const second = classifyBaselineMemberComparison(baselined, current);
      expect(first).toBe(second);
    }
  });

  it("has exactly the four documented statuses, no invented fifth state", () => {
    expect(BASELINE_COMPARISON_STATUSES).toEqual(["UNCHANGED", "CHANGED", "OBJECT_MISSING", "UNKNOWN"]);
  });
});

describe("summarizeBaselineComparison", () => {
  it("tallies each status independently, with no weighting or score", () => {
    const summary = summarizeBaselineComparison([
      { status: "UNCHANGED" },
      { status: "UNCHANGED" },
      { status: "CHANGED" },
      { status: "OBJECT_MISSING" },
      { status: "UNKNOWN" },
    ]);
    expect(summary).toEqual({ total: 5, unchanged: 2, changed: 1, missing: 1, unknown: 1 });
  });

  it("returns all-zero counts for no members, never a divide-by-zero artifact", () => {
    expect(summarizeBaselineComparison([])).toEqual({
      total: 0,
      unchanged: 0,
      changed: 0,
      missing: 0,
      unknown: 0,
    });
  });
});

describe("baselineComparisonStatusLabel", () => {
  it("gives every status a non-empty, distinct display label", () => {
    const labels = BASELINE_COMPARISON_STATUSES.map(baselineComparisonStatusLabel);
    for (const label of labels) {
      expect(typeof label).toBe("string");
      expect(label.length).toBeGreaterThan(0);
    }
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("never renders a label containing a percentage or score-like word", () => {
    for (const status of BASELINE_COMPARISON_STATUSES) {
      expect(baselineComparisonStatusLabel(status)).not.toMatch(/%|score|percent/i);
    }
  });
});
