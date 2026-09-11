import type {
  ComplianceApplicability,
  ComplianceDisposition,
  ComplianceItem,
  ComplianceItemStatus,
  ComplianceMethod,
} from "@/domain";
import { type DbClient, prisma } from "@/lib/db";

export interface CreateComplianceItemData {
  certificationBasisId: string;
  identifier: string;
  title: string;
  description: string | null;
}

export async function createItem(
  data: CreateComplianceItemData,
  client: DbClient = prisma,
): Promise<ComplianceItem> {
  return client.complianceItem.create({ data });
}

export async function findItemInBasis(
  certificationBasisId: string,
  id: string,
  client: DbClient = prisma,
): Promise<ComplianceItem | null> {
  return client.complianceItem.findFirst({ where: { id, certificationBasisId } });
}

/**
 * Resolves an item by id when only the project is known — the detail route
 * takes an item id directly, so the basis (and its program) is walked
 * upward rather than required as a path parameter.
 */
export async function findItemInProject(
  projectId: string,
  id: string,
  client: DbClient = prisma,
): Promise<ComplianceItem | null> {
  return client.complianceItem.findFirst({
    where: { id, certificationBasis: { certificationProgram: { projectId } } },
  });
}

export interface ComplianceItemWithCounts extends ComplianceItem {
  _count: { findings: number };
}

export async function listItemsInBasis(
  certificationBasisId: string,
  client: DbClient = prisma,
): Promise<ComplianceItemWithCounts[]> {
  return client.complianceItem.findMany({
    where: { certificationBasisId },
    include: { _count: { select: { findings: true } } },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
  });
}

export interface UpdateComplianceItemData {
  title?: string;
  description?: string | null;
  applicability?: ComplianceApplicability;
  applicabilityRationale?: string | null;
  applicabilityReviewerId?: string | null;
  applicabilityReviewedAt?: Date | null;
  method?: ComplianceMethod | null;
  status?: ComplianceItemStatus;
  disposition?: ComplianceDisposition;
}

export async function updateItem(
  id: string,
  data: UpdateComplianceItemData,
  client: DbClient = prisma,
): Promise<ComplianceItem> {
  return client.complianceItem.update({ where: { id }, data });
}
