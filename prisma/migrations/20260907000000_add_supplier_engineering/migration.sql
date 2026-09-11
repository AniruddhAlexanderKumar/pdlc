-- Supplier engineering.
--
-- Additive: five new enums, eight new tables, and four new nullable columns on
-- two existing tables. No existing table is dropped, no existing column is
-- dropped or retyped, and no existing row is rewritten.
--
-- Two CHECK constraints ARE replaced, on `evidence_links` and
-- `change_request_impacts`. Each currently enforces "exactly one subject/target
-- is set" over a fixed column list, so adding a nullable column without
-- widening the constraint would make the new column permanently unusable. The
-- replacement is strictly wider: every row that satisfied the old constraint
-- satisfies the new one, so no existing data can be invalidated. Dropping and
-- re-adding is the only way PostgreSQL expresses this.
--
-- What is deliberately NOT here: purchase orders, invoices, contracts,
-- deliveries, prices, inventory, vendor scores and supplier health ratings.
-- This models supplier-side *engineering dependency*, not procurement.

-- CreateEnum
CREATE TYPE "SupplierStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'UNDER_REVIEW');

-- CreateEnum
CREATE TYPE "SuppliedItemType" AS ENUM ('PART', 'MATERIAL', 'PROCESS', 'SERVICE', 'SOFTWARE', 'OTHER');

-- CreateEnum
CREATE TYPE "SuppliedItemStatus" AS ENUM ('ACTIVE', 'OBSOLETE', 'UNDER_REVIEW');

-- CreateEnum
CREATE TYPE "SupplierQualificationType" AS ENUM ('PROCESS', 'MATERIAL', 'PART', 'SOURCE', 'OTHER');

-- CreateEnum
CREATE TYPE "SupplierQualificationStatus" AS ENUM ('PLANNED', 'ACTIVE', 'EXPIRED', 'WITHDRAWN');

-- AlterTable
ALTER TABLE "change_request_impacts" ADD COLUMN     "suppliedItemId" TEXT,
ADD COLUMN     "supplierId" TEXT;

-- AlterTable
ALTER TABLE "evidence_links" ADD COLUMN     "suppliedItemId" TEXT,
ADD COLUMN     "supplierQualificationId" TEXT;

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "SupplierStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplied_items" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "itemType" "SuppliedItemType" NOT NULL,
    "status" "SuppliedItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,

    CONSTRAINT "supplied_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_qualifications" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "qualificationType" "SupplierQualificationType" NOT NULL,
    "status" "SupplierQualificationStatus" NOT NULL DEFAULT 'PLANNED',
    "evidenceReference" TEXT,
    "effectiveDate" TIMESTAMP(3),
    "expiryDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "suppliedItemId" TEXT,

    CONSTRAINT "supplier_qualifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplied_item_design_links" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suppliedItemId" TEXT NOT NULL,
    "designItemId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "supplied_item_design_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplied_item_requirement_links" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suppliedItemId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "supplied_item_requirement_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplied_item_verification_links" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suppliedItemId" TEXT NOT NULL,
    "verificationActivityId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "supplied_item_verification_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplied_item_decision_links" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suppliedItemId" TEXT NOT NULL,
    "engineeringDecisionId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "supplied_item_decision_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplied_item_risk_links" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "suppliedItemId" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "supplied_item_risk_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "suppliers_projectId_status_idx" ON "suppliers"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_projectId_identifier_key" ON "suppliers"("projectId", "identifier");

-- CreateIndex
CREATE INDEX "supplied_items_projectId_status_idx" ON "supplied_items"("projectId", "status");

