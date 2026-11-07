// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Project, Requirement, RequirementRelation } from "@/domain";
import { ValidationError } from "@/server/errors";

/**
 * Integration between the Requirements module and the three new artifact
 * modules.
 *
 * The *real* RequirementService runs; only the repositories are faked, and
 * the fake models the one rule that matters here — `linkTargetExistsInProject`
 * answers truthfully per project, exactly as the real query does. That makes
 * these genuine assertions about cross-project rejection rather than a
 * restatement of the mock.
 */
const TX = { __transaction: true } as const;

const CONTEXT = {
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

const OTHER_PROJECT_ID = "proj2bbbbbbbbbbbbbbbbbbb";

/** Artifacts that exist, and which project each belongs to. */
const ARTIFACTS: Array<{ relation: RequirementRelation; id: string; projectId: string }> = [
  { relation: "STAKEHOLDER_NEED", id: "need1aaaaaaaaaaaaaaaaaa", projectId: PROJECT.id },
  { relation: "DESIGN_ITEM", id: "design1aaaaaaaaaaaaaaa", projectId: PROJECT.id },
  { relation: "VERIFICATION_ACTIVITY", id: "ver1aaaaaaaaaaaaaaaaaaa", projectId: PROJECT.id },
  // The same kinds of artifact, but belonging to a different project.
  { relation: "STAKEHOLDER_NEED", id: "needfromotherproject11", projectId: OTHER_PROJECT_ID },
  { relation: "DESIGN_ITEM", id: "designfromotherproject", projectId: OTHER_PROJECT_ID },
  { relation: "VERIFICATION_ACTIVITY", id: "verfromotherproject111", projectId: OTHER_PROJECT_ID },
];

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)) },
}));

vi.mock("@/server/repositories/project.repository", () => ({
  findProjectInOrganization: vi.fn(),
}));

vi.mock("@/server/repositories/requirement.repository", () => ({
  createRequirement: vi.fn(),
  updateRequirement: vi.fn(),
  findRequirementInProject: vi.fn(),
  listRequirementsInProject: vi.fn(),
  findRequirementOwner: vi.fn(),
  listRequirementLinks: vi.fn(),
  // Mirrors the real project-scoped existence query.
  linkTargetExistsInProject: vi.fn(
    async (relation: RequirementRelation, targetId: string, projectId: string) =>
      ARTIFACTS.some(
        (artifact) =>
          artifact.relation === relation &&
          artifact.id === targetId &&
          artifact.projectId === projectId,
      ),
  ),
  createRequirementLink: vi.fn(),
  deleteRequirementLink: vi.fn(),
}));

vi.mock("@/server/repositories/user.repository", () => ({
  isMemberOfOrganization: vi.fn(),
}));

vi.mock("@/server/repositories/audit-log.repository", () => ({
  recordAuditEvent: vi.fn(),
  listAuditEventsForEntity: vi.fn(),
}));

vi.mock("@/server/repositories/project-artifacts.repository", () => ({
  listLinkTargets: vi.fn(),
}));

// requirement.service.ts's reads and links go through requireProjectReadAccess
// / requireProjectWriteAccess (real ProjectMembership-tiered, not just
// tenancy), which needs this repository too — CONTEXT's actor is modeled as
// a real MANAGER on PROJECT below, matching the read+write access every test
// here actually exercises.
vi.mock("@/server/repositories/project-membership.repository", () => ({
  findMembership: vi.fn(),
}));

const projectRepository = await import("@/server/repositories/project.repository");
const projectMembershipRepository = await import("@/server/repositories/project-membership.repository");
const requirementRepository = await import("@/server/repositories/requirement.repository");
const projectArtifacts = await import("@/server/repositories/project-artifacts.repository");
const auditLogRepository = await import("@/server/repositories/audit-log.repository");
const requirementService = await import("@/server/services/requirement.service");

const REQUIREMENT: Requirement = {
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
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
  vi.mocked(projectMembershipRepository.findMembership).mockResolvedValue({
    id: "mem1aaaaaaaaaaaaaaaaaaa",
    projectId: PROJECT.id,
    role: "MANAGER",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    user: { id: CONTEXT.actorId, name: "Test Engineer", email: "engineer@test.invalid", organizationRole: "MEMBER" },
  });
  vi.mocked(requirementRepository.findRequirementInProject).mockResolvedValue(REQUIREMENT);
  vi.mocked(requirementRepository.listRequirementLinks).mockResolvedValue([]);
});

