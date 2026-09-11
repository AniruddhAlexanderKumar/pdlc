import { z } from "zod";
import { type DecisionStatus, decisionStatusSchema } from "./shared/enums";
import { artifactIdentifierSchema, entityIdSchema } from "./shared/identifier";

/**
 * An explicit, recorded engineering decision.
 *
 * This is not a note. `rationale`, `alternativesConsidered` and `assumptions`
 * exist because the value of a decision record is answering "why is it like
 * this, and what were we assuming when we chose it" years later — and because
 * an invalidated assumption is what makes a decision worth revisiting when a
 * change lands.
 */
export interface EngineeringDecision {
  id: string;
  projectId: string;
  identifier: string;
  title: string;
  statement: string;
  rationale: string;
  alternativesConsidered: string | null;
  assumptions: string | null;
  status: DecisionStatus;
  ownerId: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export const engineeringDecisionSchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  identifier: artifactIdentifierSchema,
  title: z.string().trim().min(1),
  statement: z.string().trim().min(1),
  rationale: z.string().trim().min(1),
  alternativesConsidered: z.string().nullable(),
  assumptions: z.string().nullable(),
  status: decisionStatusSchema,
  ownerId: entityIdSchema.nullable(),
  decidedAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
}) satisfies z.ZodType<EngineeringDecision>;

export const createEngineeringDecisionInputSchema = z.object({
  projectId: entityIdSchema,
  identifier: artifactIdentifierSchema,
  title: z.string().trim().min(1, "A decision title is required").max(300),
  statement: z.string().trim().min(1, "A decision statement is required").max(10_000),
  rationale: z.string().trim().min(1, "A decision must record its rationale").max(10_000),
  alternativesConsidered: z.string().trim().max(10_000).nullish(),
  assumptions: z.string().trim().max(10_000).nullish(),
  status: decisionStatusSchema.optional(),
  ownerId: entityIdSchema.nullish(),
  decidedAt: z.date().nullish(),
});

export type CreateEngineeringDecisionInput = z.infer<typeof createEngineeringDecisionInputSchema>;

export const updateEngineeringDecisionInputSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    statement: z.string().trim().min(1).max(10_000).optional(),
    rationale: z.string().trim().min(1).max(10_000).optional(),
    alternativesConsidered: z.string().trim().max(10_000).nullish(),
    assumptions: z.string().trim().max(10_000).nullish(),
    status: decisionStatusSchema.optional(),
    ownerId: entityIdSchema.nullish(),
    decidedAt: z.date().nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, "No fields to update");

export type UpdateEngineeringDecisionInput = z.infer<typeof updateEngineeringDecisionInputSchema>;

export const engineeringDecisionFilterSchema = z.object({
  projectId: entityIdSchema,
  status: decisionStatusSchema.optional(),
  ownerId: entityIdSchema.optional(),
});

export type EngineeringDecisionFilter = z.infer<typeof engineeringDecisionFilterSchema>;

// --- Lifecycle --------------------------------------------------------------

/**
 * The decision lifecycle.
 *
 * A decision is proposed, reviewed, and then either approved or rejected. An
 * approved decision is never un-approved: it is superseded by a later
 * decision, so the record of what was decided at the time survives. That is
 * the whole point of decision memory — a reader in three years needs to see
 * the decision that was actually in force, not a mutated version of it.
 *
 * REJECTED and SUPERSEDED are terminal.
 */
export const DECISION_TRANSITIONS: Readonly<Record<DecisionStatus, readonly DecisionStatus[]>> = {
  PROPOSED: ["UNDER_REVIEW", "REJECTED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["SUPERSEDED"],
  REJECTED: [],
  SUPERSEDED: [],
} as const;

export function allowedDecisionTransitions(from: DecisionStatus): readonly DecisionStatus[] {
  return DECISION_TRANSITIONS[from];
}

export function canTransitionDecision(from: DecisionStatus, to: DecisionStatus): boolean {
  return DECISION_TRANSITIONS[from].includes(to);
}

/**
 * Whether the decision's substance — statement, rationale, alternatives —
 * may still change.
 *
 * Open while proposed and under review; closed from approval onward. Editing
 * the statement of an approved decision would rewrite what was agreed, which
 * is exactly what this record exists to prevent.
 */
export function isDecisionContentEditable(status: DecisionStatus): boolean {
  return status === "PROPOSED" || status === "UNDER_REVIEW";
}

/** Rejected and superseded decisions are closed records; nothing may change. */
export function isDecisionRecordOpen(status: DecisionStatus): boolean {
  return status !== "REJECTED" && status !== "SUPERSEDED";
}

/**
 * Whether assumptions may still be recorded or revised.
 *
 * Deliberately wider than content editability: an assumption behind an
 * approved decision can be validated or invalidated long after approval, and
 * capturing that is the point. Only a closed record freezes them.
 */
export function areAssumptionsEditable(status: DecisionStatus): boolean {
  return isDecisionRecordOpen(status);
}

/**
 * Whether the expectation may still be set or observed. Same reasoning as
 * assumptions — an outcome is usually observed well after approval.
 */
export function isExpectationEditable(status: DecisionStatus): boolean {
  return isDecisionRecordOpen(status);
}

/** Whether traceability and evidence may still be attached or detached. */
export function areDecisionLinksEditable(status: DecisionStatus): boolean {
  return isDecisionRecordOpen(status);
}

/** Ownership follows the record: reassignable until the decision is closed. */
export function isDecisionOwnerAssignable(status: DecisionStatus): boolean {
  return isDecisionRecordOpen(status);
}

// --- API request contracts --------------------------------------------------

/**
 * Callers supply substance only. `projectId` comes from the route, the
 * organization from the session, the status from the lifecycle (always
 * PROPOSED), and timestamps from the database.
 */
export const createDecisionRequestSchema = z.strictObject({
  identifier: artifactIdentifierSchema,
  title: z.string().trim().min(1, "A decision title is required").max(300),
  statement: z.string().trim().min(1, "A decision statement is required").max(10_000),
  rationale: z.string().trim().min(1, "A decision must record its rationale").max(10_000),
  ownerId: entityIdSchema.nullish(),
  decidedAt: z.coerce.date().nullish(),
});

export type CreateDecisionRequest = z.infer<typeof createDecisionRequestSchema>;

/**
 * Content update.
 *
 * `alternativesConsidered` and `assumptions` are absent: those are now
 * first-class records with their own endpoints, and accepting the legacy text
 * fields here would create a second, competing source of truth.
 */
export const updateDecisionRequestSchema = z
  .strictObject({
    title: z.string().trim().min(1, "A decision title is required").max(300).optional(),
    statement: z.string().trim().min(1, "A decision statement is required").max(10_000).optional(),
    rationale: z.string().trim().min(1, "A rationale is required").max(10_000).optional(),
    decidedAt: z.coerce.date().nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, "No fields to update");

export type UpdateDecisionRequest = z.infer<typeof updateDecisionRequestSchema>;

export const transitionDecisionRequestSchema = z.strictObject({
  to: decisionStatusSchema,
  /** Why the transition was made — recorded on the audit event. */
  rationale: z.string().trim().max(2000).nullish(),
});

export type TransitionDecisionRequest = z.infer<typeof transitionDecisionRequestSchema>;

export const assignDecisionOwnerRequestSchema = z.strictObject({
  ownerId: entityIdSchema.nullable(),
});

export type AssignDecisionOwnerRequest = z.infer<typeof assignDecisionOwnerRequestSchema>;
