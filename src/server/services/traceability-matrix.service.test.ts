// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrganizationContext } from "@/server/context/organization-context";

/**
 * The traceability matrix against faked repositories: no database. Proves
 * the composition itself — coverage sets, sparse cell placement, endpoints
 * that no longer resolve being dropped rather than crashing the view — not
 * requirement or verification-activity correctness, which is each domain's
 * own concern.
 */

const CONTEXT: OrganizationContext = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
};
const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";

const PROJECT = {
  id: PROJECT_ID,
  organizationId: CONTEXT.organizationId,
  name: "Upper Stage Propulsion",
  description: null,
  status: "ACTIVE",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

vi.mock("@/server/repositories/project.repository", () => ({
  findProjectInOrganization: vi.fn(),
}));
vi.mock("@/server/repositories/project-membership.repository", () => ({
  findMembership: vi.fn(),
}));
vi.mock("@/server/repositories/user.repository", () => ({
  getOrganizationRole: vi.fn(),
}));
vi.mock("@/server/repositories/requirement.repository", () => ({
  listRequirementsInProject: vi.fn(),
  listRequirementVerificationLinksInProject: vi.fn(),
}));
vi.mock("@/server/repositories/verification-activity.repository", () => ({
  listVerificationActivitiesInProject: vi.fn(),
}));

const projectRepository = await import("@/server/repositories/project.repository");
const membershipRepository = await import("@/server/repositories/project-membership.repository");
const requirementRepository = await import("@/server/repositories/requirement.repository");
const verificationActivityRepository = await import("@/server/repositories/verification-activity.repository");
const { getRequirementVerificationMatrix } = await import("./traceability-matrix.service");

function requirement(id: string, identifier: string, title: string) {
  return {
    id,
    projectId: PROJECT_ID,
    identifier,
    title,
    statement: "s",
    rationale: null,
    status: "DRAFT",
    priority: "MEDIUM",
    source: null,
    ownerId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    owner: null,
  };
}

function activity(id: string, identifier: string, title: string) {
  return {
    id,
    projectId: PROJECT_ID,
    identifier,
    title,
    description: null,
    method: "TEST",
    status: "PLANNED",
    ownerId: null,
    plannedDate: null,
    completedDate: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    owner: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT as never);
  vi.mocked(membershipRepository.findMembership).mockResolvedValue({
    id: "mem1",
    projectId: PROJECT_ID,
    role: "MANAGER",
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: CONTEXT.actorId!, name: "Ada", email: "ada@test.invalid", organizationRole: "MEMBER" },
  } as never);
});

