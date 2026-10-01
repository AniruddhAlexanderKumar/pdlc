// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Requirement } from "@/domain";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";

/**
 * Service behavior against fake repositories: no database, no Prisma. The
 * transaction sentinel lets us assert that a mutation and its audit event are
 * handed the same client, i.e. that they commit together.
 */
const TX = { __transaction: true } as const;

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)) },
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
  getOrganizationRole: vi.fn(),
}));

vi.mock("@/server/repositories/project-membership.repository", () => ({
  findMembership: vi.fn(),
}));

vi.mock("@/server/repositories/audit-log.repository", () => ({
  recordAuditEvent: vi.fn(),
  listAuditEventsForEntity: vi.fn(),
}));

vi.mock("@/server/repositories/project-artifacts.repository", () => ({
  listLinkTargets: vi.fn(),
}));

vi.mock("@/server/repositories/record-identifier.repository", () => ({
  listIdentifiersWithPrefix: vi.fn(),
}));

const projectRepository = await import("@/server/repositories/project.repository");
const recordIdentifierRepository = await import("@/server/repositories/record-identifier.repository");
const requirementRepository = await import("@/server/repositories/requirement.repository");
const userRepository = await import("@/server/repositories/user.repository");
const membershipRepository = await import("@/server/repositories/project-membership.repository");
const auditLogRepository = await import("@/server/repositories/audit-log.repository");
const service = await import("./requirement.service");

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

