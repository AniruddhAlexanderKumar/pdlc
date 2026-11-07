// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { UnauthorizedError, ValidationError } from "@/server/errors";

/**
 * Search route, driven through a faked service — query-string parsing,
 * auth, and error-to-status mapping only. What search actually finds, and
 * who it lets find it, is proven in `search.service.test.ts` and
 * `src/tests/integration/search.test.ts`.
 */

const CONTEXT = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
  sessionId: "sess1aaaaaaaaaaaaaaaaaa",
  user: { id: "user1aaaaaaaaaaaaaaaaaaa", name: "Ada", email: "ada@example.test", role: "ADMIN" },
  organization: { id: "org1aaaaaaaaaaaaaaaaaaaa", name: "Example Aerospace" },
};

vi.mock("@/server/auth/context", () => ({
  requireAuthenticatedContext: vi.fn(async () => CONTEXT),
}));

vi.mock("@/server/services/search.service", () => ({ search: vi.fn() }));

const authContext = await import("@/server/auth/context");
const service = await import("@/server/services/search.service");
const route = await import("@/app/api/search/route");

const EMPTY = { query: "thrust", results: [], truncated: false };

function get(query: string): Request {
  return new Request(`http://localhost/api/search${query}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authContext.requireAuthenticatedContext).mockResolvedValue(CONTEXT as never);
  vi.mocked(service.search).mockResolvedValue(EMPTY);
});

describe("GET /api/search", () => {
  it("returns results for an authenticated caller", async () => {
    const response = await route.GET(get("?q=thrust"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ search: EMPTY });
  });

  it("passes the session context, never anything from the query string", async () => {
    await route.GET(get("?q=thrust&organizationId=someone-else"));

    expect(service.search).toHaveBeenCalledWith(
      CONTEXT,
      expect.objectContaining({ q: "thrust" }),
    );
    const [, payload] = vi.mocked(service.search).mock.calls[0]!;
    expect(payload).not.toHaveProperty("organizationId");
  });

  it("401s when there is no session", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());

    const response = await route.GET(get("?q=thrust"));

    expect(response.status).toBe(401);
    expect(service.search).not.toHaveBeenCalled();
  });

  it("400s on a term the schema rejects, without leaking internals", async () => {
    vi.mocked(service.search).mockRejectedValue(new ValidationError("Invalid search request", []));

    const response = await route.GET(get("?q=a"));

    expect(response.status).toBe(400);
  });

  it("treats a missing q as an empty term and lets the schema refuse it", async () => {
    await route.GET(get(""));
    expect(service.search).toHaveBeenCalledWith(CONTEXT, expect.objectContaining({ q: "" }));
  });

  it("narrows by project when asked", async () => {
    await route.GET(get("?q=thrust&projectId=proj1aaaaaaaaaaaaaaaaaaa"));

    expect(service.search).toHaveBeenCalledWith(
      CONTEXT,
      expect.objectContaining({ projectId: "proj1aaaaaaaaaaaaaaaaaaa" }),
    );
  });

  it("parses a comma-separated type list", async () => {
    await route.GET(get("?q=thrust&types=RISK,ISSUE"));

    expect(service.search).toHaveBeenCalledWith(
      CONTEXT,
      expect.objectContaining({ types: ["RISK", "ISSUE"] }),
    );
  });

  /**
   * A stale link naming one type that has since been renamed should still
   * search the rest, rather than 400 on the whole request.
   */
  it("drops an unknown type but keeps the known ones", async () => {
    await route.GET(get("?q=thrust&types=RISK,NOT_A_TYPE"));

    expect(service.search).toHaveBeenCalledWith(
      CONTEXT,
      expect.objectContaining({ types: ["RISK"] }),
    );
  });

  it("treats a list of only unknown types as no filter at all, so the schema can refuse it", async () => {
    await route.GET(get("?q=thrust&types=NOT_A_TYPE"));

    expect(service.search).toHaveBeenCalledWith(
      CONTEXT,
      expect.objectContaining({ types: undefined }),
    );
  });

  it("passes a numeric limit through", async () => {
    await route.GET(get("?q=thrust&limit=5"));

    expect(service.search).toHaveBeenCalledWith(CONTEXT, expect.objectContaining({ limit: 5 }));
  });

  it("leaves limit absent when not supplied, rather than inventing one here", async () => {
    await route.GET(get("?q=thrust"));

    expect(service.search).toHaveBeenCalledWith(CONTEXT, expect.objectContaining({ limit: undefined }));
  });
});
