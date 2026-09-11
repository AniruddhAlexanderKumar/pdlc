import type {
  DriftAssessment,
  DriftBasisMarker,
  DriftCategory,
  DriftEvaluationBasis,
  DriftFinding,
  DriftFindingStatus,
  DriftSeverity,
  DriftStatus,
  DriftSubject,
} from "@/domain";
import { type DbClient, prisma } from "@/lib/db";

/**
 * Drift assessment and finding persistence.
 *
 * **Immutable by construction.** There is no update and no delete. An assessment
 * and its findings are written once, inside one transaction, and re-evaluating
 * appends a new assessment rather than replacing its predecessor. That is what
 * makes drift usable as engineering evidence months later: "what had diverged on
 * the day we decided to fly?" has an answer.
 *
 * Freshness is deliberately not a column. It is recomputed at read time by the
 * service and compared against the stored fingerprint, because storing it would
 * mean mutating a record that must not change.
 *
 * Every read is project-scoped. An assessment id guessed from another project —
 * or another organization — resolves to nothing rather than to someone else's
 * drift result.
 */

const ASSESSMENT_SELECT = {
  id: true,
  projectId: true,
  baselineId: true,
  status: true,
  driftVersion: true,
  fingerprint: true,
  basis: true,
  findingCount: true,
  reviewRequiredCount: true,
  informationalCount: true,
  unknownCount: true,
  evaluatedAt: true,
  evaluatedById: true,
  createdAt: true,
} as const;

interface AssessmentRow {
  id: string;
  projectId: string;
  baselineId: string;
  status: DriftStatus;
  driftVersion: string;
  fingerprint: string;
  basis: unknown;
  findingCount: number;
  reviewRequiredCount: number;
  informationalCount: number;
  unknownCount: number;
  evaluatedAt: Date;
  evaluatedById: string | null;
  createdAt: Date;
}

function toAssessment(row: AssessmentRow): DriftAssessment {
  return {
    id: row.id,
    projectId: row.projectId,
    baselineId: row.baselineId,
    status: row.status,
    driftVersion: row.driftVersion,
    fingerprint: row.fingerprint,
    summary: {
      findings: row.findingCount,
      reviewRequired: row.reviewRequiredCount,
      informational: row.informationalCount,
      unknown: row.unknownCount,
    },
    evaluatedAt: row.evaluatedAt,
    evaluatedById: row.evaluatedById,
    createdAt: row.createdAt,
  };
}

/**
 * The persisted basis, read back defensively.
 *
 * An assessment written by an older version may not carry every section, and a
 * missing one must read as "nothing recorded" rather than crashing a historical
 * report a reader is entitled to see.
 */
function toBasis(baselineId: string, value: unknown): DriftEvaluationBasis {
  const raw = (value ?? {}) as Partial<DriftEvaluationBasis>;
  return {
    baselineId: raw.baselineId ?? baselineId,
    baselineIdentifier: raw.baselineIdentifier ?? "",
    baselineName: raw.baselineName ?? "",
    baselineStatus: raw.baselineStatus ?? "ACTIVE",
    members: raw.members ?? [],
    observations: raw.observations ?? [],
  };
}

/**
 * Newest first, with the row id breaking ties.
 *
 * Two evaluations can land in the same millisecond; without the id, "latest"
 * would be whichever row PostgreSQL happened to return first.
 */
const NEWEST_FIRST = [{ evaluatedAt: "desc" as const }, { id: "desc" as const }];

export interface CreateDriftAssessmentInput {
  projectId: string;
  baselineId: string;
  status: DriftStatus;
  driftVersion: string;
  fingerprint: string;
  basis: DriftEvaluationBasis;
  evaluatedById: string | null;
  findingCount: number;
  reviewRequiredCount: number;
  informationalCount: number;
  unknownCount: number;
}

/**
 * Writes one drift assessment.
 *
 * Written complete rather than opened and later closed: evaluation is
 * synchronous and either produces a whole verdict or throws, so there is no
 * partial state an in-progress row could honestly represent.
 */
