// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChangeRequest, Project } from "@/domain";
import { ConflictError, UnauthorizedError } from "@/server/errors";

/**
 * Change route handlers driven through the *real* ChangeRequestService, with
 * only repositories and the transaction faked. Validation, tenancy, lifecycle,
 * target checking and error-to-status mapping are genuinely exercised without
 * PostgreSQL.
 */

const TX = { __transaction: true } as const;

const CONTEXT = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
  sessionId: "sess1aaaaaaaaaaaaaaaaaa",
  user: { id: "user1aaaaaaaaaaaaaaaaaaa", name: "Ada", email: "ada@example.test", role: "ADMIN" },
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

vi.mock("@/server/repositories/change-request.repository", () => ({
  createChangeRequest: vi.fn(),
  findChangeRequestInProject: vi.fn(),
  listChangeRequestsInProject: vi.fn(),
  findChangeRequester: vi.fn(),
  updateChangeRequest: vi.fn(),
  changeImpactTargetExistsInProject: vi.fn(),
  createDeclaredImpact: vi.fn(),
  findDeclaredImpactForChange: vi.fn(),
  deleteDeclaredImpact: vi.fn(),
  listDeclaredImpacts: vi.fn(),
}));

vi.mock("@/server/repositories/project-artifacts.repository", () => ({
  listChangeImpactTargets: vi.fn(),
}));

vi.mock("@/server/repositories/audit-log.repository", () => ({
  recordAuditEvent: vi.fn(),
  listAuditEventsForEntity: vi.fn(),
}));

vi.mock("@/server/repositories/user.repository", () => ({
  isMemberOfOrganization: vi.fn(),
  getOrganizationRole: vi.fn(),
}));

vi.mock("@/server/repositories/project-membership.repository", () => ({ findMembership: vi.fn() }));

const authContext = await import("@/server/auth/context");
const projectRepository = await import("@/server/repositories/project.repository");
const changeRepository = await import("@/server/repositories/change-request.repository");
const auditLogRepository = await import("@/server/repositories/audit-log.repository");
const userRepository = await import("@/server/repositories/user.repository");
const membershipRepository = await import("@/server/repositories/project-membership.repository");

const collection = await import("@/app/api/projects/[projectId]/changes/route");
const item = await import("@/app/api/projects/[projectId]/changes/[changeId]/route");
const transition = await import(
  "@/app/api/projects/[projectId]/changes/[changeId]/transition/route"
);
const impacts = await import("@/app/api/projects/[projectId]/changes/[changeId]/impacts/route");
const impactItem = await import(
  "@/app/api/projects/[projectId]/changes/[changeId]/impacts/[impactId]/route"
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

const CHANGE_ID = "chg1aaaaaaaaaaaaaaaaaaa";
const IMPACT_ID = "imp1aaaaaaaaaaaaaaaaaa";
const REQUIREMENT_ID = "req1aaaaaaaaaaaaaaaaaaa";

function change(overrides: Partial<ChangeRequest> = {}): ChangeRequest {
  return {
    id: CHANGE_ID,
    projectId: PROJECT.id,
    identifier: "CR-001",
    title: "Raise the chamber pressure limit",
    description: "Raise the limit from 120 to 130 bar.",
    reason: "Performance shortfall found in hot fire.",
    status: "DRAFT",
    requestedById: CONTEXT.actorId,
    createdAt: new Date("2026-02-01T00:00:00.000Z"),
    updatedAt: new Date("2026-02-01T00:00:00.000Z"),
    ...overrides,
  };
}

const BASE = `http://localhost/api/projects/${PROJECT.id}/changes`;
const projectParams = { params: Promise.resolve({ projectId: PROJECT.id }) };
const changeParams = { params: Promise.resolve({ projectId: PROJECT.id, changeId: CHANGE_ID }) };
const impactParams = {
  params: Promise.resolve({ projectId: PROJECT.id, changeId: CHANGE_ID, impactId: IMPACT_ID }),
};

function jsonRequest(url: string, method: string, body: unknown) {
  return new Request(url, {
    method,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

const VALID_CREATE = {
  identifier: "CR-001",
  title: "Raise the chamber pressure limit",
  description: "Raise the limit from 120 to 130 bar.",
  reason: "Performance shortfall found in hot fire.",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authContext.requireAuthenticatedContext).mockResolvedValue(CONTEXT as never);
  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
  vi.mocked(changeRepository.listDeclaredImpacts).mockResolvedValue([]);
  vi.mocked(auditLogRepository.listAuditEventsForEntity).mockResolvedValue([]);
  vi.mocked(changeRepository.findChangeRequester).mockResolvedValue({
    id: CONTEXT.actorId,
    name: "Ada",
  });
  // CONTEXT's actor is treated as the organization owner — full implicit
  // project access with no explicit ProjectMembership row needed.
  vi.mocked(membershipRepository.findMembership).mockResolvedValue(null);
  vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("OWNER");
});

describe("authentication", () => {
  it("401s every change route without a session", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());

    const responses = await Promise.all([
      collection.GET(new Request(BASE), projectParams),
      collection.POST(jsonRequest(BASE, "POST", VALID_CREATE), projectParams),
      item.GET(new Request(`${BASE}/${CHANGE_ID}`), changeParams),
      item.PATCH(jsonRequest(`${BASE}/${CHANGE_ID}`, "PATCH", { title: "x" }), changeParams),
      transition.POST(
        jsonRequest(`${BASE}/${CHANGE_ID}/transition`, "POST", { to: "SUBMITTED" }),
        changeParams,
      ),
      impacts.GET(new Request(`${BASE}/${CHANGE_ID}/impacts`), changeParams),
      impacts.POST(
        jsonRequest(`${BASE}/${CHANGE_ID}/impacts`, "POST", {
          target: { type: "REQUIREMENT", id: REQUIREMENT_ID },
        }),
        changeParams,
      ),
      impactItem.DELETE(new Request(`${BASE}/${CHANGE_ID}/impacts/${IMPACT_ID}`), impactParams),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      401, 401, 401, 401, 401, 401, 401, 401,
    ]);
  });
});

