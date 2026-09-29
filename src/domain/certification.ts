import { sha256Hex } from "./sha256";
import { z } from "zod";
import type { GraphNodeType } from "./graph";
import { artifactIdentifierSchema, entityIdSchema } from "./shared/identifier";

/**
 * The certification workspace.
 *
 * A first-class internal certification/compliance capability built ON TOP OF
 * the existing engineering system. It answers, deterministically and from
 * records that already exist, the questions an internal certification review
 * has to answer:
 *
 *   Certification basis → compliance obligation → applicability →
 *   requirement / design / verification / decision → evidence →
 *   finding / gap → disposition → certification readiness
 *
 * **What this deliberately is not.** It is not a document management system,
 * not a compliance-consultant CRM, not a static PDF checklist, not a claim of
 * regulatory approval, and not an automated certification authority. Nothing
 * in this module — or anywhere it is consumed — may say "FAA compliant",
 * "EASA approved" or "certified" merely because engineering records exist.
 * Every status here is internal: READY means "ready for internal review",
 * never "approved by an authority".
 *
 * **What it never duplicates.** Requirement statements, decision rationale,
 * verification records, design records and evidence contents all remain
 * owned by their existing modules. A ComplianceItem references those objects
 * — through the same typed relationship tables the rest of this codebase
 * already uses — and reads their state; it never copies it. The only
 * snapshot this module takes is the review basis itself (see below), which
 * exists purely so a historical review can explain what it rested on.
 *
 * **What it never automates.** ComplianceItem.applicability is a human
 * judgement, never inferred from keywords. ComplianceItem.disposition is a
 * human judgement, never derived automatically from
 * `Requirement.status === APPROVED` or `VerificationActivity.status ===
 * PASSED`. The review engine only ever *evaluates its own deterministic rule
 * registry* against the record as it stands — it never sets applicability,
 * disposition, or a compliance item's status on anyone's behalf.
 *
 * Everything here is Prisma-free.
 */

// ---------------------------------------------------------------------------
// Versioning
// ---------------------------------------------------------------------------

/**
 * Which rule set produced a certification review.
 *
 * Reviews are only comparable within a version. Bump this whenever a rule is
 * added, removed, or its outcome changes, so an old review is never silently
 * read under new semantics — freshness across versions reports UNKNOWN rather
 * than guessing compatibility.
 */
export const CERTIFICATION_VERSION = "1";

// ---------------------------------------------------------------------------
// Certification program
// ---------------------------------------------------------------------------

/**
 * The lifecycle of an internal certification effort.
 *
 * None of these states is, or implies, an external regulatory approval state.
 * `CLOSED` is terminal: a closed programme is not reopened — a new one is
 * started if certification work resumes, so the record of when and why the
 * effort ended is never overwritten.
 */
export const CERTIFICATION_PROGRAM_STATUSES = ["DRAFT", "ACTIVE", "ON_HOLD", "CLOSED"] as const;
export type CertificationProgramStatus = (typeof CERTIFICATION_PROGRAM_STATUSES)[number];
export const certificationProgramStatusSchema = z.enum(CERTIFICATION_PROGRAM_STATUSES);

export const CERTIFICATION_PROGRAM_TRANSITIONS: Readonly<
  Record<CertificationProgramStatus, readonly CertificationProgramStatus[]>
> = {
  DRAFT: ["ACTIVE", "CLOSED"],
  ACTIVE: ["ON_HOLD", "CLOSED"],
  ON_HOLD: ["ACTIVE", "CLOSED"],
  CLOSED: [],
};

export function canTransitionCertificationProgram(
  from: CertificationProgramStatus,
  to: CertificationProgramStatus,
): boolean {
  return CERTIFICATION_PROGRAM_TRANSITIONS[from].includes(to);
}

export interface CertificationProgram {
  id: string;
  projectId: string;
  identifier: string;
  name: string;
  description: string | null;
  status: CertificationProgramStatus;
  ownerId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const createCertificationProgramRequestSchema = z.strictObject({
  identifier: artifactIdentifierSchema,
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000).nullish(),
  ownerId: entityIdSchema.nullish(),
});
export type CreateCertificationProgramRequest = z.infer<
  typeof createCertificationProgramRequestSchema
>;

export const updateCertificationProgramRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(4000).nullish(),
  status: certificationProgramStatusSchema.optional(),
  ownerId: entityIdSchema.nullish(),
});
export type UpdateCertificationProgramRequest = z.infer<
  typeof updateCertificationProgramRequestSchema
>;

// ---------------------------------------------------------------------------
// Certification basis
// ---------------------------------------------------------------------------

/**
 * The lifecycle of a tracked certification standard/basis.
 *
 * `DRAFT` — being assembled; editable. `ACTIVE` — the basis compliance items
 * are tracked against; immutable. `SUPERSEDED` — replaced by a newer
 * revision; still readable, still immutable. Mirrors {@link BaselineStatus}
 * in `drift.ts` exactly, for the same reason: a basis that could be edited
 * after activation would make every compliance item tracked against it
 * ambiguous about what it was actually tracked against.
 */
export const CERTIFICATION_BASIS_STATUSES = ["DRAFT", "ACTIVE", "SUPERSEDED"] as const;
export type CertificationBasisStatus = (typeof CERTIFICATION_BASIS_STATUSES)[number];
export const certificationBasisStatusSchema = z.enum(CERTIFICATION_BASIS_STATUSES);

export const CERTIFICATION_BASIS_TRANSITIONS: Readonly<
  Record<CertificationBasisStatus, readonly CertificationBasisStatus[]>
> = {
  DRAFT: ["ACTIVE"],
  ACTIVE: ["SUPERSEDED"],
  SUPERSEDED: [],
};

export function canTransitionCertificationBasis(
  from: CertificationBasisStatus,
  to: CertificationBasisStatus,
): boolean {
  return CERTIFICATION_BASIS_TRANSITIONS[from].includes(to);
}

/** Whether the basis record — title, revision, source reference — may still be edited. */
export function isCertificationBasisEditable(status: CertificationBasisStatus): boolean {
  return status === "DRAFT";
}

/** Whether the basis is a fixed reference that compliance items are tracked against. */
export function isCertificationBasisImmutable(status: CertificationBasisStatus): boolean {
  return status === "ACTIVE" || status === "SUPERSEDED";
}