export async function createAssessment(
  input: CreateDriftAssessmentInput,
  client: DbClient = prisma,
): Promise<DriftAssessment> {
  const row = await client.driftAssessment.create({
    data: {
      projectId: input.projectId,
      baselineId: input.baselineId,
      status: input.status,
      driftVersion: input.driftVersion,
      fingerprint: input.fingerprint,
      basis: input.basis as never,
      evaluatedById: input.evaluatedById,
      findingCount: input.findingCount,
      reviewRequiredCount: input.reviewRequiredCount,
      informationalCount: input.informationalCount,
      unknownCount: input.unknownCount,
    },
    select: ASSESSMENT_SELECT,
  });
  return toAssessment(row);
}

export interface PersistDriftFindingInput {
  ruleId: string;
  category: DriftCategory;
  status: DriftFindingStatus;
  severity: DriftSeverity;
  baselineSubject: DriftSubject | null;
  observationSubject: DriftSubject | null;
  expectedValue: string | null;
  observedValue: string | null;
  explanation: string;
  basis: DriftBasisMarker[];
  sequence: number;
}

/**
 * Bulk-inserts the findings.
 *
 * One statement rather than one per finding: a real baseline over a real
 * programme produces many, and a per-row round trip inside a transaction is how
 * an evaluation starts holding locks.
 */
export async function createFindings(
  assessmentId: string,
  findings: readonly PersistDriftFindingInput[],
  client: DbClient = prisma,
): Promise<number> {
  if (findings.length === 0) return 0;

  const result = await client.driftFinding.createMany({
    data: findings.map((finding) => ({
      assessmentId,
      ruleId: finding.ruleId,
      category: finding.category,
      status: finding.status,
      severity: finding.severity,
      baselineSubjectType: finding.baselineSubject?.type ?? null,
      baselineSubjectId: finding.baselineSubject?.id ?? null,
      baselineSubjectIdentifier: finding.baselineSubject?.identifier ?? null,
      baselineSubjectLabel: finding.baselineSubject?.label ?? null,
      observationSubjectType: finding.observationSubject?.type ?? null,
      observationSubjectId: finding.observationSubject?.id ?? null,
      observationSubjectIdentifier: finding.observationSubject?.identifier ?? null,
      observationSubjectLabel: finding.observationSubject?.label ?? null,
      expectedValue: finding.expectedValue,
      observedValue: finding.observedValue,
      explanation: finding.explanation,
      basis: finding.basis,
      sequence: finding.sequence,
    })),
  });
  return result.count;
}

export async function findLatestAssessment(
  projectId: string,
  baselineId: string | undefined,
  client: DbClient = prisma,
): Promise<DriftAssessment | null> {
  const row = await client.driftAssessment.findFirst({
    where: { projectId, ...(baselineId ? { baselineId } : {}) },
    orderBy: NEWEST_FIRST,
    select: ASSESSMENT_SELECT,
  });
  return row ? toAssessment(row) : null;
}

/** Assessments for one project, newest first. Nothing is ever removed. */
export async function listAssessments(
  projectId: string,
  baselineId: string | undefined,
  client: DbClient = prisma,
): Promise<DriftAssessment[]> {
  const rows = await client.driftAssessment.findMany({
    where: { projectId, ...(baselineId ? { baselineId } : {}) },
    orderBy: NEWEST_FIRST,
    select: ASSESSMENT_SELECT,
  });
  return rows.map(toAssessment);
}

/**
 * One assessment by id, scoped by project.
 *
 * An id from another project — or another organization, since the project has
 * already been proved to belong to the caller's — is simply not found.
 */
export async function findAssessmentInProject(
  projectId: string,
  assessmentId: string,
  client: DbClient = prisma,
): Promise<DriftAssessment | null> {
  const row = await client.driftAssessment.findFirst({
    where: { id: assessmentId, projectId },
    select: ASSESSMENT_SELECT,
  });
  return row ? toAssessment(row) : null;
}

/** The basis snapshot stored with an assessment, project-scoped. */
export async function readAssessmentBasis(
  assessment: DriftAssessment,
  client: DbClient = prisma,
): Promise<DriftEvaluationBasis> {
  const row = await client.driftAssessment.findFirst({
    where: { id: assessment.id, projectId: assessment.projectId },
    select: { baselineId: true, basis: true },
  });
  return toBasis(assessment.baselineId, row?.basis ?? null);
}

