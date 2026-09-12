// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, UnauthorizedError, ValidationError } from "@/server/errors";

const TX = { __transaction: true } as const;

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)) },
}));

vi.mock("@/server/repositories/user.repository", () => ({
  findAuthRecordByEmail: vi.fn(),
  emailExists: vi.fn(),
  createUser: vi.fn(),
  createCredential: vi.fn(),
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  createOrganization: vi.fn(),
  slugExists: vi.fn(),
  organizationExists: vi.fn(),
}));

vi.mock("@/server/auth/session", () => ({
  createSessionForUser: vi.fn(),
  invalidateSession: vi.fn(),
}));

const userRepository = await import("@/server/repositories/user.repository");
const organizationRepository = await import("@/server/repositories/organization.repository");
const sessionModule = await import("@/server/auth/session");
const { hashPassword } = await import("@/server/auth/password");
const { resetRateLimiter } = await import("@/server/auth/rate-limit");
const authService = await import("./auth.service");

const VALID_SIGN_UP = {
  name: "Ada Lovelace",
  email: "Ada@Example.TEST",
  password: "correct horse battery staple",
  organizationName: "Example Aerospace",
};

const ORGANIZATION = { id: "org1aaaaaaaaaaaaaaaaaaaa", name: "Example Aerospace", slug: "example-aerospace" };
const USER = {
  id: "user1aaaaaaaaaaaaaaaaaaa",
  name: "Ada Lovelace",
  email: "ada@example.test",
  role: "ADMIN",
  organizationRole: "OWNER",
};
const SESSION = {
  token: "raw-session-token",
  expiresAt: new Date("2026-07-01T00:00:00.000Z"),
  sessionId: "sess1aaaaaaaaaaaaaaaaaa",
};

beforeEach(() => {
  vi.clearAllMocks();
  resetRateLimiter();
  vi.mocked(userRepository.emailExists).mockResolvedValue(false);
  vi.mocked(organizationRepository.slugExists).mockResolvedValue(false);
  vi.mocked(organizationRepository.createOrganization).mockResolvedValue(ORGANIZATION);
  vi.mocked(userRepository.createUser).mockResolvedValue(USER);
  vi.mocked(sessionModule.createSessionForUser).mockResolvedValue(SESSION);
});

describe("register", () => {
  it("creates organization, user, credential and session in one transaction", async () => {
    const result = await authService.register(VALID_SIGN_UP);

    // Every write received the same transaction client, so a failure in any
    // one of them rolls back the rest.
    expect(organizationRepository.createOrganization).toHaveBeenCalledWith(
      { name: "Example Aerospace", slug: "example-aerospace" },
      TX,
    );
    expect(userRepository.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORGANIZATION.id, role: "ADMIN" }),
      TX,
    );
    expect(userRepository.createCredential).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER.id }),
      TX,
    );
    expect(sessionModule.createSessionForUser).toHaveBeenCalledWith(USER.id, { client: TX });

    expect(result.identity.organization.id).toBe(ORGANIZATION.id);
    expect(result.session.token).toBe(SESSION.token);
  });

  it("normalizes the email to a canonical lowercase form", async () => {
    await authService.register(VALID_SIGN_UP);

    expect(userRepository.createUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "ada@example.test" }),
      TX,
    );
  });

  it("stores an Argon2 hash, never the password itself", async () => {
    await authService.register(VALID_SIGN_UP);

    const credential = vi.mocked(userRepository.createCredential).mock.calls[0]?.[0];
    expect(credential?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(credential?.passwordHash).not.toContain(VALID_SIGN_UP.password);
  });

  it("never returns credential material to the caller", async () => {
    const result = await authService.register(VALID_SIGN_UP);

    const serialized = JSON.stringify(result.identity);
    expect(serialized).not.toContain(VALID_SIGN_UP.password);
    expect(serialized).not.toContain("passwordHash");
  });

  it("rejects a duplicate email", async () => {
    vi.mocked(userRepository.emailExists).mockResolvedValue(true);

    await expect(authService.register(VALID_SIGN_UP)).rejects.toBeInstanceOf(ConflictError);
    expect(organizationRepository.createOrganization).not.toHaveBeenCalled();
  });

  it("maps a lost unique-email race to the same conflict", async () => {
    vi.mocked(userRepository.createUser).mockRejectedValue(
      Object.assign(new Error("unique violation"), { code: "P2002" }),
    );

    await expect(authService.register(VALID_SIGN_UP)).rejects.toBeInstanceOf(ConflictError);
  });

  it.each([
    ["a blank name", { ...VALID_SIGN_UP, name: "  " }],
    ["a malformed email", { ...VALID_SIGN_UP, email: "not-an-email" }],
    ["a short password", { ...VALID_SIGN_UP, password: "short" }],
    ["a blank organization name", { ...VALID_SIGN_UP, organizationName: "" }],
    ["an unexpected field", { ...VALID_SIGN_UP, role: "ADMIN" }],
  ])("rejects %s", async (_label, input) => {
    await expect(authService.register(input)).rejects.toBeInstanceOf(ValidationError);
    expect(organizationRepository.createOrganization).not.toHaveBeenCalled();
  });

  it("allocates a distinct slug when the obvious one is taken", async () => {
    vi.mocked(organizationRepository.slugExists).mockResolvedValueOnce(true).mockResolvedValue(false);

    await authService.register(VALID_SIGN_UP);

    const slug = vi.mocked(organizationRepository.createOrganization).mock.calls[0]?.[0].slug;
    expect(slug).toMatch(/^example-aerospace-[a-z0-9]+$/);
  });
});

