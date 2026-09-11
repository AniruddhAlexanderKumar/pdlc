import {
  type CreateRequirementInput,
  type Requirement,
  type RequirementDesignLinkInput,
  type RequirementFilter,
  type RequirementLinkSummary,
  type RequirementRelation,
  type RequirementStatus,
  type UpdateRequirementInput,
  createRequirementInputSchema,
  requirementDesignLinkInputSchema,
  requirementFilterSchema,
  updateRequirementInputSchema,
} from "@/domain";
import { type DbClient, prisma } from "@/lib/db";
import { NotFoundError } from "@/server/errors";
import { parseOrThrow } from "@/server/validation";
import { toRequirement } from "./mappers";
import { rethrowAsConflict } from "./prisma-error";

/** Requirement data access, including the trace edges that hang off a requirement. */

export async function createRequirement(
  input: CreateRequirementInput,
  client: DbClient = prisma,
): Promise<Requirement> {
  const data = parseOrThrow(createRequirementInputSchema, input, "Invalid requirement");

  try {
    const row = await client.requirement.create({
      data: {
        projectId: data.projectId,
        identifier: data.identifier,
        title: data.title,
        statement: data.statement,
        rationale: data.rationale ?? null,
        status: data.status,
        priority: data.priority,
        source: data.source ?? null,
        ownerId: data.ownerId ?? null,
      },
    });
    return toRequirement(row);
  } catch (error) {
    rethrowAsConflict(error, `Requirement ${data.identifier} already exists in this project.`);
  }
}

export async function getRequirementById(id: string): Promise<Requirement | null> {
  const row = await prisma.requirement.findUnique({ where: { id } });
  return row ? toRequirement(row) : null;
}

export async function requireRequirementById(id: string): Promise<Requirement> {
  const requirement = await getRequirementById(id);
  if (!requirement) {
    throw new NotFoundError(`Requirement ${id} was not found.`);
  }
  return requirement;
}

/** Looks a requirement up the way an engineer refers to it: by its project-scoped key. */
export async function getRequirementByIdentifier(
  projectId: string,
  identifier: string,
): Promise<Requirement | null> {
  const row = await prisma.requirement.findUnique({
    where: { projectId_identifier: { projectId, identifier } },
  });
  return row ? toRequirement(row) : null;
}

export async function listRequirements(filter: RequirementFilter): Promise<Requirement[]> {
  const where = parseOrThrow(requirementFilterSchema, filter, "Invalid requirement filter");

  const rows = await prisma.requirement.findMany({
    where: {
      projectId: where.projectId,
      status: where.status,
      priority: where.priority,
      ownerId: where.ownerId,
    },
    orderBy: { identifier: "asc" },
  });
  return rows.map(toRequirement);
}

export async function updateRequirement(
  id: string,
  input: UpdateRequirementInput,
  client: DbClient = prisma,
): Promise<Requirement> {
  const data = parseOrThrow(updateRequirementInputSchema, input, "Invalid requirement update");

  const row = await client.requirement.update({
    where: { id },
    data: {
      title: data.title,
      statement: data.statement,
      rationale: data.rationale,
      status: data.status,
      priority: data.priority,
      source: data.source,
      ownerId: data.ownerId,
    },
  });
  return toRequirement(row);
}

/** Allocates a requirement to a design item (idempotent for the same link type). */
export async function linkRequirementToDesignItem(
  input: RequirementDesignLinkInput,
): Promise<void> {
  const data = parseOrThrow(
    requirementDesignLinkInputSchema,
    input,
    "Invalid requirement-to-design link",
  );
  const linkType = data.linkType ?? "ALLOCATED_TO";

  await prisma.requirementDesignLink.upsert({
    where: {
      requirementId_designItemId_linkType: {
        requirementId: data.sourceId,
        designItemId: data.targetId,
        linkType,
      },
    },
    create: {
      requirementId: data.sourceId,
      designItemId: data.targetId,
      linkType,
      note: data.note ?? null,
      createdById: data.createdById ?? null,
    },
    update: { note: data.note ?? null },
  });
}

export interface RequirementTraceSummary {
  requirementId: string;
  designItemIds: string[];
  verificationActivityIds: string[];
  engineeringDecisionIds: string[];
}

/**
 * One-hop neighbourhood of a requirement: what it is allocated to, how it is
 * verified, and which decisions touch it. This is the read the traceability
 * and impact features will grow from — deliberately a single hop for now, not
 * a traversal engine.
 */
