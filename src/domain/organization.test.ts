import { describe, expect, it } from "vitest";
import {
  ENGINEERING_INDUSTRIES,
  ENGINEERING_INDUSTRY_LABELS,
  engineeringIndustryLabel,
  setOrganizationIndustryRequestSchema,
} from "./organization";

describe("ENGINEERING_INDUSTRIES", () => {
  it("is exactly 15 values, including OTHER_ENGINEERING as the honest escape hatch", () => {
    expect(ENGINEERING_INDUSTRIES).toHaveLength(15);
    expect(ENGINEERING_INDUSTRIES).toContain("OTHER_ENGINEERING");
  });

  it("has no duplicates", () => {
    expect(new Set(ENGINEERING_INDUSTRIES).size).toBe(ENGINEERING_INDUSTRIES.length);
  });

  it("has a real human label for every value — none fall through to the raw enum name", () => {
    for (const industry of ENGINEERING_INDUSTRIES) {
      const label = engineeringIndustryLabel(industry);
      expect(label).toBeTruthy();
      expect(label).not.toBe(industry);
    }
    expect(Object.keys(ENGINEERING_INDUSTRY_LABELS)).toHaveLength(ENGINEERING_INDUSTRIES.length);
  });
});

describe("setOrganizationIndustryRequestSchema", () => {
  it("accepts a real, named industry with no detail", () => {
    const result = setOrganizationIndustryRequestSchema.safeParse({ industry: "AUTOMOTIVE" });
    expect(result.success).toBe(true);
  });

  it("rejects OTHER_ENGINEERING with no detail — nothing to say what it means", () => {
    const result = setOrganizationIndustryRequestSchema.safeParse({ industry: "OTHER_ENGINEERING" });
    expect(result.success).toBe(false);
  });

  it("accepts OTHER_ENGINEERING with a real detail", () => {
    const result = setOrganizationIndustryRequestSchema.safeParse({
      industry: "OTHER_ENGINEERING",
      otherDetail: "Marine renewables",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a detail attached to a real, named industry — never silently ignored", () => {
    const result = setOrganizationIndustryRequestSchema.safeParse({
      industry: "AUTOMOTIVE",
      otherDetail: "Should not be here",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unrecognized industry value — the enum is closed, not open text", () => {
    const result = setOrganizationIndustryRequestSchema.safeParse({ industry: "SPACE_TOURISM" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown field — the request schema is strict", () => {
    const result = setOrganizationIndustryRequestSchema.safeParse({
      industry: "AUTOMOTIVE",
      readinessBoost: true,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a blank detail string for OTHER_ENGINEERING", () => {
    const result = setOrganizationIndustryRequestSchema.safeParse({
      industry: "OTHER_ENGINEERING",
      otherDetail: "   ",
    });
    expect(result.success).toBe(false);
  });
});
