import { z } from "zod";

export const impactSeveritySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export type ImpactSeverity = z.infer<typeof impactSeveritySchema>;

export const confidenceTypeSchema = z.enum(["DIRECT", "EVIDENCE_BACKED", "INFERRED"]);
export type ConfidenceType = z.infer<typeof confidenceTypeSchema>;

export const rippleOrderSchema = z.enum(["FIRST_ORDER", "SECOND_ORDER", "THIRD_ORDER"]);
export type RippleOrder = z.infer<typeof rippleOrderSchema>;

export const regatingStatusSchema = z.enum([
  "NOT_AFFECTED",
  "APPROVAL_POTENTIALLY_INVALIDATED",
  "REAPPROVAL_REQUIRED",
  "REAPPROVED",
]);
export type RegatingStatus = z.infer<typeof regatingStatusSchema>;

export interface AffectedArtifactImpact {
  id: string;
  artifactId: string;
  artifactIdentifier: string;
  title: string;
  artifactType:
    | "REQUIREMENT"
    | "ENGINEERING_QUESTION"
    | "CONSTRAINT"
    | "ASSUMPTION"
    | "DESIGN_DECISION"
    | "COMPONENT"
    | "SUPPLIER"
    | "DOCUMENT"
    | "EVIDENCE"
    | "VERIFICATION_METHOD"
    | "TEST_PLAN"
    | "APPROVAL";
  rippleOrder: RippleOrder;
  relationshipToRequirement: string;
  whyAffected: string;
  severity: ImpactSeverity;
  confidence: ConfidenceType;
  supportingEvidence?: string;
  currentApprovalStatus: string;
  regatingStatus: RegatingStatus;
  recommendedAction: string;
  isInferredConfirmed?: boolean;
}

export interface RevalidationChecklist {
  requirementsRequiringReview: Array<{ id: string; identifier: string; title: string }>;
  questionsRequiringRedefinition: Array<{ id: string; question: string }>;
  evidenceRequiringReplacement: Array<{ id: string; title: string }>;
  testsRequiringModification: Array<{ id: string; identifier: string; title: string }>;
  decisionsRequiringReconsideration: Array<{ id: string; identifier: string; title: string }>;
  stakeholdersRequiringReapproval: Array<{ id: string; name: string; role: string }>;
  totalTasksCount: number;
}

export interface RequirementRevision {
  revisionNumber: number;
  statement: string;
  rationale?: string;
  priority: string;
  modifiedAt: Date;
  modifiedBy: string;
  changeSummary: string;
}

export interface SimulationResult {
  requirementId: string;
  currentStatement: string;
  proposedStatement: string;
  diffSummary: {
    statementChanged: boolean;
    priorityChanged: boolean;
    boundsChanged: boolean;
    isDeletion: boolean;
  };
  impacts: AffectedArtifactImpact[];
  summaryByOrder: {
    firstOrderCount: number;
    secondOrderCount: number;
    thirdOrderCount: number;
  };
  summaryBySeverity: {
    criticalCount: number;
    highCount: number;
    mediumCount: number;
    lowCount: number;
  };
  revalidationChecklist: RevalidationChecklist;
}
