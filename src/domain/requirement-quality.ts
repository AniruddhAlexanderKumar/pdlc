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

/**
 * What the inspector found — a classification and the specific flaws behind
 * it, and deliberately no number.
 *
 * An earlier version of this carried `score: number // 0-100 quality
 * indicator`, computed as `100 - 15 per flaw`. That is an invented figure on
 * an invented scale: the 15 means nothing, a requirement with seven flaws is
 * not "10% good", and two requirements scoring 70 are not comparable in any
 * way the number implies. The product refuses figures like that everywhere
 * else — `certification.test.ts` asserts no rule may even *declare* a
 * `score` property, and `evidence.test.ts` rejects one on creation — and the
 * Help page tells the reader outright that no score exists anywhere in the
 * product. Shipping one here would have made that page a lie.
 *
 * `qualityStatus` and `flaws` say everything the score gestured at, and say
 * it in terms an engineer can check: which specific words are subjective,
 * which criterion is missing.
 */
export interface RequirementQualityResult {
  requirementId: string;
  qualityStatus: RequirementQualityStatus;
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
