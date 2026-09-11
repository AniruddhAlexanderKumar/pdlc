import {
  ACTIVE_CHANGE_REQUEST_STATUSES,
  type AssumptionStatus,
  type ChangeRequestStatus,
  type DecisionStatus,
  type DesignItemStatus,
  type GraphNodeType,
  type RequirementStatus,
} from "@/domain";
import { type DbClient, prisma } from "@/lib/db";

/**
 * The engineering state the readiness rules read.
 *
 * Separate from `verification-readiness.repository.ts`, which owns the
 * assessments themselves. This one owns nothing: it is a set of explicit,
 * batched, project-scoped reads over tables other modules already own, so the
 * readiness engine can ask "what state is this requirement in?" without either
 * issuing a query per object or reaching into another module's service.
 *
 * Two rules run through all of it:
 *
 *  - **Batched.** Every function takes a list of ids and issues one query. The
 *    readiness engine walks a small neighbourhood, and it must not turn that
 *    into a query per node.
 *  - **Project-scoped.** Every read is constrained to the project the caller
 *    has already been proved to have access to. An id from elsewhere resolves
 *    to nothing rather than to another programme's record.
 *
 * The *topology* — which requirements, design items and decisions are in the
 * basis at all — comes from `EngineeringGraphService`. Nothing here traverses a
 * relationship to discover an object; it only reads state for objects the graph
 * already named. The one exception is the change-impact context below, which
 * reads change requests and stored impact analyses: those are not graph
 * neighbours of the activity, and the readiness engine consumes them rather
 * than recomputing them.
 */

/** A basis object the readiness rules need state for. */
export interface ReadinessSubjectRef {
  type: GraphNodeType;
  id: string;
}

// --- Artifact state ---------------------------------------------------------

export interface RequirementStateRow {
  id: string;
  identifier: string;
  title: string;
  status: RequirementStatus;
}

export async function loadRequirementStates(
  projectId: string,
  ids: readonly string[],
  client: DbClient = prisma,
): Promise<Map<string, RequirementStateRow>> {
  if (ids.length === 0) return new Map();

  const rows = await client.requirement.findMany({
    where: { id: { in: [...new Set(ids)] }, projectId },
    select: { id: true, identifier: true, title: true, status: true },
  });
  return new Map(rows.map((row) => [row.id, row]));
}

export interface DesignItemStateRow {
  id: string;
  identifier: string;
  name: string;
  status: DesignItemStatus;
}

export async function loadDesignItemStates(
  projectId: string,
  ids: readonly string[],
  client: DbClient = prisma,
): Promise<Map<string, DesignItemStateRow>> {
  if (ids.length === 0) return new Map();

  const rows = await client.designItem.findMany({
    where: { id: { in: [...new Set(ids)] }, projectId },
    select: { id: true, identifier: true, name: true, status: true },
  });
  return new Map(rows.map((row) => [row.id, row]));
}

export interface DecisionStateRow {
  id: string;
  identifier: string;
  title: string;
  status: DecisionStatus;
}

export async function loadDecisionStates(
  projectId: string,
  ids: readonly string[],
  client: DbClient = prisma,
): Promise<Map<string, DecisionStateRow>> {
  if (ids.length === 0) return new Map();

  const rows = await client.engineeringDecision.findMany({
    where: { id: { in: [...new Set(ids)] }, projectId },
    select: { id: true, identifier: true, title: true, status: true },
  });
  return new Map(rows.map((row) => [row.id, row]));
}

export interface AssumptionStateRow {
  id: string;
  statement: string;
  status: AssumptionStatus;
  engineeringDecisionId: string;
}

/**
 * Assumption records, reached through their decision so the project boundary is
 * enforced — a decision assumption carries no project column of its own.
 *
 * Only the assumption's *explicit* status is read. Its monitoring state comes
 * from the assumption-monitoring repository, which owns that history; nothing
 * in the readiness engine writes either one.
 */
export async function loadAssumptionStates(
  projectId: string,
  ids: readonly string[],
  client: DbClient = prisma,
): Promise<Map<string, AssumptionStateRow>> {
  if (ids.length === 0) return new Map();

  const rows = await client.decisionAssumption.findMany({
    where: { id: { in: [...new Set(ids)] }, engineeringDecision: { projectId } },
    select: { id: true, statement: true, status: true, engineeringDecisionId: true },
  });
  return new Map(rows.map((row) => [row.id, row]));
}

