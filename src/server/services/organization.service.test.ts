// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

/**
 * Organization profile — against fake repositories, no database. Mirrors
 * `organization-membership.service.test.ts`'s conventions exactly: same fake
 * transaction, same owner-check mock via `userRepository.getOrganizationRole`
 * (what `requireOrganizationOwner` actually calls under the hood).
 */
const TX = { __transaction: true } as const;

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)) },
}));

vi.mock("@/server/repositories/user.repository", () => ({
  getOrganizationRole: vi.fn(),
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  getOrganizationProfile: vi.fn(),
  updateOrganizationIndustry: vi.fn(),
  updateOrganizationTerminology: vi.fn(),
}));

vi.mock("@/server/repositories/audit-log.repository", () => ({
  recordAuditEvent: vi.fn(),
}));

const userRepository = await import("@/server/repositories/user.repository");
const organizationRepository = await import("@/server/repositories/organization.repository");
const auditLogRepository = await import("@/server/repositories/audit-log.repository");
const service = await import("./organization.service");

const CONTEXT: OrganizationContext = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
};

const PROFILE_ROW = {
  id: CONTEXT.organizationId,
  name: "Example Aerospace",
  industry: null,
  industryOtherDetail: null,
  industrySetAt: null,
  industrySetBy: null,
  labelOverrides: null,
  labelOverridesSetAt: null,
  labelOverridesSetBy: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("OWNER");
  vi.mocked(organizationRepository.getOrganizationProfile).mockResolvedValue(PROFILE_ROW as never);
});

