import type {
  ImpactAnalysis,
  ImpactAnalysisRoot,
  ImpactBasisMarker,
  ImpactClassification,
  ImpactFinding,
  ImpactFindingStatus,
  TraversalStep,
} from "@/domain";
import { type DbClient, prisma } from "@/lib/db";

/**
 * Impact analysis persistence.
 *
 * Analyses are **immutable once completed**. Nothing here updates a finding,
 * and the only update on an analysis is the single transition from RUNNING to
 * COMPLETED or FAILED that closes the run it belongs to. A re-run creates a new
 * analysis, so the history of what the engine concluded — and from what — is
 * never rewritten.
 *
 * Every read is project-scoped. An analysis id guessed from another project
 * resolves to nothing rather than to someone else's result.
 */

/** Shape of a persisted analysis row, before findings are attached. */
interface AnalysisRow {
  id: string;
  projectId: string;
  changeRequestId: string;
  status: "RUNNING" | "COMPLETED" | "FAILED";
  engineVersion: string;
  sourceFingerprint: string;
  failureReason: string | null;
  startedAt: Date;
  completedAt: Date | null;
  requestedById: string | null;
  rootCount: number;
  findingCount: number;
  directCount: number;
  downstreamCount: number;
  crossDomainCount: number;
  upstreamContextCount: number;
  unknownCount: number;
  notEvaluatedCount: number;
  maxDepth: number;
  maxNodes: number;
  maxEdges: number;
  truncated: boolean;
  truncatedBy: string | null;
}

const ANALYSIS_SELECT = {
  id: true,
  projectId: true,
  changeRequestId: true,
  status: true,
  engineVersion: true,
  sourceFingerprint: true,
  failureReason: true,
  startedAt: true,
  completedAt: true,
  requestedById: true,
  rootCount: true,
  findingCount: true,
  directCount: true,
  downstreamCount: true,
  crossDomainCount: true,
  upstreamContextCount: true,
  unknownCount: true,
  notEvaluatedCount: true,
  maxDepth: true,
  maxNodes: true,
  maxEdges: true,
  truncated: true,
  truncatedBy: true,
} as const;

function toAnalysis(row: AnalysisRow): ImpactAnalysis {
  return {
    id: row.id,
    projectId: row.projectId,
    changeRequestId: row.changeRequestId,
    status: row.status,
    engineVersion: row.engineVersion,
    sourceFingerprint: row.sourceFingerprint,
    failureReason: row.failureReason,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    requestedById: row.requestedById,
    summary: {
      // `declaredImpacts` is filled by the service, which knows the change's
      // current declared scope; the row records what the run actually used.
      declaredImpacts: row.rootCount,
      roots: row.rootCount,
      findings: row.findingCount,
      direct: row.directCount,
      downstream: row.downstreamCount,
      crossDomain: row.crossDomainCount,
      upstreamContext: row.upstreamContextCount,
      unknown: row.unknownCount,
      notEvaluated: row.notEvaluatedCount,
    },
    limits: {
      maxDepth: row.maxDepth,
      maxNodes: row.maxNodes,
      maxEdges: row.maxEdges,
      truncated: row.truncated,
      truncatedBy: row.truncatedBy,
    },
  };
}

export interface CreateAnalysisInput {
  projectId: string;
  changeRequestId: string;
  engineVersion: string;
  requestedById: string | null;
  maxDepth: number;
  maxNodes: number;
  maxEdges: number;
}

/**
 * Opens a run in RUNNING with an empty fingerprint.
 *
 * Written before the walk so that a crash mid-analysis leaves an honest RUNNING
 * or FAILED row rather than nothing at all — silence would be indistinguishable
 * from "never attempted".
 */
