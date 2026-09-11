import {
  type CreateEngineeringDecisionInput,
  type DecisionLinkSummary,
  type DecisionRelation,
  type DecisionStatus,
  type EngineeringDecision,
  type EngineeringDecisionFilter,
  type RequirementDecisionLinkInput,
  type UpdateEngineeringDecisionInput,
  createEngineeringDecisionInputSchema,
  engineeringDecisionFilterSchema,
  requirementDecisionLinkInputSchema,
  updateEngineeringDecisionInputSchema,
} from "@/domain";
import { type DbClient, prisma } from "@/lib/db";
import { NotFoundError } from "@/server/errors";
import { parseOrThrow } from "@/server/validation";
import { toEngineeringDecision } from "./mappers";
import { rethrowAsConflict } from "./prisma-error";

/** Engineering decision data access. */

export async function createEngineeringDecision(
  input: CreateEngineeringDecisionInput,
): Promise<EngineeringDecision> {
  const data = parseOrThrow(
    createEngineeringDecisionInputSchema,
    input,
    "Invalid engineering decision",
  );

  try {
    const row = await prisma.engineeringDecision.create({
      data: {
        projectId: data.projectId,
        identifier: data.identifier,
        title: data.title,
        statement: data.statement,
        rationale: data.rationale,
        alternativesConsidered: data.alternativesConsidered ?? null,
        assumptions: data.assumptions ?? null,
        status: data.status,
        ownerId: data.ownerId ?? null,
        decidedAt: data.decidedAt ?? null,
      },
    });
    return toEngineeringDecision(row);
  } catch (error) {
    rethrowAsConflict(error, `Decision ${data.identifier} already exists in this project.`);
  }
}

export async function getEngineeringDecisionById(id: string): Promise<EngineeringDecision | null> {
  const row = await prisma.engineeringDecision.findUnique({ where: { id } });
  return row ? toEngineeringDecision(row) : null;
}

export async function requireEngineeringDecisionById(id: string): Promise<EngineeringDecision> {
  const decision = await getEngineeringDecisionById(id);
  if (!decision) {
    throw new NotFoundError(`Engineering decision ${id} was not found.`);
  }
  return decision;
}

export async function getEngineeringDecisionByIdentifier(
  projectId: string,
  identifier: string,
): Promise<EngineeringDecision | null> {
  const row = await prisma.engineeringDecision.findUnique({
    where: { projectId_identifier: { projectId, identifier } },
  });
  return row ? toEngineeringDecision(row) : null;
}

export async function listEngineeringDecisions(
  filter: EngineeringDecisionFilter,
): Promise<EngineeringDecision[]> {
  const where = parseOrThrow(engineeringDecisionFilterSchema, filter, "Invalid decision filter");

  const rows = await prisma.engineeringDecision.findMany({
    where: { projectId: where.projectId, status: where.status, ownerId: where.ownerId },
    orderBy: { identifier: "asc" },
  });
  return rows.map(toEngineeringDecision);
}

export async function updateEngineeringDecision(
  id: string,
  input: UpdateEngineeringDecisionInput,
): Promise<EngineeringDecision> {
  const data = parseOrThrow(
    updateEngineeringDecisionInputSchema,
    input,
    "Invalid engineering decision update",
  );

  const row = await prisma.engineeringDecision.update({
    where: { id },
    data: {
      title: data.title,
      statement: data.statement,
      rationale: data.rationale,
      alternativesConsidered: data.alternativesConsidered,
      assumptions: data.assumptions,
      status: data.status,
      ownerId: data.ownerId,
      decidedAt: data.decidedAt,
    },
  });
  return toEngineeringDecision(row);
}

/**
 * Records the edge between a decision and a requirement. `sourceId` is the
 * requirement and `targetId` the decision; `linkType` says which way the
 * relationship is meant to be read.
 */