// --- Traceability -----------------------------------------------------------

export interface RequirementVerificationLinkRow {
  relationshipId: string;
  requirementId: string;
  /** False when the linked requirement belongs to a different project. */
  inProject: boolean;
}

/**
 * The Requirement ↔ Verification links recorded against this activity.
 *
 * Read from the link table directly rather than through the graph, and this is
 * the one place that is the right call: the graph fails closed, dropping any
 * edge whose endpoint it cannot resolve inside the project. That is correct for
 * traversal and useless here, because a link pointing at a requirement in
 * another project would simply vanish — and "this activity verifies something
 * we cannot read" is exactly the condition `VR-TRACE-002` exists to report.
 *
 * Only the foreign requirement's *id* and project membership are returned.
 * Nothing about a record outside the caller's project crosses this boundary.
 */
export async function loadRequirementVerificationLinks(
  projectId: string,
  verificationActivityId: string,
  client: DbClient = prisma,
): Promise<RequirementVerificationLinkRow[]> {
  const rows = await client.requirementVerificationLink.findMany({
    where: { verificationActivityId },
    select: {
      id: true,
      requirementId: true,
      requirement: { select: { projectId: true } },
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });

  return rows.map((row) => ({
    relationshipId: row.id,
    requirementId: row.requirementId,
    inProject: row.requirement.projectId === projectId,
  }));
}

// --- Change-impact context --------------------------------------------------

/** The stored impact analysis a readiness assessment consumed, if any. */
export interface ReadinessAnalysisRow {
  id: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  sourceFingerprint: string;
  startedAt: Date;
}

/** How one in-flight change bears on this activity's basis. */
export interface ReadinessChangeRow {
  changeRequestId: string;
  identifier: string;
  title: string;
  status: ChangeRequestStatus;
  /** The latest analysis for this change, whatever its outcome. */
  analysis: ReadinessAnalysisRow | null;
  /** Basis objects an engineer declared this change affects. */
  declaredSubjects: ReadinessSubjectRef[];
  /** Basis objects the latest analysis computed as reachable. */
  affectedSubjects: ReadinessSubjectRef[];
}

/** Which impact column holds each artifact type the readiness basis can contain. */
const IMPACT_COLUMN: Partial<Record<GraphNodeType, "requirementId" | "designItemId" | "engineeringDecisionId" | "verificationActivityId">> =
  {
    REQUIREMENT: "requirementId",
    DESIGN_ITEM: "designItemId",
    ENGINEERING_DECISION: "engineeringDecisionId",
    VERIFICATION_ACTIVITY: "verificationActivityId",
  };

/**
 * Change requests still in flight that touch any of these basis objects, with
 * whatever impact analysis has been run for them.
 *
 * Four batched queries, never one per change:
 *
 *   1. the project's active change requests
 *   2. every analysis for those changes, newest first — the first per change is
 *      the latest one
 *   3. the findings of those latest analyses that name a basis object
 *   4. the declared impacts on a basis object
 *
 * A change is returned only when it actually reaches the basis, either by
 * declaration or by a computed finding. That is what keeps readiness from being
 * disturbed by every change in the project, which would make the signal
 * worthless.
 *
 * **Nothing here runs an impact analysis.** It reads what the impact engine
 * already wrote, including analyses that failed or were never completed, and
 * hands the freshness judgement to the caller.
 */
export async function loadChangeImpactContext(
  projectId: string,
  subjects: readonly ReadinessSubjectRef[],
  client: DbClient = prisma,
): Promise<ReadinessChangeRow[]> {
  const impactable = subjects.filter((subject) => IMPACT_COLUMN[subject.type] !== undefined);
  if (impactable.length === 0) return [];

  const changes = await client.changeRequest.findMany({
    where: { projectId, status: { in: [...ACTIVE_CHANGE_REQUEST_STATUSES] } },
    select: { id: true, identifier: true, title: true, status: true },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
  });
  if (changes.length === 0) return [];

  const changeIds = changes.map((change) => change.id);

  // Column-specific OR terms, so the query uses the real foreign keys rather
  // than an opaque entity pair.
  const declaredWhere: Array<Record<string, { in: string[] }>> = [];
  for (const [type, column] of Object.entries(IMPACT_COLUMN) as Array<
    [GraphNodeType, NonNullable<(typeof IMPACT_COLUMN)[GraphNodeType]>]
  >) {
    const ids = impactable.filter((subject) => subject.type === type).map((s) => s.id);
    if (ids.length > 0) declaredWhere.push({ [column]: { in: [...new Set(ids)] } });
  }

  const [analysisRows, declaredRows] = await Promise.all([
    client.impactAnalysis.findMany({
      where: { projectId, changeRequestId: { in: changeIds } },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        changeRequestId: true,
        status: true,
        sourceFingerprint: true,
        startedAt: true,
      },
    }),
    declaredWhere.length === 0
      ? Promise.resolve([])
      : client.changeRequestImpact.findMany({
          where: { changeRequestId: { in: changeIds }, OR: declaredWhere },
          select: {
            changeRequestId: true,
            requirementId: true,
            designItemId: true,
            engineeringDecisionId: true,
            verificationActivityId: true,
          },
        }),
  ]);

  const latestAnalysis = new Map<string, ReadinessAnalysisRow>();
  for (const row of analysisRows) {
    if (latestAnalysis.has(row.changeRequestId)) continue;
    latestAnalysis.set(row.changeRequestId, {
      id: row.id,
      status: row.status,
      sourceFingerprint: row.sourceFingerprint,
      startedAt: row.startedAt,
    });
  }

  const analysisToChange = new Map<string, string>();
  for (const [changeRequestId, analysis] of latestAnalysis) {
    analysisToChange.set(analysis.id, changeRequestId);
  }

  const subjectKeys = new Set(impactable.map((subject) => `${subject.type}:${subject.id}`));
  const findingRows =
    analysisToChange.size === 0
      ? []
      : await client.impactFinding.findMany({
          where: {
            analysisId: { in: [...analysisToChange.keys()] },
            nodeId: { in: [...new Set(impactable.map((subject) => subject.id))] },
          },
          select: { analysisId: true, nodeType: true, nodeId: true },
        });

  const declaredByChange = new Map<string, ReadinessSubjectRef[]>();
  for (const row of declaredRows) {
    const refs = declaredByChange.get(row.changeRequestId) ?? [];
    if (row.requirementId) refs.push({ type: "REQUIREMENT", id: row.requirementId });
    if (row.designItemId) refs.push({ type: "DESIGN_ITEM", id: row.designItemId });
    if (row.engineeringDecisionId) {
      refs.push({ type: "ENGINEERING_DECISION", id: row.engineeringDecisionId });
    }
    if (row.verificationActivityId) {
      refs.push({ type: "VERIFICATION_ACTIVITY", id: row.verificationActivityId });
    }
    declaredByChange.set(
      row.changeRequestId,
      refs.filter((ref) => subjectKeys.has(`${ref.type}:${ref.id}`)),
    );
  }

  const affectedByChange = new Map<string, ReadinessSubjectRef[]>();
  for (const row of findingRows) {
    const key = `${row.nodeType}:${row.nodeId}`;
    // The id filter above cannot distinguish types, so the pair is checked here.
    if (!subjectKeys.has(key)) continue;
    const changeRequestId = analysisToChange.get(row.analysisId);
    if (!changeRequestId) continue;

    const refs = affectedByChange.get(changeRequestId) ?? [];
    refs.push({ type: row.nodeType as GraphNodeType, id: row.nodeId });
    affectedByChange.set(changeRequestId, refs);
  }

  const relevant: ReadinessChangeRow[] = [];
  for (const change of changes) {
    const declaredSubjects = declaredByChange.get(change.id) ?? [];
    const affectedSubjects = affectedByChange.get(change.id) ?? [];
    if (declaredSubjects.length === 0 && affectedSubjects.length === 0) continue;

    relevant.push({
      changeRequestId: change.id,
      identifier: change.identifier,
      title: change.title,
      status: change.status,
      analysis: latestAnalysis.get(change.id) ?? null,
      declaredSubjects: declaredSubjects.sort(compareSubjects),
      affectedSubjects: affectedSubjects.sort(compareSubjects),
    });
  }

  return relevant;
}

function compareSubjects(a: ReadinessSubjectRef, b: ReadinessSubjectRef): number {
  if (a.type !== b.type) return a.type < b.type ? -1 : 1;
  if (a.id === b.id) return 0;
  return a.id < b.id ? -1 : 1;
}
