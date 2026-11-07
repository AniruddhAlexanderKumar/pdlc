-- Verification readiness.
--
-- Purely additive: five new enums and two new tables, plus their foreign keys
-- into existing ones. No existing table, column, index, constraint or enum is
-- altered or dropped, so applying this preserves all data. In particular
-- `verification_activities` is untouched — readiness is recorded alongside the
-- activity, never folded into its lifecycle.
--
-- Both tables are immutable by construction of the code that writes them: an
-- assessment and its findings are inserted once inside a single transaction,
-- and nothing updates or deletes them. Re-evaluating appends a new assessment.
--
-- Freshness is deliberately NOT a column. It is derived at read time by
-- recomputing the activity's basis and comparing fingerprints, because a stored
-- flag would mean mutating a record that must not change.

-- CreateEnum
CREATE TYPE "VerificationReadinessStatus" AS ENUM ('READY', 'NOT_READY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "VerificationReadinessScope" AS ENUM ('EXECUTION', 'CLOSURE', 'NOT_APPLICABLE');

-- CreateEnum
CREATE TYPE "VerificationReadinessCategory" AS ENUM ('REQUIREMENT_STATE', 'VERIFICATION_DEFINITION', 'OWNER', 'DESIGN_STATE', 'DECISION_STATE', 'ASSUMPTION_STATE', 'EVIDENCE', 'CHANGE_IMPACT', 'TRACEABILITY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "VerificationReadinessFindingStatus" AS ENUM ('BLOCKING', 'WARNING', 'INFORMATIONAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "VerificationReadinessSeverity" AS ENUM ('BLOCKER', 'ADVISORY', 'NOTE', 'INDETERMINATE');

-- CreateTable
CREATE TABLE "verification_readiness_assessments" (
    "id" TEXT NOT NULL,
    "status" "VerificationReadinessStatus" NOT NULL,
    "scope" "VerificationReadinessScope" NOT NULL,
    "readinessVersion" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "basis" JSONB NOT NULL,
    "findingCount" INTEGER NOT NULL DEFAULT 0,
    "blockingCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "informationalCount" INTEGER NOT NULL DEFAULT 0,
    "unknownCount" INTEGER NOT NULL DEFAULT 0,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,
    "verificationActivityId" TEXT NOT NULL,
    "evaluatedById" TEXT,

    CONSTRAINT "verification_readiness_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_readiness_findings" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "category" "VerificationReadinessCategory" NOT NULL,
    "status" "VerificationReadinessFindingStatus" NOT NULL,
    "severity" "VerificationReadinessSeverity" NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "subjectIdentifier" TEXT,
    "subjectLabel" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "basis" TEXT[],
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assessmentId" TEXT NOT NULL,

    CONSTRAINT "verification_readiness_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Name truncated to PostgreSQL's 63-character identifier limit exactly as
-- Prisma generates it, so `prisma migrate diff` sees no drift.
CREATE INDEX "verification_readiness_assessments_verificationActivityId_e_idx" ON "verification_readiness_assessments"("verificationActivityId", "evaluatedAt");

-- CreateIndex
CREATE INDEX "verification_readiness_assessments_projectId_evaluatedAt_idx" ON "verification_readiness_assessments"("projectId", "evaluatedAt");

-- CreateIndex
CREATE INDEX "verification_readiness_findings_assessmentId_sequence_idx" ON "verification_readiness_findings"("assessmentId", "sequence");

-- CreateIndex
CREATE INDEX "verification_readiness_findings_assessmentId_status_idx" ON "verification_readiness_findings"("assessmentId", "status");

-- AddForeignKey
ALTER TABLE "verification_readiness_assessments" ADD CONSTRAINT "verification_readiness_assessments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_readiness_assessments" ADD CONSTRAINT "verification_readiness_assessments_verificationActivityId_fkey" FOREIGN KEY ("verificationActivityId") REFERENCES "verification_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_readiness_assessments" ADD CONSTRAINT "verification_readiness_assessments_evaluatedById_fkey" FOREIGN KEY ("evaluatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_readiness_findings" ADD CONSTRAINT "verification_readiness_findings_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "verification_readiness_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
