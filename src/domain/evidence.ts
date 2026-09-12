import { z } from "zod";
import type { Evidence } from "./artifacts";
import {
  type EvidenceStatus,
  type EvidenceType,
  evidenceStatusSchema,
  evidenceTypeSchema,
} from "./shared/enums";
import { artifactIdentifierSchema, entityIdSchema } from "./shared/identifier";
import { EVIDENCE_SUBJECT_TYPES, type EvidenceSubjectType } from "./links";

/**
 * Engineering evidence as a real, controlled record: what it is, where it
 * came from, when it was recorded, who recorded and validated it, and which
 * engineering objects depend on it.
 *
 * The `Evidence` interface itself lives in `./artifacts` (re-exported from
 * the barrel from there, not here, to avoid a duplicate export) — this
 * module adds the validation, lifecycle and traceability contracts now that
 * a real repository and service exist for it, the same graduation
 * `risk.ts`/`issue.ts` already went through.
 *
 * **What "integrity" means here, precisely**, because this module must never
 * claim more than it can back up:
 *  - **Record integrity** — real: every mutation is attributed to an actor,
 *    timestamped, and audited in the same transaction it happens in. Once
 *    `VALIDATED`, content is frozen; superseding never rewrites the old row.
 *  - **Source/reference integrity** — as far as `sourceReference` goes: it
 *    names an external locator (a document number, a URL, a test report id).
 *    Nothing here verifies that the named thing still exists or still says
 *    what it said when recorded.
 *  - **Binary/file integrity — not provided.** There is no file or blob
 *    storage anywhere in this schema (see the schema's own doc comment on
 *    `Evidence`). There is nothing to hash, and no field here should ever be
 *    read as one. Every piece of evidence in this system is a metadata/
 *    reference record — never a locally controlled file — because that is
 *    the only category this architecture can support honestly.
 */

export const evidenceSchema = z.object({
  id: entityIdSchema,
  projectId: entityIdSchema,
  identifier: artifactIdentifierSchema,
  title: z.string().trim().min(1),
  description: z.string().nullable(),
  evidenceType: evidenceTypeSchema,
  sourceReference: z.string().trim().min(1),
  status: evidenceStatusSchema,
  recordedById: entityIdSchema.nullable(),
  validatedById: entityIdSchema.nullable(),
  validatedAt: z.date().nullable(),
  supersededById: entityIdSchema.nullable(),
  supersededAt: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
}) satisfies z.ZodType<Evidence>;

// --- Repository-layer contracts ----------------------------------------------

export const createEvidenceInputSchema = z.object({
  projectId: entityIdSchema,
  identifier: artifactIdentifierSchema,
  title: z.string().trim().min(1, "A title is required").max(300),
  description: z.string().trim().max(10_000).nullish(),
  evidenceType: evidenceTypeSchema,
  sourceReference: z.string().trim().min(1, "A source reference is required").max(2000),
  recordedById: entityIdSchema.nullish(),
});

export type CreateEvidenceInput = z.infer<typeof createEvidenceInputSchema>;

