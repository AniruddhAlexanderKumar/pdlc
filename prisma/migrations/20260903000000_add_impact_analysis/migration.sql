-- Change-impact analysis.
--
-- Purely additive: three new enums and three new tables, plus the foreign keys
-- from those tables into existing ones. No existing table, column, index or
-- constraint is altered or dropped, so applying this preserves all data.
--
-- Computed impact lives here; declared impact stays in change_request_impacts.
-- Neither is a copy of the engineering graph — findings cite artifacts by
-- (nodeType, nodeId) and name the relationship rows they were reached through.

-- CreateEnum
CREATE TYPE "ImpactAnalysisStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ImpactClassification" AS ENUM ('DIRECT', 'DOWNSTREAM', 'CROSS_DOMAIN', 'UPSTREAM_CONTEXT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ImpactFindingStatus" AS ENUM ('POTENTIALLY_AFFECTED', 'NOT_EVALUATED', 'UNKNOWN');

-- CreateTable
CREATE TABLE "impact_analyses" (
    "id" TEXT NOT NULL,
    "status" "ImpactAnalysisStatus" NOT NULL DEFAULT 'RUNNING',
    "engineVersion" TEXT NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "failureReason" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "rootCount" INTEGER NOT NULL DEFAULT 0,
    "findingCount" INTEGER NOT NULL DEFAULT 0,
    "directCount" INTEGER NOT NULL DEFAULT 0,
    "downstreamCount" INTEGER NOT NULL DEFAULT 0,
    "crossDomainCount" INTEGER NOT NULL DEFAULT 0,
    "upstreamContextCount" INTEGER NOT NULL DEFAULT 0,
    "unknownCount" INTEGER NOT NULL DEFAULT 0,
    "notEvaluatedCount" INTEGER NOT NULL DEFAULT 0,
    "maxDepth" INTEGER NOT NULL,
    "maxNodes" INTEGER NOT NULL,
    "maxEdges" INTEGER NOT NULL,
    "truncated" BOOLEAN NOT NULL DEFAULT false,
    "truncatedBy" TEXT,
    "projectId" TEXT NOT NULL,
    "changeRequestId" TEXT NOT NULL,
    "requestedById" TEXT,

    CONSTRAINT "impact_analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impact_analysis_roots" (
    "id" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "identifier" TEXT,
    "label" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT true,
    "declaredImpactId" TEXT,
    "analysisId" TEXT NOT NULL,

    CONSTRAINT "impact_analysis_roots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "impact_findings" (
    "id" TEXT NOT NULL,
    "nodeType" TEXT NOT NULL,
    "nodeId" TEXT NOT NULL,
    "identifier" TEXT,
    "label" TEXT NOT NULL,
    "classification" "ImpactClassification" NOT NULL,
    "status" "ImpactFindingStatus" NOT NULL,
    "depth" INTEGER NOT NULL,
    "basis" TEXT[],
    "path" JSONB NOT NULL,
    "alternatePathCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "analysisId" TEXT NOT NULL,
    "rootId" TEXT NOT NULL,

    CONSTRAINT "impact_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "impact_analyses_changeRequestId_startedAt_idx" ON "impact_analyses"("changeRequestId", "startedAt");

-- CreateIndex
CREATE INDEX "impact_analyses_projectId_startedAt_idx" ON "impact_analyses"("projectId", "startedAt");

-- CreateIndex
CREATE INDEX "impact_analysis_roots_analysisId_idx" ON "impact_analysis_roots"("analysisId");

-- CreateIndex
CREATE UNIQUE INDEX "impact_analysis_roots_analysisId_nodeType_nodeId_key" ON "impact_analysis_roots"("analysisId", "nodeType", "nodeId");

-- CreateIndex
CREATE INDEX "impact_findings_analysisId_classification_idx" ON "impact_findings"("analysisId", "classification");

-- CreateIndex
CREATE INDEX "impact_findings_rootId_idx" ON "impact_findings"("rootId");

-- CreateIndex
CREATE UNIQUE INDEX "impact_findings_analysisId_nodeType_nodeId_key" ON "impact_findings"("analysisId", "nodeType", "nodeId");

-- AddForeignKey
ALTER TABLE "impact_analyses" ADD CONSTRAINT "impact_analyses_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_analyses" ADD CONSTRAINT "impact_analyses_changeRequestId_fkey" FOREIGN KEY ("changeRequestId") REFERENCES "change_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_analyses" ADD CONSTRAINT "impact_analyses_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_analysis_roots" ADD CONSTRAINT "impact_analysis_roots_declaredImpactId_fkey" FOREIGN KEY ("declaredImpactId") REFERENCES "change_request_impacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_analysis_roots" ADD CONSTRAINT "impact_analysis_roots_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "impact_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_findings" ADD CONSTRAINT "impact_findings_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "impact_analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "impact_findings" ADD CONSTRAINT "impact_findings_rootId_fkey" FOREIGN KEY ("rootId") REFERENCES "impact_analysis_roots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
