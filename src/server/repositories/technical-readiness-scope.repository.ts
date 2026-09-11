import {
  ACTIVE_CHANGE_REQUEST_STATUSES,
  type AssumptionStatus,
  type ChangeRequestStatus,
  type DecisionStatus,
  type DesignItemStatus,
  type IssueSeverity,
  type IssueStatus,
  type RequirementStatus,
  type RiskStatus,
  type VerificationMethod,
  type VerificationStatus,
} from "@/domain";
import { type DbClient, prisma } from "@/lib/db";

/**
 * The engineering state the gate rules read.
 *
 * Separate from `technical-readiness.repository.ts`, which owns the assessments
 * themselves. This one owns nothing: it is a set of explicit, batched,
 * project-scoped reads over tables other modules already own, so the gate engine
 * can ask "what state is this project in?" without issuing a query per object or
 * reaching into another module's service.
 *
 * Three rules run through all of it:
 *
 *  - **One query per artifact type.** A gate looks at a whole project, so a
 *    per-object read is not a slow path, it is a broken one.
 *  - **Project-scoped.** Every read is constrained to the project the caller has
 *    already been proved to have access to.
 *  - **Only real fields.** Nothing here computes a rank, a score or a derived
 *    severity. Risks in particular are returned with the status the domain
 *    records and nothing else, because the model has no severity to read.
 *
 * The *topology* — which requirement is allocated to which design item, which
 * decision governs what — comes from `EngineeringGraphService`. Nothing here
 * traverses a relationship; it reads state for objects the graph named, plus the
 * risks, issues and change requests that are not graph neighbours of anything in
 * particular but are unambiguously part of a project's engineering state.
 */

// --- Artifacts --------------------------------------------------------------

export interface ScopedRequirement {
  id: string;
  identifier: string;
  title: string;
  status: RequirementStatus;
}

/**
 * The project's requirements.
 *
 * Obsolete requirements are returned too, marked by their status: a rule needs
 * to be able to tell "withdrawn" from "absent", and filtering them out in SQL
 * would make an obsolete requirement indistinguishable from one that never
 * existed.
 */
export async function loadRequirements(
  projectId: string,
  client: DbClient = prisma,
): Promise<ScopedRequirement[]> {
  return client.requirement.findMany({
    where: { projectId },
    select: { id: true, identifier: true, title: true, status: true },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
  });
}

export interface ScopedDesignItem {
  id: string;
  identifier: string;
  name: string;
  status: DesignItemStatus;
}

export async function loadDesignItems(
  projectId: string,
  client: DbClient = prisma,
): Promise<ScopedDesignItem[]> {
  return client.designItem.findMany({
    where: { projectId },
    select: { id: true, identifier: true, name: true, status: true },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
  });
}

export interface ScopedDecision {
  id: string;
  identifier: string;
  title: string;
  status: DecisionStatus;
}

export async function loadDecisions(
  projectId: string,
  client: DbClient = prisma,
): Promise<ScopedDecision[]> {
  return client.engineeringDecision.findMany({
    where: { projectId },
    select: { id: true, identifier: true, title: true, status: true },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
  });
}

export interface ScopedAssumption {
  id: string;
  statement: string;
  status: AssumptionStatus;
  engineeringDecisionId: string;
}

/**
 * Assumptions of the named decisions, reached through their decision so the
 * project boundary is enforced — a decision assumption carries no project
 * column of its own.
 *
 * Only the assumption's *explicit* status is read. Its monitoring state comes
 * from the assumption-monitoring module, which owns that history; nothing in
 * the gate engine writes either one.
 */
export async function loadAssumptions(
  projectId: string,
  decisionIds: readonly string[],
  client: DbClient = prisma,
): Promise<ScopedAssumption[]> {
  if (decisionIds.length === 0) return [];

  return client.decisionAssumption.findMany({
    where: {
      engineeringDecisionId: { in: [...new Set(decisionIds)] },
      engineeringDecision: { projectId },
    },
    select: { id: true, statement: true, status: true, engineeringDecisionId: true },
    orderBy: [{ engineeringDecisionId: "asc" }, { createdAt: "asc" }, { id: "asc" }],
  });
}

export interface ScopedVerificationActivity {
  id: string;
  identifier: string;
  title: string;
  method: VerificationMethod;
  status: VerificationStatus;
}

export async function loadVerificationActivities(
  projectId: string,
  client: DbClient = prisma,
): Promise<ScopedVerificationActivity[]> {
  return client.verificationActivity.findMany({
    where: { projectId },
    select: { id: true, identifier: true, title: true, method: true, status: true },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
  });
}

export interface ScopedStakeholderNeed {
  id: string;
  identifier: string;
  title: string;
}

