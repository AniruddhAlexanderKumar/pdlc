import type {
  GraphNodeType,
  ReadinessBasisChange,
  ReadinessBasisMonitoring,
  ReadinessBasisObject,
  ReadinessBasisRelationship,
  VerificationReadinessAssessment,
  VerificationReadinessBasis,
  VerificationReadinessBasisMarker,
  VerificationReadinessCategory,
  VerificationReadinessFinding,
  VerificationReadinessFindingStatus,
  VerificationReadinessScope,
  VerificationReadinessSeverity,
  VerificationReadinessStatus,
} from "@/domain";
import { type DbClient, prisma } from "@/lib/db";

/**
 * Verification readiness persistence.
 *
 * **Immutable by construction.** There is no update and no delete here. An
 * assessment and its findings are written once, inside one transaction, and a
 * re-evaluation appends a new assessment rather than replacing its predecessor.
 * That is what makes "what did we believe on the day we signed this off, and
 * why?" answerable months later.
 *
 * Freshness is deliberately not a column. It is recomputed at read time by the
 * service and compared against the stored fingerprint, because storing it would
 * mean mutating a record that must not change.
 *
 * Every read is project-scoped. An assessment id guessed from another project —
 * or another organization — resolves to nothing rather than to someone else's
 * result.
 */

const ASSESSMENT_SELECT = {
  id: true,
  projectId: true,
  verificationActivityId: true,
  status: true,
  scope: true,
  readinessVersion: true,
  fingerprint: true,
  basis: true,
  findingCount: true,
  blockingCount: true,
  warningCount: true,
  informationalCount: true,
  unknownCount: true,
  evaluatedAt: true,
  evaluatedById: true,
  createdAt: true,
} as const;

interface AssessmentRow {
  id: string;
  projectId: string;
  verificationActivityId: string;
  status: VerificationReadinessStatus;
  scope: VerificationReadinessScope;
  readinessVersion: string;
  fingerprint: string;
  basis: unknown;
  findingCount: number;
  blockingCount: number;
  warningCount: number;
  informationalCount: number;
  unknownCount: number;
  evaluatedAt: Date;
  evaluatedById: string | null;
  createdAt: Date;
}

function toAssessment(row: AssessmentRow): VerificationReadinessAssessment {
  return {
    id: row.id,
    projectId: row.projectId,
    verificationActivityId: row.verificationActivityId,
    status: row.status,
    scope: row.scope,
    readinessVersion: row.readinessVersion,
    fingerprint: row.fingerprint,
    summary: {
      findings: row.findingCount,
      blocking: row.blockingCount,
      warning: row.warningCount,
      informational: row.informationalCount,
      unknown: row.unknownCount,
    },
    evaluatedAt: row.evaluatedAt,
    evaluatedById: row.evaluatedById,
    createdAt: row.createdAt,
  };
}

/**
 * The persisted basis snapshot, read back defensively.
 *
 * An assessment written by an older version may not carry every section, and a
 * missing section must read as "nothing recorded" rather than crashing a
 * historical report that a reader is entitled to see.
 */
function toBasis(
  verificationActivityId: string,
  scope: VerificationReadinessScope,
  value: unknown,
): VerificationReadinessBasis {
  const raw = (value ?? {}) as Partial<VerificationReadinessBasis>;
  return {
    verificationActivityId: raw.verificationActivityId ?? verificationActivityId,
    scope: raw.scope ?? scope,
    objects: (raw.objects as ReadinessBasisObject[] | undefined) ?? [],
    relationships: (raw.relationships as ReadinessBasisRelationship[] | undefined) ?? [],
    monitoring: (raw.monitoring as ReadinessBasisMonitoring[] | undefined) ?? [],
    changes: (raw.changes as ReadinessBasisChange[] | undefined) ?? [],
  };
}

/**
 * Newest first, with the row id breaking ties.
 *
 * Two evaluations can land in the same millisecond; without the id, "latest"
 * would be whichever row PostgreSQL happened to return first.
 */
const NEWEST_FIRST = [{ evaluatedAt: "desc" as const }, { id: "desc" as const }];

export interface CreateReadinessAssessmentInput {
  projectId: string;
  verificationActivityId: string;
  status: VerificationReadinessStatus;
  scope: VerificationReadinessScope;
  readinessVersion: string;
  fingerprint: string;
  basis: VerificationReadinessBasis;
  evaluatedById: string | null;
  findingCount: number;
  blockingCount: number;
  warningCount: number;
  informationalCount: number;
  unknownCount: number;
}

