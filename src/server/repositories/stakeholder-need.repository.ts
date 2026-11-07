import type { StakeholderNeed, StakeholderNeedStatus } from "@/domain";
import { type DbClient, prisma } from "@/lib/db";
import { toStakeholderNeed } from "./mappers";
import { rethrowAsConflict } from "./prisma-error";

/**
 * Stakeholder need data access.
 *
 * Every read is project-scoped, so a need from another project cannot match
 * even if its id is guessed. Callers prove project ownership first.
 */

export interface CreateStakeholderNeedData {
  projectId: string;
  identifier: string;
  title: string;
  description: string;
  stakeholder: string;
  status?: StakeholderNeedStatus | undefined;
}

export async function createStakeholderNeed(
  data: CreateStakeholderNeedData,
  client: DbClient = prisma,
): Promise<StakeholderNeed> {
  try {
    const row = await client.stakeholderNeed.create({
      data: {
        projectId: data.projectId,
        identifier: data.identifier,
        title: data.title,
        description: data.description,
        stakeholder: data.stakeholder,
        ...(data.status ? { status: data.status } : {}),
      },
    });
    return toStakeholderNeed(row);
  } catch (error) {
    rethrowAsConflict(
      error,
      `Stakeholder need ${data.identifier} already exists in this project.`,
    );
  }
}

export async function findStakeholderNeedInProject(
  projectId: string,
  needId: string,
  client: DbClient = prisma,
): Promise<StakeholderNeed | null> {
  const row = await client.stakeholderNeed.findFirst({ where: { id: needId, projectId } });
  return row ? toStakeholderNeed(row) : null;
}

/** Needs in a project, ordered by identifier then id for a stable list. */
export async function listStakeholderNeedsInProject(
  projectId: string,
  options: { status?: StakeholderNeedStatus } = {},
  client: DbClient = prisma,
): Promise<StakeholderNeed[]> {
  const rows = await client.stakeholderNeed.findMany({
    where: { projectId, status: options.status },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
  });
  return rows.map(toStakeholderNeed);
}

export interface UpdateStakeholderNeedData {
  title?: string | undefined;
  description?: string | undefined;
  stakeholder?: string | undefined;
  status?: StakeholderNeedStatus | undefined;
}

export async function updateStakeholderNeed(
  id: string,
  data: UpdateStakeholderNeedData,
  client: DbClient = prisma,
): Promise<StakeholderNeed> {
  const row = await client.stakeholderNeed.update({ where: { id }, data });
  return toStakeholderNeed(row);
}

export interface LinkedRequirementSummary {
  id: string;
  identifier: string;
  title: string;
  status: string;
}

/**
 * Requirements that derive from this need, read from the existing
 * NeedRequirementLink table — the same edges the requirement module writes.
 */
export async function listRequirementsForNeed(
  needId: string,
  client: DbClient = prisma,
): Promise<LinkedRequirementSummary[]> {
  const links = await client.needRequirementLink.findMany({
    where: { stakeholderNeedId: needId },
    select: {
      requirement: { select: { id: true, identifier: true, title: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return links.map((link) => link.requirement);
}
