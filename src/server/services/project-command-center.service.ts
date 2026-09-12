import {
  type AttentionItem,
  type CommandCenterAssumptionOverview,
  type CommandCenterCertificationOverview,
  type CommandCenterChangeImpactOverview,
  type CommandCenterDriftOverview,
  type CommandCenterEvidenceOverview,
  type CommandCenterGateSummary,
  type CommandCenterIssueOverview,
  type CommandCenterRiskOverview,
  type CommandCenterSentinelOverview,
  type CommandCenterSupplierOverview,
  type CommandCenterVerificationOverview,
  type CommandCenterView,
  ACTIVE_CHANGE_REQUEST_STATUSES,
  TECHNICAL_READINESS_GATES,
  hasCertificationReview,
  hasDriftAssessment,
  hasTechnicalReadiness,
  technicalReadinessGateLabel,
  traceabilityDetailRoute,
} from "@/domain";
import type { OrganizationContext } from "@/server/context/organization-context";
import * as monitoringRepository from "@/server/repositories/assumption-monitoring.repository";
import * as certificationFindingRepository from "@/server/repositories/certification-finding.repository";
import * as impactAnalysisRepository from "@/server/repositories/impact-analysis.repository";
import { computeProjectFingerprint } from "@/server/repositories/project-revision.repository";
import * as verificationReadinessRepository from "@/server/repositories/verification-readiness.repository";
import * as changeRequestService from "./change-request.service";
import { certificationBasisService } from "./certification-basis.service";
import { certificationProgramService } from "./certification-program.service";
import { certificationReviewService } from "./certification-review.service";
import { complianceItemService } from "./compliance-item.service";
import { decisionSentinelService } from "./decision-sentinel.service";
import { driftDetectionService } from "./drift-detection.service";
import * as evidenceService from "./evidence.service";
import * as issueService from "./issue.service";
import { freshnessOf } from "./change-impact-analysis.service";
import * as projectService from "./project.service";
import * as riskService from "./risk.service";
import * as suppliedItemService from "./supplied-item.service";
import * as supplierQualificationService from "./supplier-qualification.service";
import * as supplierService from "./supplier.service";
import { technicalReadinessService } from "./technical-readiness.service";
import * as verificationActivityService from "./verification-activity.service";

/**
 * The Engineering Command Center.
 *
 * A pure aggregation/read model. Every value returned here is read from an
 * existing, already-authoritative engine or record — nothing is
 * recalculated, no readiness verdict is produced, and no score, percentage
 * or composite health value is computed anywhere in this file. Where an
 * engine already derives freshness at read time (technical/verification
 * readiness, certification review, change impact), this service calls that
 * engine's own existing method or exported pure function; it never
 * re-implements the comparison itself.
 *
 * This is also a read: nothing here writes an audit row, mutates an
 * engineering record, or triggers detection/evaluation. Opening the command
 * center is exactly as inert as opening any of the individual workspaces it
 * summarizes.
 *
 * **Bounded reads, not a full project scan.** Every batch below reads a
 * cardinality genuinely bounded for a real project — five gates, a
 * project's own verification activities, its own active changes, its own
 * assumptions, its own risks/issues/suppliers/evidence/open surveillance
 * targets — using the same batched repository functions (`findLatestFor*`)
 * the individual engines already rely on. Nothing here performs graph
 * traversal; the one link into the graph-backed Traceability workspace is a
 * plain navigation href, not a call into `EngineeringGraphService`.
 */

const ATTENTION_STATES = new Set(["NOT_READY", "UNKNOWN"]);

