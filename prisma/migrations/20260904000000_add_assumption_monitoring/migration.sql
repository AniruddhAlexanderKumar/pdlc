-- Assumption monitoring.
--
-- Purely additive: three new enums and one new table, plus its foreign keys
-- into existing ones. No existing table, column, index or constraint is altered
-- or dropped, so applying this preserves all data.
--
-- The table is append-only by construction of the code that writes it: an
-- evaluation and a review are both rows, and nothing updates one. Monitoring
-- observes the assumption's explicit status; it never sets it.

-- CreateEnum
CREATE TYPE "AssumptionMonitoringStatus" AS ENUM ('CURRENT', 'BASIS_CHANGED', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "AssumptionMonitoringFinding" AS ENUM ('NO_CHANGE', 'EVIDENCE_CHANGED', 'LINKED_OBJECT_CHANGED', 'DECISION_BASIS_CHANGED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "AssumptionMonitoringKind" AS ENUM ('EVALUATION', 'REVIEW');

-- CreateTable
CREATE TABLE "assumption_monitoring_records" (
    "id" TEXT NOT NULL,
    "kind" "AssumptionMonitoringKind" NOT NULL,
    "status" "AssumptionMonitoringStatus" NOT NULL,
    "finding" "AssumptionMonitoringFinding" NOT NULL,
    "basisFingerprint" TEXT NOT NULL,
    "decisionFingerprint" TEXT NOT NULL,
    "evidenceFingerprint" TEXT NOT NULL,
    "linkedFingerprint" TEXT NOT NULL,
    "basisSnapshot" JSONB NOT NULL,
    "changedObjects" JSONB NOT NULL,
    "assumptionStatus" "AssumptionStatus" NOT NULL,
    "monitoredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "statusBefore" "AssumptionStatus",
    "statusAfter" "AssumptionStatus",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assumptionId" TEXT NOT NULL,
    "actorId" TEXT,

    CONSTRAINT "assumption_monitoring_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "assumption_monitoring_records_assumptionId_monitoredAt_idx" ON "assumption_monitoring_records"("assumptionId", "monitoredAt");

-- CreateIndex
CREATE INDEX "assumption_monitoring_records_assumptionId_kind_idx" ON "assumption_monitoring_records"("assumptionId", "kind");

-- AddForeignKey
ALTER TABLE "assumption_monitoring_records" ADD CONSTRAINT "assumption_monitoring_records_assumptionId_fkey" FOREIGN KEY ("assumptionId") REFERENCES "decision_assumptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assumption_monitoring_records" ADD CONSTRAINT "assumption_monitoring_records_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
