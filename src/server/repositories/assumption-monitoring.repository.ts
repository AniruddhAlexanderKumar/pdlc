import type {
  AssumptionMonitoringFinding,
  AssumptionMonitoringKind,
  AssumptionMonitoringRecord,
  AssumptionMonitoringStatus,
  AssumptionStatus,
  BasisChange,
  BasisObject,
} from "@/domain";
import { type DbClient, prisma } from "@/lib/db";

/**
 * Assumption monitoring history.
 *
 * **Append-only.** There is no update and no delete here: an evaluation and a
 * review are both new rows, and a review never rewrites the evaluation that
 * prompted it. That is what makes the history reproducible — a reader can see
 * that the basis changed *and* what a person subsequently decided, rather than
 * only the outcome.
 *
 * Every read is scoped through the assumption's parent decision to a project,
 * so an assumption id guessed from another project resolves to nothing.
 */

const RECORD_SELECT = {
  id: true,
  assumptionId: true,
  kind: true,
  status: true,
  finding: true,
  basisFingerprint: true,
  decisionFingerprint: true,
  evidenceFingerprint: true,
  linkedFingerprint: true,
  basisSnapshot: true,
  changedObjects: true,
  assumptionStatus: true,
  monitoredAt: true,
  reviewNote: true,
  reviewedAt: true,
  statusBefore: true,
  statusAfter: true,
  createdAt: true,
  actor: { select: { id: true, name: true } },
} as const;

interface RecordRow {
  id: string;
  assumptionId: string;
  kind: AssumptionMonitoringKind;
  status: Exclude<AssumptionMonitoringStatus, "NOT_EVALUATED">;
  finding: AssumptionMonitoringFinding;
  basisFingerprint: string;
  decisionFingerprint: string;
  evidenceFingerprint: string;
  linkedFingerprint: string;
  basisSnapshot: unknown;
  changedObjects: unknown;
  assumptionStatus: AssumptionStatus;
  monitoredAt: Date;
  reviewNote: string | null;
  reviewedAt: Date | null;
  statusBefore: AssumptionStatus | null;
  statusAfter: AssumptionStatus | null;
  createdAt: Date;
  actor: { id: string; name: string } | null;
}

function toRecord(row: RecordRow): AssumptionMonitoringRecord {
  return {
    id: row.id,
    assumptionId: row.assumptionId,
    kind: row.kind,
    status: row.status,
    finding: row.finding,
    basisFingerprint: row.basisFingerprint,
    decisionFingerprint: row.decisionFingerprint,
    evidenceFingerprint: row.evidenceFingerprint,
    linkedFingerprint: row.linkedFingerprint,
    basisSnapshot: (row.basisSnapshot as BasisObject[] | null) ?? [],
    changedObjects: (row.changedObjects as BasisChange[] | null) ?? [],
    assumptionStatus: row.assumptionStatus,
    monitoredAt: row.monitoredAt,
    reviewNote: row.reviewNote,
    reviewedAt: row.reviewedAt,
    statusBefore: row.statusBefore,
    statusAfter: row.statusAfter,
    actor: row.actor,
    createdAt: row.createdAt,
  };
}

/**
 * Newest first, with the row id breaking ties.
 *
 * An evaluation and the review that follows it can land in the same
 * millisecond; without the id the "latest" record would be arbitrary.
 */
const NEWEST_FIRST = [{ monitoredAt: "desc" as const }, { id: "desc" as const }];

/** Constrains every read to the project that owns the assumption's decision. */
function scoped(projectId: string, assumptionId: string) {
  return {
    assumptionId,
    assumption: { engineeringDecision: { projectId } },
  };
}

export interface CreateMonitoringRecordInput {
  assumptionId: string;
  kind: AssumptionMonitoringKind;
  status: Exclude<AssumptionMonitoringStatus, "NOT_EVALUATED">;
  finding: AssumptionMonitoringFinding;
  basisFingerprint: string;
  decisionFingerprint: string;
  evidenceFingerprint: string;
  linkedFingerprint: string;
  basisSnapshot: BasisObject[];
  changedObjects: BasisChange[];
  assumptionStatus: AssumptionStatus;
  actorId: string | null;
  reviewNote?: string | null;
  reviewedAt?: Date | null;
  statusBefore?: AssumptionStatus | null;
  statusAfter?: AssumptionStatus | null;
}