export async function getCommandCenter(
  context: OrganizationContext,
  projectId: unknown,
): Promise<CommandCenterView> {
  const project = await projectService.getProject(context, projectId);
  const scopedProjectId = project.id;

  const [
    technicalGates,
    verificationActivities,
    program,
    changeRequests,
    assumptions,
    driftLatest,
    riskItems,
    issueItems,
    supplierRows,
    suppliedItemRows,
    qualificationRows,
    evidenceRows,
    surveillanceCounts,
    openSurveillance,
  ] = await Promise.all([
    Promise.all(
      TECHNICAL_READINESS_GATES.map((gate) =>
        technicalReadinessService.getLatestTechnicalReadiness(context, scopedProjectId, gate),
      ),
    ),
    verificationActivityService.listVerificationActivities(context, scopedProjectId, {}),
    certificationProgramService.getProgram(context, scopedProjectId),
    changeRequestService.listChangeRequests(context, scopedProjectId, {}),
    monitoringRepository.listProjectAssumptions(scopedProjectId),
    driftDetectionService.getLatestDriftAssessment(context, scopedProjectId),
    riskService.listRisks(context, scopedProjectId, {}),
    issueService.listIssues(context, scopedProjectId, {}),
    supplierService.listSuppliers(context, scopedProjectId, {}),
    suppliedItemService.listSuppliedItems(context, scopedProjectId, {}),
    supplierQualificationService.listSupplierQualifications(context, scopedProjectId, {}),
    evidenceService.listEvidence(context, scopedProjectId, {}),
    decisionSentinelService.getSurveillanceCounts(context, scopedProjectId),
    decisionSentinelService.listOpenSurveillance(context, scopedProjectId),
  ]);

  // --- Verification readiness: one batched read, no per-activity call -------
  const verificationLatest = await verificationReadinessRepository.findLatestForActivities(
    scopedProjectId,
    verificationActivities.map((activity) => activity.id),
  );

  // --- Change impact: latest analysis per active change, batched ------------
  const activeChanges = changeRequests.filter((change) =>
    (ACTIVE_CHANGE_REQUEST_STATUSES as readonly string[]).includes(change.status),
  );
  const [projectFingerprint, latestAnalyses] = await Promise.all([
    computeProjectFingerprint(scopedProjectId),
    impactAnalysisRepository.findLatestForChanges(
      scopedProjectId,
      activeChanges.map((change) => change.id),
    ),
  ]);

  // --- Assumption monitoring: batched read, no evaluation --------------------
  const assumptionRecords = await monitoringRepository.findLatestForAssumptions(
    scopedProjectId,
    assumptions.map((assumption) => assumption.id),
  );
  const decisionIdByAssumptionId = new Map(
    assumptions.map((assumption) => [assumption.id, assumption.engineeringDecisionId]),
  );

  // --- Certification: only meaningful once a program exists -----------------
  let certification: CommandCenterCertificationOverview = {
    hasProgram: false,
    programIdentifier: null,
    activeBasisIdentifier: null,
    review: null,
    openFindings: [],
  };
  if (program) {
    const [activeBasis, latestReview] = await Promise.all([
      certificationBasisService
        .listBases(context, scopedProjectId)
        .then((bases) => bases.find((basis) => basis.status === "ACTIVE") ?? null),
      certificationReviewService.getLatestCertificationReview(context, scopedProjectId),
    ]);

    const items = activeBasis
      ? await complianceItemService.listItems(context, scopedProjectId, activeBasis.id)
      : [];
    const openFindings = await certificationFindingRepository.listOpenFindingsForItems(
      items.map((item) => item.id),
    );

    certification = {
      hasProgram: true,
      programIdentifier: program.identifier,
      activeBasisIdentifier: activeBasis?.identifier ?? null,
      review: hasCertificationReview(latestReview)
        ? {
            status: latestReview.review.status,
            evaluatedAt: latestReview.review.evaluatedAt,
            blockingCount: latestReview.review.counts.blockingCount,
            unknownCount: latestReview.review.counts.unknownCount,
            href: `/projects/${scopedProjectId}/certification/review`,
          }
        : { status: "NOT_EVALUATED", evaluatedAt: null, blockingCount: 0, unknownCount: 0, href: `/projects/${scopedProjectId}/certification/review` },
      openFindings: openFindings.map((finding) => ({
        id: finding.id,
        identifier: finding.identifier,
        title: finding.title,
        status: finding.status,
        href: traceabilityDetailRoute("COMPLIANCE_ITEM", scopedProjectId, finding.complianceItemId) ?? "",
      })),
    };
  }

  // --- Compose readiness.technical -------------------------------------------
  const technical: CommandCenterGateSummary[] = TECHNICAL_READINESS_GATES.map(
    (gate, index) => {
      const latest = technicalGates[index]!;
      if (!hasTechnicalReadiness(latest)) {
        return {
          gate,
          status: "NOT_EVALUATED",
          freshness: null,
          evaluatedAt: null,
          blocking: 0,
          unknown: 0,
          href: `/projects/${scopedProjectId}`,
        };
      }
      return {
        gate,
        status: latest.assessment.status,
        freshness: latest.freshness,
        evaluatedAt: latest.assessment.evaluatedAt,
        blocking: latest.assessment.summary.blocking,
        unknown: latest.assessment.summary.unknown,
        href: `/projects/${scopedProjectId}`,
      };
    },
  );

  // --- Compose readiness.verification -----------------------------------------
  const attentionActivities = verificationActivities
    .map((activity) => {
      const latest = verificationLatest.get(activity.id) ?? null;
      return {
        id: activity.id,
        identifier: activity.identifier,
        title: activity.title,
        activityStatus: activity.status,
        readinessStatus: (latest ? latest.status : "NOT_EVALUATED") as
          | "READY"
          | "NOT_READY"
          | "UNKNOWN"
          | "NOT_EVALUATED",
        evaluatedAt: latest ? latest.evaluatedAt : null,
        href: traceabilityDetailRoute("VERIFICATION_ACTIVITY", scopedProjectId, activity.id) ?? "",
      };
    })
    .filter(
      (entry) =>
        entry.activityStatus === "FAILED" ||
        entry.readinessStatus === "NOT_READY" ||
        entry.readinessStatus === "UNKNOWN",
    );

  const verification: CommandCenterVerificationOverview = {
    activitiesTotal: verificationActivities.length,
    activitiesFailed: verificationActivities.filter((activity) => activity.status === "FAILED").length,
    activitiesNeverEvaluated: verificationActivities.filter((activity) => !verificationLatest.has(activity.id))
      .length,
    attentionActivities,
  };

  // --- Compose readiness.changeImpact -----------------------------------------
  const changeImpact: CommandCenterChangeImpactOverview = {
    activeChanges: activeChanges.map((change) => {
      const analysis = latestAnalyses.get(change.id) ?? null;
      return {
        id: change.id,
        identifier: change.identifier,
        title: change.title,
        status: change.status,
        latestAnalysis: analysis
          ? {
              status: analysis.status,
              freshness: freshnessOf(analysis, projectFingerprint),
              startedAt: analysis.startedAt,
              direct: analysis.summary.direct,
              downstream: analysis.summary.downstream,
              crossDomain: analysis.summary.crossDomain,
              unknown: analysis.summary.unknown,
            }
          : { status: "NOT_RUN", freshness: null, startedAt: null, direct: 0, downstream: 0, crossDomain: 0, unknown: 0 },
        href: traceabilityDetailRoute("CHANGE_REQUEST", scopedProjectId, change.id) ?? "",
      };
    }),
  };

  // --- Compose readiness.assumptions ------------------------------------------
  let reviewRequiredCount = 0;
  let basisChangedCount = 0;
  let neverEvaluatedCount = 0;
  const attentionAssumptions: CommandCenterAssumptionOverview["attentionAssumptions"] = [];
  for (const assumption of assumptions) {
    const record = assumptionRecords.get(assumption.id) ?? null;
    if (!record) {
      neverEvaluatedCount += 1;
      continue;
    }
    if (record.status === "REVIEW_REQUIRED") {
      reviewRequiredCount += 1;
      attentionAssumptions.push({
        id: assumption.id,
        decisionId: assumption.engineeringDecisionId,
        decisionIdentifier: assumption.decisionIdentifier,
        statement: assumption.statement,
        monitoringStatus: record.status,
        href: traceabilityDetailRoute("ENGINEERING_DECISION", scopedProjectId, assumption.engineeringDecisionId) ?? "",
      });
    } else if (record.status === "BASIS_CHANGED") {
      basisChangedCount += 1;
    }
  }
  const assumptionsView: CommandCenterAssumptionOverview = {
    total: assumptions.length,
    reviewRequired: reviewRequiredCount,
    basisChanged: basisChangedCount,
    neverEvaluated: neverEvaluatedCount,
    attentionAssumptions,
  };

  // --- Compose readiness.drift -------------------------------------------------
  const drift: CommandCenterDriftOverview = hasDriftAssessment(driftLatest)
    ? {
        status: driftLatest.assessment.status,
        evaluatedAt: driftLatest.assessment.evaluatedAt,
        findings: driftLatest.assessment.summary.findings,
        reviewRequired: driftLatest.assessment.summary.reviewRequired,
        unknown: driftLatest.assessment.summary.unknown,
        href: `/projects/${scopedProjectId}/drift`,
      }
    : {
        status: "NOT_EVALUATED",
        evaluatedAt: null,
        findings: 0,
        reviewRequired: 0,
        unknown: 0,
        href: `/projects/${scopedProjectId}/drift`,
      };

  // --- Risks / Issues ----------------------------------------------------------
  const openRisks = riskItems.filter((risk) => risk.status === "OPEN");
  const risks: CommandCenterRiskOverview = {
    open: openRisks.length,
    items: openRisks.map((risk) => ({
      id: risk.id,
      identifier: risk.identifier,
      title: risk.title,
      status: risk.status,
      href: traceabilityDetailRoute("RISK", scopedProjectId, risk.id) ?? "",
    })),
  };

  const openIssues = issueItems.filter((issue) => issue.status === "OPEN" || issue.status === "IN_PROGRESS");
  const attentionIssues = openIssues.filter(
    (issue) => issue.severity === "HIGH" || issue.severity === "CRITICAL",
  );
  const issues: CommandCenterIssueOverview = {
    open: openIssues.length,
    attentionCount: attentionIssues.length,
    items: openIssues.map((issue) => ({
      id: issue.id,
      identifier: issue.identifier,
      title: issue.title,
      status: issue.status,
      severity: issue.severity,
      href: traceabilityDetailRoute("ISSUE", scopedProjectId, issue.id) ?? "",
    })),
  };

  // --- Suppliers -----------------------------------------------------------------
  const suppliersUnderReview = supplierRows.filter((supplier) => supplier.status === "UNDER_REVIEW");
  const suppliedItemsUnderReview = suppliedItemRows.filter((item) => item.status === "UNDER_REVIEW");
  const qualificationsAttention = qualificationRows.filter(
    (qualification) => qualification.status === "EXPIRED" || qualification.status === "WITHDRAWN",
  );
  const suppliers: CommandCenterSupplierOverview = {
    suppliersUnderReview: suppliersUnderReview.map((supplier) => ({
      id: supplier.id,
      identifier: supplier.identifier,
      title: supplier.name,
      href: traceabilityDetailRoute("SUPPLIER", scopedProjectId, supplier.id) ?? "",
    })),
    suppliedItemsUnderReview: suppliedItemsUnderReview.map((item) => ({
      id: item.id,
      identifier: item.identifier,
      title: item.name,
      href: traceabilityDetailRoute("SUPPLIED_ITEM", scopedProjectId, item.id) ?? "",
    })),
    qualificationsAttention: qualificationsAttention.map((qualification) => ({
      id: qualification.id,
      identifier: qualification.supplier.identifier,
      title: qualification.title,
      status: qualification.status,
      href: traceabilityDetailRoute("SUPPLIER_QUALIFICATION", scopedProjectId, qualification.id) ?? "",
    })),
  };

  // --- Evidence --------------------------------------------------------------------
  const draftEvidence = evidenceRows.filter((row) => row.status === "DRAFT");
  const evidence: CommandCenterEvidenceOverview = {
    draftCount: draftEvidence.length,
    validatedCount: evidenceRows.filter((row) => row.status === "VALIDATED").length,
    supersededCount: evidenceRows.filter((row) => row.status === "SUPERSEDED").length,
    draftItems: draftEvidence.map((row) => ({
      id: row.id,
      identifier: row.identifier,
      title: row.title,
      href: traceabilityDetailRoute("EVIDENCE", scopedProjectId, row.id) ?? "",
    })),
  };

  // --- Sentinel ------------------------------------------------------------------
  const sentinel: CommandCenterSentinelOverview = {
    openCount: surveillanceCounts.open,
    acknowledgedCount: surveillanceCounts.acknowledged,
    targets: openSurveillance.map((target) => ({
      id: target.id,
      targetType: target.targetType,
      targetIdentifier: target.targetIdentifier,
      targetLabel: target.targetLabel,
      status: target.status,
      reason: target.reason,
      href: sentinelTargetHref(scopedProjectId, target.targetType, target.targetId, decisionIdByAssumptionId),
    })),
  };

  // --- Attention items: deterministically derived from the sections above -----
  const attentionItems = buildAttentionItems({
    scopedProjectId,
    technical,
    verification,
    certification,
    changeImpact,
    assumptions: assumptionsView,
    drift,
    risks,
    issues,
    suppliers,
    sentinel,
  });

  return {
    project: {
      id: project.id,
      identifier: null,
      name: project.name,
      description: project.description,
      status: project.status,
      createdAt: project.createdAt,
      updatedAt: project.updatedAt,
    },
    attentionItems,
    readiness: {
      technical,
      verification,
      certification,
      changeImpact,
      assumptions: assumptionsView,
      drift,
    },
    risks,
    issues,
    suppliers,
    evidence,
    sentinel,
    traceabilityHref: `/projects/${scopedProjectId}/traceability`,
  };
}

