-- Certification workspace.
--
-- Additive: eleven new enums, thirteen new tables, and one new nullable
-- column on an existing table. No existing table is dropped, no existing
-- column is dropped or retyped, and no existing row is rewritten.
--
-- One CHECK constraint IS replaced, on `evidence_links`. It currently
-- enforces "exactly one subject is set" over a fixed column list, so adding a
-- nullable column without widening the constraint would make the new column
-- permanently unusable. The replacement is strictly wider: every row that
-- satisfied the old constraint satisfies the new one, so no existing data can
-- be invalidated. Dropping and re-adding is the only way PostgreSQL
-- expresses this.
--
-- Seven of the eleven new tables are one-typed-join-table-per-relationship,
-- mirroring RiskRequirementLink / SuppliedItemDesignLink exactly: no
-- polymorphic entityType/entityId pair anywhere. The eighth relationship
-- (ComplianceItem -> Evidence) reuses the existing `evidence_links` table via
-- the new nullable column, exactly as SuppliedItem and SupplierQualification
-- already do — there is no second, certification-specific evidence store.
--
-- What is deliberately NOT here: any numeric compliance score, any
-- regulatory-approval status, any document/file storage. This models an
-- internal certification workspace built on top of the existing engineering
-- system, not a claim of certification and not a document management system.

-- CreateEnum
CREATE TYPE "CertificationProgramStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ON_HOLD', 'CLOSED');

-- CreateEnum
CREATE TYPE "CertificationBasisStatus" AS ENUM ('DRAFT', 'ACTIVE', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "ComplianceApplicability" AS ENUM ('APPLICABLE', 'NOT_APPLICABLE', 'UNDETERMINED');

-- CreateEnum
CREATE TYPE "ComplianceItemStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'SATISFIED', 'BLOCKED', 'WAIVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ComplianceDisposition" AS ENUM ('UNASSESSED', 'COMPLIANT', 'NON_COMPLIANT', 'NOT_APPLICABLE', 'OPEN_FINDING');

-- CreateEnum
CREATE TYPE "ComplianceMethod" AS ENUM ('ANALYSIS', 'TEST', 'INSPECTION', 'DEMONSTRATION', 'REVIEW_OF_DESIGN', 'DOCUMENTATION', 'OTHER');

-- CreateEnum
CREATE TYPE "CertificationFindingSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "CertificationFindingStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'ACCEPTED');

