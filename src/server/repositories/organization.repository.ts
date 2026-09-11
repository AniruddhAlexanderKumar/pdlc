import { type DbClient, prisma } from "@/lib/db";

/** Organization data access. Minimal by design — only what services need today. */

/** Cheap existence check used before writing organization-scoped records. */
export async function organizationExists(
  organizationId: string,
  client: DbClient = prisma,
): Promise<boolean> {
  const organization = await client.organization.findUnique({
    where: { id: organizationId },
    select: { id: true },
  });
  return organization !== null;
}

export async function createOrganization(
  input: { name: string; slug: string },
  client: DbClient = prisma,
): Promise<{ id: string; name: string; slug: string }> {
  return client.organization.create({
    data: input,
    select: { id: true, name: true, slug: true },
  });
}

export async function slugExists(slug: string, client: DbClient = prisma): Promise<boolean> {
  const organization = await client.organization.findUnique({
    where: { slug },
    select: { id: true },
  });
  return organization !== null;
}