/**
 * Writes one assessment.
 *
 * Written complete rather than opened and later closed: evaluation is
 * synchronous and either produces a whole verdict or throws, so there is no
 * partial state an in-progress row could honestly represent.
 */
export async function createAssessment(
  input: CreateReadinessAssessmentInput,
  client: DbClient = prisma,
): Promise<VerificationReadinessAssessment> {
  const row = await client.verificationReadinessAssessment.create({
    data: {
      projectId: input.projectId,
      verificationActivityId: input.verificationActivityId,
      status: input.status,
      scope: input.scope,
      readinessVersion: input.readinessVersion,
      fingerprint: input.fingerprint,
      basis: input.basis as never,
      evaluatedById: input.evaluatedById,
      findingCount: input.findingCount,
      blockingCount: input.blockingCount,
      warningCount: input.warningCount,
      informationalCount: input.informationalCount,
      unknownCount: input.unknownCount,
    },
    select: ASSESSMENT_SELECT,
  });
  return toAssessment(row);
}

export interface PersistReadinessFindingInput {
  ruleId: string;
  category: VerificationReadinessCategory;
  status: VerificationReadinessFindingStatus;
  severity: VerificationReadinessSeverity;
  subjectType: GraphNodeType;
  subjectId: string;
  subjectIdentifier: string | null;
  subjectLabel: string;
  message: string;
  basis: VerificationReadinessBasisMarker[];
  sequence: number;
}

/**
 * Bulk-inserts the findings.
 *
 * One statement rather than one per finding: an activity with several
 * requirements and decisions produces a dozen or more, and a per-row round trip
 * inside a transaction is how an evaluation starts holding locks.
 */
export async function createFindings(
  assessmentId: string,
  findings: readonly PersistReadinessFindingInput[],
  client: DbClient = prisma,
): Promise<number> {
  if (findings.length === 0) return 0;

  const result = await client.verificationReadinessFinding.createMany({
    data: findings.map((finding) => ({
      assessmentId,
      ruleId: finding.ruleId,
      category: finding.category,
      status: finding.status,
      severity: finding.severity,
      subjectType: finding.subjectType,
      subjectId: finding.subjectId,
      subjectIdentifier: finding.subjectIdentifier,
      subjectLabel: finding.subjectLabel,
      message: finding.message,
      basis: finding.basis,
      sequence: finding.sequence,
    })),
  });
  return result.count;
}

/** The most recent assessment for one activity, scoped to its project. */
export async function findLatestAssessment(
  projectId: string,
  verificationActivityId: string,
  client: DbClient = prisma,
): Promise<VerificationReadinessAssessment | null> {
  const row = await client.verificationReadinessAssessment.findFirst({
    where: { projectId, verificationActivityId },
    orderBy: NEWEST_FIRST,
    select: ASSESSMENT_SELECT,
  });
  return row ? toAssessment(row) : null;
}

/** Every assessment for one activity, newest first. Nothing is ever removed. */
export async function listAssessments(
  projectId: string,
  verificationActivityId: string,
  client: DbClient = prisma,
): Promise<VerificationReadinessAssessment[]> {
  const rows = await client.verificationReadinessAssessment.findMany({
    where: { projectId, verificationActivityId },
    orderBy: NEWEST_FIRST,
    select: ASSESSMENT_SELECT,
  });
  return rows.map(toAssessment);
}

/**
 * Every assessment in the project, across every activity — for the
 * Engineering History workspace only. Bounded: this feeds a history stream,
 * not an unbounded export.
 */
