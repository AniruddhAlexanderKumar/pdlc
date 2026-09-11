import { z } from "zod";
import { type VerificationStatus, verificationMethodSchema, verificationStatusSchema } from "./shared/enums";
import { artifactIdentifierSchema, entityIdSchema } from "./shared/identifier";

/**
 * Verification activity request contracts and lifecycle. The entity type
 * lives in `artifacts.ts`.
 *
 * This records the *intent and outcome* of verification — method, plan,
 * result. It is not a test execution system: nothing here runs a test,
 * uploads a report, or talks to a laboratory.
 */

/**
 * The verification lifecycle.
 *
 * An activity is planned, then run, then it lands on an outcome — and the
 * outcome is where it stops. PASSED, FAILED and WAIVED are all terminal
 * because a result is a statement about one execution: re-running a failed
 * test is a *new* activity, not an edit to the old one's verdict. Allowing
 * FAILED → PASSED would let a record quietly rewrite what happened, which is
 * exactly what an engineering record exists to prevent.
 *
 * WAIVED is reachable while the activity is still open, since waiving is a
 * decision not to verify rather than a result of verifying.
 */
export const VERIFICATION_TRANSITIONS: Readonly<
  Record<VerificationStatus, readonly VerificationStatus[]>
> = {
  PLANNED: ["IN_PROGRESS", "WAIVED"],
  IN_PROGRESS: ["PASSED", "FAILED", "WAIVED"],
  PASSED: [],
  FAILED: [],
  WAIVED: [],
} as const;

export function allowedVerificationTransitions(
  from: VerificationStatus,
): readonly VerificationStatus[] {
  return VERIFICATION_TRANSITIONS[from];
}

export function canTransitionVerification(
  from: VerificationStatus,
  to: VerificationStatus,
): boolean {
  return VERIFICATION_TRANSITIONS[from].includes(to);
}

/** Statuses that conclude the activity — reaching one stamps `completedDate`. */
export const TERMINAL_VERIFICATION_STATUSES = ["PASSED", "FAILED", "WAIVED"] as const;

export function isTerminalVerificationStatus(status: VerificationStatus): boolean {
  return (TERMINAL_VERIFICATION_STATUSES as readonly VerificationStatus[]).includes(status);
}

/** Whether the activity's plan may still be edited. Concluded records are frozen. */
export function isVerificationEditable(status: VerificationStatus): boolean {
  return !isTerminalVerificationStatus(status);
}

/**
 * Dates arrive as a calendar date from a date input and are stored as an
 * instant. `z.coerce.date()` reads "2026-04-01" as UTC midnight, which matches
 * how `formatIsoDate` renders them back — one convention end to end, no
 * silent timezone shift.
 */
const planDate = z.coerce.date().nullish();

export const createVerificationActivityRequestSchema = z.strictObject({
  identifier: artifactIdentifierSchema,
  title: z.string().trim().min(1, "A title is required").max(300),
  description: z.string().trim().max(10_000).nullish(),
  method: verificationMethodSchema,
  plannedDate: planDate,
  ownerId: entityIdSchema.nullish(),
});

export type CreateVerificationActivityRequest = z.infer<
  typeof createVerificationActivityRequestSchema
>;

/**
 * Neither status nor `completedDate` is editable here: status moves through
 * the transition endpoint, and the completion stamp is set by the transition
 * that concludes the activity, so the two can never disagree.
 */
export const updateVerificationActivityRequestSchema = z
  .strictObject({
    title: z.string().trim().min(1, "A title is required").max(300).optional(),
    description: z.string().trim().max(10_000).nullish(),
    method: verificationMethodSchema.optional(),
    plannedDate: planDate,
  })
  .refine((value) => Object.keys(value).length > 0, "No fields to update");

export type UpdateVerificationActivityRequest = z.infer<
  typeof updateVerificationActivityRequestSchema
>;

export const transitionVerificationRequestSchema = z.strictObject({
  to: verificationStatusSchema,
  /** Why — recorded on the audit event, e.g. the justification for a waiver. */
  rationale: z.string().trim().max(2000).nullish(),
});

export type TransitionVerificationRequest = z.infer<typeof transitionVerificationRequestSchema>;

export const assignVerificationOwnerRequestSchema = z.strictObject({
  ownerId: entityIdSchema.nullable(),
});

export type AssignVerificationOwnerRequest = z.infer<typeof assignVerificationOwnerRequestSchema>;
