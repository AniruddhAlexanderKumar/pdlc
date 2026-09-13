import {
  type CertificationBasisObject,
  type CertificationBasisObjectRole,
  CERTIFICATION_VERSION,
  type CertificationConsumedAssumptionMonitoring,
  type CertificationConsumedChangeImpact,
  type CertificationConsumedDrift,
  type CertificationConsumedSupplierQualification,
  type CertificationConsumedVerificationReadiness,
  type CertificationReview,
  type CertificationReviewBasis,
  type CertificationReviewFinding,
  type CertificationReviewReport,
  certificationFindingSeverityLabel,
  certificationFingerprint,
  certificationReviewFreshnessOf,
  certificationReviewRule,
  certificationReviewStatusFor,
  complianceMethodRequiresEvidence,
  compareCertificationReviewFindings,
  ENGINEERING_BASIS_LINK_TYPES,
  entityIdSchema,
  evaluateCertificationReviewRequestSchema,
  type GraphNodeType,
  graphNodeKey,
  isCertificationFindingOpen,
  type LatestCertificationReview,
  normalizeCertificationBasis,
} from "@/domain";
import { prisma } from "@/lib/db";
import type { OrganizationContext } from "@/server/context/organization-context";
import { AppError, NotFoundError } from "@/server/errors";
import * as auditLogRepository from "@/server/repositories/audit-log.repository";
import * as baselineRepository from "@/server/repositories/engineering-baseline.repository";
import * as basisRepository from "@/server/repositories/certification-basis.repository";
import * as assumptionBasisRepository from "@/server/repositories/certification-review-basis.repository";
import * as findingRepository from "@/server/repositories/certification-finding.repository";
import * as linkRepository from "@/server/repositories/compliance-link.repository";
import * as itemRepository from "@/server/repositories/compliance-item.repository";
import * as programRepository from "@/server/repositories/certification-program.repository";
import * as reviewRepository from "@/server/repositories/certification-review.repository";
import * as driftAssessmentRepository from "@/server/repositories/drift-assessment.repository";
import { loadChangeImpactContext } from "@/server/repositories/verification-readiness-basis.repository";
import type { ReadinessSubjectRef } from "@/server/repositories/verification-readiness-basis.repository";
import { computeProjectFingerprint } from "@/server/repositories/project-revision.repository";
import {
  EngineeringGraphService,
  engineeringGraphService,
} from "@/server/services/engineering-graph.service";
import {
  VerificationReadinessService,
  verificationReadinessService,
} from "@/server/services/verification-readiness.service";
import { hasVerificationReadiness } from "@/domain/verification-readiness";
import { parseOrThrow } from "@/server/validation";
import {
  artifactAuditEvent,
  requireProjectReadAccess,
  requireProjectWriteAccess,
} from "./project-scope";

/**
 * The internal certification readiness review.
 *
 * It answers one question: *given the compliance items recorded against the
 * active certification basis, and the engineering state actually on record
 * for what they link to, is this workspace ready for internal review?*
 *
 * **This is never regulatory approval.** `READY` means "ready for internal
 * review" — nothing here writes, implies, or is permitted to render as "FAA
 * compliant", "EASA approved" or "certified".
 *
 * **The service owns no compliance policy beyond the rule registry.** Every
 * finding comes from `CERTIFICATION_REVIEW_RULES`, looked up by id; `emit`
 * refuses an id the registry does not define.
 *
 * **It computes nothing another engine owns.** Verification readiness,
 * change impact, assumption monitoring, drift and supplier qualification
 * state are all read from what those engines already wrote. This service
 * never triggers any of them, and never writes to a source artifact — an
 * evaluation reads, judges, and appends.
 *
 * **Applicability and disposition are never touched here.** They are the
 * inputs this engine reads; nothing in this file, or anywhere downstream of
 * it, sets a compliance item's applicability or disposition.
 */

export const CERTIFICATION_REVIEW_ENTITY_TYPE = "CertificationReview";

export const CERTIFICATION_REVIEW_AUDIT_ACTIONS = {
  evaluated: "certification_review.evaluated",
} as const;

/** Raised when the basis cannot be read well enough to judge anything, or an unregistered rule id is referenced. */
export class CertificationReviewFailure extends AppError {
  constructor(message: string) {
    super(message, { statusCode: 422, code: "CERTIFICATION_REVIEW_FAILED", isOperational: true });
  }
}

interface FindingSubject {
  type: string;
  id: string;
  identifier: string | null;
  label: string;
}

type DraftFinding = reviewRepository.PersistReviewFindingInput;

