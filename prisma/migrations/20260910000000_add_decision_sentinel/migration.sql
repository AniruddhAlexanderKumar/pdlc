-- Decision Sentinel — continuous surveillance.
--
-- Additive: four new enums and two new tables. No existing table, column,
-- index, constraint or enum is altered or dropped, and no existing row is
-- rewritten.
--
-- Two tables only. `sentinel_events` is an immutable detection log — nothing
-- in this migration or anywhere in the application ever updates or deletes a
-- row in it. `surveillance_targets` is the mutable (through controlled
-- transitions only) signal table.
--
-- The one thing this migration adds beyond what `prisma migrate diff` alone
-- generates is a partial unique index on `surveillance_targets` restricted to
-- `status = 'OPEN'`. Prisma's schema DSL cannot express a filtered/partial
-- index, so it is hand-written here — it is what makes "at most one OPEN
-- target per (project, targetType, targetId)" a real database guarantee
-- rather than a service-side check-then-insert race.

-- CreateEnum
CREATE TYPE "SurveillanceSourceType" AS ENUM ('REQUIREMENT', 'DESIGN_ITEM', 'ENGINEERING_DECISION', 'DECISION_ASSUMPTION', 'VERIFICATION_ACTIVITY', 'SUPPLIER', 'SUPPLIED_ITEM', 'SUPPLIER_QUALIFICATION', 'OPERATIONAL_OBSERVATION', 'CHANGE_REQUEST', 'CERTIFICATION_BASIS');

-- CreateEnum
CREATE TYPE "SurveillanceEventType" AS ENUM ('ENGINEERING_OBJECT_CHANGED', 'RELATIONSHIP_CHANGED', 'SUPPLIER_STATE_CHANGED', 'OBSERVATION_RECORDED', 'DECISION_BASIS_CHANGED', 'CHANGE_REQUEST_CHANGED', 'CERTIFICATION_BASIS_CHANGED');

-- CreateEnum
CREATE TYPE "SurveillanceTargetType" AS ENUM ('IMPACT_ANALYSIS', 'ASSUMPTION_MONITORING', 'VERIFICATION_READINESS', 'TECHNICAL_READINESS', 'DRIFT_ASSESSMENT', 'CERTIFICATION_REVIEW');

-- CreateEnum
CREATE TYPE "SurveillanceTargetStatus" AS ENUM ('OPEN', 'ACKNOWLEDGED', 'SUPERSEDED', 'RESOLVED');

-- CreateTable
CREATE TABLE "sentinel_events" (
    "id" TEXT NOT NULL,
    "eventType" "SurveillanceEventType" NOT NULL,
    "sourceType" "SurveillanceSourceType" NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceIdentifier" TEXT,
    "sourceLabel" TEXT NOT NULL,
    "sourceRevision" TEXT NOT NULL,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,
    "actorId" TEXT,

    CONSTRAINT "sentinel_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "surveillance_targets" (
    "id" TEXT NOT NULL,
    "targetType" "SurveillanceTargetType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetIdentifier" TEXT,
    "targetLabel" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "SurveillanceTargetStatus" NOT NULL DEFAULT 'OPEN',
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),
    "acknowledgementNote" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "sourceEventId" TEXT NOT NULL,
    "acknowledgedById" TEXT,
    "resolvedById" TEXT,
    "supersededById" TEXT,

    CONSTRAINT "surveillance_targets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sentinel_events_projectId_detectedAt_idx" ON "sentinel_events"("projectId", "detectedAt");

-- CreateIndex
CREATE INDEX "sentinel_events_projectId_sourceType_sourceId_idx" ON "sentinel_events"("projectId", "sourceType", "sourceId");

-- CreateIndex
CREATE UNIQUE INDEX "sentinel_events_projectId_sourceType_sourceId_sourceRevisio_key" ON "sentinel_events"("projectId", "sourceType", "sourceId", "sourceRevision");

-- CreateIndex
CREATE INDEX "surveillance_targets_projectId_status_idx" ON "surveillance_targets"("projectId", "status");

-- CreateIndex
CREATE INDEX "surveillance_targets_projectId_targetType_targetId_idx" ON "surveillance_targets"("projectId", "targetType", "targetId");

-- AddForeignKey
ALTER TABLE "sentinel_events" ADD CONSTRAINT "sentinel_events_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sentinel_events" ADD CONSTRAINT "sentinel_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surveillance_targets" ADD CONSTRAINT "surveillance_targets_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surveillance_targets" ADD CONSTRAINT "surveillance_targets_sourceEventId_fkey" FOREIGN KEY ("sourceEventId") REFERENCES "sentinel_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surveillance_targets" ADD CONSTRAINT "surveillance_targets_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surveillance_targets" ADD CONSTRAINT "surveillance_targets_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "surveillance_targets" ADD CONSTRAINT "surveillance_targets_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "surveillance_targets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Storm protection: at most one OPEN surveillance target per (project,
-- targetType, targetId), enforced by the database, not by a service-side
-- check-then-insert. A partial index cannot be expressed in schema.prisma,
-- so it is hand-written here. Detection upserts against this index with
-- `INSERT ... ON CONFLICT (...) WHERE status = 'OPEN' DO UPDATE`, which is
-- race-safe under concurrent detection calls.
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "surveillance_targets_open_unique"
ON "surveillance_targets" ("projectId", "targetType", "targetId")
WHERE "status" = 'OPEN';
