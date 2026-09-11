-- Technical readiness.
--
-- Purely additive: five new enums and two new tables, plus their foreign keys
-- into existing ones. No existing table, column, index, constraint or enum is
-- altered or dropped, so applying this preserves all data.
--
-- Deliberately separate from `verification_readiness_assessments`. The subject
-- is different — a project at a named gate, not one verification activity — the
-- rule set is different, and the two must be able to evolve without either
-- silently changing the meaning of the other's history.
--
-- Both tables are immutable by construction of the code that writes them: an
-- assessment and its findings are inserted once inside a single transaction,
-- and nothing updates or deletes them. Re-evaluating a gate appends.
--
-- Freshness is deliberately NOT a column. It is derived at read time by
-- re-resolving the gate's scope and comparing fingerprints, because a stored
-- flag would mean mutating a record that must not change.

-- CreateEnum
CREATE TYPE "TechnicalReadinessGate" AS ENUM ('SYSTEM_DEFINITION', 'DESIGN_REVIEW', 'DESIGN_FREEZE', 'VERIFICATION_READY', 'RELEASE_READY');

-- CreateEnum
CREATE TYPE "TechnicalReadinessStatus" AS ENUM ('READY', 'NOT_READY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TechnicalReadinessCategory" AS ENUM ('REQUIREMENT', 'DESIGN', 'DECISION', 'ASSUMPTION', 'VERIFICATION', 'CHANGE', 'RISK', 'ISSUE', 'EVIDENCE', 'TRACEABILITY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TechnicalReadinessFindingStatus" AS ENUM ('BLOCKING', 'WARNING', 'INFORMATIONAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TechnicalReadinessSeverity" AS ENUM ('BLOCKER', 'ADVISORY', 'NOTE', 'INDETERMINATE');

-- CreateTable
CREATE TABLE "technical_readiness_assessments" (
    "id" TEXT NOT NULL,
    "gate" "TechnicalReadinessGate" NOT NULL,
    "status" "TechnicalReadinessStatus" NOT NULL,
    "readinessVersion" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "scope" JSONB NOT NULL,
    "findingCount" INTEGER NOT NULL DEFAULT 0,
    "blockingCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "informationalCount" INTEGER NOT NULL DEFAULT 0,
    "unknownCount" INTEGER NOT NULL DEFAULT 0,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,
    "evaluatedById" TEXT,

    CONSTRAINT "technical_readiness_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technical_readiness_findings" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "category" "TechnicalReadinessCategory" NOT NULL,
    "status" "TechnicalReadinessFindingStatus" NOT NULL,
    "severity" "TechnicalReadinessSeverity" NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "subjectIdentifier" TEXT,
    "subjectLabel" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "basis" TEXT[],
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assessmentId" TEXT NOT NULL,

    CONSTRAINT "technical_readiness_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "technical_readiness_assessments_projectId_gate_evaluatedAt_idx" ON "technical_readiness_assessments"("projectId", "gate", "evaluatedAt");

-- CreateIndex
CREATE INDEX "technical_readiness_assessments_projectId_evaluatedAt_idx" ON "technical_readiness_assessments"("projectId", "evaluatedAt");

-- CreateIndex
CREATE INDEX "technical_readiness_findings_assessmentId_sequence_idx" ON "technical_readiness_findings"("assessmentId", "sequence");

-- CreateIndex
CREATE INDEX "technical_readiness_findings_assessmentId_status_idx" ON "technical_readiness_findings"("assessmentId", "status");

-- AddForeignKey
ALTER TABLE "technical_readiness_assessments" ADD CONSTRAINT "technical_readiness_assessments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_readiness_assessments" ADD CONSTRAINT "technical_readiness_assessments_evaluatedById_fkey" FOREIGN KEY ("evaluatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technical_readiness_findings" ADD CONSTRAINT "technical_readiness_findings_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "technical_readiness_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