describe("GET /changes", () => {
  it("lists the project's change requests", async () => {
    vi.mocked(changeRepository.listChangeRequestsInProject).mockResolvedValue([
      { ...change(), requestedBy: { id: CONTEXT.actorId, name: "Ada" } },
    ]);

    const response = await collection.GET(new Request(BASE), projectParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.changes).toHaveLength(1);
    expect(body.changes[0]).toMatchObject({
      identifier: "CR-001",
      status: "DRAFT",
      requestedBy: { name: "Ada" },
    });
  });

  it("passes a status filter to the service", async () => {
    vi.mocked(changeRepository.listChangeRequestsInProject).mockResolvedValue([]);

    await collection.GET(new Request(`${BASE}?status=UNDER_REVIEW`), projectParams);

    expect(changeRepository.listChangeRequestsInProject).toHaveBeenCalledWith({
      projectId: PROJECT.id,
      status: "UNDER_REVIEW",
    });
  });

  it("400s on a status that is not a status", async () => {
    const response = await collection.GET(new Request(`${BASE}?status=MERGED`), projectParams);

    expect(response.status).toBe(400);
  });

  it("404s when the project is not in the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    const response = await collection.GET(new Request(BASE), projectParams);

    // Not 403 — the API does not confirm what it will not show.
    expect(response.status).toBe(404);
  });
});

