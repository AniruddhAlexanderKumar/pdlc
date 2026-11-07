import { z } from "zod";
import type { Issue } from "./artifacts";
import { type IssueSeverity, type IssueStatus, issueSeveritySchema, issueStatusSchema } from "./shared/enums";
import { artifactIdentifierSchema, entityIdSchema } from "./shared/identifier";

/**
 * An observed problem or unresolved engineering question: something has
 * actually gone wrong or requires resolution — what it is, who owns it, and
 * what its disposition is.
 *
 * The `Issue` interface itself lives in `./artifacts` (re-exported from the
 * barrel from there, not here, to avoid a duplicate export) — this module
 * adds the validation, lifecycle and traceability contracts now that a real
 * repository and service exist for it, the same graduation `design-item.ts`
 * already went through; the shape is not redefined here.
 *
 * `severity` is the one classification this domain records, and it is an
 * explicit human judgement, not a derived score — the same discipline
 * `CertificationFinding.severity` already holds to. Nothing here computes a
 * severity from anything, and nothing ranks issues against each other.
 */

export const issueSchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  identifier: artifactIdentifierSchema,
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  severity: issueSeveritySchema,
  status: issueStatusSchema,
  ownerId: entityIdSchema.nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
}) satisfies z.ZodType<Issue>;

// --- Repository-layer contracts ----------------------------------------------

export const createIssueInputSchema = z.object({
  projectId: entityIdSchema,
  identifier: artifactIdentifierSchema,
  title: z.string().trim().min(1, "An issue title is required").max(300),
  description: z.string().trim().min(1, "An issue description is required").max(10_000),
  severity: issueSeveritySchema.optional(),
  status: issueStatusSchema.optional(),
  ownerId: entityIdSchema.nullish(),
});

export type CreateIssueInput = z.infer<typeof createIssueInputSchema>;

export const updateIssueInputSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().trim().min(1).max(10_000).optional(),
    severity: issueSeveritySchema.optional(),
    status: issueStatusSchema.optional(),
    ownerId: entityIdSchema.nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, "No fields to update");

export type UpdateIssueInput = z.infer<typeof updateIssueInputSchema>;

/** Filters for listing issues within a single project. */
export const issueFilterSchema = z.object({
  projectId: entityIdSchema,
  status: issueStatusSchema.optional(),
  severity: issueSeveritySchema.optional(),
  ownerId: entityIdSchema.optional(),
});

export type IssueFilter = z.infer<typeof issueFilterSchema>;

// --- Lifecycle ----------------------------------------------------------------

/**
 * The issue lifecycle, as a deterministic table.
 *
 * `OPEN → RESOLVED` is legal alongside the ordinary `OPEN → IN_PROGRESS →
 * RESOLVED` path: nothing in this domain requires a visible investigation
 * phase before a problem can be recorded as resolved (a mistakenly filed
 * issue, or one resolved the moment it was understood). `CLOSED` is
 * terminal — there is no `CLOSED → OPEN` transition; reopening is a distinct
 * act this build does not introduce a mechanism for.
 */
export const ISSUE_TRANSITIONS: Readonly<Record<IssueStatus, readonly IssueStatus[]>> = {
  OPEN: ["IN_PROGRESS", "RESOLVED"],
  IN_PROGRESS: ["RESOLVED"],
  RESOLVED: ["CLOSED"],
  CLOSED: [],
} as const;

/** The statuses an issue may legally move to from its current one. */
export function allowedIssueTransitions(from: IssueStatus): readonly IssueStatus[] {
  return ISSUE_TRANSITIONS[from];
}

export function canTransitionIssue(from: IssueStatus, to: IssueStatus): boolean {
  return ISSUE_TRANSITIONS[from].includes(to);
}

/**
 * Whether the issue's content (title, description, severity) may still be
 * changed.
 *
 * Open while the problem is still being understood or worked, and closed
 * once it is `RESOLVED`: editing the description of a resolved issue would
 * quietly rewrite what was actually found. The schema records no separate
 * closure note, so there is no "closure metadata" carve-out to make room
 * for — `RESOLVED` and `CLOSED` are both read-only for content.
 */
export function isIssueContentEditable(status: IssueStatus): boolean {
  return status === "OPEN" || status === "IN_PROGRESS";
}

/**
 * Whether ownership may still be reassigned.
 *
 * Broader than content editability on purpose, the same way a requirement's
 * owner stays assignable one stage past when its text locks: who is tracking
 * a resolved issue through to closure is organizational bookkeeping, not a
 * change to what was found. Only `CLOSED` freezes it.
 */
export function isIssueOwnerAssignable(status: IssueStatus): boolean {
  return status !== "CLOSED";
}

/** Whether traceability may still be edited. A closed issue keeps its links as-is. */
export function areIssueLinksEditable(status: IssueStatus): boolean {
  return status !== "CLOSED";
}

// --- API request contracts ----------------------------------------------------

