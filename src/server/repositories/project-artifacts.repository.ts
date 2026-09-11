import type {
  BaselineMemberType,
  ChangeImpactTargetType,
  ComplianceLinkType,
  DecisionRelation,
  IssueRelation,
  RequirementRelation,
  RiskRelation,
  SuppliedItemRelation,
} from "@/domain";
import { type DbClient, prisma } from "@/lib/db";

/**
 * Narrow, read-only lookups of the artifacts a requirement can be linked to.
 *
 * These exist purely to populate the traceability selectors — they are not the
 * beginnings of a StakeholderNeed or DesignItem module, and deliberately
 * return only what a picker needs to show. Everything is project-scoped, so a
 * caller who has proved access to the project cannot see anything beyond it.
 */

export interface LinkTargetOption {
  id: string;
  identifier: string;
  title: string;
}

async function listStakeholderNeeds(projectId: string, client: DbClient) {
  const rows = await client.stakeholderNeed.findMany({
    where: { projectId },
    select: { id: true, identifier: true, title: true },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
  });
  return rows;
}

async function listDesignItems(projectId: string, client: DbClient) {
  const rows = await client.designItem.findMany({
    where: { projectId },
    select: { id: true, identifier: true, name: true },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
  });
  // Design items call it `name`; the picker only cares that it has a heading.
  return rows.map((row) => ({ id: row.id, identifier: row.identifier, title: row.name }));
}

async function listVerificationActivities(projectId: string, client: DbClient) {
  return client.verificationActivity.findMany({
    where: { projectId },
    select: { id: true, identifier: true, title: true },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
  });
}

async function listEngineeringDecisions(projectId: string, client: DbClient) {
  return client.engineeringDecision.findMany({
    where: { projectId },
    select: { id: true, identifier: true, title: true },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
  });
}

async function listRisks(projectId: string, client: DbClient) {
  return client.risk.findMany({
    where: { projectId },
    select: { id: true, identifier: true, title: true },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
  });
}

async function listIssues(projectId: string, client: DbClient) {
  return client.issue.findMany({
    where: { projectId },
    select: { id: true, identifier: true, title: true },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
  });
}

async function listSuppliers(projectId: string, client: DbClient) {
  const rows = await client.supplier.findMany({
    where: { projectId },
    select: { id: true, identifier: true, name: true },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
  });
  return rows.map((row) => ({ id: row.id, identifier: row.identifier, title: row.name }));
}

async function listSuppliedItems(projectId: string, client: DbClient) {
  const rows = await client.suppliedItem.findMany({
    where: { projectId },
    select: { id: true, identifier: true, name: true },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
  });
  return rows.map((row) => ({ id: row.id, identifier: row.identifier, title: row.name }));
}

async function listEvidence(projectId: string, client: DbClient) {
  const rows = await client.evidence.findMany({
    where: { projectId },
    select: { id: true, title: true, sourceReference: true },
    orderBy: [{ title: "asc" }, { id: "asc" }],
  });
  // Evidence has no project-scoped identifier; its source reference is what an
  // engineer would actually cite.
  return rows.map((row) => ({ id: row.id, identifier: row.sourceReference, title: row.title }));
}

export type LinkTargetOptions = Record<RequirementRelation, LinkTargetOption[]>;

export type DecisionLinkTargetOptions = Record<DecisionRelation, LinkTargetOption[]>;

/**
 * Everything in the project a decision may be linked to.
 *
 * Evidence has no management module yet, so that list will normally be
 * empty — which the selector shows honestly rather than inventing rows to
 * fill. Risks and issues are real, project-scoped rows once created.
 */
export async function listDecisionLinkTargets(
  projectId: string,
  client: DbClient = prisma,
): Promise<DecisionLinkTargetOptions> {
  const [requirements, designItems, risks, issues, evidence] = await Promise.all([
    client.requirement.findMany({
      where: { projectId },
      select: { id: true, identifier: true, title: true },
      orderBy: [{ identifier: "asc" }, { id: "asc" }],
    }),
    listDesignItems(projectId, client),
    listRisks(projectId, client),
    listIssues(projectId, client),
    listEvidence(projectId, client),
  ]);

  return {
    REQUIREMENT: requirements,
    DESIGN_ITEM: designItems,
    RISK: risks,
    ISSUE: issues,
    EVIDENCE: evidence,
  };
}

export type ChangeImpactTargetOptions = Record<ChangeImpactTargetType, LinkTargetOption[]>;

