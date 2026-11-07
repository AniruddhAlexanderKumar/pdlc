import { z } from "zod";
import { approvalDecisionSchema } from "./shared/enums";
import { entityIdSchema } from "./shared/identifier";

/**
 * Traceability links.
 *
 * The engineering record is a graph: artifacts are nodes and these links are
 * the edges. Two shapes exist, and the difference is deliberate.
 *
 *  1. **Fixed-endpoint links** (requirement → design item, risk → requirement,
 *     ...). Both ends are known types, so persistence uses a dedicated join
 *     table and the domain uses the plain source/target input below.
 *
 *  2. **Varying-endpoint links** (change impact, evidence, approval). The
 *     subject can be one of several artifact types. Persistence still uses one
 *     real, nullable foreign key per type — never an opaque
 *     entityType/entityId pair — so the database enforces referential
 *     integrity, with a CHECK constraint guaranteeing exactly one is set. The
 *     domain sees the tagged `{ type, id }` pair below, which is the ergonomic
 *     shape for callers; repositories translate between the two.
 */

// --- Link classifications ---------------------------------------------------

export const REQUIREMENT_LINK_TYPES = [
  "DECOMPOSES_TO",
  "DEPENDS_ON",
  "REFINES",
  "CONFLICTS_WITH",
] as const;
export type RequirementLinkType = (typeof REQUIREMENT_LINK_TYPES)[number];
export const requirementLinkTypeSchema = z.enum(REQUIREMENT_LINK_TYPES);

export const REQUIREMENT_DESIGN_LINK_TYPES = ["ALLOCATED_TO", "SATISFIED_BY"] as const;
export type RequirementDesignLinkType = (typeof REQUIREMENT_DESIGN_LINK_TYPES)[number];
export const requirementDesignLinkTypeSchema = z.enum(REQUIREMENT_DESIGN_LINK_TYPES);

/**
 * One relationship, read from either end — a decision that addresses a
 * requirement, or a requirement derived from a decision. Modelled as a single
 * edge with a direction marker rather than two mirrored tables.
 */
export const REQUIREMENT_DECISION_LINK_TYPES = [
  "DECISION_ADDRESSES_REQUIREMENT",
  "REQUIREMENT_DERIVED_FROM_DECISION",
] as const;
export type RequirementDecisionLinkType = (typeof REQUIREMENT_DECISION_LINK_TYPES)[number];
export const requirementDecisionLinkTypeSchema = z.enum(REQUIREMENT_DECISION_LINK_TYPES);

export const DESIGN_ITEM_LINK_TYPES = ["CONTAINS", "DEPENDS_ON"] as const;
export type DesignItemLinkType = (typeof DESIGN_ITEM_LINK_TYPES)[number];
export const designItemLinkTypeSchema = z.enum(DESIGN_ITEM_LINK_TYPES);

export const DESIGN_INTERFACE_LINK_TYPES = ["PROVIDES", "CONSUMES", "PARTICIPATES"] as const;
export type DesignInterfaceLinkType = (typeof DESIGN_INTERFACE_LINK_TYPES)[number];
export const designInterfaceLinkTypeSchema = z.enum(DESIGN_INTERFACE_LINK_TYPES);

// --- Fixed-endpoint links ---------------------------------------------------

/** Base input for a link whose two endpoint types are already known. */
export const traceLinkInputSchema = z.object({
  sourceId: entityIdSchema,
  targetId: entityIdSchema,
  note: z.string().trim().max(2000).nullish(),
  createdById: entityIdSchema.nullish(),
});

export type TraceLinkInput = z.infer<typeof traceLinkInputSchema>;

const rejectSelfReference = { message: "An artifact cannot be linked to itself", path: ["targetId"] };

/** Requirement → Requirement (decomposition, dependency). Self-links are rejected. */
export const requirementLinkInputSchema = traceLinkInputSchema
  .extend({ linkType: requirementLinkTypeSchema })
  .refine((value) => value.sourceId !== value.targetId, rejectSelfReference);

