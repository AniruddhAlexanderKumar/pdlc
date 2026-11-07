import { randomUUID } from "node:crypto";
import type {
  SurveillanceSourceType,
  SurveillanceTarget,
  SurveillanceTargetStatus,
  SurveillanceTargetType,
} from "@/domain";
import { type DbClient, prisma } from "@/lib/db";
import { assertGuardedTransition } from "./prisma-error";

/**
 * A surveillance target enriched with the source event that most recently
 * justified it — what a reader needs to answer "what changed?" without a
 * second request. Read-only enrichment; the underlying row is exactly
 * {@link SurveillanceTarget}.
 */
export interface SurveillanceTargetWithSource extends SurveillanceTarget {
  sourceType: SurveillanceSourceType;
  sourceId: string;
  sourceIdentifier: string | null;
  sourceLabel: string;
}

const WITH_SOURCE_INCLUDE = {
  sourceEvent: {
    select: { sourceType: true, sourceId: true, sourceIdentifier: true, sourceLabel: true },
  },
} as const;

function withSource<T extends { sourceEvent: { sourceType: SurveillanceSourceType; sourceId: string; sourceIdentifier: string | null; sourceLabel: string } }>(
  row: T,
): SurveillanceTargetWithSource {
  const { sourceEvent, ...target } = row;
  return { ...(target as unknown as SurveillanceTarget), ...sourceEvent };
}

/**
 * Surveillance targets.
 *
 * The one write that matters for storm protection — `upsertOpenTarget` — is
 * deliberately raw SQL. "At most one OPEN row per (project, targetType,
 * targetId)" is enforced by a partial unique index the migration adds
 * (`surveillance_targets_open_unique`), and `INSERT ... ON CONFLICT (...)
 * WHERE status = 'OPEN' DO UPDATE` is the only way PostgreSQL lets a caller
 * race-safely insert-or-update against a *partial* index — Prisma's own
 * `upsert()` only knows about constraints declared in schema.prisma, and a
 * filtered index cannot be declared there. Every other function here is
 * ordinary Prisma.
 */

export interface UpsertOpenTargetInput {
  projectId: string;
  targetType: SurveillanceTargetType;
  targetId: string;
  targetIdentifier: string | null;
  targetLabel: string;
  reason: string;
  sourceEventId: string;
}

export interface UpsertOpenTargetResult {
  id: string;
  /** True when this call created a new row; false when it updated the existing OPEN one. */
  inserted: boolean;
}

export async function upsertOpenTarget(
  input: UpsertOpenTargetInput,
  client: DbClient = prisma,
): Promise<UpsertOpenTargetResult> {
  const id = randomUUID();

  const rows = await client.$queryRaw<Array<{ id: string; inserted: boolean }>>`
    INSERT INTO "surveillance_targets"
      ("id", "projectId", "targetType", "targetId", "targetIdentifier", "targetLabel", "reason", "sourceEventId", "status", "detectedAt", "createdAt", "updatedAt")
    VALUES
      (${id}, ${input.projectId}, ${input.targetType}::"SurveillanceTargetType", ${input.targetId}, ${input.targetIdentifier}, ${input.targetLabel}, ${input.reason}, ${input.sourceEventId}, 'OPEN', now(), now(), now())
    ON CONFLICT ("projectId", "targetType", "targetId") WHERE "status" = 'OPEN'
    DO UPDATE SET
      "targetIdentifier" = EXCLUDED."targetIdentifier",
      "targetLabel" = EXCLUDED."targetLabel",
      "reason" = EXCLUDED."reason",
      "sourceEventId" = EXCLUDED."sourceEventId",
      "detectedAt" = EXCLUDED."detectedAt",
      "updatedAt" = now()
    RETURNING "id", (xmax = 0) AS "inserted"
  `;

  const row = rows[0];
  if (!row) throw new Error("Surveillance target upsert returned no row.");
  return row;
}

/**
 * Marks an ACKNOWLEDGED target on the same (targetType, targetId) as
 * superseded by a freshly-inserted OPEN one.
 *
 * Only ACKNOWLEDGED rows are eligible — a fresh detection never touches
 * RESOLVED or already-SUPERSEDED history, and an OPEN row on the same target
 * cannot coexist with the one just inserted (the partial index forbids it).
 * Acknowledging a signal is explicitly not a claim that it is fixed, so a
 * genuinely new change after acknowledgement earns its own fresh signal
 * rather than silently reusing the old one.
 */
