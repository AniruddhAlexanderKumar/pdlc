import type { SentinelEvent, SurveillanceEventType, SurveillanceSourceType } from "@/domain";
import { type DbClient, prisma } from "@/lib/db";

/**
 * Sentinel detection events.
 *
 * Append-only: nothing here updates or deletes a row. Idempotency is a
 * database guarantee, not application logic — `createEvents` relies on the
 * `(projectId, sourceType, sourceId, sourceRevision)` unique constraint via
 * `skipDuplicates`, so detecting the same revision twice (a concurrent call,
 * a retried request) writes it at most once.
 */

export interface CreateSentinelEventData {
  projectId: string;
  eventType: SurveillanceEventType;
  sourceType: SurveillanceSourceType;
  sourceId: string;
  sourceIdentifier: string | null;
  sourceLabel: string;
  sourceRevision: string;
  actorId: string | null;
}

/**
 * Bulk-inserts candidate events, silently skipping any whose
 * (sourceType, sourceId, sourceRevision) was already recorded, and returns
 * only the rows that were genuinely new. `createManyAndReturn` with
 * `skipDuplicates` is one round trip and race-safe under concurrent
 * detection calls — no separate existence check, no check-then-insert.
 */
export async function createEvents(
  projectId: string,
  events: readonly CreateSentinelEventData[],
  client: DbClient = prisma,
): Promise<SentinelEvent[]> {
  if (events.length === 0) return [];

  return client.sentinelEvent.createManyAndReturn({
    data: events.map((event) => ({ ...event, projectId })),
    skipDuplicates: true,
  });
}

export async function findEventInProject(
  projectId: string,
  id: string,
  client: DbClient = prisma,
): Promise<SentinelEvent | null> {
  return client.sentinelEvent.findFirst({ where: { id, projectId } });
}

export interface ListEventsOptions {
  limit?: number;
  sourceType?: SurveillanceSourceType;
}

/** Detection history, newest first. Bounded — this feeds a history panel, not an audit explorer. */
export async function listEventsForProject(
  projectId: string,
  options: ListEventsOptions = {},
  client: DbClient = prisma,
): Promise<SentinelEvent[]> {
  return client.sentinelEvent.findMany({
    where: { projectId, ...(options.sourceType ? { sourceType: options.sourceType } : {}) },
    orderBy: [{ detectedAt: "desc" }, { id: "desc" }],
    take: options.limit ?? 100,
  });
}