function sentinelTargetHref(
  projectId: string,
  targetType: string,
  targetId: string,
  decisionIdByAssumptionId: Map<string, string>,
): string {
  switch (targetType) {
    case "IMPACT_ANALYSIS":
      return traceabilityDetailRoute("CHANGE_REQUEST", projectId, targetId) ?? `/projects/${projectId}/changes`;
    case "ASSUMPTION_MONITORING": {
      const decisionId = decisionIdByAssumptionId.get(targetId);
      return decisionId
        ? (traceabilityDetailRoute("ENGINEERING_DECISION", projectId, decisionId) ?? `/projects/${projectId}/decisions`)
        : `/projects/${projectId}/decisions`;
    }
    case "VERIFICATION_READINESS":
      return traceabilityDetailRoute("VERIFICATION_ACTIVITY", projectId, targetId) ?? `/projects/${projectId}/verification`;
    case "TECHNICAL_READINESS":
      return `/projects/${projectId}`;
    case "DRIFT_ASSESSMENT":
      return `/projects/${projectId}/drift`;
    case "CERTIFICATION_REVIEW":
      return `/projects/${projectId}/certification/review`;
    default:
      return `/projects/${projectId}`;
  }
}

/**
 * Builds the "Attention Required" list, deterministically, from the sections
 * already composed above. This is the only place a record is judged
 * attention-worthy, and every rule here reads an already-persisted,
 * already-authoritative state — nothing is invented and nothing is scored.
 */
