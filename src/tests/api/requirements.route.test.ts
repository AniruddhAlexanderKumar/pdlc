// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Requirement } from "@/domain";
import { ConflictError, UnauthorizedError } from "@/server/errors";

/**
 * Requirement route handlers driven through the *real* RequirementService,
 * with only repositories and the transaction faked. Validation, lifecycle
 * enforcement, tenancy and error-to-status mapping are therefore genuinely
 * exercised without PostgreSQL.
 */
const TX = { __transaction: true } as const;

const CONTEXT = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
  sessionId: "sess1aaaaaaaaaaaaaaaaaa",
  user: {
    id: "user1aaaaaaaaaaaaaaaaaaa",
    name: "Ada",
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
  findProjectInOrganization: vi.fn(),
}));

vi.mock("@/server/repositories/requirement.repository", () => ({
  createRequirement: vi.fn(),
  updateRequirement: vi.fn(),
  transitionStatusGuarded: vi.fn(),
  findRequirementInProject: vi.fn(),
  listRequirementsInProject: vi.fn(),
  findRequirementOwner: vi.fn(),
  listRequirementLinks: vi.fn(),
  linkTargetExistsInProject: vi.fn(),
  createRequirementLink: vi.fn(),
  deleteRequirementLink: vi.fn(),
}));

vi.mock("@/server/repositories/user.repository", () => ({
  isMemberOfOrganization: vi.fn(),
  listOrganizationMembers: vi.fn(),
  getOrganizationRole: vi.fn(),
}));

vi.mock("@/server/repositories/project-membership.repository", () => ({ findMembership: vi.fn() }));

vi.mock("@/server/repositories/audit-log.repository", () => ({
  recordAuditEvent: vi.fn(),
  listAuditEventsForEntity: vi.fn(),
}));

vi.mock("@/server/repositories/project-artifacts.repository", () => ({
  listLinkTargets: vi.fn(),
}));

const authContext = await import("@/server/auth/context");
const projectRepository = await import("@/server/repositories/project.repository");
const requirementRepository = await import("@/server/repositories/requirement.repository");
const userRepository = await import("@/server/repositories/user.repository");
const membershipRepository = await import("@/server/repositories/project-membership.repository");
const auditLogRepository = await import("@/server/repositories/audit-log.repository");

const collectionRoute = await import("@/app/api/projects/[projectId]/requirements/route");
const itemRoute = await import("@/app/api/projects/[projectId]/requirements/[requirementId]/route");
const transitionRoute = await import(
  "@/app/api/projects/[projectId]/requirements/[requirementId]/transition/route"
);
const ownerRoute = await import(
  "@/app/api/projects/[projectId]/requirements/[requirementId]/owner/route"
);
const linksRoute = await import(
  "@/app/api/projects/[projectId]/requirements/[requirementId]/links/route"
);