/** One linked engineering object, deduped across every item that links it, with everything a rule reads. */
interface LinkedObject {
  type: GraphNodeType;
  id: string;
  identifier: string | null;
  label: string;
  state: string | null;
  /** Whether at least one non-NOT_APPLICABLE item links this object. */
  inScope: boolean;
}

interface ResolvedReview {
  program: { id: string };
  activeBasis: { id: string; identifier: string; status: string } | null;
  items: Array<{
    id: string;
    identifier: string;
    title: string;
    applicability: string;
    method: string | null;
    hasEngineeringLink: boolean;
    hasEvidenceLink: boolean;
    updatedAt: Date;
  }>;
  linkedObjects: LinkedObject[];
  evidenceObjects: LinkedObject[];
  findings: Array<{
    id: string;
    identifier: string;
    title: string;
    severity: string;
    status: string;
    updatedAt: Date;
  }>;
  assumptions: CertificationConsumedAssumptionMonitoring[];
  drift: CertificationConsumedDrift[];
  changeImpact: CertificationConsumedChangeImpact[];
  verificationReadiness: CertificationConsumedVerificationReadiness[];
  supplierQualification: CertificationConsumedSupplierQualification[];
  basis: CertificationReviewBasis;
}

export class CertificationReviewService {
  constructor(
    private readonly graph: EngineeringGraphService = engineeringGraphService,
    private readonly verificationReadiness: VerificationReadinessService = verificationReadinessService,
  ) {}

  async evaluateCertificationReview(
    context: OrganizationContext,
    projectId: unknown,
    input: unknown = {},
  ): Promise<CertificationReviewReport> {
    const scopedProjectId = await requireProjectWriteAccess(context, projectId);
    parseOrThrow(evaluateCertificationReviewRequestSchema, input ?? {}, "Invalid review request");

    const program = await this.requireProgram(scopedProjectId);
    const resolved = await this.resolveBasis(context, scopedProjectId, program.id);

    const findings = this.evaluate(resolved);
    const status = certificationReviewStatusFor(findings);
    const fingerprint = certificationFingerprint(resolved.basis);
    const counts = tally(findings);
    const summary = buildSummary(status, counts);

    const review = await prisma.$transaction(async (tx) => {
      const written = await reviewRepository.createReview(
        {
          certificationProgramId: program.id,
          status,
          reviewVersion: CERTIFICATION_VERSION,
          fingerprint,
          basis: resolved.basis,
          summary,
          evaluatedById: context.actorId,
          ...counts,
        },
        tx,
      );

      await reviewRepository.createReviewFindings(written.id, findings, tx);

      // Counts and verdict only — never the full finding set, which can be
      // large and belongs in the review's own history, not the audit log.
      await auditLogRepository.recordAuditEvent(
        artifactAuditEvent(
          context,
          CERTIFICATION_REVIEW_AUDIT_ACTIONS.evaluated,
          CERTIFICATION_REVIEW_ENTITY_TYPE,
          written.id,
          {
            projectId: scopedProjectId,
            certificationProgramId: program.id,
            status,
            findingCount: counts.findingCount,
            blockingCount: counts.blockingCount,
          },
        ),
        tx,
      );

      return written;
    });

    const persisted = await reviewRepository.listFindings(review.id);
    return {
      review,
      freshness: "CURRENT",
      findings: persisted as unknown as CertificationReviewFinding[],
      basis: resolved.basis,
    };
  }

  async getLatestCertificationReview(
    context: OrganizationContext,
    projectId: unknown,
  ): Promise<LatestCertificationReview> {
    const scopedProjectId = await requireProjectReadAccess(context, projectId);
    const program = await this.requireProgram(scopedProjectId);

    const latest = await reviewRepository.findLatestReview(program.id);
    if (!latest) {
      return {
        status: "NOT_EVALUATED",
        certificationProgramId: program.id,
        reviewVersion: CERTIFICATION_VERSION,
      };
    }
    return this.buildReport(context, scopedProjectId, program.id, latest);
  }

  async listCertificationReviewHistory(
    context: OrganizationContext,
    projectId: unknown,
  ): Promise<CertificationReview[]> {
    const scopedProjectId = await requireProjectReadAccess(context, projectId);
    const program = await this.requireProgram(scopedProjectId);
    return reviewRepository.listReviews(program.id);
  }

  async explainCertificationReview(
    context: OrganizationContext,
    projectId: unknown,
    reviewId: unknown,
  ): Promise<CertificationReviewReport> {
    const scopedProjectId = await requireProjectReadAccess(context, projectId);
    const program = await this.requireProgram(scopedProjectId);
    const id = parseOrThrow(entityIdSchema, reviewId, "Invalid review id");

    const review = await reviewRepository.findReviewInProgram(program.id, id);
    if (!review) {
      throw new NotFoundError(`Certification review ${id} was not found.`);
    }
    return this.buildReport(context, scopedProjectId, program.id, review);
  }

