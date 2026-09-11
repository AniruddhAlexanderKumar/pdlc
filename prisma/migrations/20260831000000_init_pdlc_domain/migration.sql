-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'ENGINEER', 'VIEWER');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "StakeholderNeedStatus" AS ENUM ('DRAFT', 'ACCEPTED', 'REJECTED', 'OBSOLETE');

-- CreateEnum
CREATE TYPE "RequirementStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'BASELINED', 'OBSOLETE');

-- CreateEnum
CREATE TYPE "RequirementPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "DecisionStatus" AS ENUM ('PROPOSED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "DesignItemType" AS ENUM ('SYSTEM', 'SUBSYSTEM', 'ASSEMBLY', 'COMPONENT', 'SOFTWARE', 'OTHER');

-- CreateEnum
CREATE TYPE "DesignItemStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'BASELINED', 'OBSOLETE');

-- CreateEnum
CREATE TYPE "InterfaceType" AS ENUM ('MECHANICAL', 'ELECTRICAL', 'THERMAL', 'FLUID', 'DATA', 'SOFTWARE', 'OTHER');

-- CreateEnum
CREATE TYPE "InterfaceStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'APPROVED', 'BASELINED', 'OBSOLETE');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('ANALYSIS', 'INSPECTION', 'TEST', 'DEMONSTRATION');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PLANNED', 'IN_PROGRESS', 'PASSED', 'FAILED', 'WAIVED');

-- CreateEnum
CREATE TYPE "RiskStatus" AS ENUM ('OPEN', 'MITIGATED', 'ACCEPTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED');

