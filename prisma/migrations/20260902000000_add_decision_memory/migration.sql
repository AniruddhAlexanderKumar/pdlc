-- Adds decision memory: structured alternatives, assumptions and a single
-- expectation per engineering decision. Purely additive — the existing
-- engineering_decisions table and every relationship table are untouched, so
-- no decision, link or project data is altered or lost.

-- CreateEnum
CREATE TYPE "AssumptionStatus" AS ENUM ('ACTIVE', 'VALIDATED', 'INVALIDATED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ExpectationStatus" AS ENUM ('NOT_OBSERVED', 'HELD', 'BREACHED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "decision_alternatives" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "reasonRejected" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "engineeringDecisionId" TEXT NOT NULL,

    CONSTRAINT "decision_alternatives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_assumptions" (
    "id" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "status" "AssumptionStatus" NOT NULL DEFAULT 'UNKNOWN',
    "rationale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "engineeringDecisionId" TEXT NOT NULL,

    CONSTRAINT "decision_assumptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_expectations" (
    "id" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "measure" TEXT,
    "expectedValue" TEXT,
    "unit" TEXT,
    "dueAt" TIMESTAMP(3),
    "status" "ExpectationStatus" NOT NULL DEFAULT 'NOT_OBSERVED',
    "actualValue" TEXT,
    "observedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "engineeringDecisionId" TEXT NOT NULL,

    CONSTRAINT "decision_expectations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "decision_alternatives_engineeringDecisionId_idx" ON "decision_alternatives"("engineeringDecisionId");

-- CreateIndex
CREATE INDEX "decision_assumptions_engineeringDecisionId_idx" ON "decision_assumptions"("engineeringDecisionId");

-- CreateIndex
CREATE INDEX "decision_assumptions_status_idx" ON "decision_assumptions"("status");

-- CreateIndex: one expectation per decision
CREATE UNIQUE INDEX "decision_expectations_engineeringDecisionId_key" ON "decision_expectations"("engineeringDecisionId");

-- AddForeignKey
ALTER TABLE "decision_alternatives" ADD CONSTRAINT "decision_alternatives_engineeringDecisionId_fkey" FOREIGN KEY ("engineeringDecisionId") REFERENCES "engineering_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_assumptions" ADD CONSTRAINT "decision_assumptions_engineeringDecisionId_fkey" FOREIGN KEY ("engineeringDecisionId") REFERENCES "engineering_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_expectations" ADD CONSTRAINT "decision_expectations_engineeringDecisionId_fkey" FOREIGN KEY ("engineeringDecisionId") REFERENCES "engineering_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
