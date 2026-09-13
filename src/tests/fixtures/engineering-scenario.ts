import type { OrganizationContext } from "@/server/context/organization-context";
import * as organizationMembershipService from "@/server/services/organization-membership.service";
import * as projectMembershipService from "@/server/services/project-membership.service";
import * as stakeholderNeedService from "@/server/services/stakeholder-need.service";
import * as requirementService from "@/server/services/requirement.service";
import * as designItemService from "@/server/services/design-item.service";
import * as engineeringDecisionService from "@/server/services/engineering-decision.service";
import * as verificationActivityService from "@/server/services/verification-activity.service";
import * as evidenceService from "@/server/services/evidence.service";
import * as riskService from "@/server/services/risk.service";
import * as issueService from "@/server/services/issue.service";
import * as supplierService from "@/server/services/supplier.service";
import * as suppliedItemService from "@/server/services/supplied-item.service";
import * as supplierQualificationService from "@/server/services/supplier-qualification.service";
import * as changeRequestService from "@/server/services/change-request.service";
import { changeImpactAnalysisService } from "@/server/services/change-impact-analysis.service";
import { driftDetectionService } from "@/server/services/drift-detection.service";
import { certificationProgramService } from "@/server/services/certification-program.service";
import { certificationBasisService } from "@/server/services/certification-basis.service";
import { complianceItemService } from "@/server/services/compliance-item.service";
import { certificationFindingService } from "@/server/services/certification-finding.service";
import { certificationReviewService } from "@/server/services/certification-review.service";
import { technicalReadinessService } from "@/server/services/technical-readiness.service";
import { verificationReadinessService } from "@/server/services/verification-readiness.service";
import { assumptionMonitoringService } from "@/server/services/assumption-monitoring.service";
import { decisionSentinelService } from "@/server/services/decision-sentinel.service";
import type { TestTenant } from "@/tests/integration/setup";

/**
 * One deterministic, internally-coherent engineering project, built entirely
 * through real application services — never a raw `prisma.x.create()` as the
 * primary path (the two narrow exceptions, and why, are called out at each
 * use below). Everything downstream of this function (the development seed,
 * the integration acceptance test, the E2E acceptance spec) shares this one
 * scenario rather than three independently-invented ones, so "does the
 * product actually hang together" is asked once, thoroughly, and answered
 * the same way regardless of which layer is asking.
 *
 * **What "coherent" means concretely**: every object below is reachable from
 * at least one other — a supplied item traces to the design item it
 * physically realizes, a compliance item's evidence link points at evidence
 * actually validated against the verification activity that produced it, a
 * change request declares impact on the requirement the whole scenario is
 * built around. Nothing here is a random edge added to inflate a coverage
 * number; every relationship mirrors the worked example in Prompt 30's own
 * text (Requirement → Design Item → Verification Activity → Decision →
 * Evidence).
 *
 * **What is deliberately fictional**: every identifier, name, and
 * organization/person name below is synthetic and obviously so — no real
 * supplier, no real regulatory basis, no real customer. "Part 33-Style Basis
 * (Fictional)" and "Acme Aerostructures" name themselves as placeholders on
 * sight. See `SECURITY.md`/`ARCHITECTURE.md` for the same "this system holds
 * no compliance certification" statement this data must not contradict.
 *
 * **What this function never does**: compute or store a risk score,
 * probability, percentage, health index, or any other composite metric (this
 * system has none to fabricate — see the Command Center's own negative
 * assertions); insert a row into `ImpactAnalysis`, `SentinelEvent`,
 * `SurveillanceTarget`, or any assessment table directly — every one of
 * those tables is written exclusively by calling the real engine
 * (`runImpactAnalysis`, `detectProjectChanges`, `evaluate*Readiness`,
 * `evaluateDrift`) and reading back whatever it actually decided.
 */

// --- Fixed, deterministic content -------------------------------------------
//
// No randomness anywhere in this module except the identifier *suffix* every
// caller supplies (via `uniqueSuffix`, already used by the whole integration
// suite) — the engineering content itself is the same every run, which is
// what "deterministic and reproducible" means for a fixture whose value is
// in its *shape*, not in looking different each time.

const STAKEHOLDER = "Propulsion Systems Engineering (fictional stakeholder group)";

