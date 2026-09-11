import type {
  ChangeRequest as PrismaChangeRequest,
  ChangeRequestImpact as PrismaChangeRequestImpact,
  DecisionAlternative as PrismaDecisionAlternative,
  DecisionAssumption as PrismaDecisionAssumption,
  DecisionExpectation as PrismaDecisionExpectation,
  DesignItem as PrismaDesignItem,
  EngineeringDecision as PrismaEngineeringDecision,
  Issue as PrismaIssue,
  Project as PrismaProject,
  Requirement as PrismaRequirement,
  Risk as PrismaRisk,
  StakeholderNeed as PrismaStakeholderNeed,
  VerificationActivity as PrismaVerificationActivity,
} from "@/generated/prisma/client";
import type {
  ChangeImpactTarget,
  ChangeRequest,
  DecisionAlternative,
  DecisionAssumption,
  DecisionExpectation,
  DesignItem,
  EngineeringDecision,
  Issue,
  Project,
  Requirement,
  Risk,
  StakeholderNeed,
  VerificationActivity,
} from "@/domain";
import { AppError } from "@/server/errors";

/**
 * The single seam between persistence rows and domain entities.
 *
 * These functions look like busywork, and that is the point: assigning a
 * Prisma enum column to a domain union is only legal while the two agree, so
 * if someone adds a status to the schema and forgets the domain (or vice
 * versa), the build breaks here instead of a UI silently rendering an
 * unknown value.
 */

export function toProject(row: PrismaProject): Project {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    description: row.description,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toRisk(row: PrismaRisk): Risk {
  return {
    id: row.id,
    projectId: row.projectId,
    identifier: row.identifier,
    title: row.title,
    description: row.description,
    cause: row.cause,
    consequence: row.consequence,
    status: row.status,
    ownerId: row.ownerId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toIssue(row: PrismaIssue): Issue {
  return {
    id: row.id,
    projectId: row.projectId,
    identifier: row.identifier,
    title: row.title,
    description: row.description,
    severity: row.severity,
    status: row.status,
    ownerId: row.ownerId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toRequirement(row: PrismaRequirement): Requirement {
  return {
    id: row.id,
    projectId: row.projectId,
    identifier: row.identifier,
    title: row.title,
    statement: row.statement,
    rationale: row.rationale,
    status: row.status,
    priority: row.priority,
    source: row.source,
    ownerId: row.ownerId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toStakeholderNeed(row: PrismaStakeholderNeed): StakeholderNeed {
  return {
    id: row.id,
    projectId: row.projectId,
    identifier: row.identifier,
    title: row.title,
    description: row.description,
    stakeholder: row.stakeholder,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toDesignItem(row: PrismaDesignItem): DesignItem {
  return {
    id: row.id,
    projectId: row.projectId,
    identifier: row.identifier,
    name: row.name,
    description: row.description,
    itemType: row.itemType,
    status: row.status,
    ownerId: row.ownerId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toVerificationActivity(row: PrismaVerificationActivity): VerificationActivity {
  return {
    id: row.id,
    projectId: row.projectId,
    identifier: row.identifier,
    title: row.title,
    description: row.description,
    method: row.method,
    status: row.status,
    ownerId: row.ownerId,
    plannedDate: row.plannedDate,
    completedDate: row.completedDate,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toDecisionAlternative(row: PrismaDecisionAlternative): DecisionAlternative {
  return {
    id: row.id,
    engineeringDecisionId: row.engineeringDecisionId,
    title: row.title,
    description: row.description,
    reasonRejected: row.reasonRejected,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toDecisionAssumption(row: PrismaDecisionAssumption): DecisionAssumption {
  return {
    id: row.id,
    engineeringDecisionId: row.engineeringDecisionId,
    statement: row.statement,
    status: row.status,
    rationale: row.rationale,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toDecisionExpectation(row: PrismaDecisionExpectation): DecisionExpectation {
  return {
    id: row.id,
    engineeringDecisionId: row.engineeringDecisionId,
    statement: row.statement,
    measure: row.measure,
    expectedValue: row.expectedValue,
    unit: row.unit,
    comparisonOperator: row.comparisonOperator,
    dueAt: row.dueAt,
    status: row.status,
    actualValue: row.actualValue,
    observedAt: row.observedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toEngineeringDecision(row: PrismaEngineeringDecision): EngineeringDecision {
  return {
    id: row.id,
    projectId: row.projectId,
    identifier: row.identifier,
    title: row.title,
    statement: row.statement,
    rationale: row.rationale,
    alternativesConsidered: row.alternativesConsidered,
    assumptions: row.assumptions,
    status: row.status,
    ownerId: row.ownerId,
    decidedAt: row.decidedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toChangeRequest(row: PrismaChangeRequest): ChangeRequest {
  return {
    id: row.id,
    projectId: row.projectId,
    identifier: row.identifier,
    title: row.title,
    description: row.description,
    reason: row.reason,
    status: row.status,
    requestedById: row.requestedById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Collapses the eight nullable target columns of a change-impact row into the
 * domain's tagged target. A row with no target cannot exist — the table has a
 * CHECK constraint requiring exactly one — so reaching the end is a genuine
 * invariant violation, not a user error.
 */
export function toChangeImpactTarget(row: PrismaChangeRequestImpact): ChangeImpactTarget {
  if (row.requirementId) return { type: "REQUIREMENT", id: row.requirementId };
  if (row.designItemId) return { type: "DESIGN_ITEM", id: row.designItemId };
  if (row.engineeringDecisionId) {
    return { type: "ENGINEERING_DECISION", id: row.engineeringDecisionId };
  }
  if (row.verificationActivityId) {
    return { type: "VERIFICATION_ACTIVITY", id: row.verificationActivityId };
  }
  if (row.riskId) return { type: "RISK", id: row.riskId };
  if (row.issueId) return { type: "ISSUE", id: row.issueId };
  if (row.supplierId) return { type: "SUPPLIER", id: row.supplierId };
  if (row.suppliedItemId) return { type: "SUPPLIED_ITEM", id: row.suppliedItemId };

  throw new AppError(`Change request impact ${row.id} has no target artifact`, {
    isOperational: false,
  });
}

/** Maps the domain's tagged target back onto the correct foreign key column. */
export function fromChangeImpactTarget(target: ChangeImpactTarget): {
  requirementId?: string;
  designItemId?: string;
  engineeringDecisionId?: string;
  verificationActivityId?: string;
  riskId?: string;
  issueId?: string;
  supplierId?: string;
  suppliedItemId?: string;
} {
  switch (target.type) {
    case "REQUIREMENT":
      return { requirementId: target.id };
    case "DESIGN_ITEM":
      return { designItemId: target.id };
    case "ENGINEERING_DECISION":
      return { engineeringDecisionId: target.id };
    case "VERIFICATION_ACTIVITY":
      return { verificationActivityId: target.id };
    case "RISK":
      return { riskId: target.id };
    case "ISSUE":
      return { issueId: target.id };
    case "SUPPLIER":
      return { supplierId: target.id };
    case "SUPPLIED_ITEM":
      return { suppliedItemId: target.id };
  }
}
