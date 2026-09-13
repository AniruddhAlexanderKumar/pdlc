import type {
  GraphNodeType,
  TechnicalReadinessAssessment,
  TechnicalReadinessBasisMarker,
  TechnicalReadinessCategory,
  TechnicalReadinessFinding,
  TechnicalReadinessFindingStatus,
  TechnicalReadinessGate,
  TechnicalReadinessScope,
  TechnicalReadinessSeverity,
  TechnicalReadinessStatus,
} from "@/domain";
import { ACTIVE_SCOPE_LABEL, emptyScopeCounts } from "@/domain";
import { type DbClient, prisma } from "@/lib/db";

/**
 * Technical readiness persistence.
 *
 * **Immutable by construction.** There is no update and no delete here. An
 * assessment and its findings are written once, inside one transaction, and
 * re-evaluating a gate appends a new assessment rather than replacing its
 * predecessor. That is what makes a gate assessment usable as evidence months
 * later: "what did the record look like on the day we held design freeze?"
 *
 * Freshness is deliberately not a column. It is recomputed at read time by the
 * service and compared against the stored fingerprint, because storing it would
 * mean mutating a record that must not change.
 *
 * Every read is project-scoped. An assessment id guessed from another project —
 * or another organization — resolves to nothing rather than to someone else's
 * gate result.
 *
 * Deliberately not generic: this owns technical-readiness rows only. Verification
 * readiness has its own repository, and folding both into one "readiness store"
 * would couple two rule sets that must be able to change independently.
 */

const ASSESSMENT_SELECT = {
  id: true,
  projectId: true,
  gate: true,
  status: true,
  readinessVersion: true,
  fingerprint: true,
  scope: true,
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
  gate: TechnicalReadinessGate;
  status: TechnicalReadinessStatus;
  readinessVersion: string;
  fingerprint: string;
  scope: unknown;
  findingCount: number;
  blockingCount: number;
  warningCount: number;
  informationalCount: number;
  unknownCount: number;
  evaluatedAt: Date;
  evaluatedById: string | null;
  createdAt: Date;
}