export async function getRequirementTraceSummary(
  requirementId: string,
): Promise<RequirementTraceSummary> {
  const [designLinks, verificationLinks, decisionLinks] = await Promise.all([
    prisma.requirementDesignLink.findMany({
      where: { requirementId },
      select: { designItemId: true },
    }),
    prisma.requirementVerificationLink.findMany({
      where: { requirementId },
      select: { verificationActivityId: true },
    }),
    prisma.requirementDecisionLink.findMany({
      where: { requirementId },
      select: { engineeringDecisionId: true },
    }),
  ]);

  return {
    requirementId,
    designItemIds: designLinks.map((link) => link.designItemId),
    verificationActivityIds: verificationLinks.map((link) => link.verificationActivityId),
    engineeringDecisionIds: decisionLinks.map((link) => link.engineeringDecisionId),
  };
}

// --- Project-scoped access --------------------------------------------------

/**
 * Loads a requirement only if it belongs to the given project.
 *
 * Scoping the query rather than fetching by id and comparing afterwards is
 * what makes a requirement from another project simply not match. Combined
 * with the caller having already proved the project belongs to its
 * organization, this is the tenancy boundary for requirements.
 */
export async function findRequirementInProject(
  projectId: string,
  requirementId: string,
  client: DbClient = prisma,
): Promise<Requirement | null> {
  const row = await client.requirement.findFirst({ where: { id: requirementId, projectId } });
  return row ? toRequirement(row) : null;
}

export interface RequirementOwnerSummary {
  id: string;
  name: string;
  email: string;
}

export interface RequirementListItem extends Requirement {
  owner: RequirementOwnerSummary | null;
}

/**
 * Requirements in a project, ordered by identifier then id.
 *
 * Deterministic ordering matters here: identifiers are what engineers read
 * down a list, and id breaks ties for any two sharing one.
 */
export async function listRequirementsInProject(
  projectId: string,
  options: { status?: RequirementStatus } = {},
  client: DbClient = prisma,
): Promise<RequirementListItem[]> {
  const rows = await client.requirement.findMany({
    where: { projectId, status: options.status },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
    include: { owner: { select: { id: true, name: true, email: true } } },
  });

  return rows.map((row) => ({ ...toRequirement(row), owner: row.owner }));
}

/** The owner record for a requirement, or null. Never selects credential fields. */
export async function findRequirementOwner(
  ownerId: string,
  client: DbClient = prisma,
): Promise<RequirementOwnerSummary | null> {
  return client.user.findUnique({
    where: { id: ownerId },
    select: { id: true, name: true, email: true },
  });
}

// --- Traceability -----------------------------------------------------------

/**
 * Confirms a link target exists *and* sits in the same project.
 *
 * Every relation is checked against its own table with `projectId` in the
 * where clause, so a target from another project (or another organization,
 * which necessarily means another project) cannot be linked.
 */
export async function linkTargetExistsInProject(
  relation: RequirementRelation,
  targetId: string,
  projectId: string,
  client: DbClient = prisma,
): Promise<boolean> {
  const where = { id: targetId, projectId };

  switch (relation) {
    case "STAKEHOLDER_NEED":
      return (await client.stakeholderNeed.findFirst({ where, select: { id: true } })) !== null;
    case "DESIGN_ITEM":
      return (await client.designItem.findFirst({ where, select: { id: true } })) !== null;
    case "VERIFICATION_ACTIVITY":
      return (
        (await client.verificationActivity.findFirst({ where, select: { id: true } })) !== null
      );
    case "ENGINEERING_DECISION":
      return (
        (await client.engineeringDecision.findFirst({ where, select: { id: true } })) !== null
      );
  }
}

export interface CreateRequirementLinkInput {
  requirementId: string;
  relation: RequirementRelation;
  targetId: string;
  linkType?: string | undefined;
  note?: string | null | undefined;
  createdById: string | null;
}

/**
 * Writes one trace edge into its own typed table.
 *
 * Upserts so re-adding an existing edge is idempotent rather than a crash;
 * the caller decides whether that counts as a conflict.
 */
export async function createRequirementLink(
  input: CreateRequirementLinkInput,
  client: DbClient = prisma,
): Promise<void> {
  const { requirementId, targetId, note, createdById } = input;

  switch (input.relation) {
    case "STAKEHOLDER_NEED":
      await client.needRequirementLink.upsert({
        where: {
          stakeholderNeedId_requirementId: { stakeholderNeedId: targetId, requirementId },
        },
        create: { stakeholderNeedId: targetId, requirementId, createdById },
        update: {},
      });
      return;

    case "DESIGN_ITEM": {
      const linkType = (input.linkType ?? "ALLOCATED_TO") as "ALLOCATED_TO" | "SATISFIED_BY";
      await client.requirementDesignLink.upsert({
        where: {
          requirementId_designItemId_linkType: { requirementId, designItemId: targetId, linkType },
        },
        create: { requirementId, designItemId: targetId, linkType, note: note ?? null, createdById },
        update: { note: note ?? null },
      });
      return;
    }

    case "VERIFICATION_ACTIVITY":
      await client.requirementVerificationLink.upsert({
        where: {
          requirementId_verificationActivityId: {
            requirementId,
            verificationActivityId: targetId,
          },
        },
        create: {
          requirementId,
          verificationActivityId: targetId,
          note: note ?? null,
          createdById,
        },
        update: { note: note ?? null },
      });
      return;

    case "ENGINEERING_DECISION": {
      const linkType = input.linkType as
        | "DECISION_ADDRESSES_REQUIREMENT"
        | "REQUIREMENT_DERIVED_FROM_DECISION";
      await client.requirementDecisionLink.upsert({
        where: {
          requirementId_engineeringDecisionId_linkType: {
            requirementId,
            engineeringDecisionId: targetId,
            linkType,
          },
        },
        create: {
          requirementId,
          engineeringDecisionId: targetId,
          linkType,
          note: note ?? null,
          createdById,
        },
        update: { note: note ?? null },
      });
      return;
    }
  }
}