describe("signIn", () => {
  async function accountWithPassword(password: string) {
    return {
      ...USER,
      organization: { id: ORGANIZATION.id, name: ORGANIZATION.name },
      credential: { passwordHash: await hashPassword(password) },
    };
  }

  it("issues a session for valid credentials", async () => {
    vi.mocked(userRepository.findAuthRecordByEmail).mockResolvedValue(
      await accountWithPassword("correct horse battery staple"),
    );

    const result = await authService.signIn({
      email: "ada@example.test",
      password: "correct horse battery staple",
    });

    expect(sessionModule.createSessionForUser).toHaveBeenCalledWith(USER.id);
    expect(result.session.token).toBe(SESSION.token);
    expect(result.identity.organization.id).toBe(ORGANIZATION.id);
  });

  it("looks the account up by its normalized email", async () => {
    vi.mocked(userRepository.findAuthRecordByEmail).mockResolvedValue(
      await accountWithPassword("correct horse battery staple"),
    );

    await authService.signIn({
      email: "  ADA@Example.test ",
      password: "correct horse battery staple",
    });

    expect(userRepository.findAuthRecordByEmail).toHaveBeenCalledWith("ada@example.test");
  });

  it("fails identically for an unknown account and a wrong password", async () => {
    vi.mocked(userRepository.findAuthRecordByEmail).mockResolvedValue(null);
    const unknownAccount = await authService
      .signIn({ email: "nobody@example.test", password: "some password value" })
      .catch((error: unknown) => error);

    vi.mocked(userRepository.findAuthRecordByEmail).mockResolvedValue(
      await accountWithPassword("the real password value"),
    );
    const wrongPassword = await authService
      .signIn({ email: "ada@example.test", password: "the wrong password" })
      .catch((error: unknown) => error);

    // Identical status and wording: the endpoint cannot be used to discover
    // which email addresses have accounts.
    expect(unknownAccount).toBeInstanceOf(UnauthorizedError);
    expect(wrongPassword).toBeInstanceOf(UnauthorizedError);
    expect((unknownAccount as UnauthorizedError).message).toBe(
      (wrongPassword as UnauthorizedError).message,
    );
    expect((unknownAccount as UnauthorizedError).statusCode).toBe(401);
    expect(sessionModule.createSessionForUser).not.toHaveBeenCalled();
  });

  it("fails generically for an account with no credential record", async () => {
    vi.mocked(userRepository.findAuthRecordByEmail).mockResolvedValue({
      ...USER,
      organization: { id: ORGANIZATION.id, name: ORGANIZATION.name },
      credential: null,
    });

    await expect(
      authService.signIn({ email: "ada@example.test", password: "any password here" }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throttles after repeated failures for the same address", async () => {
    vi.mocked(userRepository.findAuthRecordByEmail).mockResolvedValue(null);

    for (let attempt = 0; attempt < 10; attempt += 1) {
      await authService
        .signIn({ email: "target@example.test", password: "guess attempt here" })
        .catch(() => undefined);
    }

    vi.mocked(userRepository.findAuthRecordByEmail).mockClear();
    await expect(
      authService.signIn({ email: "target@example.test", password: "guess attempt here" }),
    ).rejects.toBeInstanceOf(UnauthorizedError);
    // Throttled attempts short-circuit before hitting the database.
    expect(userRepository.findAuthRecordByEmail).not.toHaveBeenCalled();
  });

  it("rejects malformed input", async () => {
    await expect(authService.signIn({ email: "nope", password: "x" })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("signOut", () => {
  it("invalidates the session server-side", async () => {
    await authService.signOut("raw-session-token");
    expect(sessionModule.invalidateSession).toHaveBeenCalledWith("raw-session-token");
  });

  it("tolerates a missing token", async () => {
    await expect(authService.signOut(undefined)).resolves.toBeUndefined();
  });
});