export interface ScenarioIdentifiers {
  /** A short, unique-per-run prefix folded into every artifact identifier. */
  prefix: string;
}

function id(identifiers: ScenarioIdentifiers, suffix: string): string {
  return `${identifiers.prefix}-${suffix}`.toUpperCase().slice(0, 32);
}

// --- Access control: role users ---------------------------------------------

export interface ScenarioRoleUsers {
  /** The tenant's own user — already an organization OWNER (see setup.ts). */
  owner: { userId: string; ctx: OrganizationContext };
  manager: { userId: string; ctx: OrganizationContext; email: string; password: string };
  engineer: { userId: string; ctx: OrganizationContext; email: string; password: string };
  reviewer: { userId: string; ctx: OrganizationContext; email: string; password: string };
  viewer: { userId: string; ctx: OrganizationContext; email: string; password: string };
  /** A real organization member, real credentials, deliberately never added to the project. */
  nonMember: { userId: string; ctx: OrganizationContext; email: string; password: string };
}

/**
 * Creates five more real accounts in the tenant's organization — a project
 * MANAGER, ENGINEER, REVIEWER, VIEWER, and a non-member — through the real
 * `organization-membership` and `project-membership` services (real Argon2id
 * credentials, real `ProjectMembership` rows), matching Prompt 30 §13's
 * explicit instruction not to hard-code role behavior into the fixture: the
 * fixture only ever asks the real services to create a membership at a given
 * role, never writes a role onto a request or a session directly.
 */
export async function createProjectRoleUsers(
  tenant: TestTenant,
  identifiers: ScenarioIdentifiers,
): Promise<ScenarioRoleUsers> {
  const ownerCtx: OrganizationContext = {
    organizationId: tenant.organizationId,
    actorId: tenant.userId,
  };

  const password = `Scenario-${identifiers.prefix}-2026!`;
  async function provision(label: string) {
    const email = `${identifiers.prefix}-${label}@scenario.test`.toLowerCase();
    const account = await organizationMembershipService.addOrganizationMember(ownerCtx, {
      name: `${label[0]!.toUpperCase()}${label.slice(1)} Engineer (fictional)`,
      email,
      password,
    });
    return {
      userId: account.id,
      ctx: { organizationId: tenant.organizationId, actorId: account.id },
      email,
      password,
    };
  }

  const manager = await provision("manager");
  const engineer = await provision("engineer");
  const reviewer = await provision("reviewer");
  const viewer = await provision("viewer");
  const nonMember = await provision("outsider");

  await projectMembershipService.addMember(ownerCtx, tenant.projectId, {
    userId: manager.userId,
    role: "MANAGER",
  });
  await projectMembershipService.addMember(ownerCtx, tenant.projectId, {
    userId: engineer.userId,
    role: "ENGINEER",
  });
  await projectMembershipService.addMember(ownerCtx, tenant.projectId, {
    userId: reviewer.userId,
    role: "REVIEWER",
  });
  await projectMembershipService.addMember(ownerCtx, tenant.projectId, {
    userId: viewer.userId,
    role: "VIEWER",
  });
  // nonMember is deliberately never added — a real organization member with
  // no ProjectMembership row, the exact shape Prompt 25's "cannot access
  // the project at all" boundary exists to catch.

  return {
    owner: { userId: tenant.userId, ctx: ownerCtx },
    manager,
    engineer,
    reviewer,
    viewer,
    nonMember,
  };
}

// --- The engineering scenario itself -----------------------------------------

export interface EngineeringScenario {
  stakeholderNeed: { id: string; identifier: string };
  requirement: { id: string; identifier: string };
  designItem: { id: string; identifier: string };
  decision: { id: string; identifier: string };
  alternative: { id: string };
  assumption: { id: string };
  verificationActivity: { id: string; identifier: string };
  evidence: {
    validated: { id: string; identifier: string };
    superseded: { id: string; identifier: string };
    replacement: { id: string; identifier: string };
    draft: { id: string; identifier: string };
  };
  risk: { id: string; identifier: string };
  issue: { id: string; identifier: string };
  supplier: { id: string; identifier: string };
  suppliedItem: { id: string; identifier: string };
  qualification: { active: { id: string }; expired: { id: string } };
  changeRequest: { id: string; identifier: string };
  baseline: {
    superseded: { id: string; identifier: string };
    active: { id: string; identifier: string };
  };
  observation: { id: string };
  certificationProgram: { id: string; identifier: string };
  certificationBasis: { id: string; identifier: string };
  complianceItems: { compliant: { id: string }; withOpenFinding: { id: string } };
  findings: { open: { id: string }; resolved: { id: string } };
  sentinel: { openTargetId: string | null };
}

