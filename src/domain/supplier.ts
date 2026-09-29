import { z } from "zod";
import {
  type SuppliedItemStatus,
  type SuppliedItemType,
  type SupplierQualificationStatus,
  type SupplierQualificationType,
  type SupplierStatus,
  suppliedItemStatusSchema,
  suppliedItemTypeSchema,
  supplierQualificationStatusSchema,
  supplierQualificationTypeSchema,
  supplierStatusSchema,
} from "./shared/enums";
import { artifactIdentifierSchema, entityIdSchema } from "./shared/identifier";

/**
 * Supplier engineering.
 *
 * **This is not supplier management.** There is no purchase order, invoice,
 * contract, delivery, price, inventory level, vendor score or supplier health
 * rating anywhere in this module, and there will not be — those belong to a
 * procurement system, and modelling them here would turn an engineering
 * capability into a CRM with an engineering-industry vocabulary.
 *
 * What this exists for is one question:
 *
 * > *If this supplier, supplied item or qualification changes, what engineering
 * > objects may be affected?*
 *
 * That question is only answerable if supplier records participate in the same
 * cross-domain product graph as everything else. So the model deliberately stops
 * at the point where a supplier record touches engineering:
 *
 *  - **Supplier** — *who* provides something.
 *  - **SuppliedItem** — *what* they provide.
 *  - **SupplierQualification** — what establishes that it is *suitable*.
 *  - **Relationships** — *where* the supplied item participates in the product.
 *
 * These four are kept as separate records rather than collapsed, because they
 * change independently and a change to one reaches different things than a
 * change to another. Impact itself is not computed here: supplier objects become
 * valid change-impact targets and graph nodes, and the existing change-impact
 * engine walks them. There is no second impact engine, and this module contains
 * no propagation logic.
 *
 * Everything here is Prisma-free.
 */

// --- Entities ---------------------------------------------------------------

/**
 * An external organization the project's engineering depends on.
 *
 * **Project-scoped.** A supplier is conceptually reusable across programmes, but
 * making one record span projects would mean a status, a qualification set and a
 * dependency graph that mean different things in each — and a change declared
 * against the shared record would reach objects in projects the declarer cannot
 * see. Project scoping keeps the tenancy boundary identical to every other
 * artifact, and a later version can add cross-project identity above this
 * without changing what a project-level record meant.
 */
