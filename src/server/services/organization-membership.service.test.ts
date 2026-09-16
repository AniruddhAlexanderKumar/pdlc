// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError, ForbiddenError, ValidationError } from "@/server/errors";

/**
 * Organization membership administration, against fake repositories: no
 * database, no Prisma. Real Argon2id hashing runs (mirrors
 * `auth.service.test.ts`'s own convention) so a mocked hash can never mask
 * a wiring mistake.
 */
const TX = { __transaction: true } as const;

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)) },
}));

vi.mock("@/server/repositories/user.repository", () => ({
  listOrganizationMembers: vi.fn(),
  emailExists: vi.fn(),
  createUser: vi.fn(),
  createCredential: vi.fn(),
  getOrganizationRole: vi.fn(),
}));

vi.mock("@/server/repositories/audit-log.repository", () => ({
  recordAuditEvent: vi.fn(),
}));

const userRepository = await import("@/server/repositories/user.repository");
const auditLogRepository = await import("@/server/repositories/audit-log.repository");
const service = await import("./organization-membership.service");

const CONTEXT: OrganizationContext = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
};

const VALID_MEMBER = {
  name: "Grace Hopper",
  email: "grace@example.test",
  password: "correct horse battery staple",
};

const NEW_USER = {
  id: "user2aaaaaaaaaaaaaaaaaaa",
  name: "Grace Hopper",
  email: "grace@example.test",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("OWNER");
  vi.mocked(userRepository.emailExists).mockResolvedValue(false);
  vi.mocked(userRepository.createUser).mockResolvedValue(NEW_USER as never);
  vi.mocked(userRepository.createCredential).mockResolvedValue(undefined as never);
});

describe("listOrganizationMembers", () => {
  it("returns every member of the caller's organization — no role check, any authenticated member reads", async () => {
    vi.mocked(userRepository.listOrganizationMembers).mockResolvedValue([
      {
        id: "user1",
        name: "Ada",
        email: "ada@example.test",
        organizationRole: "OWNER",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        projectCount: 2,
      },
    ]);

    const members = await service.listOrganizationMembers(CONTEXT);

    expect(members).toHaveLength(1);
    expect(userRepository.listOrganizationMembers).toHaveBeenCalledWith(CONTEXT.organizationId);
  });
});

describe("addOrganizationMember", () => {
  it("refuses a non-owner outright, never touching the repository", async () => {
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");

    await expect(service.addOrganizationMember(CONTEXT, VALID_MEMBER)).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    expect(userRepository.createUser).not.toHaveBeenCalled();
  });

  it("an owner provisions a new account, scoped into their own organization as MEMBER", async () => {
    const created = await service.addOrganizationMember(CONTEXT, VALID_MEMBER);

    expect(created).toEqual(NEW_USER);
    expect(userRepository.createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: VALID_MEMBER.email,
        name: VALID_MEMBER.name,
        organizationId: CONTEXT.organizationId,
        organizationRole: "MEMBER",
      }),
      TX,
    );
  });

  it("rejects a request naming an unknown field, e.g. a client-supplied role — the schema is strict", async () => {
    await expect(
      service.addOrganizationMember(CONTEXT, { ...VALID_MEMBER, organizationRole: "OWNER" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(userRepository.createUser).not.toHaveBeenCalled();
  });

  it("stores a real password hash, not the plaintext", async () => {
    await service.addOrganizationMember(CONTEXT, VALID_MEMBER);

    const credentialArg = vi.mocked(userRepository.createCredential).mock.calls[0]?.[0] as {
      passwordHash: string;
    };
    expect(credentialArg.passwordHash).not.toBe(VALID_MEMBER.password);
    expect(credentialArg.passwordHash.length).toBeGreaterThan(20);
  });

  it("audits the creation inside the same transaction, attributed to the actor", async () => {
    await service.addOrganizationMember(CONTEXT, VALID_MEMBER);

    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "organization.member_added",
        organizationId: CONTEXT.organizationId,
        actorId: CONTEXT.actorId,
        entityId: NEW_USER.id,
      }),
      TX,
    );
  });

  it("rejects a duplicate email before hashing anything", async () => {
    vi.mocked(userRepository.emailExists).mockResolvedValue(true);

    await expect(service.addOrganizationMember(CONTEXT, VALID_MEMBER)).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(userRepository.createUser).not.toHaveBeenCalled();
  });

  it("rejects invalid input before checking anything", async () => {
    await expect(
      service.addOrganizationMember(CONTEXT, { ...VALID_MEMBER, email: "not-an-email" }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(userRepository.createUser).not.toHaveBeenCalled();
  });

  it("maps a race-lost unique-email conflict (P2002) to the same ConflictError", async () => {
    const p2002 = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    vi.mocked(userRepository.createUser).mockRejectedValue(p2002);

    await expect(service.addOrganizationMember(CONTEXT, VALID_MEMBER)).rejects.toBeInstanceOf(
      ConflictError,
    );
  });
});