/**
 * Builds the full coherent engineering scenario inside an already-created
 * tenant (`createTestTenant`/`TestTenant` — this function does not create an
 * organization, user, or project of its own; that layer already exists and
 * is proven, and duplicating it here is exactly the thing Prompt 30 §1 says
 * not to do). Runs entirely as the tenant's OWNER — role-gated behavior is
 * `createProjectRoleUsers`' concern, not this function's; this one only
 * needs to succeed at building a real, coherent dataset.
 *
 * Ordering matters and is deliberate: each phase depends on state the
 * previous one actually persisted (the change impact analysis needs a real
 * declared impact on a real requirement; Sentinel detection needs a real
 * prior assessment to have gone stale against; the baseline comparison needs
 * a real member and a real subsequent edit). Nothing is written out of
 * order to save a round trip.
 */
export async function buildEngineeringScenario(
  tenant: TestTenant,
  identifiers: ScenarioIdentifiers,
): Promise<EngineeringScenario> {
  const ctx: OrganizationContext = {
    organizationId: tenant.organizationId,
    actorId: tenant.userId,
  };
  const projectId = tenant.projectId;

  // --- Stakeholder need → requirement → design item -------------------------
  const stakeholderNeed = await stakeholderNeedService.createStakeholderNeed(ctx, projectId, {
    identifier: id(identifiers, "sn-001"),
    title: "Reliable thrust across the qualified operating envelope",
    description:
      "Propulsion must deliver rated thrust across the full qualified altitude and temperature range without unscheduled maintenance.",
    stakeholder: STAKEHOLDER,
  });

  const requirement = await requirementService.createRequirement(ctx, projectId, {
    identifier: id(identifiers, "req-001"),
    title: "Maximum chamber pressure",
    statement:
      "The engine shall not exceed 120 bar chamber pressure under any qualified operating condition.",
    rationale: "Bounds structural margin on the combustion chamber and injector assembly.",
  });
  await requirementService.linkRequirement(ctx, projectId, requirement.id, {
    relation: "STAKEHOLDER_NEED",
    targetId: stakeholderNeed.id,
  });

  const designItem = await designItemService.createDesignItem(ctx, projectId, {
    identifier: id(identifiers, "di-001"),
    name: "Combustion chamber assembly",
    description: "Regeneratively cooled combustion chamber and injector assembly.",
    itemType: "ASSEMBLY",
  });
  await requirementService.linkRequirement(ctx, projectId, requirement.id, {
    relation: "DESIGN_ITEM",
    targetId: designItem.id,
    linkType: "SATISFIED_BY",
  });

  // --- Engineering decision, with alternatives, an assumption and an expectation ---
  const decision = await engineeringDecisionService.createDecision(ctx, projectId, {
    identifier: id(identifiers, "ed-001"),
    title: "Use regenerative cooling for the combustion chamber",
    statement: "The combustion chamber will be regeneratively cooled using fuel as the coolant.",
    rationale: "Ablative liner mass was prohibitive against the vehicle's mass budget.",
  });
  const alternative = await engineeringDecisionService.addAlternative(ctx, projectId, decision.id, {
    title: "Ablative liner",
    description: "A single-use ablative chamber liner, no active cooling.",
    reasonRejected: "Mass exceeded the allocated budget by a wide margin.",
  });
  const assumption = await engineeringDecisionService.addAssumption(ctx, projectId, decision.id, {
    statement:
      "Fuel-side coolant flow will not require a dedicated pump beyond the existing feed system.",
  });
  await engineeringDecisionService.setExpectation(ctx, projectId, decision.id, {
    statement:
      "Chamber wall temperature stays within the qualified material limit during hot fire.",
    measure: "Peak wall temperature",
    expectedValue: "550",
    unit: "K",
    comparisonOperator: "LESS_THAN_OR_EQUAL",
    status: "NOT_OBSERVED",
  });
  await engineeringDecisionService.linkDecision(ctx, projectId, decision.id, {
    relation: "REQUIREMENT",
    targetId: requirement.id,
    linkType: "DECISION_ADDRESSES_REQUIREMENT",
  });
  await engineeringDecisionService.linkDecision(ctx, projectId, decision.id, {
    relation: "DESIGN_ITEM",
    targetId: designItem.id,
  });
  await engineeringDecisionService.transitionDecisionStatus(ctx, projectId, decision.id, {
    to: "UNDER_REVIEW",
  });
  await engineeringDecisionService.transitionDecisionStatus(ctx, projectId, decision.id, {
    to: "APPROVED",
  });

  // --- Verification activity, linked to the requirement ----------------------
  const verificationActivity = await verificationActivityService.createVerificationActivity(
    ctx,
    projectId,
    {
      identifier: id(identifiers, "va-001"),
      title: "Chamber hot fire acceptance test",
      description: "Full-duration hot fire at rated chamber pressure.",
      method: "TEST",
    },
  );
  await requirementService.linkRequirement(ctx, projectId, requirement.id, {
    relation: "VERIFICATION_ACTIVITY",
    targetId: verificationActivity.id,
  });
  await verificationActivityService.transitionVerificationStatus(
    ctx,
    projectId,
    verificationActivity.id,
    {
      to: "IN_PROGRESS",
    },
  );
  await verificationActivityService.transitionVerificationStatus(
    ctx,
    projectId,
    verificationActivity.id,
    {
      to: "PASSED",
    },
  );

  // --- Evidence: draft, validated, and a superseded/replacement pair ---------
  const evidenceValidated = await evidenceService.createEvidence(ctx, projectId, {
    identifier: id(identifiers, "ev-001"),
    title: "Hot fire acceptance test report, run 1",
    description: "Chamber pressure and wall temperature trace for the acceptance hot fire.",
    evidenceType: "TEST_RESULT",
    sourceReference: "test-stand-archive://runs/hotfire-001 (fictional reference)",
  });
  await evidenceService.linkEvidence(ctx, projectId, evidenceValidated.id, {
    relation: "VERIFICATION_ACTIVITY",
    targetId: verificationActivity.id,
  });
  await evidenceService.validateEvidence(ctx, projectId, evidenceValidated.id, {});

  const evidenceSuperseded = await evidenceService.createEvidence(ctx, projectId, {
    identifier: id(identifiers, "ev-002"),
    title: "Chamber wall temperature analysis, rev A",
    description: "Preliminary thermal analysis, superseded by the tested result below.",
    evidenceType: "ANALYSIS",
    sourceReference: "analysis-archive://thermal/chamber-wall-rev-a (fictional reference)",
  });
  await evidenceService.validateEvidence(ctx, projectId, evidenceSuperseded.id, {});
  const evidenceReplacement = await evidenceService.createEvidence(ctx, projectId, {
    identifier: id(identifiers, "ev-003"),
    title: "Chamber wall temperature analysis, rev B (post-test correlation)",
    description: "Thermal analysis correlated against the acceptance hot fire result.",
    evidenceType: "ANALYSIS",
    sourceReference: "analysis-archive://thermal/chamber-wall-rev-b (fictional reference)",
  });
  await evidenceService.supersedeEvidence(ctx, projectId, evidenceSuperseded.id, {
    newEvidenceId: evidenceReplacement.id,
  });

  const evidenceDraft = await evidenceService.createEvidence(ctx, projectId, {
    identifier: id(identifiers, "ev-004"),
    title: "Injector flow bench data, unreviewed",
    description: "Raw flow-bench data, not yet reviewed against acceptance criteria.",
    evidenceType: "TEST_RESULT",
    sourceReference: "test-stand-archive://runs/flow-bench-004 (fictional reference)",
  });

  // --- Risk and issue, connected to the real engineering objects --------------
  const risk = await riskService.createRisk(ctx, projectId, {
    identifier: id(identifiers, "rsk-001"),
    title: "Coolant channel erosion over service life",
    description:
      "Regenerative cooling channels may erode faster than assumed under repeated thermal cycling.",
    cause: "Fuel-side coolant velocity at the throat exceeds the values used in the erosion model.",
    consequence: "Reduced chamber service life; potential local burn-through.",
  });
  await riskService.linkRisk(ctx, projectId, risk.id, {
    relation: "DESIGN_ITEM",
    targetId: designItem.id,
  });

  const issue = await issueService.createIssue(ctx, projectId, {
    identifier: id(identifiers, "iss-001"),
    title: "Chamber wall thermocouple reading drift during hot fire",
    description: "Thermocouple channel 3 showed unexplained drift during the acceptance hot fire.",
    severity: "MEDIUM",
  });
  await issueService.linkIssue(ctx, projectId, issue.id, {
    relation: "REQUIREMENT",
    targetId: requirement.id,
  });

  // --- Supplier chain, connected to the design item ---------------------------
  const supplier = await supplierService.createSupplier(ctx, projectId, {
    identifier: id(identifiers, "sup-001"),
    name: "Acme Aerostructures (fictional supplier)",
  });
  const suppliedItem = await suppliedItemService.createSuppliedItem(ctx, projectId, {
    supplierId: supplier.id,
    identifier: id(identifiers, "si-001"),
    name: "Machined chamber liner forging",
    itemType: "PART",
  });
  await suppliedItemService.linkSuppliedItem(ctx, projectId, suppliedItem.id, {
    relation: "DESIGN_ITEM",
    targetId: designItem.id,
  });

  const activeQualification = await supplierQualificationService.createSupplierQualification(
    ctx,
    projectId,
    {
      supplierId: supplier.id,
      suppliedItemId: suppliedItem.id,
      title: "Material and process qualification — Inconel 718 forging",
      qualificationType: "MATERIAL",
      status: "ACTIVE",
      effectiveDate: "2025-01-15",
      expiryDate: "2027-01-15",
    },
  );
  // Deliberately expired — the real Command Center rule that flags a
  // qualification for attention is `status === "EXPIRED" || "WITHDRAWN"`;
  // this is what makes that rule fire naturally, not a manipulated verdict.
  const expiredQualification = await supplierQualificationService.createSupplierQualification(
    ctx,
    projectId,
    {
      supplierId: supplier.id,
      title: "Source qualification — prior process revision",
      qualificationType: "SOURCE",
      status: "EXPIRED",
      effectiveDate: "2022-01-01",
      expiryDate: "2024-01-01",
    },
  );

  // --- Change request, with a declared impact, evaluated by the real engine ---
  const changeRequest = await changeRequestService.createChangeRequest(ctx, projectId, {
    identifier: id(identifiers, "cr-001"),
    title: "Revise chamber wall thickness at the throat",
    description: "Increase local wall thickness at the throat to add erosion margin.",
    reason:
      "Risk RSK-erosion analysis above indicates insufficient margin at the current thickness.",
  });
  await changeRequestService.transitionChangeRequest(ctx, projectId, changeRequest.id, {
    to: "SUBMITTED",
  });
  await changeRequestService.addDeclaredImpact(ctx, projectId, changeRequest.id, {
    target: { type: "DESIGN_ITEM", id: designItem.id },
  });
  // The real engine, delegated to the real graph — never a hand-written row.
  await changeImpactAnalysisService.runImpactAnalysis(ctx, projectId, changeRequest.id, {});

  // --- Baselines: a superseded one, then the active one, with a real member --
  const firstBaseline = await driftDetectionService.createBaseline(ctx, projectId, {
    identifier: id(identifiers, "bl-001"),
    name: "Preliminary design baseline",
  });
  await driftDetectionService.addBaselineMember(ctx, projectId, firstBaseline.id, {
    nodeType: "DESIGN_ITEM",
    nodeId: designItem.id,
  });
  await driftDetectionService.activateBaseline(ctx, projectId, firstBaseline.id, {});

  const activeBaseline = await driftDetectionService.createBaseline(ctx, projectId, {
    identifier: id(identifiers, "bl-002"),
    name: "Critical design review baseline",
  });
  await driftDetectionService.addBaselineMember(ctx, projectId, activeBaseline.id, {
    nodeType: "DESIGN_ITEM",
    nodeId: designItem.id,
  });
  await driftDetectionService.addBaselineMember(ctx, projectId, activeBaseline.id, {
    nodeType: "REQUIREMENT",
    nodeId: requirement.id,
  });
  // Explicitly supersedes the preliminary baseline — a real product action,
  // not two independent "active" rows.
  await driftDetectionService.activateBaseline(ctx, projectId, activeBaseline.id, {
    supersedeActive: true,
  });

  // A real engineering mutation after the baseline freezes its snapshot —
  // this is what makes the design item genuinely CHANGED relative to
  // `activeBaseline` when compared, not an asserted status.
  await designItemService.updateDesignItem(ctx, projectId, designItem.id, {
    description:
      "Regeneratively cooled combustion chamber and injector assembly — throat wall thickened per CR-001.",
  });

  // --- Drift: a real operational observation, evaluated by the real engine ---
  const observation = await driftDetectionService.recordObservation(ctx, projectId, {
    identifier: id(identifiers, "obs-001"),
    title: "Post-hot-fire chamber wall thickness measurement",
    description:
      "Coordinate-measuring-machine survey of throat wall thickness after the acceptance hot fire.",
    observationType: "MEASUREMENT",
    observedAt: new Date().toISOString(),
    subject: { type: "DESIGN_ITEM", id: designItem.id },
    numericValue: "2.4",
    unit: "mm",
  });
  // The real engine — reads the real baseline snapshot and the real current
  // state, including the mutation above; never a hand-written assessment row.
  await driftDetectionService.evaluateDrift(ctx, projectId, { baselineId: activeBaseline.id });

  // --- Certification: program, active basis, compliance items, findings -----
  const certificationProgram = await certificationProgramService.createProgram(ctx, projectId, {
    identifier: id(identifiers, "cert-001"),
    name: "Propulsion certification effort (fictional program)",
  });
  const certificationBasis = await certificationBasisService.createBasis(ctx, projectId, {
    identifier: id(identifiers, "cb-001"),
    title: "Generic Propulsion Basis, fictional edition",
    revision: "Rev A (fictional)",
    sourceReference:
      "This is a fictional basis for demonstration purposes only — not a real regulatory document.",
  });
  await certificationBasisService.activateBasis(ctx, projectId, certificationBasis.id, {});

  const compliantItem = await complianceItemService.createItem(
    ctx,
    projectId,
    certificationBasis.id,
    {
      identifier: id(identifiers, "ci-001"),
      title: "Chamber pressure margin substantiated by test",
    },
  );
  await complianceItemService.addLink(ctx, projectId, compliantItem.id, {
    linkType: "REQUIREMENT",
    targetId: requirement.id,
  });
  await complianceItemService.addLink(ctx, projectId, compliantItem.id, {
    linkType: "VERIFICATION_ACTIVITY",
    targetId: verificationActivity.id,
  });
  await complianceItemService.addLink(ctx, projectId, compliantItem.id, {
    linkType: "EVIDENCE",
    targetId: evidenceValidated.id,
  });
  await complianceItemService.updateItem(ctx, projectId, compliantItem.id, {
    applicability: "APPLICABLE",
    applicabilityRationale: "Chamber pressure is a certified operating parameter for this basis.",
    method: "TEST",
    status: "SATISFIED",
    disposition: "COMPLIANT",
  });

  const findingItem = await complianceItemService.createItem(
    ctx,
    projectId,
    certificationBasis.id,
    {
      identifier: id(identifiers, "ci-002"),
      title: "Coolant channel erosion margin substantiated",
    },
  );
  await complianceItemService.addLink(ctx, projectId, findingItem.id, {
    linkType: "RISK",
    targetId: risk.id,
  });
  await complianceItemService.updateItem(ctx, projectId, findingItem.id, {
    applicability: "APPLICABLE",
    applicabilityRationale:
      "Coolant channel life is a certified durability parameter for this basis.",
    method: "ANALYSIS",
    status: "IN_PROGRESS",
    disposition: "OPEN_FINDING",
  });

  const openFinding = await certificationFindingService.createFinding(
    ctx,
    projectId,
    findingItem.id,
    {
      identifier: id(identifiers, "fnd-001"),
      title: "Erosion model not yet correlated against measured throat wall data",
      description:
        "The erosion model used for margin substantiation has not been correlated against the post-test measurement above.",
      severity: "MEDIUM",
    },
  );
  const resolvedFindingSource = await complianceItemService.createItem(
    ctx,
    projectId,
    certificationBasis.id,
    {
      identifier: id(identifiers, "ci-003"),
      title: "Injector flow uniformity substantiated",
    },
  );
  const resolvedFinding = await certificationFindingService.createFinding(
    ctx,
    projectId,
    resolvedFindingSource.id,
    {
      identifier: id(identifiers, "fnd-002"),
      title: "Flow bench data initially incomplete",
      description: "Initial flow bench dataset was missing the cold-flow baseline run.",
      severity: "LOW",
    },
  );
  await certificationFindingService.resolveFinding(
    ctx,
    projectId,
    resolvedFindingSource.id,
    resolvedFinding.id,
    {
      note: "Cold-flow baseline run completed and added to the dataset; margin confirmed.",
      evidenceId: evidenceDraft.id,
    },
  );
  // The real engine, over the real basis and its real compliance items.
  await certificationReviewService.evaluateCertificationReview(ctx, projectId, {});

  // --- Readiness: real evaluations, naturally mixed outcomes ------------------
  // DESIGN_REVIEW has a real, resolved design behind it; RELEASE_READY does
  // not yet (the open finding and open risk above are exactly what an
  // unresolved release gate looks like) — two real, different verdicts from
  // the same rule table, not two chosen outcomes.
  await technicalReadinessService.evaluateTechnicalReadiness(ctx, projectId, {
    gate: "DESIGN_REVIEW",
  });
  await technicalReadinessService.evaluateTechnicalReadiness(ctx, projectId, {
    gate: "RELEASE_READY",
  });
  await verificationReadinessService.evaluateVerificationReadiness(
    ctx,
    projectId,
    verificationActivity.id,
    {},
  );
  await assumptionMonitoringService.evaluateAssumption(ctx, projectId, decision.id, assumption.id);

  // --- Sentinel: a real detection over everything mutated above ---------------
  await decisionSentinelService.detectProjectChanges(ctx, projectId);
  const openTargets = await decisionSentinelService.listOpenSurveillance(ctx, projectId);
  const firstOpenTarget = openTargets[0] ?? null;
  if (firstOpenTarget) {
    await decisionSentinelService.acknowledgeSurveillance(ctx, projectId, firstOpenTarget.id, {
      note: "Reviewed — expected, given the throat wall thickness change above.",
    });
  }

  return {
    stakeholderNeed: { id: stakeholderNeed.id, identifier: stakeholderNeed.identifier },
    requirement: { id: requirement.id, identifier: requirement.identifier },
    designItem: { id: designItem.id, identifier: designItem.identifier },
    decision: { id: decision.id, identifier: decision.identifier },
    alternative: { id: alternative.id },
    assumption: { id: assumption.id },
    verificationActivity: {
      id: verificationActivity.id,
      identifier: verificationActivity.identifier,
    },
    evidence: {
      validated: { id: evidenceValidated.id, identifier: evidenceValidated.identifier },
      superseded: { id: evidenceSuperseded.id, identifier: evidenceSuperseded.identifier },
      replacement: { id: evidenceReplacement.id, identifier: evidenceReplacement.identifier },
      draft: { id: evidenceDraft.id, identifier: evidenceDraft.identifier },
    },
    risk: { id: risk.id, identifier: risk.identifier },
    issue: { id: issue.id, identifier: issue.identifier },
    supplier: { id: supplier.id, identifier: supplier.identifier },
    suppliedItem: { id: suppliedItem.id, identifier: suppliedItem.identifier },
    qualification: {
      active: { id: activeQualification.id },
      expired: { id: expiredQualification.id },
    },
    changeRequest: { id: changeRequest.id, identifier: changeRequest.identifier },
    baseline: {
      superseded: { id: firstBaseline.id, identifier: firstBaseline.identifier },
      active: { id: activeBaseline.id, identifier: activeBaseline.identifier },
    },
    observation: { id: observation.id },
    certificationProgram: {
      id: certificationProgram.id,
      identifier: certificationProgram.identifier,
    },
    certificationBasis: { id: certificationBasis.id, identifier: certificationBasis.identifier },
    complianceItems: {
      compliant: { id: compliantItem.id },
      withOpenFinding: { id: findingItem.id },
    },
    findings: { open: { id: openFinding.id }, resolved: { id: resolvedFinding.id } },
    sentinel: { openTargetId: firstOpenTarget?.id ?? null },
  };
}
