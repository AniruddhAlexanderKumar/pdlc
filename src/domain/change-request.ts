import { z } from "zod";
import { type ChangeImpactTarget, changeImpactTargetSchema } from "./links";
import {
  CHANGE_REQUEST_STATUSES,
  type ChangeRequestStatus,
  changeRequestStatusSchema,
} from "./shared/enums";
import { artifactIdentifierSchema, entityIdSchema } from "./shared/identifier";

/**
 * A proposed engineering change, as a first-class engineering event.
 *
 * A change request is not a ticket. It is the record that some part of the
 * product's engineering state or basis is proposed to alter — what is changing,
 * why, who asked, and what they believe it touches.
 *
 * **Declared impact is not computed impact.** The artifacts recorded against a
 * change are what an engineer *asserted* is affected. Nothing here traverses
 * the graph, and nothing here claims the declared set is complete or correct. A
 * later impact engine will read these declarations alongside the engineering
 * graph to compute an affected set; the two must stay distinguishable, because
 * a declaration is a human claim and a computed set is a derivation. Conflating
 * them would make it impossible to tell what an engineer knew from what the
 * system worked out.
 */
export interface ChangeRequest {
  id: string;
  projectId: string;
  identifier: string;
  title: string;
  description: string;
  reason: string;
  status: ChangeRequestStatus;
  requestedById: string;
  createdAt: Date;
  updatedAt: Date;
}

export const changeRequestSchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  identifier: artifactIdentifierSchema,
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  reason: z.string().trim().min(1),
  status: changeRequestStatusSchema,
  requestedById: entityIdSchema,
  createdAt: z.date(),
  updatedAt: z.date(),
}) satisfies z.ZodType<ChangeRequest>;

// --- Persistence-facing input -----------------------------------------------

/**
 * What the repository writes.
 *
 * `requestedById` is present here because the row needs it, but no HTTP
 * contract exposes it — see {@link createChangeRequestRequestSchema}. The
 * service fills it from the authenticated session.
 */
export const createChangeRequestInputSchema = z.object({
  projectId: entityIdSchema,
  identifier: artifactIdentifierSchema,
  title: z.string().trim().min(1, "A change request title is required").max(300),
  description: z.string().trim().min(1, "A change request description is required").max(10_000),
  reason: z.string().trim().min(1, "A change request must record why it is proposed").max(10_000),
  status: changeRequestStatusSchema.optional(),
  requestedById: entityIdSchema,
});

export type CreateChangeRequestInput = z.infer<typeof createChangeRequestInputSchema>;

export const updateChangeRequestInputSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().trim().min(1).max(10_000).optional(),
    reason: z.string().trim().min(1).max(10_000).optional(),
    status: changeRequestStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No fields to update");

export type UpdateChangeRequestInput = z.infer<typeof updateChangeRequestInputSchema>;

export const changeRequestFilterSchema = z.object({
  projectId: entityIdSchema,
  status: changeRequestStatusSchema.optional(),
  requestedById: entityIdSchema.optional(),
});

export type ChangeRequestFilter = z.infer<typeof changeRequestFilterSchema>;

// --- Lifecycle --------------------------------------------------------------

/**
 * The change lifecycle.
 *
 * A change is drafted, submitted, reviewed, and then either approved and
 * implemented or rejected. It may be abandoned from any state that has not yet
 * concluded.
 *
 * Approval is reachable only from review. That is the whole point of the
 * lifecycle: a change that alters the engineering basis must have been looked
 * at by someone before it is approved, and no path skips that step.
 *
 * REJECTED, IMPLEMENTED and CANCELLED are terminal. A rejected change is not
 * reopened and quietly approved later — a new change request is raised, so the
 * record of what was refused survives.
 */
export const CHANGE_REQUEST_TRANSITIONS: Readonly<
  Record<ChangeRequestStatus, readonly ChangeRequestStatus[]>
