import type { DesignItem, DesignItemStatus, DesignItemType } from "@/domain";
import { type DbClient, prisma } from "@/lib/db";
import { toDesignItem } from "./mappers";
import { rethrowAsConflict } from "./prisma-error";
import type { LinkedRequirementSummary } from "./stakeholder-need.repository";

/** Design item data access. Project-scoped throughout. */

export interface OwnerSummary {
  id: string;
  name: string;
  email: string;
}

export interface DesignItemWithOwner extends DesignItem {
  owner: OwnerSummary | null;
}

export interface CreateDesignItemData {
  projectId: string;
  identifier: string;
  name: string;
  description: string | null;
  itemType: DesignItemType;
  status?: DesignItemStatus | undefined;
  ownerId: string | null;
}

export async function createDesignItem(
  data: CreateDesignItemData,
  client: DbClient = prisma,
): Promise<DesignItem> {
  try {
    const row = await client.designItem.create({
      data: {
        projectId: data.projectId,
        identifier: data.identifier,
        name: data.name,
        description: data.description,
        itemType: data.itemType,
        ownerId: data.ownerId,
        ...(data.status ? { status: data.status } : {}),
      },
    });
    return toDesignItem(row);
  } catch (error) {
    rethrowAsConflict(error, `Design item ${data.identifier} already exists in this project.`);
  }
}

export async function findDesignItemInProject(
  projectId: string,
  designItemId: string,
  client: DbClient = prisma,
): Promise<DesignItem | null> {
  const row = await client.designItem.findFirst({ where: { id: designItemId, projectId } });
  return row ? toDesignItem(row) : null;
}

export async function listDesignItemsInProject(
  projectId: string,
  options: { itemType?: DesignItemType } = {},
  client: DbClient = prisma,
): Promise<DesignItemWithOwner[]> {
  const rows = await client.designItem.findMany({
    where: { projectId, itemType: options.itemType },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
    include: { owner: { select: { id: true, name: true, email: true } } },
  });
  return rows.map((row) => ({ ...toDesignItem(row), owner: row.owner }));
}

/** Owner record for display. Selects three safe fields — never the credential relation. */
export async function findDesignItemOwner(
  ownerId: string,
  client: DbClient = prisma,
): Promise<OwnerSummary | null> {
  return client.user.findUnique({
    where: { id: ownerId },
    select: { id: true, name: true, email: true },
  });
}

export interface UpdateDesignItemData {
  name?: string | undefined;
  description?: string | null | undefined;
  itemType?: DesignItemType | undefined;
  status?: DesignItemStatus | undefined;
  ownerId?: string | null | undefined;
}

export async function updateDesignItem(
  id: string,
  data: UpdateDesignItemData,
  client: DbClient = prisma,
): Promise<DesignItem> {
  const row = await client.designItem.update({ where: { id }, data });
  return toDesignItem(row);
}

/** Requirements allocated to this item, from the existing RequirementDesignLink edges. */
export async function listRequirementsForDesignItem(
  designItemId: string,
  client: DbClient = prisma,
): Promise<Array<LinkedRequirementSummary & { linkType: string }>> {
  const links = await client.requirementDesignLink.findMany({
    where: { designItemId },
    select: {
      linkType: true,
      requirement: { select: { id: true, identifier: true, title: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return links.map((link) => ({ ...link.requirement, linkType: link.linkType }));
}

export interface LinkedDecisionSummary {
  id: string;
  identifier: string;
  title: string;
  status: string;
}

/**
 * Decisions already recorded against this item.
 *
 * Read-only: the decisions module does not exist yet, so this simply surfaces
 * any edges that are already in the database rather than inventing any.
 */
export async function listDecisionsForDesignItem(
  designItemId: string,
  client: DbClient = prisma,
): Promise<LinkedDecisionSummary[]> {
  const links = await client.decisionDesignLink.findMany({
    where: { designItemId },
    select: {
      engineeringDecision: { select: { id: true, identifier: true, title: true, status: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  return links.map((link) => link.engineeringDecision);
}
