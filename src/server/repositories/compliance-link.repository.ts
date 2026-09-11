import type { ComplianceLink, ComplianceLinkType } from "@/domain";
import { complianceLinkKey } from "@/domain";
import { type DbClient, prisma } from "@/lib/db";

/**
 * Compliance links.
 *
 * Seven of the eight link types are dedicated typed join tables — one per
 * (ComplianceItem, target type) pair, the same shape `RiskRequirementLink` and
 * `SuppliedItemDesignLink` already use. The eighth, Evidence, reuses the
 * existing `EvidenceLink` table via its nullable `complianceItemId` column,
 * exactly as `SuppliedItem` and `SupplierQualification` already do — there is
 * no certification-specific evidence store.
 *
 * Every function here dispatches on `linkType`, never on a generic
 * entityType/entityId pair, so a caller can never reach a table this module
 * did not name.
 */

export interface CreateComplianceLinkData {
  complianceItemId: string;
  linkType: ComplianceLinkType;
  targetId: string;
  note: string | null;
  createdById: string | null;
}

/** Whether `targetId` of the given type actually exists inside `projectId`. */
export async function complianceLinkTargetExistsInProject(
  linkType: ComplianceLinkType,
  targetId: string,
  projectId: string,
  client: DbClient = prisma,
): Promise<boolean> {
  switch (linkType) {
    case "REQUIREMENT":
      return (await client.requirement.count({ where: { id: targetId, projectId } })) > 0;
    case "VERIFICATION_ACTIVITY":
      return (
        (await client.verificationActivity.count({ where: { id: targetId, projectId } })) > 0
      );
    case "EVIDENCE":
      return (await client.evidence.count({ where: { id: targetId, projectId } })) > 0;
    case "ENGINEERING_DECISION":
      return (
        (await client.engineeringDecision.count({ where: { id: targetId, projectId } })) > 0
      );
    case "DESIGN_ITEM":
      return (await client.designItem.count({ where: { id: targetId, projectId } })) > 0;
    case "RISK":
      return (await client.risk.count({ where: { id: targetId, projectId } })) > 0;
    case "ISSUE":
      return (await client.issue.count({ where: { id: targetId, projectId } })) > 0;
    case "SUPPLIER_QUALIFICATION":
      return (
        (await client.supplierQualification.count({ where: { id: targetId, projectId } })) > 0
      );
  }
}

/** Whether this exact (item, target) pair is already linked, across the right table. */
export async function complianceLinkExists(
  complianceItemId: string,
  linkType: ComplianceLinkType,
  targetId: string,
  client: DbClient = prisma,
): Promise<boolean> {
  switch (linkType) {
    case "REQUIREMENT":
      return (
        (await client.complianceItemRequirementLink.count({
          where: { complianceItemId, requirementId: targetId },
        })) > 0
      );
    case "VERIFICATION_ACTIVITY":
      return (
        (await client.complianceItemVerificationLink.count({
          where: { complianceItemId, verificationActivityId: targetId },
        })) > 0
      );
    case "EVIDENCE":
      return (
        (await client.evidenceLink.count({
          where: { complianceItemId, evidenceId: targetId },
        })) > 0
      );
    case "ENGINEERING_DECISION":
      return (
        (await client.complianceItemDecisionLink.count({
          where: { complianceItemId, engineeringDecisionId: targetId },
        })) > 0
      );
    case "DESIGN_ITEM":
      return (
        (await client.complianceItemDesignLink.count({
          where: { complianceItemId, designItemId: targetId },
        })) > 0
      );
    case "RISK":
      return (
        (await client.complianceItemRiskLink.count({
          where: { complianceItemId, riskId: targetId },
        })) > 0
      );
    case "ISSUE":
      return (
        (await client.complianceItemIssueLink.count({
          where: { complianceItemId, issueId: targetId },
        })) > 0
      );
    case "SUPPLIER_QUALIFICATION":
      return (
        (await client.complianceItemSupplierQualificationLink.count({
          where: { complianceItemId, supplierQualificationId: targetId },
        })) > 0
      );
  }
}

