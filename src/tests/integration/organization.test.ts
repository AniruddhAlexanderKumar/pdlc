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
 * Real PostgreSQL exercise of the organization-industry and
 * organization-terminology repository layers: the actual enum column, the
 * actual JSON column, the actual nullable FKs to the setting user, and what
 * really happens to those FKs when the user is later removed.
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

  // `labelOverrides` is a column of its own, untouched by every test above —
  // still genuinely fresh here, the same "no silently invented default"
  // property the very first test in this file checks for `industry`.
  it("a fresh organization has no terminology overrides set", async () => {
    const profile = await repo!.getOrganizationProfile(tenant.organizationId);

    expect(profile!.labelOverrides).toBeNull();
    expect(profile!.labelOverridesSetAt).toBeNull();
    expect(profile!.labelOverridesSetBy).toBeNull();
  });

  it("round-trips a real JSON object and the setting user through Postgres", async () => {
    const setAt = new Date("2026-02-01T00:00:00.000Z");

    const updated = await repo!.updateOrganizationTerminology({
      organizationId: tenant.organizationId,
      overrides: { risk: "Hazard", issue: "Nonconformance" },
      setById: tenant.userId,
      setAt,
    });

    expect(updated.labelOverrides).toEqual({ risk: "Hazard", issue: "Nonconformance" });
    expect(updated.labelOverridesSetAt?.toISOString()).toBe(setAt.toISOString());
    expect(updated.labelOverridesSetBy).toEqual({ id: tenant.userId, name: "Integration Test User" });

    const reread = await repo!.getOrganizationProfile(tenant.organizationId);
    expect(reread!.labelOverrides).toEqual({ risk: "Hazard", issue: "Nonconformance" });
  });

  it("an empty object clears every override back to this product's defaults", async () => {
    const updated = await repo!.updateOrganizationTerminology({
      organizationId: tenant.organizationId,
      overrides: {},
      setById: tenant.userId,
      setAt: new Date(),
    });

    expect(updated.labelOverrides).toEqual({});
  });

  it("deleting the setting user clears the FK (SetNull) without touching the overrides themselves", async () => {
    const prisma = integrationPrisma!;
    const disposableUser = await prisma.user.create({
      data: {
        email: `terminology-setter-${Date.now()}@test.invalid`,
        name: "Disposable Setter",
        organizationId: tenant.organizationId,
      },
    });

    await repo!.updateOrganizationTerminology({
      organizationId: tenant.organizationId,
      overrides: { requirement: "Specification" },
      setById: disposableUser.id,
      setAt: new Date(),
    });

    await prisma.user.delete({ where: { id: disposableUser.id } });

    const profile = await repo!.getOrganizationProfile(tenant.organizationId);
    expect(profile!.labelOverrides).toEqual({ requirement: "Specification" });
    expect(profile!.labelOverridesSetBy).toBeNull();
  });
});