export async function linkDecisionToRequirement(
  input: RequirementDecisionLinkInput,
): Promise<void> {
  const data = parseOrThrow(
    requirementDecisionLinkInputSchema,
    input,
    "Invalid requirement-to-decision link",
  );

  await prisma.requirementDecisionLink.upsert({
    where: {
      requirementId_engineeringDecisionId_linkType: {
        requirementId: data.sourceId,
        engineeringDecisionId: data.targetId,
        linkType: data.linkType,
      },
    },
    create: {
      requirementId: data.sourceId,
      engineeringDecisionId: data.targetId,
      linkType: data.linkType,
      note: data.note ?? null,
      createdById: data.createdById ?? null,
    },
    update: { note: data.note ?? null },
  });
}

/** Requirements a decision is linked to, in either direction. */
export async function listDecisionRequirementIds(
  engineeringDecisionId: string,
): Promise<string[]> {
  const links = await prisma.requirementDecisionLink.findMany({
    where: { engineeringDecisionId },
    select: { requirementId: true },
  });
  return links.map((link) => link.requirementId);
}

// --- Project-scoped access --------------------------------------------------

export interface DecisionOwnerSummary {
  id: string;
  name: string;
  email: string;
}

export interface DecisionListItem extends EngineeringDecision {
  owner: DecisionOwnerSummary | null;
}

/**
 * Loads a decision only if it belongs to the given project.
 *
 * Scoping the query rather than fetching by id and comparing afterwards is
 * what makes a decision from another project simply not match.
 */
export async function findDecisionInProject(
  projectId: string,
  decisionId: string,
  client: DbClient = prisma,
): Promise<EngineeringDecision | null> {
  const row = await client.engineeringDecision.findFirst({
    where: { id: decisionId, projectId },
  });
  return row ? toEngineeringDecision(row) : null;
}

/** Decisions in a project, ordered by identifier then id for a stable list. */
export async function listDecisionsInProject(
  projectId: string,
  options: { status?: DecisionStatus } = {},
  client: DbClient = prisma,
): Promise<DecisionListItem[]> {
  const rows = await client.engineeringDecision.findMany({
    where: { projectId, status: options.status },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
    include: { owner: { select: { id: true, name: true, email: true } } },
  });
  return rows.map((row) => ({ ...toEngineeringDecision(row), owner: row.owner }));
}

export interface CreateDecisionData {
  projectId: string;
  identifier: string;
  title: string;
  statement: string;
  rationale: string;
  ownerId: string | null;
  decidedAt: Date | null;
}

export async function createDecision(
  data: CreateDecisionData,
  client: DbClient = prisma,
): Promise<EngineeringDecision> {
  try {
    // Status is omitted deliberately: a decision always starts PROPOSED.
    const row = await client.engineeringDecision.create({ data });
    return toEngineeringDecision(row);
  } catch (error) {
    rethrowAsConflict(error, `Decision ${data.identifier} already exists in this project.`);
  }
}

export interface UpdateDecisionData {
  title?: string | undefined;
  statement?: string | undefined;
  rationale?: string | undefined;
  status?: DecisionStatus | undefined;
  ownerId?: string | null | undefined;
  decidedAt?: Date | null | undefined;
}

export async function updateDecision(
  id: string,
  data: UpdateDecisionData,
  client: DbClient = prisma,
): Promise<EngineeringDecision> {
  const row = await client.engineeringDecision.update({ where: { id }, data });
  return toEngineeringDecision(row);
}

/** Owner record for display. Selects three safe fields — never the credential relation. */
export async function findDecisionOwner(
  ownerId: string,
  client: DbClient = prisma,
): Promise<DecisionOwnerSummary | null> {
  return client.user.findUnique({
    where: { id: ownerId },
    select: { id: true, name: true, email: true },
  });
}

// --- Traceability -----------------------------------------------------------

/**
 * Confirms a link target exists *and* sits in the same project.
 *
 * Each relation is checked against its own table with `projectId` in the where
 * clause, so a target from another project — and therefore any other
 * organization — cannot be linked.
 */
