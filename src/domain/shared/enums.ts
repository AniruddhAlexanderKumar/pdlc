import { z } from "zod";

/**
 * Domain enumerations.
 *
 * These are declared independently of Prisma on purpose: the domain must be
 * readable and testable without a database, and application code should not
 * import generated persistence types. The repository mappers assign these
 * to/from the generated Prisma enums, so if the two ever drift, `tsc` fails
 * at the mapping boundary rather than silently at runtime.
 *
 * Each enum exposes three things: the value list (iterable, for UI), the
 * union type, and a Zod schema (runtime validation at the edges).
 */

export const PROJECT_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export const projectStatusSchema = z.enum(PROJECT_STATUSES);

export const USER_ROLES = ["ADMIN", "ENGINEER", "VIEWER"] as const;
export type UserRole = (typeof USER_ROLES)[number];
export const userRoleSchema = z.enum(USER_ROLES);

export const STAKEHOLDER_NEED_STATUSES = ["DRAFT", "ACCEPTED", "REJECTED", "OBSOLETE"] as const;
export type StakeholderNeedStatus = (typeof STAKEHOLDER_NEED_STATUSES)[number];
export const stakeholderNeedStatusSchema = z.enum(STAKEHOLDER_NEED_STATUSES);

export const REQUIREMENT_STATUSES = [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "BASELINED",
  "OBSOLETE",
] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];
export const requirementStatusSchema = z.enum(REQUIREMENT_STATUSES);

export const REQUIREMENT_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type RequirementPriority = (typeof REQUIREMENT_PRIORITIES)[number];
export const requirementPrioritySchema = z.enum(REQUIREMENT_PRIORITIES);

export const DECISION_STATUSES = [
  "PROPOSED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "SUPERSEDED",
] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];
export const decisionStatusSchema = z.enum(DECISION_STATUSES);

export const DESIGN_ITEM_TYPES = [
  "SYSTEM",
  "SUBSYSTEM",
  "ASSEMBLY",
  "COMPONENT",
  "SOFTWARE",
  "OTHER",
] as const;
export type DesignItemType = (typeof DESIGN_ITEM_TYPES)[number];
export const designItemTypeSchema = z.enum(DESIGN_ITEM_TYPES);

export const DESIGN_ITEM_STATUSES = [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "BASELINED",
  "OBSOLETE",
] as const;
export type DesignItemStatus = (typeof DESIGN_ITEM_STATUSES)[number];
export const designItemStatusSchema = z.enum(DESIGN_ITEM_STATUSES);

export const INTERFACE_TYPES = [
  "MECHANICAL",
  "ELECTRICAL",
  "THERMAL",
  "FLUID",
  "DATA",
  "SOFTWARE",
  "OTHER",
] as const;
export type InterfaceType = (typeof INTERFACE_TYPES)[number];
export const interfaceTypeSchema = z.enum(INTERFACE_TYPES);

export const INTERFACE_STATUSES = [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "BASELINED",
  "OBSOLETE",
] as const;
export type InterfaceStatus = (typeof INTERFACE_STATUSES)[number];
export const interfaceStatusSchema = z.enum(INTERFACE_STATUSES);

export const VERIFICATION_METHODS = ["ANALYSIS", "INSPECTION", "TEST", "DEMONSTRATION"] as const;
export type VerificationMethod = (typeof VERIFICATION_METHODS)[number];
export const verificationMethodSchema = z.enum(VERIFICATION_METHODS);

export const VERIFICATION_STATUSES = [
  "PLANNED",
  "IN_PROGRESS",
  "PASSED",
  "FAILED",
  "WAIVED",
] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];
export const verificationStatusSchema = z.enum(VERIFICATION_STATUSES);

export const RISK_STATUSES = ["OPEN", "MITIGATED", "ACCEPTED", "CLOSED"] as const;
export type RiskStatus = (typeof RISK_STATUSES)[number];
export const riskStatusSchema = z.enum(RISK_STATUSES);

export const ISSUE_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type IssueSeverity = (typeof ISSUE_SEVERITIES)[number];
export const issueSeveritySchema = z.enum(ISSUE_SEVERITIES);

export const ISSUE_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];
export const issueStatusSchema = z.enum(ISSUE_STATUSES);

export const CHANGE_REQUEST_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "IMPLEMENTED",
  "CANCELLED",
] as const;
export type ChangeRequestStatus = (typeof CHANGE_REQUEST_STATUSES)[number];
export const changeRequestStatusSchema = z.enum(CHANGE_REQUEST_STATUSES);

export const EVIDENCE_TYPES = [
  "DOCUMENT",
  "TEST_RESULT",
  "ANALYSIS",
  "INSPECTION",
  "MEASUREMENT",
  "EXTERNAL_REFERENCE",
  "OTHER",
] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];
export const evidenceTypeSchema = z.enum(EVIDENCE_TYPES);

/**
 * DRAFT: recorded, not yet asserted as sound — fully editable.
 * VALIDATED: asserted as sound by a recorded actor — content frozen from here on.
 * SUPERSEDED: replaced by a newer evidence record — terminal, read-only.
 *
 * No REJECTED/INVALID state: nothing in the current domain distinguishes
 * "wrong" evidence from evidence nobody chose to validate, and inventing one
 * without a real caller would be exactly the kind of speculative state this
 * schema otherwise avoids. Evidence that turns out wrong is superseded by a
 * corrected record, the same way a mistaken risk or issue is closed rather
 * than un-asserted.
 */
