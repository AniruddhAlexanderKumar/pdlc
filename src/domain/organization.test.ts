import { describe, expect, it } from "vitest";
import {
  ENGINEERING_INDUSTRIES,
  ENGINEERING_INDUSTRY_LABELS,
  TERMINOLOGY_LABEL_DEFAULTS,
  TERMINOLOGY_LABEL_KEYS,
  engineeringIndustryLabel,
  resolveTerminologyLabel,
  setOrganizationIndustryRequestSchema,
  setOrganizationTerminologyRequestSchema,
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

describe("TERMINOLOGY_LABEL_KEYS", () => {
  it("has no duplicates", () => {
    expect(new Set(TERMINOLOGY_LABEL_KEYS).size).toBe(TERMINOLOGY_LABEL_KEYS.length);
  });

  it("has a real default label for every key", () => {
    for (const key of TERMINOLOGY_LABEL_KEYS) {
      expect(TERMINOLOGY_LABEL_DEFAULTS[key]).toBeTruthy();
    }
    expect(Object.keys(TERMINOLOGY_LABEL_DEFAULTS)).toHaveLength(TERMINOLOGY_LABEL_KEYS.length);
  });
});

describe("resolveTerminologyLabel", () => {
  it("falls back to this product's own default when there is no override", () => {
    expect(resolveTerminologyLabel("risk", null)).toBe(TERMINOLOGY_LABEL_DEFAULTS.risk);
    expect(resolveTerminologyLabel("risk", undefined)).toBe(TERMINOLOGY_LABEL_DEFAULTS.risk);
    expect(resolveTerminologyLabel("risk", {})).toBe(TERMINOLOGY_LABEL_DEFAULTS.risk);
  });

  it("falls back to the default when the override is blank or whitespace-only", () => {
    expect(resolveTerminologyLabel("risk", { risk: "" })).toBe(TERMINOLOGY_LABEL_DEFAULTS.risk);
    expect(resolveTerminologyLabel("risk", { risk: "   " })).toBe(TERMINOLOGY_LABEL_DEFAULTS.risk);
  });

  it("returns the organization's own override when it set one", () => {
    expect(resolveTerminologyLabel("risk", { risk: "Hazard" })).toBe("Hazard");
  });

  it("trims a stored override before rendering it", () => {
    expect(resolveTerminologyLabel("risk", { risk: "  Hazard  " })).toBe("Hazard");
  });

  it("only reads the key it was asked for, never a different one", () => {
    expect(resolveTerminologyLabel("risk", { issue: "Nonconformance" })).toBe(
      TERMINOLOGY_LABEL_DEFAULTS.risk,
    );
  });
});

describe("setOrganizationTerminologyRequestSchema", () => {
  it("accepts an empty overrides map — the common case, nothing renamed", () => {
    const result = setOrganizationTerminologyRequestSchema.safeParse({ overrides: {} });
    expect(result.success).toBe(true);
  });

  it("accepts a partial map — most organizations rename a handful of terms, not all fourteen", () => {
    const result = setOrganizationTerminologyRequestSchema.safeParse({
      overrides: { risk: "Hazard", issue: "Nonconformance" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a blank value — the signal to clear that key back to default", () => {
    const result = setOrganizationTerminologyRequestSchema.safeParse({
      overrides: { risk: "" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a key outside the fixed fourteen — the set is closed, not open text", () => {
    const result = setOrganizationTerminologyRequestSchema.safeParse({
      overrides: { traceability: "Renamed" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a value over 60 characters", () => {
    const result = setOrganizationTerminologyRequestSchema.safeParse({
      overrides: { risk: "R".repeat(61) },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown top-level field — the request schema is strict", () => {
    const result = setOrganizationTerminologyRequestSchema.safeParse({
      overrides: { risk: "Hazard" },
      industry: "AUTOMOTIVE",
    });
    expect(result.success).toBe(false);
  });
});
