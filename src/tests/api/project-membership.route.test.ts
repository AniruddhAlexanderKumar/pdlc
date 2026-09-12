// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "@/server/errors";

/**
 * Project membership and "my access" route handlers, driven through a faked
 * service so that path parsing, authentication, body handling and
 * error-to-status mapping are exercised without re-testing membership
 * logic — that lives in `project-membership.service.test.ts` against faked
 * repositories.
 */

const CONTEXT = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
  sessionId: "sess1aaaaaaaaaaaaaaaaaa",
  user: { id: "user1aaaaaaaaaaaaaaaaaaa", name: "Ada", email: "ada@example.test", role: "ADMIN", organizationRole: "MEMBER" },
  organization: { id: "org1aaaaaaaaaaaaaaaaaaaa", name: "Example Aerospace" },
};

vi.mock("@/server/auth/context", () => ({
  requireAuthenticatedContext: vi.fn(async () => CONTEXT),
}));

vi.mock("@/server/services/project-membership.service", () => ({
  listMembers: vi.fn(),
  getMyAccess: vi.fn(),
  addMember: vi.fn(),
  changeMemberRole: vi.fn(),
  removeMember: vi.fn(),
}));

const authContext = await import("@/server/auth/context");
const service = await import("@/server/services/project-membership.service");

const collectionRoute = await import("@/app/api/projects/[projectId]/members/route");
const itemRoute = await import("@/app/api/projects/[projectId]/members/[memberId]/route");
const roleRoute = await import("@/app/api/projects/[projectId]/role/route");

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";
const MEMBER_ID = "mem1aaaaaaaaaaaaaaaaaaa";

const BASE = `http://localhost/api/projects/${PROJECT_ID}/members`;
const projectParams = { params: Promise.resolve({ projectId: PROJECT_ID }) };
const memberParams = { params: Promise.resolve({ projectId: PROJECT_ID, memberId: MEMBER_ID }) };

const MEMBER = {
  id: MEMBER_ID,
  projectId: PROJECT_ID,
  role: "ENGINEER",
  createdAt: "2026-03-01T00:00:00.000Z",
  updatedAt: "2026-03-01T00:00:00.000Z",
  user: { id: "user2aaaaaaaaaaaaaaaaaaa", name: "Grace Hopper", email: "grace@example.test", organizationRole: "MEMBER" },
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
  it("401s every members and role route without a session", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());

    const responses = await Promise.all([
      collectionRoute.GET(new Request(BASE), projectParams),
      collectionRoute.POST(jsonRequest(BASE, {}), projectParams),
      itemRoute.PATCH(jsonRequest(`${BASE}/${MEMBER_ID}`, {}, "PATCH"), memberParams),
      itemRoute.DELETE(new Request(`${BASE}/${MEMBER_ID}`, { method: "DELETE" }), memberParams),
      roleRoute.GET(new Request(`http://localhost/api/projects/${PROJECT_ID}/role`), projectParams),
    ]);

    expect(responses.map((response) => response.status)).toEqual(
      new Array(responses.length).fill(401),
    );
  });

  it("never reaches the service when the session is missing", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());

    await collectionRoute.POST(jsonRequest(BASE, {}), projectParams);

    expect(service.addMember).not.toHaveBeenCalled();
  });
});

describe("GET /members", () => {
  it("lists members for any project reader", async () => {
    vi.mocked(service.listMembers).mockResolvedValue([MEMBER] as never);

    const response = await collectionRoute.GET(new Request(BASE), projectParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.members).toHaveLength(1);
    expect(service.listMembers).toHaveBeenCalledWith(CONTEXT, PROJECT_ID);
  });

  it("404s for a caller with no access at all, the service's own tenancy/read-access mapping", async () => {
    vi.mocked(service.listMembers).mockRejectedValue(new NotFoundError());

    const response = await collectionRoute.GET(new Request(BASE), projectParams);
    expect(response.status).toBe(404);
  });
});