/**
 * Everything in the project a change may declare an impact on.
 *
 * The eight categories are exactly the target columns `ChangeRequestImpact`
 * actually has, so the picker cannot offer something the table could not
 * store. Suppliers and supplied items are here so a supplier-side change is
 * declared through the ordinary change request rather than a second mechanism.
 */
export async function listChangeImpactTargets(
  projectId: string,
  client: DbClient = prisma,
): Promise<ChangeImpactTargetOptions> {
  const [
    requirements,
    designItems,
    engineeringDecisions,
    verificationActivities,
    risks,
    issues,
    suppliers,
    suppliedItems,
  ] = await Promise.all([
    client.requirement.findMany({
      where: { projectId },
      select: { id: true, identifier: true, title: true },
      orderBy: [{ identifier: "asc" }, { id: "asc" }],
    }),
    listDesignItems(projectId, client),
    listEngineeringDecisions(projectId, client),
    listVerificationActivities(projectId, client),
    listRisks(projectId, client),
    listIssues(projectId, client),
    listSuppliers(projectId, client),
    listSuppliedItems(projectId, client),
  ]);

  return {
    REQUIREMENT: requirements,
    DESIGN_ITEM: designItems,
    ENGINEERING_DECISION: engineeringDecisions,
    VERIFICATION_ACTIVITY: verificationActivities,
    RISK: risks,
    ISSUE: issues,
    SUPPLIER: suppliers,
    SUPPLIED_ITEM: suppliedItems,
  };
}

export type BaselineMemberTargetOptions = Record<BaselineMemberType, LinkTargetOption[]>;

/**
 * Everything in the project that may be added to a baseline.
 *
 * Keyed by the seven baselineable node types, so the picker cannot offer a
 * type/id combination the domain does not permit. Decision expectations carry no
 * project-scoped identifier, so their decision's identifier is used — an
 * engineer looking for "the expectation on ED-004" finds it that way.
 */
export async function listBaselineMemberTargets(
  projectId: string,
  client: DbClient = prisma,
): Promise<BaselineMemberTargetOptions> {
  const [requirements, designItems, decisions, expectations, activities, suppliedItems, quals] =
    await Promise.all([
      client.requirement.findMany({
        where: { projectId },
        select: { id: true, identifier: true, title: true },
        orderBy: [{ identifier: "asc" }, { id: "asc" }],
      }),
      listDesignItems(projectId, client),
      listEngineeringDecisions(projectId, client),
      client.decisionExpectation.findMany({
        where: { engineeringDecision: { projectId } },
        select: {
          id: true,
          statement: true,
          engineeringDecision: { select: { identifier: true } },
        },
        orderBy: [{ id: "asc" }],
      }),
      listVerificationActivities(projectId, client),
      listSuppliedItems(projectId, client),
      client.supplierQualification.findMany({
        where: { projectId },
        select: { id: true, title: true, supplier: { select: { identifier: true } } },
        orderBy: [{ title: "asc" }, { id: "asc" }],
      }),
    ]);

  return {
    REQUIREMENT: requirements,
    DESIGN_ITEM: designItems,
    ENGINEERING_DECISION: decisions,
    DECISION_EXPECTATION: expectations.map((row) => ({
      id: row.id,
      identifier: row.engineeringDecision.identifier,
      title: row.statement,
    })),
    VERIFICATION_ACTIVITY: activities,
    SUPPLIED_ITEM: suppliedItems,
    SUPPLIER_QUALIFICATION: quals.map((row) => ({
      id: row.id,
      identifier: row.supplier.identifier,
      title: row.title,
    })),
  };
}

export type ComplianceLinkTargetOptions = Record<ComplianceLinkType, LinkTargetOption[]>;

/**
 * Everything in the project a compliance item may link to.
 *
 * Keyed by the eight compliance link types, so the picker cannot offer a
 * type/id combination the domain does not permit.
 */
