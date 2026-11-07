// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/server/errors";

/**
 * Engineering History route handlers, driven through a faked service —
 * routing, auth, query parsing and error-to-status mapping only.
 * Aggregation correctness lives in `engineering-history.service.test.ts`.
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
vi.mock("@/server/services/engineering-history.service", () => ({
  getProjectHistory: vi.fn(),
  getObjectHistory: vi.fn(),
}));

const authContext = await import("@/server/auth/context");
const service = await import("@/server/services/engineering-history.service");
const projectRoute = await import("@/app/api/projects/[projectId]/history/route");
const objectRoute = await import("@/app/api/projects/[projectId]/history/[objectType]/[objectId]/route");

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";

const PROJECT_RESULT = {
  events: [
    {
      key: "RISK:RISK:rk1:risk.created:2026-01-01T00:00:00.000Z:aud1",
      timestamp: "2026-01-01T00:00:00.000Z",
      category: "CONTENT_CHANGE",
      sourceModule: "RISK",
      sourceType: "RISK",
      sourceId: "rk1",
      sourceIdentifier: "RSK-001",
      sourceLabel: "Coolant supply interruption",
      action: "risk.created",
      label: "Created",
      actorId: "user1aaaaaaaaaaaaaaaaaaa",
      actorName: "Ada",
      detail: null,
      href: `/projects/${PROJECT_ID}/risks/rk1`,
    },
  ],
  page: { offset: 0, limit: 50, total: 1, hasMore: false },
};

const OBJECT_RESULT = {
  ...PROJECT_RESULT,
  object: { type: "RISK", id: "rk1", identifier: "RSK-001", label: "Coolant supply interruption", href: `/projects/${PROJECT_ID}/risks/rk1` },
};

function projectParams() {
  return { params: Promise.resolve({ projectId: PROJECT_ID }) };
}
function objectParams(objectType = "RISK", objectId = "rk1") {
  return { params: Promise.resolve({ projectId: PROJECT_ID, objectType, objectId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authContext.requireAuthenticatedContext).mockResolvedValue(CONTEXT as never);
});

describe("GET /history", () => {
  it("401s without a session, and never reaches the service", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());

    const response = await projectRoute.GET(new Request(`http://localhost/api/projects/${PROJECT_ID}/history`), projectParams());

    expect(response.status).toBe(401);
    expect(service.getProjectHistory).not.toHaveBeenCalled();
  });

  it("returns the composed history stream", async () => {
    vi.mocked(service.getProjectHistory).mockResolvedValue(PROJECT_RESULT as never);

    const response = await projectRoute.GET(new Request(`http://localhost/api/projects/${PROJECT_ID}/history`), projectParams());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.history.events).toHaveLength(1);
    expect(body.history.page.total).toBe(1);
  });

  it("passes query filters straight through to the service, untouched", async () => {
    vi.mocked(service.getProjectHistory).mockResolvedValue(PROJECT_RESULT as never);

    await projectRoute.GET(
      new Request(
        `http://localhost/api/projects/${PROJECT_ID}/history?module=RISK&objectType=RISK&actorId=user1&from=2026-01-01&to=2026-12-31&offset=10&limit=25`,
      ),
      projectParams(),
    );

    expect(service.getProjectHistory).toHaveBeenCalledWith(
      CONTEXT,
      PROJECT_ID,
      { module: "RISK", objectType: "RISK", actorId: "user1", from: "2026-01-01", to: "2026-12-31" },
      { offset: "10", limit: "25" },
    );
  });

  it("404s for a project outside the caller's organization", async () => {
    vi.mocked(service.getProjectHistory).mockRejectedValue(new NotFoundError("Project not found."));

    const response = await projectRoute.GET(new Request(`http://localhost/api/projects/${PROJECT_ID}/history`), projectParams());
    expect(response.status).toBe(404);
  });

  it("exposes only GET on this route", () => {
    const routeModule = projectRoute as unknown as Record<string, unknown>;
    expect(routeModule.POST).toBeUndefined();
    expect(routeModule.PATCH).toBeUndefined();
    expect(routeModule.DELETE).toBeUndefined();
  });

  it("returns no score, probability, heatmap, percentage or composite health field", async () => {
    vi.mocked(service.getProjectHistory).mockResolvedValue(PROJECT_RESULT as never);

    const response = await projectRoute.GET(new Request(`http://localhost/api/projects/${PROJECT_ID}/history`), projectParams());
    const text = await response.text();

    expect(text).not.toMatch(/riskScore|probability|heatmap|healthScore|compositeScore|percentage/i);
  });
});

describe("GET /history/[objectType]/[objectId]", () => {
  it("401s without a session", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());

    const response = await objectRoute.GET(
      new Request(`http://localhost/api/projects/${PROJECT_ID}/history/RISK/rk1`),
      objectParams(),
    );
    expect(response.status).toBe(401);
    expect(service.getObjectHistory).not.toHaveBeenCalled();
  });

  it("returns the object's history and identity", async () => {
    vi.mocked(service.getObjectHistory).mockResolvedValue(OBJECT_RESULT as never);

    const response = await objectRoute.GET(
      new Request(`http://localhost/api/projects/${PROJECT_ID}/history/RISK/rk1`),
      objectParams(),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.history.object.identifier).toBe("RSK-001");
  });

  it("400s a controlled, typed error for an unsupported object type — never an arbitrary table name", async () => {
    vi.mocked(service.getObjectHistory).mockRejectedValue(new ValidationError("Unsupported history object type"));

    const response = await objectRoute.GET(
      new Request(`http://localhost/api/projects/${PROJECT_ID}/history/AuditLog/aud1`),
      objectParams("AuditLog", "aud1"),
    );
    expect(response.status).toBe(400);
  });

  it("404s an object outside this project", async () => {
    vi.mocked(service.getObjectHistory).mockRejectedValue(new NotFoundError("RISK rk1 was not found in this project."));

    const response = await objectRoute.GET(
      new Request(`http://localhost/api/projects/${PROJECT_ID}/history/RISK/rk1`),
      objectParams(),
    );
    expect(response.status).toBe(404);
  });

  it("exposes only GET on this route", () => {
    const routeModule = objectRoute as unknown as Record<string, unknown>;
    expect(routeModule.POST).toBeUndefined();
    expect(routeModule.PATCH).toBeUndefined();
    expect(routeModule.DELETE).toBeUndefined();
  });
});