describe("getRequirementVerificationMatrix", () => {
  it("places a sparse cell only where a real link exists", async () => {
    vi.mocked(requirementRepository.listRequirementsInProject).mockResolvedValue([
      requirement("r1", "REQ-001", "Max chamber pressure"),
      requirement("r2", "REQ-002", "Wall thickness"),
    ] as never);
    vi.mocked(verificationActivityRepository.listVerificationActivitiesInProject).mockResolvedValue([
      activity("v1", "VER-001", "Hot fire test"),
    ] as never);
    vi.mocked(requirementRepository.listRequirementVerificationLinksInProject).mockResolvedValue([
      { id: "link1", requirementId: "r1", verificationActivityId: "v1", note: null, createdAt: new Date("2026-02-01T00:00:00.000Z"), createdById: "user1aaaaaaaaaaaaaaaaaaa" },
    ]);

    const matrix = await getRequirementVerificationMatrix(CONTEXT, PROJECT_ID);

    expect(matrix.cells).toEqual([
      {
        rowId: "r1",
        columnId: "v1",
        linkId: "link1",
        note: null,
        createdAt: "2026-02-01T00:00:00.000Z",
        createdById: "user1aaaaaaaaaaaaaaaaaaa",
      },
    ]);
  });

  it("reports the unlinked requirement as uncovered — the primary read, per Master Prompt 4 §4", async () => {
    vi.mocked(requirementRepository.listRequirementsInProject).mockResolvedValue([
      requirement("r1", "REQ-001", "Covered"),
      requirement("r2", "REQ-002", "Not covered"),
    ] as never);
    vi.mocked(verificationActivityRepository.listVerificationActivitiesInProject).mockResolvedValue([
      activity("v1", "VER-001", "Hot fire test"),
    ] as never);
    vi.mocked(requirementRepository.listRequirementVerificationLinksInProject).mockResolvedValue([
      { id: "link1", requirementId: "r1", verificationActivityId: "v1", note: null, createdAt: new Date(), createdById: null },
    ]);

    const matrix = await getRequirementVerificationMatrix(CONTEXT, PROJECT_ID);

    expect(matrix.uncoveredRowIds).toEqual(["r2"]);
  });

  it("reports a verification activity with no requirement pointed at it as an uncovered column", async () => {
    vi.mocked(requirementRepository.listRequirementsInProject).mockResolvedValue([
      requirement("r1", "REQ-001", "x"),
    ] as never);
    vi.mocked(verificationActivityRepository.listVerificationActivitiesInProject).mockResolvedValue([
      activity("v1", "VER-001", "Linked"),
      activity("v2", "VER-002", "Orphaned"),
    ] as never);
    vi.mocked(requirementRepository.listRequirementVerificationLinksInProject).mockResolvedValue([
      { id: "link1", requirementId: "r1", verificationActivityId: "v1", note: null, createdAt: new Date(), createdById: null },
    ]);

    const matrix = await getRequirementVerificationMatrix(CONTEXT, PROJECT_ID);

    expect(matrix.uncoveredColumnIds).toEqual(["v2"]);
  });

  it("never reports a fully-covered project as anything but zero uncovered rows", async () => {
    vi.mocked(requirementRepository.listRequirementsInProject).mockResolvedValue([
      requirement("r1", "REQ-001", "x"),
    ] as never);
    vi.mocked(verificationActivityRepository.listVerificationActivitiesInProject).mockResolvedValue([
      activity("v1", "VER-001", "x"),
    ] as never);
    vi.mocked(requirementRepository.listRequirementVerificationLinksInProject).mockResolvedValue([
      { id: "link1", requirementId: "r1", verificationActivityId: "v1", note: null, createdAt: new Date(), createdById: null },
    ]);

    const matrix = await getRequirementVerificationMatrix(CONTEXT, PROJECT_ID);

    expect(matrix.uncoveredRowIds).toEqual([]);
  });

  it("drops a link whose endpoint no longer resolves on either axis, rather than crashing the view", async () => {
    vi.mocked(requirementRepository.listRequirementsInProject).mockResolvedValue([
      requirement("r1", "REQ-001", "x"),
    ] as never);
    vi.mocked(verificationActivityRepository.listVerificationActivitiesInProject).mockResolvedValue([
      activity("v1", "VER-001", "x"),
    ] as never);
    // A link naming a requirement id ("r-deleted") that is not in the
    // resolved axis list at all.
    vi.mocked(requirementRepository.listRequirementVerificationLinksInProject).mockResolvedValue([
      { id: "link1", requirementId: "r-deleted", verificationActivityId: "v1", note: null, createdAt: new Date(), createdById: null },
    ]);

    const matrix = await getRequirementVerificationMatrix(CONTEXT, PROJECT_ID);

    expect(matrix.cells).toEqual([]);
    expect(matrix.uncoveredRowIds).toEqual(["r1"]);
  });

  it("returns empty axes and no uncovered rows for a project with no requirements", async () => {
    vi.mocked(requirementRepository.listRequirementsInProject).mockResolvedValue([]);
    vi.mocked(verificationActivityRepository.listVerificationActivitiesInProject).mockResolvedValue([]);
    vi.mocked(requirementRepository.listRequirementVerificationLinksInProject).mockResolvedValue([]);

    const matrix = await getRequirementVerificationMatrix(CONTEXT, PROJECT_ID);

    expect(matrix.rows).toEqual([]);
    expect(matrix.uncoveredRowIds).toEqual([]);
  });
});
