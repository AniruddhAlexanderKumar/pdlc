import { z } from "zod";
import { type ComparisonOperator, comparisonOperatorSchema } from "./shared/enums";
import { entityIdSchema } from "./shared/identifier";

/**
 * Decision memory: the structured record around an engineering decision.
 *
 * A decision's value is not the sentence describing it — it is being able to
 * reconstruct, years later, what else was considered, what had to be true,
 * and whether what was expected actually happened. Each of those is a record
 * in its own right rather than a paragraph, so it can be counted, revisited,
 * and eventually watched.
 *
 * Prisma-free, like the rest of the domain.
 */

// --- Alternatives -----------------------------------------------------------

/** An option that was considered and not chosen. */
export interface DecisionAlternative {
  id: string;
  engineeringDecisionId: string;
  title: string;
  description: string | null;
  reasonRejected: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const createAlternativeRequestSchema = z.strictObject({
  title: z.string().trim().min(1, "A title is required").max(300),
  description: z.string().trim().max(10_000).nullish(),
  reasonRejected: z.string().trim().max(10_000).nullish(),
});

export type CreateAlternativeRequest = z.infer<typeof createAlternativeRequestSchema>;

export const updateAlternativeRequestSchema = z
  .strictObject({
    title: z.string().trim().min(1, "A title is required").max(300).optional(),
    description: z.string().trim().max(10_000).nullish(),
    reasonRejected: z.string().trim().max(10_000).nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, "No fields to update");

export type UpdateAlternativeRequest = z.infer<typeof updateAlternativeRequestSchema>;

// --- Assumptions ------------------------------------------------------------

/**
 * Assumption states.
 *
 * UNKNOWN is the default and the honest one: writing an assumption down is
 * not the same as having checked it. ACTIVE means someone is relying on it
 * and it still looks sound; VALIDATED and INVALIDATED are only ever set by a
 * person recording a finding. Nothing in this build infers any of them.
 */
export const ASSUMPTION_STATUSES = ["UNKNOWN", "ACTIVE", "VALIDATED", "INVALIDATED"] as const;
export type AssumptionStatus = (typeof ASSUMPTION_STATUSES)[number];
export const assumptionStatusSchema = z.enum(ASSUMPTION_STATUSES);

/** Something that had to be true for the decision to remain sound. */
export interface DecisionAssumption {
  id: string;
  engineeringDecisionId: string;
  statement: string;
  status: AssumptionStatus;
  rationale: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Status is accepted on create but defaults to UNKNOWN — a newly recorded
 * assumption has not been checked by anyone.
 */
export const createAssumptionRequestSchema = z.strictObject({
  statement: z.string().trim().min(1, "An assumption statement is required").max(2000),
  status: assumptionStatusSchema.optional(),
  rationale: z.string().trim().max(10_000).nullish(),
});

export type CreateAssumptionRequest = z.infer<typeof createAssumptionRequestSchema>;

export const updateAssumptionRequestSchema = z
  .strictObject({
    statement: z.string().trim().min(1, "An assumption statement is required").max(2000).optional(),
    status: assumptionStatusSchema.optional(),
    rationale: z.string().trim().max(10_000).nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, "No fields to update");

export type UpdateAssumptionRequest = z.infer<typeof updateAssumptionRequestSchema>;

// --- Expectation ------------------------------------------------------------

/**
 * Whether what was expected has been seen to happen.
 *
 * NOT_OBSERVED is where every expectation starts and where most will sit for
 * a long time. HELD and BREACHED are conclusions a person draws from an
 * observation; UNKNOWN records that it was looked at and could not be
 * determined. The system never decides between them on its own.
 */
export const EXPECTATION_STATUSES = ["NOT_OBSERVED", "HELD", "BREACHED", "UNKNOWN"] as const;
export type ExpectationStatus = (typeof EXPECTATION_STATUSES)[number];
export const expectationStatusSchema = z.enum(EXPECTATION_STATUSES);

/**
 * What the decision was expected to produce, and what was later observed.
 *
 * Values are text because an expectation may be numeric ("< 4.2") or
 * qualitative ("no measurable soak-back"). This records the claim; it does
 * not evaluate it.
 *
 * `comparisonOperator` is the one thing that makes an expectation mechanically
 * checkable. It is optional and always explicit: with an operator and a numeric
 * expected value, the drift engine can compare an observation against it
 * deterministically; without one, the expectation is still a perfectly good
 * engineering record, and drift reports it as not comparable rather than
 * inventing a threshold out of the prose.
 */
export interface DecisionExpectation {
  id: string;
  engineeringDecisionId: string;
  statement: string;
  measure: string | null;
  expectedValue: string | null;
  unit: string | null;
  /** How `expectedValue` should be compared. Null means "not comparable". */
  comparisonOperator: ComparisonOperator | null;
  dueAt: Date | null;
  status: ExpectationStatus;
  actualValue: string | null;
  observedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * One schema for create and replace — the expectation is 1:1 with its
 * decision, so `PUT` sets it whether or not one already exists.
 *
 * `status` is accepted so a person can record what they concluded, but it is
 * never derived: supplying `actualValue` does not silently mark the
 * expectation HELD.
 */
export const setExpectationRequestSchema = z.strictObject({
  statement: z.string().trim().min(1, "An expectation statement is required").max(2000),
  measure: z.string().trim().max(200).nullish(),
  expectedValue: z.string().trim().max(200).nullish(),
  unit: z.string().trim().max(50).nullish(),
  /** Explicit, never inferred from the expected-value text. */
  comparisonOperator: comparisonOperatorSchema.nullish(),
  dueAt: z.coerce.date().nullish(),
  status: expectationStatusSchema.optional(),
  actualValue: z.string().trim().max(200).nullish(),
  observedAt: z.coerce.date().nullish(),
});

export type SetExpectationRequest = z.infer<typeof setExpectationRequestSchema>;

// --- Decision traceability --------------------------------------------------

/**
 * What a decision can be linked to, each naming one existing typed table.
 *
 * Not an opaque `entityType + entityId` pair: the variant selects a specific
 * join table with its own real foreign key, so an unknown combination fails
 * validation before reaching the database. EVIDENCE reuses the existing
 * evidence-link table rather than introducing a second one.
 */
export const DECISION_RELATIONS = [
  "REQUIREMENT",
  "DESIGN_ITEM",
  "RISK",
  "ISSUE",
  "EVIDENCE",
] as const;
export type DecisionRelation = (typeof DECISION_RELATIONS)[number];
export const decisionRelationSchema = z.enum(DECISION_RELATIONS);

const linkNote = z.string().trim().max(2000).nullish();

export const decisionLinkRequestSchema = z.discriminatedUnion("relation", [
  z.strictObject({
    relation: z.literal("REQUIREMENT"),
    targetId: entityIdSchema,
    /** Which way the edge reads; defaults to the decision addressing the requirement. */
    linkType: z
      .enum(["DECISION_ADDRESSES_REQUIREMENT", "REQUIREMENT_DERIVED_FROM_DECISION"])
      .optional(),
    note: linkNote,
  }),
  z.strictObject({ relation: z.literal("DESIGN_ITEM"), targetId: entityIdSchema, note: linkNote }),
  z.strictObject({ relation: z.literal("RISK"), targetId: entityIdSchema, note: linkNote }),
  z.strictObject({ relation: z.literal("ISSUE"), targetId: entityIdSchema, note: linkNote }),
  // The evidence-link table carries a note but no link type.
  z.strictObject({ relation: z.literal("EVIDENCE"), targetId: entityIdSchema, note: linkNote }),
]);

export type DecisionLinkRequest = z.infer<typeof decisionLinkRequestSchema>;

export const decisionUnlinkRequestSchema = z.strictObject({
  relation: decisionRelationSchema,
  targetId: entityIdSchema,
  linkType: z.string().trim().min(1).max(64).optional(),
});

export type DecisionUnlinkRequest = z.infer<typeof decisionUnlinkRequestSchema>;

/** One linked artifact, as shown on the decision detail page. */
export interface DecisionLinkSummary {
  relation: DecisionRelation;
  targetId: string;
  /** Evidence has no project-scoped identifier, so this may be empty for it. */
  identifier: string;
  title: string;
  linkType: string | null;
  note: string | null;
  createdAt: Date;
}