-- CreateIndex
CREATE INDEX "supplied_items_supplierId_idx" ON "supplied_items"("supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "supplied_items_projectId_identifier_key" ON "supplied_items"("projectId", "identifier");

-- CreateIndex
CREATE INDEX "supplier_qualifications_projectId_status_idx" ON "supplier_qualifications"("projectId", "status");

-- CreateIndex
CREATE INDEX "supplier_qualifications_supplierId_idx" ON "supplier_qualifications"("supplierId");

-- CreateIndex
CREATE INDEX "supplier_qualifications_suppliedItemId_idx" ON "supplier_qualifications"("suppliedItemId");

-- CreateIndex
CREATE INDEX "supplied_item_design_links_designItemId_idx" ON "supplied_item_design_links"("designItemId");

-- CreateIndex
CREATE UNIQUE INDEX "supplied_item_design_links_suppliedItemId_designItemId_key" ON "supplied_item_design_links"("suppliedItemId", "designItemId");

-- CreateIndex
CREATE INDEX "supplied_item_requirement_links_requirementId_idx" ON "supplied_item_requirement_links"("requirementId");

-- CreateIndex
-- Name truncated to PostgreSQL's 63-character identifier limit, matching
-- exactly what `prisma migrate diff` generates from the schema.
CREATE UNIQUE INDEX "supplied_item_requirement_links_suppliedItemId_requirementI_key" ON "supplied_item_requirement_links"("suppliedItemId", "requirementId");

-- CreateIndex
CREATE INDEX "supplied_item_verification_links_verificationActivityId_idx" ON "supplied_item_verification_links"("verificationActivityId");

-- CreateIndex
CREATE UNIQUE INDEX "supplied_item_verification_links_suppliedItemId_verificatio_key" ON "supplied_item_verification_links"("suppliedItemId", "verificationActivityId");

-- CreateIndex
CREATE INDEX "supplied_item_decision_links_engineeringDecisionId_idx" ON "supplied_item_decision_links"("engineeringDecisionId");

-- CreateIndex
CREATE UNIQUE INDEX "supplied_item_decision_links_suppliedItemId_engineeringDeci_key" ON "supplied_item_decision_links"("suppliedItemId", "engineeringDecisionId");

-- CreateIndex
CREATE INDEX "supplied_item_risk_links_riskId_idx" ON "supplied_item_risk_links"("riskId");

-- CreateIndex
CREATE UNIQUE INDEX "supplied_item_risk_links_suppliedItemId_riskId_key" ON "supplied_item_risk_links"("suppliedItemId", "riskId");

-- CreateIndex
CREATE INDEX "change_request_impacts_supplierId_idx" ON "change_request_impacts"("supplierId");

-- CreateIndex
CREATE INDEX "change_request_impacts_suppliedItemId_idx" ON "change_request_impacts"("suppliedItemId");

-- CreateIndex
CREATE UNIQUE INDEX "change_request_impacts_changeRequestId_supplierId_key" ON "change_request_impacts"("changeRequestId", "supplierId");

-- CreateIndex
CREATE UNIQUE INDEX "change_request_impacts_changeRequestId_suppliedItemId_key" ON "change_request_impacts"("changeRequestId", "suppliedItemId");

-- CreateIndex
CREATE INDEX "evidence_links_suppliedItemId_idx" ON "evidence_links"("suppliedItemId");

-- CreateIndex
CREATE INDEX "evidence_links_supplierQualificationId_idx" ON "evidence_links"("supplierQualificationId");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_links_evidenceId_suppliedItemId_key" ON "evidence_links"("evidenceId", "suppliedItemId");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_links_evidenceId_supplierQualificationId_key" ON "evidence_links"("evidenceId", "supplierQualificationId");

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplied_items" ADD CONSTRAINT "supplied_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RESTRICT, not CASCADE: deleting a supplier must not silently delete the items
-- the product depends on, along with every engineering link to them.
-- AddForeignKey
ALTER TABLE "supplied_items" ADD CONSTRAINT "supplied_items_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_qualifications" ADD CONSTRAINT "supplier_qualifications_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_qualifications" ADD CONSTRAINT "supplier_qualifications_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_qualifications" ADD CONSTRAINT "supplier_qualifications_suppliedItemId_fkey" FOREIGN KEY ("suppliedItemId") REFERENCES "supplied_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplied_item_design_links" ADD CONSTRAINT "supplied_item_design_links_suppliedItemId_fkey" FOREIGN KEY ("suppliedItemId") REFERENCES "supplied_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplied_item_design_links" ADD CONSTRAINT "supplied_item_design_links_designItemId_fkey" FOREIGN KEY ("designItemId") REFERENCES "design_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplied_item_design_links" ADD CONSTRAINT "supplied_item_design_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplied_item_requirement_links" ADD CONSTRAINT "supplied_item_requirement_links_suppliedItemId_fkey" FOREIGN KEY ("suppliedItemId") REFERENCES "supplied_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplied_item_requirement_links" ADD CONSTRAINT "supplied_item_requirement_links_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplied_item_requirement_links" ADD CONSTRAINT "supplied_item_requirement_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplied_item_verification_links" ADD CONSTRAINT "supplied_item_verification_links_suppliedItemId_fkey" FOREIGN KEY ("suppliedItemId") REFERENCES "supplied_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplied_item_verification_links" ADD CONSTRAINT "supplied_item_verification_links_verificationActivityId_fkey" FOREIGN KEY ("verificationActivityId") REFERENCES "verification_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplied_item_verification_links" ADD CONSTRAINT "supplied_item_verification_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplied_item_decision_links" ADD CONSTRAINT "supplied_item_decision_links_suppliedItemId_fkey" FOREIGN KEY ("suppliedItemId") REFERENCES "supplied_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplied_item_decision_links" ADD CONSTRAINT "supplied_item_decision_links_engineeringDecisionId_fkey" FOREIGN KEY ("engineeringDecisionId") REFERENCES "engineering_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplied_item_decision_links" ADD CONSTRAINT "supplied_item_decision_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplied_item_risk_links" ADD CONSTRAINT "supplied_item_risk_links_suppliedItemId_fkey" FOREIGN KEY ("suppliedItemId") REFERENCES "supplied_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplied_item_risk_links" ADD CONSTRAINT "supplied_item_risk_links_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "risks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplied_item_risk_links" ADD CONSTRAINT "supplied_item_risk_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_request_impacts" ADD CONSTRAINT "change_request_impacts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_request_impacts" ADD CONSTRAINT "change_request_impacts_suppliedItemId_fkey" FOREIGN KEY ("suppliedItemId") REFERENCES "supplied_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_suppliedItemId_fkey" FOREIGN KEY ("suppliedItemId") REFERENCES "supplied_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_supplierQualificationId_fkey" FOREIGN KEY ("supplierQualificationId") REFERENCES "supplier_qualifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Widened CHECK constraints
--
-- Both are replaced rather than added because each enforces "exactly one is
-- set" across a fixed column list. The new list is a superset of the old one,
-- so every row that satisfied the previous constraint still satisfies this one
-- — no existing data can be invalidated by applying this migration.
-- ---------------------------------------------------------------------------

-- A piece of evidence still supports exactly one artifact per link row; there
-- are now two more kinds of artifact it may support.
ALTER TABLE "evidence_links" DROP CONSTRAINT "evidence_links_exactly_one_subject";

ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_exactly_one_subject" CHECK (
  ("requirementId" IS NOT NULL)::int
  + ("engineeringDecisionId" IS NOT NULL)::int
  + ("verificationActivityId" IS NOT NULL)::int
  + ("suppliedItemId" IS NOT NULL)::int
  + ("supplierQualificationId" IS NOT NULL)::int = 1
);

