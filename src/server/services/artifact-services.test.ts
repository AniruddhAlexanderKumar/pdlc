// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DesignItem, Project, StakeholderNeed, VerificationActivity } from "@/domain";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

/**
 * Service behavior for the three foundational artifact modules, against fake
 * repositories: no database, no Prisma. The transaction sentinel proves each
 * mutation and its audit event are handed the same client.
 */
const TX = { __transaction: true } as const;

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)) },
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
  getOrganizationRole: vi.fn(),
}));

vi.mock("@/server/repositories/project-membership.repository", () => ({ findMembership: vi.fn() }));

vi.mock("@/server/repositories/audit-log.repository", () => ({
  recordAuditEvent: vi.fn(),
  listAuditEventsForEntity: vi.fn(),
}));

const projectRepository = await import("@/server/repositories/project.repository");
const needRepository = await import("@/server/repositories/stakeholder-need.repository");
const designRepository = await import("@/server/repositories/design-item.repository");
const verificationRepository = await import(
  "@/server/repositories/verification-activity.repository"
);
const userRepository = await import("@/server/repositories/user.repository");
const membershipRepository = await import("@/server/repositories/project-membership.repository");
const auditLogRepository = await import("@/server/repositories/audit-log.repository");

const needService = await import("./stakeholder-need.service");
const designService = await import("./design-item.service");
const verificationService = await import("./verification-activity.service");

const CONTEXT: OrganizationContext = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
};

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

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
  vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(true);
  vi.mocked(auditLogRepository.listAuditEventsForEntity).mockResolvedValue([]);
  vi.mocked(needRepository.listRequirementsForNeed).mockResolvedValue([]);
  vi.mocked(designRepository.listRequirementsForDesignItem).mockResolvedValue([]);
  vi.mocked(designRepository.listDecisionsForDesignItem).mockResolvedValue([]);
  vi.mocked(verificationRepository.listRequirementsForVerification).mockResolvedValue([]);
  vi.mocked(verificationRepository.listEvidenceForVerification).mockResolvedValue([]);
  // CONTEXT's actor is a MANAGER on PROJECT by default — full read/write/
  // approve/manage access, so existing tests exercising ordinary behavior
  // do not also need to set up a role scenario.
  vi.mocked(membershipRepository.findMembership).mockResolvedValue({
    id: "mem1",
    projectId: PROJECT.id,
    role: "MANAGER",
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: CONTEXT.actorId!, name: "Ada", email: "ada@example.test", organizationRole: "MEMBER" },
  });
  vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");
});

// --- Stakeholder needs ------------------------------------------------------

