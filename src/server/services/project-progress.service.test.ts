// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrganizationContext } from "@/server/context/organization-context";
import { NotFoundError } from "@/server/errors";

/**
 * Orchestration only; the counts themselves are proven against real
 * PostgreSQL in `src/tests/integration/project-progress.test.ts`.
 */

vi.mock("@/server/repositories/project-progress.repository", () => ({
  countsForProject: vi.fn(),
}));
vi.mock("./authorization.service", () => ({ requireProjectAccess: vi.fn() }));

const repository = await import("@/server/repositories/project-progress.repository");
const authorization = await import("./authorization.service");
const service = await import("./project-progress.service");

const CONTEXT: OrganizationContext = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
};
const PROJECT = "proj1aaaaaaaaaaaaaaaaaaa";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authorization.requireProjectAccess).mockResolvedValue("VIEWER");
  vi.mocked(repository.countsForProject).mockResolvedValue({
    stakeholderNeeds: 0,
    requirements: 4,
    requirementsWithoutCheck: 2,
    verificationActivities: 0,
    checksWithoutProof: 0,
    openChanges: 0,
  });
});

describe("getProjectProgress", () => {
  it("counts nothing for a project the caller cannot read", async () => {
    vi.mocked(authorization.requireProjectAccess).mockRejectedValue(new NotFoundError("nope"));

    await expect(service.getProjectProgress(CONTEXT, PROJECT)).rejects.toBeInstanceOf(NotFoundError);
    expect(repository.countsForProject).not.toHaveBeenCalled();
  });

  it("any reader may see it — a viewer needs to know what comes next too", async () => {
    await expect(service.getProjectProgress(CONTEXT, PROJECT)).resolves.toBeDefined();
  });

  it("returns every stage and the one to do next", async () => {
    const progress = await service.getProjectProgress(CONTEXT, PROJECT);

    expect(progress.steps).toHaveLength(4);
    expect(progress.next.stage).toBe("PLAN_CHECKS");
  });
});