> = {
  DRAFT: ["SUBMITTED", "CANCELLED"],
  SUBMITTED: ["UNDER_REVIEW", "CANCELLED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["IMPLEMENTED"],
  REJECTED: [],
  IMPLEMENTED: [],
  CANCELLED: [],
} as const;

export function allowedChangeRequestTransitions(
  from: ChangeRequestStatus,
): readonly ChangeRequestStatus[] {
  return CHANGE_REQUEST_TRANSITIONS[from];
}

export function canTransitionChangeRequest(
  from: ChangeRequestStatus,
  to: ChangeRequestStatus,
): boolean {
  return CHANGE_REQUEST_TRANSITIONS[from].includes(to);
}

/** Terminal states: the change has concluded and nothing about it may change. */
export function isChangeRequestTerminal(status: ChangeRequestStatus): boolean {
  return CHANGE_REQUEST_TRANSITIONS[status].length === 0;
}

/**
 * Statuses in which a change is still in flight — its scope can still move, and
 * the artifacts it touches are not settled.
 *
 * Derived from the transition table rather than restated, so a lifecycle change
 * cannot leave a second, silently divergent list behind. IMPLEMENTED is
 * excluded because the change has landed: its effect is in the artifacts now,
 * not pending against them.
 *
 * Sorted, so anything that queries with it produces a stable plan.
 */
export const ACTIVE_CHANGE_REQUEST_STATUSES: readonly ChangeRequestStatus[] =
  CHANGE_REQUEST_STATUSES.filter((status) => !isChangeRequestTerminal(status))
    .slice()
    .sort();

// --- Editability ------------------------------------------------------------

/**
 * Whether the change definition — title, description, reason — may still be
 * edited.
 *
 * Open while drafting and once submitted; closed from review onward. The point
 * is narrow and important: a change that has been put in front of a reviewer
 * must not silently become a different change. Editing the description of a
 * change already under review would mean the thing approved was not the thing
 * examined.
 *
 * The project and the identifier are not editable in *any* state, which is why
 * no update contract carries them at all rather than guarding them per status.
 */
export function isChangeDefinitionEditable(status: ChangeRequestStatus): boolean {
  return status === "DRAFT" || status === "SUBMITTED";
}

/**
 * Whether declared impacts may still be added or removed.
 *
 * Deliberately wider than the definition: it stays open through review. Getting
 * the declared scope right is much of what a review is *for* — a reviewer
 * saying "this also touches the thermal interface" is the process working, not
 * the change mutating. It closes at approval, because from that point the
 * declared scope is part of what was approved.
 */
export function areDeclaredImpactsEditable(status: ChangeRequestStatus): boolean {
  return status === "DRAFT" || status === "SUBMITTED" || status === "UNDER_REVIEW";
}

// --- API request contracts --------------------------------------------------

/**
 * Callers supply substance only.
 *
 * `projectId` comes from the route, the organization and the requester from the
 * session, the status from the lifecycle (always DRAFT), and timestamps from
 * the database. `strictObject` means a client that tries to send
 * `requestedById` or `status` is rejected outright rather than having the field
 * quietly dropped — a silent drop hides an attempt worth failing loudly on.
 */
export const createChangeRequestRequestSchema = z.strictObject({
  // Optional: omitted, the service numbers it (see auto-identifier.ts).
  identifier: artifactIdentifierSchema.optional(),
  title: z.string().trim().min(1, "A change request title is required").max(300),
  description: z
    .string()
    .trim()
    .min(1, "Describe what is changing")
    .max(10_000),
  reason: z.string().trim().min(1, "Record why this change is proposed").max(10_000),
});

export type CreateChangeRequestRequest = z.infer<typeof createChangeRequestRequestSchema>;

/**
 * Content update.
 *
 * No `status` field exists, so an ordinary PATCH cannot move a change through
 * its lifecycle — that is only reachable through the transition operation.
 */
export const updateChangeRequestRequestSchema = z
  .strictObject({
    title: z.string().trim().min(1, "A change request title is required").max(300).optional(),
    description: z.string().trim().min(1, "Describe what is changing").max(10_000).optional(),
    reason: z
      .string()
      .trim()
      .min(1, "Record why this change is proposed")
      .max(10_000)
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No fields to update");

export type UpdateChangeRequestRequest = z.infer<typeof updateChangeRequestRequestSchema>;

export const transitionChangeRequestRequestSchema = z.strictObject({
  to: changeRequestStatusSchema,
  /** Why the transition was made — recorded on the audit event. */
  rationale: z.string().trim().max(2000).nullish(),
});

export type TransitionChangeRequestRequest = z.infer<typeof transitionChangeRequestRequestSchema>;

// --- Declared impact --------------------------------------------------------

/**
 * A caller's assertion that this change affects a particular artifact.
 *
 * The target is a tagged `{ type, id }` pair drawn from the types the
 * relationship table actually has columns for — never a free-form entity
 * reference. The server checks the target exists in the same project before
 * recording anything.
 */
export const declareImpactRequestSchema = z.strictObject({
  target: changeImpactTargetSchema,
  /** Why the requester believes this artifact is affected. */
  note: z.string().trim().max(2000).nullish(),
});

export type DeclareImpactRequest = z.infer<typeof declareImpactRequestSchema>;

/**
 * One declared impact, as a reader needs to see it.
 *
 * Named "declared" everywhere, in the type as well as the UI, so that when the
 * impact engine arrives its output cannot be mistaken for this and this cannot
 * be mistaken for its output.
 */
export interface DeclaredImpact {
  id: string;
  changeRequestId: string;
  target: ChangeImpactTarget;
  /** The target's human-facing key, where its type has one. */
  targetIdentifier: string | null;
  targetTitle: string;
  note: string | null;
  createdAt: Date;
  createdBy: { id: string; name: string } | null;
}
