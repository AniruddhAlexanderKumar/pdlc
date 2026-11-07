import { z } from "zod";
import type { Risk } from "./artifacts";
import { type RiskStatus, riskStatusSchema } from "./shared/enums";
import { artifactIdentifierSchema, entityIdSchema } from "./shared/identifier";

/**
 * An engineering risk: what could go wrong, why, what would happen, and what
 * is being done about it.
 *
 * The `Risk` interface itself lives in `./artifacts` (re-exported from the
 * barrel from there, not here, to avoid a duplicate export) — this module
 * adds the validation, lifecycle and traceability contracts now that a real
 * repository and service exist for it, the same graduation `design-item.ts`
 * already went through; the shape is not redefined here.
 *
 * Quantitative scoring is deliberately not modelled. There is no probability
 * field, no impact field, and no derived numeric severity anywhere in this
 * module — the domain does not yet justify one, and inventing a number would
 * read as measured when nothing was measured. `cause` and `consequence` are
 * free text for exactly that reason: they carry an engineer's own account of
 * "why" and "so what", not a score a person can misread as computed.
 */

export const riskSchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  identifier: artifactIdentifierSchema,
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  cause: z.string().nullable(),
  consequence: z.string().nullable(),
  status: riskStatusSchema,
  ownerId: entityIdSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
}) satisfies z.ZodType<Risk>;

// --- Repository-layer contracts ----------------------------------------------

export const createRiskInputSchema = z.object({
  projectId: entityIdSchema,
  identifier: artifactIdentifierSchema,
  title: z.string().trim().min(1, "A risk title is required").max(300),
  description: z.string().trim().min(1, "A risk description is required").max(10_000),
  cause: z.string().trim().max(10_000).nullish(),
  consequence: z.string().trim().max(10_000).nullish(),
  status: riskStatusSchema.optional(),
  ownerId: entityIdSchema.nullish(),
});

export type CreateRiskInput = z.infer<typeof createRiskInputSchema>;

export const updateRiskInputSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().trim().min(1).max(10_000).optional(),
    cause: z.string().trim().max(10_000).nullish(),
    consequence: z.string().trim().max(10_000).nullish(),
    status: riskStatusSchema.optional(),
    ownerId: entityIdSchema.nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, "No fields to update");

export type UpdateRiskInput = z.infer<typeof updateRiskInputSchema>;

/** Filters for listing risks within a single project. */
export const riskFilterSchema = z.object({
  projectId: entityIdSchema,
  status: riskStatusSchema.optional(),
  ownerId: entityIdSchema.optional(),
});

export type RiskFilter = z.infer<typeof riskFilterSchema>;

// --- Lifecycle ----------------------------------------------------------------

/**
 * The risk lifecycle, as a deterministic table.
 *
 * A risk is disposed of one of two ways — mitigated (something was done to
 * reduce it) or accepted (a decision was made to carry it as-is) — and either
 * disposition can then be closed out. `CLOSED` is terminal: there is no
 * `CLOSED → OPEN` transition, because reopening a closed risk is a distinct
 * engineering act (a new risk, or a dedicated reopen operation this build
 * does not introduce) rather than a status flip.
 */
export const RISK_TRANSITIONS: Readonly<Record<RiskStatus, readonly RiskStatus[]>> = {
  OPEN: ["MITIGATED", "ACCEPTED", "CLOSED"],
  MITIGATED: ["CLOSED"],
  ACCEPTED: ["CLOSED"],
  CLOSED: [],
} as const;

/** The statuses a risk may legally move to from its current one. */
export function allowedRiskTransitions(from: RiskStatus): readonly RiskStatus[] {
  return RISK_TRANSITIONS[from];
}

export function canTransitionRisk(from: RiskStatus, to: RiskStatus): boolean {
  return RISK_TRANSITIONS[from].includes(to);
}

/**
 * Whether the risk's content (title, description, cause, consequence) may
 * still be changed.
 *
 * This is deliberately a single not-closed/closed gate rather than a
 * field-by-field matrix: `OPEN`, `MITIGATED` and `ACCEPTED` all reach this
 * through the same validated, audited update path — every edit is attributed
 * to an actor and timestamped regardless of status — which is the real
 * control this domain enforces on a "still open" risk. `CLOSED` is the actual
 * lock: a closed risk's record is exactly what it was when it closed.
 */
export function isRiskContentEditable(status: RiskStatus): boolean {
  return status !== "CLOSED";
}

/** Whether ownership may still be reassigned. Frozen only once the risk is closed. */
export function isRiskOwnerAssignable(status: RiskStatus): boolean {
  return status !== "CLOSED";
}

/** Whether traceability may still be edited. A closed risk keeps its links as-is. */
export function areRiskLinksEditable(status: RiskStatus): boolean {
  return status !== "CLOSED";
}

// --- API request contracts ----------------------------------------------------