describe("a requirement links to real artifacts in its own project", () => {
  it("links to a stakeholder need", async () => {
    await requirementService.linkRequirement(CONTEXT, PROJECT.id, REQUIREMENT.id, {
      relation: "STAKEHOLDER_NEED",
      targetId: "need1aaaaaaaaaaaaaaaaaa",
    });

    expect(requirementRepository.createRequirementLink).toHaveBeenCalledWith(
      expect.objectContaining({
        relation: "STAKEHOLDER_NEED",
        targetId: "need1aaaaaaaaaaaaaaaaaa",
        createdById: CONTEXT.actorId,
      }),
      TX,
    );
  });

  it("links to a design item with an allocation type", async () => {
    await requirementService.linkRequirement(CONTEXT, PROJECT.id, REQUIREMENT.id, {
      relation: "DESIGN_ITEM",
      targetId: "design1aaaaaaaaaaaaaaa",
      linkType: "ALLOCATED_TO",
    });

    expect(requirementRepository.createRequirementLink).toHaveBeenCalledWith(
      expect.objectContaining({ relation: "DESIGN_ITEM", linkType: "ALLOCATED_TO" }),
      TX,
    );
  });

  it("links to a verification activity", async () => {
    await requirementService.linkRequirement(CONTEXT, PROJECT.id, REQUIREMENT.id, {
      relation: "VERIFICATION_ACTIVITY",
      targetId: "ver1aaaaaaaaaaaaaaaaaaa",
      note: "Verified by hot fire",
    });

    expect(requirementRepository.createRequirementLink).toHaveBeenCalledWith(
      expect.objectContaining({
        relation: "VERIFICATION_ACTIVITY",
        note: "Verified by hot fire",
      }),
      TX,
    );
    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "requirement.link_added" }),
      TX,
    );
  });
});

describe("cross-project links are rejected", () => {
  it.each([
    ["STAKEHOLDER_NEED", "needfromotherproject11"],
    ["DESIGN_ITEM", "designfromotherproject"],
    ["VERIFICATION_ACTIVITY", "verfromotherproject111"],
  ] as const)("refuses a %s belonging to another project", async (relation, targetId) => {
    await expect(
      requirementService.linkRequirement(CONTEXT, PROJECT.id, REQUIREMENT.id, {
        relation,
        targetId,
      }),
    ).rejects.toBeInstanceOf(ValidationError);

    expect(requirementRepository.createRequirementLink).not.toHaveBeenCalled();
    // A rejected link leaves no audit trail, because nothing happened.
    expect(auditLogRepository.recordAuditEvent).not.toHaveBeenCalled();
  });

  it("refuses a target id that does not exist at all", async () => {
    await expect(
      requirementService.linkRequirement(CONTEXT, PROJECT.id, REQUIREMENT.id, {
        relation: "DESIGN_ITEM",
        targetId: "doesnotexist1234567890",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("refuses to link when the project itself is outside the organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    await expect(
      requirementService.linkRequirement(CONTEXT, OTHER_PROJECT_ID, REQUIREMENT.id, {
        relation: "DESIGN_ITEM",
        targetId: "designfromotherproject",
      }),
    ).rejects.toThrow();
    expect(requirementRepository.createRequirementLink).not.toHaveBeenCalled();
  });
});

describe("link target selectors", () => {
  it("only offers artifacts from the caller's project", async () => {
    vi.mocked(projectArtifacts.listLinkTargets).mockResolvedValue({
      STAKEHOLDER_NEED: [{ id: "need1aaaaaaaaaaaaaaaaaa", identifier: "SN-001", title: "Payload" }],
      DESIGN_ITEM: [{ id: "design1aaaaaaaaaaaaaaa", identifier: "DI-001", title: "Chamber" }],
      VERIFICATION_ACTIVITY: [
        { id: "ver1aaaaaaaaaaaaaaaaaaa", identifier: "VER-001", title: "Hot fire" },
      ],
      ENGINEERING_DECISION: [],
      EVIDENCE: [],
    });

    const targets = await requirementService.listLinkTargets(CONTEXT, PROJECT.id);

    expect(projectArtifacts.listLinkTargets).toHaveBeenCalledWith(PROJECT.id);
    expect(targets.STAKEHOLDER_NEED).toHaveLength(1);
    expect(targets.DESIGN_ITEM).toHaveLength(1);
    expect(targets.VERIFICATION_ACTIVITY).toHaveLength(1);
    expect(targets.ENGINEERING_DECISION).toEqual([]);
    expect(targets.EVIDENCE).toEqual([]);
  });

  it("refuses to enumerate targets for a project outside the organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    await expect(
      requirementService.listLinkTargets(CONTEXT, OTHER_PROJECT_ID),
    ).rejects.toThrow();
    expect(projectArtifacts.listLinkTargets).not.toHaveBeenCalled();
  });
});