export async function createLink(
  data: CreateComplianceLinkData,
  client: DbClient = prisma,
): Promise<{ rowId: string }> {
  const { complianceItemId, linkType, targetId, note, createdById } = data;
  switch (linkType) {
    case "REQUIREMENT": {
      const row = await client.complianceItemRequirementLink.create({
        data: { complianceItemId, requirementId: targetId, note, createdById },
      });
      return { rowId: row.id };
    }
    case "VERIFICATION_ACTIVITY": {
      const row = await client.complianceItemVerificationLink.create({
        data: { complianceItemId, verificationActivityId: targetId, note, createdById },
      });
      return { rowId: row.id };
    }
    case "EVIDENCE": {
      const row = await client.evidenceLink.create({
        data: { complianceItemId, evidenceId: targetId, note, createdById },
      });
      return { rowId: row.id };
    }
    case "ENGINEERING_DECISION": {
      const row = await client.complianceItemDecisionLink.create({
        data: { complianceItemId, engineeringDecisionId: targetId, note, createdById },
      });
      return { rowId: row.id };
    }
    case "DESIGN_ITEM": {
      const row = await client.complianceItemDesignLink.create({
        data: { complianceItemId, designItemId: targetId, note, createdById },
      });
      return { rowId: row.id };
    }
    case "RISK": {
      const row = await client.complianceItemRiskLink.create({
        data: { complianceItemId, riskId: targetId, note, createdById },
      });
      return { rowId: row.id };
    }
    case "ISSUE": {
      const row = await client.complianceItemIssueLink.create({
        data: { complianceItemId, issueId: targetId, note, createdById },
      });
      return { rowId: row.id };
    }
    case "SUPPLIER_QUALIFICATION": {
      const row = await client.complianceItemSupplierQualificationLink.create({
        data: { complianceItemId, supplierQualificationId: targetId, note, createdById },
      });
      return { rowId: row.id };
    }
  }
}

export async function deleteLink(
  complianceItemId: string,
  linkType: ComplianceLinkType,
  rowId: string,
  client: DbClient = prisma,
): Promise<boolean> {
  switch (linkType) {
    case "REQUIREMENT": {
      const result = await client.complianceItemRequirementLink.deleteMany({
        where: { id: rowId, complianceItemId },
      });
      return result.count > 0;
    }
    case "VERIFICATION_ACTIVITY": {
      const result = await client.complianceItemVerificationLink.deleteMany({
        where: { id: rowId, complianceItemId },
      });
      return result.count > 0;
    }
    case "EVIDENCE": {
      const result = await client.evidenceLink.deleteMany({
        where: { id: rowId, complianceItemId },
      });
      return result.count > 0;
    }
    case "ENGINEERING_DECISION": {
      const result = await client.complianceItemDecisionLink.deleteMany({
        where: { id: rowId, complianceItemId },
      });
      return result.count > 0;
    }
    case "DESIGN_ITEM": {
      const result = await client.complianceItemDesignLink.deleteMany({
        where: { id: rowId, complianceItemId },
      });
      return result.count > 0;
    }
    case "RISK": {
      const result = await client.complianceItemRiskLink.deleteMany({
        where: { id: rowId, complianceItemId },
      });
      return result.count > 0;
    }
    case "ISSUE": {
      const result = await client.complianceItemIssueLink.deleteMany({
        where: { id: rowId, complianceItemId },
      });
      return result.count > 0;
    }
    case "SUPPLIER_QUALIFICATION": {
      const result = await client.complianceItemSupplierQualificationLink.deleteMany({
        where: { id: rowId, complianceItemId },
      });
      return result.count > 0;
    }
  }
}