describe("POST /changes", () => {
  it("creates a change in DRAFT and returns 201", async () => {
    vi.mocked(changeRepository.createChangeRequest).mockResolvedValue(change());

    const response = await collection.POST(
      jsonRequest(BASE, "POST", VALID_CREATE),
      projectParams,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.change.status).toBe("DRAFT");
    expect(body.change.requestedById).toBe(CONTEXT.actorId);
  });

  it("takes the requester from the session, never the body", async () => {
    vi.mocked(changeRepository.createChangeRequest).mockResolvedValue(change());

    const response = await collection.POST(
      jsonRequest(BASE, "POST", { ...VALID_CREATE, requestedById: "user9aaaaaaaaaaaaaaaaaa" }),
      projectParams,
    );

    // Rejected outright rather than silently dropped.
    expect(response.status).toBe(400);
    expect(changeRepository.createChangeRequest).not.toHaveBeenCalled();
  });

  it("refuses a status supplied at creation", async () => {
    const response = await collection.POST(
      jsonRequest(BASE, "POST", { ...VALID_CREATE, status: "APPROVED" }),
      projectParams,
    );

    expect(response.status).toBe(400);
  });

  it("400s on an incomplete change", async () => {
    const response = await collection.POST(
      jsonRequest(BASE, "POST", { identifier: "CR-001", title: "Only a title" }),
      projectParams,
    );

    expect(response.status).toBe(400);
  });

  it("409s on a duplicate identifier", async () => {
    vi.mocked(changeRepository.createChangeRequest).mockRejectedValue(
      new ConflictError("Change request CR-001 already exists in this project."),
    );

    const response = await collection.POST(
      jsonRequest(BASE, "POST", VALID_CREATE),
      projectParams,
    );

    expect(response.status).toBe(409);
  });
});

describe("GET /changes/[changeId]", () => {
  it("returns the change with transitions, editability and declared impacts", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(change());

    const response = await item.GET(new Request(`${BASE}/${CHANGE_ID}`), changeParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.change.availableTransitions).toEqual(["SUBMITTED", "CANCELLED"]);
    expect(body.change.editable).toEqual({ definition: true, declaredImpacts: true });
    expect(body.change.declaredImpacts).toEqual([]);
    expect(body.change.history).toEqual([]);
  });

  it("404s for a change in another project", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(null);

    const response = await item.GET(new Request(`${BASE}/${CHANGE_ID}`), changeParams);

    expect(response.status).toBe(404);
  });
});

describe("PATCH /changes/[changeId]", () => {
  it("edits a draft", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(change());
    vi.mocked(changeRepository.updateChangeRequest).mockResolvedValue(
      change({ title: "Revised title" }),
    );

    const response = await item.PATCH(
      jsonRequest(`${BASE}/${CHANGE_ID}`, "PATCH", { title: "Revised title" }),
      changeParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.change.title).toBe("Revised title");
  });

  it("400s when asked to set the status", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(change());

    const response = await item.PATCH(
      jsonRequest(`${BASE}/${CHANGE_ID}`, "PATCH", { status: "APPROVED" }),
      changeParams,
    );

    // Status is not reachable through an ordinary edit.
    expect(response.status).toBe(400);
    expect(changeRepository.updateChangeRequest).not.toHaveBeenCalled();
  });

  it("409s when the change is already under review", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(
      change({ status: "UNDER_REVIEW" }),
    );

    const response = await item.PATCH(
      jsonRequest(`${BASE}/${CHANGE_ID}`, "PATCH", { description: "Something else" }),
      changeParams,
    );

    expect(response.status).toBe(409);
  });
});

describe("POST /changes/[changeId]/transition", () => {
  it("moves a draft to submitted", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(change());
    vi.mocked(changeRepository.updateChangeRequest).mockResolvedValue(
      change({ status: "SUBMITTED" }),
    );

    const response = await transition.POST(
      jsonRequest(`${BASE}/${CHANGE_ID}/transition`, "POST", { to: "SUBMITTED" }),
      changeParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.change.status).toBe("SUBMITTED");
  });

  it("409s on an illegal transition", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(change());

    const response = await transition.POST(
      jsonRequest(`${BASE}/${CHANGE_ID}/transition`, "POST", { to: "APPROVED" }),
      changeParams,
    );

    expect(response.status).toBe(409);
    expect(changeRepository.updateChangeRequest).not.toHaveBeenCalled();
  });

  it("400s on an unknown target status", async () => {
    const response = await transition.POST(
      jsonRequest(`${BASE}/${CHANGE_ID}/transition`, "POST", { to: "MERGED" }),
      changeParams,
    );

    expect(response.status).toBe(400);
  });
});

