import { describe, expect, it } from "vitest";
import {
  changeImpactTargetSchema,
  changeRequestImpactInputSchema,
  designItemLinkInputSchema,
  requirementDecisionLinkInputSchema,
  requirementLinkInputSchema,
  traceLinkInputSchema,
} from "@/domain";

const SOURCE = "clh1requirementaaaaaaaaa";
const TARGET = "clh1requirementbbbbbbbbb";

describe("trace link input validation", () => {
  it("accepts a well-formed link", () => {
    const parsed = traceLinkInputSchema.parse({ sourceId: SOURCE, targetId: TARGET });
    expect(parsed.sourceId).toBe(SOURCE);
    expect(parsed.targetId).toBe(TARGET);
  });

  it.each([
    ["", "empty"],
    ["   ", "whitespace only"],
    ["not a valid id", "contains spaces"],
    ["id;DROP TABLE requirements", "contains punctuation"],
    ["a".repeat(65), "too long"],
  ])("rejects a source id that is %s (%s)", (sourceId) => {
    const result = traceLinkInputSchema.safeParse({ sourceId, targetId: TARGET });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.includes("sourceId"))).toBe(true);
  });

  it("rejects a missing target id", () => {
    const result = traceLinkInputSchema.safeParse({ sourceId: SOURCE });
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.includes("targetId"))).toBe(true);
  });

  it("rejects a non-string identifier", () => {
    expect(traceLinkInputSchema.safeParse({ sourceId: SOURCE, targetId: 42 }).success).toBe(false);
  });
});

describe("self-referencing links", () => {
  it("rejects a requirement linked to itself", () => {
    const result = requirementLinkInputSchema.safeParse({
      sourceId: SOURCE,
      targetId: SOURCE,
      linkType: "DECOMPOSES_TO",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toMatch(/itself/i);
  });

  it("rejects a design item linked to itself", () => {
    const result = designItemLinkInputSchema.safeParse({
      sourceId: SOURCE,
      targetId: SOURCE,
      linkType: "CONTAINS",
    });
    expect(result.success).toBe(false);
  });

  it("accepts a link between two distinct requirements", () => {
    const parsed = requirementLinkInputSchema.parse({
      sourceId: SOURCE,
      targetId: TARGET,
      linkType: "DEPENDS_ON",
    });
    expect(parsed.linkType).toBe("DEPENDS_ON");
  });

  it("requires a link type where the relationship is ambiguous without one", () => {
    const result = requirementDecisionLinkInputSchema.safeParse({
      sourceId: SOURCE,
      targetId: TARGET,
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown link type", () => {
    const result = requirementLinkInputSchema.safeParse({
      sourceId: SOURCE,
      targetId: TARGET,
      linkType: "RELATES_TO",
    });
    expect(result.success).toBe(false);
  });
});

describe("change impact targets", () => {
  it("accepts each supported target type", () => {
    for (const type of [
      "REQUIREMENT",
      "DESIGN_ITEM",
      "ENGINEERING_DECISION",
      "VERIFICATION_ACTIVITY",
      "RISK",
      "ISSUE",
    ] as const) {
      expect(changeImpactTargetSchema.parse({ type, id: TARGET }).type).toBe(type);
    }
  });

  it("rejects an unsupported target type", () => {
    expect(changeImpactTargetSchema.safeParse({ type: "EVIDENCE", id: TARGET }).success).toBe(
      false,
    );
  });

  it("rejects an invalid target identifier", () => {
    const result = changeRequestImpactInputSchema.safeParse({
      changeRequestId: SOURCE,
      target: { type: "REQUIREMENT", id: "" },
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.some((issue) => issue.path.includes("id"))).toBe(true);
  });

  it("accepts a well-formed impact assertion", () => {
    const parsed = changeRequestImpactInputSchema.parse({
      changeRequestId: SOURCE,
      target: { type: "REQUIREMENT", id: TARGET },
      note: "Retraction timing is affected by the revised actuator.",
    });
    expect(parsed.target).toEqual({ type: "REQUIREMENT", id: TARGET });
  });
});