export interface CertificationBasis {
  id: string;
  certificationProgramId: string;
  identifier: string;
  title: string;
  description: string | null;
  /** The revision/issue of the standard being tracked, e.g. "Amdt 25-141". Free text, not parsed. */
  revision: string;
  /** A document/authority reference. Never the text of a regulation. */
  sourceReference: string | null;
  status: CertificationBasisStatus;
  supersededById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const createCertificationBasisRequestSchema = z.strictObject({
  identifier: artifactIdentifierSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000).nullish(),
  revision: z.string().trim().min(1).max(120),
  sourceReference: z.string().trim().min(1).max(500).nullish(),
});
export type CreateCertificationBasisRequest = z.infer<typeof createCertificationBasisRequestSchema>;

export const updateCertificationBasisRequestSchema = z.strictObject({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(4000).nullish(),
  revision: z.string().trim().min(1).max(120).optional(),
  sourceReference: z.string().trim().min(1).max(500).nullish(),
});
export type UpdateCertificationBasisRequest = z.infer<typeof updateCertificationBasisRequestSchema>;

export const activateCertificationBasisRequestSchema = z.strictObject({
  /** Explicit, exactly like drift's baseline activation: nothing swaps the active basis silently. */
  supersedeActive: z.boolean().optional(),
});
export type ActivateCertificationBasisRequest = z.infer<
  typeof activateCertificationBasisRequestSchema
>;

export const supersedeCertificationBasisRequestSchema = z.strictObject({
  newBasisId: entityIdSchema,
});
export type SupersedeCertificationBasisRequest = z.infer<
  typeof supersedeCertificationBasisRequestSchema
>;

// ---------------------------------------------------------------------------
// Compliance item
// ---------------------------------------------------------------------------

/**
 * Whether a compliance obligation applies at all.
 *
 * A human judgement, always. `UNDETERMINED` is the honest default — it is
 * never inferred as applicable or not applicable from keywords, item title,
 * or any other heuristic.
 */
export const COMPLIANCE_APPLICABILITIES = ["APPLICABLE", "NOT_APPLICABLE", "UNDETERMINED"] as const;
export type ComplianceApplicability = (typeof COMPLIANCE_APPLICABILITIES)[number];
export const complianceApplicabilitySchema = z.enum(COMPLIANCE_APPLICABILITIES);

/** Workflow status of a compliance obligation. Plain, human-set — no rule derives it. */
export const COMPLIANCE_ITEM_STATUSES = [
  "OPEN",
  "IN_PROGRESS",
  "SATISFIED",
  "BLOCKED",
  "WAIVED",
  "CLOSED",
] as const;
export type ComplianceItemStatus = (typeof COMPLIANCE_ITEM_STATUSES)[number];
export const complianceItemStatusSchema = z.enum(COMPLIANCE_ITEM_STATUSES);

/**
 * The reviewer's explicit determination.
 *
 * Set by a person through the API, never derived. In particular, `COMPLIANT`
 * is never assigned because a linked requirement is APPROVED or a linked
 * verification activity PASSED — those are inputs to the judgement a
 * certification reviewer still has to make.
 */
export const COMPLIANCE_DISPOSITIONS = [
  "UNASSESSED",
  "COMPLIANT",
  "NON_COMPLIANT",
  "NOT_APPLICABLE",
  "OPEN_FINDING",
] as const;
export type ComplianceDisposition = (typeof COMPLIANCE_DISPOSITIONS)[number];
export const complianceDispositionSchema = z.enum(COMPLIANCE_DISPOSITIONS);

/** How compliance is established for an item. Describes HOW, never asserts THAT. */
export const COMPLIANCE_METHODS = [
  "ANALYSIS",
  "TEST",
  "INSPECTION",
  "DEMONSTRATION",
  "REVIEW_OF_DESIGN",
  "DOCUMENTATION",
  "OTHER",
] as const;
export type ComplianceMethod = (typeof COMPLIANCE_METHODS)[number];
export const complianceMethodSchema = z.enum(COMPLIANCE_METHODS);

/**
 * Methods whose nature is to produce a recorded result — so the review
 * registry expects {@link Evidence} to exist once one of these is chosen.
 * `REVIEW_OF_DESIGN`, `DOCUMENTATION` and `OTHER` legitimately may not: a
 * design review's record may be a decision or an approval rather than an
 * Evidence row, and `OTHER` is by definition unclassified. Naming the set
 * explicitly is what lets "evidence missing" stay a real finding instead of
 * a blanket rule that would misfire on a method that never produces one.
 */
export const EVIDENCE_PRODUCING_COMPLIANCE_METHODS: readonly ComplianceMethod[] = [
  "ANALYSIS",
  "TEST",
  "INSPECTION",
  "DEMONSTRATION",
];

export function complianceMethodRequiresEvidence(method: ComplianceMethod | null): boolean {
  return method !== null && EVIDENCE_PRODUCING_COMPLIANCE_METHODS.includes(method);
}

export interface ComplianceItem {
  id: string;
  certificationBasisId: string;
  identifier: string;
  title: string;
  description: string | null;
  applicability: ComplianceApplicability;
  applicabilityRationale: string | null;
  applicabilityReviewerId: string | null;
  applicabilityReviewedAt: Date | null;
  method: ComplianceMethod | null;
  status: ComplianceItemStatus;
  disposition: ComplianceDisposition;
  createdAt: Date;
  updatedAt: Date;
}

export const createComplianceItemRequestSchema = z.strictObject({
  identifier: artifactIdentifierSchema,
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(8000).nullish(),
});
export type CreateComplianceItemRequest = z.infer<typeof createComplianceItemRequestSchema>;

/**
 * A single PATCH surface, exactly as the API section specifies. Applicability
 * and its rationale/reviewer travel together — recording one without the
 * other would produce a judgement with no accountable author.
 */
export const updateComplianceItemRequestSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(300).optional(),
    description: z.string().trim().min(1).max(8000).nullish(),
    applicability: complianceApplicabilitySchema.optional(),
    applicabilityRationale: z.string().trim().min(1).max(4000).nullish(),
    method: complianceMethodSchema.nullish(),
    status: complianceItemStatusSchema.optional(),
    disposition: complianceDispositionSchema.optional(),
  })
  .refine(
    (value) => !("applicability" in value && value.applicability === undefined),
    "Invalid request",
  );
export type UpdateComplianceItemRequest = z.infer<typeof updateComplianceItemRequestSchema>;

// ---------------------------------------------------------------------------
// Compliance links
// ---------------------------------------------------------------------------