export async function listAllForProject(
  projectId: string,
  limit = 200,
  client: DbClient = prisma,
): Promise<VerificationReadinessAssessment[]> {
  const rows = await client.verificationReadinessAssessment.findMany({
    where: { projectId },
    orderBy: NEWEST_FIRST,
    take: limit,
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
): Promise<VerificationReadinessAssessment | null> {
  const row = await client.verificationReadinessAssessment.findFirst({
    where: { id: assessmentId, projectId },
    select: ASSESSMENT_SELECT,
  });
  return row ? toAssessment(row) : null;
}

/** The basis snapshot stored with an assessment, project-scoped. */
export async function findAssessmentBasis(
  projectId: string,
  assessmentId: string,
  client: DbClient = prisma,
): Promise<VerificationReadinessBasis | null> {
  const row = await client.verificationReadinessAssessment.findFirst({
    where: { id: assessmentId, projectId },
    select: { verificationActivityId: true, scope: true, basis: true },
  });
  if (!row) return null;
  return toBasis(row.verificationActivityId, row.scope, row.basis);
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
): Promise<VerificationReadinessFinding[]> {
  const rows = await client.verificationReadinessFinding.findMany({
    where: { assessmentId },
    orderBy: [{ sequence: "asc" }, { id: "asc" }],
    select: {
      id: true,
      assessmentId: true,
      ruleId: true,
      category: true,
      status: true,
      severity: true,
      subjectType: true,
      subjectId: true,
      subjectIdentifier: true,
      subjectLabel: true,
      message: true,
      basis: true,
      sequence: true,
      createdAt: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    assessmentId: row.assessmentId,
    ruleId: row.ruleId,
    category: row.category,
    status: row.status,
    severity: row.severity,
    subjectType: row.subjectType as GraphNodeType,
    subjectId: row.subjectId,
    subjectIdentifier: row.subjectIdentifier,
    subjectLabel: row.subjectLabel,
    message: row.message,
    basis: (row.basis as VerificationReadinessBasisMarker[]) ?? [],
    sequence: row.sequence,
    createdAt: row.createdAt,
  }));
}

/** The persisted basis for an assessment already proved to be in scope. */
export async function readAssessmentBasis(
  assessment: VerificationReadinessAssessment,
  client: DbClient = prisma,
): Promise<VerificationReadinessBasis> {
  const basis = await findAssessmentBasis(assessment.projectId, assessment.id, client);
  return basis ?? toBasis(assessment.verificationActivityId, assessment.scope, null);
}

/**
 * The persisted basis for the latest assessment of each of several
 * activities, in one pass.
 *
 * The same shape as {@link findLatestForActivities} — one query rather than
 * one per activity — for callers that need each activity's last-recorded
 * basis rather than the assessment summary itself (Sentinel's dependency
 * resolution, so far). `findLatestForActivities` cannot serve this directly:
 * its `AssessmentRow`/`VerificationReadinessAssessment` shape deliberately
 * drops the `basis` column (it is the readiness detail, not the summary), so
 * reading it back required a second per-row query until this existed.
 */
export async function findLatestBasisForActivities(
  projectId: string,
  verificationActivityIds: readonly string[],
  client: DbClient = prisma,
): Promise<Map<string, VerificationReadinessBasis>> {
  if (verificationActivityIds.length === 0) return new Map();

  const rows = await client.verificationReadinessAssessment.findMany({
    where: { projectId, verificationActivityId: { in: [...verificationActivityIds] } },
    orderBy: NEWEST_FIRST,
    select: { verificationActivityId: true, scope: true, basis: true },
  });

  const latest = new Map<string, VerificationReadinessBasis>();
  for (const row of rows) {
    if (!latest.has(row.verificationActivityId)) {
      latest.set(row.verificationActivityId, toBasis(row.verificationActivityId, row.scope, row.basis));
    }
  }
  return latest;
}

/**
 * The latest assessment for each of several activities, in one pass.
 *
 * The verification list needs to show what was last recorded per activity and
 * must not issue a query per row. Reads the assessments for the named
 * activities newest-first and keeps the first of each.
 *
 * Note what this deliberately does **not** do: it derives no freshness. Working
 * out whether an assessment still holds means recomputing that activity's
 * basis, which is exactly the per-row work this exists to avoid — so callers
 * must present these as "last recorded", never as current.
 */
export async function findLatestForActivities(
  projectId: string,
  verificationActivityIds: readonly string[],
  client: DbClient = prisma,
): Promise<Map<string, VerificationReadinessAssessment>> {
  if (verificationActivityIds.length === 0) return new Map();

  const rows = await client.verificationReadinessAssessment.findMany({
    where: { projectId, verificationActivityId: { in: [...verificationActivityIds] } },
    orderBy: NEWEST_FIRST,
    select: ASSESSMENT_SELECT,
  });

  const latest = new Map<string, VerificationReadinessAssessment>();
  for (const row of rows) {
    if (!latest.has(row.verificationActivityId)) {
      latest.set(row.verificationActivityId, toAssessment(row));
    }
  }
  return latest;
}
