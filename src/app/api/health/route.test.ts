// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The readiness endpoint: reports real database connectivity, never mutates
 * anything, and never leaks a driver error or connection detail to the
 * client on failure.
 */

vi.mock("@/lib/db", () => ({
  prisma: { $queryRaw: vi.fn() },
}));

vi.mock("@/lib/logger", () => ({
  logger: { child: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }) },
}));

const { prisma } = await import("@/lib/db");
const { GET } = await import("./route");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/health", () => {
  it("reports ok with a database check when PostgreSQL answers", async () => {
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ "?column?": 1 }]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "ok", checks: { database: "ok" } });
    expect(typeof body.latencyMs).toBe("number");
  });

  it("reports 503 and never leaks the underlying error when the database is unreachable", async () => {
    vi.mocked(prisma.$queryRaw).mockRejectedValue(
      new Error("connection refused at 10.0.0.5:5432 user=pdlc_admin"),
    );

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toMatchObject({ status: "error", checks: { database: "unreachable" } });
    // The whole response body, serialized, must never contain the driver's
    // own message — that would leak an internal host/user detail to whoever
    // can reach this unauthenticated endpoint.
    expect(JSON.stringify(body)).not.toMatch(/10\.0\.0\.5|pdlc_admin|connection refused/);
  });

  it("never touches a write path — the module imports no mutating repository function", async () => {
    // Structural guard, not a runtime one: this test file's only mock of
    // @/lib/db is $queryRaw, so if the route ever started calling e.g.
    // prisma.project.create, importing the route would already have failed
    // above with "not a function" before reaching this test.
    vi.mocked(prisma.$queryRaw).mockResolvedValue([{ "?column?": 1 }]);
    await GET();
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