/**
 * The engineering (and governance) object types a compliance item may link
 * to. Each corresponds to a real, dedicated typed relationship table — one
 * table per (ComplianceItem, target type) pair, the same shape the codebase
 * already uses for `RiskRequirementLink`, `SuppliedItemDesignLink`, and every
 * other cross-domain relationship. There is no generic `entityType +
 * entityId` table anywhere in this module.
 *
 * Evidence is the one exception in mechanism, not in kind: `ComplianceItem`
 * gets a nullable column on the *existing* `EvidenceLink` table, exactly as
 * `SuppliedItem` and `SupplierQualification` already do, rather than a
 * seventh certification-specific evidence store.
 */
export const COMPLIANCE_LINK_TYPES = [
  "REQUIREMENT",
  "VERIFICATION_ACTIVITY",
  "EVIDENCE",
  "ENGINEERING_DECISION",
  "DESIGN_ITEM",
  "RISK",
  "ISSUE",
  "SUPPLIER_QUALIFICATION",
] as const;
export type ComplianceLinkType = (typeof COMPLIANCE_LINK_TYPES)[number];
export const complianceLinkTypeSchema = z.enum(COMPLIANCE_LINK_TYPES);

/** Every compliance link type is a real graph node type. */
export function complianceLinkTargetNodeType(linkType: ComplianceLinkType): GraphNodeType {
  return linkType;
}

export const createComplianceLinkRequestSchema = z.strictObject({
  linkType: complianceLinkTypeSchema,
  targetId: entityIdSchema,
  note: z.string().trim().min(1).max(2000).nullish(),
});
export type CreateComplianceLinkRequest = z.infer<typeof createComplianceLinkRequestSchema>;

/**
 * One compliance link, in the shape the API and UI consume regardless of
 * which underlying table it came from.
 *
 * `id` is a composite `"<LINK_TYPE>:<rowId>"` key, not a raw database id —
 * the same shape {@link graphNodeKey} already uses elsewhere in this
 * codebase to disambiguate ids that are only unique per table. It is what a
 * DELETE call must send back.
 */
export interface ComplianceLink {
  id: string;
  complianceItemId: string;
  linkType: ComplianceLinkType;
  targetId: string;
  targetIdentifier: string | null;
  targetLabel: string;
  note: string | null;
  createdAt: Date;
  createdById: string | null;
}

export function complianceLinkKey(linkType: ComplianceLinkType, rowId: string): string {
  return `${linkType}:${rowId}`;
}

export function parseComplianceLinkKey(
  key: string,
): { linkType: ComplianceLinkType; rowId: string } | null {
  const separatorIndex = key.indexOf(":");
  if (separatorIndex <= 0) return null;
  const linkType = key.slice(0, separatorIndex);
  const rowId = key.slice(separatorIndex + 1);
  if (!rowId || !(COMPLIANCE_LINK_TYPES as readonly string[]).includes(linkType)) return null;
  return { linkType: linkType as ComplianceLinkType, rowId };
}

/** The engineering/basis link types considered when judging whether an item has "adequate engineering linkage" (rule CR-LNK-001). Evidence, Risk and Issue are supporting context, not the basis itself. */
export const ENGINEERING_BASIS_LINK_TYPES: readonly ComplianceLinkType[] = [
  "REQUIREMENT",
  "VERIFICATION_ACTIVITY",
  "ENGINEERING_DECISION",
  "DESIGN_ITEM",
  "SUPPLIER_QUALIFICATION",
];

// ---------------------------------------------------------------------------
// Certification findings
// ---------------------------------------------------------------------------

/** Human-entered classification. Never a numerical score, and never derived. */
export const CERTIFICATION_FINDING_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type CertificationFindingSeverity = (typeof CERTIFICATION_FINDING_SEVERITIES)[number];
export const certificationFindingSeveritySchema = z.enum(CERTIFICATION_FINDING_SEVERITIES);

export const CERTIFICATION_FINDING_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "ACCEPTED"] as const;
export type CertificationFindingStatus = (typeof CERTIFICATION_FINDING_STATUSES)[number];
export const certificationFindingStatusSchema = z.enum(CERTIFICATION_FINDING_STATUSES);

/** Whether a finding still represents unresolved work. */
export function isCertificationFindingOpen(status: CertificationFindingStatus): boolean {
  return status === "OPEN" || status === "IN_PROGRESS";
}