/**
 * In-flight changes that already declare an effect on the given objects.
 *
 * **Consumed, never computed.** This reads the declared-impact rows an engineer
 * entered on a change request; it does not run a change-impact analysis, read
 * one's findings, or judge whether one is current. An object that drifted may
 * have drifted through an open change request, which is the well-governed case,
 * and surfacing that saves a reader a search — but the change engine remains the
 * change engine.
 *
 * One query for the whole set, keyed `TYPE:id`.
 */
export async function loadChangeContext(
  projectId: string,
  refs: readonly { nodeType: string; nodeId: string }[],
  client: DbClient = prisma,
): Promise<Map<string, Array<{ changeRequestId: string; identifier: string; status: string }>>> {
  const idsOf = (type: string): string[] => [
    ...new Set(refs.filter((ref) => ref.nodeType === type).map((ref) => ref.nodeId)),
  ];

  const branches: Record<string, { in: string[] }>[] = [];
  const push = (column: string, type: string) => {
    const ids = idsOf(type);
    if (ids.length > 0) branches.push({ [column]: { in: ids } });
  };
  push("requirementId", "REQUIREMENT");
  push("designItemId", "DESIGN_ITEM");
  push("engineeringDecisionId", "ENGINEERING_DECISION");
  push("verificationActivityId", "VERIFICATION_ACTIVITY");
  push("suppliedItemId", "SUPPLIED_ITEM");

  const context = new Map<
    string,
    Array<{ changeRequestId: string; identifier: string; status: string }>
  >();
  if (branches.length === 0) return context;

  const rows = await client.changeRequestImpact.findMany({
    where: {
      changeRequest: {
        projectId,
        // Terminal changes have concluded: their effect is in the artifacts
        // now, not pending against them, so they are not useful context.
        status: { in: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED"] },
      },
      OR: branches,
    },
    select: {
      requirementId: true,
      designItemId: true,
      engineeringDecisionId: true,
      verificationActivityId: true,
      suppliedItemId: true,
      changeRequest: { select: { id: true, identifier: true, status: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  for (const row of rows) {
    const key =
      (row.requirementId && `REQUIREMENT:${row.requirementId}`) ||
      (row.designItemId && `DESIGN_ITEM:${row.designItemId}`) ||
      (row.engineeringDecisionId && `ENGINEERING_DECISION:${row.engineeringDecisionId}`) ||
      (row.verificationActivityId &&
        `VERIFICATION_ACTIVITY:${row.verificationActivityId}`) ||
      (row.suppliedItemId && `SUPPLIED_ITEM:${row.suppliedItemId}`);
    if (!key) continue;

    const existing = context.get(key) ?? [];
    existing.push({
      changeRequestId: row.changeRequest.id,
      identifier: row.changeRequest.identifier,
      status: row.changeRequest.status,
    });
    context.set(key, existing);
  }

  return context;
}

/**
 * Findings for one assessment.
 *
 * Ordered in SQL by the sequence written with the rows, so the list is stable
 * before the service touches it — nothing depends on PostgreSQL's row order.
 */
export async function listFindings(
  assessmentId: string,
  client: DbClient = prisma,
): Promise<DriftFinding[]> {
  const rows = await client.driftFinding.findMany({
    where: { assessmentId },
    orderBy: [{ sequence: "asc" }, { id: "asc" }],
  });

  return rows.map((row) => ({
    id: row.id,
    assessmentId: row.assessmentId,
    ruleId: row.ruleId,
    category: row.category,
    status: row.status,
    severity: row.severity,
    baselineSubject:
      row.baselineSubjectType && row.baselineSubjectId
        ? {
            type: row.baselineSubjectType,
            id: row.baselineSubjectId,
            identifier: row.baselineSubjectIdentifier,
            label: row.baselineSubjectLabel ?? "",
          }
        : null,
    observationSubject:
      row.observationSubjectType && row.observationSubjectId
        ? {
            type: row.observationSubjectType,
            id: row.observationSubjectId,
            identifier: row.observationSubjectIdentifier,
            label: row.observationSubjectLabel ?? "",
          }
        : null,
    expectedValue: row.expectedValue,
    observedValue: row.observedValue,
    explanation: row.explanation,
    basis: (row.basis as DriftBasisMarker[]) ?? [],
    sequence: row.sequence,
    createdAt: row.createdAt,
  }));
}
