// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/server/repositories/session.repository", () => ({
  createSession: vi.fn(),
  findSessionByTokenHash: vi.fn(),
  touchSession: vi.fn(),
  deleteSessionByTokenHash: vi.fn(),
  deleteExpiredSessions: vi.fn(),
}));

const sessionRepository = await import("@/server/repositories/session.repository");
const {
  createSessionForUser,
  generateSessionToken,
  hashSessionToken,
  invalidateSession,
  resolveSession,
} = await import("./session");

const NOW = new Date("2026-06-01T12:00:00.000Z");

function principal(overrides: { expiresAt: Date; lastSeenAt?: Date }) {
  return {
    id: "sess1aaaaaaaaaaaaaaaaaa",
    expiresAt: overrides.expiresAt,
    lastSeenAt: overrides.lastSeenAt ?? NOW,
    user: {
      id: "user1aaaaaaaaaaaaaaaaaaa",
      name: "Ada Lovelace",
      email: "ada@example.test",
      role: "ADMIN",
      organizationRole: "OWNER",
      organization: { id: "org1aaaaaaaaaaaaaaaaaaaa", name: "Example Aerospace" },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("session tokens", () => {
  it("generates unpredictable, high-entropy tokens", () => {
    const tokens = new Set(Array.from({ length: 500 }, () => generateSessionToken()));

    // No collisions across 500 draws, and each carries 32 bytes of entropy.
    expect(tokens.size).toBe(500);
    for (const token of tokens) {
      expect(Buffer.from(token, "base64url")).toHaveLength(32);
      expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("hashes tokens deterministically and irreversibly", () => {
    const token = generateSessionToken();

    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(hashSessionToken(token)).toMatch(/^[0-9a-f]{64}$/);
    // The hash must not contain or equal the token it came from.
    expect(hashSessionToken(token)).not.toBe(token);
    expect(hashSessionToken(token)).not.toContain(token);
  });

  it("produces different hashes for different tokens", () => {
    expect(hashSessionToken("token-a")).not.toBe(hashSessionToken("token-b"));
  });
});

describe("createSessionForUser", () => {
  it("stores only the token hash and returns the raw token once", async () => {
    vi.mocked(sessionRepository.createSession).mockImplementation(async (input) => ({
      id: "sess1aaaaaaaaaaaaaaaaaa",
      expiresAt: input.expiresAt,
    }));

    const issued = await createSessionForUser("user1aaaaaaaaaaaaaaaaaaa", { now: NOW, ttlDays: 30 });

    const persisted = vi.mocked(sessionRepository.createSession).mock.calls[0]?.[0];
    expect(persisted?.tokenHash).toBe(hashSessionToken(issued.token));
    // The raw token is never handed to the database.
    expect(JSON.stringify(persisted)).not.toContain(issued.token);
    expect(issued.expiresAt.getTime()).toBe(NOW.getTime() + 30 * 24 * 60 * 60 * 1000);
  });
});

describe("resolveSession", () => {
  it("resolves a valid session to its user and organization", async () => {
    const future = new Date(NOW.getTime() + 60_000);
    vi.mocked(sessionRepository.findSessionByTokenHash).mockResolvedValue(
      principal({ expiresAt: future }),
    );

    const session = await resolveSession("a-token", { now: NOW });

    expect(session?.user.id).toBe("user1aaaaaaaaaaaaaaaaaaa");
    expect(session?.user.organization.id).toBe("org1aaaaaaaaaaaaaaaaaaaa");
    // Looked up by hash, never by the raw token.
    expect(sessionRepository.findSessionByTokenHash).toHaveBeenCalledWith(
      hashSessionToken("a-token"),
    );
  });

  it("rejects an expired session and deletes it", async () => {
    const past = new Date(NOW.getTime() - 1000);
    vi.mocked(sessionRepository.findSessionByTokenHash).mockResolvedValue(
      principal({ expiresAt: past }),
    );

    await expect(resolveSession("a-token", { now: NOW })).resolves.toBeNull();
    expect(sessionRepository.deleteSessionByTokenHash).toHaveBeenCalledWith(
      hashSessionToken("a-token"),
    );
  });

  it("rejects a session that expires exactly now", async () => {
    vi.mocked(sessionRepository.findSessionByTokenHash).mockResolvedValue(
      principal({ expiresAt: NOW }),
    );
    await expect(resolveSession("a-token", { now: NOW })).resolves.toBeNull();
  });

  it("returns null for unknown, missing or malformed tokens without querying", async () => {
    vi.mocked(sessionRepository.findSessionByTokenHash).mockResolvedValue(null);

    await expect(resolveSession(undefined, { now: NOW })).resolves.toBeNull();
    await expect(resolveSession(null, { now: NOW })).resolves.toBeNull();
    await expect(resolveSession("", { now: NOW })).resolves.toBeNull();
    // Empty/absent cookies short-circuit before touching the database.
    expect(sessionRepository.findSessionByTokenHash).not.toHaveBeenCalled();

    await expect(resolveSession("!!!not-a-real-token!!!", { now: NOW })).resolves.toBeNull();
  });

  it("refreshes lastSeenAt only once the record is a day stale", async () => {
    const future = new Date(NOW.getTime() + 60_000);

    vi.mocked(sessionRepository.findSessionByTokenHash).mockResolvedValue(
      principal({ expiresAt: future, lastSeenAt: new Date(NOW.getTime() - 60_000) }),
    );
    await resolveSession("a-token", { now: NOW });
    expect(sessionRepository.touchSession).not.toHaveBeenCalled();

    vi.mocked(sessionRepository.findSessionByTokenHash).mockResolvedValue(
      principal({ expiresAt: future, lastSeenAt: new Date(NOW.getTime() - 2 * 86_400_000) }),
    );
    await resolveSession("a-token", { now: NOW });
    expect(sessionRepository.touchSession).toHaveBeenCalledTimes(1);
  });
});

describe("invalidateSession", () => {
  it("deletes the session server-side by hash", async () => {
    await invalidateSession("a-token");
    expect(sessionRepository.deleteSessionByTokenHash).toHaveBeenCalledWith(
      hashSessionToken("a-token"),
    );
  });

  it("is a no-op when there is no token", async () => {
    await invalidateSession(undefined);
    expect(sessionRepository.deleteSessionByTokenHash).not.toHaveBeenCalled();
  });
});
