// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ChangeRequest, Project } from "@/domain";
import { ConflictError, NotFoundError, ValidationError } from "@/server/errors";

/**
 * The change request service, with only the repositories and the transaction
 * faked. Tenancy, requester identity, lifecycle, editability, target validation
 * and audit are all genuinely exercised.
 */

const TX = { __transaction: true } as const;

const CONTEXT = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
};

const OTHER_CONTEXT = {
  organizationId: "org2aaaaaaaaaaaaaaaaaaaa",
  actorId: "user2aaaaaaaaaaaaaaaaaaa",
};

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)) },
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

const projectRepository = await import("@/server/repositories/project.repository");
const changeRepository = await import("@/server/repositories/change-request.repository");
const auditLogRepository = await import("@/server/repositories/audit-log.repository");

const service = await import("./change-request.service");

const PROJECT: Project = {
  id: "proj1aaaaaaaaaaaaaaaaaaa",
  organizationId: CONTEXT.organizationId,
  name: "Upper Stage Propulsion",
  description: null,
  status: "ACTIVE",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function change(overrides: Partial<ChangeRequest> = {}): ChangeRequest {
  return {
    id: "chg1aaaaaaaaaaaaaaaaaaa",
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

const REQUIREMENT_TARGET = { type: "REQUIREMENT" as const, id: "req1aaaaaaaaaaaaaaaaaaa" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
  vi.mocked(changeRepository.listDeclaredImpacts).mockResolvedValue([]);
  vi.mocked(auditLogRepository.listAuditEventsForEntity).mockResolvedValue([]);
  vi.mocked(changeRepository.findChangeRequester).mockResolvedValue({
    id: CONTEXT.actorId,
    name: "Ada",
  });
});

describe("creating a change request", () => {
  it("writes it in DRAFT with the session's user as requester", async () => {
    vi.mocked(changeRepository.createChangeRequest).mockResolvedValue(change());

    await service.createChangeRequest(CONTEXT, PROJECT.id, {
      identifier: "CR-001",
      title: "Raise the chamber pressure limit",
      description: "Raise the limit from 120 to 130 bar.",
      reason: "Performance shortfall found in hot fire.",
    });

    expect(changeRepository.createChangeRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PROJECT.id,
        status: "DRAFT",
        requestedById: CONTEXT.actorId,
      }),
      TX,
    );
  });

  it("ignores nothing — a client-supplied requester is rejected outright", async () => {
    await expect(
      service.createChangeRequest(CONTEXT, PROJECT.id, {
        identifier: "CR-001",
        title: "Raise the limit",
        description: "Raise it.",
        reason: "Because.",
        requestedById: "user9aaaaaaaaaaaaaaaaaa",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(changeRepository.createChangeRequest).not.toHaveBeenCalled();
  });

  it("refuses a client-supplied status", async () => {
    await expect(
      service.createChangeRequest(CONTEXT, PROJECT.id, {
        identifier: "CR-001",
        title: "Raise the limit",
        description: "Raise it.",
        reason: "Because.",
        status: "APPROVED",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an incomplete change", async () => {
    await expect(
      service.createChangeRequest(CONTEXT, PROJECT.id, { identifier: "CR-001", title: "x" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("surfaces a duplicate identifier as a conflict", async () => {
    vi.mocked(changeRepository.createChangeRequest).mockRejectedValue(
      new ConflictError("Change request CR-001 already exists in this project."),
    );

    await expect(
      service.createChangeRequest(CONTEXT, PROJECT.id, {
        identifier: "CR-001",
        title: "Raise the limit",
        description: "Raise it.",
        reason: "Because.",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("404s when the project is not in the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    await expect(
      service.createChangeRequest(OTHER_CONTEXT, PROJECT.id, {
        identifier: "CR-001",
        title: "Raise the limit",
        description: "Raise it.",
        reason: "Because.",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("audits the creation inside the same transaction", async () => {
    vi.mocked(changeRepository.createChangeRequest).mockResolvedValue(change());

    await service.createChangeRequest(CONTEXT, PROJECT.id, {
      identifier: "CR-001",
      title: "Raise the limit",
      description: "Raise it.",
      reason: "Because.",
    });

    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "change.created",
        entityType: "ChangeRequest",
        actorId: CONTEXT.actorId,
        organizationId: CONTEXT.organizationId,
      }),
      TX,
    );
  });
});

describe("listing and reading", () => {
  it("lists the project's changes", async () => {
    vi.mocked(changeRepository.listChangeRequestsInProject).mockResolvedValue([
      { ...change(), requestedBy: { id: CONTEXT.actorId, name: "Ada" } },
    ]);

    const listed = await service.listChangeRequests(CONTEXT, PROJECT.id);

    expect(listed).toHaveLength(1);
    expect(changeRepository.listChangeRequestsInProject).toHaveBeenCalledWith({
      projectId: PROJECT.id,
    });
  });

  it("passes a status filter through", async () => {
    vi.mocked(changeRepository.listChangeRequestsInProject).mockResolvedValue([]);

    await service.listChangeRequests(CONTEXT, PROJECT.id, { status: "UNDER_REVIEW" });

    expect(changeRepository.listChangeRequestsInProject).toHaveBeenCalledWith({
      projectId: PROJECT.id,
      status: "UNDER_REVIEW",
    });
  });

  it("rejects a status filter that is not a status", async () => {
    await expect(
      service.listChangeRequests(CONTEXT, PROJECT.id, { status: "MERGED" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("returns the change with its legal transitions and editability", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(
      change({ status: "UNDER_REVIEW" }),
    );

    const detail = await service.getChangeRequest(CONTEXT, PROJECT.id, "chg1aaaaaaaaaaaaaaaaaaa");

    expect(detail.availableTransitions).toEqual(["APPROVED", "REJECTED", "CANCELLED"]);
    expect(detail.editable).toEqual({ definition: false, declaredImpacts: true });
    expect(detail.requestedBy).toEqual({ id: CONTEXT.actorId, name: "Ada" });
  });

  it("404s for a change in another project", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(null);

    await expect(
      service.getChangeRequest(CONTEXT, PROJECT.id, "chg9aaaaaaaaaaaaaaaaaaa"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("updating", () => {
  it("edits a draft and audits which fields moved", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(change());
    vi.mocked(changeRepository.updateChangeRequest).mockResolvedValue(
      change({ title: "Revised" }),
    );

    await service.updateChangeRequest(CONTEXT, PROJECT.id, "chg1aaaaaaaaaaaaaaaaaaa", {
      title: "Revised",
    });

    expect(changeRepository.updateChangeRequest).toHaveBeenCalledWith(
      "chg1aaaaaaaaaaaaaaaaaaa",
      { title: "Revised" },
      TX,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "change.updated",
        metadata: { changedFields: ["title"] },
      }),
      TX,
    );
  });

  it("refuses to edit a change that is already under review", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(
      change({ status: "UNDER_REVIEW" }),
    );

    await expect(
      service.updateChangeRequest(CONTEXT, PROJECT.id, "chg1aaaaaaaaaaaaaaaaaaa", {
        description: "Something else entirely",
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(changeRepository.updateChangeRequest).not.toHaveBeenCalled();
  });

  it("cannot be used to change status", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(change());

    await expect(
      service.updateChangeRequest(CONTEXT, PROJECT.id, "chg1aaaaaaaaaaaaaaaaaaa", {
        status: "APPROVED",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(changeRepository.updateChangeRequest).not.toHaveBeenCalled();
  });

  it("cannot be used to reassign the requester", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(change());

    await expect(
      service.updateChangeRequest(CONTEXT, PROJECT.id, "chg1aaaaaaaaaaaaaaaaaaa", {
        requestedById: "user9aaaaaaaaaaaaaaaaaa",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("transitioning", () => {
  it("moves a draft to submitted and audits both ends", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(change());
    vi.mocked(changeRepository.updateChangeRequest).mockResolvedValue(
      change({ status: "SUBMITTED" }),
    );

    const updated = await service.transitionChangeRequest(
      CONTEXT,
      PROJECT.id,
      "chg1aaaaaaaaaaaaaaaaaaa",
      { to: "SUBMITTED", rationale: "Ready for the board." },
    );

    expect(updated.status).toBe("SUBMITTED");
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "change.status_transitioned",
        metadata: { from: "DRAFT", to: "SUBMITTED", rationale: "Ready for the board." },
      }),
      TX,
    );
  });

  it("refuses to approve a change that has not been reviewed", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(change());

    await expect(
      service.transitionChangeRequest(CONTEXT, PROJECT.id, "chg1aaaaaaaaaaaaaaaaaaa", {
        to: "APPROVED",
      }),
    ).rejects.toBeInstanceOf(ConflictError);

    expect(changeRepository.updateChangeRequest).not.toHaveBeenCalled();
  });

  it("refuses to move a concluded change at all", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(
      change({ status: "IMPLEMENTED" }),
    );

    await expect(
      service.transitionChangeRequest(CONTEXT, PROJECT.id, "chg1aaaaaaaaaaaaaaaaaaa", {
        to: "APPROVED",
      }),
    ).rejects.toThrow(/final/i);
  });

  it("refuses a transition to the status it is already in", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(change());

    await expect(
      service.transitionChangeRequest(CONTEXT, PROJECT.id, "chg1aaaaaaaaaaaaaaaaaaa", {
        to: "DRAFT",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("declared impacts", () => {
  it("records an impact on an artifact in the same project", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(change());
    vi.mocked(changeRepository.changeImpactTargetExistsInProject).mockResolvedValue(true);
    vi.mocked(changeRepository.createDeclaredImpact).mockResolvedValue("imp1aaaaaaaaaaaaaaaaaa");

    await service.addDeclaredImpact(CONTEXT, PROJECT.id, "chg1aaaaaaaaaaaaaaaaaaa", {
      target: REQUIREMENT_TARGET,
      note: "The limit is stated here.",
    });

    expect(changeRepository.changeImpactTargetExistsInProject).toHaveBeenCalledWith(
      "REQUIREMENT",
      REQUIREMENT_TARGET.id,
      PROJECT.id,
      TX,
    );
    expect(changeRepository.createDeclaredImpact).toHaveBeenCalledWith(
      {
        changeRequestId: "chg1aaaaaaaaaaaaaaaaaaa",
        type: "REQUIREMENT",
        targetId: REQUIREMENT_TARGET.id,
        note: "The limit is stated here.",
        createdById: CONTEXT.actorId,
      },
      TX,
    );
  });

  it("rejects a target that does not exist in the project", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(change());
    vi.mocked(changeRepository.changeImpactTargetExistsInProject).mockResolvedValue(false);

    await expect(
      service.addDeclaredImpact(CONTEXT, PROJECT.id, "chg1aaaaaaaaaaaaaaaaaaa", {
        target: REQUIREMENT_TARGET,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(changeRepository.createDeclaredImpact).not.toHaveBeenCalled();
  });

  it("checks the target against the change's own project, so a cross-project id fails", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(change());
    // A requirement that exists, but in another project: the scoped lookup
    // finds nothing.
    vi.mocked(changeRepository.changeImpactTargetExistsInProject).mockImplementation(
      async (_type, _id, projectId) => projectId === "proj2aaaaaaaaaaaaaaaaaaa",
    );

    await expect(
      service.addDeclaredImpact(CONTEXT, PROJECT.id, "chg1aaaaaaaaaaaaaaaaaaa", {
        target: REQUIREMENT_TARGET,
      }),
    ).rejects.toThrow(/not found in this project/i);
  });

  it("never reaches the target check for a project outside the organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    await expect(
      service.addDeclaredImpact(OTHER_CONTEXT, PROJECT.id, "chg1aaaaaaaaaaaaaaaaaaa", {
        target: REQUIREMENT_TARGET,
      }),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(changeRepository.changeImpactTargetExistsInProject).not.toHaveBeenCalled();
  });

  it("rejects a target type the impact table cannot store", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(change());

    await expect(
      service.addDeclaredImpact(CONTEXT, PROJECT.id, "chg1aaaaaaaaaaaaaaaaaaa", {
        target: { type: "STAKEHOLDER_NEED", id: REQUIREMENT_TARGET.id },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses to change the declared scope of an approved change", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(
      change({ status: "APPROVED" }),
    );

    await expect(
      service.addDeclaredImpact(CONTEXT, PROJECT.id, "chg1aaaaaaaaaaaaaaaaaaa", {
        target: REQUIREMENT_TARGET,
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("still allows a declaration while the change is under review", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(
      change({ status: "UNDER_REVIEW" }),
    );
    vi.mocked(changeRepository.changeImpactTargetExistsInProject).mockResolvedValue(true);
    vi.mocked(changeRepository.createDeclaredImpact).mockResolvedValue("imp1aaaaaaaaaaaaaaaaaa");

    await service.addDeclaredImpact(CONTEXT, PROJECT.id, "chg1aaaaaaaaaaaaaaaaaaa", {
      target: REQUIREMENT_TARGET,
    });

    expect(changeRepository.createDeclaredImpact).toHaveBeenCalled();
  });

  it("audits the declaration", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(change());
    vi.mocked(changeRepository.changeImpactTargetExistsInProject).mockResolvedValue(true);
    vi.mocked(changeRepository.createDeclaredImpact).mockResolvedValue("imp1aaaaaaaaaaaaaaaaaa");

    await service.addDeclaredImpact(CONTEXT, PROJECT.id, "chg1aaaaaaaaaaaaaaaaaaa", {
      target: REQUIREMENT_TARGET,
    });

    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "change.declared_impact_added",
        metadata: {
          impactId: "imp1aaaaaaaaaaaaaaaaaa",
          targetType: "REQUIREMENT",
          targetId: REQUIREMENT_TARGET.id,
        },
      }),
      TX,
    );
  });

  it("withdraws an impact through its own change request", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(change());
    vi.mocked(changeRepository.findDeclaredImpactForChange).mockResolvedValue({
      id: "imp1aaaaaaaaaaaaaaaaaa",
    });

    await service.removeDeclaredImpact(
      CONTEXT,
      PROJECT.id,
      "chg1aaaaaaaaaaaaaaaaaaa",
      "imp1aaaaaaaaaaaaaaaaaa",
    );

    // Scoped to the parent: an id from a different change cannot be deleted.
    expect(changeRepository.findDeclaredImpactForChange).toHaveBeenCalledWith(
      "chg1aaaaaaaaaaaaaaaaaaa",
      "imp1aaaaaaaaaaaaaaaaaa",
      TX,
    );
    expect(changeRepository.deleteDeclaredImpact).toHaveBeenCalledWith(
      "imp1aaaaaaaaaaaaaaaaaa",
      TX,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "change.declared_impact_removed" }),
      TX,
    );
  });

  it("404s for an impact belonging to a different change", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(change());
    vi.mocked(changeRepository.findDeclaredImpactForChange).mockResolvedValue(null);

    await expect(
      service.removeDeclaredImpact(
        CONTEXT,
        PROJECT.id,
        "chg1aaaaaaaaaaaaaaaaaaa",
        "imp9aaaaaaaaaaaaaaaaaa",
      ),
    ).rejects.toBeInstanceOf(NotFoundError);

    expect(changeRepository.deleteDeclaredImpact).not.toHaveBeenCalled();
  });

  it("lists what the change declares", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(change());
    vi.mocked(changeRepository.listDeclaredImpacts).mockResolvedValue([
      {
        id: "imp1aaaaaaaaaaaaaaaaaa",
        changeRequestId: "chg1aaaaaaaaaaaaaaaaaaa",
        target: REQUIREMENT_TARGET,
        targetIdentifier: "REQ-001",
        targetTitle: "Maximum chamber pressure",
        note: null,
        createdAt: new Date("2026-02-02T00:00:00.000Z"),
        createdBy: { id: CONTEXT.actorId, name: "Ada" },
      },
    ]);

    const impacts = await service.listDeclaredImpacts(
      CONTEXT,
      PROJECT.id,
      "chg1aaaaaaaaaaaaaaaaaaa",
    );

    expect(impacts).toHaveLength(1);
    expect(impacts[0]?.targetIdentifier).toBe("REQ-001");
  });
});