  // --- Internals ----------------------------------------------------------

  private async requireProgram(projectId: string) {
    const program = await programRepository.findProgramInProject(projectId);
    if (!program) {
      throw new NotFoundError("This project has no certification program yet.");
    }
    return program;
  }

  private async buildReport(
    context: OrganizationContext,
    projectId: string,
    certificationProgramId: string,
    review: CertificationReview,
  ): Promise<CertificationReviewReport> {
    const [findings, storedBasis, freshness] = await Promise.all([
      reviewRepository.listFindings(review.id),
      reviewRepository.readReviewBasis(review),
      this.deriveFreshness(context, projectId, certificationProgramId, review),
    ]);

    return {
      review,
      freshness,
      findings: findings as unknown as CertificationReviewFinding[],
      basis: storedBasis,
    };
  }

  private async deriveFreshness(
    context: OrganizationContext,
    projectId: string,
    certificationProgramId: string,
    review: CertificationReview,
  ) {
    try {
      const resolved = await this.resolveBasis(context, projectId, certificationProgramId);
      return certificationReviewFreshnessOf(
        review.fingerprint,
        certificationFingerprint(resolved.basis),
        review.reviewVersion,
      );
    } catch {
      return "UNKNOWN" as const;
    }
  }

  /**
   * Resolves everything one review needs, batched throughout:
   *
   *   1. the active certification basis and its compliance items
   *   2. every link on those items, across all eight tables — eight queries
   *      total, never one per item
   *   3. consumed verdicts: verification readiness (bounded to the distinct
   *      linked activities), change impact (reusing the existing readiness
   *      basis repository), assumption monitoring (batched by decision id),
   *      drift (the project's active baseline and its latest assessment),
   *      supplier qualification state (already joined in step 2)
   *   4. revision stamps for every linked engineering object, via the graph
   *      service's own batched reader
   *
   * Nothing here re-runs another engine. Verification readiness is the one
   * partial exception — one read per *distinct linked activity*, not per
   * compliance item, which mirrors the same documented tradeoff
   * `TechnicalReadinessService` makes for the same reason: reimplementing its
   * freshness rule here would be the real duplication.
   */
  private async resolveBasis(
    context: OrganizationContext,
    projectId: string,
    certificationProgramId: string,
  ): Promise<ResolvedReview> {
    const activeBasis = await basisRepository.findActiveBasis(certificationProgramId);

    const rawItems = activeBasis ? await itemRepository.listItemsInBasis(activeBasis.id) : [];
    const itemIds = rawItems.map((item) => item.id);

    const [linkage, openFindings, dispositionedFindings] = await Promise.all([
      linkRepository.loadReviewLinkage(itemIds),
      findingRepository.listOpenFindingsForItems(itemIds),
      findingRepository.listDispositionedFindingsForItems(itemIds),
    ]);

    // Which items have at least one engineering-basis link / evidence link,
    // and which items are not NOT_APPLICABLE (in scope for engineering-state rules).
    const inScopeItemIds = new Set(
      rawItems.filter((item) => item.applicability !== "NOT_APPLICABLE").map((item) => item.id),
    );

    const engineeringRowsByType: Record<string, { type: GraphNodeType; rows: typeof linkage.requirements }> = {
      REQUIREMENT: { type: "REQUIREMENT", rows: linkage.requirements },
      VERIFICATION_ACTIVITY: { type: "VERIFICATION_ACTIVITY", rows: linkage.verificationActivities },
      ENGINEERING_DECISION: { type: "ENGINEERING_DECISION", rows: linkage.decisions },
      DESIGN_ITEM: { type: "DESIGN_ITEM", rows: linkage.designItems },
      SUPPLIER_QUALIFICATION: { type: "SUPPLIER_QUALIFICATION", rows: linkage.supplierQualifications },
    };

    const itemHasEngineeringLink = new Set<string>();
    for (const bucket of Object.values(engineeringRowsByType)) {
      for (const row of bucket.rows) itemHasEngineeringLink.add(row.complianceItemId);
    }
    // Risk and Issue links exist for traceability but are not "engineering
    // basis" for CR-LNK-001's purposes (see ENGINEERING_BASIS_LINK_TYPES).
    void ENGINEERING_BASIS_LINK_TYPES;

    const itemHasEvidenceLink = new Set(linkage.evidence.map((row) => row.complianceItemId));

    // Deduplicate each linked-object type across every item that links it.
    const linkedObjects: LinkedObject[] = [];
    const seenKeys = new Set<string>();
    for (const bucket of Object.values(engineeringRowsByType)) {
      for (const row of bucket.rows) {
        const key = `${bucket.type}:${row.id}`;
        const inScope = inScopeItemIds.has(row.complianceItemId);
        const existingIndex = seenKeys.has(key)
          ? linkedObjects.findIndex((o) => o.type === bucket.type && o.id === row.id)
          : -1;
        if (existingIndex >= 0) {
          const existing = linkedObjects[existingIndex];
          if (inScope && existing) existing.inScope = true;
          continue;
        }
        seenKeys.add(key);
        linkedObjects.push({
          type: bucket.type,
          id: row.id,
          identifier: row.identifier,
          label: row.label,
          state: row.state,
          inScope,
        });
      }
    }

    const evidenceObjects: LinkedObject[] = [];
    const seenEvidence = new Set<string>();
    for (const row of linkage.evidence) {
      if (seenEvidence.has(row.id)) continue;
      seenEvidence.add(row.id);
      evidenceObjects.push({
        type: "EVIDENCE",
        id: row.id,
        identifier: row.identifier,
        label: row.label,
        state: null,
        inScope: inScopeItemIds.has(row.complianceItemId),
      });
    }

    // --- Consumed: verification readiness (bounded to distinct linked activities) ---
    const activityIds = [...new Set(linkage.verificationActivities.map((row) => row.id))];
    const verificationReadiness: CertificationConsumedVerificationReadiness[] = [];
    for (const activityId of activityIds) {
      const latest = await this.verificationReadiness.getLatestVerificationReadiness(
        context,
        projectId,
        activityId,
      );
      if (hasVerificationReadiness(latest)) {
        verificationReadiness.push({
          verificationActivityId: activityId,
          assessmentId: latest.assessment.id,
          status: latest.assessment.status,
          freshness: latest.freshness,
        });
      } else {
        verificationReadiness.push({
          verificationActivityId: activityId,
          assessmentId: null,
          status: "NOT_EVALUATED",
          freshness: null,
        });
      }
    }

    // --- Consumed: change impact, reusing the existing readiness basis repository ---
    const impactSubjects: ReadinessSubjectRef[] = linkedObjects
      .filter((o) => o.type === "REQUIREMENT" || o.type === "DESIGN_ITEM" || o.type === "ENGINEERING_DECISION" || o.type === "VERIFICATION_ACTIVITY")
      .map((o) => ({ type: o.type, id: o.id }));
    const changeRows = impactSubjects.length > 0 ? await loadChangeImpactContext(projectId, impactSubjects) : [];
    const needsProjectFingerprint = changeRows.some((row) => row.analysis !== null);
    const projectFingerprint = needsProjectFingerprint ? await computeProjectFingerprint(projectId) : null;

    const impactSubjectKeys = new Set(impactSubjects.map(graphNodeKey));
    const changeImpact: CertificationConsumedChangeImpact[] = changeRows.map((row) => {
      const analysisFreshness =
        !row.analysis || row.analysis.status !== "COMPLETED"
          ? "NOT_RUN"
          : !row.analysis.sourceFingerprint || !projectFingerprint
            ? "UNKNOWN"
            : row.analysis.sourceFingerprint === projectFingerprint
              ? "CURRENT"
              : "STALE";
      const affected = new Set(row.affectedSubjects.map(graphNodeKey));
      const declared = new Set(row.declaredSubjects.map(graphNodeKey));
      const reachesLinkedObject = [...impactSubjectKeys].some(
        (key) => affected.has(key) || declared.has(key),
      );
      return {
        changeRequestId: row.changeRequestId,
        identifier: row.identifier,
        status: row.status,
        analysisId: row.analysis?.id ?? null,
        analysisFreshness,
        reachesLinkedObject,
      };
    });

    // --- Consumed: assumption monitoring, batched by linked decision id ---
    const decisionIds = [...new Set(linkage.decisions.map((row) => row.id))];
    const assumptionRows = await assumptionBasisRepository.loadAssumptionContext(projectId, decisionIds);
    const assumptions: CertificationConsumedAssumptionMonitoring[] = assumptionRows.map((row) => ({
      assumptionId: row.assumptionId,
      decisionId: row.decisionId,
      monitoringStatus: row.monitoringStatus,
      assumptionStatus: row.assumptionStatus,
    }));

    // --- Consumed: drift, against the project's active engineering baseline ---
    const drift: CertificationConsumedDrift[] = [];
    const activeEngineeringBaseline = await baselineRepository.findActiveBaseline(projectId);
    if (activeEngineeringBaseline) {
      const latestDriftAssessment = await driftAssessmentRepository.findLatestAssessment(
        projectId,
        activeEngineeringBaseline.id,
      );
      if (latestDriftAssessment) {
        const driftFindings = await driftAssessmentRepository.listFindings(latestDriftAssessment.id);
        const driftableTypes = new Set(["REQUIREMENT", "DESIGN_ITEM", "ENGINEERING_DECISION", "VERIFICATION_ACTIVITY", "SUPPLIER_QUALIFICATION"]);
        for (const object of linkedObjects) {
          if (!driftableTypes.has(object.type)) continue;
          const relevant = driftFindings.filter(
            (finding) =>
              finding.baselineSubject?.type === object.type && finding.baselineSubject?.id === object.id,
          );
          if (relevant.length === 0) continue;
          const anyDetected = relevant.some((finding) => finding.status === "REVIEW_REQUIRED");
          const anyUnknown = relevant.some((finding) => finding.status === "UNKNOWN");
          drift.push({
            subjectType: object.type,
            subjectId: object.id,
            assessmentId: latestDriftAssessment.id,
            status: anyDetected ? "DRIFT_DETECTED" : anyUnknown ? "UNKNOWN" : "NO_DRIFT",
            freshness: null,
          });
        }
      }
    }

    // --- Supplier qualification state is already joined in linkedObjects. ---
    const supplierQualification: CertificationConsumedSupplierQualification[] = linkedObjects
      .filter((object) => object.type === "SUPPLIER_QUALIFICATION")
      .map((object) => ({ supplierQualificationId: object.id, status: object.state ?? "" }));

    // --- Revision stamps, one batched read across every linked node. ---
    const revisionRefs = [
      ...linkedObjects.map((object) => ({ type: object.type, id: object.id })),
      ...evidenceObjects.map((object) => ({ type: object.type, id: object.id })),
    ];
    const revisions =
      revisionRefs.length > 0
        ? await this.graph.getNodeRevisions(context, projectId, revisionRefs)
        : new Map<string, Date>();

    const revisionOf = (type: GraphNodeType, id: string): string => {
      const revision = revisions.get(graphNodeKey({ type, id }));
      return revision ? revision.toISOString() : "unresolved";
    };

    const items = rawItems.map((item) => ({
      id: item.id,
      identifier: item.identifier,
      title: item.title,
      applicability: item.applicability,
      method: item.method,
      hasEngineeringLink: itemHasEngineeringLink.has(item.id),
      hasEvidenceLink: itemHasEvidenceLink.has(item.id),
      updatedAt: item.updatedAt,
    }));

    const findingObjects = [...openFindings, ...dispositionedFindings].map((finding) => ({
      id: finding.id,
      identifier: finding.identifier,
      title: finding.title,
      severity: finding.severity,
      status: finding.status,
      updatedAt: finding.updatedAt,
    }));

    const objects: CertificationBasisObject[] = [
      ...(activeBasis
        ? [
            {
              role: "CERTIFICATION_BASIS" as CertificationBasisObjectRole,
              type: "PROJECT" as GraphNodeType,
              id: activeBasis.id,
              identifier: activeBasis.identifier,
              label: activeBasis.identifier,
              state: activeBasis.status,
              revision: "unresolved",
            },
          ]
        : []),
      ...items.map((item) => ({
        role: "COMPLIANCE_ITEM" as CertificationBasisObjectRole,
        type: "PROJECT" as GraphNodeType,
        id: item.id,
        identifier: item.identifier,
        label: item.title,
        state: `${item.applicability}|${item.method ?? "NONE"}`,
        revision: item.updatedAt.toISOString(),
      })),
      ...linkedObjects.map((object) => ({
        role: linkedObjectRole(object.type),
        type: object.type,
        id: object.id,
        identifier: object.identifier,
        label: object.label,
        state: object.state,
        revision: revisionOf(object.type, object.id),
      })),
      ...evidenceObjects.map((object) => ({
        role: "LINKED_EVIDENCE" as CertificationBasisObjectRole,
        type: "EVIDENCE" as GraphNodeType,
        id: object.id,
        identifier: object.identifier,
        label: object.label,
        state: null,
        revision: revisionOf("EVIDENCE", object.id),
      })),
      ...findingObjects.map((finding) => ({
        role: "CERTIFICATION_FINDING" as CertificationBasisObjectRole,
        type: "PROJECT" as GraphNodeType,
        id: finding.id,
        identifier: finding.identifier,
        label: finding.title,
        state: `${finding.severity}/${finding.status}`,
        revision: finding.updatedAt.toISOString(),
      })),
    ];

    const basis: CertificationReviewBasis = {
      certificationProgramId,
      certificationBasisId: activeBasis?.id ?? "",
      objects,
      consumed: {
        verificationReadiness,
        changeImpact,
        assumptionMonitoring: assumptions,
        drift,
        supplierQualification,
      },
    };

    return {
      program: { id: certificationProgramId },
      activeBasis,
      items,
      linkedObjects,
      evidenceObjects,
      findings: findingObjects,
      assumptions,
      drift,
      changeImpact,
      verificationReadiness,
      supplierQualification,
      basis,
    };
  }