export async function listComplianceLinkTargets(
  projectId: string,
  client: DbClient = prisma,
): Promise<ComplianceLinkTargetOptions> {
  const [requirements, activities, evidence, decisions, designItems, risks, issues, quals] =
    await Promise.all([
      client.requirement.findMany({
        where: { projectId },
        select: { id: true, identifier: true, title: true },
        orderBy: [{ identifier: "asc" }, { id: "asc" }],
      }),
      listVerificationActivities(projectId, client),
      listEvidence(projectId, client),
      listEngineeringDecisions(projectId, client),
      listDesignItems(projectId, client),
      listRisks(projectId, client),
      listIssues(projectId, client),
      client.supplierQualification.findMany({
        where: { projectId },
        select: { id: true, title: true, supplier: { select: { identifier: true } } },
        orderBy: [{ title: "asc" }, { id: "asc" }],
      }),
    ]);

  return {
    REQUIREMENT: requirements,
    VERIFICATION_ACTIVITY: activities,
    EVIDENCE: evidence,
    ENGINEERING_DECISION: decisions,
    DESIGN_ITEM: designItems,
    RISK: risks,
    ISSUE: issues,
    SUPPLIER_QUALIFICATION: quals.map((row) => ({
      id: row.id,
      identifier: row.supplier.identifier,
      title: row.title,
    })),
  };
}

export type SuppliedItemLinkTargetOptions = Record<SuppliedItemRelation, LinkTargetOption[]>;

/**
 * Everything in the project a supplied item may be linked to.
 *
 * Its own lookup rather than a reuse of the requirement or decision one: those
 * cover different sets, and picking whichever happened to be closest would offer
 * relations the supplied-item tables cannot store — or omit ones they can.
 */
export async function listSuppliedItemLinkTargets(
  projectId: string,
  client: DbClient = prisma,
): Promise<SuppliedItemLinkTargetOptions> {
  const [designItems, requirements, verificationActivities, decisions, risks, evidence] =
    await Promise.all([
      listDesignItems(projectId, client),
      client.requirement.findMany({
        where: { projectId },
        select: { id: true, identifier: true, title: true },
        orderBy: [{ identifier: "asc" }, { id: "asc" }],
      }),
      listVerificationActivities(projectId, client),
      listEngineeringDecisions(projectId, client),
      listRisks(projectId, client),
      listEvidence(projectId, client),
    ]);

  return {
    DESIGN_ITEM: designItems,
    REQUIREMENT: requirements,
    VERIFICATION_ACTIVITY: verificationActivities,
    ENGINEERING_DECISION: decisions,
    RISK: risks,
    EVIDENCE: evidence,
  };
}

export type RiskLinkTargetOptions = Record<RiskRelation, LinkTargetOption[]>;

/** Everything in the project a risk may be linked to. */
export async function listRiskLinkTargets(
  projectId: string,
  client: DbClient = prisma,
): Promise<RiskLinkTargetOptions> {
  const [requirements, designItems, engineeringDecisions] = await Promise.all([
    client.requirement.findMany({
      where: { projectId },
      select: { id: true, identifier: true, title: true },
      orderBy: [{ identifier: "asc" }, { id: "asc" }],
    }),
    listDesignItems(projectId, client),
    listEngineeringDecisions(projectId, client),
  ]);

  return {
    REQUIREMENT: requirements,
    DESIGN_ITEM: designItems,
    ENGINEERING_DECISION: engineeringDecisions,
  };
}

export type IssueLinkTargetOptions = Record<IssueRelation, LinkTargetOption[]>;

/** Everything in the project an issue may be linked to. */
export async function listIssueLinkTargets(
  projectId: string,
  client: DbClient = prisma,
): Promise<IssueLinkTargetOptions> {
  const [requirements, designItems, engineeringDecisions] = await Promise.all([
    client.requirement.findMany({
      where: { projectId },
      select: { id: true, identifier: true, title: true },
      orderBy: [{ identifier: "asc" }, { id: "asc" }],
    }),
    listDesignItems(projectId, client),
    listEngineeringDecisions(projectId, client),
  ]);

  return {
    REQUIREMENT: requirements,
    DESIGN_ITEM: designItems,
    ENGINEERING_DECISION: engineeringDecisions,
  };
}

/** Everything in the project that a requirement may be linked to. */
export async function listLinkTargets(
  projectId: string,
  client: DbClient = prisma,
): Promise<LinkTargetOptions> {
  const [stakeholderNeeds, designItems, verificationActivities, engineeringDecisions] =
    await Promise.all([
      listStakeholderNeeds(projectId, client),
      listDesignItems(projectId, client),
      listVerificationActivities(projectId, client),
      listEngineeringDecisions(projectId, client),
    ]);

  return {
    STAKEHOLDER_NEED: stakeholderNeeds,
    DESIGN_ITEM: designItems,
    VERIFICATION_ACTIVITY: verificationActivities,
    ENGINEERING_DECISION: engineeringDecisions,
  };
}