function buildAttentionItems(sections: {
  scopedProjectId: string;
  technical: CommandCenterGateSummary[];
  verification: CommandCenterVerificationOverview;
  certification: CommandCenterCertificationOverview;
  changeImpact: CommandCenterChangeImpactOverview;
  assumptions: CommandCenterAssumptionOverview;
  drift: CommandCenterDriftOverview;
  risks: CommandCenterRiskOverview;
  issues: CommandCenterIssueOverview;
  suppliers: CommandCenterSupplierOverview;
  sentinel: CommandCenterSentinelOverview;
}): AttentionItem[] {
  const items: AttentionItem[] = [];
  const seen = new Set<string>();

  function push(item: Omit<AttentionItem, "key">, sourceType: string, sourceId: string) {
    const key = `${item.sourceModule}:${sourceType}:${sourceId}`;
    if (seen.has(key)) return;
    seen.add(key);
    items.push({ ...item, key });
  }

  for (const gate of sections.technical) {
    if (ATTENTION_STATES.has(gate.status)) {
      push(
        {
          sourceModule: "TECHNICAL_READINESS",
          sourceType: "TECHNICAL_READINESS_GATE",
          sourceId: gate.gate,
          identifier: null,
          title: technicalReadinessGateLabel(gate.gate as never),
          state: gate.status,
          reason:
            gate.status === "NOT_READY"
              ? `${technicalReadinessGateLabel(gate.gate as never)} gate is NOT_READY (${gate.blocking} blocking finding(s))`
              : `${technicalReadinessGateLabel(gate.gate as never)} gate readiness is UNKNOWN`,
          href: gate.href,
        },
        "TECHNICAL_READINESS_GATE",
        gate.gate,
      );
    }
  }

  for (const activity of sections.verification.attentionActivities) {
    push(
      {
        sourceModule: "VERIFICATION_READINESS",
        sourceType: "VERIFICATION_ACTIVITY",
        sourceId: activity.id,
        identifier: activity.identifier,
        title: activity.title,
        state: activity.activityStatus === "FAILED" ? "FAILED" : activity.readinessStatus,
        reason:
          activity.activityStatus === "FAILED"
            ? `Verification activity ${activity.identifier ?? activity.title} has FAILED`
            : `Verification activity ${activity.identifier ?? activity.title} readiness is ${activity.readinessStatus}`,
        href: activity.href,
      },
      "VERIFICATION_ACTIVITY",
      activity.id,
    );
  }

  if (sections.certification.review && ATTENTION_STATES.has(sections.certification.review.status)) {
    push(
      {
        sourceModule: "CERTIFICATION",
        sourceType: "CERTIFICATION_REVIEW",
        sourceId: sections.scopedProjectId,
        identifier: sections.certification.programIdentifier,
        title: "Certification review",
        state: sections.certification.review.status,
        reason: `Certification review is ${sections.certification.review.status}`,
        href: sections.certification.review.href,
      },
      "CERTIFICATION_REVIEW",
      sections.scopedProjectId,
    );
  }
  for (const finding of sections.certification.openFindings) {
    push(
      {
        sourceModule: "CERTIFICATION",
        sourceType: "CERTIFICATION_FINDING",
        sourceId: finding.id,
        identifier: finding.identifier,
        title: finding.title,
        state: finding.status,
        reason: `Certification finding ${finding.identifier} is ${finding.status}`,
        href: finding.href,
      },
      "CERTIFICATION_FINDING",
      finding.id,
    );
  }

  for (const change of sections.changeImpact.activeChanges) {
    if (change.latestAnalysis.freshness === "STALE") {
      push(
        {
          sourceModule: "CHANGE_IMPACT",
          sourceType: "CHANGE_REQUEST",
          sourceId: change.id,
          identifier: change.identifier,
          title: change.title,
          state: "STALE",
          reason: `Impact analysis for ${change.identifier} is STALE`,
          href: change.href,
        },
        "CHANGE_REQUEST",
        change.id,
      );
    }
  }

  for (const assumption of sections.assumptions.attentionAssumptions) {
    push(
      {
        sourceModule: "ASSUMPTION_MONITORING",
        sourceType: "DECISION_ASSUMPTION",
        sourceId: assumption.id,
        identifier: assumption.decisionIdentifier,
        title: assumption.statement,
        state: assumption.monitoringStatus,
        reason: `Assumption on decision ${assumption.decisionIdentifier} requires review`,
        href: assumption.href,
      },
      "DECISION_ASSUMPTION",
      assumption.id,
    );
  }

  if (sections.drift.status === "DRIFT_DETECTED" || sections.drift.status === "UNKNOWN") {
    push(
      {
        sourceModule: "DRIFT",
        sourceType: "DRIFT_ASSESSMENT",
        sourceId: sections.scopedProjectId,
        identifier: null,
        title: "Design / operations drift",
        state: sections.drift.status,
        reason:
          sections.drift.status === "DRIFT_DETECTED"
            ? `Drift detected (${sections.drift.findings} finding(s))`
            : "Drift status is UNKNOWN",
        href: sections.drift.href,
      },
      "DRIFT_ASSESSMENT",
      sections.scopedProjectId,
    );
  }

  for (const risk of sections.risks.items) {
    push(
      {
        sourceModule: "RISK",
        sourceType: "RISK",
        sourceId: risk.id,
        identifier: risk.identifier,
        title: risk.title,
        state: risk.status,
        reason: `Risk ${risk.identifier} is OPEN`,
        href: risk.href,
      },
      "RISK",
      risk.id,
    );
  }

  for (const issue of sections.issues.items) {
    if (issue.severity === "HIGH" || issue.severity === "CRITICAL") {
      push(
        {
          sourceModule: "ISSUE",
          sourceType: "ISSUE",
          sourceId: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          state: issue.severity,
          reason: `Issue ${issue.identifier} is ${issue.severity} and ${issue.status}`,
          href: issue.href,
        },
        "ISSUE",
        issue.id,
      );
    }
  }

  for (const supplier of sections.suppliers.suppliersUnderReview) {
    push(
      {
        sourceModule: "SUPPLIER",
        sourceType: "SUPPLIER",
        sourceId: supplier.id,
        identifier: supplier.identifier,
        title: supplier.title,
        state: "UNDER_REVIEW",
        reason: `Supplier ${supplier.identifier} is UNDER_REVIEW`,
        href: supplier.href,
      },
      "SUPPLIER",
      supplier.id,
    );
  }
  for (const item of sections.suppliers.suppliedItemsUnderReview) {
    push(
      {
        sourceModule: "SUPPLIER",
        sourceType: "SUPPLIED_ITEM",
        sourceId: item.id,
        identifier: item.identifier,
        title: item.title,
        state: "UNDER_REVIEW",
        reason: `Supplied item ${item.identifier} is UNDER_REVIEW`,
        href: item.href,
      },
      "SUPPLIED_ITEM",
      item.id,
    );
  }
  for (const qualification of sections.suppliers.qualificationsAttention) {
    push(
      {
        sourceModule: "SUPPLIER",
        sourceType: "SUPPLIER_QUALIFICATION",
        sourceId: qualification.id,
        identifier: qualification.identifier,
        title: qualification.title,
        state: qualification.status,
        reason: `Supplier qualification ${qualification.title} is ${qualification.status}`,
        href: qualification.href,
      },
      "SUPPLIER_QUALIFICATION",
      qualification.id,
    );
  }

  for (const target of sections.sentinel.targets) {
    push(
      {
        sourceModule: "SENTINEL",
        sourceType: "SURVEILLANCE_TARGET",
        sourceId: target.id,
        identifier: target.targetIdentifier,
        title: target.targetLabel,
        state: target.status,
        reason: target.reason,
        href: target.href,
      },
      "SURVEILLANCE_TARGET",
      target.id,
    );
  }

  return items.sort((a, b) => {
    if (a.sourceModule !== b.sourceModule) return a.sourceModule.localeCompare(b.sourceModule);
    return (a.identifier ?? a.title).localeCompare(b.identifier ?? b.title);
  });
}