export async function createAnalysis(
  input: CreateAnalysisInput,
  client: DbClient = prisma,
): Promise<ImpactAnalysis> {
  const row = await client.impactAnalysis.create({
    data: {
      projectId: input.projectId,
      changeRequestId: input.changeRequestId,
      engineVersion: input.engineVersion,
      requestedById: input.requestedById,
      sourceFingerprint: "",
      status: "RUNNING",
      maxDepth: input.maxDepth,
      maxNodes: input.maxNodes,
      maxEdges: input.maxEdges,
    },
    select: ANALYSIS_SELECT,
  });
  return toAnalysis(row);
}

export interface PersistRootInput {
  nodeType: string;
  nodeId: string;
  identifier: string | null;
  label: string;
  resolved: boolean;
  declaredImpactId: string | null;
}

/**
 * Writes the roots, returning their generated ids keyed by `type:id`.
 *
 * Created one at a time rather than in a batch because the findings that follow
 * need the generated root ids to reference, and a batch insert does not return
 * them portably.
 */
export async function createRoots(
  analysisId: string,
  roots: readonly PersistRootInput[],
  client: DbClient = prisma,
): Promise<Map<string, string>> {
  const byNode = new Map<string, string>();

  for (const root of roots) {
    const created = await client.impactAnalysisRoot.create({
      data: {
        analysisId,
        nodeType: root.nodeType,
        nodeId: root.nodeId,
        identifier: root.identifier,
        label: root.label,
        resolved: root.resolved,
        declaredImpactId: root.declaredImpactId,
      },
      select: { id: true },
    });
    byNode.set(`${root.nodeType}:${root.nodeId}`, created.id);
  }

  return byNode;
}

export interface PersistFindingInput {
  rootId: string;
  nodeType: string;
  nodeId: string;
  identifier: string | null;
  label: string;
  classification: ImpactClassification;
  status: ImpactFindingStatus;
  depth: number;
  basis: ImpactBasisMarker[];
  path: TraversalStep[];
  alternatePathCount: number;
}

/**
 * Bulk-inserts the findings.
 *
 * One statement rather than one per finding: an analysis can legitimately
 * produce hundreds, and a per-row round trip inside a transaction is how an
 * analysis starts holding locks for seconds.
 */
export async function createFindings(
  analysisId: string,
  findings: readonly PersistFindingInput[],
  client: DbClient = prisma,
): Promise<number> {
  if (findings.length === 0) return 0;

  const result = await client.impactFinding.createMany({
    data: findings.map((finding) => ({
      analysisId,
      rootId: finding.rootId,
      nodeType: finding.nodeType,
      nodeId: finding.nodeId,
      identifier: finding.identifier,
      label: finding.label,
      classification: finding.classification,
      status: finding.status,
      depth: finding.depth,
      basis: finding.basis,
      path: finding.path as never,
      alternatePathCount: finding.alternatePathCount,
    })),
  });
  return result.count;
}

export interface CompleteAnalysisInput {
  sourceFingerprint: string;
  rootCount: number;
  findingCount: number;
  directCount: number;
  downstreamCount: number;
  crossDomainCount: number;
  upstreamContextCount: number;
  unknownCount: number;
  notEvaluatedCount: number;
  truncated: boolean;
  truncatedBy: string | null;
}

/**
 * Closes a run as COMPLETED.
 *
 * The counts are passed in rather than derived here because the service has
 * just computed them from the findings it wrote; recomputing would risk the
 * summary disagreeing with the rows it claims to summarise.
 */
export async function completeAnalysis(
  analysisId: string,
  input: CompleteAnalysisInput,
  client: DbClient = prisma,
): Promise<ImpactAnalysis> {
  const row = await client.impactAnalysis.update({
    where: { id: analysisId },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      sourceFingerprint: input.sourceFingerprint,
      rootCount: input.rootCount,
      findingCount: input.findingCount,
      directCount: input.directCount,
      downstreamCount: input.downstreamCount,
      crossDomainCount: input.crossDomainCount,
      upstreamContextCount: input.upstreamContextCount,
      unknownCount: input.unknownCount,
      notEvaluatedCount: input.notEvaluatedCount,
      truncated: input.truncated,
      truncatedBy: input.truncatedBy,
    },
    select: ANALYSIS_SELECT,
  });
  return toAnalysis(row);
}

