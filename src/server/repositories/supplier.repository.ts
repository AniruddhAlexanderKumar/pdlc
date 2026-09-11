import type { Supplier, SupplierStatus } from "@/domain";
import { type DbClient, prisma } from "@/lib/db";
import { rethrowAsConflict } from "./prisma-error";

/**
 * Supplier data access. Project-scoped throughout.
 *
 * Owns the `suppliers` table and nothing else. Supplied items and
 * qualifications have their own repositories, because they are separate records
 * with separate lifecycles — collapsing them into one "supplier store" would
 * mean a single module deciding what a change to any of them implies, which is
 * the confusion this model exists to avoid.
 *
 * There is no procurement data here: no orders, contracts, prices or ratings.
 */

export interface CreateSupplierData {
  projectId: string;
  identifier: string;
  name: string;
  description: string | null;
  status?: SupplierStatus | undefined;
}

export async function createSupplier(
  data: CreateSupplierData,
  client: DbClient = prisma,
): Promise<Supplier> {
  try {
    return await client.supplier.create({
      data: {
        projectId: data.projectId,
        identifier: data.identifier,
        name: data.name,
        description: data.description,
        ...(data.status ? { status: data.status } : {}),
      },
    });
  } catch (error) {
    rethrowAsConflict(error, `Supplier ${data.identifier} already exists in this project.`);
  }
}

export async function findSupplierInProject(
  projectId: string,
  supplierId: string,
  client: DbClient = prisma,
): Promise<Supplier | null> {
  return client.supplier.findFirst({ where: { id: supplierId, projectId } });
}

/**
 * A supplier with the number of items it provides.
 *
 * The count comes from a real aggregate in the same query — Prisma's `_count`
 * compiles to a correlated subquery, so listing N suppliers is one round trip
 * rather than N+1. The list view shows this figure only because it is genuinely
 * derived; it is never estimated.
 */
export interface SupplierWithCounts extends Supplier {
  suppliedItemCount: number;
  qualificationCount: number;
}

export async function listSuppliersInProject(
  projectId: string,
  options: { status?: SupplierStatus } = {},
  client: DbClient = prisma,
): Promise<SupplierWithCounts[]> {
  const rows = await client.supplier.findMany({
    where: { projectId, status: options.status },
    orderBy: [{ identifier: "asc" }, { id: "asc" }],
    include: { _count: { select: { suppliedItems: true, qualifications: true } } },
  });

  return rows.map(({ _count, ...supplier }) => ({
    ...supplier,
    suppliedItemCount: _count.suppliedItems,
    qualificationCount: _count.qualifications,
  }));
}

export interface UpdateSupplierData {
  name?: string | undefined;
  description?: string | null | undefined;
  status?: SupplierStatus | undefined;
}

/**
 * Updates a supplier.
 *
 * Note what this cannot touch: the project, the identifier, and — most
 * importantly — any qualification. A supplier moving to INACTIVE does not
 * cascade into its qualifications, because a qualification's state is a separate
 * engineering judgement and rewriting it here would destroy the distinction
 * between "we stopped using them" and "the qualification lapsed".
 */
export async function updateSupplier(
  id: string,
  data: UpdateSupplierData,
  client: DbClient = prisma,
): Promise<Supplier> {
  return client.supplier.update({ where: { id }, data });
}