  /**
   * Evaluates the rule registry against a resolved basis. Pure: no database,
   * no clock, no randomness — the same basis always produces the same
   * findings, in the same order, for the same reasons.
   */
  private evaluate(resolved: ResolvedReview): DraftFinding[] {
    const drafts: DraftFinding[] = [];

    const emit = (
      ruleId: string,
      subject: FindingSubject,
      message: string,
      extraBasis: readonly string[] = [],
    ): void => {
      const rule = certificationReviewRule(ruleId);
      if (!rule) {
        throw new CertificationReviewFailure(
          "The certification review referenced a rule that is not defined in the registry.",
        );
      }
      drafts.push({
        ruleId: rule.id,
        category: rule.category,
        status: rule.status,
        subjectType: subject.type,
        subjectId: subject.id,
        subjectIdentifier: subject.identifier,
        subjectLabel: subject.label,
        message,
        basis: normalizeCertificationBasis([...rule.basis, ...extraBasis] as never),
        sequence: 0,
      });
    };

    // --- Per compliance item: applicability, method, engineering linkage, evidence ---
    for (const item of resolved.items) {
      const subject: FindingSubject = {
        type: "COMPLIANCE_ITEM",
        id: item.id,
        identifier: item.identifier,
        label: item.title,
      };
      const label = item.identifier;

      if (item.applicability === "UNDETERMINED") {
        emit("CR-APL-001", subject, `${label}'s applicability has not been determined.`);
        continue;
      }
      if (item.applicability === "NOT_APPLICABLE") {
        emit("CR-APL-003", subject, `${label} was determined NOT_APPLICABLE.`);
        continue;
      }

      // APPLICABLE from here on.
      emit("CR-APL-002", subject, `${label} was determined APPLICABLE.`);

      if (!item.method) {
        emit("CR-MTH-001", subject, `${label} is APPLICABLE but declares no compliance method.`);
      } else {
        emit("CR-MTH-002", subject, `${label}'s compliance method is ${item.method}.`);
      }

      if (!item.hasEngineeringLink) {
        emit(
          "CR-LNK-001",
          subject,
          `${label} is APPLICABLE but has no linked requirement, verification activity, decision, design item or supplier qualification.`,
        );
      }

      if (item.method) {
        const requiresEvidence = complianceMethodRequiresEvidence(item.method as never);
        if (requiresEvidence && !item.hasEvidenceLink) {
          emit(
            "CR-EVD-001",
            subject,
            `${label}'s compliance method (${item.method}) is one that produces a recorded result, and no evidence is linked.`,
          );
        } else if (!requiresEvidence) {
          emit(
            "CR-EVD-003",
            subject,
            `${label}'s compliance method (${item.method}) does not by itself require evidence.`,
          );
        }
      }
    }

    for (const object of resolved.evidenceObjects) {
      if (!object.inScope) continue;
      emit(
        "CR-EVD-002",
        toSubject(object),
        `Evidence "${truncate(object.label)}" is linked to a compliance item. This records that evidence exists, not that it proves regulatory compliance.`,
      );
    }

    // --- Per distinct linked object: engineering state ---
    for (const object of resolved.linkedObjects) {
      if (!object.inScope) continue;
      const subject = toSubject(object);
      const label = object.identifier ?? object.id;

      switch (object.type) {
        case "REQUIREMENT":
          if (object.state === "OBSOLETE") {
            emit("CR-REQ-002", subject, `Requirement ${label} is OBSOLETE and can no longer ground this obligation.`);
          } else if (object.state === "DRAFT" || object.state === "IN_REVIEW") {
            emit("CR-REQ-001", subject, `Requirement ${label} is ${object.state}, so the statement it is tracked against can still move.`);
          } else if (object.state === "APPROVED" || object.state === "BASELINED") {
            emit("CR-REQ-003", subject, `Requirement ${label} is ${object.state}, so the statement is under configuration control.`);
          }
          break;
        case "ENGINEERING_DECISION":
          if (object.state === "REJECTED") {
            emit("CR-DEC-002", subject, `Decision ${label} is REJECTED and cannot ground this obligation.`);
          } else if (object.state === "PROPOSED" || object.state === "UNDER_REVIEW") {
            emit("CR-DEC-001", subject, `Decision ${label} is ${object.state} — not yet taken.`);
          } else if (object.state === "SUPERSEDED") {
            emit(
              "CR-DEC-003",
              subject,
              `Decision ${label} is SUPERSEDED. The decision record carries no successor-linkage field, so which decision now governs cannot be determined.`,
            );
          } else if (object.state === "APPROVED") {
            emit("CR-DEC-004", subject, `Decision ${label} is APPROVED.`);
          }
          break;
        case "DESIGN_ITEM":
          if (object.state === "OBSOLETE") {
            emit("CR-DES-001", subject, `Design item ${label} is OBSOLETE and can no longer ground this obligation.`);
          } else if (object.state === "DRAFT" || object.state === "IN_REVIEW") {
            emit("CR-DES-002", subject, `Design item ${label} is ${object.state}, so the configuration can still move.`);
          } else if (object.state === "APPROVED" || object.state === "BASELINED") {
            emit("CR-DES-003", subject, `Design item ${label} is ${object.state}, so the configuration is under control.`);
          }
          break;
        case "SUPPLIER_QUALIFICATION":
          if (object.state === "EXPIRED") {
            emit("CR-SUP-001", subject, `Supplier qualification "${truncate(object.label)}" is EXPIRED. Qualification status requires review.`);
          } else if (object.state === "WITHDRAWN") {
            emit("CR-SUP-002", subject, `Supplier qualification "${truncate(object.label)}" is WITHDRAWN. Qualification status requires review.`);
          } else if (object.state === "PLANNED" || object.state === "ACTIVE") {
            emit("CR-SUP-003", subject, `Supplier qualification "${truncate(object.label)}" is ${object.state}.`);
          }
          break;
        case "VERIFICATION_ACTIVITY": {
          const readiness = resolved.verificationReadiness.find(
            (entry) => entry.verificationActivityId === object.id,
          );
          if (!readiness || readiness.status === "NOT_EVALUATED") {
            emit("CR-VER-003", subject, `Verification activity ${label} has never been assessed for readiness.`);
          } else if (readiness.freshness === "STALE" || readiness.freshness === "UNKNOWN") {
            emit(
              "CR-VER-002",
              subject,
              `Verification activity ${label} has a readiness assessment that no longer reflects the current engineering state.`,
            );
          } else if (readiness.status === "NOT_READY") {
            emit("CR-VER-001", subject, `Verification activity ${label}'s most recent readiness assessment is NOT_READY.`);
          } else if (readiness.status === "READY") {
            emit("CR-VER-004", subject, `Verification activity ${label}'s most recent readiness assessment is READY.`);
          } else {
            emit("CR-VER-003", subject, `Verification activity ${label}'s readiness could not be determined.`);
          }
          break;
        }
        default:
          break;
      }
    }

    // --- Change impact ---
    for (const change of resolved.changeImpact) {
      const subject: FindingSubject = {
        type: "CHANGE_REQUEST",
        id: change.changeRequestId,
        identifier: change.identifier,
        label: change.identifier ?? change.changeRequestId,
      };
      const label = change.identifier ?? change.changeRequestId;

      if (change.analysisFreshness === "NOT_RUN") {
        emit("CR-CHG-003", subject, `Change request ${label} touches this basis's engineering linkage, and no completed impact analysis exists for it.`);
      } else if (change.analysisFreshness === "STALE" || change.analysisFreshness === "UNKNOWN") {
        emit("CR-CHG-002", subject, `Change request ${label}'s impact analysis no longer reflects the current engineering state.`);
      } else if (change.reachesLinkedObject) {
        emit("CR-CHG-001", subject, `Change request ${label}'s current impact analysis reaches an object this certification basis links to.`);
      }
    }

    // --- Drift ---
    for (const entry of resolved.drift) {
      const object = resolved.linkedObjects.find((o) => o.type === entry.subjectType && o.id === entry.subjectId);
      if (!object) continue;
      const subject = toSubject(object);
      const label = object.identifier ?? object.id;

      if (entry.status === "DRIFT_DETECTED") {
        emit("CR-DRF-001", subject, `The most recent drift assessment reports a finding concerning ${label}.`);
      } else if (entry.status === "UNKNOWN") {
        emit("CR-DRF-002", subject, `A drift assessment exists concerning ${label} but its status could not be determined.`);
      } else {
        emit("CR-DRF-003", subject, `The most recent drift assessment reports no drift concerning ${label}.`);
      }
    }

    // --- Assumption monitoring ---
    for (const assumption of resolved.assumptions) {
      const decision = resolved.linkedObjects.find(
        (object) => object.type === "ENGINEERING_DECISION" && object.id === assumption.decisionId,
      );
      if (!decision) continue;
      const subject = toSubject(decision);

      if (assumption.assumptionStatus === "INVALIDATED") {
        emit("CR-ASM-004", subject, `An assumption behind decision ${decision.identifier ?? decision.id} was recorded as INVALIDATED.`);
      }
      if (assumption.monitoringStatus === "REVIEW_REQUIRED") {
        emit("CR-ASM-001", subject, `Assumption monitoring reports REVIEW_REQUIRED for an assumption behind decision ${decision.identifier ?? decision.id}.`);
      } else if (assumption.monitoringStatus === "BASIS_CHANGED") {
        emit("CR-ASM-002", subject, `Assumption monitoring reports BASIS_CHANGED for an assumption behind decision ${decision.identifier ?? decision.id}.`);
      } else if (assumption.monitoringStatus === "NOT_EVALUATED") {
        emit("CR-ASM-003", subject, `An assumption behind decision ${decision.identifier ?? decision.id} has never been monitored.`);
      }
    }

    // --- Findings ---
    for (const finding of resolved.findings) {
      const subject: FindingSubject = {
        type: "CERTIFICATION_FINDING",
        id: finding.id,
        identifier: finding.identifier,
        label: finding.title,
      };
      if (isCertificationFindingOpen(finding.status as never)) {
        if (finding.severity === "HIGH" || finding.severity === "CRITICAL") {
          emit("CR-FND-001", subject, `Certification finding ${finding.identifier} is ${finding.status} with severity ${certificationFindingSeverityLabel(finding.severity as never)}.`);
        } else {
          emit("CR-FND-002", subject, `Certification finding ${finding.identifier} is ${finding.status} with severity ${certificationFindingSeverityLabel(finding.severity as never)}.`);
        }
      } else {
        emit("CR-FND-003", subject, `Certification finding ${finding.identifier} is ${finding.status}.`);
      }
    }

    return order(drafts);
  }
}

