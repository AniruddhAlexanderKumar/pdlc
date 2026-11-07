-- Evidence as a real, controlled engineering record: identifier, lifecycle
-- status, and who recorded/validated/superseded it. Additive only — no
-- existing table, column, index, constraint or enum is altered or dropped
-- except the one enum widening at the end.
--
-- `identifier`, `status` and the actor foreign keys are added as NOT NULL
-- (matching what `prisma migrate diff --from-empty` produces) rather than
-- nullable-then-backfilled: no PostgreSQL instance has ever been deployed
-- with this schema, so there is no existing `evidence` row this could ever
-- conflict with. `status` carries its own DEFAULT so the column is well
-- formed the moment it exists; `identifier` has none, exactly as every other
-- artifact's project-scoped identifier in this schema has none.

-- CreateEnum
CREATE TYPE "EvidenceStatus" AS ENUM ('DRAFT', 'VALIDATED', 'SUPERSEDED');

-- AlterTable
ALTER TABLE "evidence"
  ADD COLUMN "identifier" TEXT NOT NULL,
  ADD COLUMN "status" "EvidenceStatus" NOT NULL DEFAULT 'DRAFT',
  ADD COLUMN "recordedById" TEXT,
  ADD COLUMN "validatedById" TEXT,
  ADD COLUMN "validatedAt" TIMESTAMP(3),
  ADD COLUMN "supersededAt" TIMESTAMP(3),
  ADD COLUMN "supersededById" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "evidence_projectId_identifier_key" ON "evidence"("projectId", "identifier");

-- CreateIndex
CREATE INDEX "evidence_projectId_status_idx" ON "evidence"("projectId", "status");

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- The Decision Sentinel gains Evidence as a surveillance source, the same
-- enum-widening shape (an addition, never a removal) used for Risk/Issue in
-- the migration immediately before this one.
-- AlterEnum
ALTER TYPE "SurveillanceSourceType" ADD VALUE 'EVIDENCE';