export interface CertificationFinding {
  id: string;
  complianceItemId: string;
  identifier: string;
  title: string;
  description: string | null;
  severity: CertificationFindingSeverity;
  status: CertificationFindingStatus;
  resolutionNote: string | null;
  evidenceId: string | null;
  resolvedAt: Date | null;
  resolvedById: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export const createCertificationFindingRequestSchema = z.strictObject({
  identifier: artifactIdentifierSchema,
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(8000).nullish(),
  severity: certificationFindingSeveritySchema,
});
export type CreateCertificationFindingRequest = z.infer<
  typeof createCertificationFindingRequestSchema
>;

export const updateCertificationFindingRequestSchema = z.strictObject({
  title: z.string().trim().min(1).max(300).optional(),
  description: z.string().trim().min(1).max(8000).nullish(),
  severity: certificationFindingSeveritySchema.optional(),
  status: z.enum(["OPEN", "IN_PROGRESS"]).optional(),
});
export type UpdateCertificationFindingRequest = z.infer<
  typeof updateCertificationFindingRequestSchema
>;

/** Resolution and acceptance both require an explicit, attributable note — a finding never silently disappears. */
export const resolveCertificationFindingRequestSchema = z.strictObject({
  note: z.string().trim().min(1).max(4000),
  evidenceId: entityIdSchema.nullish(),
});
export type ResolveCertificationFindingRequest = z.infer<
  typeof resolveCertificationFindingRequestSchema
>;

export const acceptCertificationFindingRequestSchema = z.strictObject({
  note: z.string().trim().min(1).max(4000),
  evidenceId: entityIdSchema.nullish(),
});
export type AcceptCertificationFindingRequest = z.infer<
  typeof acceptCertificationFindingRequestSchema
>;

// ---------------------------------------------------------------------------
// Certification review — statuses, categories
// ---------------------------------------------------------------------------

/**
 * The verdict of an internal certification review.
 *
 * `READY` means ready for **internal review** — never regulatory approval,
 * never "certified". `NOT_READY` means at least one rule found a blocking
 * condition. `UNKNOWN` covers both "the record could not be resolved well
 * enough to judge" and "no findings exist at all" — silence is never read as
 * readiness.
 */
export const CERTIFICATION_REVIEW_STATUSES = ["READY", "NOT_READY", "UNKNOWN"] as const;
export type CertificationReviewStatus = (typeof CERTIFICATION_REVIEW_STATUSES)[number];
export const certificationReviewStatusSchema = z.enum(CERTIFICATION_REVIEW_STATUSES);

export const CERTIFICATION_REVIEW_CATEGORIES = [
  "APPLICABILITY",
  "COMPLIANCE_ITEM",
  "REQUIREMENT",
  "VERIFICATION",
  "EVIDENCE",
  "DECISION",
  "DESIGN",
  "SUPPLIER",
  "FINDING",
  "CHANGE_IMPACT",
  "DRIFT",
  "UNKNOWN",
] as const;
export type CertificationReviewCategory = (typeof CERTIFICATION_REVIEW_CATEGORIES)[number];
export const certificationReviewCategorySchema = z.enum(CERTIFICATION_REVIEW_CATEGORIES);

export const CERTIFICATION_REVIEW_FINDING_STATUSES = [
  "BLOCKING",
  "WARNING",
  "INFORMATIONAL",
  "UNKNOWN",
] as const;
export type CertificationReviewFindingStatus = (typeof CERTIFICATION_REVIEW_FINDING_STATUSES)[number];
export const certificationReviewFindingStatusSchema = z.enum(CERTIFICATION_REVIEW_FINDING_STATUSES);

/** One-to-one restatement in report wording. Derived, never judged. */
export const CERTIFICATION_REVIEW_SEVERITIES = ["BLOCKER", "ADVISORY", "NOTE", "INDETERMINATE"] as const;
export type CertificationReviewSeverity = (typeof CERTIFICATION_REVIEW_SEVERITIES)[number];

export function severityForCertificationFindingStatus(
  status: CertificationReviewFindingStatus,
): CertificationReviewSeverity {
  switch (status) {
    case "BLOCKING":
      return "BLOCKER";
    case "WARNING":
      return "ADVISORY";
    case "INFORMATIONAL":
      return "NOTE";
    case "UNKNOWN":
      return "INDETERMINATE";
  }
}

// ---------------------------------------------------------------------------
// Basis markers
// ---------------------------------------------------------------------------

/**
 * Why a finding is in the review, and what the engine deliberately did not
 * decide about it. Every rule declares which of these it may cite; `emit`
 * enforces that the set actually written is a subset.
 */
export const CERTIFICATION_BASIS_MARKERS = [
  "APPLICABILITY_UNDETERMINED",
  "APPLICABILITY_RECORDED",
  "COMPLIANCE_METHOD_MISSING",
  "COMPLIANCE_METHOD_RECORDED",
  "ENGINEERING_LINKAGE_ABSENT",
  "ENGINEERING_LINKAGE_PRESENT",
  "VERIFICATION_READINESS_NOT_READY",
  "VERIFICATION_READINESS_STALE",
  "VERIFICATION_READINESS_UNKNOWN",
  "VERIFICATION_READINESS_READY",
  "VERIFICATION_READINESS_NOT_EVALUATED",
  "EVIDENCE_PRESENT",
  "EVIDENCE_ABSENT",
  "EVIDENCE_NOT_REQUIRED_FOR_METHOD",
  "FINDING_OPEN_HIGH_SEVERITY",
  "FINDING_OPEN_LOW_SEVERITY",
  "FINDING_DISPOSITIONED",
  "CHANGE_IMPACT_REACHES_ITEM",
  "CHANGE_IMPACT_STALE",
  "CHANGE_IMPACT_NOT_RUN",
  "DRIFT_DETECTED",
  "DRIFT_UNKNOWN",
  "DRIFT_NOT_DETECTED",
  "SUPPLIER_QUALIFICATION_EXPIRED",
  "SUPPLIER_QUALIFICATION_WITHDRAWN",
  "SUPPLIER_QUALIFICATION_VALID",
  "REQUIREMENT_NOT_CONTROLLED",
  "REQUIREMENT_OBSOLETE",
  "REQUIREMENT_CONTROLLED",
  "DECISION_NOT_TAKEN",
  "DECISION_REJECTED",
  "DECISION_SUPERSEDED_NO_SUCCESSOR",
  "DECISION_APPROVED",
  "DESIGN_OBSOLETE",
  "DESIGN_NOT_CONTROLLED",
  "DESIGN_CONTROLLED",
  "ASSUMPTION_REVIEW_REQUIRED",
  "ASSUMPTION_BASIS_CHANGED",
  "ASSUMPTION_NOT_EVALUATED",
  "ASSUMPTION_INVALIDATED",
  "SUBJECT_UNRESOLVED",
] as const;
export type CertificationBasisMarker = (typeof CERTIFICATION_BASIS_MARKERS)[number];

export function normalizeCertificationBasis(
  markers: readonly CertificationBasisMarker[],
): CertificationBasisMarker[] {
  return [...new Set(markers)].sort();
}

// ---------------------------------------------------------------------------
// Rule registry
// ---------------------------------------------------------------------------

export interface CertificationReviewRule {
  id: string;
  category: CertificationReviewCategory;
  status: CertificationReviewFindingStatus;
  basis: readonly CertificationBasisMarker[];
  rationale: string;
}

/**
 * **The single authoritative certification review rule registry.**
 *
 * Every finding the review service emits comes from a rule declared here,
 * looked up by id. An id not in this table is a programming error and is
 * refused loudly (`emitFinding` in the service throws) rather than silently
 * producing an undeclared certification judgement.
 *
 * Deterministic and conservative by design:
 *
 *  - Undetermined applicability and missing linkage/method BLOCK, because an
 *    empty or undecided certification record must never read as compliant.
 *  - Deviations discovered by other engines (verification readiness, change
 *    impact, drift, supplier qualification, assumption monitoring) are always
 *    *surfaced*, never re-judged into NON_COMPLIANT — this registry states
 *    that policy once, everywhere it would otherwise be tempting to shortcut.
 *  - A clean condition still gets an INFORMATIONAL row, so "we checked and it
 *    was fine" is distinguishable from "we did not look".
 */
export const CERTIFICATION_REVIEW_RULES: readonly CertificationReviewRule[] = [
  // --- Applicability (Rule 1) ---------------------------------------------
  {
    id: "CR-APL-001",
    category: "APPLICABILITY",
    status: "BLOCKING",
    basis: ["APPLICABILITY_UNDETERMINED"],
    rationale:
      "An UNDETERMINED applicability is neither APPLICABLE nor NOT_APPLICABLE — the engine will not guess which, and a review cannot be internally ready while an obligation's applicability has not been decided.",
  },
  {
    id: "CR-APL-002",
    category: "APPLICABILITY",
    status: "INFORMATIONAL",
    basis: ["APPLICABILITY_RECORDED"],
    rationale: "Records that a reviewer determined this item APPLICABLE, with a rationale on file.",
  },
  {
    id: "CR-APL-003",
    category: "APPLICABILITY",
    status: "INFORMATIONAL",
    basis: ["APPLICABILITY_RECORDED"],
    rationale: "Records that a reviewer determined this item NOT_APPLICABLE, with a rationale on file.",
  },
  // --- Compliance method (Rule 2) -----------------------------------------
  {
    id: "CR-MTH-001",
    category: "COMPLIANCE_ITEM",
    status: "BLOCKING",
    basis: ["COMPLIANCE_METHOD_MISSING"],
    rationale:
      "An APPLICABLE item with no declared compliance method has no statement of how compliance would be shown at all.",
  },
  {
    id: "CR-MTH-002",
    category: "COMPLIANCE_ITEM",
    status: "INFORMATIONAL",
    basis: ["COMPLIANCE_METHOD_RECORDED"],
    rationale: "Records the declared compliance method.",
  },
  // --- Engineering linkage (Rule 3) ---------------------------------------
  {
    id: "CR-LNK-001",
    category: "COMPLIANCE_ITEM",
    status: "BLOCKING",
    basis: ["ENGINEERING_LINKAGE_ABSENT"],
    rationale:
      "An APPLICABLE item with no linked requirement, verification activity, decision, design item or supplier qualification has no engineering basis behind it. An empty certification record is never read as compliant.",
  },
  // --- Verification readiness (Rule 4) ------------------------------------
  {
    id: "CR-VER-001",
    category: "VERIFICATION",
    status: "WARNING",
    basis: ["VERIFICATION_READINESS_NOT_READY"],
    rationale:
      "A linked verification activity's most recent readiness assessment is NOT_READY. This consumes the verification readiness engine's own verdict rather than re-deriving it, and surfaces the condition without treating it as a certification failure.",
  },
  {
    id: "CR-VER-002",
    category: "VERIFICATION",
    status: "WARNING",
    basis: ["VERIFICATION_READINESS_STALE"],
    rationale:
      "A linked verification activity has a readiness assessment, but it no longer reflects the current engineering state. Presenting a stale readiness verdict as current would be false assurance.",
  },
  {
    id: "CR-VER-003",
    category: "VERIFICATION",
    status: "INFORMATIONAL",
    basis: ["VERIFICATION_READINESS_UNKNOWN", "VERIFICATION_READINESS_NOT_EVALUATED"],
    rationale:
      "A linked verification activity has never been assessed for readiness, or its freshness could not be determined. Nobody has looked, which is not evidence against readiness.",
  },
  {
    id: "CR-VER-004",
    category: "VERIFICATION",
    status: "INFORMATIONAL",
    basis: ["VERIFICATION_READINESS_READY"],
    rationale: "A linked verification activity's most recent readiness assessment is READY.",
  },
  // --- Evidence (Rule 5) ---------------------------------------------------
  {
    id: "CR-EVD-001",
    category: "EVIDENCE",
    status: "BLOCKING",
    basis: ["EVIDENCE_ABSENT"],
    rationale:
      "The chosen compliance method (analysis, test, inspection or demonstration) is one that produces a recorded result, and no Evidence is linked to this item.",
  },
  {
    id: "CR-EVD-002",
    category: "EVIDENCE",
    status: "INFORMATIONAL",
    basis: ["EVIDENCE_PRESENT"],
    rationale: "Evidence is linked to this item. This records that evidence exists — not that it proves regulatory compliance.",
  },
  {
    id: "CR-EVD-003",
    category: "EVIDENCE",
    status: "INFORMATIONAL",
    basis: ["EVIDENCE_NOT_REQUIRED_FOR_METHOD"],
    rationale:
      "The chosen compliance method does not by itself produce Evidence (e.g. REVIEW_OF_DESIGN, DOCUMENTATION, OTHER), so its absence is not a gap.",
  },
  // --- Open certification findings (Rule 6) -------------------------------
  {
    id: "CR-FND-001",
    category: "FINDING",
    status: "BLOCKING",
    basis: ["FINDING_OPEN_HIGH_SEVERITY"],
    rationale:
      "An OPEN or IN_PROGRESS finding of HIGH or CRITICAL severity stands against this item. No automatic conversion to a risk score is performed — this is the explicit acceptance rule the specification calls for.",
  },
  {
    id: "CR-FND-002",
    category: "FINDING",
    status: "WARNING",
    basis: ["FINDING_OPEN_LOW_SEVERITY"],
    rationale: "An OPEN or IN_PROGRESS finding of LOW or MEDIUM severity stands against this item.",
  },
  {
    id: "CR-FND-003",
    category: "FINDING",
    status: "INFORMATIONAL",
    basis: ["FINDING_DISPOSITIONED"],
    rationale: "A finding against this item has been RESOLVED or ACCEPTED, with its disposition preserved.",
  },
  // --- Change impact (Rule 7) ----------------------------------------------
  {
    id: "CR-CHG-001",
    category: "CHANGE_IMPACT",
    status: "WARNING",
    basis: ["CHANGE_IMPACT_REACHES_ITEM"],
    rationale:
      "A current, completed change-impact analysis reaches an object this compliance item is linked to. The impact engine's own result is consumed, never recomputed, and reaching an object is not read as the item having failed.",
  },
  {
    id: "CR-CHG-002",
    category: "CHANGE_IMPACT",
    status: "UNKNOWN",
    basis: ["CHANGE_IMPACT_STALE"],
    rationale:
      "A change request touching this item's engineering basis has an impact analysis that no longer reflects the current state. Whether it still reaches this item cannot be asserted from an out-of-date result.",
  },
  {
    id: "CR-CHG-003",
    category: "CHANGE_IMPACT",
    status: "UNKNOWN",
    basis: ["CHANGE_IMPACT_NOT_RUN"],
    rationale:
      "A change request touching this item's engineering basis has no completed impact analysis at all. How far it reaches has not been computed.",
  },
  // --- Drift (Rule 8) -------------------------------------------------------
  {
    id: "CR-DRF-001",
    category: "DRIFT",
    status: "WARNING",
    basis: ["DRIFT_DETECTED"],
    rationale:
      "The most recent drift assessment against the active engineering baseline reports a finding concerning an object this item is linked to. This consumes the drift engine's own finding; it is never re-run here, and observed deviation is never read as certification non-compliance.",
  },
  {
    id: "CR-DRF-002",
    category: "DRIFT",
    status: "INFORMATIONAL",
    basis: ["DRIFT_UNKNOWN"],
    rationale: "A drift assessment exists for a linked object but its status or freshness could not be determined.",
  },
  {
    id: "CR-DRF-003",
    category: "DRIFT",
    status: "INFORMATIONAL",
    basis: ["DRIFT_NOT_DETECTED"],
    rationale: "The most recent drift assessment against a linked object reports no drift.",
  },
  // --- Supplier qualification (Rule 9) -------------------------------------
  {
    id: "CR-SUP-001",
    category: "SUPPLIER",
    status: "WARNING",
    basis: ["SUPPLIER_QUALIFICATION_EXPIRED"],
    rationale:
      "A linked supplier qualification is EXPIRED. This is a review condition — qualification status requires review — never an automatic NON_COMPLIANT determination.",
  },
  {
    id: "CR-SUP-002",
    category: "SUPPLIER",
    status: "WARNING",
    basis: ["SUPPLIER_QUALIFICATION_WITHDRAWN"],
    rationale: "A linked supplier qualification is WITHDRAWN. Surfaced as a review condition, not an automatic determination.",
  },
  {
    id: "CR-SUP-003",
    category: "SUPPLIER",
    status: "INFORMATIONAL",
    basis: ["SUPPLIER_QUALIFICATION_VALID"],
    rationale: "A linked supplier qualification is PLANNED or ACTIVE.",
  },
  // --- Requirement control (Rule 10) ---------------------------------------
  {
    id: "CR-REQ-001",
    category: "REQUIREMENT",
    status: "WARNING",
    basis: ["REQUIREMENT_NOT_CONTROLLED"],
    rationale:
      "A linked requirement is DRAFT or IN_REVIEW, so the statement this item is tracked against can still move. Read from the requirement's actual lifecycle state; no requirement logic is duplicated here.",
  },
  {
    id: "CR-REQ-002",
    category: "REQUIREMENT",
    status: "BLOCKING",
    basis: ["REQUIREMENT_OBSOLETE"],
    rationale: "A linked requirement is OBSOLETE and can no longer ground a certification obligation.",
  },
  {
    id: "CR-REQ-003",
    category: "REQUIREMENT",
    status: "INFORMATIONAL",
    basis: ["REQUIREMENT_CONTROLLED"],
    rationale: "A linked requirement is APPROVED or BASELINED, so the statement is under configuration control.",
  },
  // --- Decision state (supporting Decision Memory integration) ------------
  {
    id: "CR-DEC-001",
    category: "DECISION",
    status: "WARNING",
    basis: ["DECISION_NOT_TAKEN"],
    rationale: "A linked engineering decision is PROPOSED or UNDER_REVIEW — not yet taken.",
  },
  {
    id: "CR-DEC-002",
    category: "DECISION",
    status: "BLOCKING",
    basis: ["DECISION_REJECTED"],
    rationale: "A linked engineering decision is REJECTED and cannot ground a certification obligation.",
  },
  {
    id: "CR-DEC-003",
    category: "DECISION",
    status: "UNKNOWN",
    basis: ["DECISION_SUPERSEDED_NO_SUCCESSOR"],
    rationale:
      "A linked engineering decision is SUPERSEDED. The decision record carries no successor-linkage field, so which decision now governs cannot be determined from the record — the engine does not guess, and reports the condition as indeterminate rather than as either compliant or failed.",
  },
  {
    id: "CR-DEC-004",
    category: "DECISION",
    status: "INFORMATIONAL",
    basis: ["DECISION_APPROVED"],
    rationale: "A linked engineering decision is APPROVED. This records that it was taken, not that its content is correct.",
  },
  // --- Design state ---------------------------------------------------------
  {
    id: "CR-DES-001",
    category: "DESIGN",
    status: "BLOCKING",
    basis: ["DESIGN_OBSOLETE"],
    rationale: "A linked design item is OBSOLETE and can no longer ground a certification obligation.",
  },
  {
    id: "CR-DES-002",
    category: "DESIGN",
    status: "WARNING",
    basis: ["DESIGN_NOT_CONTROLLED"],
    rationale: "A linked design item is DRAFT or IN_REVIEW, so the configuration this item is tracked against can still move.",
  },
  {
    id: "CR-DES-003",
    category: "DESIGN",
    status: "INFORMATIONAL",
    basis: ["DESIGN_CONTROLLED"],
    rationale: "A linked design item is APPROVED or BASELINED, so the configuration is under control.",
  },
  // --- Assumption monitoring (Assumption integration) -----------------------
  {
    id: "CR-ASM-001",
    category: "DECISION",
    status: "WARNING",
    basis: ["ASSUMPTION_REVIEW_REQUIRED"],
    rationale:
      "Assumption monitoring reports REVIEW_REQUIRED for an assumption behind a linked decision. This consumes the monitoring engine's own verdict; nothing here invalidates the assumption.",
  },
  {
    id: "CR-ASM-002",
    category: "DECISION",
    status: "INFORMATIONAL",
    basis: ["ASSUMPTION_BASIS_CHANGED"],
    rationale: "Assumption monitoring reports BASIS_CHANGED for an assumption behind a linked decision. The basis moved, but no explicit judgement rested on it yet.",
  },
  {
    id: "CR-ASM-003",
    category: "DECISION",
    status: "INFORMATIONAL",
    basis: ["ASSUMPTION_NOT_EVALUATED"],
    rationale: "An assumption behind a linked decision has never been monitored. Nobody has checked its basis, which is not evidence against it.",
  },
  {
    id: "CR-ASM-004",
    category: "DECISION",
    status: "WARNING",
    basis: ["ASSUMPTION_INVALIDATED"],
    rationale: "An engineer recorded an assumption behind a linked decision as INVALIDATED. This consumes that judgement; nothing here sets an assumption's status.",
  },
] as const;

const CERTIFICATION_REVIEW_RULE_INDEX: ReadonlyMap<string, CertificationReviewRule> = new Map(
  CERTIFICATION_REVIEW_RULES.map((rule) => [rule.id, rule]),
);

export function certificationReviewRule(id: string): CertificationReviewRule | null {
  return CERTIFICATION_REVIEW_RULE_INDEX.get(id) ?? null;
}

export function certificationReviewRuleIds(): string[] {
  return CERTIFICATION_REVIEW_RULES.map((rule) => rule.id);
}

// ---------------------------------------------------------------------------
// Certification review — status derivation, ordering
// ---------------------------------------------------------------------------

/**
 * Centralized readiness semantics.
 *
 * `BLOCKING` → `NOT_READY`. Otherwise any `UNKNOWN` → `UNKNOWN`. An empty
 * finding set → `UNKNOWN` — silence is never read as readiness. Otherwise
 * (only `WARNING`/`INFORMATIONAL` present, and at least one finding exists) →
 * `READY`. Warnings never block on their own; a rule that must block declares
 * `BLOCKING` in the registry.
 */
export function certificationReviewStatusFor(
  findings: readonly { status: CertificationReviewFindingStatus }[],
): CertificationReviewStatus {
  if (findings.length === 0) return "UNKNOWN";
  if (findings.some((finding) => finding.status === "BLOCKING")) return "NOT_READY";
  if (findings.some((finding) => finding.status === "UNKNOWN")) return "UNKNOWN";
  return "READY";
}

interface OrderableFinding {
  category: CertificationReviewCategory;
  status: CertificationReviewFindingStatus;
  subjectType: string;
  subjectId: string;
}

const FINDING_STATUS_PRECEDENCE: Readonly<Record<CertificationReviewFindingStatus, number>> = {
  BLOCKING: 4,
  UNKNOWN: 3,
  WARNING: 2,
  INFORMATIONAL: 1,
};

/** Total order: strongest status first, then category, then subject — never insertion order. */
export function compareCertificationReviewFindings<T extends OrderableFinding>(a: T, b: T): number {
  const byStatus = FINDING_STATUS_PRECEDENCE[b.status] - FINDING_STATUS_PRECEDENCE[a.status];
  if (byStatus !== 0) return byStatus;
  if (a.category !== b.category) return a.category < b.category ? -1 : 1;
  if (a.subjectType !== b.subjectType) return (a.subjectType < b.subjectType ? -1 : 1);
  if (a.subjectId === b.subjectId) return 0;
  return a.subjectId < b.subjectId ? -1 : 1;
}

// ---------------------------------------------------------------------------
// Certification review — consumed-engine shapes
// ---------------------------------------------------------------------------

export type CertificationCertificationConsumedVerificationReadinessStatus = "READY" | "NOT_READY" | "UNKNOWN" | "NOT_EVALUATED";
export interface CertificationConsumedVerificationReadiness {
  verificationActivityId: string;
  assessmentId: string | null;
  status: CertificationCertificationConsumedVerificationReadinessStatus;
  freshness: "CURRENT" | "STALE" | "UNKNOWN" | null;
}

export type CertificationCertificationConsumedChangeImpactFreshness = "CURRENT" | "STALE" | "UNKNOWN" | "NOT_RUN";
export interface CertificationConsumedChangeImpact {
  changeRequestId: string;
  identifier: string | null;
  status: string;
  analysisId: string | null;
  analysisFreshness: CertificationCertificationConsumedChangeImpactFreshness;
  reachesLinkedObject: boolean;
}

export type CertificationCertificationConsumedAssumptionMonitoringStatus = "CURRENT" | "BASIS_CHANGED" | "REVIEW_REQUIRED" | "NOT_EVALUATED";
export interface CertificationConsumedAssumptionMonitoring {
  assumptionId: string;
  decisionId: string;
  monitoringStatus: CertificationCertificationConsumedAssumptionMonitoringStatus;
  assumptionStatus: string;
}

export type CertificationCertificationConsumedDriftStatus = "NO_DRIFT" | "DRIFT_DETECTED" | "UNKNOWN" | "NOT_EVALUATED";
export interface CertificationConsumedDrift {
  subjectType: string;
  subjectId: string;
  assessmentId: string | null;
  status: CertificationCertificationConsumedDriftStatus;
  freshness: "CURRENT" | "STALE" | "UNKNOWN" | null;
}

export interface CertificationConsumedSupplierQualification {
  supplierQualificationId: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Certification review — basis, fingerprint, freshness
// ---------------------------------------------------------------------------

export type CertificationBasisObjectRole =
  | "CERTIFICATION_BASIS"
  | "COMPLIANCE_ITEM"
  | "LINKED_REQUIREMENT"
  | "LINKED_VERIFICATION_ACTIVITY"
  | "LINKED_ENGINEERING_DECISION"
  | "LINKED_DESIGN_ITEM"
  | "LINKED_RISK"
  | "LINKED_ISSUE"
  | "LINKED_SUPPLIER_QUALIFICATION"
  | "LINKED_EVIDENCE"
  | "CERTIFICATION_FINDING";

export interface CertificationBasisObject {
  role: CertificationBasisObjectRole;
  type: GraphNodeType;
  id: string;
  identifier: string | null;
  label: string;
  state: string | null;
  /** The object's own last revision timestamp — never "now". */
  revision: string;
}

export interface CertificationReviewBasis {
  certificationProgramId: string;
  certificationBasisId: string;
  objects: CertificationBasisObject[];
  consumed: {
    verificationReadiness: CertificationConsumedVerificationReadiness[];
    changeImpact: CertificationConsumedChangeImpact[];
    assumptionMonitoring: CertificationConsumedAssumptionMonitoring[];
    drift: CertificationConsumedDrift[];
    supplierQualification: CertificationConsumedSupplierQualification[];
  };
}

function digest(parts: readonly string[]): string {
  // Each part followed by "\n" — the same bytes the earlier incremental
  // `hash.update(part).update("\n")` fed in, so stored digests still match.
  return sha256Hex(parts.map((part) => `${part}\n`).join(""));
}

/**
 * Deterministic digest of a review's actual basis.
 *
 * Scoped to exactly what this review resolved — the compliance items, their
 * applicability/method/status/disposition, every linked engineering object's
 * state and revision, linked evidence, consumed verification readiness,
 * change impact, assumption monitoring, drift and supplier qualification
 * state, and certification findings. Never a generic project-wide
 * fingerprint (an unrelated part of the project must not stale this review),
 * and never wall-clock time.
 */
export function certificationFingerprint(basis: CertificationReviewBasis): string {
  const objectParts = [...basis.objects]
    .sort((a, b) => (a.role + a.type + a.id < b.role + b.type + b.id ? -1 : 1))
    .map(
      (object) =>
        `object:${object.role}:${object.type}:${object.id}:${object.state ?? ""}:${object.revision}`,
    );

  const readinessParts = [...basis.consumed.verificationReadiness]
    .sort((a, b) => (a.verificationActivityId < b.verificationActivityId ? -1 : 1))
    .map(
      (entry) =>
        `readiness:${entry.verificationActivityId}:${entry.assessmentId ?? ""}:${entry.status}:${entry.freshness ?? ""}`,
    );

  const changeParts = [...basis.consumed.changeImpact]
    .sort((a, b) => (a.changeRequestId < b.changeRequestId ? -1 : 1))
    .map(
      (entry) =>
        `change:${entry.changeRequestId}:${entry.analysisId ?? ""}:${entry.analysisFreshness}:${entry.reachesLinkedObject}`,
    );

  const assumptionParts = [...basis.consumed.assumptionMonitoring]
    .sort((a, b) => (a.assumptionId < b.assumptionId ? -1 : 1))
    .map((entry) => `assumption:${entry.assumptionId}:${entry.monitoringStatus}:${entry.assumptionStatus}`);

  const driftParts = [...basis.consumed.drift]
    .sort((a, b) => (a.subjectType + a.subjectId < b.subjectType + b.subjectId ? -1 : 1))
    .map((entry) => `drift:${entry.subjectType}:${entry.subjectId}:${entry.assessmentId ?? ""}:${entry.status}:${entry.freshness ?? ""}`);

  const supplierParts = [...basis.consumed.supplierQualification]
    .sort((a, b) => (a.supplierQualificationId < b.supplierQualificationId ? -1 : 1))
    .map((entry) => `supplier:${entry.supplierQualificationId}:${entry.status}`);

  return digest([
    `version=${CERTIFICATION_VERSION}`,
    `program=${basis.certificationProgramId}`,
    `basis=${basis.certificationBasisId}`,
    ...objectParts,
    ...readinessParts,
    ...changeParts,
    ...assumptionParts,
    ...driftParts,
    ...supplierParts,
  ]);
}

export const CERTIFICATION_REVIEW_FRESHNESS = ["CURRENT", "STALE", "UNKNOWN"] as const;
export type CertificationReviewFreshness = (typeof CERTIFICATION_REVIEW_FRESHNESS)[number];

/**
 * Whether a stored review still rests on the state it was evaluated from.
 *
 * A version mismatch reports UNKNOWN rather than STALE — the rule set itself
 * differs, so the two are not comparable at all, which is a different claim
 * than "the same rules produced a different result".
 */
export function certificationReviewFreshnessOf(
  storedFingerprint: string,
  currentFingerprint: string,
  storedVersion: string,
  currentVersion: string = CERTIFICATION_VERSION,
): CertificationReviewFreshness {
  if (storedVersion !== currentVersion) return "UNKNOWN";
  return storedFingerprint === currentFingerprint ? "CURRENT" : "STALE";
}

// ---------------------------------------------------------------------------
// Certification review — records
// ---------------------------------------------------------------------------

export interface CertificationReviewFinding {
  id: string;
  reviewId: string;
  ruleId: string;
  category: CertificationReviewCategory;
  status: CertificationReviewFindingStatus;
  subjectType: string;
  subjectId: string;
  subjectIdentifier: string | null;
  subjectLabel: string;
  message: string;
  basis: CertificationBasisMarker[];
  sequence: number;
  createdAt: Date;
}

export interface CertificationReviewSummary {
  findingCount: number;
  blockingCount: number;
  warningCount: number;
  informationalCount: number;
  unknownCount: number;
}

export interface CertificationReview {
  id: string;
  certificationProgramId: string;
  status: CertificationReviewStatus;
  reviewVersion: string;
  fingerprint: string;
  summary: string | null;
  evaluatedAt: Date;
  evaluatedById: string | null;
  createdAt: Date;
  counts: CertificationReviewSummary;
}

export interface CertificationReviewReport {
  review: CertificationReview;
  /** Derived at read time by recomputing and comparing — never stored. */
  freshness: CertificationReviewFreshness;
  findings: CertificationReviewFinding[];
  basis: CertificationReviewBasis;
}

export interface NoCertificationReview {
  status: "NOT_EVALUATED";
  certificationProgramId: string;
  reviewVersion: string;
}

export type LatestCertificationReview = CertificationReviewReport | NoCertificationReview;

export function hasCertificationReview(
  value: LatestCertificationReview,
): value is CertificationReviewReport {
  return "review" in value;
}

export const evaluateCertificationReviewRequestSchema = z.strictObject({});
export type EvaluateCertificationReviewRequest = z.infer<
  typeof evaluateCertificationReviewRequestSchema
>;

// ---------------------------------------------------------------------------
// Display helpers
// ---------------------------------------------------------------------------

export function certificationProgramStatusLabel(status: CertificationProgramStatus): string {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "ACTIVE":
      return "Active";
    case "ON_HOLD":
      return "On hold";
    case "CLOSED":
      return "Closed";
  }
}

export function certificationBasisStatusLabel(status: CertificationBasisStatus): string {
  switch (status) {
    case "DRAFT":
      return "Draft";
    case "ACTIVE":
      return "Active";
    case "SUPERSEDED":
      return "Superseded";
  }
}

export function complianceApplicabilityLabel(value: ComplianceApplicability): string {
  switch (value) {
    case "APPLICABLE":
      return "Applicable";
    case "NOT_APPLICABLE":
      return "Not applicable";
    case "UNDETERMINED":
      return "Undetermined";
  }
}

export function complianceItemStatusLabel(status: ComplianceItemStatus): string {
  switch (status) {
    case "OPEN":
      return "Open";
    case "IN_PROGRESS":
      return "In progress";
    case "SATISFIED":
      return "Satisfied";
    case "BLOCKED":
      return "Blocked";
    case "WAIVED":
      return "Waived";
    case "CLOSED":
      return "Closed";
  }
}

export function complianceDispositionLabel(value: ComplianceDisposition): string {
  switch (value) {
    case "UNASSESSED":
      return "Unassessed";
    case "COMPLIANT":
      return "Compliant";
    case "NON_COMPLIANT":
      return "Non-compliant";
    case "NOT_APPLICABLE":
      return "Not applicable";
    case "OPEN_FINDING":
      return "Open finding";
  }
}

export function complianceMethodLabel(value: ComplianceMethod): string {
  switch (value) {
    case "ANALYSIS":
      return "Analysis";
    case "TEST":
      return "Test";
    case "INSPECTION":
      return "Inspection";
    case "DEMONSTRATION":
      return "Demonstration";
    case "REVIEW_OF_DESIGN":
      return "Review of design";
    case "DOCUMENTATION":
      return "Documentation";
    case "OTHER":
      return "Other";
  }
}

export function certificationFindingSeverityLabel(value: CertificationFindingSeverity): string {
  switch (value) {
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

export function certificationReviewStatusLabel(status: CertificationReviewStatus): string {
  switch (status) {
    case "READY":
      return "Ready for internal review";
    case "NOT_READY":
      return "Not ready";
    case "UNKNOWN":
      return "Unknown";
  }
}