export async function supersedeAcknowledged(
  projectId: string,
  targetType: SurveillanceTargetType,
  targetId: string,
  newTargetId: string,
  client: DbClient = prisma,
): Promise<number> {
  const result = await client.surveillanceTarget.updateMany({
    where: { projectId, targetType, targetId, status: "ACKNOWLEDGED", id: { not: newTargetId } },
    data: { status: "SUPERSEDED", supersededById: newTargetId },
  });
  return result.count;
}

export async function findTargetInProject(
  projectId: string,
  id: string,
  client: DbClient = prisma,
): Promise<SurveillanceTargetWithSource | null> {
  const row = await client.surveillanceTarget.findFirst({
    where: { id, projectId },
    include: WITH_SOURCE_INCLUDE,
  });
  return row ? withSource(row) : null;
}

export async function listOpenTargets(
  projectId: string,
  client: DbClient = prisma,
): Promise<SurveillanceTargetWithSource[]> {
  const rows = await client.surveillanceTarget.findMany({
    where: { projectId, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
    orderBy: [{ detectedAt: "desc" }, { id: "desc" }],
    include: WITH_SOURCE_INCLUDE,
  });
  return rows.map(withSource);
}

export interface ListTargetsOptions {
  status?: SurveillanceTargetStatus | SurveillanceTargetStatus[];
  limit?: number;
}

export async function listTargetsForProject(
  projectId: string,
  options: ListTargetsOptions = {},
  client: DbClient = prisma,
): Promise<SurveillanceTargetWithSource[]> {
  const rows = await client.surveillanceTarget.findMany({
    where: {
      projectId,
      ...(options.status ? { status: Array.isArray(options.status) ? { in: options.status } : options.status } : {}),
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    include: WITH_SOURCE_INCLUDE,
    take: options.limit ?? 100,
  });
  return rows.map(withSource);
}

/** The current OPEN or ACKNOWLEDGED target for a specific domain object, if one exists. */
export async function findOpenTargetFor(
  projectId: string,
  targetType: SurveillanceTargetType,
  targetId: string,
  client: DbClient = prisma,
): Promise<SurveillanceTarget | null> {
  return client.surveillanceTarget.findFirst({
    where: { projectId, targetType, targetId, status: { in: ["OPEN", "ACKNOWLEDGED"] } },
  });
}

/**
 * Guarded: applies only if the target is still in `fromStatus` — the status
 * the caller's own transition check just read — so a concurrent
 * acknowledge/resolve of the same target cannot silently overwrite, or be
 * silently overwritten by, another one racing it. See `assertGuardedTransition`.
 */
export async function acknowledgeTarget(
  id: string,
  fromStatus: SurveillanceTargetStatus,
  acknowledgedById: string | null,
  note: string | null,
  client: DbClient = prisma,
): Promise<SurveillanceTarget> {
  const result = await client.surveillanceTarget.updateMany({
    where: { id, status: fromStatus },
    data: {
      status: "ACKNOWLEDGED",
      acknowledgedAt: new Date(),
      acknowledgedById,
      acknowledgementNote: note,
    },
  });
  assertGuardedTransition(
    result.count,
    "This surveillance target's status was changed by someone else first. Reload and try again.",
  );
  return client.surveillanceTarget.findUniqueOrThrow({ where: { id } });
}

export async function resolveTarget(
  id: string,
  fromStatus: SurveillanceTargetStatus,
  resolvedById: string | null,
  note: string,
  client: DbClient = prisma,
): Promise<SurveillanceTarget> {
  const result = await client.surveillanceTarget.updateMany({
    where: { id, status: fromStatus },
    data: {
      status: "RESOLVED",
      resolvedAt: new Date(),
      resolvedById,
      resolutionNote: note,
    },
  });
  assertGuardedTransition(
    result.count,
    "This surveillance target's status was changed by someone else first. Reload and try again.",
  );
  return client.surveillanceTarget.findUniqueOrThrow({ where: { id } });
}

/** Counts for the dashboard card and the workspace header — real aggregates, never estimates. */
export interface SurveillanceCounts {
  open: number;
  acknowledged: number;
}

export async function countByStatus(
  projectId: string,
  client: DbClient = prisma,
): Promise<SurveillanceCounts> {
  const [open, acknowledged] = await Promise.all([
    client.surveillanceTarget.count({ where: { projectId, status: "OPEN" } }),
    client.surveillanceTarget.count({ where: { projectId, status: "ACKNOWLEDGED" } }),
  ]);
  return { open, acknowledged };
}
