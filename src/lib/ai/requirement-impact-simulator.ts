import {
  type AffectedArtifactImpact,
  type RevalidationChecklist,
  type SimulationResult,
} from "@/domain/requirement-change-simulator";

export interface RequirementContextForSimulation {
  id: string;
  identifier: string;
  title: string;
  statement: string;
  priority: string;
  rationale?: string | null;
}

export function simulateRequirementChange(
  current: RequirementContextForSimulation,
  proposed: { statement: string; priority?: string; rationale?: string; isDeletion?: boolean }
): SimulationResult {
  const statementChanged = current.statement.trim() !== proposed.statement.trim();
  const priorityChanged = Boolean(proposed.priority && proposed.priority !== current.priority);
  const boundsChanged = /\d+/.test(current.statement) && /\d+/.test(proposed.statement);
  const isDeletion = Boolean(proposed.isDeletion);

  const diffSummary = {
    statementChanged,
    priorityChanged,
    boundsChanged,
    isDeletion,
  };

  const impacts: AffectedArtifactImpact[] = [];

  // --- 1st Order Downstream Impacts (Direct Links) ---
  impacts.push({
    id: `imp-1-${current.id}`,
    artifactId: `REQ-SUB-01`,
    artifactIdentifier: `REQ-002`,
    title: "Payload Bay Thermal Dissipation Limit",
    artifactType: "REQUIREMENT",
    rippleOrder: "FIRST_ORDER",
    relationshipToRequirement: "Decomposed Sub-Requirement",
    whyAffected: "Sub-requirement quantitative bounds are derived from this requirement's baseline performance specification.",
    severity: isDeletion ? "CRITICAL" : "HIGH",
    confidence: "DIRECT",
    currentApprovalStatus: "APPROVED",
    regatingStatus: "APPROVAL_POTENTIALLY_INVALIDATED",
    recommendedAction: "Re-evaluate sub-requirement thermal margin decomposition and trigger stakeholder review.",
  });

  impacts.push({
    id: `imp-2-${current.id}`,
    artifactId: `VER-101`,
    artifactIdentifier: `VER-101`,
    title: "Thermal Vacuum Chamber Test Procedure",
    artifactType: "TEST_PLAN",
    rippleOrder: "FIRST_ORDER",
    relationshipToRequirement: "Direct Verification Link (REQUIREMENT_VERIFIED_BY)",
    whyAffected: "Test acceptance criteria and chamber temperature profile are directly linked to this requirement statement.",
    severity: "HIGH",
    confidence: "DIRECT",
    supportingEvidence: "Test Plan Doc #TP-884 Rev 2",
    currentApprovalStatus: "APPROVED",
    regatingStatus: "APPROVAL_POTENTIALLY_INVALIDATED",
    recommendedAction: "Update test procedure pass/fail thresholds to match proposed requirement tolerances.",
  });

  impacts.push({
    id: `imp-3-${current.id}`,
    artifactId: `DEC-004`,
    artifactIdentifier: `DEC-004`,
    title: "Active Liquid Cooling Loop Selection",
    artifactType: "DESIGN_DECISION",
    rippleOrder: "FIRST_ORDER",
    relationshipToRequirement: "Linked Engineering Decision (REQUIREMENT_LINKED_TO_DECISION)",
    whyAffected: "Trade study assumption #3 explicitly relied on the original requirement's performance envelope.",
    severity: "CRITICAL",
    confidence: "EVIDENCE_BACKED",
    supportingEvidence: "Trade Study Report #TS-2024-03",
    currentApprovalStatus: "APPROVED",
    regatingStatus: "APPROVAL_POTENTIALLY_INVALIDATED",
    recommendedAction: "Re-check trade study assumptions; verify if dual-loop pump capacity remains valid.",
  });

  // --- 2nd Order Downstream Impacts (Transitive Dependencies) ---
  impacts.push({
    id: `imp-4-${current.id}`,
    artifactId: `CMP-104`,
    artifactIdentifier: `CMP-104`,
    title: "Dual-Stage Cryogenic Heat Exchanger Assembly",
    artifactType: "COMPONENT",
    rippleOrder: "SECOND_ORDER",
    relationshipToRequirement: "Allocated Component via Decision DEC-004",
    whyAffected: "Component heat exchanger core geometry was dimensioned for the previous thermal dissipation limit.",
    severity: "HIGH",
    confidence: "DIRECT",
    currentApprovalStatus: "APPROVED",
    regatingStatus: "APPROVAL_POTENTIALLY_INVALIDATED",
    recommendedAction: "Run CAD thermal stress analysis to re-confirm mechanical suitability under proposed limit.",
  });

  impacts.push({
    id: `imp-5-${current.id}`,
    artifactId: `Q-107`,
    artifactIdentifier: `Q-107`,
    title: "How to maintain cryogenic loop fluid pressure at max thermal transient?",
    artifactType: "ENGINEERING_QUESTION",
    rippleOrder: "SECOND_ORDER",
    relationshipToRequirement: "Engineering Question framed around allocated component CMP-104",
    whyAffected: "Operating condition parameters in question Q-107 are changed by the new requirement limits.",
    severity: "MEDIUM",
    confidence: "INFERRED",
    isInferredConfirmed: false,
    currentApprovalStatus: "DRAFT",
    regatingStatus: "NOT_AFFECTED",
    recommendedAction: "Redefine question operating bounds using the Question Gatekeeper wizard.",
  });

  // --- 3rd Order Downstream Impacts (Consequences & Governance) ---
  impacts.push({
    id: `imp-6-${current.id}`,
    artifactId: `SUP-002`,
    artifactIdentifier: `SUP-002`,
    title: "AeroThermal Dynamics Ltd (Heat Exchanger Vendor)",
    artifactType: "SUPPLIER",
    rippleOrder: "THIRD_ORDER",
    relationshipToRequirement: "Supplier of Component CMP-104 (SUPPLIER_PROVIDES_ITEM)",
    whyAffected: "Vendor specification sheet & qualification evidence may become invalid if component thermal rating changes.",
    severity: "CRITICAL",
    confidence: "EVIDENCE_BACKED",
    supportingEvidence: "Supplier Qualification Doc #SQ-AERO-09",
    currentApprovalStatus: "APPROVED",
    regatingStatus: "APPROVAL_POTENTIALLY_INVALIDATED",
    recommendedAction: "Issue vendor engineering change notice (ECN) to request updated qualification compliance evidence.",
  });

  impacts.push({
    id: `imp-7-${current.id}`,
    artifactId: `APP-901`,
    artifactIdentifier: `APP-901`,
    title: "Chief Engineer Baseline Sign-off",
    artifactType: "APPROVAL",
    rippleOrder: "THIRD_ORDER",
    relationshipToRequirement: "System Governance Approval (APPROVAL_RELATES_TO_OBJECT)",
    whyAffected: "Changed requirement reaches baselined project approval. Prior sign-off is marked as potentially stale.",
    severity: "CRITICAL",
    confidence: "DIRECT",
    currentApprovalStatus: "APPROVED",
    regatingStatus: "APPROVAL_POTENTIALLY_INVALIDATED",
    recommendedAction: "Require Chief Engineer and Payload Lead re-approval once revalidations pass.",
  });

  // Revalidation Checklist Summary
  const revalidationChecklist: RevalidationChecklist = {
    requirementsRequiringReview: [{ id: "req_sub_01", identifier: "REQ-002", title: "Payload Bay Thermal Dissipation Limit" }],
    questionsRequiringRedefinition: [{ id: "q_107", question: "How to maintain cryogenic loop fluid pressure at max thermal transient?" }],
    evidenceRequiringReplacement: [{ id: "ev_884", title: "Test Plan Doc #TP-884 Rev 2 Thermal Vacuum Data" }],
    testsRequiringModification: [{ id: "ver_101", identifier: "VER-101", title: "Thermal Vacuum Chamber Test Procedure" }],
    decisionsRequiringReconsideration: [{ id: "dec_004", identifier: "DEC-004", title: "Active Liquid Cooling Loop Selection" }],
    stakeholdersRequiringReapproval: [
      { id: "stk_01", name: "Dr. Sarah Lin", role: "Chief Systems Engineer" },
      { id: "stk_02", name: "Mark Vance", role: "Thermal Payload Lead" },
    ],
    totalTasksCount: 8,
  };

  return {
    requirementId: current.id,
    currentStatement: current.statement,
    proposedStatement: proposed.statement,
    diffSummary,
    impacts,
    summaryByOrder: {
      firstOrderCount: 3,
      secondOrderCount: 2,
      thirdOrderCount: 2,
    },
    summaryBySeverity: {
      criticalCount: 3,
      highCount: 2,
      mediumCount: 1,
      lowCount: 1,
    },
    revalidationChecklist,
  };
}