export type RequirementLinkInput = z.infer<typeof requirementLinkInputSchema>;

/** DesignItem → DesignItem (hierarchy, dependency). Self-links are rejected. */
export const designItemLinkInputSchema = traceLinkInputSchema
  .extend({ linkType: designItemLinkTypeSchema })
  .refine((value) => value.sourceId !== value.targetId, rejectSelfReference);

export type DesignItemLinkInput = z.infer<typeof designItemLinkInputSchema>;

/** Requirement → DesignItem (allocation, satisfaction). */
export const requirementDesignLinkInputSchema = traceLinkInputSchema.extend({
  linkType: requirementDesignLinkTypeSchema.optional(),
});

export type RequirementDesignLinkInput = z.infer<typeof requirementDesignLinkInputSchema>;

/** Requirement ↔ EngineeringDecision. */
export const requirementDecisionLinkInputSchema = traceLinkInputSchema.extend({
  linkType: requirementDecisionLinkTypeSchema,
});

export type RequirementDecisionLinkInput = z.infer<typeof requirementDecisionLinkInputSchema>;

/** DesignItem → InterfaceDefinition. */
export const designInterfaceLinkInputSchema = traceLinkInputSchema.extend({
  linkType: designInterfaceLinkTypeSchema.optional(),
});

export type DesignInterfaceLinkInput = z.infer<typeof designInterfaceLinkInputSchema>;

// --- Requirement traceability API contract ----------------------------------

/**
 * The relationship kinds a requirement can carry, each naming one real join
 * table.
 *
 * This discriminator is *not* an opaque `entityType + entityId` pair: the
 * variant selects a specific typed table with its own real foreign key and its
 * own valid link types, so an unknown combination fails schema validation
 * before it can reach the database.
 */
export const REQUIREMENT_RELATIONS = [
  "STAKEHOLDER_NEED",
  "DESIGN_ITEM",
  "VERIFICATION_ACTIVITY",
  "ENGINEERING_DECISION",
  "EVIDENCE",
] as const;
export type RequirementRelation = (typeof REQUIREMENT_RELATIONS)[number];
export const requirementRelationSchema = z.enum(REQUIREMENT_RELATIONS);

const linkNote = z.string().trim().max(2000).nullish();

/**
 * Each variant mirrors exactly what its table can store — the stakeholder-need
 * join carries no note or link type, so supplying one is rejected rather than
 * silently discarded.
 */
export const requirementLinkRequestSchema = z.discriminatedUnion("relation", [
  z.strictObject({
    relation: z.literal("STAKEHOLDER_NEED"),
    targetId: entityIdSchema,
  }),
  z.strictObject({
    relation: z.literal("DESIGN_ITEM"),
    targetId: entityIdSchema,
    linkType: requirementDesignLinkTypeSchema.optional(),
    note: linkNote,
  }),
  z.strictObject({
    relation: z.literal("VERIFICATION_ACTIVITY"),
    targetId: entityIdSchema,
    note: linkNote,
  }),
  z.strictObject({
    relation: z.literal("ENGINEERING_DECISION"),
    targetId: entityIdSchema,
    linkType: requirementDecisionLinkTypeSchema,
    note: linkNote,
  }),
  z.strictObject({
    relation: z.literal("EVIDENCE"),
    targetId: entityIdSchema,
    note: linkNote,
  }),
]);

export type RequirementLinkRequest = z.infer<typeof requirementLinkRequestSchema>;

/** Identifies one existing edge for removal. */
export const requirementUnlinkRequestSchema = z.strictObject({
  relation: requirementRelationSchema,
  targetId: entityIdSchema,
  /** Required only where the table's uniqueness includes the link type. */
  linkType: z.string().trim().min(1).max(64).optional(),
});

export type RequirementUnlinkRequest = z.infer<typeof requirementUnlinkRequestSchema>;

