// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ForbiddenError, UnauthorizedError, ValidationError } from "@/server/errors";

/**
 * Organization membership route handlers, driven through a faked service so
 * that authentication, body handling and error-to-status mapping are
 * exercised without re-testing account-provisioning logic — that lives in
 * `organization-membership.service.test.ts` against faked repositories.
 */

const CONTEXT = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
  sessionId: "sess1aaaaaaaaaaaaaaaaaa",
  user: { id: "user1aaaaaaaaaaaaaaaaaaa", name: "Ada", email: "ada@example.test", role: "ADMIN", organizationRole: "OWNER" },
  organization: { id: "org1aaaaaaaaaaaaaaaaaaaa", name: "Example Aerospace" },
};

vi.mock("@/server/auth/context", () => ({
  requireAuthenticatedContext: vi.fn(async () => CONTEXT),
}));

vi.mock("@/server/services/organization-membership.service", () => ({
  listOrganizationMembers: vi.fn(),
  addOrganizationMember: vi.fn(),
}));

const authContext = await import("@/server/auth/context");
const service = await import("@/server/services/organization-membership.service");
const route = await import("@/app/api/organization/members/route");

const BASE = "http://localhost/api/organization/members";

const NEW_MEMBER = { id: "user2aaaaaaaaaaaaaaaaaaa", name: "Grace Hopper", email: "grace@example.test" };

/** The richer shape the *list* returns — `addOrganizationMember` still answers with only the three fields above. */
const LISTED_MEMBER = {
  ...NEW_MEMBER,
  organizationRole: "MEMBER" as const,
  joinedAt: "2026-01-01T00:00:00.000Z",
  projectCount: 3,
};

function jsonRequest(url: string, body: unknown, method = "POST") {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authContext.requireAuthenticatedContext).mockResolvedValue(CONTEXT as never);
});

describe("authentication", () => {
  it("401s both routes without a session", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());

    const responses = await Promise.all([
      route.GET(),
      route.POST(jsonRequest(BASE, {})),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401]);
  });

  it("never reaches the service when the session is missing", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());

    await route.POST(jsonRequest(BASE, {}));

    expect(service.addOrganizationMember).not.toHaveBeenCalled();
  });
});

describe("GET /organization/members", () => {
  it("lists every member, for any authenticated member of the organization", async () => {
    vi.mocked(service.listOrganizationMembers).mockResolvedValue([LISTED_MEMBER]);

    const response = await route.GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.members).toEqual([LISTED_MEMBER]);
    expect(service.listOrganizationMembers).toHaveBeenCalledWith(CONTEXT);
  });
});

describe("POST /organization/members", () => {
  it("provisions a new account and returns 201", async () => {
    vi.mocked(service.addOrganizationMember).mockResolvedValue(NEW_MEMBER);

    const response = await route.POST(
      jsonRequest(BASE, { name: "Grace Hopper", email: "grace@example.test", password: "correct horse battery staple" }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.member).toEqual(NEW_MEMBER);
  });

  it("403s a caller who is not the organization owner", async () => {
    vi.mocked(service.addOrganizationMember).mockRejectedValue(new ForbiddenError());

    const response = await route.POST(jsonRequest(BASE, {}));
    expect(response.status).toBe(403);
  });

  it("409s a duplicate email", async () => {
    vi.mocked(service.addOrganizationMember).mockRejectedValue(new ConflictError());

    const response = await route.POST(jsonRequest(BASE, {}));
    expect(response.status).toBe(409);
  });

  it("400s invalid input", async () => {
    vi.mocked(service.addOrganizationMember).mockRejectedValue(new ValidationError());

    const response = await route.POST(jsonRequest(BASE, {}));
    expect(response.status).toBe(400);
  });
});