export const EVIDENCE_STATUSES = ["DRAFT", "VALIDATED", "SUPERSEDED"] as const;
export type EvidenceStatus = (typeof EVIDENCE_STATUSES)[number];
export const evidenceStatusSchema = z.enum(EVIDENCE_STATUSES);

export const APPROVAL_DECISIONS = ["APPROVED", "REJECTED"] as const;
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];
export const approvalDecisionSchema = z.enum(APPROVAL_DECISIONS);

// --- Comparison ---------------------------------------------------------------

/**
 * An explicit comparison operator.
 *
 * Attached to a `DecisionExpectation` so that "the chamber shall stay below
 * 800 °C" becomes a comparison a machine can actually perform, rather than a
 * sentence a machine has to guess at.
 *
 * **The operator is always explicit.** Nothing parses `"< 800"` out of an
 * expected-value string: a system that infers an operator from prose will
 * eventually infer the wrong one, and it will do so silently on the one
 * expectation where it matters. An expectation with no operator is not
 * comparable, and the drift engine reports that as UNKNOWN rather than
 * guessing.
 */
export const COMPARISON_OPERATORS = [
  "EQUAL",
  "NOT_EQUAL",
  "LESS_THAN",
  "LESS_THAN_OR_EQUAL",
  "GREATER_THAN",
  "GREATER_THAN_OR_EQUAL",
] as const;
export type ComparisonOperator = (typeof COMPARISON_OPERATORS)[number];
export const comparisonOperatorSchema = z.enum(COMPARISON_OPERATORS);

const COMPARISON_OPERATOR_SYMBOLS: Readonly<Record<ComparisonOperator, string>> = {
  EQUAL: "=",
  NOT_EQUAL: "≠",
  LESS_THAN: "<",
  LESS_THAN_OR_EQUAL: "≤",
  GREATER_THAN: ">",
  GREATER_THAN_OR_EQUAL: "≥",
};

export function comparisonOperatorSymbol(operator: ComparisonOperator): string {
  return COMPARISON_OPERATOR_SYMBOLS[operator];
}

// --- Supplier engineering ---------------------------------------------------
//
// These describe an *engineering* relationship with an external organization,
// not a commercial one. There is deliberately no vendor rating, no approval
// tier, no preferred-supplier flag and no procurement state: those would be
// judgements this system has no basis to make and no data to make them from.

/**
 * Whether a supplier is currently one the project's engineering depends on.
 *
 * `UNDER_REVIEW` records that someone is re-examining the relationship. It is
 * not a verdict about the supplier's parts, and nothing derives it from
 * qualification state — a supplier can be ACTIVE while a qualification of theirs
 * has EXPIRED, and both facts are preserved rather than reconciled.
 */
export const SUPPLIER_STATUSES = ["ACTIVE", "INACTIVE", "UNDER_REVIEW"] as const;
export type SupplierStatus = (typeof SUPPLIER_STATUSES)[number];
export const supplierStatusSchema = z.enum(SUPPLIER_STATUSES);

/**
 * What kind of thing a supplier provides.
 *
 * Broad on purpose. A finer taxonomy would be a catalogue schema, and the
 * engineering question this model exists to answer — *what does a change to this
 * reach?* — does not depend on the distinction between a fastener and a casting.
 */
export const SUPPLIED_ITEM_TYPES = [
  "PART",
  "MATERIAL",
  "PROCESS",
  "SERVICE",
  "SOFTWARE",
  "OTHER",
] as const;
export type SuppliedItemType = (typeof SUPPLIED_ITEM_TYPES)[number];
export const suppliedItemTypeSchema = z.enum(SUPPLIED_ITEM_TYPES);

/** Whether the supplied item is still part of the live product definition. */
export const SUPPLIED_ITEM_STATUSES = ["ACTIVE", "OBSOLETE", "UNDER_REVIEW"] as const;
export type SuppliedItemStatus = (typeof SUPPLIED_ITEM_STATUSES)[number];
export const suppliedItemStatusSchema = z.enum(SUPPLIED_ITEM_STATUSES);

/**
 * What the qualification establishes suitability *for*.
 *
 * `SOURCE` qualifies the supplier as a source; the others qualify something they
 * supply. This is not a certification-authority taxonomy and does not name any
 * external standard — compliance semantics belong to a capability that does not
 * exist yet.
 */
export const SUPPLIER_QUALIFICATION_TYPES = [
  "PROCESS",
  "MATERIAL",
  "PART",
  "SOURCE",
  "OTHER",
] as const;
export type SupplierQualificationType = (typeof SUPPLIER_QUALIFICATION_TYPES)[number];
export const supplierQualificationTypeSchema = z.enum(SUPPLIER_QUALIFICATION_TYPES);

/**
 * The state of a qualification, as recorded by a person.
 *
 * Nothing in this system moves a qualification between these. Notably `EXPIRED`
 * is *not* derived from `expiryDate` passing: a date in the past is a fact about
 * the record, and treating it as a state change would be the system inventing an
 * engineering judgement nobody made. A later engine may surface the discrepancy;
 * it will not resolve it.
 */
export const SUPPLIER_QUALIFICATION_STATUSES = [
  "PLANNED",
  "ACTIVE",
  "EXPIRED",
  "WITHDRAWN",
] as const;
export type SupplierQualificationStatus = (typeof SUPPLIER_QUALIFICATION_STATUSES)[number];
export const supplierQualificationStatusSchema = z.enum(SUPPLIER_QUALIFICATION_STATUSES);