-- CreateEnum
CREATE TYPE "ChangeRequestStatus" AS ENUM ('DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'IMPLEMENTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('DOCUMENT', 'TEST_RESULT', 'ANALYSIS', 'INSPECTION', 'MEASUREMENT', 'EXTERNAL_REFERENCE', 'OTHER');

-- CreateEnum
CREATE TYPE "ApprovalDecision" AS ENUM ('APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RequirementLinkType" AS ENUM ('DECOMPOSES_TO', 'DEPENDS_ON', 'REFINES', 'CONFLICTS_WITH');

-- CreateEnum
CREATE TYPE "RequirementDesignLinkType" AS ENUM ('ALLOCATED_TO', 'SATISFIED_BY');

-- CreateEnum
CREATE TYPE "RequirementDecisionLinkType" AS ENUM ('DECISION_ADDRESSES_REQUIREMENT', 'REQUIREMENT_DERIVED_FROM_DECISION');

-- CreateEnum
CREATE TYPE "DesignItemLinkType" AS ENUM ('CONTAINS', 'DEPENDS_ON');

-- CreateEnum
CREATE TYPE "DesignInterfaceLinkType" AS ENUM ('PROVIDES', 'CONSUMES', 'PARTICIPATES');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'ENGINEER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL,
    "actorId" TEXT,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stakeholder_needs" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "stakeholder" TEXT NOT NULL,
    "status" "StakeholderNeedStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "stakeholder_needs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirements" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "rationale" TEXT,
    "status" "RequirementStatus" NOT NULL DEFAULT 'DRAFT',
    "priority" "RequirementPriority" NOT NULL DEFAULT 'MEDIUM',
    "source" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "ownerId" TEXT,

    CONSTRAINT "requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "engineering_decisions" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "statement" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "alternativesConsidered" TEXT,
    "assumptions" TEXT,
    "status" "DecisionStatus" NOT NULL DEFAULT 'PROPOSED',
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "ownerId" TEXT,

    CONSTRAINT "engineering_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_items" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "itemType" "DesignItemType" NOT NULL,
    "status" "DesignItemStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "ownerId" TEXT,

    CONSTRAINT "design_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interface_definitions" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "interfaceType" "InterfaceType" NOT NULL,
    "status" "InterfaceStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "interface_definitions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_activities" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "method" "VerificationMethod" NOT NULL,
    "status" "VerificationStatus" NOT NULL DEFAULT 'PLANNED',
    "plannedDate" TIMESTAMP(3),
    "completedDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "ownerId" TEXT,

    CONSTRAINT "verification_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risks" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cause" TEXT,
    "consequence" TEXT,
    "status" "RiskStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "ownerId" TEXT,

    CONSTRAINT "risks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issues" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "IssueSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "IssueStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "ownerId" TEXT,

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_requests" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "ChangeRequestStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,

    CONSTRAINT "change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "evidenceType" "EvidenceType" NOT NULL,
    "sourceReference" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT NOT NULL,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approvals" (
    "id" TEXT NOT NULL,
    "decision" "ApprovalDecision" NOT NULL,
    "comment" TEXT,
    "decidedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT NOT NULL,
    "approverId" TEXT NOT NULL,
    "requirementId" TEXT,
    "engineeringDecisionId" TEXT,
    "changeRequestId" TEXT,

    CONSTRAINT "approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "need_requirement_links" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "stakeholderNeedId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "need_requirement_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_links" (
    "id" TEXT NOT NULL,
    "linkType" "RequirementLinkType" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceRequirementId" TEXT NOT NULL,
    "targetRequirementId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "requirement_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_design_links" (
    "id" TEXT NOT NULL,
    "linkType" "RequirementDesignLinkType" NOT NULL DEFAULT 'ALLOCATED_TO',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requirementId" TEXT NOT NULL,
    "designItemId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "requirement_design_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_verification_links" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requirementId" TEXT NOT NULL,
    "verificationActivityId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "requirement_verification_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "requirement_decision_links" (
    "id" TEXT NOT NULL,
    "linkType" "RequirementDecisionLinkType" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "requirementId" TEXT NOT NULL,
    "engineeringDecisionId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "requirement_decision_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_design_links" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "engineeringDecisionId" TEXT NOT NULL,
    "designItemId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "decision_design_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_risk_links" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "engineeringDecisionId" TEXT NOT NULL,
    "riskId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "decision_risk_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decision_issue_links" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "engineeringDecisionId" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "decision_issue_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_item_links" (
    "id" TEXT NOT NULL,
    "linkType" "DesignItemLinkType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sourceDesignItemId" TEXT NOT NULL,
    "targetDesignItemId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "design_item_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "design_interface_links" (
    "id" TEXT NOT NULL,
    "linkType" "DesignInterfaceLinkType" NOT NULL DEFAULT 'PARTICIPATES',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "designItemId" TEXT NOT NULL,
    "interfaceDefinitionId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "design_interface_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_requirement_links" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "riskId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "risk_requirement_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "risk_design_links" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "riskId" TEXT NOT NULL,
    "designItemId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "risk_design_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_requirement_links" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issueId" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "issue_requirement_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_design_links" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issueId" TEXT NOT NULL,
    "designItemId" TEXT NOT NULL,
    "createdById" TEXT,

    CONSTRAINT "issue_design_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "change_request_impacts" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "changeRequestId" TEXT NOT NULL,
    "requirementId" TEXT,
    "designItemId" TEXT,
    "engineeringDecisionId" TEXT,
    "verificationActivityId" TEXT,
    "riskId" TEXT,
    "issueId" TEXT,
    "createdById" TEXT,

    CONSTRAINT "change_request_impacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_links" (
    "id" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "evidenceId" TEXT NOT NULL,
    "requirementId" TEXT,
    "engineeringDecisionId" TEXT,
    "verificationActivityId" TEXT,
    "createdById" TEXT,

    CONSTRAINT "evidence_links_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_slug_key" ON "organizations"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- CreateIndex
CREATE INDEX "audit_logs_organizationId_createdAt_idx" ON "audit_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "projects_organizationId_status_idx" ON "projects"("organizationId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "projects_organizationId_name_key" ON "projects"("organizationId", "name");

-- CreateIndex
CREATE INDEX "stakeholder_needs_projectId_status_idx" ON "stakeholder_needs"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "stakeholder_needs_projectId_identifier_key" ON "stakeholder_needs"("projectId", "identifier");

-- CreateIndex
CREATE INDEX "requirements_projectId_status_idx" ON "requirements"("projectId", "status");

-- CreateIndex
CREATE INDEX "requirements_ownerId_idx" ON "requirements"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "requirements_projectId_identifier_key" ON "requirements"("projectId", "identifier");

-- CreateIndex
CREATE INDEX "engineering_decisions_projectId_status_idx" ON "engineering_decisions"("projectId", "status");

-- CreateIndex
CREATE INDEX "engineering_decisions_ownerId_idx" ON "engineering_decisions"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "engineering_decisions_projectId_identifier_key" ON "engineering_decisions"("projectId", "identifier");

-- CreateIndex
CREATE INDEX "design_items_projectId_status_idx" ON "design_items"("projectId", "status");

-- CreateIndex
CREATE INDEX "design_items_projectId_itemType_idx" ON "design_items"("projectId", "itemType");

-- CreateIndex
CREATE INDEX "design_items_ownerId_idx" ON "design_items"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "design_items_projectId_identifier_key" ON "design_items"("projectId", "identifier");

-- CreateIndex
CREATE INDEX "interface_definitions_projectId_status_idx" ON "interface_definitions"("projectId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "interface_definitions_projectId_identifier_key" ON "interface_definitions"("projectId", "identifier");

-- CreateIndex
CREATE INDEX "verification_activities_projectId_status_idx" ON "verification_activities"("projectId", "status");

-- CreateIndex
CREATE INDEX "verification_activities_ownerId_idx" ON "verification_activities"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "verification_activities_projectId_identifier_key" ON "verification_activities"("projectId", "identifier");

-- CreateIndex
CREATE INDEX "risks_projectId_status_idx" ON "risks"("projectId", "status");

-- CreateIndex
CREATE INDEX "risks_ownerId_idx" ON "risks"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "risks_projectId_identifier_key" ON "risks"("projectId", "identifier");

-- CreateIndex
CREATE INDEX "issues_projectId_status_idx" ON "issues"("projectId", "status");

-- CreateIndex
CREATE INDEX "issues_ownerId_idx" ON "issues"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "issues_projectId_identifier_key" ON "issues"("projectId", "identifier");

-- CreateIndex
CREATE INDEX "change_requests_projectId_status_idx" ON "change_requests"("projectId", "status");

-- CreateIndex
CREATE INDEX "change_requests_requestedById_idx" ON "change_requests"("requestedById");

-- CreateIndex
CREATE UNIQUE INDEX "change_requests_projectId_identifier_key" ON "change_requests"("projectId", "identifier");

-- CreateIndex
CREATE INDEX "evidence_projectId_evidenceType_idx" ON "evidence"("projectId", "evidenceType");

-- CreateIndex
CREATE INDEX "approvals_projectId_decidedAt_idx" ON "approvals"("projectId", "decidedAt");

-- CreateIndex
CREATE INDEX "approvals_approverId_idx" ON "approvals"("approverId");

-- CreateIndex
CREATE INDEX "approvals_requirementId_idx" ON "approvals"("requirementId");

-- CreateIndex
CREATE INDEX "approvals_engineeringDecisionId_idx" ON "approvals"("engineeringDecisionId");

-- CreateIndex
CREATE INDEX "approvals_changeRequestId_idx" ON "approvals"("changeRequestId");

-- CreateIndex
CREATE INDEX "need_requirement_links_requirementId_idx" ON "need_requirement_links"("requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "need_requirement_links_stakeholderNeedId_requirementId_key" ON "need_requirement_links"("stakeholderNeedId", "requirementId");

-- CreateIndex
CREATE INDEX "requirement_links_targetRequirementId_idx" ON "requirement_links"("targetRequirementId");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_links_sourceRequirementId_targetRequirementId_l_key" ON "requirement_links"("sourceRequirementId", "targetRequirementId", "linkType");

-- CreateIndex
CREATE INDEX "requirement_design_links_designItemId_idx" ON "requirement_design_links"("designItemId");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_design_links_requirementId_designItemId_linkTyp_key" ON "requirement_design_links"("requirementId", "designItemId", "linkType");

-- CreateIndex
CREATE INDEX "requirement_verification_links_verificationActivityId_idx" ON "requirement_verification_links"("verificationActivityId");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_verification_links_requirementId_verificationAc_key" ON "requirement_verification_links"("requirementId", "verificationActivityId");

-- CreateIndex
CREATE INDEX "requirement_decision_links_engineeringDecisionId_idx" ON "requirement_decision_links"("engineeringDecisionId");

-- CreateIndex
CREATE UNIQUE INDEX "requirement_decision_links_requirementId_engineeringDecisio_key" ON "requirement_decision_links"("requirementId", "engineeringDecisionId", "linkType");

-- CreateIndex
CREATE INDEX "decision_design_links_designItemId_idx" ON "decision_design_links"("designItemId");

-- CreateIndex
CREATE UNIQUE INDEX "decision_design_links_engineeringDecisionId_designItemId_key" ON "decision_design_links"("engineeringDecisionId", "designItemId");

-- CreateIndex
CREATE INDEX "decision_risk_links_riskId_idx" ON "decision_risk_links"("riskId");

-- CreateIndex
CREATE UNIQUE INDEX "decision_risk_links_engineeringDecisionId_riskId_key" ON "decision_risk_links"("engineeringDecisionId", "riskId");

-- CreateIndex
CREATE INDEX "decision_issue_links_issueId_idx" ON "decision_issue_links"("issueId");

-- CreateIndex
CREATE UNIQUE INDEX "decision_issue_links_engineeringDecisionId_issueId_key" ON "decision_issue_links"("engineeringDecisionId", "issueId");

-- CreateIndex
CREATE INDEX "design_item_links_targetDesignItemId_idx" ON "design_item_links"("targetDesignItemId");

-- CreateIndex
CREATE UNIQUE INDEX "design_item_links_sourceDesignItemId_targetDesignItemId_lin_key" ON "design_item_links"("sourceDesignItemId", "targetDesignItemId", "linkType");

-- CreateIndex
CREATE INDEX "design_interface_links_interfaceDefinitionId_idx" ON "design_interface_links"("interfaceDefinitionId");

-- CreateIndex
CREATE UNIQUE INDEX "design_interface_links_designItemId_interfaceDefinitionId_l_key" ON "design_interface_links"("designItemId", "interfaceDefinitionId", "linkType");

-- CreateIndex
CREATE INDEX "risk_requirement_links_requirementId_idx" ON "risk_requirement_links"("requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "risk_requirement_links_riskId_requirementId_key" ON "risk_requirement_links"("riskId", "requirementId");

-- CreateIndex
CREATE INDEX "risk_design_links_designItemId_idx" ON "risk_design_links"("designItemId");

-- CreateIndex
CREATE UNIQUE INDEX "risk_design_links_riskId_designItemId_key" ON "risk_design_links"("riskId", "designItemId");

-- CreateIndex
CREATE INDEX "issue_requirement_links_requirementId_idx" ON "issue_requirement_links"("requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "issue_requirement_links_issueId_requirementId_key" ON "issue_requirement_links"("issueId", "requirementId");

-- CreateIndex
CREATE INDEX "issue_design_links_designItemId_idx" ON "issue_design_links"("designItemId");

-- CreateIndex
CREATE UNIQUE INDEX "issue_design_links_issueId_designItemId_key" ON "issue_design_links"("issueId", "designItemId");

-- CreateIndex
CREATE INDEX "change_request_impacts_requirementId_idx" ON "change_request_impacts"("requirementId");

-- CreateIndex
CREATE INDEX "change_request_impacts_designItemId_idx" ON "change_request_impacts"("designItemId");

-- CreateIndex
CREATE INDEX "change_request_impacts_engineeringDecisionId_idx" ON "change_request_impacts"("engineeringDecisionId");

-- CreateIndex
CREATE INDEX "change_request_impacts_verificationActivityId_idx" ON "change_request_impacts"("verificationActivityId");

-- CreateIndex
CREATE INDEX "change_request_impacts_riskId_idx" ON "change_request_impacts"("riskId");

-- CreateIndex
CREATE INDEX "change_request_impacts_issueId_idx" ON "change_request_impacts"("issueId");

-- CreateIndex
CREATE UNIQUE INDEX "change_request_impacts_changeRequestId_requirementId_key" ON "change_request_impacts"("changeRequestId", "requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "change_request_impacts_changeRequestId_designItemId_key" ON "change_request_impacts"("changeRequestId", "designItemId");

-- CreateIndex
CREATE UNIQUE INDEX "change_request_impacts_changeRequestId_engineeringDecisionI_key" ON "change_request_impacts"("changeRequestId", "engineeringDecisionId");

-- CreateIndex
CREATE UNIQUE INDEX "change_request_impacts_changeRequestId_verificationActivity_key" ON "change_request_impacts"("changeRequestId", "verificationActivityId");

-- CreateIndex
CREATE UNIQUE INDEX "change_request_impacts_changeRequestId_riskId_key" ON "change_request_impacts"("changeRequestId", "riskId");

-- CreateIndex
CREATE UNIQUE INDEX "change_request_impacts_changeRequestId_issueId_key" ON "change_request_impacts"("changeRequestId", "issueId");

-- CreateIndex
CREATE INDEX "evidence_links_requirementId_idx" ON "evidence_links"("requirementId");

-- CreateIndex
CREATE INDEX "evidence_links_engineeringDecisionId_idx" ON "evidence_links"("engineeringDecisionId");

-- CreateIndex
CREATE INDEX "evidence_links_verificationActivityId_idx" ON "evidence_links"("verificationActivityId");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_links_evidenceId_requirementId_key" ON "evidence_links"("evidenceId", "requirementId");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_links_evidenceId_engineeringDecisionId_key" ON "evidence_links"("evidenceId", "engineeringDecisionId");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_links_evidenceId_verificationActivityId_key" ON "evidence_links"("evidenceId", "verificationActivityId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stakeholder_needs" ADD CONSTRAINT "stakeholder_needs_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirements" ADD CONSTRAINT "requirements_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_decisions" ADD CONSTRAINT "engineering_decisions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "engineering_decisions" ADD CONSTRAINT "engineering_decisions_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_items" ADD CONSTRAINT "design_items_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_items" ADD CONSTRAINT "design_items_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interface_definitions" ADD CONSTRAINT "interface_definitions_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_activities" ADD CONSTRAINT "verification_activities_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_activities" ADD CONSTRAINT "verification_activities_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risks" ADD CONSTRAINT "risks_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approverId_fkey" FOREIGN KEY ("approverId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_engineeringDecisionId_fkey" FOREIGN KEY ("engineeringDecisionId") REFERENCES "engineering_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_changeRequestId_fkey" FOREIGN KEY ("changeRequestId") REFERENCES "change_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "need_requirement_links" ADD CONSTRAINT "need_requirement_links_stakeholderNeedId_fkey" FOREIGN KEY ("stakeholderNeedId") REFERENCES "stakeholder_needs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "need_requirement_links" ADD CONSTRAINT "need_requirement_links_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "need_requirement_links" ADD CONSTRAINT "need_requirement_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_links" ADD CONSTRAINT "requirement_links_sourceRequirementId_fkey" FOREIGN KEY ("sourceRequirementId") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_links" ADD CONSTRAINT "requirement_links_targetRequirementId_fkey" FOREIGN KEY ("targetRequirementId") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_links" ADD CONSTRAINT "requirement_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_design_links" ADD CONSTRAINT "requirement_design_links_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_design_links" ADD CONSTRAINT "requirement_design_links_designItemId_fkey" FOREIGN KEY ("designItemId") REFERENCES "design_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_design_links" ADD CONSTRAINT "requirement_design_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_verification_links" ADD CONSTRAINT "requirement_verification_links_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_verification_links" ADD CONSTRAINT "requirement_verification_links_verificationActivityId_fkey" FOREIGN KEY ("verificationActivityId") REFERENCES "verification_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_verification_links" ADD CONSTRAINT "requirement_verification_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_decision_links" ADD CONSTRAINT "requirement_decision_links_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_decision_links" ADD CONSTRAINT "requirement_decision_links_engineeringDecisionId_fkey" FOREIGN KEY ("engineeringDecisionId") REFERENCES "engineering_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "requirement_decision_links" ADD CONSTRAINT "requirement_decision_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_design_links" ADD CONSTRAINT "decision_design_links_engineeringDecisionId_fkey" FOREIGN KEY ("engineeringDecisionId") REFERENCES "engineering_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_design_links" ADD CONSTRAINT "decision_design_links_designItemId_fkey" FOREIGN KEY ("designItemId") REFERENCES "design_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_design_links" ADD CONSTRAINT "decision_design_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_risk_links" ADD CONSTRAINT "decision_risk_links_engineeringDecisionId_fkey" FOREIGN KEY ("engineeringDecisionId") REFERENCES "engineering_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_risk_links" ADD CONSTRAINT "decision_risk_links_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "risks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_risk_links" ADD CONSTRAINT "decision_risk_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_issue_links" ADD CONSTRAINT "decision_issue_links_engineeringDecisionId_fkey" FOREIGN KEY ("engineeringDecisionId") REFERENCES "engineering_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_issue_links" ADD CONSTRAINT "decision_issue_links_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "decision_issue_links" ADD CONSTRAINT "decision_issue_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_item_links" ADD CONSTRAINT "design_item_links_sourceDesignItemId_fkey" FOREIGN KEY ("sourceDesignItemId") REFERENCES "design_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_item_links" ADD CONSTRAINT "design_item_links_targetDesignItemId_fkey" FOREIGN KEY ("targetDesignItemId") REFERENCES "design_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_item_links" ADD CONSTRAINT "design_item_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_interface_links" ADD CONSTRAINT "design_interface_links_designItemId_fkey" FOREIGN KEY ("designItemId") REFERENCES "design_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_interface_links" ADD CONSTRAINT "design_interface_links_interfaceDefinitionId_fkey" FOREIGN KEY ("interfaceDefinitionId") REFERENCES "interface_definitions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "design_interface_links" ADD CONSTRAINT "design_interface_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_requirement_links" ADD CONSTRAINT "risk_requirement_links_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "risks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_requirement_links" ADD CONSTRAINT "risk_requirement_links_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_requirement_links" ADD CONSTRAINT "risk_requirement_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_design_links" ADD CONSTRAINT "risk_design_links_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "risks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_design_links" ADD CONSTRAINT "risk_design_links_designItemId_fkey" FOREIGN KEY ("designItemId") REFERENCES "design_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "risk_design_links" ADD CONSTRAINT "risk_design_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_requirement_links" ADD CONSTRAINT "issue_requirement_links_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_requirement_links" ADD CONSTRAINT "issue_requirement_links_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_requirement_links" ADD CONSTRAINT "issue_requirement_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_design_links" ADD CONSTRAINT "issue_design_links_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_design_links" ADD CONSTRAINT "issue_design_links_designItemId_fkey" FOREIGN KEY ("designItemId") REFERENCES "design_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_design_links" ADD CONSTRAINT "issue_design_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_request_impacts" ADD CONSTRAINT "change_request_impacts_changeRequestId_fkey" FOREIGN KEY ("changeRequestId") REFERENCES "change_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_request_impacts" ADD CONSTRAINT "change_request_impacts_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_request_impacts" ADD CONSTRAINT "change_request_impacts_designItemId_fkey" FOREIGN KEY ("designItemId") REFERENCES "design_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_request_impacts" ADD CONSTRAINT "change_request_impacts_engineeringDecisionId_fkey" FOREIGN KEY ("engineeringDecisionId") REFERENCES "engineering_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_request_impacts" ADD CONSTRAINT "change_request_impacts_verificationActivityId_fkey" FOREIGN KEY ("verificationActivityId") REFERENCES "verification_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_request_impacts" ADD CONSTRAINT "change_request_impacts_riskId_fkey" FOREIGN KEY ("riskId") REFERENCES "risks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_request_impacts" ADD CONSTRAINT "change_request_impacts_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "change_request_impacts" ADD CONSTRAINT "change_request_impacts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_evidenceId_fkey" FOREIGN KEY ("evidenceId") REFERENCES "evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_engineeringDecisionId_fkey" FOREIGN KEY ("engineeringDecisionId") REFERENCES "engineering_decisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_verificationActivityId_fkey" FOREIGN KEY ("verificationActivityId") REFERENCES "verification_activities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written integrity constraints
--
-- Approvals, evidence links and change impacts each attach to exactly one
-- subject, stored as one real foreign key per possible type. Prisma cannot
-- express "exactly one of these is set", so the invariant is enforced here.
-- If this migration is ever regenerated from the schema, these must be
-- re-applied — see ARCHITECTURE.md.
-- ---------------------------------------------------------------------------

-- An approval applies to exactly one approvable artifact.
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_exactly_one_subject" CHECK (
  ("requirementId" IS NOT NULL)::int
  + ("engineeringDecisionId" IS NOT NULL)::int
  + ("changeRequestId" IS NOT NULL)::int = 1
);

-- A piece of evidence supports exactly one artifact per link row.
ALTER TABLE "evidence_links" ADD CONSTRAINT "evidence_links_exactly_one_subject" CHECK (
  ("requirementId" IS NOT NULL)::int
  + ("engineeringDecisionId" IS NOT NULL)::int
  + ("verificationActivityId" IS NOT NULL)::int = 1
);

-- A change impact row names exactly one affected artifact.
ALTER TABLE "change_request_impacts" ADD CONSTRAINT "change_request_impacts_exactly_one_target" CHECK (
  ("requirementId" IS NOT NULL)::int
  + ("designItemId" IS NOT NULL)::int
  + ("engineeringDecisionId" IS NOT NULL)::int
  + ("verificationActivityId" IS NOT NULL)::int
  + ("riskId" IS NOT NULL)::int
  + ("issueId" IS NOT NULL)::int = 1
);
