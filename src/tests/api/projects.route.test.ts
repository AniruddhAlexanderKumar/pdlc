// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project } from "@/domain";
import { ConflictError, UnauthorizedError } from "@/server/errors";

/**
 * These exercise the route handlers against the *real* application service,
 * with only the repositories and transaction faked. Validation, tenancy
 * scoping and error-to-status mapping are therefore genuinely under test —
 * without needing PostgreSQL.
 */
const TX = { __transaction: true } as const;

/** What a resolved session yields — the only source of tenancy. */
const CONTEXT = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
  sessionId: "sess1aaaaaaaaaaaaaaaaaa",
  user: {
    id: "user1aaaaaaaaaaaaaaaaaaa",
    name: "Ada Lovelace",
    email: "ada@example.test",
    role: "ADMIN",
    organizationRole: "OWNER",
  },
  organization: { id: "org1aaaaaaaaaaaaaaaaaaaa", name: "Example Aerospace" },
};

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)) },
}));

vi.mock("@/server/auth/context", () => ({
  requireAuthenticatedContext: vi.fn(async () => CONTEXT),
}));

vi.mock("@/server/repositories/project.repository", () => ({
  createProject: vi.fn(),
  findProjectInOrganization: vi.fn(),
  listProjectsByOrganization: vi.fn(),
  updateProject: vi.fn(),
}));

vi.mock("@/server/repositories/organization.repository", () => ({
  organizationExists: vi.fn(),
}));

vi.mock("@/server/repositories/audit-log.repository", () => ({
  recordAuditEvent: vi.fn(),
}));

vi.mock("@/server/repositories/project-membership.repository", () => ({
  findMembership: vi.fn(),
  createMembership: vi.fn(),
}));

vi.mock("@/server/repositories/user.repository", () => ({
  getOrganizationRole: vi.fn(),
}));

const authContext = await import("@/server/auth/context");
const projectRepository = await import("@/server/repositories/project.repository");
const organizationRepository = await import("@/server/repositories/organization.repository");
const auditLogRepository = await import("@/server/repositories/audit-log.repository");
const membershipRepository = await import("@/server/repositories/project-membership.repository");
const userRepository = await import("@/server/repositories/user.repository");
const collectionRoute = await import("@/app/api/projects/route");
const itemRoute = await import("@/app/api/projects/[projectId]/route");
const archiveRoute = await import("@/app/api/projects/[projectId]/archive/route");

const PROJECT: Project = {
  id: "proj1aaaaaaaaaaaaaaaaaaa",
  organizationId: CONTEXT.organizationId,
  name: "Upper Stage Propulsion",
  description: null,
  status: "ACTIVE",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function jsonRequest(method: string, body: unknown): Request {
  return new Request("http://localhost/api/projects", {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** GET/HEAD requests cannot carry a body. */
function getRequest(): Request {
  return new Request("http://localhost/api/projects", { method: "GET" });
}

function routeContext(projectId: string) {
  return { params: Promise.resolve({ projectId }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(organizationRepository.organizationExists).mockResolvedValue(true);
  vi.mocked(authContext.requireAuthenticatedContext).mockResolvedValue(CONTEXT);
  // CONTEXT's caller is the organization owner: full project access with no
  // explicit ProjectMembership row required.
  vi.mocked(membershipRepository.findMembership).mockResolvedValue(null);
  vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("OWNER");
  vi.mocked(membershipRepository.createMembership).mockResolvedValue({
    id: "mem1",
    projectId: PROJECT.id,
    role: "MANAGER",
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: CONTEXT.actorId, name: "Ada", email: "ada@example.test", organizationRole: "OWNER" },
  });
});

describe("authentication is required", () => {
  /** Simulates no cookie, an expired session, or a forged token — all identical. */
  function unauthenticated() {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());
  }

  it("rejects an unauthenticated project list with 401", async () => {
    unauthenticated();

    const response = await collectionRoute.GET();

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
    // No organization's data is read for an unauthenticated caller.
    expect(projectRepository.listProjectsByOrganization).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated project creation with 401", async () => {
    unauthenticated();

    const response = await collectionRoute.POST(jsonRequest("POST", { name: "Sneaky" }));

    expect(response.status).toBe(401);
    expect(projectRepository.createProject).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated reads, updates and archives with 401", async () => {
    unauthenticated();

    const get = await itemRoute.GET(getRequest(), routeContext(PROJECT.id));
    const patch = await itemRoute.PATCH(
      jsonRequest("PATCH", { name: "Renamed" }),
      routeContext(PROJECT.id),
    );
    const archive = await archiveRoute.POST(jsonRequest("POST", {}), routeContext(PROJECT.id));

    expect([get.status, patch.status, archive.status]).toEqual([401, 401, 401]);
    expect(projectRepository.findProjectInOrganization).not.toHaveBeenCalled();
    expect(projectRepository.updateProject).not.toHaveBeenCalled();
  });

  it("scopes an authenticated request to the session's organization, not the client's claim", async () => {
    vi.mocked(projectRepository.createProject).mockResolvedValue(PROJECT);

    // The body tries to name a different organization; it must be rejected as
    // an unknown field rather than honoured.
    const response = await collectionRoute.POST(
      jsonRequest("POST", { name: "Cross-tenant", organizationId: "org2bbbbbbbbbbbbbbbbbbbb" }),
    );

    expect(response.status).toBe(400);
    expect(projectRepository.createProject).not.toHaveBeenCalled();
  });

  it("attributes the audit actor to the session user", async () => {
    vi.mocked(projectRepository.createProject).mockResolvedValue(PROJECT);

    await collectionRoute.POST(jsonRequest("POST", { name: "Upper Stage Propulsion" }));

    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: CONTEXT.organizationId,
        actorId: CONTEXT.user.id,
        action: "project.created",
      }),
      TX,
    );
  });
});