function linkedObjectRole(type: GraphNodeType): CertificationBasisObjectRole {
  switch (type) {
    case "REQUIREMENT":
      return "LINKED_REQUIREMENT";
    case "VERIFICATION_ACTIVITY":
      return "LINKED_VERIFICATION_ACTIVITY";
    case "ENGINEERING_DECISION":
      return "LINKED_ENGINEERING_DECISION";
    case "DESIGN_ITEM":
      return "LINKED_DESIGN_ITEM";
    case "RISK":
      return "LINKED_RISK";
    case "ISSUE":
      return "LINKED_ISSUE";
    case "SUPPLIER_QUALIFICATION":
      return "LINKED_SUPPLIER_QUALIFICATION";
    default:
      return "LINKED_EVIDENCE";
  }
}

function toSubject(object: LinkedObject): FindingSubject {
  return { type: object.type, id: object.id, identifier: object.identifier, label: object.label };
}

function order(drafts: DraftFinding[]): DraftFinding[] {
  return [...drafts]
    .sort(compareCertificationReviewFindings)
    .map((draft, index) => ({ ...draft, sequence: index }));
}

function tally(findings: readonly DraftFinding[]) {
  let blockingCount = 0;
  let warningCount = 0;
  let informationalCount = 0;
  let unknownCount = 0;
  for (const finding of findings) {
    if (finding.status === "BLOCKING") blockingCount += 1;
    else if (finding.status === "WARNING") warningCount += 1;
    else if (finding.status === "INFORMATIONAL") informationalCount += 1;
    else unknownCount += 1;
  }
  return {
    findingCount: findings.length,
    blockingCount,
    warningCount,
    informationalCount,
    unknownCount,
  };
}

function buildSummary(
  status: string,
  counts: { findingCount: number; blockingCount: number; warningCount: number },
): string {
  if (counts.findingCount === 0) {
    return "No compliance items have been evaluated yet.";
  }
  if (status === "NOT_READY") {
    return `${counts.blockingCount} blocking condition${counts.blockingCount === 1 ? "" : "s"} found across ${counts.findingCount} finding${counts.findingCount === 1 ? "" : "s"}.`;
  }
  if (status === "UNKNOWN") {
    return `Not enough information to judge readiness across ${counts.findingCount} finding${counts.findingCount === 1 ? "" : "s"}.`;
  }
  return `No blocking conditions found across ${counts.findingCount} finding${counts.findingCount === 1 ? "" : "s"} (${counts.warningCount} warning${counts.warningCount === 1 ? "" : "s"}).`;
}

function truncate(value: string, max = 120): string {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}…`;
}

export const certificationReviewService = new CertificationReviewService();
