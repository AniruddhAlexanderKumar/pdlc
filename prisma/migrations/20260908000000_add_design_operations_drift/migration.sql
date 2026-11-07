-- Design / operations drift.
--
-- Additive: eight new enums, five new tables, and one new nullable column on an
-- existing one. No existing table is dropped, no existing column is dropped or
-- retyped, no existing constraint is altered, and no existing row is rewritten.
--
-- The one change to an existing table is `decision_expectations.comparisonOperator`:
-- nullable, so every existing expectation remains valid and simply reports as
-- "not comparable" until somebody records an operator. That is the smallest
-- change that makes an expectation mechanically checkable, and it is explicit —
-- nothing parses an operator out of the expected-value text.
--
-- What is deliberately NOT here: no telemetry table, no sample table, no time
-- series, no event log, no anomaly score, no confidence and no probability
-- column. Observations are recorded by people, and every finding is a
-- comparison a reader could repeat by hand from the two values stored beside it.

-- CreateEnum
CREATE TYPE "ComparisonOperator" AS ENUM ('EQUAL', 'NOT_EQUAL', 'LESS_THAN', 'LESS_THAN_OR_EQUAL', 'GREATER_THAN', 'GREATER_THAN_OR_EQUAL');

-- CreateEnum
CREATE TYPE "BaselineStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "BaselineMemberType" AS ENUM ('REQUIREMENT', 'DESIGN_ITEM', 'ENGINEERING_DECISION', 'DECISION_EXPECTATION', 'VERIFICATION_ACTIVITY', 'SUPPLIED_ITEM', 'SUPPLIER_QUALIFICATION');

