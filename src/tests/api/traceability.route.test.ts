// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/server/errors";

/**
 * `GET /traceability/objects` driven with the service mocked — routing,
 * auth, and error-to-status mapping only. Relationship reads themselves go
 * through the pre-existing, unmodified graph routes covered by
 * `graph.route.test.ts`.
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

vi.mock("@/server/services/traceability.service", () => ({
  listSelectableRoots: vi.fn(),
}));

const authContext = await import("@/server/auth/context");
const service = await import("@/server/services/traceability.service");
const objectsRoute = await import("@/app/api/projects/[projectId]/traceability/objects/route");

const PROJECT = "proj1aaaaaaaaaaaaaaaaaa";

function request(query: string) {
  return new Request(`http://localhost/api/projects/${PROJECT}/traceability/objects${query}`);
}

const routeContext = { params: Promise.resolve({ projectId: PROJECT }) };

beforeEach(() => {
  vi.mocked(authContext.requireAuthenticatedContext).mockReset();
  vi.mocked(authContext.requireAuthenticatedContext).mockResolvedValue(CONTEXT as never);
  vi.mocked(service.listSelectableRoots).mockReset();
});

describe("GET /traceability/objects", () => {
  it("401s when there is no session", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(
      new UnauthorizedError("Not signed in."),
    );

    const response = await objectsRoute.GET(request("?type=REQUIREMENT"), routeContext);
    expect(response.status).toBe(401);
  });

  it("returns the objects the service resolves", async () => {
    vi.mocked(service.listSelectableRoots).mockResolvedValue([
      { id: "r1", identifier: "REQ-001", label: "Fuel flow" },
    ]);

    const response = await objectsRoute.GET(request("?type=REQUIREMENT"), routeContext);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ objects: [{ id: "r1", identifier: "REQ-001", label: "Fuel flow" }] });
    expect(service.listSelectableRoots).toHaveBeenCalledWith(CONTEXT, PROJECT, "REQUIREMENT");
  });

  it("passes null through when the type query parameter is missing, letting the service reject it", async () => {
    vi.mocked(service.listSelectableRoots).mockRejectedValue(
      new ValidationError("Invalid or unsupported traceability object type"),
    );

    const response = await objectsRoute.GET(request(""), routeContext);
    expect(response.status).toBe(400);
    expect(service.listSelectableRoots).toHaveBeenCalledWith(CONTEXT, PROJECT, null);
  });

  it("400s for an unsupported node type", async () => {
    vi.mocked(service.listSelectableRoots).mockRejectedValue(
      new ValidationError("Invalid or unsupported traceability object type"),
    );

    const response = await objectsRoute.GET(request("?type=EVIDENCE"), routeContext);
    expect(response.status).toBe(400);
  });

  it("404s when the project is not in the caller's organization", async () => {
    vi.mocked(service.listSelectableRoots).mockRejectedValue(new NotFoundError("Project not found."));

    const response = await objectsRoute.GET(request("?type=REQUIREMENT"), routeContext);
    expect(response.status).toBe(404);
  });

  it("never exposes a mutating method on this route", () => {
    const routeModule = objectsRoute as unknown as Record<string, unknown>;
    expect(routeModule.POST).toBeUndefined();
    expect(routeModule.PATCH).toBeUndefined();
    expect(routeModule.DELETE).toBeUndefined();
  });
});
