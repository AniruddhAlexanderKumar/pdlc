// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Requirement, VerificationActivity } from "@/domain";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ConflictError, ForbiddenError, ValidationError } from "@/server/errors";

/**
 * Both automations against fake repositories. The transaction sentinel shows
 * that every record and its audit event are written through the same client,
 * so a paste (or a batch of checks) commits all together or not at all.
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
  createRequirementLink: vi.fn(),
  listRequirementsWithoutVerification: vi.fn(),
  findRequirementsInProject: vi.fn(),
}));

vi.mock("@/server/repositories/verification-activity.repository", () => ({
  createVerificationActivity: vi.fn(),
}));

vi.mock("@/server/repositories/record-identifier.repository", () => ({
  listIdentifiersWithPrefix: vi.fn(),
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
}));

const { prisma } = await import("@/lib/db");
const projectRepository = await import("@/server/repositories/project.repository");
const requirementRepository = await import("@/server/repositories/requirement.repository");
const verificationRepository = await import("@/server/repositories/verification-activity.repository");
const recordIdentifierRepository = await import("@/server/repositories/record-identifier.repository");
const userRepository = await import("@/server/repositories/user.repository");
const membershipRepository = await import("@/server/repositories/project-membership.repository");
const auditLogRepository = await import("@/server/repositories/audit-log.repository");
const service = await import("./quick-actions.service");

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

function asMember(role: "MANAGER" | "ENGINEER" | "REVIEWER" | "VIEWER") {
  vi.mocked(membershipRepository.findMembership).mockResolvedValue({
    id: "mem1",
    projectId: PROJECT.id,
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: CONTEXT.actorId!, name: "Ada", email: "ada@example.test", organizationRole: "MEMBER" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
  vi.mocked(userRepository.isMemberOfOrganization).mockResolvedValue(true);
  vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");
  asMember("ENGINEER");
  vi.mocked(recordIdentifierRepository.listIdentifiersWithPrefix).mockResolvedValue([]);
  vi.mocked(requirementRepository.createRequirement).mockImplementation(async (input) => ({
    ...input,
    id: `req-${input.identifier}`,
    rationale: input.rationale ?? null,
    source: input.source ?? null,
    ownerId: input.ownerId ?? null,
    status: input.status ?? "DRAFT",
    priority: input.priority ?? "MEDIUM",
    createdAt: new Date(),
    updatedAt: new Date(),
  }) as Requirement);
  vi.mocked(verificationRepository.createVerificationActivity).mockImplementation(
    async (input) =>
      ({
        ...input,
        id: `ver-${input.identifier}`,
        status: "PLANNED",
        completedDate: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      }) as VerificationActivity,
  );
});

describe("createRequirementsInBulk", () => {
  it("adds each statement as a draft, numbered after the existing ones and titled from its own words", async () => {
    vi.mocked(recordIdentifierRepository.listIdentifiersWithPrefix).mockResolvedValue(["REQ-001", "REQ-002"]);

    const created = await service.createRequirementsInBulk(CONTEXT, PROJECT.id, {
      statements: ["The pump shall deliver 5 L/min. It shall be quiet.", "The tank shall hold 20 L."],
    });

    expect(created.map((r) => r.identifier)).toEqual(["REQ-003", "REQ-004"]);
    expect(requirementRepository.createRequirement).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        projectId: PROJECT.id,
        identifier: "REQ-003",
        title: "The pump shall deliver 5 L/min",
        statement: "The pump shall deliver 5 L/min. It shall be quiet.",
        status: "DRAFT",
        priority: "MEDIUM",
      }),
      TX,
    );
  });

  it("audits every requirement inside the one transaction", async () => {
    await service.createRequirementsInBulk(CONTEXT, PROJECT.id, { statements: ["A shall B.", "C shall D."] });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledTimes(2);
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "requirement.created",
        entityType: "Requirement",
        actorId: CONTEXT.actorId,
        metadata: expect.objectContaining({ identifier: "REQ-001", addedFromList: true }),
      }),
      TX,
    );
  });

  it("starts the whole paste again with fresh numbers after losing a race", async () => {
    vi.mocked(recordIdentifierRepository.listIdentifiersWithPrefix)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce(["REQ-001"]);
    vi.mocked(prisma.$transaction)
      .mockRejectedValueOnce(new ConflictError("Requirement REQ-001 already exists in this project."))
      .mockImplementation((async (fn: (tx: unknown) => unknown) => fn(TX)) as never);

    const created = await service.createRequirementsInBulk(CONTEXT, PROJECT.id, { statements: ["A shall B."] });

    expect(created.map((r) => r.identifier)).toEqual(["REQ-002"]);
  });

  it("refuses a reviewer, who may approve but not author", async () => {
    asMember("REVIEWER");
    await expect(
      service.createRequirementsInBulk(CONTEXT, PROJECT.id, { statements: ["A shall B."] }),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(requirementRepository.createRequirement).not.toHaveBeenCalled();
  });

  it("rejects an empty paste", async () => {
    await expect(service.createRequirementsInBulk(CONTEXT, PROJECT.id, { statements: [] })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe("planChecks", () => {
  const WITHOUT_CHECKS = [
    { id: "req1", identifier: "REQ-001", title: "Pump flow", status: "DRAFT" as const },
    { id: "req2", identifier: "REQ-002", title: "Tank volume", status: "APPROVED" as const },
  ];

  it("plans and links one check for every requirement that has none", async () => {
    vi.mocked(requirementRepository.listRequirementsWithoutVerification).mockResolvedValue(WITHOUT_CHECKS);
    vi.mocked(recordIdentifierRepository.listIdentifiersWithPrefix).mockResolvedValue(["VER-001"]);

    const planned = await service.planChecks(CONTEXT, PROJECT.id, { method: "TEST" });

    expect(planned.map((p) => [p.requirementIdentifier, p.activity.identifier])).toEqual([
      ["REQ-001", "VER-002"],
      ["REQ-002", "VER-003"],
    ]);
    expect(verificationRepository.createVerificationActivity).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Check REQ-001: Pump flow", method: "TEST", projectId: PROJECT.id }),
      TX,
    );
    expect(requirementRepository.createRequirementLink).toHaveBeenCalledWith(
      { requirementId: "req1", relation: "VERIFICATION_ACTIVITY", targetId: "ver-VER-002", createdById: CONTEXT.actorId },
      TX,
    );
  });

  it("audits each check's creation and each new link", async () => {
    vi.mocked(requirementRepository.listRequirementsWithoutVerification).mockResolvedValue([WITHOUT_CHECKS[0]!]);

    await service.planChecks(CONTEXT, PROJECT.id, { method: "INSPECTION" });

    const actions = vi.mocked(auditLogRepository.recordAuditEvent).mock.calls.map(([event]) => event.action);
    expect(actions).toEqual(["verification_activity.created", "requirement.link_added"]);
  });

  it("does nothing when every requirement already has a check", async () => {
    vi.mocked(requirementRepository.listRequirementsWithoutVerification).mockResolvedValue([]);

    await expect(service.planChecks(CONTEXT, PROJECT.id, { method: "TEST" })).resolves.toEqual([]);
    expect(verificationRepository.createVerificationActivity).not.toHaveBeenCalled();
  });

  it("plans for exactly the chosen requirements", async () => {
    vi.mocked(requirementRepository.findRequirementsInProject).mockResolvedValue([WITHOUT_CHECKS[1]!]);

    const planned = await service.planChecks(CONTEXT, PROJECT.id, { method: "ANALYSIS", requirementIds: ["req2"] });

    expect(planned).toHaveLength(1);
    expect(requirementRepository.findRequirementsInProject).toHaveBeenCalledWith(PROJECT.id, ["req2"], TX);
    expect(requirementRepository.listRequirementsWithoutVerification).not.toHaveBeenCalled();
  });

  it("refuses a requirement from another project, creating nothing", async () => {
    vi.mocked(requirementRepository.findRequirementsInProject).mockResolvedValue([]);

    await expect(
      service.planChecks(CONTEXT, PROJECT.id, { method: "TEST", requirementIds: ["elsewhere"] }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(verificationRepository.createVerificationActivity).not.toHaveBeenCalled();
  });

  it("refuses an obsolete requirement, creating nothing", async () => {
    vi.mocked(requirementRepository.findRequirementsInProject).mockResolvedValue([
      { id: "req9", identifier: "REQ-009", title: "Old", status: "OBSOLETE" },
    ]);

    await expect(
      service.planChecks(CONTEXT, PROJECT.id, { method: "TEST", requirementIds: ["req9"] }),
    ).rejects.toBeInstanceOf(ConflictError);
    expect(verificationRepository.createVerificationActivity).not.toHaveBeenCalled();
  });

  it("refuses a viewer", async () => {
    asMember("VIEWER");
    await expect(service.planChecks(CONTEXT, PROJECT.id, { method: "TEST" })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("listRequirementsNeedingChecks", () => {
  it("is readable by a viewer", async () => {
    asMember("VIEWER");
    vi.mocked(requirementRepository.listRequirementsWithoutVerification).mockResolvedValue([]);
    await expect(service.listRequirementsNeedingChecks(CONTEXT, PROJECT.id)).resolves.toEqual([]);
  });
});