export async function createRecord(
  input: CreateMonitoringRecordInput,
  client: DbClient = prisma,
): Promise<AssumptionMonitoringRecord> {
  const row = await client.assumptionMonitoringRecord.create({
    data: {
      assumptionId: input.assumptionId,
      kind: input.kind,
      status: input.status,
      finding: input.finding,
      basisFingerprint: input.basisFingerprint,
      decisionFingerprint: input.decisionFingerprint,
      evidenceFingerprint: input.evidenceFingerprint,
      linkedFingerprint: input.linkedFingerprint,
      basisSnapshot: input.basisSnapshot as never,
      changedObjects: input.changedObjects as never,
      assumptionStatus: input.assumptionStatus,
      actorId: input.actorId,
      reviewNote: input.reviewNote ?? null,
      reviewedAt: input.reviewedAt ?? null,
      statusBefore: input.statusBefore ?? null,
      statusAfter: input.statusAfter ?? null,
    },
    select: RECORD_SELECT,
  });
  return toRecord(row);
}

/**
 * The most recent record of any kind.
 *
 * "Any kind" matters: a review re-baselines the assumption by recording the
 * fingerprint it acknowledged, so the next evaluation must compare against
 * whichever record came last.
 */
export async function findLatestRecord(
  projectId: string,
  assumptionId: string,
  client: DbClient = prisma,
): Promise<AssumptionMonitoringRecord | null> {
  const row = await client.assumptionMonitoringRecord.findFirst({
    where: scoped(projectId, assumptionId),
    orderBy: NEWEST_FIRST,
    select: RECORD_SELECT,
  });
  return row ? toRecord(row) : null;
}

/** The most recent record of one kind, used for "last evaluated / last reviewed". */
export async function findLatestOfKind(
  projectId: string,
  assumptionId: string,
  kind: AssumptionMonitoringKind,
  client: DbClient = prisma,
): Promise<AssumptionMonitoringRecord | null> {
  const row = await client.assumptionMonitoringRecord.findFirst({
    where: { ...scoped(projectId, assumptionId), kind },
    orderBy: NEWEST_FIRST,
    select: RECORD_SELECT,
  });
  return row ? toRecord(row) : null;
}

/** The whole history for one assumption, newest first. Nothing is ever removed. */
export async function listHistory(
  projectId: string,
  assumptionId: string,
  client: DbClient = prisma,
): Promise<AssumptionMonitoringRecord[]> {
  const rows = await client.assumptionMonitoringRecord.findMany({
    where: scoped(projectId, assumptionId),
    orderBy: NEWEST_FIRST,
    select: RECORD_SELECT,
  });
  return rows.map(toRecord);
}

/**
 * The latest record for each of several assumptions, in one pass.
 *
 * Used by the decision detail page, which needs a monitoring badge per
 * assumption and must not issue a query per row. Reads the whole history for
 * the named assumptions and keeps the first of each — the ordering guarantees
 * that is the newest.
 */
export async function findLatestForAssumptions(
  projectId: string,
  assumptionIds: readonly string[],
  client: DbClient = prisma,
): Promise<Map<string, AssumptionMonitoringRecord>> {
  if (assumptionIds.length === 0) return new Map();

  const rows = await client.assumptionMonitoringRecord.findMany({
    where: {
      assumptionId: { in: [...assumptionIds] },
      assumption: { engineeringDecision: { projectId } },
    },
    orderBy: NEWEST_FIRST,
    select: RECORD_SELECT,
  });

  const latest = new Map<string, AssumptionMonitoringRecord>();
  for (const row of rows) {
    if (!latest.has(row.assumptionId)) latest.set(row.assumptionId, toRecord(row));
  }
  return latest;
}

export interface ProjectAssumption {
  id: string;
  statement: string;
  status: AssumptionStatus;
  engineeringDecisionId: string;
  decisionIdentifier: string;
}

/**
 * Every assumption in a project, for a project-wide sweep.
 *
 * Ordered deterministically so a sweep processes them in the same sequence
 * every time and its summary is reproducible.
 */
export async function listProjectAssumptions(
  projectId: string,
  client: DbClient = prisma,
): Promise<ProjectAssumption[]> {
  const rows = await client.decisionAssumption.findMany({
    where: { engineeringDecision: { projectId } },
    orderBy: [{ engineeringDecisionId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    select: {
      id: true,
      statement: true,
      status: true,
      engineeringDecisionId: true,
      engineeringDecision: { select: { identifier: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    statement: row.statement,
    status: row.status,
    engineeringDecisionId: row.engineeringDecisionId,
    decisionIdentifier: row.engineeringDecision.identifier,
  }));
}