-- A change impact row still names exactly one affected artifact. Supplier and
-- supplied item join the list so a supplier-side change is declared through the
-- same change request, and walked by the same impact engine, as any other.
ALTER TABLE "change_request_impacts" DROP CONSTRAINT "change_request_impacts_exactly_one_target";

ALTER TABLE "change_request_impacts" ADD CONSTRAINT "change_request_impacts_exactly_one_target" CHECK (
  ("requirementId" IS NOT NULL)::int
  + ("designItemId" IS NOT NULL)::int
  + ("engineeringDecisionId" IS NOT NULL)::int
  + ("verificationActivityId" IS NOT NULL)::int
  + ("riskId" IS NOT NULL)::int
  + ("issueId" IS NOT NULL)::int
  + ("supplierId" IS NOT NULL)::int
  + ("suppliedItemId" IS NOT NULL)::int = 1
);

-- ---------------------------------------------------------------------------
-- Cross-project integrity
--
-- A supplied item and its supplier must belong to the same project, and so must
-- a qualification and both its parents. That is enforced in the services, which
-- resolve every parent id inside the already-scoped project before writing, and
-- any row that still ended up crossing a project is reported by the existing
-- graph consistency check as a CROSS_PROJECT_ENDPOINT anomaly — reported, never
-- silently repaired.
--
-- This is deliberately the same mechanism every other relationship table in this
-- schema uses. Enforcing it with composite foreign keys onto (id, projectId)
-- would work, but only here, leaving one table protected by the database and
-- twenty by the service layer — an inconsistency that reads as a guarantee the
-- system does not actually make.
-- ---------------------------------------------------------------------------