const VALID_CREATE = {
  identifier: "REQ-001",
  title: "Maximum chamber pressure",
  statement: "The engine shall not exceed 120 bar chamber pressure.",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
  vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(true);
  vi.mocked(requirementRepository.linkTargetExistsInProject).mockResolvedValue(true);
  vi.mocked(requirementRepository.listRequirementLinks).mockResolvedValue([]);
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

describe("createRequirement", () => {
  it("creates a DRAFT requirement scoped to the project", async () => {
    vi.mocked(requirementRepository.createRequirement).mockResolvedValue(requirement());

    const created = await service.createRequirement(CONTEXT, PROJECT.id, VALID_CREATE);

    expect(created.identifier).toBe("REQ-001");
    expect(requirementRepository.createRequirement).toHaveBeenCalledWith(
      expect.objectContaining({
        projectId: PROJECT.id,
        status: "DRAFT",
        priority: "MEDIUM", // defaulted
      }),
      TX,
    );
  });

  it("numbers the requirement automatically when no identifier is given", async () => {
    vi.mocked(recordIdentifierRepository.listIdentifiersWithPrefix).mockResolvedValue(["REQ-001", "REQ-002"]);
    vi.mocked(requirementRepository.createRequirement).mockResolvedValue(requirement({ identifier: "REQ-003" }));
    const { identifier: _omitted, ...withoutIdentifier } = VALID_CREATE;

    await service.createRequirement(CONTEXT, PROJECT.id, withoutIdentifier);

    expect(recordIdentifierRepository.listIdentifiersWithPrefix).toHaveBeenCalledWith("requirement", PROJECT.id, "REQ-");
    expect(requirementRepository.createRequirement).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: PROJECT.id, identifier: "REQ-003" }),
      TX,
    );
  });

  it("keeps an identifier the caller chose, without numbering anything", async () => {
    vi.mocked(requirementRepository.createRequirement).mockResolvedValue(requirement());

    await service.createRequirement(CONTEXT, PROJECT.id, VALID_CREATE);

    expect(recordIdentifierRepository.listIdentifiersWithPrefix).not.toHaveBeenCalled();
    expect(requirementRepository.createRequirement).toHaveBeenCalledWith(
      expect.objectContaining({ identifier: VALID_CREATE.identifier }),
      TX,
    );
  });

  it("audits creation in the same transaction, attributed to the session actor", async () => {
    vi.mocked(requirementRepository.createRequirement).mockResolvedValue(requirement());

    await service.createRequirement(CONTEXT, PROJECT.id, VALID_CREATE);

    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: CONTEXT.organizationId,
        actorId: CONTEXT.actorId,
        action: "requirement.created",
        entityType: "Requirement",
      }),
      TX,
    );
  });

  it.each([
    ["a blank title", { ...VALID_CREATE, title: "  " }],
    ["a blank statement", { ...VALID_CREATE, statement: "" }],
    ["a malformed identifier", { ...VALID_CREATE, identifier: "req 1" }],
    ["a caller-supplied status", { ...VALID_CREATE, status: "APPROVED" }],
    ["a caller-supplied organizationId", { ...VALID_CREATE, organizationId: "org2" }],
    ["a caller-supplied timestamp", { ...VALID_CREATE, createdAt: "2020-01-01" }],
  ])("rejects %s", async (_label, input) => {
    await expect(service.createRequirement(CONTEXT, PROJECT.id, input)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(requirementRepository.createRequirement).not.toHaveBeenCalled();
  });

  it("surfaces a duplicate identifier as a conflict", async () => {
    vi.mocked(requirementRepository.createRequirement).mockRejectedValue(
      new ConflictError("Requirement REQ-001 already exists in this project."),
    );

    await expect(
      service.createRequirement(CONTEXT, PROJECT.id, VALID_CREATE),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("refuses a project outside the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    await expect(
      service.createRequirement(CONTEXT, PROJECT.id, VALID_CREATE),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(requirementRepository.createRequirement).not.toHaveBeenCalled();
  });

  it("rejects an owner from another organization at creation", async () => {
    vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(false);

    await expect(
      service.createRequirement(CONTEXT, PROJECT.id, {
        ...VALID_CREATE,
        ownerId: "userfromanotherorg1234",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(requirementRepository.createRequirement).not.toHaveBeenCalled();
  });
});

describe("lifecycle transitions", () => {
  it.each([
    ["DRAFT", "IN_REVIEW"],
    ["IN_REVIEW", "APPROVED"],
    ["APPROVED", "BASELINED"],
    ["DRAFT", "OBSOLETE"],
    ["IN_REVIEW", "OBSOLETE"],
    ["APPROVED", "OBSOLETE"],
    ["BASELINED", "OBSOLETE"],
  ] as const)("allows %s → %s", async (from, to) => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(
      requirement({ status: from }),
    );
    vi.mocked(requirementRepository.transitionStatusGuarded).mockResolvedValue(
      requirement({ status: to }),
    );

    const result = await service.transitionRequirementStatus(CONTEXT, PROJECT.id, "req1", { to });

    expect(result.status).toBe(to);
    expect(requirementRepository.transitionStatusGuarded).toHaveBeenCalledWith(
      expect.any(String),
      from,
      to,
      TX,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "requirement.status_transitioned", metadata: { from, to } }),
      TX,
    );
  });

  it.each([
    ["DRAFT", "APPROVED"],
    ["DRAFT", "BASELINED"],
    ["IN_REVIEW", "BASELINED"],
    ["OBSOLETE", "DRAFT"],
    ["OBSOLETE", "IN_REVIEW"],
    ["OBSOLETE", "APPROVED"],
  ] as const)("rejects %s → %s as a conflict", async (from, to) => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(
      requirement({ status: from }),
    );

    await expect(
      service.transitionRequirementStatus(CONTEXT, PROJECT.id, "req1", { to }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(requirementRepository.updateRequirement).not.toHaveBeenCalled();
    expect(auditLogRepository.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects a transition to the status it already holds", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(
      requirement({ status: "DRAFT" }),
    );

    await expect(
      service.transitionRequirementStatus(CONTEXT, PROJECT.id, "req1", { to: "DRAFT" }),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("records the supplied rationale on the audit event", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(requirement());
    vi.mocked(requirementRepository.transitionStatusGuarded).mockResolvedValue(
      requirement({ status: "IN_REVIEW" }),
    );

    await service.transitionRequirementStatus(CONTEXT, PROJECT.id, "req1", {
      to: "IN_REVIEW",
      rationale: "Ready for peer review",
    });

    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { from: "DRAFT", to: "IN_REVIEW", rationale: "Ready for peer review" },
      }),
      TX,
    );
  });
});

describe("updateRequirement", () => {
  it.each(["DRAFT", "IN_REVIEW"] as const)("allows content edits in %s", async (status) => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(
      requirement({ status }),
    );
    vi.mocked(requirementRepository.updateRequirement).mockResolvedValue(
      requirement({ status, title: "Revised" }),
    );

    const updated = await service.updateRequirement(CONTEXT, PROJECT.id, "req1", {
      title: "Revised",
    });

    expect(updated.title).toBe("Revised");
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "requirement.updated" }),
      TX,
    );
  });

  it.each(["APPROVED", "BASELINED", "OBSOLETE"] as const)(
    "refuses content edits in %s",
    async (status) => {
      vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(
        requirement({ status }),
      );

      await expect(
        service.updateRequirement(CONTEXT, PROJECT.id, "req1", { title: "Sneaky edit" }),
      ).rejects.toBeInstanceOf(ConflictError);
      expect(requirementRepository.updateRequirement).not.toHaveBeenCalled();
    },
  );

  it("refuses to change status through a content update", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(requirement());

    // Status is not part of the update contract at all: it is rejected as an
    // unknown field, so the lifecycle cannot be bypassed.
    await expect(
      service.updateRequirement(CONTEXT, PROJECT.id, "req1", { status: "APPROVED" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses an update for a requirement in another project", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(null);

    await expect(
      service.updateRequirement(CONTEXT, PROJECT.id, "req1", { title: "Revised" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("assignRequirementOwner", () => {
  it("assigns an owner from the same organization", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(requirement());
    vi.mocked(requirementRepository.updateRequirement).mockResolvedValue(
      requirement({ ownerId: "user2aaaaaaaaaaaaaaaaaaa" }),
    );

    const result = await service.assignRequirementOwner(CONTEXT, PROJECT.id, "req1", {
      ownerId: "user2aaaaaaaaaaaaaaaaaaa",
    });

    expect(result.ownerId).toBe("user2aaaaaaaaaaaaaaaaaaa");
    expect(userRepository.isMemberOfOrganization).toHaveBeenCalledWith(
      "user2aaaaaaaaaaaaaaaaaaa",
      CONTEXT.organizationId,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "requirement.owner_assigned" }),
      TX,
    );
  });

  it("rejects an owner from another organization", async () => {
    vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(false);

    await expect(
      service.assignRequirementOwner(CONTEXT, PROJECT.id, "req1", {
        ownerId: "userfromanotherorg1234",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(requirementRepository.updateRequirement).not.toHaveBeenCalled();
  });

  it("clears an owner with an explicit null", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(
      requirement({ ownerId: "user2aaaaaaaaaaaaaaaaaaa" }),
    );
    vi.mocked(requirementRepository.updateRequirement).mockResolvedValue(requirement());

    await service.assignRequirementOwner(CONTEXT, PROJECT.id, "req1", { ownerId: null });

    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "requirement.owner_cleared" }),
      TX,
    );
  });

  it.each(["BASELINED", "OBSOLETE"] as const)("refuses ownership changes in %s", async (status) => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(
      requirement({ status }),
    );

    await expect(
      service.assignRequirementOwner(CONTEXT, PROJECT.id, "req1", {
        ownerId: "user2aaaaaaaaaaaaaaaaaaa",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("traceability", () => {
  it("links to a target in the same project", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(requirement());

    await service.linkRequirement(CONTEXT, PROJECT.id, "req1", {
      relation: "DESIGN_ITEM",
      targetId: "design1aaaaaaaaaaaaaaa",
    });

    expect(requirementRepository.linkTargetExistsInProject).toHaveBeenCalledWith(
      "DESIGN_ITEM",
      "design1aaaaaaaaaaaaaaa",
      PROJECT.id,
      TX,
    );
    expect(requirementRepository.createRequirementLink).toHaveBeenCalledWith(
      expect.objectContaining({
        relation: "DESIGN_ITEM",
        targetId: "design1aaaaaaaaaaaaaaa",
        // Provenance comes from the session, never the request body.
        createdById: CONTEXT.actorId,
      }),
      TX,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "requirement.link_added" }),
      TX,
    );
  });

  it("rejects a link to a target in another project", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(requirement());
    // The scoped existence check finds nothing for a foreign artifact.
    vi.mocked(requirementRepository.linkTargetExistsInProject).mockResolvedValue(false);

    await expect(
      service.linkRequirement(CONTEXT, PROJECT.id, "req1", {
        relation: "DESIGN_ITEM",
        targetId: "designfromotherproject",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(requirementRepository.createRequirementLink).not.toHaveBeenCalled();
    expect(auditLogRepository.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("rejects an unknown relation or a link type the relation does not accept", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(requirement());

    await expect(
      service.linkRequirement(CONTEXT, PROJECT.id, "req1", {
        relation: "SOMETHING_ELSE",
        targetId: "target1aaaaaaaaaaaaaaa",
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    // A stakeholder-need edge has no note column, so a note is not accepted.
    await expect(
      service.linkRequirement(CONTEXT, PROJECT.id, "req1", {
        relation: "STAKEHOLDER_NEED",
        targetId: "need1aaaaaaaaaaaaaaaaaa",
        note: "not storable here",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("requires an explicit link type for decision relationships", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(requirement());

    await expect(
      service.linkRequirement(CONTEXT, PROJECT.id, "req1", {
        relation: "ENGINEERING_DECISION",
        targetId: "dec1aaaaaaaaaaaaaaaaaaa",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("unlinks an existing edge and audits it", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(requirement());
    vi.mocked(requirementRepository.deleteRequirementLink).mockResolvedValue(1);

    await service.unlinkRequirement(CONTEXT, PROJECT.id, "req1", {
      relation: "DESIGN_ITEM",
      targetId: "design1aaaaaaaaaaaaaaa",
    });

    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "requirement.link_removed" }),
      TX,
    );
  });

  it("reports a missing edge as not found rather than silently succeeding", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(requirement());
    vi.mocked(requirementRepository.deleteRequirementLink).mockResolvedValue(0);

    await expect(
      service.unlinkRequirement(CONTEXT, PROJECT.id, "req1", {
        relation: "DESIGN_ITEM",
        targetId: "design1aaaaaaaaaaaaaaa",
      }),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(auditLogRepository.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("refuses traceability changes on an obsolete requirement", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(
      requirement({ status: "OBSOLETE" }),
    );

    await expect(
      service.linkRequirement(CONTEXT, PROJECT.id, "req1", {
        relation: "DESIGN_ITEM",
        targetId: "design1aaaaaaaaaaaaaaa",
      }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});

describe("getRequirement", () => {
  it("returns only the transitions legal from the current status", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(
      requirement({ status: "IN_REVIEW" }),
    );
    vi.mocked(auditLogRepository.listAuditEventsForEntity).mockResolvedValue([]);

    const detail = await service.getRequirement(CONTEXT, PROJECT.id, "req1");

    expect(detail.availableTransitions).toEqual(["APPROVED", "OBSOLETE"]);
    expect(detail.editable).toEqual({ content: true, owner: true, links: true });
  });

  it("reports a baselined requirement as read-only", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(
      requirement({ status: "BASELINED" }),
    );
    vi.mocked(auditLogRepository.listAuditEventsForEntity).mockResolvedValue([]);

    const detail = await service.getRequirement(CONTEXT, PROJECT.id, "req1");

    expect(detail.editable.content).toBe(false);
    expect(detail.editable.owner).toBe(false);
    expect(detail.availableTransitions).toEqual(["OBSOLETE"]);
  });

  it("scopes history to the caller's organization", async () => {
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(requirement());
    vi.mocked(auditLogRepository.listAuditEventsForEntity).mockResolvedValue([]);

    await service.getRequirement(CONTEXT, PROJECT.id, "req1");

    expect(auditLogRepository.listAuditEventsForEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: CONTEXT.organizationId,
        entityType: "Requirement",
      }),
    );
  });
});

describe("listRequirements", () => {
  it("lists within the project and passes a status filter through", async () => {
    vi.mocked(requirementRepository.listRequirementsInProject).mockResolvedValue([]);

    await service.listRequirements(CONTEXT, PROJECT.id, { status: "APPROVED" });

    expect(requirementRepository.listRequirementsInProject).toHaveBeenCalledWith(PROJECT.id, {
      status: "APPROVED",
    });
  });

  it("treats an empty filter as unfiltered", async () => {
    vi.mocked(requirementRepository.listRequirementsInProject).mockResolvedValue([]);

    await service.listRequirements(CONTEXT, PROJECT.id, { status: "" });

    expect(requirementRepository.listRequirementsInProject).toHaveBeenCalledWith(PROJECT.id, {});
  });

  it("rejects an unrecognized status filter", async () => {
    await expect(
      service.listRequirements(CONTEXT, PROJECT.id, { status: "NOT_A_STATUS" }),
    ).rejects.toBeInstanceOf(ValidationError);
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

  it("refuses a VIEWER creating a requirement", async () => {
    asRole("VIEWER");
    await expect(
      service.createRequirement(CONTEXT, PROJECT.id, VALID_CREATE),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(requirementRepository.createRequirement).not.toHaveBeenCalled();
  });

  it("refuses a REVIEWER creating a requirement — read/approve authority is not write authority", async () => {
    asRole("REVIEWER");
    await expect(
      service.createRequirement(CONTEXT, PROJECT.id, VALID_CREATE),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows an ENGINEER to create a requirement", async () => {
    asRole("ENGINEER");
    vi.mocked(requirementRepository.createRequirement).mockResolvedValue(requirement());

    await expect(
      service.createRequirement(CONTEXT, PROJECT.id, VALID_CREATE),
    ).resolves.toMatchObject({ identifier: "REQ-001" });
  });

  it("refuses an ENGINEER approving a requirement — write authority is not approval authority", async () => {
    asRole("ENGINEER");
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(
      requirement({ status: "IN_REVIEW" }),
    );

    await expect(
      service.transitionRequirementStatus(CONTEXT, PROJECT.id, "req1", { to: "APPROVED" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(requirementRepository.updateRequirement).not.toHaveBeenCalled();
  });

  it("allows a REVIEWER to approve a requirement", async () => {
    asRole("REVIEWER");
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(
      requirement({ status: "IN_REVIEW" }),
    );
    vi.mocked(requirementRepository.transitionStatusGuarded).mockResolvedValue(
      requirement({ status: "APPROVED" }),
    );

    await expect(
      service.transitionRequirementStatus(CONTEXT, PROJECT.id, "req1", { to: "APPROVED" }),
    ).resolves.toMatchObject({ status: "APPROVED" });
  });

  it("allows a REVIEWER to move DRAFT → IN_REVIEW — not itself an approval transition, but reviewers also read/submit", async () => {
    // REVIEWER does not have write authority, so this is refused: only the
    // domain's own approval-shaped transitions (APPROVED, BASELINED) are
    // within review authority.
    asRole("REVIEWER");
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(
      requirement({ status: "DRAFT" }),
    );

    await expect(
      service.transitionRequirementStatus(CONTEXT, PROJECT.id, "req1", { to: "IN_REVIEW" }),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows a MANAGER to do both ordinary writes and approvals", async () => {
    asRole("MANAGER");
    vi.mocked(requirementRepository.createRequirement).mockResolvedValue(requirement());
    await expect(
      service.createRequirement(CONTEXT, PROJECT.id, VALID_CREATE),
    ).resolves.toMatchObject({ identifier: "REQ-001" });

    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(
      requirement({ status: "IN_REVIEW" }),
    );
    vi.mocked(requirementRepository.transitionStatusGuarded).mockResolvedValue(
      requirement({ status: "APPROVED" }),
    );
    await expect(
      service.transitionRequirementStatus(CONTEXT, PROJECT.id, "req1", { to: "APPROVED" }),
    ).resolves.toMatchObject({ status: "APPROVED" });
  });

  it("refuses assigning an owner who cannot reach the project themselves", async () => {
    asRole("MANAGER");
    vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(true);
    // The proposed owner is a real organization member, but not a project one.
    vi.mocked(membershipRepository.findMembership).mockImplementation(async (_projectId, userId) => {
      if (userId === CONTEXT.actorId) {
        return {
          id: "mem1",
          projectId: PROJECT.id,
          role: "MANAGER",
          createdAt: new Date(),
          updatedAt: new Date(),
          user: { id: CONTEXT.actorId!, name: "Ada", email: "ada@example.test", organizationRole: "MEMBER" },
        } as never;
      }
      return null;
    });
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");
    vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(requirement());

    await expect(
      service.assignRequirementOwner(CONTEXT, PROJECT.id, "req1", { ownerId: "user2aaaaaaaaaaaaaaaaaaa" }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