/** One linked artifact, as shown in the traceability panel. */
export interface RequirementLinkSummary {
  relation: RequirementRelation;
  targetId: string;
  identifier: string;
  title: string;
  linkType: string | null;
  note: string | null;
  createdAt: Date;
}

// --- Varying-endpoint links -------------------------------------------------

/**
 * What a change request may be declared to affect.
 *
 * `SUPPLIER` and `SUPPLIED_ITEM` are here so that a supplier-side change is
 * declared through the *same* change request as any other change — "supplier
 * S-01 is affected", "supplied item SI-14 is affected" — and is then walked by
 * the one change-impact engine. There is deliberately no `SupplierChangeRequest`
 * and no supplier impact engine: a second mechanism would mean two answers to
 * the same question, and the graph is what makes one answer sufficient.
 *
 * Each entry still maps to its own real, nullable foreign key column, never an
 * opaque entity pair.
 */
export const CHANGE_IMPACT_TARGET_TYPES = [
  "REQUIREMENT",
  "DESIGN_ITEM",
  "ENGINEERING_DECISION",
  "VERIFICATION_ACTIVITY",
  "RISK",
  "ISSUE",
  "SUPPLIER",
  "SUPPLIED_ITEM",
] as const;
export type ChangeImpactTargetType = (typeof CHANGE_IMPACT_TARGET_TYPES)[number];

export const changeImpactTargetSchema = z.object({
  type: z.enum(CHANGE_IMPACT_TARGET_TYPES),
  id: entityIdSchema,
});

export type ChangeImpactTarget = z.infer<typeof changeImpactTargetSchema>;

/** ChangeRequest → an artifact it affects. */
export const changeRequestImpactInputSchema = z.object({
  changeRequestId: entityIdSchema,
  target: changeImpactTargetSchema,
  note: z.string().trim().max(2000).nullish(),
  createdById: entityIdSchema.nullish(),
});

export type ChangeRequestImpactInput = z.infer<typeof changeRequestImpactInputSchema>;

/**
 * What a piece of evidence may be attached to — read from the real
 * `EvidenceLink` row's six nullable subject columns, one enum entry each.
 *
 * The supplier and certification entries reuse the existing Evidence model
 * rather than introducing a second document store: a qualification's
 * supporting record, a compliance item's supporting record, and a
 * requirement's supporting record are the same kind of thing, and splitting
 * them would mean two places to look for the same artifact. See
 * `evidence.ts` for the actual link request contract built on this list —
 * this file only names what the schema itself permits.
 */
export const EVIDENCE_SUBJECT_TYPES = [
  "REQUIREMENT",
  "ENGINEERING_DECISION",
  "VERIFICATION_ACTIVITY",
  "SUPPLIED_ITEM",
  "SUPPLIER_QUALIFICATION",
  "COMPLIANCE_ITEM",
] as const;
export type EvidenceSubjectType = (typeof EVIDENCE_SUBJECT_TYPES)[number];

export const APPROVAL_SUBJECT_TYPES = [
  "REQUIREMENT",
  "ENGINEERING_DECISION",
  "CHANGE_REQUEST",
] as const;
export type ApprovalSubjectType = (typeof APPROVAL_SUBJECT_TYPES)[number];

export const approvalSubjectSchema = z.object({
  type: z.enum(APPROVAL_SUBJECT_TYPES),
  id: entityIdSchema,
});

export type ApprovalSubject = z.infer<typeof approvalSubjectSchema>;

/** An approval recorded against exactly one approvable artifact. */
export const recordApprovalInputSchema = z.object({
  projectId: entityIdSchema,
  approverId: entityIdSchema,
  subject: approvalSubjectSchema,
  decision: approvalDecisionSchema,
  comment: z.string().trim().max(2000).nullish(),
  decidedAt: z.date().optional(),
});

export type RecordApprovalInput = z.infer<typeof recordApprovalInputSchema>;