/**
 * Closes a run as FAILED.
 *
 * The reason is a caller-safe sentence, never a database message: a failed
 * analysis must be visible without leaking schema detail to whoever ran it.
 */
export async function failAnalysis(
  analysisId: string,
  reason: string,
  client: DbClient = prisma,
): Promise<void> {
  await client.impactAnalysis.update({
    where: { id: analysisId },
    data: { status: "FAILED", completedAt: new Date(), failureReason: reason },
  });
}

/** The most recent run for a change, whatever its outcome. */
export async function findLatestAnalysis(
  projectId: string,
  changeRequestId: string,
  client: DbClient = prisma,
): Promise<ImpactAnalysis | null> {
  const row = await client.impactAnalysis.findFirst({
    where: { projectId, changeRequestId },
    // Id breaks ties so two runs started in the same millisecond still order.
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    select: ANALYSIS_SELECT,
  });
  return row ? toAnalysis(row) : null;
}

/** Every run for a change, newest first. History is never overwritten. */
export async function listAnalyses(
  projectId: string,
  changeRequestId: string,
  client: DbClient = prisma,
): Promise<ImpactAnalysis[]> {
  const rows = await client.impactAnalysis.findMany({
    where: { projectId, changeRequestId },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    select: ANALYSIS_SELECT,
  });
  return rows.map(toAnalysis);
}

/** One analysis, scoped by project so an id from elsewhere is simply absent. */
export async function findAnalysisInProject(
  projectId: string,
  analysisId: string,
  client: DbClient = prisma,
): Promise<ImpactAnalysis | null> {
  const row = await client.impactAnalysis.findFirst({
    where: { id: analysisId, projectId },
    select: ANALYSIS_SELECT,
  });
  return row ? toAnalysis(row) : null;
}

export async function listRoots(
  analysisId: string,
  client: DbClient = prisma,
): Promise<ImpactAnalysisRoot[]> {
  const rows = await client.impactAnalysisRoot.findMany({
    where: { analysisId },
    orderBy: [{ nodeType: "asc" }, { nodeId: "asc" }],
    select: {
      id: true,
      analysisId: true,
      nodeType: true,
      nodeId: true,
      identifier: true,
      label: true,
      resolved: true,
      declaredImpactId: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    analysisId: row.analysisId,
    node: { type: row.nodeType as ImpactAnalysisRoot["node"]["type"], id: row.nodeId },
    identifier: row.identifier,
    label: row.label,
    resolved: row.resolved,
    declaredImpactId: row.declaredImpactId,
  }));
}

/**
 * Findings for one analysis.
 *
 * Ordered in SQL by classification, depth, then node, so the list is stable
 * before the service sorts it — nothing depends on PostgreSQL's row order.
 */
export async function listFindings(
  analysisId: string,
  client: DbClient = prisma,
): Promise<ImpactFinding[]> {
  const rows = await client.impactFinding.findMany({
    where: { analysisId },
    orderBy: [
      { classification: "asc" },
      { depth: "asc" },
      { nodeType: "asc" },
      { nodeId: "asc" },
    ],
    select: {
      id: true,
      analysisId: true,
      rootId: true,
      nodeType: true,
      nodeId: true,
      identifier: true,
      label: true,
      classification: true,
      status: true,
      depth: true,
      basis: true,
      path: true,
      alternatePathCount: true,
      createdAt: true,
    },
  });

  return rows.map((row) => ({
    id: row.id,
    analysisId: row.analysisId,
    rootId: row.rootId,
    node: { type: row.nodeType as ImpactFinding["node"]["type"], id: row.nodeId },
    identifier: row.identifier,
    label: row.label,
    classification: row.classification,
    status: row.status,
    depth: row.depth,
    basis: (row.basis as ImpactBasisMarker[]) ?? [],
    path: (row.path as TraversalStep[] | null) ?? [],
    alternatePathCount: row.alternatePathCount,
    createdAt: row.createdAt,
  }));
}