/** Every link on one compliance item, across all eight tables, normalized. */
export async function listLinks(
  complianceItemId: string,
  client: DbClient = prisma,
): Promise<ComplianceLink[]> {
  const [requirements, activities, evidence, decisions, designs, risks, issues, quals] =
    await Promise.all([
      client.complianceItemRequirementLink.findMany({
        where: { complianceItemId },
        include: { requirement: { select: { id: true, identifier: true, title: true } } },
      }),
      client.complianceItemVerificationLink.findMany({
        where: { complianceItemId },
        include: {
          verificationActivity: { select: { id: true, identifier: true, title: true } },
        },
      }),
      client.evidenceLink.findMany({
        where: { complianceItemId },
        include: { evidence: { select: { id: true, title: true, sourceReference: true } } },
      }),
      client.complianceItemDecisionLink.findMany({
        where: { complianceItemId },
        include: {
          engineeringDecision: { select: { id: true, identifier: true, title: true } },
        },
      }),
      client.complianceItemDesignLink.findMany({
        where: { complianceItemId },
        include: { designItem: { select: { id: true, identifier: true, name: true } } },
      }),
      client.complianceItemRiskLink.findMany({
        where: { complianceItemId },
        include: { risk: { select: { id: true, identifier: true, title: true } } },
      }),
      client.complianceItemIssueLink.findMany({
        where: { complianceItemId },
        include: { issue: { select: { id: true, identifier: true, title: true } } },
      }),
      client.complianceItemSupplierQualificationLink.findMany({
        where: { complianceItemId },
        include: {
          supplierQualification: {
            select: { id: true, title: true, supplier: { select: { identifier: true } } },
          },
        },
      }),
    ]);

  const links: ComplianceLink[] = [
    ...requirements.map((row) => ({
      id: complianceLinkKey("REQUIREMENT", row.id),
      complianceItemId: row.complianceItemId,
      linkType: "REQUIREMENT" as const,
      targetId: row.requirementId,
      targetIdentifier: row.requirement.identifier,
      targetLabel: row.requirement.title,
      note: row.note,
      createdAt: row.createdAt,
      createdById: row.createdById,
    })),
    ...activities.map((row) => ({
      id: complianceLinkKey("VERIFICATION_ACTIVITY", row.id),
      complianceItemId: row.complianceItemId,
      linkType: "VERIFICATION_ACTIVITY" as const,
      targetId: row.verificationActivityId,
      targetIdentifier: row.verificationActivity.identifier,
      targetLabel: row.verificationActivity.title,
      note: row.note,
      createdAt: row.createdAt,
      createdById: row.createdById,
    })),
    ...evidence
      .filter((row) => row.evidenceId !== null)
      .map((row) => ({
        id: complianceLinkKey("EVIDENCE", row.id),
        complianceItemId: row.complianceItemId as string,
        linkType: "EVIDENCE" as const,
        targetId: row.evidenceId as string,
        targetIdentifier: row.evidence?.sourceReference ?? null,
        targetLabel: row.evidence?.title ?? "",
        note: row.note,
        createdAt: row.createdAt,
        createdById: row.createdById,
      })),
    ...decisions.map((row) => ({
      id: complianceLinkKey("ENGINEERING_DECISION", row.id),
      complianceItemId: row.complianceItemId,
      linkType: "ENGINEERING_DECISION" as const,
      targetId: row.engineeringDecisionId,
      targetIdentifier: row.engineeringDecision.identifier,
      targetLabel: row.engineeringDecision.title,
      note: row.note,
      createdAt: row.createdAt,
      createdById: row.createdById,
    })),
    ...designs.map((row) => ({
      id: complianceLinkKey("DESIGN_ITEM", row.id),
      complianceItemId: row.complianceItemId,
      linkType: "DESIGN_ITEM" as const,
      targetId: row.designItemId,
      targetIdentifier: row.designItem.identifier,
      targetLabel: row.designItem.name,
      note: row.note,
      createdAt: row.createdAt,
      createdById: row.createdById,
    })),
    ...risks.map((row) => ({
      id: complianceLinkKey("RISK", row.id),
      complianceItemId: row.complianceItemId,
      linkType: "RISK" as const,
      targetId: row.riskId,
      targetIdentifier: row.risk.identifier,
      targetLabel: row.risk.title,
      note: row.note,
      createdAt: row.createdAt,
      createdById: row.createdById,
    })),
    ...issues.map((row) => ({
      id: complianceLinkKey("ISSUE", row.id),
      complianceItemId: row.complianceItemId,
      linkType: "ISSUE" as const,
      targetId: row.issueId,
      targetIdentifier: row.issue.identifier,
      targetLabel: row.issue.title,
      note: row.note,
      createdAt: row.createdAt,
      createdById: row.createdById,
    })),
    ...quals.map((row) => ({
      id: complianceLinkKey("SUPPLIER_QUALIFICATION", row.id),
      complianceItemId: row.complianceItemId,
      linkType: "SUPPLIER_QUALIFICATION" as const,
      targetId: row.supplierQualificationId,
      targetIdentifier: row.supplierQualification.supplier.identifier,
      targetLabel: row.supplierQualification.title,
      note: row.note,
      createdAt: row.createdAt,
      createdById: row.createdById,
    })),
  ];

  return links.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// --- Batched review linkage ---------------------------------------------

/** One linked engineering object, with the state a review rule reads. */
export interface LinkedObjectRow {
  complianceItemId: string;
  id: string;
  identifier: string | null;
  label: string;
  state: string | null;
}

export interface ReviewLinkage {
  requirements: LinkedObjectRow[];
  verificationActivities: LinkedObjectRow[];
  decisions: LinkedObjectRow[];
  designItems: LinkedObjectRow[];
  risks: LinkedObjectRow[];
  issues: LinkedObjectRow[];
  supplierQualifications: LinkedObjectRow[];
  evidence: LinkedObjectRow[];
}

/**
 * Every link on a set of compliance items, across all eight tables, joined
 * to the target's own state — eight queries total regardless of how many
 * items are being evaluated, never one query per item.
 */
export async function loadReviewLinkage(
  complianceItemIds: readonly string[],
  client: DbClient = prisma,
): Promise<ReviewLinkage> {
  if (complianceItemIds.length === 0) {
    return {
      requirements: [],
      verificationActivities: [],
      decisions: [],
      designItems: [],
      risks: [],
      issues: [],
      supplierQualifications: [],
      evidence: [],
    };
  }
  const where = { complianceItemId: { in: [...complianceItemIds] } };

  const [requirements, activities, decisions, designs, risks, issues, quals, evidence] =
    await Promise.all([
      client.complianceItemRequirementLink.findMany({
        where,
        include: { requirement: { select: { id: true, identifier: true, title: true, status: true } } },
      }),
      client.complianceItemVerificationLink.findMany({
        where,
        include: {
          verificationActivity: {
            select: { id: true, identifier: true, title: true, status: true },
          },
        },
      }),
      client.complianceItemDecisionLink.findMany({
        where,
        include: {
          engineeringDecision: {
            select: { id: true, identifier: true, title: true, status: true },
          },
        },
      }),
      client.complianceItemDesignLink.findMany({
        where,
        include: { designItem: { select: { id: true, identifier: true, name: true, status: true } } },
      }),
      client.complianceItemRiskLink.findMany({
        where,
        include: { risk: { select: { id: true, identifier: true, title: true, status: true } } },
      }),
      client.complianceItemIssueLink.findMany({
        where,
        include: {
          issue: { select: { id: true, identifier: true, title: true, status: true, severity: true } },
        },
      }),
      client.complianceItemSupplierQualificationLink.findMany({
        where,
        include: {
          supplierQualification: {
            select: {
              id: true,
              title: true,
              status: true,
              supplier: { select: { identifier: true } },
            },
          },
        },
      }),
      client.evidenceLink.findMany({
        where,
        include: { evidence: { select: { id: true, title: true, sourceReference: true } } },
      }),
    ]);

  return {
    requirements: requirements.map((row) => ({
      complianceItemId: row.complianceItemId,
      id: row.requirement.id,
      identifier: row.requirement.identifier,
      label: row.requirement.title,
      state: row.requirement.status,
    })),
    verificationActivities: activities.map((row) => ({
      complianceItemId: row.complianceItemId,
      id: row.verificationActivity.id,
      identifier: row.verificationActivity.identifier,
      label: row.verificationActivity.title,
      state: row.verificationActivity.status,
    })),
    decisions: decisions.map((row) => ({
      complianceItemId: row.complianceItemId,
      id: row.engineeringDecision.id,
      identifier: row.engineeringDecision.identifier,
      label: row.engineeringDecision.title,
      state: row.engineeringDecision.status,
    })),
    designItems: designs.map((row) => ({
      complianceItemId: row.complianceItemId,
      id: row.designItem.id,
      identifier: row.designItem.identifier,
      label: row.designItem.name,
      state: row.designItem.status,
    })),
    risks: risks.map((row) => ({
      complianceItemId: row.complianceItemId,
      id: row.risk.id,
      identifier: row.risk.identifier,
      label: row.risk.title,
      state: row.risk.status,
    })),
    issues: issues.map((row) => ({
      complianceItemId: row.complianceItemId,
      id: row.issue.id,
      identifier: row.issue.identifier,
      label: row.issue.title,
      state: `${row.issue.severity}/${row.issue.status}`,
    })),
    supplierQualifications: quals.map((row) => ({
      complianceItemId: row.complianceItemId,
      id: row.supplierQualification.id,
      identifier: row.supplierQualification.supplier.identifier,
      label: row.supplierQualification.title,
      state: row.supplierQualification.status,
    })),
    evidence: evidence
      .filter((row) => row.complianceItemId !== null && row.evidence !== null)
      .map((row) => ({
        complianceItemId: row.complianceItemId as string,
        id: row.evidence!.id,
        identifier: row.evidence!.sourceReference,
        label: row.evidence!.title,
        state: null,
      })),
  };
}
