import type { Prisma } from "@/generated/prisma/client";
import { type DbClient, prisma } from "@/lib/db";

/**
 * Audit event writing.
 *
 * Deliberately one function, not a framework. Services own the action
 * vocabulary and decide what is worth recording; this only writes the row —
 * and it takes a `DbClient` so the event can be committed in the same
 * transaction as the mutation it describes.
 */

export interface RecordAuditEventInput {
  organizationId: string;
  /** Null for system-initiated actions. */
  actorId: string | null;
  /** Namespaced action, e.g. "project.created". */
  action: string;
  /** Domain entity name, e.g. "Project". */
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown> | null;
}

export interface AuditEventSummary {
  id: string;
  action: string;
  createdAt: Date;
  actor: { id: string; name: string } | null;
  metadata: unknown;
}

/**
 * History for one entity, newest first.
 *
 * Organization-scoped as well as entity-scoped so a caller can never read
 * another tenant's history by guessing an id. Bounded because this feeds a
 * detail panel, not an audit explorer.
 */
export async function listAuditEventsForEntity(
  input: { organizationId: string; entityType: string; entityId: string; limit?: number },
  client: DbClient = prisma,
): Promise<AuditEventSummary[]> {
  const rows = await client.auditLog.findMany({
    where: {
      organizationId: input.organizationId,
      entityType: input.entityType,
      entityId: input.entityId,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit ?? 50,
    select: {
      id: true,
      action: true,
      createdAt: true,
      metadata: true,
      actor: { select: { id: true, name: true } },
    },
  });

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    createdAt: row.createdAt,
    actor: row.actor,
    metadata: row.metadata,
  }));
}

export interface RelationshipAuditRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  createdAt: Date;
}

/**
 * Every matching audit row across a batch of entity ids at once — Decision
 * Sentinel's relationship-change scan, which otherwise has no single owning
 * entity to read from. Organization-scoped like every other read here.
 */
export async function listAuditEventsForEntities(
  input: {
    organizationId: string;
    entityIds: readonly string[];
    actions: readonly string[];
    limit?: number;
  },
  client: DbClient = prisma,
): Promise<RelationshipAuditRow[]> {
  if (input.entityIds.length === 0) return [];

  return client.auditLog.findMany({
    where: {
      organizationId: input.organizationId,
      entityId: { in: [...input.entityIds] },
      action: { in: [...input.actions] },
    },
    select: { id: true, action: true, entityType: true, entityId: true, createdAt: true },
    orderBy: [{ createdAt: "desc" }],
    take: input.limit ?? 500,
  });
}

/** The most recent actor to touch this entity, for attributing a detected change to whoever made it. */
export async function findLatestActorForEntity(
  organizationId: string,
  entityId: string,
  client: DbClient = prisma,
): Promise<string | null> {
  const latest = await client.auditLog.findFirst({
    where: { organizationId, entityId },
    orderBy: [{ createdAt: "desc" }],
    select: { actorId: true },
  });
  return latest?.actorId ?? null;
}

export async function recordAuditEvent(
  input: RecordAuditEventInput,
  client: DbClient = prisma,
): Promise<void> {
  const { metadata, ...event } = input;

  await client.auditLog.create({
    data: {
      ...event,
      // Only set the Json column when there is something to record, so we
      // never have to distinguish SQL NULL from JSON null.
      ...(metadata ? { metadata: metadata as Prisma.InputJsonObject } : {}),
    },
  });
}
