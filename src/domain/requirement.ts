import { z } from "zod";
import {
  type RequirementPriority,
  type RequirementStatus,
  requirementPrioritySchema,
  requirementStatusSchema,
} from "./shared/enums";
import { artifactIdentifierSchema, entityIdSchema } from "./shared/identifier";

/**
 * A formal engineering requirement.
 *
 * `statement` is the normative text ("The system shall ..."); `rationale`
 * records why it exists, which is what makes a later reader able to judge
 * whether a proposed change invalidates it.
 */
export interface Requirement {
  id: string;
  projectId: string;
  identifier: string;
  title: string;
  statement: string;
  rationale: string | null;
  status: RequirementStatus;
  priority: RequirementPriority;
  source: string | null;
  ownerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const requirementSchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  identifier: artifactIdentifierSchema,
  title: z.string().trim().min(1),
  statement: z.string().trim().min(1),
  rationale: z.string().nullable(),
  status: requirementStatusSchema,
  priority: requirementPrioritySchema,
  source: z.string().nullable(),
  ownerId: entityIdSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
}) satisfies z.ZodType<Requirement>;

export const createRequirementInputSchema = z.object({
  projectId: entityIdSchema,
  identifier: artifactIdentifierSchema,
  title: z.string().trim().min(1, "A requirement title is required").max(300),
  statement: z.string().trim().min(1, "A requirement statement is required").max(10_000),
  rationale: z.string().trim().max(10_000).nullish(),
  status: requirementStatusSchema.optional(),
  priority: requirementPrioritySchema.optional(),
  source: z.string().trim().max(300).nullish(),
  ownerId: entityIdSchema.nullish(),
});

export type CreateRequirementInput = z.infer<typeof createRequirementInputSchema>;

export const updateRequirementInputSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    statement: z.string().trim().min(1).max(10_000).optional(),
    rationale: z.string().trim().max(10_000).nullish(),
    status: requirementStatusSchema.optional(),
    priority: requirementPrioritySchema.optional(),
    source: z.string().trim().max(300).nullish(),
    ownerId: entityIdSchema.nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, "No fields to update");

export type UpdateRequirementInput = z.infer<typeof updateRequirementInputSchema>;

/** Filters for listing requirements within a single project. */
export const requirementFilterSchema = z.object({
  projectId: entityIdSchema,
  status: requirementStatusSchema.optional(),
  priority: requirementPrioritySchema.optional(),
  ownerId: entityIdSchema.optional(),
});

export type RequirementFilter = z.infer<typeof requirementFilterSchema>;

// --- Lifecycle --------------------------------------------------------------

/**
 * The requirement lifecycle, as a deterministic table.
 *
 * A requirement earns its status: it cannot jump from DRAFT straight to
 * APPROVED or BASELINED, because the intermediate states are where review
 * actually happens and skipping them would make an approval meaningless.
 * OBSOLETE is reachable from any live state and is terminal — superseding a
 * requirement is always allowed, resurrecting one is not.
 */
export const REQUIREMENT_TRANSITIONS: Readonly<Record<RequirementStatus, readonly RequirementStatus[]>> =
  {
    DRAFT: ["IN_REVIEW", "OBSOLETE"],
    IN_REVIEW: ["APPROVED", "OBSOLETE"],
    APPROVED: ["BASELINED", "OBSOLETE"],
    BASELINED: ["OBSOLETE"],
    OBSOLETE: [],
  } as const;

/** The statuses a requirement may legally move to from its current one. */
export function allowedTransitions(from: RequirementStatus): readonly RequirementStatus[] {
  return REQUIREMENT_TRANSITIONS[from];
}

export function canTransition(from: RequirementStatus, to: RequirementStatus): boolean {
  return REQUIREMENT_TRANSITIONS[from].includes(to);
}

/**
 * Whether the requirement's content (title, statement, rationale, priority,
 * source) may still be changed.
 *
 * Content is open while the requirement is being written and reviewed, and
 * closes once it is APPROVED: changing the text of an approved requirement
 * would silently invalidate the approval. BASELINED and OBSOLETE are fully
 * read-only records.
 */
export function isContentEditable(status: RequirementStatus): boolean {
  return status === "DRAFT" || status === "IN_REVIEW";
}

/**
 * Whether ownership may still be reassigned.
 *
 * Broader than content editability on purpose: who stewards an approved
 * requirement is organizational bookkeeping, not a change to what the
 * requirement says. A baselined or obsolete record is frozen entirely.
 */
export function isOwnerAssignable(status: RequirementStatus): boolean {
  return status !== "BASELINED" && status !== "OBSOLETE";
}

/** Whether traceability may still be edited. Frozen records keep their links as-is. */
export function areLinksEditable(status: RequirementStatus): boolean {
  return status !== "OBSOLETE";
}

// --- API request contracts --------------------------------------------------

/**
 * What a caller may supply when creating a requirement.
 *
 * `projectId` comes from the route, the organization from the session, the
 * status from the lifecycle (always DRAFT), and timestamps from the database —
 * so `strictObject` rejects all of them rather than silently dropping them.
 */
export const createRequirementRequestSchema = z.strictObject({
  identifier: artifactIdentifierSchema,
  title: z.string().trim().min(1, "A requirement title is required").max(300),
  statement: z.string().trim().min(1, "A requirement statement is required").max(10_000),
  rationale: z.string().trim().max(10_000).nullish(),
  priority: requirementPrioritySchema.optional(),
  source: z.string().trim().max(300).nullish(),
  ownerId: entityIdSchema.nullish(),
});

export type CreateRequirementRequest = z.infer<typeof createRequirementRequestSchema>;

/**
 * Content-only update. Status is absent by design: lifecycle changes go
 * through the transition endpoint so they are validated against the table
 * above, and ownership has its own endpoint so it audits as its own event.
 */
export const updateRequirementRequestSchema = z
  .strictObject({
    title: z.string().trim().min(1, "A requirement title is required").max(300).optional(),
    statement: z.string().trim().min(1, "A requirement statement is required").max(10_000).optional(),
    rationale: z.string().trim().max(10_000).nullish(),
    priority: requirementPrioritySchema.optional(),
    source: z.string().trim().max(300).nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, "No fields to update");

export type UpdateRequirementRequest = z.infer<typeof updateRequirementRequestSchema>;

export const transitionRequirementRequestSchema = z.strictObject({
  to: requirementStatusSchema,
  /** Why the transition was made — recorded on the audit event. */
  rationale: z.string().trim().max(2000).nullish(),
});

export type TransitionRequirementRequest = z.infer<typeof transitionRequirementRequestSchema>;

/** Assigns an owner, or clears one with an explicit null. */
export const assignRequirementOwnerRequestSchema = z.strictObject({
  ownerId: entityIdSchema.nullable(),
});

export type AssignRequirementOwnerRequest = z.infer<typeof assignRequirementOwnerRequestSchema>;