function toAssessment(row: AssessmentRow): TechnicalReadinessAssessment {
  return {
    id: row.id,
    projectId: row.projectId,
    gate: row.gate,
    status: row.status,
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
 * The persisted scope snapshot, read back defensively.
 *
 * An assessment written by an older version may not carry every section, and a
 * missing one must read as "nothing recorded" rather than crashing a historical
 * report a reader is entitled to see.
 */
function toScope(gate: TechnicalReadinessGate, value: unknown): TechnicalReadinessScope {
  const raw = (value ?? {}) as Partial<TechnicalReadinessScope>;
  const consumed: Partial<TechnicalReadinessScope["consumed"]> = raw.consumed ?? {};

  return {
    gate: raw.gate ?? gate,
    label: raw.label ?? ACTIVE_SCOPE_LABEL,
    counts: raw.counts ?? emptyScopeCounts(),
    objects: raw.objects ?? [],
    relationships: raw.relationships ?? [],
    consumed: {
      verificationReadiness: consumed.verificationReadiness ?? [],
      changeImpact: consumed.changeImpact ?? [],
      assumptionMonitoring: consumed.assumptionMonitoring ?? [],
    },
  };
}

/**
 * Newest first, with the row id breaking ties.
 *
 * Two evaluations of the same gate can land in the same millisecond; without
 * the id, "latest" would be whichever row PostgreSQL happened to return first.
 */
const NEWEST_FIRST = [{ evaluatedAt: "desc" as const }, { id: "desc" as const }];

export interface CreateTechnicalAssessmentInput {
  projectId: string;
  gate: TechnicalReadinessGate;
  status: TechnicalReadinessStatus;
  readinessVersion: string;
  fingerprint: string;
  scope: TechnicalReadinessScope;
  evaluatedById: string | null;
  findingCount: number;
  blockingCount: number;
  warningCount: number;
  informationalCount: number;
  unknownCount: number;
}

/**
 * Writes one gate assessment.
 *
 * Written complete rather than opened and later closed: evaluation is
 * synchronous and either produces a whole verdict or throws, so there is no
 * partial state an in-progress row could honestly represent.
 */
export async function createAssessment(
  input: CreateTechnicalAssessmentInput,
  client: DbClient = prisma,
): Promise<TechnicalReadinessAssessment> {
  const row = await client.technicalReadinessAssessment.create({
    data: {
      projectId: input.projectId,
      gate: input.gate,
      status: input.status,
      readinessVersion: input.readinessVersion,
      fingerprint: input.fingerprint,
      scope: input.scope as never,
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

export interface PersistTechnicalFindingInput {
  ruleId: string;
  category: TechnicalReadinessCategory;
  status: TechnicalReadinessFindingStatus;
  severity: TechnicalReadinessSeverity;
  subjectType: GraphNodeType;
  subjectId: string;
  subjectIdentifier: string | null;
  subjectLabel: string;
  message: string;
  basis: TechnicalReadinessBasisMarker[];
  sequence: number;
}

/**
 * Bulk-inserts the findings.
 *
 * One statement rather than one per finding: a project-wide gate over a real
 * programme produces many, and a per-row round trip inside a transaction is how
 * an evaluation starts holding locks.
 */
export async function createFindings(
  assessmentId: string,
  findings: readonly PersistTechnicalFindingInput[],
  client: DbClient = prisma,
): Promise<number> {
  if (findings.length === 0) return 0;

  const result = await client.technicalReadinessFinding.createMany({
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

/** The most recent assessment of one gate, scoped to its project. */
export async function findLatestAssessment(
  projectId: string,
  gate: TechnicalReadinessGate,
  client: DbClient = prisma,
): Promise<TechnicalReadinessAssessment | null> {
  const row = await client.technicalReadinessAssessment.findFirst({
    where: { projectId, gate },
    orderBy: NEWEST_FIRST,
    select: ASSESSMENT_SELECT,
  });
  return row ? toAssessment(row) : null;
}

/**
 * Assessments for one project, newest first. Nothing is ever removed.
 *
 * Gate-filtered when one is given: the history a reader wants is normally "how
 * has this gate moved?", not an interleaving of five different questions.
 */
export async function listAssessments(
  projectId: string,
  gate: TechnicalReadinessGate | undefined,
  client: DbClient = prisma,
): Promise<TechnicalReadinessAssessment[]> {
  const rows = await client.technicalReadinessAssessment.findMany({
    where: { projectId, ...(gate ? { gate } : {}) },
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
): Promise<TechnicalReadinessAssessment | null> {
  const row = await client.technicalReadinessAssessment.findFirst({
    where: { id: assessmentId, projectId },
    select: ASSESSMENT_SELECT,
  });
  return row ? toAssessment(row) : null;
}

/** The scope snapshot stored with an assessment, project-scoped. */
export async function findAssessmentScope(
  projectId: string,
  assessmentId: string,
  client: DbClient = prisma,
): Promise<TechnicalReadinessScope | null> {
  const row = await client.technicalReadinessAssessment.findFirst({
    where: { id: assessmentId, projectId },
    select: { gate: true, scope: true },
  });
  if (!row) return null;
  return toScope(row.gate, row.scope);
}

/** The persisted scope for an assessment already proved to be in scope. */
export async function readAssessmentScope(
  assessment: TechnicalReadinessAssessment,
  client: DbClient = prisma,
): Promise<TechnicalReadinessScope> {
  const scope = await findAssessmentScope(assessment.projectId, assessment.id, client);
  return scope ?? toScope(assessment.gate, null);
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
): Promise<TechnicalReadinessFinding[]> {
  const rows = await client.technicalReadinessFinding.findMany({
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
    basis: (row.basis as TechnicalReadinessBasisMarker[]) ?? [],
    sequence: row.sequence,
    createdAt: row.createdAt,
  }));
}

/**
 * The latest assessment for each gate, in one pass.
 *
 * The project page shows a gate selector and needs to know which gates have ever
 * been evaluated without issuing a query per gate. Reads the project's
 * assessments newest-first and keeps the first of each gate.
 *
 * Note what this deliberately does **not** do: it derives no freshness. Working
 * out whether an assessment still holds means re-resolving that gate's scope,
 * which is exactly the per-gate work this exists to avoid — so callers must
 * present these as "last recorded", never as current.
 */
export async function findLatestPerGate(
  projectId: string,
  client: DbClient = prisma,
): Promise<Map<TechnicalReadinessGate, TechnicalReadinessAssessment>> {
  const rows = await client.technicalReadinessAssessment.findMany({
    where: { projectId },
    orderBy: NEWEST_FIRST,
    select: ASSESSMENT_SELECT,
  });

  const latest = new Map<TechnicalReadinessGate, TechnicalReadinessAssessment>();
  for (const row of rows) {
    if (!latest.has(row.gate)) latest.set(row.gate, toAssessment(row));
  }
  return latest;
}

/**
 * The persisted scope for the latest assessment of each gate, in one pass.
 *
 * The same shape as {@link findLatestPerGate} — one query rather than one per
 * gate — for callers that need each gate's last-recorded scope rather than
 * the assessment summary (Sentinel's dependency resolution, so far).
 * `findLatestPerGate` cannot serve this directly: its mapped
 * `TechnicalReadinessAssessment` deliberately drops the `scope` column, so
 * reading it back required a second per-gate query until this existed.
 */
export async function findLatestScopeForGates(
  projectId: string,
  client: DbClient = prisma,
): Promise<Map<TechnicalReadinessGate, TechnicalReadinessScope>> {
  const rows = await client.technicalReadinessAssessment.findMany({
    where: { projectId },
    orderBy: NEWEST_FIRST,
    select: { gate: true, scope: true },
  });

  const latest = new Map<TechnicalReadinessGate, TechnicalReadinessScope>();
  for (const row of rows) {
    if (!latest.has(row.gate)) latest.set(row.gate, toScope(row.gate, row.scope));
  }
  return latest;
}