describe("POST /members", () => {
  it("adds a member and returns 201", async () => {
    vi.mocked(service.addMember).mockResolvedValue(MEMBER as never);

    const response = await collectionRoute.POST(
      jsonRequest(BASE, { userId: "user2aaaaaaaaaaaaaaaaaaa", role: "ENGINEER" }),
      projectParams,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.member.id).toBe(MEMBER_ID);
    expect(service.addMember).toHaveBeenCalledWith(CONTEXT, PROJECT_ID, {
      userId: "user2aaaaaaaaaaaaaaaaaaa",
      role: "ENGINEER",
    });
  });

  it("403s when the service refuses a non-manager", async () => {
    vi.mocked(service.addMember).mockRejectedValue(new ForbiddenError());

    const response = await collectionRoute.POST(jsonRequest(BASE, {}), projectParams);
    expect(response.status).toBe(403);
  });

  it("409s a duplicate membership", async () => {
    vi.mocked(service.addMember).mockRejectedValue(new ConflictError());

    const response = await collectionRoute.POST(jsonRequest(BASE, {}), projectParams);
    expect(response.status).toBe(409);
  });

  it("400s an owner from another organization", async () => {
    vi.mocked(service.addMember).mockRejectedValue(new ValidationError());

    const response = await collectionRoute.POST(jsonRequest(BASE, {}), projectParams);
    expect(response.status).toBe(400);
  });
});

describe("PATCH /members/:memberId", () => {
  it("changes a member's role", async () => {
    vi.mocked(service.changeMemberRole).mockResolvedValue({ ...MEMBER, role: "REVIEWER" } as never);

    const response = await itemRoute.PATCH(
      jsonRequest(`${BASE}/${MEMBER_ID}`, { role: "REVIEWER" }, "PATCH"),
      memberParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.member.role).toBe("REVIEWER");
    expect(service.changeMemberRole).toHaveBeenCalledWith(CONTEXT, PROJECT_ID, MEMBER_ID, {
      role: "REVIEWER",
    });
  });

  it("403s when the caller is not a manager", async () => {
    vi.mocked(service.changeMemberRole).mockRejectedValue(new ForbiddenError());

    const response = await itemRoute.PATCH(
      jsonRequest(`${BASE}/${MEMBER_ID}`, { role: "REVIEWER" }, "PATCH"),
      memberParams,
    );
    expect(response.status).toBe(403);
  });

  it("404s a member id not on this project", async () => {
    vi.mocked(service.changeMemberRole).mockRejectedValue(new NotFoundError());

    const response = await itemRoute.PATCH(
      jsonRequest(`${BASE}/${MEMBER_ID}`, { role: "REVIEWER" }, "PATCH"),
      memberParams,
    );
    expect(response.status).toBe(404);
  });

  it("409s demoting the last manager", async () => {
    vi.mocked(service.changeMemberRole).mockRejectedValue(new ConflictError());

    const response = await itemRoute.PATCH(
      jsonRequest(`${BASE}/${MEMBER_ID}`, { role: "ENGINEER" }, "PATCH"),
      memberParams,
    );
    expect(response.status).toBe(409);
  });
});

describe("DELETE /members/:memberId", () => {
  it("removes a member", async () => {
    vi.mocked(service.removeMember).mockResolvedValue(undefined);

    const response = await itemRoute.DELETE(
      new Request(`${BASE}/${MEMBER_ID}`, { method: "DELETE" }),
      memberParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.removed).toBe(true);
    expect(service.removeMember).toHaveBeenCalledWith(CONTEXT, PROJECT_ID, MEMBER_ID);
  });

  it("403s when the caller is not a manager", async () => {
    vi.mocked(service.removeMember).mockRejectedValue(new ForbiddenError());

    const response = await itemRoute.DELETE(
      new Request(`${BASE}/${MEMBER_ID}`, { method: "DELETE" }),
      memberParams,
    );
    expect(response.status).toBe(403);
  });

  it("409s removing the last manager", async () => {
    vi.mocked(service.removeMember).mockRejectedValue(new ConflictError());

    const response = await itemRoute.DELETE(
      new Request(`${BASE}/${MEMBER_ID}`, { method: "DELETE" }),
      memberParams,
    );
    expect(response.status).toBe(409);
  });
});

describe("GET /role", () => {
  it("returns the caller's own access", async () => {
    vi.mocked(service.getMyAccess).mockResolvedValue({ role: "ENGINEER", isOrganizationOwner: false });

    const response = await roleRoute.GET(
      new Request(`http://localhost/api/projects/${PROJECT_ID}/role`),
      projectParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.access).toEqual({ role: "ENGINEER", isOrganizationOwner: false });
    expect(service.getMyAccess).toHaveBeenCalledWith(CONTEXT, PROJECT_ID);
  });

  it("404s for a caller with no access at all", async () => {
    vi.mocked(service.getMyAccess).mockRejectedValue(new NotFoundError());

    const response = await roleRoute.GET(
      new Request(`http://localhost/api/projects/${PROJECT_ID}/role`),
      projectParams,
    );
    expect(response.status).toBe(404);
  });
});