export const updateEvidenceInputSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().trim().max(10_000).nullish(),
    evidenceType: evidenceTypeSchema.optional(),
    sourceReference: z.string().trim().min(1).max(2000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No fields to update");

export type UpdateEvidenceInput = z.infer<typeof updateEvidenceInputSchema>;

export const evidenceFilterSchema = z.object({
  projectId: entityIdSchema,
  status: evidenceStatusSchema.optional(),
  evidenceType: evidenceTypeSchema.optional(),
});

export type EvidenceFilter = z.infer<typeof evidenceFilterSchema>;

// --- Lifecycle ----------------------------------------------------------------

/**
 * The evidence lifecycle, as a deterministic table.
 *
 * A draft record may be validated (asserted sound) or superseded directly
 * (withdrawn or replaced before anyone validated it). A validated record may
 * only be superseded — its content is frozen from validation onward, so
 * "correcting" it is a new record, not an edit. `SUPERSEDED` is terminal:
 * there is no un-superseding, matching every other terminal state in this
 * domain (a closed risk, a closed issue).
 */
export const EVIDENCE_TRANSITIONS: Readonly<Record<EvidenceStatus, readonly EvidenceStatus[]>> = {
  DRAFT: ["VALIDATED", "SUPERSEDED"],
  VALIDATED: ["SUPERSEDED"],
  SUPERSEDED: [],
} as const;

export function allowedEvidenceTransitions(from: EvidenceStatus): readonly EvidenceStatus[] {
  return EVIDENCE_TRANSITIONS[from];
}

export function canTransitionEvidence(from: EvidenceStatus, to: EvidenceStatus): boolean {
  return EVIDENCE_TRANSITIONS[from].includes(to);
}

/**
 * Whether the evidence's content (title, description, type, source
 * reference) may still be changed.
 *
 * Narrower than risk/issue's own "anything but terminal" gate, and
 * deliberately so: evidence's whole purpose is to record a fact as it was
 * observed. Once `VALIDATED` asserts that fact is sound, letting the words
 * describing it keep moving would undermine the assertion. A validated
 * record that turns out wrong is superseded by a corrected one, not edited
 * in place.
 */
export function isEvidenceContentEditable(status: EvidenceStatus): boolean {
  return status === "DRAFT";
}

/**
 * Whether this evidence may still be cited by a new traceability link.
 *
 * Broader than content editability on purpose: a validated fact remains
 * citable by new requirements or decisions after the fact — only superseding
 * it closes that door, the same "broader than content" shape
 * `Requirement.isOwnerAssignable` already uses for its own narrower field.
 */
export function areEvidenceLinksEditable(status: EvidenceStatus): boolean {
  return status !== "SUPERSEDED";
}

// --- API request contracts ----------------------------------------------------

/**
 * What a caller may supply when recording evidence.
 *
 * `projectId` comes from the route, the organization from the session,
 * `status` from the lifecycle (always `DRAFT`), `recordedById` from the
 * authenticated actor, and timestamps from the database — `strictObject`
 * rejects all of them rather than silently dropping them. There is no owner
 * field: evidence is recorded, not assigned.
 */
export const createEvidenceRequestSchema = z.strictObject({
  identifier: artifactIdentifierSchema,
  title: z.string().trim().min(1, "A title is required").max(300),
  description: z.string().trim().max(10_000).nullish(),
  evidenceType: evidenceTypeSchema,
  sourceReference: z.string().trim().min(1, "A source reference is required").max(2000),
});

export type CreateEvidenceRequest = z.infer<typeof createEvidenceRequestSchema>;

/**
 * Content-only update. No `status`: lifecycle changes go through the
 * dedicated validate/supersede endpoints below, each validated against
 * {@link EVIDENCE_TRANSITIONS} and audited as its own event.
 */
export const updateEvidenceRequestSchema = z
  .strictObject({
    title: z.string().trim().min(1, "A title is required").max(300).optional(),
    description: z.string().trim().max(10_000).nullish(),
    evidenceType: evidenceTypeSchema.optional(),
    sourceReference: z.string().trim().min(1, "A source reference is required").max(2000).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No fields to update");

export type UpdateEvidenceRequest = z.infer<typeof updateEvidenceRequestSchema>;

/**
 * DRAFT -> VALIDATED. No target reference needed — unlike supersession,
 * validating asserts something about *this* record, not a relationship to
 * another one.
 */
export const validateEvidenceRequestSchema = z.strictObject({
  rationale: z.string().trim().max(2000).nullish(),
});

export type ValidateEvidenceRequest = z.infer<typeof validateEvidenceRequestSchema>;

/**
 * DRAFT|VALIDATED -> SUPERSEDED. Requires the *existing* record that
 * replaces this one — supersession never creates evidence, it only records
 * a succession between two records the caller already has.
 */
export const supersedeEvidenceRequestSchema = z.strictObject({
  newEvidenceId: entityIdSchema,
  rationale: z.string().trim().max(2000).nullish(),
});

export type SupersedeEvidenceRequest = z.infer<typeof supersedeEvidenceRequestSchema>;

// --- Traceability ---------------------------------------------------------------

/**
 * What evidence may be linked to — the six real subject columns on
 * `EvidenceLink` (see `links.ts`). There is no generic entityType/entityId
 * path: an unrecognized relation fails schema validation before it can reach
 * the database.
 */
export const EVIDENCE_RELATIONS = EVIDENCE_SUBJECT_TYPES;
export type EvidenceRelation = EvidenceSubjectType;
export const evidenceRelationSchema = z.enum(EVIDENCE_RELATIONS);

/** None of the six subject columns carries a link type — only an optional note. */
export const evidenceLinkRequestSchema = z.strictObject({
  relation: evidenceRelationSchema,
  targetId: entityIdSchema,
  note: z.string().trim().max(2000).nullish(),
});

export type EvidenceLinkRequest = z.infer<typeof evidenceLinkRequestSchema>;

/** One artifact this evidence supports, as shown in its traceability panel. */
export interface EvidenceLinkSummary {
  /** The composite "RELATION:rowId" key — see {@link evidenceLinkKey}. */
  id: string;
  relation: EvidenceRelation;
  targetId: string;
  identifier: string;
  title: string;
  note: string | null;
  createdAt: Date;
}

/**
 * The composite id a client sees for an evidence link
 * (`"REQUIREMENT:cljk..."`) — the relation and the underlying `EvidenceLink`
 * row's id joined the same way risk and certification links already do, so
 * `DELETE .../links/[linkId]` can parse it back apart to confirm which
 * subject column the row uses.
 */
export function evidenceLinkKey(relation: EvidenceRelation, rowId: string): string {
  return `${relation}:${rowId}`;
}

export function parseEvidenceLinkKey(
  key: string,
): { relation: EvidenceRelation; rowId: string } | null {
  const separatorIndex = key.indexOf(":");
  if (separatorIndex <= 0) return null;
  const relation = key.slice(0, separatorIndex);
  const rowId = key.slice(separatorIndex + 1);
  if (!rowId || !(EVIDENCE_RELATIONS as readonly string[]).includes(relation)) return null;
  return { relation: relation as EvidenceRelation, rowId };
}

/** A certification finding that names this evidence as its supporting record. Read-only from here — see {@link areEvidenceLinksEditable}'s doc comment. */
export interface EvidenceCitingFinding {
  id: string;
  identifier: string;
  title: string;
  complianceItemId: string;
}

// --- Display helpers ------------------------------------------------------------

export function evidenceStatusLabel(status: EvidenceStatus): string {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "VALIDATED":
      return "Validated";
    case "SUPERSEDED":
      return "Superseded";
  }
}

export function evidenceTypeLabel(evidenceType: EvidenceType): string {
  switch (evidenceType) {
    case "DOCUMENT":
      return "Document";
    case "TEST_RESULT":
      return "Test result";
    case "ANALYSIS":
      return "Analysis";
    case "INSPECTION":
      return "Inspection";
    case "MEASUREMENT":
      return "Measurement";
    case "EXTERNAL_REFERENCE":
      return "External reference";
    case "OTHER":
      return "Other";
  }
}

export function evidenceRelationLabel(relation: EvidenceRelation): string {
  switch (relation) {
    case "REQUIREMENT":
      return "Requirement";
    case "ENGINEERING_DECISION":
      return "Decision";
    case "VERIFICATION_ACTIVITY":
      return "Verification activity";
    case "SUPPLIED_ITEM":
      return "Supplied item";
    case "SUPPLIER_QUALIFICATION":
      return "Supplier qualification";
    case "COMPLIANCE_ITEM":
      return "Compliance item";
  }
}