describe("StakeholderNeedService", () => {
  const VALID = {
    identifier: "SN-001",
    title: "Payload mass capability",
    description: "The launch customer needs 4 t to LEO.",
    stakeholder: "Launch customer",
  };

  it("creates a need scoped to the project and audits it", async () => {
    vi.mocked(needRepository.createStakeholderNeed).mockResolvedValue(NEED);

    const need = await needService.createStakeholderNeed(CONTEXT, PROJECT.id, VALID);

    expect(need.identifier).toBe("SN-001");
    expect(needRepository.createStakeholderNeed).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT.id }),
      TX,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "stakeholder_need.created",
        entityType: "StakeholderNeed",
        organizationId: CONTEXT.organizationId,
        actorId: CONTEXT.actorId,
      }),
      TX,
    );
  });

  it.each([
    ["a blank title", { ...VALID, title: " " }],
    ["a blank description", { ...VALID, description: "" }],
    ["a blank stakeholder", { ...VALID, stakeholder: "" }],
    ["a malformed identifier", { ...VALID, identifier: "sn 1" }],
    ["a caller-supplied projectId", { ...VALID, projectId: "proj2" }],
    ["a caller-supplied organizationId", { ...VALID, organizationId: "org2" }],
  ])("rejects %s", async (_label, input) => {
    await expect(
      needService.createStakeholderNeed(CONTEXT, PROJECT.id, input),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(needRepository.createStakeholderNeed).not.toHaveBeenCalled();
  });

  it("surfaces a duplicate identifier as a conflict", async () => {
    vi.mocked(needRepository.createStakeholderNeed).mockRejectedValue(
      new ConflictError("Stakeholder need SN-001 already exists in this project."),
    );

    await expect(
      needService.createStakeholderNeed(CONTEXT, PROJECT.id, VALID),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses a project outside the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    await expect(
      needService.createStakeholderNeed(CONTEXT, PROJECT.id, VALID),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("does not return a need from another project", async () => {
    vi.mocked(needRepository.findStakeholderNeedInProject).mockResolvedValue(null);

    await expect(
      needService.getStakeholderNeed(CONTEXT, PROJECT.id, NEED.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("updates a need and audits the changed fields", async () => {
    vi.mocked(needRepository.findStakeholderNeedInProject).mockResolvedValue(NEED);
    vi.mocked(needRepository.updateStakeholderNeed).mockResolvedValue({
      ...NEED,
      status: "ACCEPTED",
    });

    const updated = await needService.updateStakeholderNeed(CONTEXT, PROJECT.id, NEED.id, {
      status: "ACCEPTED",
    });

    expect(updated.status).toBe("ACCEPTED");
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "stakeholder_need.updated",
        metadata: { changedFields: ["status"] },
      }),
      TX,
    );
  });

  it("returns derived requirements and history on detail", async () => {
    vi.mocked(needRepository.findStakeholderNeedInProject).mockResolvedValue(NEED);
    vi.mocked(needRepository.listRequirementsForNeed).mockResolvedValue([
      { id: "req1", identifier: "REQ-001", title: "Chamber pressure", status: "DRAFT" },
    ]);

    const detail = await needService.getStakeholderNeed(CONTEXT, PROJECT.id, NEED.id);

    expect(detail.requirements).toHaveLength(1);
    expect(auditLogRepository.listAuditEventsForEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: CONTEXT.organizationId,
        entityType: "StakeholderNeed",
      }),
    );
  });
});

// --- Design items -----------------------------------------------------------

describe("DesignItemService", () => {
  const VALID = { identifier: "DI-001", name: "Combustion chamber", itemType: "COMPONENT" };

  it("creates a design item and audits it", async () => {
    vi.mocked(designRepository.createDesignItem).mockResolvedValue(DESIGN_ITEM);

    const item = await designService.createDesignItem(CONTEXT, PROJECT.id, VALID);

    expect(item.identifier).toBe("DI-001");
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "design_item.created", entityType: "DesignItem" }),
      TX,
    );
  });

  it.each([
    ["a blank name", { ...VALID, name: "" }],
    ["a missing item type", { identifier: "DI-001", name: "Chamber" }],
    ["an unknown item type", { ...VALID, itemType: "SPACESHIP" }],
    ["a malformed identifier", { ...VALID, identifier: "di 1" }],
    ["a caller-supplied organizationId", { ...VALID, organizationId: "org2" }],
  ])("rejects %s", async (_label, input) => {
    await expect(
      designService.createDesignItem(CONTEXT, PROJECT.id, input),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("surfaces a duplicate identifier as a conflict", async () => {
    vi.mocked(designRepository.createDesignItem).mockRejectedValue(
      new ConflictError("Design item DI-001 already exists in this project."),
    );

    await expect(
      designService.createDesignItem(CONTEXT, PROJECT.id, VALID),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("rejects an owner from another organization at creation", async () => {
    vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(false);

    await expect(
      designService.createDesignItem(CONTEXT, PROJECT.id, {
        ...VALID,
        ownerId: "userfromanotherorg1234",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(designRepository.createDesignItem).not.toHaveBeenCalled();
  });

  it("assigns an owner from the same organization and audits it", async () => {
    vi.mocked(designRepository.findDesignItemInProject).mockResolvedValue(DESIGN_ITEM);
    vi.mocked(designRepository.updateDesignItem).mockResolvedValue({
      ...DESIGN_ITEM,
      ownerId: "user2aaaaaaaaaaaaaaaaaaa",
    });

    const item = await designService.assignDesignItemOwner(CONTEXT, PROJECT.id, DESIGN_ITEM.id, {
      ownerId: "user2aaaaaaaaaaaaaaaaaaa",
    });

    expect(item.ownerId).toBe("user2aaaaaaaaaaaaaaaaaaa");
    expect(userRepository.isMemberOfOrganization).toHaveBeenCalledWith(
      "user2aaaaaaaaaaaaaaaaaaa",
      CONTEXT.organizationId,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "design_item.owner_assigned" }),
      TX,
    );
  });

  it("rejects assigning an owner from another organization", async () => {
    vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(false);

    await expect(
      designService.assignDesignItemOwner(CONTEXT, PROJECT.id, DESIGN_ITEM.id, {
        ownerId: "userfromanotherorg1234",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(designRepository.updateDesignItem).not.toHaveBeenCalled();
  });

  it("clears an owner and audits it distinctly", async () => {
    vi.mocked(designRepository.findDesignItemInProject).mockResolvedValue({
      ...DESIGN_ITEM,
      ownerId: "user2aaaaaaaaaaaaaaaaaaa",
    });
    vi.mocked(designRepository.updateDesignItem).mockResolvedValue(DESIGN_ITEM);

    await designService.assignDesignItemOwner(CONTEXT, PROJECT.id, DESIGN_ITEM.id, {
      ownerId: null,
    });

    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "design_item.owner_cleared" }),
      TX,
    );
  });

  it("does not touch a design item in another project", async () => {
    vi.mocked(designRepository.findDesignItemInProject).mockResolvedValue(null);

    await expect(
      designService.updateDesignItem(CONTEXT, PROJECT.id, DESIGN_ITEM.id, { name: "Renamed" }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(designRepository.updateDesignItem).not.toHaveBeenCalled();
  });
});

// --- Verification activities -------------------------------------------------

describe("VerificationActivityService", () => {
  const VALID = { identifier: "VER-001", title: "Hot fire test", method: "TEST" };

  it("creates an activity that starts PLANNED", async () => {
    vi.mocked(verificationRepository.createVerificationActivity).mockResolvedValue(activity());

    const created = await verificationService.createVerificationActivity(
      CONTEXT,
      PROJECT.id,
      VALID,
    );

    expect(created.status).toBe("PLANNED");
    // Status is never taken from the caller.
    expect(verificationRepository.createVerificationActivity).toHaveBeenCalledWith(
      expect.not.objectContaining({ status: expect.anything() }),
      TX,
    );
  });

  it.each([
    ["a blank title", { ...VALID, title: "" }],
    ["a missing method", { identifier: "VER-001", title: "Hot fire" }],
    ["an unknown method", { ...VALID, method: "VIBES" }],
    ["a caller-supplied status", { ...VALID, status: "PASSED" }],
    ["a caller-supplied completedDate", { ...VALID, completedDate: "2026-01-01" }],
  ])("rejects %s", async (_label, input) => {
    await expect(
      verificationService.createVerificationActivity(CONTEXT, PROJECT.id, input),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("accepts a planned date as a calendar date", async () => {
    vi.mocked(verificationRepository.createVerificationActivity).mockResolvedValue(activity());

    await verificationService.createVerificationActivity(CONTEXT, PROJECT.id, {
      ...VALID,
      plannedDate: "2026-04-01",
    });

    const written = vi.mocked(verificationRepository.createVerificationActivity).mock.calls[0]?.[0];
    expect(written?.plannedDate?.toISOString()).toBe("2026-04-01T00:00:00.000Z");
  });

  it.each([
    ["PLANNED", "IN_PROGRESS"],
    ["PLANNED", "WAIVED"],
    ["IN_PROGRESS", "PASSED"],
    ["IN_PROGRESS", "FAILED"],
    ["IN_PROGRESS", "WAIVED"],
  ] as const)("allows %s → %s", async (from, to) => {
    vi.mocked(verificationRepository.findVerificationActivityInProject).mockResolvedValue(
      activity({ status: from }),
    );
    vi.mocked(verificationRepository.updateVerificationActivity).mockResolvedValue(
      activity({ status: to }),
    );

    const result = await verificationService.transitionVerificationStatus(
      CONTEXT,
      PROJECT.id,
      "ver1",
      { to },
    );

    expect(result.status).toBe(to);
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "verification_activity.status_transitioned",
        metadata: { from, to },
      }),
      TX,
    );
  });

  it.each([
    ["PLANNED", "PASSED"],
    ["PLANNED", "FAILED"],
    ["FAILED", "PASSED"],
    ["PASSED", "FAILED"],
    ["WAIVED", "IN_PROGRESS"],
    ["PASSED", "IN_PROGRESS"],
  ] as const)("rejects %s → %s as a conflict", async (from, to) => {
    vi.mocked(verificationRepository.findVerificationActivityInProject).mockResolvedValue(
      activity({ status: from }),
    );

    await expect(
      verificationService.transitionVerificationStatus(CONTEXT, PROJECT.id, "ver1", { to }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(verificationRepository.updateVerificationActivity).not.toHaveBeenCalled();
  });

  it("stamps completedDate when reaching a terminal outcome", async () => {
    vi.mocked(verificationRepository.findVerificationActivityInProject).mockResolvedValue(
      activity({ status: "IN_PROGRESS" }),
    );
    vi.mocked(verificationRepository.updateVerificationActivity).mockResolvedValue(
      activity({ status: "PASSED" }),
    );

    await verificationService.transitionVerificationStatus(CONTEXT, PROJECT.id, "ver1", {
      to: "PASSED",
    });

    const written = vi.mocked(verificationRepository.updateVerificationActivity).mock.calls[0]?.[1];
    expect(written?.completedDate).toBeInstanceOf(Date);
  });

  it("does not stamp completedDate for a non-terminal transition", async () => {
    vi.mocked(verificationRepository.findVerificationActivityInProject).mockResolvedValue(
      activity({ status: "PLANNED" }),
    );
    vi.mocked(verificationRepository.updateVerificationActivity).mockResolvedValue(
      activity({ status: "IN_PROGRESS" }),
    );

    await verificationService.transitionVerificationStatus(CONTEXT, PROJECT.id, "ver1", {
      to: "IN_PROGRESS",
    });

    const written = vi.mocked(verificationRepository.updateVerificationActivity).mock.calls[0]?.[1];
    expect(written?.completedDate).toBeUndefined();
  });

  it("refuses to edit a concluded activity", async () => {
    vi.mocked(verificationRepository.findVerificationActivityInProject).mockResolvedValue(
      activity({ status: "PASSED" }),
    );

    await expect(
      verificationService.updateVerificationActivity(CONTEXT, PROJECT.id, "ver1", {
        title: "Revised",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses a status change through PATCH", async () => {
    await expect(
      verificationService.updateVerificationActivity(CONTEXT, PROJECT.id, "ver1", {
        status: "PASSED",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an owner from another organization", async () => {
    vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(false);

    await expect(
      verificationService.assignVerificationOwner(CONTEXT, PROJECT.id, "ver1", {
        ownerId: "userfromanotherorg1234",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("reports only legal transitions and editability on detail", async () => {
    vi.mocked(verificationRepository.findVerificationActivityInProject).mockResolvedValue(
      activity({ status: "PASSED" }),
    );

    const detail = await verificationService.getVerificationActivity(CONTEXT, PROJECT.id, "ver1");

    expect(detail.availableTransitions).toEqual([]);
    expect(detail.editable).toBe(false);
  });
});

describe("project role authorization", () => {
  function asRole(role: "MANAGER" | "ENGINEER" | "REVIEWER" | "VIEWER") {
    vi.mocked(membershipRepository.findMembership).mockResolvedValue({
      id: "mem1",
      projectId: PROJECT.id,
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: { id: CONTEXT.actorId!, name: "Ada", email: "ada@example.test", organizationRole: "MEMBER" },
    } as never);
  }

  it("refuses a VIEWER creating a design item", async () => {
    asRole("VIEWER");
    await expect(
      designService.createDesignItem(CONTEXT, PROJECT.id, {
        identifier: "DI-001",
        name: "Combustion chamber",
        itemType: "COMPONENT",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(designRepository.createDesignItem).not.toHaveBeenCalled();
  });

  it("refuses a REVIEWER creating a design item", async () => {
    asRole("REVIEWER");
    await expect(
      designService.createDesignItem(CONTEXT, PROJECT.id, {
        identifier: "DI-001",
        name: "Combustion chamber",
        itemType: "COMPONENT",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows an ENGINEER to create a design item", async () => {
    asRole("ENGINEER");
    vi.mocked(designRepository.createDesignItem).mockResolvedValue(DESIGN_ITEM);

    await expect(
      designService.createDesignItem(CONTEXT, PROJECT.id, {
        identifier: "DI-001",
        name: "Combustion chamber",
        itemType: "COMPONENT",
      }),
    ).resolves.toMatchObject({ identifier: "DI-001" });
  });

  it("refuses a VIEWER creating a verification activity", async () => {
    asRole("VIEWER");
    await expect(
      verificationService.createVerificationActivity(CONTEXT, PROJECT.id, {
        identifier: "VER-001",
        title: "Hot fire test",
        method: "TEST",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(verificationRepository.createVerificationActivity).not.toHaveBeenCalled();
  });

  it("allows an ENGINEER to create and transition a verification activity — recording an outcome is ordinary engineering work", async () => {
    asRole("ENGINEER");
    vi.mocked(verificationRepository.createVerificationActivity).mockResolvedValue(activity());
    await expect(
      verificationService.createVerificationActivity(CONTEXT, PROJECT.id, {
        identifier: "VER-001",
        title: "Hot fire test",
        method: "TEST",
      }),
    ).resolves.toMatchObject({ identifier: "VER-001" });

    vi.mocked(verificationRepository.findVerificationActivityInProject).mockResolvedValue(
      activity({ status: "PLANNED" }),
    );
    vi.mocked(verificationRepository.updateVerificationActivity).mockResolvedValue(
      activity({ status: "IN_PROGRESS" }),
    );
    await expect(
      verificationService.transitionVerificationStatus(CONTEXT, PROJECT.id, "ver1", {
        to: "IN_PROGRESS",
      }),
    ).resolves.toMatchObject({ status: "IN_PROGRESS" });
  });

  it("refuses a VIEWER assigning a verification activity owner", async () => {
    asRole("VIEWER");
    vi.mocked(verificationRepository.findVerificationActivityInProject).mockResolvedValue(
      activity(),
    );

    await expect(
      verificationService.assignVerificationOwner(CONTEXT, PROJECT.id, "ver1", {
        ownerId: "user2aaaaaaaaaaaaaaaaaaa",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(verificationRepository.updateVerificationActivity).not.toHaveBeenCalled();
  });

  it("allows a MANAGER to do all of the above", async () => {
    asRole("MANAGER");
    vi.mocked(designRepository.createDesignItem).mockResolvedValue(DESIGN_ITEM);
    await expect(
      designService.createDesignItem(CONTEXT, PROJECT.id, {
        identifier: "DI-001",
        name: "Combustion chamber",
        itemType: "COMPONENT",
      }),
    ).resolves.toMatchObject({ identifier: "DI-001" });
  });

  it("refuses a VIEWER creating a stakeholder need", async () => {
    asRole("VIEWER");
    await expect(
      needService.createStakeholderNeed(CONTEXT, PROJECT.id, {
        identifier: "SN-001",
        title: "Payload mass capability",
        description: "The launch customer needs 4 t to LEO.",
        stakeholder: "Launch customer",
      }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(needRepository.createStakeholderNeed).not.toHaveBeenCalled();
  });

  it("allows an ENGINEER to create a stakeholder need", async () => {
    asRole("ENGINEER");
    vi.mocked(needRepository.createStakeholderNeed).mockResolvedValue(NEED);
    await expect(
      needService.createStakeholderNeed(CONTEXT, PROJECT.id, {
        identifier: "SN-001",
        title: "Payload mass capability",
        description: "The launch customer needs 4 t to LEO.",
        stakeholder: "Launch customer",
      }),
    ).resolves.toMatchObject({ identifier: "SN-001" });
  });

  it("a same-organization caller with no project membership cannot even read a stakeholder need", async () => {
    vi.mocked(membershipRepository.findMembership).mockResolvedValue(null);
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");

    await expect(
      needService.listStakeholderNeeds(CONTEXT, PROJECT.id, {}),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