-- CreateEnum
CREATE TYPE "CertificationReviewStatus" AS ENUM ('READY', 'NOT_READY', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CertificationReviewCategory" AS ENUM ('APPLICABILITY', 'COMPLIANCE_ITEM', 'REQUIREMENT', 'VERIFICATION', 'EVIDENCE', 'DECISION', 'DESIGN', 'SUPPLIER', 'FINDING', 'CHANGE_IMPACT', 'DRIFT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "CertificationReviewFindingStatus" AS ENUM ('BLOCKING', 'WARNING', 'INFORMATIONAL', 'UNKNOWN');

-- AlterTable
ALTER TABLE "evidence_links" ADD COLUMN "complianceItemId" TEXT;

-- CreateTable
CREATE TABLE "certification_programs" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "CertificationProgramStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "ownerId" TEXT,

    CONSTRAINT "certification_programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certification_bases" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "revision" TEXT NOT NULL,
    "sourceReference" TEXT,
    "status" "CertificationBasisStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "activatedAt" TIMESTAMP(3),
    "certificationProgramId" TEXT NOT NULL,
    "createdById" TEXT,
    "activatedById" TEXT,
    "supersededById" TEXT,

    CONSTRAINT "certification_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_items" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "applicability" "ComplianceApplicability" NOT NULL DEFAULT 'UNDETERMINED',
    "applicabilityRationale" TEXT,
    "applicabilityReviewedAt" TIMESTAMP(3),
    "method" "ComplianceMethod",
    "status" "ComplianceItemStatus" NOT NULL DEFAULT 'OPEN',
    "disposition" "ComplianceDisposition" NOT NULL DEFAULT 'UNASSESSED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "certificationBasisId" TEXT NOT NULL,
    "applicabilityReviewerId" TEXT,

    CONSTRAINT "compliance_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_item_requirement_links" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "complianceItemId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "compliance_item_requirement_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_item_verification_links" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "complianceItemId" TEXT NOT NULL,
    "verificationActivityId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "compliance_item_verification_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_item_decision_links" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "complianceItemId" TEXT NOT NULL,
    "engineeringDecisionId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "compliance_item_decision_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_item_design_links" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "complianceItemId" TEXT NOT NULL,
    "designItemId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "compliance_item_design_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_item_risk_links" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "complianceItemId" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "compliance_item_risk_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_item_issue_links" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "complianceItemId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "compliance_item_issue_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compliance_item_supplier_qualification_links" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "complianceItemId" TEXT NOT NULL,
    "supplierQualificationId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "compliance_item_supplier_qualification_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certification_findings" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" "CertificationFindingSeverity" NOT NULL,
    "status" "CertificationFindingStatus" NOT NULL DEFAULT 'OPEN',
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resolvedAt" TIMESTAMP(3),
    "complianceItemId" TEXT NOT NULL,
    "evidenceId" TEXT,
    "resolvedById" TEXT,

    CONSTRAINT "certification_findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certification_reviews" (
    "id" TEXT NOT NULL,
    "status" "CertificationReviewStatus" NOT NULL,
    "reviewVersion" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "basis" JSONB NOT NULL,
    "summary" TEXT,
    "findingCount" INTEGER NOT NULL DEFAULT 0,
    "blockingCount" INTEGER NOT NULL DEFAULT 0,
    "warningCount" INTEGER NOT NULL DEFAULT 0,
    "informationalCount" INTEGER NOT NULL DEFAULT 0,
    "unknownCount" INTEGER NOT NULL DEFAULT 0,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "certificationProgramId" TEXT NOT NULL,
    "evaluatedById" TEXT,

    CONSTRAINT "certification_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certification_review_findings" (
    "id" TEXT NOT NULL,
    "ruleId" TEXT NOT NULL,
    "category" "CertificationReviewCategory" NOT NULL,
    "status" "CertificationReviewFindingStatus" NOT NULL,
    "subjectType" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "subjectIdentifier" TEXT,
    "subjectLabel" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "basis" TEXT[],
    "sequence" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewId" TEXT NOT NULL,

    CONSTRAINT "certification_review_findings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evidence_links_complianceItemId_idx" ON "evidence_links"("complianceItemId");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_links_evidenceId_complianceItemId_key" ON "evidence_links"("evidenceId", "complianceItemId");

-- CreateIndex
CREATE UNIQUE INDEX "certification_programs_projectId_key" ON "certification_programs"("projectId");

-- CreateIndex
CREATE INDEX "certification_bases_certificationProgramId_status_idx" ON "certification_bases"("certificationProgramId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "certification_bases_certificationProgramId_identifier_key" ON "certification_bases"("certificationProgramId", "identifier");

-- CreateIndex
CREATE INDEX "compliance_items_certificationBasisId_status_idx" ON "compliance_items"("certificationBasisId", "status");

-- CreateIndex
CREATE INDEX "compliance_items_certificationBasisId_applicability_idx" ON "compliance_items"("certificationBasisId", "applicability");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_items_certificationBasisId_identifier_key" ON "compliance_items"("certificationBasisId", "identifier");

-- CreateIndex
CREATE INDEX "compliance_item_requirement_links_requirementId_idx" ON "compliance_item_requirement_links"("requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_item_requirement_links_complianceItemId_requirem_key" ON "compliance_item_requirement_links"("complianceItemId", "requirementId");

-- CreateIndex
CREATE INDEX "compliance_item_verification_links_verificationActivityId_idx" ON "compliance_item_verification_links"("verificationActivityId");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_item_verification_links_complianceItemId_verific_key" ON "compliance_item_verification_links"("complianceItemId", "verificationActivityId");

-- CreateIndex
CREATE INDEX "compliance_item_decision_links_engineeringDecisionId_idx" ON "compliance_item_decision_links"("engineeringDecisionId");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_item_decision_links_complianceItemId_engineering_key" ON "compliance_item_decision_links"("complianceItemId", "engineeringDecisionId");

-- CreateIndex
CREATE INDEX "compliance_item_design_links_designItemId_idx" ON "compliance_item_design_links"("designItemId");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_item_design_links_complianceItemId_designItemId_key" ON "compliance_item_design_links"("complianceItemId", "designItemId");

-- CreateIndex
CREATE INDEX "compliance_item_risk_links_riskId_idx" ON "compliance_item_risk_links"("riskId");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_item_risk_links_complianceItemId_riskId_key" ON "compliance_item_risk_links"("complianceItemId", "riskId");

-- CreateIndex
CREATE INDEX "compliance_item_issue_links_issueId_idx" ON "compliance_item_issue_links"("issueId");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_item_issue_links_complianceItemId_issueId_key" ON "compliance_item_issue_links"("complianceItemId", "issueId");

-- CreateIndex
CREATE INDEX "compliance_item_supplier_qualification_links_supplierQualif_idx" ON "compliance_item_supplier_qualification_links"("supplierQualificationId");

-- CreateIndex
CREATE UNIQUE INDEX "compliance_item_supplier_qualification_links_complianceItem_key" ON "compliance_item_supplier_qualification_links"("complianceItemId", "supplierQualificationId");

-- CreateIndex
CREATE INDEX "certification_findings_complianceItemId_status_idx" ON "certification_findings"("complianceItemId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "certification_findings_complianceItemId_identifier_key" ON "certification_findings"("complianceItemId", "identifier");

-- CreateIndex
CREATE INDEX "certification_reviews_certificationProgramId_evaluatedAt_idx" ON "certification_reviews"("certificationProgramId", "evaluatedAt");

-- CreateIndex
CREATE INDEX "certification_review_findings_reviewId_sequence_idx" ON "certification_review_findings"("reviewId", "sequence");

-- CreateIndex
CREATE INDEX "certification_review_findings_reviewId_status_idx" ON "certification_review_findings"("reviewId", "status");

-- AddForeignKey
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_complianceItemId_fkey" FOREIGN KEY ("complianceItemId") REFERENCES "compliance_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_programs" ADD CONSTRAINT "certification_programs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_programs" ADD CONSTRAINT "certification_programs_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_bases" ADD CONSTRAINT "certification_bases_certificationProgramId_fkey" FOREIGN KEY ("certificationProgramId") REFERENCES "certification_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_bases" ADD CONSTRAINT "certification_bases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_bases" ADD CONSTRAINT "certification_bases_activatedById_fkey" FOREIGN KEY ("activatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_bases" ADD CONSTRAINT "certification_bases_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "certification_bases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_items" ADD CONSTRAINT "compliance_items_certificationBasisId_fkey" FOREIGN KEY ("certificationBasisId") REFERENCES "certification_bases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_items" ADD CONSTRAINT "compliance_items_applicabilityReviewerId_fkey" FOREIGN KEY ("applicabilityReviewerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_item_requirement_links" ADD CONSTRAINT "compliance_item_requirement_links_complianceItemId_fkey" FOREIGN KEY ("complianceItemId") REFERENCES "compliance_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_item_requirement_links" ADD CONSTRAINT "compliance_item_requirement_links_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_item_requirement_links" ADD CONSTRAINT "compliance_item_requirement_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_item_verification_links" ADD CONSTRAINT "compliance_item_verification_links_complianceItemId_fkey" FOREIGN KEY ("complianceItemId") REFERENCES "compliance_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_item_verification_links" ADD CONSTRAINT "compliance_item_verification_links_verificationActivityId_fkey" FOREIGN KEY ("verificationActivityId") REFERENCES "verification_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_item_verification_links" ADD CONSTRAINT "compliance_item_verification_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_item_decision_links" ADD CONSTRAINT "compliance_item_decision_links_complianceItemId_fkey" FOREIGN KEY ("complianceItemId") REFERENCES "compliance_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_item_decision_links" ADD CONSTRAINT "compliance_item_decision_links_engineeringDecisionId_fkey" FOREIGN KEY ("engineeringDecisionId") REFERENCES "engineering_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_item_decision_links" ADD CONSTRAINT "compliance_item_decision_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_item_design_links" ADD CONSTRAINT "compliance_item_design_links_complianceItemId_fkey" FOREIGN KEY ("complianceItemId") REFERENCES "compliance_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_item_design_links" ADD CONSTRAINT "compliance_item_design_links_designItemId_fkey" FOREIGN KEY ("designItemId") REFERENCES "design_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_item_design_links" ADD CONSTRAINT "compliance_item_design_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_item_risk_links" ADD CONSTRAINT "compliance_item_risk_links_complianceItemId_fkey" FOREIGN KEY ("complianceItemId") REFERENCES "compliance_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_item_risk_links" ADD CONSTRAINT "compliance_item_risk_links_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "risks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_item_risk_links" ADD CONSTRAINT "compliance_item_risk_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_item_issue_links" ADD CONSTRAINT "compliance_item_issue_links_complianceItemId_fkey" FOREIGN KEY ("complianceItemId") REFERENCES "compliance_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_item_issue_links" ADD CONSTRAINT "compliance_item_issue_links_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_item_issue_links" ADD CONSTRAINT "compliance_item_issue_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_item_supplier_qualification_links" ADD CONSTRAINT "compliance_item_supplier_qualification_links_complianceIte_fkey" FOREIGN KEY ("complianceItemId") REFERENCES "compliance_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_item_supplier_qualification_links" ADD CONSTRAINT "compliance_item_supplier_qualification_links_supplierQuali_fkey" FOREIGN KEY ("supplierQualificationId") REFERENCES "supplier_qualifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compliance_item_supplier_qualification_links" ADD CONSTRAINT "compliance_item_supplier_qualification_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_findings" ADD CONSTRAINT "certification_findings_complianceItemId_fkey" FOREIGN KEY ("complianceItemId") REFERENCES "compliance_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_findings" ADD CONSTRAINT "certification_findings_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidence"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_findings" ADD CONSTRAINT "certification_findings_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_reviews" ADD CONSTRAINT "certification_reviews_certificationProgramId_fkey" FOREIGN KEY ("certificationProgramId") REFERENCES "certification_programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_reviews" ADD CONSTRAINT "certification_reviews_evaluatedById_fkey" FOREIGN KEY ("evaluatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_review_findings" ADD CONSTRAINT "certification_review_findings_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "certification_reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Widened CHECK constraint
--
-- Replaced rather than added because it enforces "exactly one is set" across
-- a fixed column list. The new list is a superset of the old one, so every
-- row that satisfied the previous constraint still satisfies this one — no
-- existing data can be invalidated by applying this migration.
-- ---------------------------------------------------------------------------

ALTER TABLE "evidence_links" DROP CONSTRAINT "evidence_links_exactly_one_subject";

ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_exactly_one_subject" CHECK (
  ("requirementId" IS NOT NULL)::int
  + ("engineeringDecisionId" IS NOT NULL)::int
  + ("verificationActivityId" IS NOT NULL)::int
  + ("suppliedItemId" IS NOT NULL)::int
  + ("supplierQualificationId" IS NOT NULL)::int
  + ("complianceItemId" IS NOT NULL)::int = 1
);
