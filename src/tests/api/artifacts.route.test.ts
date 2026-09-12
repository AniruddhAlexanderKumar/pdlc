// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DesignItem, Project, StakeholderNeed, VerificationActivity } from "@/domain";
import { ConflictError, UnauthorizedError } from "@/server/errors";

/**
 * Route handlers for the three artifact modules, driven through the *real*
 * services with only repositories and the transaction faked. Validation,
 * lifecycle, tenancy and status mapping are genuinely exercised without
 * PostgreSQL.
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

vi.mock("@/server/repositories/stakeholder-need.repository", () => ({
  createStakeholderNeed: vi.fn(),
  findStakeholderNeedInProject: vi.fn(),
  listStakeholderNeedsInProject: vi.fn(),
  updateStakeholderNeed: vi.fn(),
  listRequirementsForNeed: vi.fn(),
}));

vi.mock("@/server/repositories/design-item.repository", () => ({
  createDesignItem: vi.fn(),
  findDesignItemInProject: vi.fn(),
  listDesignItemsInProject: vi.fn(),
  updateDesignItem: vi.fn(),
  findDesignItemOwner: vi.fn(),
  listRequirementsForDesignItem: vi.fn(),
  listDecisionsForDesignItem: vi.fn(),
}));

vi.mock("@/server/repositories/verification-activity.repository", () => ({
  createVerificationActivity: vi.fn(),
  findVerificationActivityInProject: vi.fn(),
  listVerificationActivitiesInProject: vi.fn(),
  updateVerificationActivity: vi.fn(),
  findVerificationActivityOwner: vi.fn(),
  listRequirementsForVerification: vi.fn(),
  listEvidenceForVerification: vi.fn(),
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

const authContext = await import("@/server/auth/context");
const projectRepository = await import("@/server/repositories/project.repository");
const needRepository = await import("@/server/repositories/stakeholder-need.repository");
const designRepository = await import("@/server/repositories/design-item.repository");
const verificationRepository = await import(
  "@/server/repositories/verification-activity.repository"
);
const userRepository = await import("@/server/repositories/user.repository");
const membershipRepository = await import("@/server/repositories/project-membership.repository");

const needsCollection = await import("@/app/api/projects/[projectId]/stakeholder-needs/route");
const needsItem = await import("@/app/api/projects/[projectId]/stakeholder-needs/[needId]/route");
const designCollection = await import("@/app/api/projects/[projectId]/design-items/route");
const designItem = await import("@/app/api/projects/[projectId]/design-items/[designItemId]/route");
const designOwner = await import(
  "@/app/api/projects/[projectId]/design-items/[designItemId]/owner/route"
);
const verificationCollection = await import(
  "@/app/api/projects/[projectId]/verification-activities/route"
);
const verificationItem = await import(
  "@/app/api/projects/[projectId]/verification-activities/[activityId]/route"
);
const verificationTransition = await import(
  "@/app/api/projects/[projectId]/verification-activities/[activityId]/transition/route"
);
const verificationOwner = await import(
  "@/app/api/projects/[projectId]/verification-activities/[activityId]/owner/route"
);
const membersRoute = await import("@/app/api/organization/members/route");

const PROJECT: Project = {
  id: "proj1aaaaaaaaaaaaaaaaaaa",
  organizationId: CONTEXT.organizationId,
  name: "Upper Stage Propulsion",
  description: null,
  status: "ACTIVE",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const NEED: StakeholderNeed = {
  id: "need1aaaaaaaaaaaaaaaaaa",
  projectId: PROJECT.id,
  identifier: "SN-001",
  title: "Payload mass capability",
  description: "The launch customer needs 4 t to LEO.",
  stakeholder: "Launch customer",
  status: "DRAFT",
  createdAt: new Date("2026-01-02T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

const DESIGN_ITEM: DesignItem = {
  id: "design1aaaaaaaaaaaaaaa",
  projectId: PROJECT.id,
  identifier: "DI-001",
  name: "Combustion chamber",
  description: null,
  itemType: "COMPONENT",
  status: "DRAFT",
  ownerId: null,
  createdAt: new Date("2026-01-02T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
};

function activity(overrides: Partial<VerificationActivity> = {}): VerificationActivity {
  return {
    id: "ver1aaaaaaaaaaaaaaaaaaa",
    projectId: PROJECT.id,
    identifier: "VER-001",
    title: "Hot fire test",
    description: null,
    method: "TEST",
    status: "PLANNED",
    ownerId: null,
    plannedDate: null,
    completedDate: null,
    createdAt: new Date("2026-01-02T00:00:00.000Z"),
    updatedAt: new Date("2026-01-02T00:00:00.000Z"),
    ...overrides,
  };
}

const BASE = `http://localhost/api/projects/${PROJECT.id}`;

function post(body: unknown, url = BASE): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function patch(body: unknown, url = BASE): Request {
  return new Request(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function get(url = BASE): Request {
  return new Request(url, { method: "GET" });
}

const projectCtx = () => ({ params: Promise.resolve({ projectId: PROJECT.id }) });
const needCtx = () => ({ params: Promise.resolve({ projectId: PROJECT.id, needId: NEED.id }) });
const designCtx = () => ({
  params: Promise.resolve({ projectId: PROJECT.id, designItemId: DESIGN_ITEM.id }),
});
const activityCtx = () => ({
  params: Promise.resolve({ projectId: PROJECT.id, activityId: "ver1aaaaaaaaaaaaaaaaaaa" }),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authContext.requireAuthenticatedContext).mockResolvedValue(CONTEXT);
  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
  vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(true);
  vi.mocked(needRepository.listRequirementsForNeed).mockResolvedValue([]);
  vi.mocked(designRepository.listRequirementsForDesignItem).mockResolvedValue([]);
  vi.mocked(designRepository.listDecisionsForDesignItem).mockResolvedValue([]);
  vi.mocked(verificationRepository.listRequirementsForVerification).mockResolvedValue([]);
  vi.mocked(verificationRepository.listEvidenceForVerification).mockResolvedValue([]);
  // CONTEXT's user is an organization OWNER (see CONTEXT above) — full
  // implicit project access with no explicit ProjectMembership row needed.
  vi.mocked(membershipRepository.findMembership).mockResolvedValue(null);
  vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("OWNER");
});

describe("authentication", () => {
  function unauthenticated() {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());
  }

  it("rejects unauthenticated reads across all three modules with 401", async () => {
    unauthenticated();

    const responses = await Promise.all([
      needsCollection.GET(get(), projectCtx()),
      designCollection.GET(get(), projectCtx()),
      verificationCollection.GET(get(), projectCtx()),
      membersRoute.GET(),
    ]);

    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401]);
    expect(needRepository.listStakeholderNeedsInProject).not.toHaveBeenCalled();
    expect(userRepository.listOrganizationMembers).not.toHaveBeenCalled();
  });

  it("rejects unauthenticated writes with 401", async () => {
    unauthenticated();

    const responses = await Promise.all([
      needsCollection.POST(post({ identifier: "SN-001" }), projectCtx()),
      designCollection.POST(post({ identifier: "DI-001" }), projectCtx()),
      verificationTransition.POST(post({ to: "IN_PROGRESS" }), activityCtx()),
      designOwner.POST(post({ ownerId: null }), designCtx()),
    ]);

    expect(responses.map((r) => r.status)).toEqual([401, 401, 401, 401]);
  });
});

describe("stakeholder needs API", () => {
  it("lists needs in the project", async () => {
    vi.mocked(needRepository.listStakeholderNeedsInProject).mockResolvedValue([NEED]);

    const response = await needsCollection.GET(get(), projectCtx());

    expect(response.status).toBe(200);
    expect((await response.json()).stakeholderNeeds[0].identifier).toBe("SN-001");
  });

  it("creates a need and returns 201", async () => {
    vi.mocked(needRepository.createStakeholderNeed).mockResolvedValue(NEED);

    const response = await needsCollection.POST(
      post({
        identifier: "SN-001",
        title: "Payload mass capability",
        description: "The launch customer needs 4 t to LEO.",
        stakeholder: "Launch customer",
      }),
      projectCtx(),
    );

    expect(response.status).toBe(201);
    expect(needRepository.createStakeholderNeed).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT.id }),
      TX,
    );
  });

  it("returns 400 for invalid input", async () => {
    const response = await needsCollection.POST(
      post({ identifier: "bad id", title: "", description: "", stakeholder: "" }),
      projectCtx(),
    );

    expect(response.status).toBe(400);
  });

  it("returns 409 for a duplicate identifier", async () => {
    vi.mocked(needRepository.createStakeholderNeed).mockRejectedValue(
      new ConflictError("Stakeholder need SN-001 already exists in this project."),
    );

    const response = await needsCollection.POST(
      post({
        identifier: "SN-001",
        title: "Dup",
        description: "Dup",
        stakeholder: "Customer",
      }),
      projectCtx(),
    );

    expect(response.status).toBe(409);
  });

  it("returns 404 for a project outside the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    const response = await needsCollection.GET(get(), projectCtx());

    expect(response.status).toBe(404);
    expect(needRepository.listStakeholderNeedsInProject).not.toHaveBeenCalled();
  });

  it("returns 404 for a need in another project", async () => {
    vi.mocked(needRepository.findStakeholderNeedInProject).mockResolvedValue(null);

    const response = await needsItem.GET(get(), needCtx());

    expect(response.status).toBe(404);
  });

  it("updates a need", async () => {
    vi.mocked(needRepository.findStakeholderNeedInProject).mockResolvedValue(NEED);
    vi.mocked(needRepository.updateStakeholderNeed).mockResolvedValue({
      ...NEED,
      status: "ACCEPTED",
    });

    const response = await needsItem.PATCH(patch({ status: "ACCEPTED" }), needCtx());

    expect(response.status).toBe(200);
    expect((await response.json()).stakeholderNeed.status).toBe("ACCEPTED");
  });
});

describe("design items API", () => {
  it("creates a design item and returns 201", async () => {
    vi.mocked(designRepository.createDesignItem).mockResolvedValue(DESIGN_ITEM);

    const response = await designCollection.POST(
      post({ identifier: "DI-001", name: "Combustion chamber", itemType: "COMPONENT" }),
      projectCtx(),
    );

    expect(response.status).toBe(201);
    expect((await response.json()).designItem.identifier).toBe("DI-001");
  });

  it("returns 400 for invalid input", async () => {
    const response = await designCollection.POST(
      post({ identifier: "DI-001", name: "", itemType: "SPACESHIP" }),
      projectCtx(),
    );

    expect(response.status).toBe(400);
  });

  it("assigns an owner in the same organization", async () => {
    vi.mocked(designRepository.findDesignItemInProject).mockResolvedValue(DESIGN_ITEM);
    vi.mocked(designRepository.updateDesignItem).mockResolvedValue({
      ...DESIGN_ITEM,
      ownerId: "user2aaaaaaaaaaaaaaaaaaa",
    });

    const response = await designOwner.POST(
      post({ ownerId: "user2aaaaaaaaaaaaaaaaaaa" }),
      designCtx(),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).designItem.ownerId).toBe("user2aaaaaaaaaaaaaaaaaaa");
  });

  it("returns 400 for an owner outside the organization", async () => {
    vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(false);

    const response = await designOwner.POST(
      post({ ownerId: "userfromanotherorg1234" }),
      designCtx(),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.message).toMatch(/not a member/i);
  });

  it("returns 404 for a design item in another project", async () => {
    vi.mocked(designRepository.findDesignItemInProject).mockResolvedValue(null);

    const response = await designItem.PATCH(patch({ name: "Renamed" }), designCtx());

    expect(response.status).toBe(404);
  });
});

describe("verification activities API", () => {
  it("creates an activity that starts PLANNED", async () => {
    vi.mocked(verificationRepository.createVerificationActivity).mockResolvedValue(activity());

    const response = await verificationCollection.POST(
      post({ identifier: "VER-001", title: "Hot fire test", method: "TEST" }),
      projectCtx(),
    );

    expect(response.status).toBe(201);
    expect((await response.json()).verificationActivity.status).toBe("PLANNED");
  });

  it("performs a legal transition", async () => {
    vi.mocked(verificationRepository.findVerificationActivityInProject).mockResolvedValue(
      activity(),
    );
    vi.mocked(verificationRepository.updateVerificationActivity).mockResolvedValue(
      activity({ status: "IN_PROGRESS" }),
    );

    const response = await verificationTransition.POST(
      post({ to: "IN_PROGRESS" }),
      activityCtx(),
    );

    expect(response.status).toBe(200);
    expect((await response.json()).verificationActivity.status).toBe("IN_PROGRESS");
  });

  it("returns 409 for an illegal transition and names what is allowed", async () => {
    vi.mocked(verificationRepository.findVerificationActivityInProject).mockResolvedValue(
      activity({ status: "FAILED" }),
    );

    const response = await verificationTransition.POST(post({ to: "PASSED" }), activityCtx());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.message).toMatch(/final outcome/i);
    expect(verificationRepository.updateVerificationActivity).not.toHaveBeenCalled();
  });

  it("returns 400 when trying to change status through PATCH", async () => {
    const response = await verificationItem.PATCH(patch({ status: "PASSED" }), activityCtx());

    expect(response.status).toBe(400);
    expect(verificationRepository.updateVerificationActivity).not.toHaveBeenCalled();
  });

  it("returns 409 when editing a concluded activity", async () => {
    vi.mocked(verificationRepository.findVerificationActivityInProject).mockResolvedValue(
      activity({ status: "PASSED" }),
    );

    const response = await verificationItem.PATCH(patch({ title: "Revised" }), activityCtx());

    expect(response.status).toBe(409);
  });

  it("returns 400 for an owner outside the organization", async () => {
    vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(false);

    const response = await verificationOwner.POST(
      post({ ownerId: "userfromanotherorg1234" }),
      activityCtx(),
    );

    expect(response.status).toBe(400);
  });

  it("returns the detail with lifecycle info and no persistence noise", async () => {
    vi.mocked(verificationRepository.findVerificationActivityInProject).mockResolvedValue(
      activity(),
    );
    vi.mocked((await import("@/server/repositories/audit-log.repository")).listAuditEventsForEntity)
      .mockResolvedValue([]);

    const response = await verificationItem.GET(get(), activityCtx());
    const body = await response.json();

    expect(body.verificationActivity.availableTransitions).toEqual(["IN_PROGRESS", "WAIVED"]);
    expect(body.verificationActivity.editable).toBe(true);
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|tokenHash|organizationId/i);
  });
});

describe("organization members lookup", () => {
  it("returns only safe identity fields for the session's organization", async () => {
    vi.mocked(userRepository.listOrganizationMembers).mockResolvedValue([
      { id: "user1aaaaaaaaaaaaaaaaaaa", name: "Ada", email: "ada@example.test" },
    ]);

    const response = await membersRoute.GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    // The organization is taken from the session, never from the request.
    expect(userRepository.listOrganizationMembers).toHaveBeenCalledWith(CONTEXT.organizationId);
    expect(Object.keys(body.members[0])).toEqual(["id", "name", "email"]);
  });
});