export async function loadStakeholderNeeds(
  projectId: string,
  client: DbClient = prisma,
): Promise<ScopedStakeholderNeed[]> {
  return client.stakeholderNeed.findMany({
    where: { projectId },
    select: { id: true, identifier: true, title: true },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
  });
}

// --- Risks and issues -------------------------------------------------------

export interface ScopedRisk {
  id: string;
  identifier: string;
  title: string;
  status: RiskStatus;
}

/**
 * The project's risks.
 *
 * Returned with the status the domain records and nothing else. `Risk` has no
 * severity column, so there is nothing here for a rule to rank — and the gate
 * registry says so explicitly rather than inventing a threshold.
 */
export async function loadRisks(
  projectId: string,
  client: DbClient = prisma,
): Promise<ScopedRisk[]> {
  return client.risk.findMany({
    where: { projectId },
    select: { id: true, identifier: true, title: true, status: true },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
  });
}

export interface ScopedIssue {
  id: string;
  identifier: string;
  title: string;
  severity: IssueSeverity;
  status: IssueStatus;
}

/**
 * The project's issues.
 *
 * Severity here *is* real: a person recorded it on the issue, so a rule that
 * reads it is consuming a human judgement rather than manufacturing one.
 */
export async function loadIssues(
  projectId: string,
  client: DbClient = prisma,
): Promise<ScopedIssue[]> {
  return client.issue.findMany({
    where: { projectId },
    select: { id: true, identifier: true, title: true, severity: true, status: true },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
  });
}

// --- Change requests --------------------------------------------------------

export interface ScopedChangeRequest {
  id: string;
  identifier: string;
  title: string;
  status: ChangeRequestStatus;
}

/**
 * Change requests still in flight.
 *
 * "In flight" is derived from the lifecycle table rather than restated here, so
 * a change to the transition rules cannot leave a second divergent list behind.
 * An IMPLEMENTED change is excluded: its effect is in the artifacts now, not
 * pending against them.
 */
export async function loadActiveChangeRequests(
  projectId: string,
  client: DbClient = prisma,
): Promise<ScopedChangeRequest[]> {
  return client.changeRequest.findMany({
    where: { projectId, status: { in: [...ACTIVE_CHANGE_REQUEST_STATUSES] } },
    select: { id: true, identifier: true, title: true, status: true },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
  });
}

export interface LatestAnalysisRow {
  changeRequestId: string;
  id: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  sourceFingerprint: string;
  startedAt: Date;
}

/**
 * The latest impact analysis for each of the named change requests.
 *
 * One query for every change rather than one per change: the rows come back
 * newest-first and the first seen per change is its latest. Analyses that failed
 * or never finished are returned as they are — the caller decides that an
 * unusable run means "never analysed", so that policy stays in one place rather
 * than being hidden in a `where` clause here.
 *
 * **Nothing here runs an analysis.** It reads what the impact engine wrote.
 */
export async function loadLatestAnalyses(
  projectId: string,
  changeRequestIds: readonly string[],
  client: DbClient = prisma,
): Promise<Map<string, LatestAnalysisRow>> {
  if (changeRequestIds.length === 0) return new Map();

  const rows = await client.impactAnalysis.findMany({
    where: { projectId, changeRequestId: { in: [...new Set(changeRequestIds)] } },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    select: {
      id: true,
      changeRequestId: true,
      status: true,
      sourceFingerprint: true,
      startedAt: true,
    },
  });

  const latest = new Map<string, LatestAnalysisRow>();
  for (const row of rows) {
    if (latest.has(row.changeRequestId)) continue;
    latest.set(row.changeRequestId, {
      changeRequestId: row.changeRequestId,
      id: row.id,
      status: row.status,
      sourceFingerprint: row.sourceFingerprint,
      startedAt: row.startedAt,
    });
  }
  return latest;
}

export interface AnalysisReachRow {
  analysisId: string;
  nodeType: string;
  nodeId: string;
}

/**
 * Which of the named objects the named analyses reached.
 *
 * One query across every analysis, filtered to the ids the gate actually cares
 * about, so a large impact result does not have to be loaded to answer "does
 * this change touch my scope?".
 *
 * The id filter cannot distinguish node types on its own — ids are unique per
 * table, not globally — so the caller re-checks the (type, id) pair.
 */
export async function loadAnalysisReach(
  analysisIds: readonly string[],
  nodeIds: readonly string[],
  client: DbClient = prisma,
): Promise<AnalysisReachRow[]> {
  if (analysisIds.length === 0 || nodeIds.length === 0) return [];

  return client.impactFinding.findMany({
    where: {
      analysisId: { in: [...new Set(analysisIds)] },
      nodeId: { in: [...new Set(nodeIds)] },
    },
    select: { analysisId: true, nodeType: true, nodeId: true },
    orderBy: [{ analysisId: "asc" }, { nodeType: "asc" }, { nodeId: "asc" }],
  });
}