/** Removes a trace edge. Returns how many rows went, so the caller can 404 on none. */
export async function deleteRequirementLink(
  input: { requirementId: string; relation: RequirementRelation; targetId: string; linkType?: string | undefined },
  client: DbClient = prisma,
): Promise<number> {
  const { requirementId, targetId, linkType } = input;

  switch (input.relation) {
    case "STAKEHOLDER_NEED": {
      const { count } = await client.needRequirementLink.deleteMany({
        where: { requirementId, stakeholderNeedId: targetId },
      });
      return count;
    }
    case "DESIGN_ITEM": {
      const { count } = await client.requirementDesignLink.deleteMany({
        where: {
          requirementId,
          designItemId: targetId,
          ...(linkType ? { linkType: linkType as "ALLOCATED_TO" | "SATISFIED_BY" } : {}),
        },
      });
      return count;
    }
    case "VERIFICATION_ACTIVITY": {
      const { count } = await client.requirementVerificationLink.deleteMany({
        where: { requirementId, verificationActivityId: targetId },
      });
      return count;
    }
    case "ENGINEERING_DECISION": {
      const { count } = await client.requirementDecisionLink.deleteMany({
        where: {
          requirementId,
          engineeringDecisionId: targetId,
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
  }
}

/**
 * Every edge on a requirement, with enough of each target to display it.
 *
 * Four queries rather than one union: each relation lives in its own typed
 * table, and each target type names its heading differently (`title` for
 * needs and verification, `name` for design items).
 */
export async function listRequirementLinks(
  requirementId: string,
  client: DbClient = prisma,
): Promise<RequirementLinkSummary[]> {
  const [needs, designItems, verifications, decisions] = await Promise.all([
    client.needRequirementLink.findMany({
      where: { requirementId },
      select: {
        createdAt: true,
        stakeholderNeed: { select: { id: true, identifier: true, title: true } },
      },
    }),
    client.requirementDesignLink.findMany({
      where: { requirementId },
      select: {
        createdAt: true,
        linkType: true,
        note: true,
        designItem: { select: { id: true, identifier: true, name: true } },
      },
    }),
    client.requirementVerificationLink.findMany({
      where: { requirementId },
      select: {
        createdAt: true,
        note: true,
        verificationActivity: { select: { id: true, identifier: true, title: true } },
      },
    }),
    client.requirementDecisionLink.findMany({
      where: { requirementId },
      select: {
        createdAt: true,
        linkType: true,
        note: true,
        engineeringDecision: { select: { id: true, identifier: true, title: true } },
      },
    }),
  ]);

  return [
    ...needs.map((link) => ({
      relation: "STAKEHOLDER_NEED" as const,
      targetId: link.stakeholderNeed.id,
      identifier: link.stakeholderNeed.identifier,
      title: link.stakeholderNeed.title,
      linkType: null,
      note: null,
      createdAt: link.createdAt,
    })),
    ...designItems.map((link) => ({
      relation: "DESIGN_ITEM" as const,
      targetId: link.designItem.id,
      identifier: link.designItem.identifier,
      title: link.designItem.name,
      linkType: link.linkType,
      note: link.note,
      createdAt: link.createdAt,
    })),
    ...verifications.map((link) => ({
      relation: "VERIFICATION_ACTIVITY" as const,
      targetId: link.verificationActivity.id,
      identifier: link.verificationActivity.identifier,
      title: link.verificationActivity.title,
      linkType: null,
      note: link.note,
      createdAt: link.createdAt,
    })),
    ...decisions.map((link) => ({
      relation: "ENGINEERING_DECISION" as const,
      targetId: link.engineeringDecision.id,
      identifier: link.engineeringDecision.identifier,
      title: link.engineeringDecision.title,
      linkType: link.linkType,
      note: link.note,
      createdAt: link.createdAt,
    })),
  ];
}
