// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { emptyProgressFacts } from "@/domain/project-progress";
import type { OrganizationContext } from "@/server/context/organization-context";
import { NotFoundError } from "@/server/errors";

/**
 * Orchestration only; the record counts are proven against real PostgreSQL
 * in `src/tests/integration/project-progress.test.ts`, and the stage rules
 * in `src/domain/project-progress.test.ts`.
 *
 * What this file owns is how the release gate is read: through the
 * technical-readiness engine, with its freshness taken at face value.
 */

vi.mock("@/server/repositories/project-progress.repository", () => ({
  recordFactsForProject: vi.fn(),
}));
vi.mock("./authorization.service", () => ({ requireProjectAccess: vi.fn() }));
vi.mock("./technical-readiness.service", () => ({
  technicalReadinessService: { getLatestTechnicalReadiness: vi.fn() },
}));

const repository = await import("@/server/repositories/project-progress.repository");
const authorization = await import("./authorization.service");
const { technicalReadinessService } = await import("./technical-readiness.service");
const service = await import("./project-progress.service");

const CONTEXT: OrganizationContext = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
};
const PROJECT = "proj1aaaaaaaaaaaaaaaaaaa";

function recordFacts() {
  const { release, ...rest } = emptyProgressFacts();
  return { ...rest, release: { activeBaseline: release.activeBaseline, draftBaseline: release.draftBaseline } };
}

function assessed(status: "READY" | "NOT_READY" | "UNKNOWN", freshness: "CURRENT" | "STALE" | "UNKNOWN") {
  return {
    assessment: { status, evaluatedAt: "2026-09-01T00:00:00.000Z" },
    freshness,
    findings: [{ status: "BLOCKING" }, { status: "UNKNOWN" }, { status: "WARNING" }, { status: "INFORMATIONAL" }],
    scope: {},
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authorization.requireProjectAccess).mockResolvedValue("VIEWER");
  vi.mocked(repository.recordFactsForProject).mockResolvedValue(recordFacts() as never);
  vi.mocked(technicalReadinessService.getLatestTechnicalReadiness).mockResolvedValue({
    status: "NOT_EVALUATED",
    projectId: PROJECT,
    gate: "RELEASE_READY",
    readinessVersion: "1",
  } as never);
});

describe("getProjectProgress", () => {
  it("reads nothing for a project the caller cannot read", async () => {
    vi.mocked(authorization.requireProjectAccess).mockRejectedValue(new NotFoundError("nope"));

    await expect(service.getProjectProgress(CONTEXT, PROJECT)).rejects.toBeInstanceOf(NotFoundError);
    expect(repository.recordFactsForProject).not.toHaveBeenCalled();
    expect(technicalReadinessService.getLatestTechnicalReadiness).not.toHaveBeenCalled();
  });

  it("any reader may see it — a viewer needs to know where things stand too", async () => {
    await expect(service.getProjectProgress(CONTEXT, PROJECT)).resolves.toBeDefined();
  });

  it("asks the readiness engine about the release gate specifically", async () => {
    await service.getProjectProgress(CONTEXT, PROJECT);

    expect(technicalReadinessService.getLatestTechnicalReadiness).toHaveBeenCalledWith(
      CONTEXT,
      PROJECT,
      "RELEASE_READY",
    );
  });

  it("reports a gate that was never run as unassessed, not as ready", async () => {
    const { facts } = await service.getProjectProgress(CONTEXT, PROJECT);
    expect(facts.release.gate).toEqual({ assessed: false });
  });

  it("carries a stale verdict through as not current", async () => {
    vi.mocked(technicalReadinessService.getLatestTechnicalReadiness).mockResolvedValue(
      assessed("READY", "STALE") as never,
    );

    const { facts } = await service.getProjectProgress(CONTEXT, PROJECT);
    expect(facts.release.gate).toMatchObject({ assessed: true, status: "READY", current: false });
  });

  /** An UNKNOWN freshness is no more trustworthy than a stale one. */
  it("treats unknown freshness as not current", async () => {
    vi.mocked(technicalReadinessService.getLatestTechnicalReadiness).mockResolvedValue(
      assessed("READY", "UNKNOWN") as never,
    );

    const { facts } = await service.getProjectProgress(CONTEXT, PROJECT);
    expect(facts.release.gate).toMatchObject({ current: false });
  });

  it("counts only the findings that stand in the way — blocking and unknown", async () => {
    vi.mocked(technicalReadinessService.getLatestTechnicalReadiness).mockResolvedValue(
      assessed("NOT_READY", "CURRENT") as never,
    );

    const { facts } = await service.getProjectProgress(CONTEXT, PROJECT);
    expect(facts.release.gate).toMatchObject({ openFindings: 2 });
  });

  it("returns every stage and the one to do next", async () => {
    const progress = await service.getProjectProgress(CONTEXT, PROJECT);

    expect(progress.steps).toHaveLength(6);
    expect(progress.next.stage).toBe("DEFINE");
  });
});