export interface Supplier {
  id: string;
  projectId: string;
  identifier: string;
  name: string;
  description: string | null;
  status: SupplierStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Something a supplier provides that the product depends on.
 *
 * This is the record that actually participates in the engineering graph: it is
 * allocated to design, supports requirements, is verified by activities, is
 * governed by decisions and carries risks. A supplier reaches engineering
 * *through* its items, which is why a supplier-level change still finds design
 * consequences — it propagates supplier → item → product.
 */
export interface SuppliedItem {
  id: string;
  projectId: string;
  supplierId: string;
  identifier: string;
  name: string;
  description: string | null;
  itemType: SuppliedItemType;
  status: SuppliedItemStatus;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A recorded basis for treating a supplier, or something they supply, as
 * suitable for a defined engineering purpose.
 *
 * `suppliedItemId` is nullable on purpose. A `SOURCE` qualification is about the
 * supplier as a source and is not scoped to any one item; a `MATERIAL`, `PART` or
 * `PROCESS` qualification usually is. Forcing an item onto the first case would
 * mean inventing a subject the record does not have.
 *
 * `evidenceReference` stays a string: this system stores no files, and a
 * plausible-looking document management model would imply a capability that does
 * not exist. Real Evidence records can be linked in addition, through the
 * existing evidence relationship.
 *
 * **Nothing derives this status.** A qualification whose `expiryDate` has passed
 * is not silently EXPIRED — see the enum's note. Change detected is not failure
 * proven, and the same discipline that governs the readiness engines governs
 * this record.
 */
export interface SupplierQualification {
  id: string;
  projectId: string;
  supplierId: string;
  /** The item this qualifies, where it qualifies one rather than the source. */
  suppliedItemId: string | null;
  title: string;
  qualificationType: SupplierQualificationType;
  status: SupplierQualificationStatus;
  /** External locator for what establishes the qualification. Never a file. */
  evidenceReference: string | null;
  effectiveDate: Date | null;
  expiryDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

// --- Request contracts ------------------------------------------------------
//
// Every one of these is a `strictObject`. The project comes from the route, the
// organization and the actor from the session, and timestamps from the database
// — so a client that tries to send `projectId`, `organizationId` or an id is
// rejected outright rather than having the field quietly dropped.

const description = z.string().trim().max(10_000).nullish();

export const createSupplierRequestSchema = z.strictObject({
  identifier: artifactIdentifierSchema,
  name: z.string().trim().min(1, "A supplier name is required").max(300),
  description,
  status: supplierStatusSchema.optional(),
});

export type CreateSupplierRequest = z.infer<typeof createSupplierRequestSchema>;

/** The identifier is absent in every state: identity is not editable. */
export const updateSupplierRequestSchema = z
  .strictObject({
    name: z.string().trim().min(1, "A supplier name is required").max(300).optional(),
    description,
    status: supplierStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No fields to update");

export type UpdateSupplierRequest = z.infer<typeof updateSupplierRequestSchema>;

/**
 * The supplier is named by id and validated server-side against the same
 * project. A client cannot attach an item to a supplier it cannot see.
 */
export const createSuppliedItemRequestSchema = z.strictObject({
  supplierId: entityIdSchema,
  identifier: artifactIdentifierSchema,
  name: z.string().trim().min(1, "A supplied item name is required").max(300),
  description,
  itemType: suppliedItemTypeSchema,
  status: suppliedItemStatusSchema.optional(),
});

export type CreateSuppliedItemRequest = z.infer<typeof createSuppliedItemRequestSchema>;

/**
 * The supplier is absent: re-parenting an item to a different supplier would
 * silently rewrite what every existing engineering link means, so it is not an
 * edit. A new item is recorded instead, and the old one marked OBSOLETE.
 */
export const updateSuppliedItemRequestSchema = z
  .strictObject({
    name: z.string().trim().min(1, "A supplied item name is required").max(300).optional(),
    description,
    itemType: suppliedItemTypeSchema.optional(),
    status: suppliedItemStatusSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No fields to update");

export type UpdateSuppliedItemRequest = z.infer<typeof updateSuppliedItemRequestSchema>;

/** An ISO-8601 date, or null. Parsed to a Date by the service, never by a client. */
const isoDate = z
  .string()
  .trim()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Not a valid date")
  .nullish();

export const createSupplierQualificationRequestSchema = z.strictObject({
  supplierId: entityIdSchema,
  /** Null or omitted for a SOURCE qualification, which qualifies no single item. */
  suppliedItemId: entityIdSchema.nullish(),
  title: z.string().trim().min(1, "A qualification title is required").max(300),
  qualificationType: supplierQualificationTypeSchema,
  status: supplierQualificationStatusSchema.optional(),
  evidenceReference: z.string().trim().max(2000).nullish(),
  effectiveDate: isoDate,
  expiryDate: isoDate,
});

export type CreateSupplierQualificationRequest = z.infer<
  typeof createSupplierQualificationRequestSchema
>;

/**
 * Both parents are absent: a qualification is *about* a particular supplier and
 * item, and moving it would change what the record asserts rather than correct
 * it. The status is editable here because a person moving a qualification to
 * EXPIRED or WITHDRAWN is exactly the judgement this system will not make on
 * their behalf.
 */
export const updateSupplierQualificationRequestSchema = z
  .strictObject({
    title: z.string().trim().min(1, "A qualification title is required").max(300).optional(),
    qualificationType: supplierQualificationTypeSchema.optional(),
    status: supplierQualificationStatusSchema.optional(),
    evidenceReference: z.string().trim().max(2000).nullish(),
    effectiveDate: isoDate,
    expiryDate: isoDate,
  })
  .refine((value) => Object.keys(value).length > 0, "No fields to update");

export type UpdateSupplierQualificationRequest = z.infer<
  typeof updateSupplierQualificationRequestSchema
>;

// --- Relationship contracts -------------------------------------------------

/**
 * The engineering relationships a supplied item can carry.
 *
 * Each variant names one real join table with its own foreign keys — this is a
 * discriminator over typed tables, **not** an `entityType + entityId` pair. An
 * unknown combination fails schema validation before it can reach the database,
 * and there is no generic relation endpoint that could reach a table this list
 * does not cover.
 */
export const SUPPLIED_ITEM_RELATIONS = [
  "DESIGN_ITEM",
  "REQUIREMENT",
  "VERIFICATION_ACTIVITY",
  "ENGINEERING_DECISION",
  "RISK",
  "EVIDENCE",
] as const;
export type SuppliedItemRelation = (typeof SUPPLIED_ITEM_RELATIONS)[number];
export const suppliedItemRelationSchema = z.enum(SUPPLIED_ITEM_RELATIONS);

const linkNote = z.string().trim().max(2000).nullish();

/** Every supplied-item relationship carries an optional note and nothing else. */
export const suppliedItemLinkRequestSchema = z.strictObject({
  relation: suppliedItemRelationSchema,
  targetId: entityIdSchema,
  note: linkNote,
});

export type SuppliedItemLinkRequest = z.infer<typeof suppliedItemLinkRequestSchema>;

export const suppliedItemUnlinkRequestSchema = z.strictObject({
  relation: suppliedItemRelationSchema,
  targetId: entityIdSchema,
});

export type SuppliedItemUnlinkRequest = z.infer<typeof suppliedItemUnlinkRequestSchema>;

/** One linked engineering object, as the supplied-item detail view shows it. */
export interface SuppliedItemLinkSummary {
  relation: SuppliedItemRelation;
  targetId: string;
  /** Null for evidence, which carries no project-scoped identifier. */
  identifier: string | null;
  title: string;
  note: string | null;
  createdAt: Date;
}

/**
 * A qualification links only to evidence.
 *
 * Its supplier and supplied item are foreign keys on the record itself, not
 * relationships a caller adds, so there is nothing else to link.
 */
export const qualificationEvidenceLinkRequestSchema = z.strictObject({
  evidenceId: entityIdSchema,
  note: linkNote,
});

export type QualificationEvidenceLinkRequest = z.infer<
  typeof qualificationEvidenceLinkRequestSchema
>;

export const qualificationEvidenceUnlinkRequestSchema = z.strictObject({
  evidenceId: entityIdSchema,
});

export type QualificationEvidenceUnlinkRequest = z.infer<
  typeof qualificationEvidenceUnlinkRequestSchema
>;

/** One evidence record attached to a qualification. */
export interface QualificationEvidenceSummary {
  evidenceId: string;
  title: string;
  evidenceType: string;
  sourceReference: string;
  note: string | null;
  createdAt: Date;
}

// --- Filters ----------------------------------------------------------------

export const supplierFilterSchema = z.strictObject({
  status: supplierStatusSchema.optional(),
});

export const suppliedItemFilterSchema = z.strictObject({
  supplierId: entityIdSchema.optional(),
  itemType: suppliedItemTypeSchema.optional(),
  status: suppliedItemStatusSchema.optional(),
});

export const supplierQualificationFilterSchema = z.strictObject({
  supplierId: entityIdSchema.optional(),
  suppliedItemId: entityIdSchema.optional(),
  status: supplierQualificationStatusSchema.optional(),
});

// --- Display helpers --------------------------------------------------------

const SUPPLIER_STATUS_LABELS: Readonly<Record<SupplierStatus, string>> = {
  ACTIVE: "Active",
  INACTIVE: "Inactive",
  UNDER_REVIEW: "Under review",
};

export function supplierStatusLabel(status: SupplierStatus): string {
  return SUPPLIER_STATUS_LABELS[status];
}

const SUPPLIED_ITEM_TYPE_LABELS: Readonly<Record<SuppliedItemType, string>> = {
  PART: "Part",
  MATERIAL: "Material",
  PROCESS: "Process",
  SERVICE: "Service",
  SOFTWARE: "Software",
  OTHER: "Other",
};

export function suppliedItemTypeLabel(itemType: SuppliedItemType): string {
  return SUPPLIED_ITEM_TYPE_LABELS[itemType];
}

const SUPPLIED_ITEM_STATUS_LABELS: Readonly<Record<SuppliedItemStatus, string>> = {
  ACTIVE: "Active",
  OBSOLETE: "Obsolete",
  UNDER_REVIEW: "Under review",
};

export function suppliedItemStatusLabel(status: SuppliedItemStatus): string {
  return SUPPLIED_ITEM_STATUS_LABELS[status];
}

const QUALIFICATION_STATUS_LABELS: Readonly<Record<SupplierQualificationStatus, string>> = {
  PLANNED: "Planned",
  ACTIVE: "Active",
  EXPIRED: "Expired",
  WITHDRAWN: "Withdrawn",
};

export function supplierQualificationStatusLabel(
  status: SupplierQualificationStatus,
): string {
  return QUALIFICATION_STATUS_LABELS[status];
}

const RELATION_LABELS: Readonly<Record<SuppliedItemRelation, string>> = {
  DESIGN_ITEM: "Design item",
  REQUIREMENT: "Requirement",
  VERIFICATION_ACTIVITY: "Verification activity",
  ENGINEERING_DECISION: "Decision",
  RISK: "Risk",
  EVIDENCE: "Evidence",
};

export function suppliedItemRelationLabel(relation: SuppliedItemRelation): string {
  return RELATION_LABELS[relation];
}