describe("POST /api/projects", () => {
  it("creates a project and returns 201", async () => {
    vi.mocked(projectRepository.createProject).mockResolvedValue(PROJECT);

    const response = await collectionRoute.POST(
      jsonRequest("POST", { name: "Upper Stage Propulsion" }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.project.id).toBe(PROJECT.id);
    expect(projectRepository.createProject).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: CONTEXT.organizationId }),
      TX,
    );
  });

  it("returns 400 for invalid input", async () => {
    const response = await collectionRoute.POST(jsonRequest("POST", { name: "" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(projectRepository.createProject).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed JSON body", async () => {
    const response = await collectionRoute.POST(jsonRequest("POST", "{not json"));

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 409 when the project name is already taken", async () => {
    vi.mocked(projectRepository.createProject).mockRejectedValue(
      new ConflictError("A project named that already exists in this organization."),
    );

    const response = await collectionRoute.POST(jsonRequest("POST", { name: "Duplicate" }));

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("CONFLICT");
  });

  it("returns 500 without leaking internals on an unexpected failure", async () => {
    vi.mocked(projectRepository.createProject).mockRejectedValue(
      new Error("connection string postgres://user:password@host/db refused"),
    );

    const response = await collectionRoute.POST(jsonRequest("POST", { name: "Boom" }));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("password");
  });
});

describe("GET /api/projects", () => {
  it("returns the organization's projects", async () => {
    vi.mocked(projectRepository.listProjectsByOrganization).mockResolvedValue([PROJECT]);

    const response = await collectionRoute.GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.projects).toHaveLength(1);
    expect(projectRepository.listProjectsByOrganization).toHaveBeenCalledWith(
      CONTEXT.organizationId,
    );
  });

  it("returns an empty list for an organization with no projects", async () => {
    vi.mocked(projectRepository.listProjectsByOrganization).mockResolvedValue([]);

    const response = await collectionRoute.GET();

    expect(response.status).toBe(200);
    expect((await response.json()).projects).toEqual([]);
  });
});

describe("GET /api/projects/[projectId]", () => {
  it("returns a project in the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);

    const response = await itemRoute.GET(getRequest(), routeContext(PROJECT.id));

    expect(response.status).toBe(200);
    expect((await response.json()).project.id).toBe(PROJECT.id);
  });

  it("returns 404 for a project outside the caller's organization", async () => {
    // The organization-scoped query matches nothing.
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    const response = await itemRoute.GET(getRequest(), routeContext(PROJECT.id));

    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("NOT_FOUND");
    expect(projectRepository.findProjectInOrganization).toHaveBeenCalledWith(
      CONTEXT.organizationId,
      PROJECT.id,
      undefined,
    );
  });

  it("returns 400 for a malformed project id", async () => {
    const response = await itemRoute.GET(getRequest(), routeContext("not a valid id"));

    expect(response.status).toBe(400);
    expect(projectRepository.findProjectInOrganization).not.toHaveBeenCalled();
  });

  it("returns 404 for a same-organization caller with no project membership and no owner role", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
    vi.mocked(membershipRepository.findMembership).mockResolvedValue(null);
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");

    const response = await itemRoute.GET(getRequest(), routeContext(PROJECT.id));

    expect(response.status).toBe(404);
  });
});

describe("PATCH /api/projects/[projectId]", () => {
  it("updates a project and returns 200", async () => {
    const updated = { ...PROJECT, name: "Renamed" };
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
    vi.mocked(projectRepository.updateProject).mockResolvedValue(updated);

    const response = await itemRoute.PATCH(
      jsonRequest("PATCH", { name: "Renamed" }),
      routeContext(PROJECT.id),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).project.name).toBe("Renamed");
  });

  it("returns 400 when trying to change an immutable field", async () => {
    const response = await itemRoute.PATCH(
      jsonRequest("PATCH", { organizationId: "org2bbbbbbbbbbbbbbbbbbbb" }),
      routeContext(PROJECT.id),
    );

    expect(response.status).toBe(400);
    expect(projectRepository.updateProject).not.toHaveBeenCalled();
  });

  it("returns 404 for a project outside the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    const response = await itemRoute.PATCH(
      jsonRequest("PATCH", { name: "Renamed" }),
      routeContext(PROJECT.id),
    );

    expect(response.status).toBe(404);
  });

  it("returns 409 when the project is archived", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue({
      ...PROJECT,
      status: "ARCHIVED",
    });

    const response = await itemRoute.PATCH(
      jsonRequest("PATCH", { name: "Renamed" }),
      routeContext(PROJECT.id),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("CONFLICT");
  });
});

describe("POST /api/projects/[projectId]/archive", () => {
  it("archives an active project", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
    vi.mocked(projectRepository.updateProject).mockResolvedValue({
      ...PROJECT,
      status: "ARCHIVED",
    });

    const response = await archiveRoute.POST(
      jsonRequest("POST", {}),
      routeContext(PROJECT.id),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).project.status).toBe("ARCHIVED");
  });

  it("returns 409 when the project is already archived", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue({
      ...PROJECT,
      status: "ARCHIVED",
    });

    const response = await archiveRoute.POST(jsonRequest("POST", {}), routeContext(PROJECT.id));

    expect(response.status).toBe(409);
    expect(projectRepository.updateProject).not.toHaveBeenCalled();
  });

  it("returns 404 for a project outside the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    const response = await archiveRoute.POST(jsonRequest("POST", {}), routeContext(PROJECT.id));

    expect(response.status).toBe(404);
  });
});
