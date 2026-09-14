import type { EngineeringIndustry } from "@/domain";
import { type DbClient, prisma } from "@/lib/db";

/** Organization data access. Minimal by design — only what services need today. */

const PROFILE_SELECT = {
  id: true,
  name: true,
  industry: true,
  industryOtherDetail: true,
  industrySetAt: true,
  industrySetBy: { select: { id: true, name: true } },
} as const;

export interface OrganizationProfileRow {
  id: string;
  name: string;
  industry: EngineeringIndustry | null;
  industryOtherDetail: string | null;
  industrySetAt: Date | null;
  industrySetBy: { id: string; name: string } | null;
}

export async function getOrganizationProfile(
  organizationId: string,
  client: DbClient = prisma,
): Promise<OrganizationProfileRow | null> {
  return client.organization.findUnique({ where: { id: organizationId }, select: PROFILE_SELECT });
}

export async function updateOrganizationIndustry(
  input: {
    organizationId: string;
    industry: EngineeringIndustry;
    otherDetail: string | null;
    setById: string;
    setAt: Date;
  },
  client: DbClient = prisma,
): Promise<OrganizationProfileRow> {
  return client.organization.update({
    where: { id: input.organizationId },
    data: {
      industry: input.industry,
      industryOtherDetail: input.otherDetail,
      industrySetAt: input.setAt,
      industrySetById: input.setById,
    },
    select: PROFILE_SELECT,
  });
}

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
