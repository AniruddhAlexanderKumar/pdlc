import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  SKIP_REASON,
  type TestTenant,
  createTestTenant,
  databaseAvailable,
  destroyTestTenant,
  disconnectIntegrationPrisma,
  integrationPrisma,
} from "./setup";

/**
 * Real PostgreSQL exercise of the organization-industry repository layer:
 * the actual enum column, the actual nullable FK to the setting user, and
 * what really happens to that FK when the user is later removed.
 */

const repo = databaseAvailable
  ? await import("@/server/repositories/organization.repository")
  : null;

describe.skipIf(!databaseAvailable)(`organization profile against PostgreSQL (${SKIP_REASON})`, () => {
  let tenant: TestTenant;

  beforeAll(async () => {
    tenant = await createTestTenant("organization-profile");
  });

  afterAll(async () => {
    await destroyTestTenant(tenant);
    await disconnectIntegrationPrisma();
  });

  // Sequential and order-dependent by design, like every other file in this
  // suite (`fileParallelism: false`, one tenant per file): the first test
  // needs a genuinely untouched organization, so it must run before any
  // test here sets an industry.
  it("a fresh organization has no industry set — no silently invented default", async () => {
    const profile = await repo!.getOrganizationProfile(tenant.organizationId);

    expect(profile).not.toBeNull();
    expect(profile!.industry).toBeNull();
    expect(profile!.industryOtherDetail).toBeNull();
    expect(profile!.industrySetAt).toBeNull();
    expect(profile!.industrySetBy).toBeNull();
  });

  it("round-trips a real enum value and the setting user through Postgres", async () => {
    const setAt = new Date("2026-02-01T00:00:00.000Z");

    const updated = await repo!.updateOrganizationIndustry({
      organizationId: tenant.organizationId,
      industry: "AEROSPACE_DEFENSE",
      otherDetail: null,
      setById: tenant.userId,
      setAt,
    });

    expect(updated.industry).toBe("AEROSPACE_DEFENSE");
    expect(updated.industrySetAt?.toISOString()).toBe(setAt.toISOString());
    expect(updated.industrySetBy).toEqual({ id: tenant.userId, name: "Integration Test User" });

    const reread = await repo!.getOrganizationProfile(tenant.organizationId);
    expect(reread!.industry).toBe("AEROSPACE_DEFENSE");
  });

  it("OTHER_ENGINEERING carries its free-text detail through Postgres unchanged", async () => {
    const updated = await repo!.updateOrganizationIndustry({
      organizationId: tenant.organizationId,
      industry: "OTHER_ENGINEERING",
      otherDetail: "Marine renewables",
      setById: tenant.userId,
      setAt: new Date(),
    });

    expect(updated.industry).toBe("OTHER_ENGINEERING");
    expect(updated.industryOtherDetail).toBe("Marine renewables");
  });

  it("deleting the setting user clears the FK (SetNull) without touching the industry value itself", async () => {
    const prisma = integrationPrisma!;
    const disposableUser = await prisma.user.create({
      data: {
        email: `industry-setter-${Date.now()}@test.invalid`,
        name: "Disposable Setter",
        organizationId: tenant.organizationId,
      },
    });

    await repo!.updateOrganizationIndustry({
      organizationId: tenant.organizationId,
      industry: "MEDICAL_DEVICES",
      otherDetail: null,
      setById: disposableUser.id,
      setAt: new Date(),
    });

    await prisma.user.delete({ where: { id: disposableUser.id } });

    const profile = await repo!.getOrganizationProfile(tenant.organizationId);
    expect(profile!.industry).toBe("MEDICAL_DEVICES");
    expect(profile!.industrySetBy).toBeNull();
  });
});