const PROJECT: Project = {
  id: "proj1aaaaaaaaaaaaaaaaaaa",
  organizationId: CONTEXT.organizationId,
  name: "Upper Stage Propulsion",
  description: null,
  status: "ACTIVE",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function requirement(overrides: Partial<Requirement> = {}): Requirement {
  return {
    id: "req1aaaaaaaaaaaaaaaaaaaa",
    projectId: PROJECT.id,
    identifier: "REQ-001",
    title: "Maximum chamber pressure",
    statement: "The engine shall not exceed 120 bar chamber pressure.",
    rationale: null,
    status: "DRAFT",
    priority: "MEDIUM",
    source: null,
    ownerId: null,
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

const BASE_URL = `http://localhost/api/projects/${PROJECT.id}/requirements`;

function jsonRequest(method: string, body: unknown, url = BASE_URL): Request {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function getRequest(url = BASE_URL): Request {
  return new Request(url, { method: "GET" });
}

function projectContext() {
  return { params: Promise.resolve({ projectId: PROJECT.id }) };
}

function requirementContext() {
  return { params: Promise.resolve({ projectId: PROJECT.id, requirementId: "req1aaaaaaaaaaaaaaaaaaaa" }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authContext.requireAuthenticatedContext).mockResolvedValue(CONTEXT);
  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
  vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(true);
  vi.mocked(requirementRepository.linkTargetExistsInProject).mockResolvedValue(true);
  vi.mocked(requirementRepository.listRequirementLinks).mockResolvedValue([]);
  vi.mocked(auditLogRepository.listAuditEventsForEntity).mockResolvedValue([]);
  // CONTEXT's user is an organization OWNER (see CONTEXT above) — full
  // implicit project access with no explicit ProjectMembership row needed.
  vi.mocked(membershipRepository.findMembership).mockResolvedValue(null);
  vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("OWNER");
});

describe("authentication", () => {
  function unauthenticated() {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());
  }

  it("rejects an unauthenticated list with 401", async () => {
    unauthenticated();

    const response = await collectionRoute.GET(getRequest(), projectContext());

    expect(response.status).toBe(401);
    expect((await response.json()).error.code).toBe("UNAUTHORIZED");
    expect(requirementRepository.listRequirementsInProject).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated writes with 401", async () => {
    unauthenticated();

    const create = await collectionRoute.POST(
      jsonRequest("POST", { identifier: "REQ-001", title: "x", statement: "y" }),
      projectContext(),
    );
    const transition = await transitionRoute.POST(
      jsonRequest("POST", { to: "IN_REVIEW" }),
      requirementContext(),
    );

    expect([create.status, transition.status]).toEqual([401, 401]);
    expect(requirementRepository.createRequirement).not.toHaveBeenCalled();
  });
});

describe("GET /requirements", () => {
  it("lists the project's requirements", async () => {
    vi.mocked(requirementRepository.listRequirementsInProject).mockResolvedValue([
      { ...requirement(), owner: null },
    ]);

    const response = await collectionRoute.GET(getRequest(), projectContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.requirements).toHaveLength(1);
    expect(body.requirements[0].identifier).toBe("REQ-001");
  });

  it("passes a status filter through", async () => {
    vi.mocked(requirementRepository.listRequirementsInProject).mockResolvedValue([]);

    await collectionRoute.GET(getRequest(`${BASE_URL}?status=APPROVED`), projectContext());

    expect(requirementRepository.listRequirementsInProject).toHaveBeenCalledWith(PROJECT.id, {
      status: "APPROVED",
    });
  });

  it("returns 404 for a project outside the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    const response = await collectionRoute.GET(getRequest(), projectContext());

    expect(response.status).toBe(404);
    expect(requirementRepository.listRequirementsInProject).not.toHaveBeenCalled();
  });
});

describe("POST /requirements", () => {
  it("creates a requirement and returns 201", async () => {
    vi.mocked(requirementRepository.createRequirement).mockResolvedValue(requirement());

    const response = await collectionRoute.POST(
      jsonRequest("POST", {
        identifier: "REQ-001",
        title: "Maximum chamber pressure",
        statement: "The engine shall not exceed 120 bar chamber pressure.",
      }),
      projectContext(),
    );

    expect(response.status).toBe(201);
    expect((await response.json()).requirement.status).toBe("DRAFT");
  });

  it("returns 400 for invalid input", async () => {
    const response = await collectionRoute.POST(
      jsonRequest("POST", { identifier: "bad id", title: "", statement: "" }),
      projectContext(),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("returns 409 for a duplicate identifier", async () => {
    vi.mocked(requirementRepository.createRequirement).mockRejectedValue(
      new ConflictError("Requirement REQ-001 already exists in this project."),
    );

    const response = await collectionRoute.POST(
      jsonRequest("POST", { identifier: "REQ-001", title: "Dup", statement: "Dup" }),
      projectContext(),
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("CONFLICT");
  });
});

describe("GET /requirements/[id]", () => {
  it("returns the detail with lifecycle and editability, and no persistence noise", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(requirement());

    const response = await itemRoute.GET(getRequest(), requirementContext());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.requirement.availableTransitions).toEqual(["IN_REVIEW", "OBSOLETE"]);
    expect(body.requirement.editable.content).toBe(true);
    // No credential, session or organization internals leak into the payload.
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|tokenHash|organizationId/i);
  });

  it("returns 404 for a requirement in another project", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(null);

    const response = await itemRoute.GET(getRequest(), requirementContext());

    expect(response.status).toBe(404);
  });
});

describe("PATCH /requirements/[id]", () => {
  it("updates content on a draft", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(requirement());
    vi.mocked(requirementRepository.updateRequirement).mockResolvedValue(
      requirement({ title: "Revised" }),
    );

    const response = await itemRoute.PATCH(
      jsonRequest("PATCH", { title: "Revised" }),
      requirementContext(),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).requirement.title).toBe("Revised");
  });

  it("returns 400 when trying to change status through PATCH", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(requirement());

    const response = await itemRoute.PATCH(
      jsonRequest("PATCH", { status: "APPROVED" }),
      requirementContext(),
    );

    expect(response.status).toBe(400);
    expect(requirementRepository.updateRequirement).not.toHaveBeenCalled();
  });

  it("returns 409 when the requirement is approved", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(
      requirement({ status: "APPROVED" }),
    );

    const response = await itemRoute.PATCH(
      jsonRequest("PATCH", { title: "Revised" }),
      requirementContext(),
    );

    expect(response.status).toBe(409);
  });
});