/**
 * What a caller may supply when creating a risk.
 *
 * `projectId` comes from the route, the organization from the session, the
 * status from the lifecycle (always `OPEN`), and timestamps from the
 * database — so `strictObject` rejects all of them rather than silently
 * dropping them.
 */
export const createRiskRequestSchema = z.strictObject({
  // Optional: omitted, the service numbers it (see auto-identifier.ts).
  identifier: artifactIdentifierSchema.optional(),
  title: z.string().trim().min(1, "A risk title is required").max(300),
  description: z.string().trim().min(1, "A risk description is required").max(10_000),
  cause: z.string().trim().max(10_000).nullish(),
  consequence: z.string().trim().max(10_000).nullish(),
  ownerId: entityIdSchema.nullish(),
});

export type CreateRiskRequest = z.infer<typeof createRiskRequestSchema>;

/**
 * Content-only update. Status is absent by design: lifecycle changes go
 * through the transition endpoint so they are validated against the table
 * above, and ownership has its own endpoint so it audits as its own event.
 */
export const updateRiskRequestSchema = z
  .strictObject({
    title: z.string().trim().min(1, "A risk title is required").max(300).optional(),
    description: z.string().trim().min(1, "A risk description is required").max(10_000).optional(),
    cause: z.string().trim().max(10_000).nullish(),
    consequence: z.string().trim().max(10_000).nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, "No fields to update");

export type UpdateRiskRequest = z.infer<typeof updateRiskRequestSchema>;

export const transitionRiskRequestSchema = z.strictObject({
  to: riskStatusSchema,
  /** Why the transition was made — recorded on the audit event. */
  rationale: z.string().trim().max(2000).nullish(),
});

export type TransitionRiskRequest = z.infer<typeof transitionRiskRequestSchema>;

/** Assigns an owner, or clears one with an explicit null. */
export const assignRiskOwnerRequestSchema = z.strictObject({
  ownerId: entityIdSchema.nullable(),
});

export type AssignRiskOwnerRequest = z.infer<typeof assignRiskOwnerRequestSchema>;

// --- Traceability ---------------------------------------------------------------

/**
 * What a risk may be linked to — three real join tables, each a fixed pair
 * of endpoint types. There is no generic entityType/entityId path: an
 * unrecognized relation fails schema validation before it can reach the
 * database.
 */
export const RISK_RELATIONS = ["REQUIREMENT", "DESIGN_ITEM", "ENGINEERING_DECISION"] as const;
export type RiskRelation = (typeof RISK_RELATIONS)[number];
export const riskRelationSchema = z.enum(RISK_RELATIONS);

/**
 * None of the three link tables (`RiskRequirementLink`, `RiskDesignLink`,
 * `DecisionRiskLink`) carries a link type — only an optional note — so one
 * flat shape covers all three variants.
 */
export const riskLinkRequestSchema = z.strictObject({
  relation: riskRelationSchema,
  targetId: entityIdSchema,
  note: z.string().trim().max(2000).nullish(),
});

export type RiskLinkRequest = z.infer<typeof riskLinkRequestSchema>;

/** One linked artifact, as shown in the risk's traceability panel. */
export interface RiskLinkSummary {
  /** The composite "RELATION:rowId" key — see {@link riskLinkKey}. */
  id: string;
  relation: RiskRelation;
  targetId: string;
  identifier: string;
  title: string;
  note: string | null;
  createdAt: Date;
}

/**
 * The composite id a client sees for a risk link (`"REQUIREMENT:cljk..."`) —
 * not a database id, but the relation and the underlying row's id joined the
 * same way certification's compliance links already do, so `DELETE
 * .../links/[linkId]` can parse it back apart to know which of the three
 * tables to delete from.
 */
export function riskLinkKey(relation: RiskRelation, rowId: string): string {
  return `${relation}:${rowId}`;
}

export function parseRiskLinkKey(key: string): { relation: RiskRelation; rowId: string } | null {
  const separatorIndex = key.indexOf(":");
  if (separatorIndex <= 0) return null;
  const relation = key.slice(0, separatorIndex);
  const rowId = key.slice(separatorIndex + 1);
  if (!rowId || !(RISK_RELATIONS as readonly string[]).includes(relation)) return null;
  return { relation: relation as RiskRelation, rowId };
}

// --- Display helpers ------------------------------------------------------------

export function riskStatusLabel(status: RiskStatus): string {
  switch (status) {
    case "OPEN":
      return "Open";
    case "MITIGATED":
      return "Mitigated";
    case "ACCEPTED":
      return "Accepted";
    case "CLOSED":
      return "Closed";
  }
}

export function riskRelationLabel(relation: RiskRelation): string {
  switch (relation) {
    case "REQUIREMENT":
      return "Requirement";
    case "DESIGN_ITEM":
      return "Design item";
    case "ENGINEERING_DECISION":
      return "Decision";
  }
}
