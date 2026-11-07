// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ForbiddenError } from "@/server/errors";

/**
 * The portfolio read model, against fake repositories. The assertions that
 * matter here are the two this page could most easily get wrong: that a
 * plain member cannot read it at all, and that it invents no figure the
 * underlying rows do not contain.
 */

vi.mock("@/server/repositories/user.repository", () => ({
  getOrganizationRole: vi.fn(),
}));

vi.mock("@/server/repositories/project.repository", () => ({
  listProjectsByOrganization: vi.fn(),
  findProjectInOrganization: vi.fn(),
}));

vi.mock("@/server/repositories/project-membership.repository", () => ({
  findMembership: vi.fn(),
}));

vi.mock("@/server/repositories/portfolio.repository", () => ({
  countsByProject: vi.fn(),
}));

const userRepository = await import("@/server/repositories/user.repository");
const projectRepository = await import("@/server/repositories/project.repository");
const portfolioRepository = await import("@/server/repositories/portfolio.repository");
const service = await import("./portfolio.service");

const CONTEXT: OrganizationContext = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
};

function project(id: string, name: string) {
  return {
    id,
    organizationId: CONTEXT.organizationId,
    name,
    description: null,
    status: "ACTIVE",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-02-01T00:00:00.000Z"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("EXECUTIVE");
  vi.mocked(projectRepository.listProjectsByOrganization).mockResolvedValue([
    project("proj1", "Upper Stage"),
    project("proj2", "Avionics"),
  ] as never);
  vi.mocked(portfolioRepository.countsByProject).mockResolvedValue(
    new Map([
      ["proj1", { openRisks: 3, openIssues: 4, attentionIssues: 1, openSentinel: 2 }],
      ["proj2", { openRisks: 1, openIssues: 0, attentionIssues: 0, openSentinel: 5 }],
    ]),
  );
});

describe("getPortfolio", () => {
  it("refuses a plain member — a legitimate organization member, but not of this", async () => {
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");

    await expect(service.getPortfolio(CONTEXT)).rejects.toBeInstanceOf(ForbiddenError);
    expect(projectRepository.listProjectsByOrganization).not.toHaveBeenCalled();
  });

  it("allows an executive", async () => {
    const portfolio = await service.getPortfolio(CONTEXT);
    expect(portfolio.projects).toHaveLength(2);
  });

  it("allows an owner", async () => {
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("OWNER");
    await expect(service.getPortfolio(CONTEXT)).resolves.toBeDefined();
  });

  it("reads only the caller's own organization, from the session — never a supplied id", async () => {
    await service.getPortfolio(CONTEXT);
    expect(projectRepository.listProjectsByOrganization).toHaveBeenCalledWith(CONTEXT.organizationId);
  });

  it("totals are plain sums of the per-project counts, with nothing weighted or scored", async () => {
    const portfolio = await service.getPortfolio(CONTEXT);

    expect(portfolio.totals).toEqual({
      projects: 2,
      openRisks: 4,
      openIssues: 4,
      attentionIssues: 1,
      openSentinel: 7,
    });
  });

  it("reports zeroes for a project with no counts rather than omitting it", async () => {
    vi.mocked(portfolioRepository.countsByProject).mockResolvedValue(new Map());

    const portfolio = await service.getPortfolio(CONTEXT);

    expect(portfolio.projects).toHaveLength(2);
    expect(portfolio.projects[0]).toMatchObject({
      openRisks: 0,
      openIssues: 0,
      attentionIssues: 0,
      openSentinel: 0,
    });
  });

  it("carries no score, health, or ranking field of any kind", async () => {
    const portfolio = await service.getPortfolio(CONTEXT);

    const serialised = JSON.stringify(portfolio).toLowerCase();
    for (const forbidden of ["score", "health", "rating", "rank", "percent"]) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it("returns an empty portfolio, not an error, for an organization with no projects", async () => {
    vi.mocked(projectRepository.listProjectsByOrganization).mockResolvedValue([]);
    vi.mocked(portfolioRepository.countsByProject).mockResolvedValue(new Map());

    const portfolio = await service.getPortfolio(CONTEXT);

    expect(portfolio.projects).toEqual([]);
    expect(portfolio.totals.projects).toBe(0);
  });
});