export async function decisionLinkTargetExistsInProject(
  relation: DecisionRelation,
  targetId: string,
  projectId: string,
  client: DbClient = prisma,
): Promise<boolean> {
  const where = { id: targetId, projectId };

  switch (relation) {
    case "REQUIREMENT":
      return (await client.requirement.findFirst({ where, select: { id: true } })) !== null;
    case "DESIGN_ITEM":
      return (await client.designItem.findFirst({ where, select: { id: true } })) !== null;
    case "RISK":
      return (await client.risk.findFirst({ where, select: { id: true } })) !== null;
    case "ISSUE":
      return (await client.issue.findFirst({ where, select: { id: true } })) !== null;
    case "EVIDENCE":
      return (await client.evidence.findFirst({ where, select: { id: true } })) !== null;
  }
}

export interface CreateDecisionLinkInput {
  engineeringDecisionId: string;
  relation: DecisionRelation;
  targetId: string;
  linkType?: string | undefined;
  note?: string | null | undefined;
  createdById: string | null;
}

/**
 * Writes one trace edge into its own typed table. Upserts, so re-adding an
 * existing edge is idempotent rather than a crash.
 */
export async function createDecisionLink(
  input: CreateDecisionLinkInput,
  client: DbClient = prisma,
): Promise<void> {
  const { engineeringDecisionId, targetId, note, createdById } = input;

  switch (input.relation) {
    case "REQUIREMENT": {
      const linkType = (input.linkType ?? "DECISION_ADDRESSES_REQUIREMENT") as
        | "DECISION_ADDRESSES_REQUIREMENT"
        | "REQUIREMENT_DERIVED_FROM_DECISION";
      await client.requirementDecisionLink.upsert({
        where: {
          requirementId_engineeringDecisionId_linkType: {
            requirementId: targetId,
            engineeringDecisionId,
            linkType,
          },
        },
        create: {
          requirementId: targetId,
          engineeringDecisionId,
          linkType,
          note: note ?? null,
          createdById,
        },
        update: { note: note ?? null },
      });
      return;
    }

    case "DESIGN_ITEM":
      await client.decisionDesignLink.upsert({
        where: {
          engineeringDecisionId_designItemId: { engineeringDecisionId, designItemId: targetId },
        },
        create: { engineeringDecisionId, designItemId: targetId, note: note ?? null, createdById },
        update: { note: note ?? null },
      });
      return;

    case "RISK":
      await client.decisionRiskLink.upsert({
        where: { engineeringDecisionId_riskId: { engineeringDecisionId, riskId: targetId } },
        create: { engineeringDecisionId, riskId: targetId, note: note ?? null, createdById },
        update: { note: note ?? null },
      });
      return;

    case "ISSUE":
      await client.decisionIssueLink.upsert({
        where: { engineeringDecisionId_issueId: { engineeringDecisionId, issueId: targetId } },
        create: { engineeringDecisionId, issueId: targetId, note: note ?? null, createdById },
        update: { note: note ?? null },
      });
      return;

    case "EVIDENCE":
      // Reuses the existing evidence-link table rather than a second one.
      await client.evidenceLink.upsert({
        where: {
          evidenceId_engineeringDecisionId: { evidenceId: targetId, engineeringDecisionId },
        },
        create: { evidenceId: targetId, engineeringDecisionId, note: note ?? null, createdById },
        update: { note: note ?? null },
      });
      return;
  }
}