describe("POST /transition", () => {
  it("performs a legal transition", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(requirement());
    vi.mocked(requirementRepository.transitionStatusGuarded).mockResolvedValue(
      requirement({ status: "IN_REVIEW" }),
    );

    const response = await transitionRoute.POST(
      jsonRequest("POST", { to: "IN_REVIEW" }),
      requirementContext(),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).requirement.status).toBe("IN_REVIEW");
  });

  it("returns 409 for an illegal transition and names what is allowed", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(requirement());

    const response = await transitionRoute.POST(
      jsonRequest("POST", { to: "BASELINED" }),
      requirementContext(),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.message).toMatch(/IN_REVIEW/);
    expect(requirementRepository.updateRequirement).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown target status", async () => {
    const response = await transitionRoute.POST(
      jsonRequest("POST", { to: "NOT_A_STATUS" }),
      requirementContext(),
    );

    expect(response.status).toBe(400);
  });
});

describe("POST /owner", () => {
  it("assigns an owner in the same organization", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(requirement());
    vi.mocked(requirementRepository.updateRequirement).mockResolvedValue(
      requirement({ ownerId: "user2aaaaaaaaaaaaaaaaaaa" }),
    );

    const response = await ownerRoute.POST(
      jsonRequest("POST", { ownerId: "user2aaaaaaaaaaaaaaaaaaa" }),
      requirementContext(),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).requirement.ownerId).toBe("user2aaaaaaaaaaaaaaaaaaa");
  });

  it("returns 400 for an owner outside the organization", async () => {
    vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(false);

    const response = await ownerRoute.POST(
      jsonRequest("POST", { ownerId: "userfromanotherorg1234" }),
      requirementContext(),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toMatch(/not a member/i);
    expect(requirementRepository.updateRequirement).not.toHaveBeenCalled();
  });
});

describe("links", () => {
  it("adds a link to a target in the same project", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(requirement());

    const response = await linksRoute.POST(
      jsonRequest("POST", { relation: "DESIGN_ITEM", targetId: "design1aaaaaaaaaaaaaaa" }),
      requirementContext(),
    );

    expect(response.status).toBe(201);
    expect(requirementRepository.createRequirementLink).toHaveBeenCalledWith(
      expect.objectContaining({ createdById: CONTEXT.actorId }),
      TX,
    );
  });

  it("returns 400 for a cross-project link target", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(requirement());
    vi.mocked(requirementRepository.linkTargetExistsInProject).mockResolvedValue(false);

    const response = await linksRoute.POST(
      jsonRequest("POST", { relation: "DESIGN_ITEM", targetId: "designfromotherproject" }),
      requirementContext(),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toMatch(/same project/i);
    expect(requirementRepository.createRequirementLink).not.toHaveBeenCalled();
  });

  it("returns 400 for an untyped or unknown relation", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(requirement());

    const response = await linksRoute.POST(
      jsonRequest("POST", { entityType: "Whatever", entityId: "x" }),
      requirementContext(),
    );

    expect(response.status).toBe(400);
  });

  it("lists links", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(requirement());
    vi.mocked(requirementRepository.listRequirementLinks).mockResolvedValue([
      {
        relation: "DESIGN_ITEM",
        targetId: "design1aaaaaaaaaaaaaaa",
        identifier: "DI-001",
        title: "Combustion chamber",
        linkType: "ALLOCATED_TO",
        note: null,
        createdAt: new Date("2026-02-01T00:00:00.000Z"),
      },
    ]);

    const response = await linksRoute.GET(getRequest(), requirementContext());

    expect(response.status).toBe(200);
    expect((await response.json()).links[0].identifier).toBe("DI-001");
  });

  it("removes a link identified by query parameters", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(requirement());
    vi.mocked(requirementRepository.deleteRequirementLink).mockResolvedValue(1);

    const response = await linksRoute.DELETE(
      new Request(
        `${BASE_URL}/req1/links?relation=DESIGN_ITEM&targetId=design1aaaaaaaaaaaaaaa&linkType=ALLOCATED_TO`,
        { method: "DELETE" },
      ),
      requirementContext(),
    );

    expect(response.status).toBe(200);
    expect(requirementRepository.deleteRequirementLink).toHaveBeenCalledWith(
      expect.objectContaining({ relation: "DESIGN_ITEM", linkType: "ALLOCATED_TO" }),
      TX,
    );
  });

  it("returns 404 when removing a link that does not exist", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(requirement());
    vi.mocked(requirementRepository.deleteRequirementLink).mockResolvedValue(0);

    const response = await linksRoute.DELETE(
      new Request(`${BASE_URL}/req1/links?relation=DESIGN_ITEM&targetId=design1aaaaaaaaaaaaaaa`, {
        method: "DELETE",
      }),
      requirementContext(),
    );

    expect(response.status).toBe(404);
  });
});