describe("declared impacts", () => {
  it("lists what the change declares", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(change());
    vi.mocked(changeRepository.listDeclaredImpacts).mockResolvedValue([
      {
        id: IMPACT_ID,
        changeRequestId: CHANGE_ID,
        target: { type: "REQUIREMENT", id: REQUIREMENT_ID },
        targetIdentifier: "REQ-001",
        targetTitle: "Maximum chamber pressure",
        note: null,
        createdAt: new Date("2026-02-02T00:00:00.000Z"),
        createdBy: { id: CONTEXT.actorId, name: "Ada" },
      },
    ]);

    const response = await impacts.GET(new Request(`${BASE}/${CHANGE_ID}/impacts`), changeParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.impacts[0]).toMatchObject({
      target: { type: "REQUIREMENT", id: REQUIREMENT_ID },
      targetIdentifier: "REQ-001",
    });
  });

  it("declares an impact and returns 201", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(change());
    vi.mocked(changeRepository.changeImpactTargetExistsInProject).mockResolvedValue(true);
    vi.mocked(changeRepository.createDeclaredImpact).mockResolvedValue(IMPACT_ID);

    const response = await impacts.POST(
      jsonRequest(`${BASE}/${CHANGE_ID}/impacts`, "POST", {
        target: { type: "REQUIREMENT", id: REQUIREMENT_ID },
        note: "The limit is stated here.",
      }),
      changeParams,
    );

    expect(response.status).toBe(201);
    expect(changeRepository.createDeclaredImpact).toHaveBeenCalledWith(
      expect.objectContaining({ createdById: CONTEXT.actorId }),
      TX,
    );
  });

  it("400s on a target that does not exist in the project", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(change());
    vi.mocked(changeRepository.changeImpactTargetExistsInProject).mockResolvedValue(false);

    const response = await impacts.POST(
      jsonRequest(`${BASE}/${CHANGE_ID}/impacts`, "POST", {
        target: { type: "REQUIREMENT", id: REQUIREMENT_ID },
      }),
      changeParams,
    );

    expect(response.status).toBe(400);
  });

  it("rejects a target from another project", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(change());
    // The scoped existence check is what refuses it: the artifact is real, but
    // it does not live in this project.
    vi.mocked(changeRepository.changeImpactTargetExistsInProject).mockImplementation(
      async (_type, _id, projectId) => projectId === "proj2aaaaaaaaaaaaaaaaaaa",
    );

    const response = await impacts.POST(
      jsonRequest(`${BASE}/${CHANGE_ID}/impacts`, "POST", {
        target: { type: "DESIGN_ITEM", id: "di9aaaaaaaaaaaaaaaaaaaa" },
      }),
      changeParams,
    );

    expect(response.status).toBe(400);
    expect(changeRepository.createDeclaredImpact).not.toHaveBeenCalled();
  });

  it("400s on a target type the impact table cannot store", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(change());

    const response = await impacts.POST(
      jsonRequest(`${BASE}/${CHANGE_ID}/impacts`, "POST", {
        target: { type: "STAKEHOLDER_NEED", id: REQUIREMENT_ID },
      }),
      changeParams,
    );

    expect(response.status).toBe(400);
  });

  it("409s when the declared scope is already fixed", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(
      change({ status: "APPROVED" }),
    );

    const response = await impacts.POST(
      jsonRequest(`${BASE}/${CHANGE_ID}/impacts`, "POST", {
        target: { type: "REQUIREMENT", id: REQUIREMENT_ID },
      }),
      changeParams,
    );

    expect(response.status).toBe(409);
  });

  it("removes a declared impact", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(change());
    vi.mocked(changeRepository.findDeclaredImpactForChange).mockResolvedValue({ id: IMPACT_ID });

    const response = await impactItem.DELETE(
      new Request(`${BASE}/${CHANGE_ID}/impacts/${IMPACT_ID}`),
      impactParams,
    );

    expect(response.status).toBe(200);
    expect(changeRepository.deleteDeclaredImpact).toHaveBeenCalledWith(IMPACT_ID, TX);
  });

  it("404s when the impact belongs to a different change", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(change());
    vi.mocked(changeRepository.findDeclaredImpactForChange).mockResolvedValue(null);

    const response = await impactItem.DELETE(
      new Request(`${BASE}/${CHANGE_ID}/impacts/${IMPACT_ID}`),
      impactParams,
    );

    expect(response.status).toBe(404);
    expect(changeRepository.deleteDeclaredImpact).not.toHaveBeenCalled();
  });
});
