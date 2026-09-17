import { z } from "zod";

export const requirementQualityStatusSchema = z.enum([
  "COMPLETE",
  "NEEDS_CLARIFICATION",
  "MISSING_INFORMATION",
  "POTENTIAL_CONFLICT",
  "NOT_VERIFIABLE",
]);

export type RequirementQualityStatus = z.infer<typeof requirementQualityStatusSchema>;

export const requirementFlawTypeSchema = z.enum([
  "SUBJECTIVE_LANGUAGE",
  "MISSING_MEASURABLE_CRITERIA",
  "MISSING_UNITS",
  "UNDEFINED_TERMINOLOGY",
  "COMPOUND_STATEMENT",
  "MISSING_VERIFICATION_METHOD",
  "MISSING_SOURCE_OR_RATIONALE",
  "MISSING_OWNER",
  "MISSING_STAKEHOLDER",
  "MISSING_DEPENDENCIES",
  "POTENTIAL_CONFLICT",
  "NOT_VERIFIABLE",
]);

export type RequirementFlawType = z.infer<typeof requirementFlawTypeSchema>;

export interface RequirementQualityFlaw {
  flawType: RequirementFlawType;
  title: string;
  description: string;
  flawedSnippet?: string;
}

export interface RequirementQualityResult {
  requirementId: string;
  qualityStatus: RequirementQualityStatus;
  score: number; // 0-100 quality indicator
  flaws: RequirementQualityFlaw[];
  proposedImprovement?: {
    title: string;
    statement: string;
    rationale: string;
    suggestedVerificationMethod?: string;
  };
}

export const SUBJECTIVE_TERMS = [
  "adequate",
  "sufficient",
  "fast",
  "reliable",
  "as needed",
  "appropriate",
  "maximum possible",
  "flexible",
  "efficient",
  "user-friendly",
  "high performance",
  "lightweight",
  "robust",
  "optimal",
  "quick",
  "easy",
  "minimal",
  "safe enough",
] as const;

export const COMMON_ENGINEERING_UNITS = [
  "kg",
  "g",
  "m",
  "cm",
  "mm",
  "s",
  "ms",
  "N",
  "kN",
  "Pa",
  "kPa",
  "MPa",
  "bar",
  "W",
  "kW text",
  "kW",
  "MW",
  "V",
  "mV",
  "A",
  "mA",
  "°C",
  "K",
  "Hz",
  "kHz",
  "MHz",
  "deg",
  "rad",
  "m/s",
  "km/h",
  "rpm",
] as const;
