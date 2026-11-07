import { describe, expect, it } from "vitest";
import {
  DERIVED_TITLE_MAX,
  checkTitleFor,
  createRequirementsInBulkRequestSchema,
  deriveRequirementTitle,
  parseRequirementLines,
  planChecksRequestSchema,
} from "./quick-actions";

describe("parseRequirementLines", () => {
  it("makes one statement per non-empty line", () => {
    expect(parseRequirementLines("The pump shall deliver 5 L/min.\n\n  \nThe tank shall hold 20 L.\n")).toEqual([
      "The pump shall deliver 5 L/min.",
      "The tank shall hold 20 L.",
    ]);
  });

  it("removes the list markers pasted with the words, never the words themselves", () => {
    const pasted = [
      "- dash item",
      "* star item",
      "• bullet item",
      "1. numbered item",
      "12) parenthesised item",
      "a) lettered item",
      "[ ] checkbox item",
      "[x] ticked item",
    ].join("\r\n");
    expect(parseRequirementLines(pasted)).toEqual([
      "dash item",
      "star item",
      "bullet item",
      "numbered item",
      "parenthesised item",
      "lettered item",
      "checkbox item",
      "ticked item",
    ]);
  });

  it("keeps a statement that merely starts with a number or a capital letter", () => {
    expect(parseRequirementLines("3 pumps shall run in parallel.\nA backup shall exist.")).toEqual([
      "3 pumps shall run in parallel.",
      "A backup shall exist.",
    ]);
  });

  it("collapses runs of whitespace inside a line", () => {
    expect(parseRequirementLines("The   pump\tshall run.")).toEqual(["The pump shall run."]);
  });
});

describe("deriveRequirementTitle", () => {
  it("uses the first sentence without its full stop", () => {
    expect(deriveRequirementTitle("The pump shall deliver 5 L/min. It shall be quiet.")).toBe(
      "The pump shall deliver 5 L/min",
    );
  });

  it("keeps a short statement whole", () => {
    expect(deriveRequirementTitle("Battery lasts 10 hours")).toBe("Battery lasts 10 hours");
  });

  it("cuts a long first sentence at a word and marks the cut", () => {
    const long =
      "The flight control computer shall maintain vehicle attitude within half a degree of the commanded attitude during all phases";
    const title = deriveRequirementTitle(long);
    expect(title.length).toBeLessThanOrEqual(DERIVED_TITLE_MAX);
    expect(title.endsWith("…")).toBe(true);
    expect(long.startsWith(title.slice(0, -1).trimEnd())).toBe(true);
  });

  it("does not split on a decimal point", () => {
    expect(deriveRequirementTitle("Error shall stay below 0.5 percent.")).toBe("Error shall stay below 0.5 percent");
  });
});

describe("request schemas", () => {
  it("accepts a list of statements and refuses an empty one", () => {
    expect(createRequirementsInBulkRequestSchema.safeParse({ statements: ["A shall B."] }).success).toBe(true);
    expect(createRequirementsInBulkRequestSchema.safeParse({ statements: [] }).success).toBe(false);
    expect(createRequirementsInBulkRequestSchema.safeParse({ statements: ["  "] }).success).toBe(false);
  });

  it("refuses anything a caller should not choose", () => {
    expect(
      createRequirementsInBulkRequestSchema.safeParse({ statements: ["A shall B."], status: "APPROVED" }).success,
    ).toBe(false);
  });

  it("plans with a method, optionally for chosen requirements", () => {
    expect(planChecksRequestSchema.safeParse({ method: "TEST" }).success).toBe(true);
    expect(planChecksRequestSchema.safeParse({ method: "TEST", requirementIds: ["req1"] }).success).toBe(true);
    expect(planChecksRequestSchema.safeParse({ method: "GUESS" }).success).toBe(false);
  });
});

describe("checkTitleFor", () => {
  it("names the requirement it checks", () => {
    expect(checkTitleFor("REQ-004", "Battery lasts 10 hours")).toBe("Check REQ-004: Battery lasts 10 hours");
  });

  it("stays within the title limit", () => {
    expect(checkTitleFor("REQ-004", "x".repeat(400)).length).toBe(300);
  });
});