/**
 * What a caller may supply when creating an issue.
 *
 * `projectId` comes from the route, the organization from the session, the
 * status from the lifecycle (always `OPEN`), and timestamps from the
 * database — so `strictObject` rejects all of them rather than silently
 * dropping them.
 */
export const createIssueRequestSchema = z.strictObject({
  // Optional: omitted, the service numbers it (see auto-identifier.ts).
  identifier: artifactIdentifierSchema.optional(),
  title: z.string().trim().min(1, "An issue title is required").max(300),
  description: z.string().trim().min(1, "An issue description is required").max(10_000),
  severity: issueSeveritySchema,
  ownerId: entityIdSchema.nullish(),
});

export type CreateIssueRequest = z.infer<typeof createIssueRequestSchema>;

/**
 * Content-only update. Status is absent by design: lifecycle changes go
 * through the transition endpoint so they are validated against the table
 * above, and ownership has its own endpoint so it audits as its own event.
 */
export const updateIssueRequestSchema = z
  .strictObject({
    title: z.string().trim().min(1, "An issue title is required").max(300).optional(),
    description: z.string().trim().min(1, "An issue description is required").max(10_000).optional(),
    severity: issueSeveritySchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No fields to update");

export type UpdateIssueRequest = z.infer<typeof updateIssueRequestSchema>;

export const transitionIssueRequestSchema = z.strictObject({
  to: issueStatusSchema,
  /** Why the transition was made — recorded on the audit event. */
  rationale: z.string().trim().max(2000).nullish(),
});

export type TransitionIssueRequest = z.infer<typeof transitionIssueRequestSchema>;

/** Assigns an owner, or clears one with an explicit null. */
export const assignIssueOwnerRequestSchema = z.strictObject({
  ownerId: entityIdSchema.nullable(),
});

export type AssignIssueOwnerRequest = z.infer<typeof assignIssueOwnerRequestSchema>;

// --- Traceability ---------------------------------------------------------------

/**
 * What an issue may be linked to — three real join tables, each a fixed pair
 * of endpoint types. There is no generic entityType/entityId path: an
 * unrecognized relation fails schema validation before it can reach the
 * database.
 */
export const ISSUE_RELATIONS = ["REQUIREMENT", "DESIGN_ITEM", "ENGINEERING_DECISION"] as const;
export type IssueRelation = (typeof ISSUE_RELATIONS)[number];
export const issueRelationSchema = z.enum(ISSUE_RELATIONS);

/**
 * None of the three link tables (`IssueRequirementLink`, `IssueDesignLink`,
 * `DecisionIssueLink`) carries a link type — only an optional note — so one
 * flat shape covers all three variants.
 */
export const issueLinkRequestSchema = z.strictObject({
  relation: issueRelationSchema,
  targetId: entityIdSchema,
  note: z.string().trim().max(2000).nullish(),
});

export type IssueLinkRequest = z.infer<typeof issueLinkRequestSchema>;

/** One linked artifact, as shown in the issue's traceability panel. */
export interface IssueLinkSummary {
  /** The composite "RELATION:rowId" key — see {@link issueLinkKey}. */
  id: string;
  relation: IssueRelation;
  targetId: string;
  identifier: string;
  title: string;
  note: string | null;
  createdAt: Date;
}

/**
 * The composite id a client sees for an issue link (`"REQUIREMENT:cljk..."`)
 * — not a database id, but the relation and the underlying row's id joined
 * the same way certification's compliance links already do, so `DELETE
 * .../links/[linkId]` can parse it back apart to know which of the three
 * tables to delete from.
 */
export function issueLinkKey(relation: IssueRelation, rowId: string): string {
  return `${relation}:${rowId}`;
}

export function parseIssueLinkKey(key: string): { relation: IssueRelation; rowId: string } | null {
  const separatorIndex = key.indexOf(":");
  if (separatorIndex <= 0) return null;
  const relation = key.slice(0, separatorIndex);
  const rowId = key.slice(separatorIndex + 1);
  if (!rowId || !(ISSUE_RELATIONS as readonly string[]).includes(relation)) return null;
  return { relation: relation as IssueRelation, rowId };
}

// --- Display helpers ------------------------------------------------------------

export function issueStatusLabel(status: IssueStatus): string {
  switch (status) {
    case "OPEN":
      return "Open";
    case "IN_PROGRESS":
      return "In progress";
    case "RESOLVED":
      return "Resolved";
    case "CLOSED":
      return "Closed";
  }
}

export function issueSeverityLabel(severity: IssueSeverity): string {
  switch (severity) {
    case "LOW":
      return "Low";
    case "MEDIUM":
      return "Medium";
    case "HIGH":
      return "High";
    case "CRITICAL":
      return "Critical";
  }
}

export function issueRelationLabel(relation: IssueRelation): string {
  switch (relation) {
    case "REQUIREMENT":
      return "Requirement";
    case "DESIGN_ITEM":
      return "Design item";
    case "ENGINEERING_DECISION":
      return "Decision";
  }
}