/** Removes a trace edge. Returns how many rows went, so the caller can 404 on none. */
export async function deleteDecisionLink(
  input: {
    engineeringDecisionId: string;
    relation: DecisionRelation;
    targetId: string;
    linkType?: string | undefined;
  },
  client: DbClient = prisma,
): Promise<number> {
  const { engineeringDecisionId, targetId, linkType } = input;

  switch (input.relation) {
    case "REQUIREMENT": {
      const { count } = await client.requirementDecisionLink.deleteMany({
        where: {
          engineeringDecisionId,
          requirementId: targetId,
          ...(linkType
            ? {
                linkType: linkType as
                  | "DECISION_ADDRESSES_REQUIREMENT"
                  | "REQUIREMENT_DERIVED_FROM_DECISION",
              }
            : {}),
        },
      });
      return count;
    }
    case "DESIGN_ITEM": {
      const { count } = await client.decisionDesignLink.deleteMany({
        where: { engineeringDecisionId, designItemId: targetId },
      });
      return count;
    }
    case "RISK": {
      const { count } = await client.decisionRiskLink.deleteMany({
        where: { engineeringDecisionId, riskId: targetId },
      });
      return count;
    }
    case "ISSUE": {
      const { count } = await client.decisionIssueLink.deleteMany({
        where: { engineeringDecisionId, issueId: targetId },
      });
      return count;
    }
    case "EVIDENCE": {
      const { count } = await client.evidenceLink.deleteMany({
        where: { engineeringDecisionId, evidenceId: targetId },
      });
      return count;
    }
  }
}

/**
 * Every edge on a decision, with enough of each target to display it.
 *
 * Five queries rather than one union: each relation lives in its own typed
 * table, and each target type names its heading differently (`name` for design
 * items, no project-scoped identifier at all for evidence).
 */
export async function listDecisionLinks(
  engineeringDecisionId: string,
  client: DbClient = prisma,
): Promise<DecisionLinkSummary[]> {
  const [requirements, designItems, risks, issues, evidence] = await Promise.all([
    client.requirementDecisionLink.findMany({
      where: { engineeringDecisionId },
      select: {
        createdAt: true,
        linkType: true,
        note: true,
        requirement: { select: { id: true, identifier: true, title: true } },
      },
    }),
    client.decisionDesignLink.findMany({
      where: { engineeringDecisionId },
      select: {
        createdAt: true,
        note: true,
        designItem: { select: { id: true, identifier: true, name: true } },
      },
    }),
    client.decisionRiskLink.findMany({
      where: { engineeringDecisionId },
      select: {
        createdAt: true,
        note: true,
        risk: { select: { id: true, identifier: true, title: true } },
      },
    }),
    client.decisionIssueLink.findMany({
      where: { engineeringDecisionId },
      select: {
        createdAt: true,
        note: true,
        issue: { select: { id: true, identifier: true, title: true } },
      },
    }),
    client.evidenceLink.findMany({
      where: { engineeringDecisionId },
      select: {
        createdAt: true,
        note: true,
        evidence: { select: { id: true, title: true, sourceReference: true } },
      },
    }),
  ]);

  return [
    ...requirements.map((link) => ({
      relation: "REQUIREMENT" as const,
      targetId: link.requirement.id,
      identifier: link.requirement.identifier,
      title: link.requirement.title,
      linkType: link.linkType,
      note: link.note,
      createdAt: link.createdAt,
    })),
    ...designItems.map((link) => ({
      relation: "DESIGN_ITEM" as const,
      targetId: link.designItem.id,
      identifier: link.designItem.identifier,
      title: link.designItem.name,
      linkType: null,
      note: link.note,
      createdAt: link.createdAt,
    })),
    ...risks.map((link) => ({
      relation: "RISK" as const,
      targetId: link.risk.id,
      identifier: link.risk.identifier,
      title: link.risk.title,
      linkType: null,
      note: link.note,
      createdAt: link.createdAt,
    })),
    ...issues.map((link) => ({
      relation: "ISSUE" as const,
      targetId: link.issue.id,
      identifier: link.issue.identifier,
      title: link.issue.title,
      linkType: null,
      note: link.note,
      createdAt: link.createdAt,
    })),
    ...evidence.map((link) => ({
      relation: "EVIDENCE" as const,
      targetId: link.evidence.id,
      // Evidence has no project-scoped identifier; its source reference is
      // the closest thing an engineer would cite.
      identifier: link.evidence.sourceReference,
      title: link.evidence.title,
      linkType: null,
      note: link.note,
      createdAt: link.createdAt,
    })),
  ];
}