describe("getOrganizationProfile", () => {
  it("returns the profile for any authenticated member — no owner check", async () => {
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");

    const profile = await service.getOrganizationProfile(CONTEXT);

    expect(profile.industry).toBeNull();
    expect(profile.labelOverrides).toEqual({});
    expect(userRepository.getOrganizationRole).not.toHaveBeenCalled();
  });

  it("throws NotFoundError if the organization row is somehow gone", async () => {
    vi.mocked(organizationRepository.getOrganizationProfile).mockResolvedValue(null);

    await expect(service.getOrganizationProfile(CONTEXT)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("setOrganizationIndustry", () => {
  const SET_ROW = {
    ...PROFILE_ROW,
    industry: "AEROSPACE_DEFENSE",
    industrySetAt: new Date("2026-01-01T00:00:00.000Z"),
    industrySetBy: { id: CONTEXT.actorId, name: "Ada Lovelace" },
  };

  it("refuses a non-owner outright, never touching the repository", async () => {
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");

    await expect(
      service.setOrganizationIndustry(CONTEXT, { industry: "AEROSPACE_DEFENSE" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(organizationRepository.updateOrganizationIndustry).not.toHaveBeenCalled();
  });

  it("an owner sets a real industry", async () => {
    vi.mocked(organizationRepository.updateOrganizationIndustry).mockResolvedValue(SET_ROW as never);

    const profile = await service.setOrganizationIndustry(CONTEXT, { industry: "AEROSPACE_DEFENSE" });

    expect(profile.industry).toBe("AEROSPACE_DEFENSE");
    expect(organizationRepository.updateOrganizationIndustry).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: CONTEXT.organizationId,
        industry: "AEROSPACE_DEFENSE",
        otherDetail: null,
        setById: CONTEXT.actorId,
      }),
      TX,
    );
  });

  it("audits the change inside the same transaction, attributed to the actor", async () => {
    vi.mocked(organizationRepository.updateOrganizationIndustry).mockResolvedValue(SET_ROW as never);

    await service.setOrganizationIndustry(CONTEXT, { industry: "AEROSPACE_DEFENSE" });

    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "organization.industry_set",
        organizationId: CONTEXT.organizationId,
        actorId: CONTEXT.actorId,
        entityId: CONTEXT.organizationId,
        metadata: { industry: "AEROSPACE_DEFENSE", otherDetail: null },
      }),
      TX,
    );
  });

  it("requires otherDetail when the industry is OTHER_ENGINEERING", async () => {
    await expect(
      service.setOrganizationIndustry(CONTEXT, { industry: "OTHER_ENGINEERING" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(organizationRepository.updateOrganizationIndustry).not.toHaveBeenCalled();
  });

  it("rejects otherDetail attached to a real, named industry — never silently ignored", async () => {
    await expect(
      service.setOrganizationIndustry(CONTEXT, {
        industry: "AEROSPACE_DEFENSE",
        otherDetail: "Should not be allowed here",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(organizationRepository.updateOrganizationIndustry).not.toHaveBeenCalled();
  });

  it("accepts OTHER_ENGINEERING with a real detail", async () => {
    vi.mocked(organizationRepository.updateOrganizationIndustry).mockResolvedValue({
      ...SET_ROW,
      industry: "OTHER_ENGINEERING",
      industryOtherDetail: "Marine renewables",
    } as never);

    const profile = await service.setOrganizationIndustry(CONTEXT, {
      industry: "OTHER_ENGINEERING",
      otherDetail: "Marine renewables",
    });

    expect(profile.industry).toBe("OTHER_ENGINEERING");
    expect(organizationRepository.updateOrganizationIndustry).toHaveBeenCalledWith(
      expect.objectContaining({ industry: "OTHER_ENGINEERING", otherDetail: "Marine renewables" }),
      TX,
    );
  });

  it("rejects an unrecognized industry value — the enum is closed", async () => {
    await expect(
      service.setOrganizationIndustry(CONTEXT, { industry: "SPACE_TOURISM" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(organizationRepository.updateOrganizationIndustry).not.toHaveBeenCalled();
  });

  it("rejects a request naming an unknown field — the schema is strict", async () => {
    await expect(
      service.setOrganizationIndustry(CONTEXT, {
        industry: "AEROSPACE_DEFENSE",
        readinessBoost: true,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(organizationRepository.updateOrganizationIndustry).not.toHaveBeenCalled();
  });
});

describe("setOrganizationTerminology", () => {
  const SET_ROW = {
    ...PROFILE_ROW,
    labelOverrides: { risk: "Hazard" },
    labelOverridesSetAt: new Date("2026-01-01T00:00:00.000Z"),
    labelOverridesSetBy: { id: CONTEXT.actorId, name: "Ada Lovelace" },
  };

  it("refuses a non-owner outright, never touching the repository", async () => {
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");

    await expect(
      service.setOrganizationTerminology(CONTEXT, { overrides: { risk: "Hazard" } }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(organizationRepository.updateOrganizationTerminology).not.toHaveBeenCalled();
  });

  it("an owner renames a term", async () => {
    vi.mocked(organizationRepository.updateOrganizationTerminology).mockResolvedValue(SET_ROW as never);

    const profile = await service.setOrganizationTerminology(CONTEXT, {
      overrides: { risk: "Hazard" },
    });

    expect(profile.labelOverrides).toEqual({ risk: "Hazard" });
    expect(organizationRepository.updateOrganizationTerminology).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: CONTEXT.organizationId,
        overrides: { risk: "Hazard" },
        setById: CONTEXT.actorId,
      }),
      TX,
    );
  });

  it("audits the change inside the same transaction, attributed to the actor", async () => {
    vi.mocked(organizationRepository.updateOrganizationTerminology).mockResolvedValue(SET_ROW as never);

    await service.setOrganizationTerminology(CONTEXT, { overrides: { risk: "Hazard" } });

    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "organization.terminology_set",
        organizationId: CONTEXT.organizationId,
        actorId: CONTEXT.actorId,
        entityId: CONTEXT.organizationId,
        metadata: { overrides: { risk: "Hazard" } },
      }),
      TX,
    );
  });

  it("drops a blank value rather than storing a meaningless override", async () => {
    vi.mocked(organizationRepository.updateOrganizationTerminology).mockResolvedValue({
      ...PROFILE_ROW,
      labelOverrides: {},
    } as never);

    await service.setOrganizationTerminology(CONTEXT, {
      overrides: { risk: "Hazard", issue: "   " },
    });

    expect(organizationRepository.updateOrganizationTerminology).toHaveBeenCalledWith(
      expect.objectContaining({ overrides: { risk: "Hazard" } }),
      TX,
    );
  });

  it("trims a value before storing it", async () => {
    vi.mocked(organizationRepository.updateOrganizationTerminology).mockResolvedValue(SET_ROW as never);

    await service.setOrganizationTerminology(CONTEXT, { overrides: { risk: "  Hazard  " } });

    expect(organizationRepository.updateOrganizationTerminology).toHaveBeenCalledWith(
      expect.objectContaining({ overrides: { risk: "Hazard" } }),
      TX,
    );
  });

  it("rejects a key outside the fixed set — the enum is closed", async () => {
    await expect(
      service.setOrganizationTerminology(CONTEXT, { overrides: { traceability: "Renamed" } }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(organizationRepository.updateOrganizationTerminology).not.toHaveBeenCalled();
  });

  it("rejects a request naming an unknown top-level field — the schema is strict", async () => {
    await expect(
      service.setOrganizationTerminology(CONTEXT, {
        overrides: { risk: "Hazard" },
        industry: "AUTOMOTIVE",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(organizationRepository.updateOrganizationTerminology).not.toHaveBeenCalled();
  });
});