-- CreateEnum
CREATE TYPE "ObservationType" AS ENUM ('MEASUREMENT', 'INSPECTION', 'FIELD_REPORT', 'MAINTENANCE', 'OPERATIONS_EVENT', 'PERFORMANCE_RESULT', 'CONFIGURATION_OBSERVATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ObservationStatus" AS ENUM ('RECORDED', 'REVIEWED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DriftStatus" AS ENUM ('NO_DRIFT', 'DRIFT_DETECTED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DriftCategory" AS ENUM ('VALUE_DEVIATION', 'CONFIGURATION_MISMATCH', 'EXPECTATION_BREACH', 'BASELINE_CHANGED', 'SUPPLIER_STATE_CHANGE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DriftFindingStatus" AS ENUM ('REVIEW_REQUIRED', 'INFORMATIONAL', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "DriftSeverity" AS ENUM ('ATTENTION', 'NOTE', 'INDETERMINATE');

-- AlterTable
ALTER TABLE "decision_expectations" ADD COLUMN     "comparisonOperator" "ComparisonOperator";

-- CreateTable
CREATE TABLE "engineering_baselines" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "BaselineStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "baselinedAt" TIMESTAMP(3),
    "supersededAt" TIMESTAMP(3),
    "projectId" TEXT NOT NULL,
    "createdById" TEXT,
    "baselinedById" TEXT,
    "supersededById" TEXT,

    CONSTRAINT "engineering_baselines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engineering_baseline_members" (
    "id" TEXT NOT NULL,
    "nodeType" "BaselineMemberType" NOT NULL,
    "nodeId" TEXT NOT NULL,
    "identifierSnapshot" TEXT,
    "labelSnapshot" TEXT NOT NULL,
    "stateSnapshot" TEXT,
    "fingerprint" TEXT NOT NULL,
    "revisionSnapshot" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "baselineId" TEXT NOT NULL,

    CONSTRAINT "engineering_baseline_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "operational_observations" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "observationType" "ObservationType" NOT NULL,
    "status" "ObservationStatus" NOT NULL DEFAULT 'RECORDED',
    "source" TEXT,
    "observedAt" TIMESTAMP(3) NOT NULL,
    "subjectLabel" TEXT,
    "numericValue" DECIMAL(38,12),
    "unit" TEXT,
    "textValue" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reviewedAt" TIMESTAMP(3),
    "projectId" TEXT NOT NULL,
    "createdById" TEXT,
    "reviewedById" TEXT,
    "designItemId" TEXT,
    "decisionExpectationId" TEXT,
    "suppliedItemId" TEXT,

    CONSTRAINT "operational_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drift_assessments" (
    "id" TEXT NOT NULL,
    "status" "DriftStatus" NOT NULL,
    "driftVersion" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "basis" JSONB NOT NULL,
    "findingCount" INTEGER NOT NULL DEFAULT 0,
    "reviewRequiredCount" INTEGER NOT NULL DEFAULT 0,
    "informationalCount" INTEGER NOT NULL DEFAULT 0,
    "unknownCount" INTEGER NOT NULL DEFAULT 0,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,
    "baselineId" TEXT NOT NULL,
    "evaluatedById" TEXT,

    CONSTRAINT "drift_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "drift_findings" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "category" "DriftCategory" NOT NULL,
    "status" "DriftFindingStatus" NOT NULL,
    "severity" "DriftSeverity" NOT NULL,
    "baselineSubjectType" TEXT,
    "baselineSubjectId" TEXT,
    "baselineSubjectIdentifier" TEXT,
    "baselineSubjectLabel" TEXT,
    "observationSubjectType" TEXT,
    "observationSubjectId" TEXT,
    "observationSubjectIdentifier" TEXT,
    "observationSubjectLabel" TEXT,
    "expectedValue" TEXT,
    "observedValue" TEXT,
    "explanation" TEXT NOT NULL,
    "basis" TEXT[],
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "assessmentId" TEXT NOT NULL,

    CONSTRAINT "drift_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "engineering_baselines_projectId_status_idx" ON "engineering_baselines"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "engineering_baselines_projectId_identifier_key" ON "engineering_baselines"("projectId", "identifier");

-- CreateIndex
CREATE INDEX "engineering_baseline_members_baselineId_idx" ON "engineering_baseline_members"("baselineId");

-- CreateIndex
CREATE INDEX "engineering_baseline_members_nodeType_nodeId_idx" ON "engineering_baseline_members"("nodeType", "nodeId");

-- CreateIndex
CREATE UNIQUE INDEX "engineering_baseline_members_baselineId_nodeType_nodeId_key" ON "engineering_baseline_members"("baselineId", "nodeType", "nodeId");

-- CreateIndex
CREATE INDEX "operational_observations_projectId_status_idx" ON "operational_observations"("projectId", "status");

-- CreateIndex
CREATE INDEX "operational_observations_projectId_observedAt_idx" ON "operational_observations"("projectId", "observedAt");

-- CreateIndex
CREATE INDEX "operational_observations_designItemId_idx" ON "operational_observations"("designItemId");

-- CreateIndex
CREATE INDEX "operational_observations_decisionExpectationId_idx" ON "operational_observations"("decisionExpectationId");

-- CreateIndex
CREATE INDEX "operational_observations_suppliedItemId_idx" ON "operational_observations"("suppliedItemId");

-- CreateIndex
CREATE UNIQUE INDEX "operational_observations_projectId_identifier_key" ON "operational_observations"("projectId", "identifier");

-- CreateIndex
CREATE INDEX "drift_assessments_projectId_evaluatedAt_idx" ON "drift_assessments"("projectId", "evaluatedAt");

-- CreateIndex
CREATE INDEX "drift_assessments_projectId_baselineId_evaluatedAt_idx" ON "drift_assessments"("projectId", "baselineId", "evaluatedAt");

-- CreateIndex
CREATE INDEX "drift_findings_assessmentId_sequence_idx" ON "drift_findings"("assessmentId", "sequence");

-- CreateIndex
CREATE INDEX "drift_findings_assessmentId_status_idx" ON "drift_findings"("assessmentId", "status");

-- AddForeignKey
ALTER TABLE "engineering_baselines" ADD CONSTRAINT "engineering_baselines_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_baselines" ADD CONSTRAINT "engineering_baselines_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_baselines" ADD CONSTRAINT "engineering_baselines_baselinedById_fkey" FOREIGN KEY ("baselinedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Self-relation recording which baseline replaced this one, so the succession
-- is traversable rather than implied by a status.
-- AddForeignKey
ALTER TABLE "engineering_baselines" ADD CONSTRAINT "engineering_baselines_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "engineering_baselines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_baseline_members" ADD CONSTRAINT "engineering_baseline_members_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "engineering_baselines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_observations" ADD CONSTRAINT "operational_observations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_observations" ADD CONSTRAINT "operational_observations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_observations" ADD CONSTRAINT "operational_observations_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_observations" ADD CONSTRAINT "operational_observations_designItemId_fkey" FOREIGN KEY ("designItemId") REFERENCES "design_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_observations" ADD CONSTRAINT "operational_observations_decisionExpectationId_fkey" FOREIGN KEY ("decisionExpectationId") REFERENCES "decision_expectations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "operational_observations" ADD CONSTRAINT "operational_observations_suppliedItemId_fkey" FOREIGN KEY ("suppliedItemId") REFERENCES "supplied_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_assessments" ADD CONSTRAINT "drift_assessments_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT: a drift assessment is meaningless without the baseline it compared
-- against, so the baseline cannot be deleted out from under its own history.
-- AddForeignKey
ALTER TABLE "drift_assessments" ADD CONSTRAINT "drift_assessments_baselineId_fkey" FOREIGN KEY ("baselineId") REFERENCES "engineering_baselines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_assessments" ADD CONSTRAINT "drift_assessments_evaluatedById_fkey" FOREIGN KEY ("evaluatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "drift_findings" ADD CONSTRAINT "drift_findings_assessmentId_fkey" FOREIGN KEY ("assessmentId") REFERENCES "drift_assessments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Observation subject
--
-- An observation is about one thing, or about nothing in particular. The
-- constraint is AT MOST one rather than exactly one — unlike evidence links and
-- change impacts, where a row with no subject is meaningless. A field report
-- that does not yet name the element it concerns is a real and useful record,
-- and forcing a subject onto it would invite somebody to guess at one.
-- ---------------------------------------------------------------------------

ALTER TABLE "operational_observations" ADD CONSTRAINT "operational_observations_at_most_one_subject" CHECK (
  ("designItemId" IS NOT NULL)::int
  + ("decisionExpectationId" IS NOT NULL)::int
  + ("suppliedItemId" IS NOT NULL)::int <= 1
);
