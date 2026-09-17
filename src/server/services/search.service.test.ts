// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrganizationContext } from "@/server/context/organization-context";
import { ValidationError } from "@/server/errors";
import type { SearchRow } from "@/server/repositories/search.repository";

/**
 * Search orchestration, against a faked repository.
 *
 * The assertions that matter are the ones this surface could most easily
 * get wrong: that the caller's reach is resolved from their role rather
 * than from anything in the request, that a project id can only narrow, and
 * that no relevance figure escapes into the payload.
 */

vi.mock("@/server/repositories/search.repository", () => ({ search: vi.fn() }));
vi.mock("./authorization.service", () => ({ hasImplicitProjectAccess: vi.fn() }));

const searchRepository = await import("@/server/repositories/search.repository");
const authorization = await import("./authorization.service");
const service = await import("./search.service");

const CONTEXT: OrganizationContext = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
};

function row(overrides: Partial<SearchRow> = {}): SearchRow {
  return {
    type: "REQUIREMENT",
    id: "req1aaaaaaaaaaaaaaaaaaaa",
    identifier: "REQ-001",
    title: "Thrust vector control authority",
    status: "APPROVED",
    projectId: "proj1aaaaaaaaaaaaaaaaaa",
    projectName: "Upper Stage",
    ownerName: "Ada Lovelace",
    updatedAt: new Date("2026-02-01T00:00:00.000Z"),
    matchKind: "TEXT",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authorization.hasImplicitProjectAccess).mockResolvedValue(false);
  vi.mocked(searchRepository.search).mockResolvedValue([row()]);
});

describe("search", () => {
  it("returns matching records with the fields a reader needs to recognise one", async () => {
    const response = await service.search(CONTEXT, { q: "thrust" });

    expect(response.results).toHaveLength(1);
    expect(response.results[0]).toEqual({
      type: "REQUIREMENT",
      id: "req1aaaaaaaaaaaaaaaaaaaa",
      identifier: "REQ-001",
      title: "Thrust vector control authority",
      status: "APPROVED",
      projectId: "proj1aaaaaaaaaaaaaaaaaa",
      projectName: "Upper Stage",
      ownerName: "Ada Lovelace",
      updatedAt: "2026-02-01T00:00:00.000Z",
      matchKind: "TEXT",
    });
  });

  /**
   * The rule the whole product observes, applied at the one place it is
   * most tempting to break: search has a relevance number, and showing it
   * would be showing an invented figure about an engineering record.
   */
  it("carries no score, rank, relevance or percentage field of any kind", async () => {
    const response = await service.search(CONTEXT, { q: "thrust" });

    const serialised = JSON.stringify(response).toLowerCase();
    for (const forbidden of ["score", "rank", "relevance", "percent", "confidence", "weight"]) {
      expect(serialised).not.toContain(forbidden);
    }
  });

  it("resolves the caller's reach from their role, never from the request", async () => {
    vi.mocked(authorization.hasImplicitProjectAccess).mockResolvedValue(true);

    await service.search(CONTEXT, { q: "thrust" });

    expect(authorization.hasImplicitProjectAccess).toHaveBeenCalledWith(CONTEXT);
    expect(searchRepository.search).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: CONTEXT.organizationId,
        actorId: CONTEXT.actorId,
        hasImplicitProjectAccess: true,
      }),
    );
  });

  it("scopes to the organization on the session, so a search cannot reach another tenant", async () => {
    await service.search(CONTEXT, { q: "thrust", organizationId: "someone-elses-org" }).catch(() => {});

    // The strict schema rejects the extra field outright rather than
    // ignoring it — a silently-dropped tenant id is the shape of a bug.
    expect(searchRepository.search).not.toHaveBeenCalled();
  });

  it("passes a project filter through as a narrowing, not as authorization", async () => {
    await service.search(CONTEXT, { q: "thrust", projectId: "proj9aaaaaaaaaaaaaaaaaa" });

    expect(searchRepository.search).toHaveBeenCalledWith(
      expect.objectContaining({ projectId: "proj9aaaaaaaaaaaaaaaaaa" }),
    );
  });

  it("asks for one more row than it will show, so truncation is observed rather than guessed", async () => {
    await service.search(CONTEXT, { q: "thrust", limit: 5 });

    expect(searchRepository.search).toHaveBeenCalledWith(expect.objectContaining({ limit: 6 }));
  });

  it("reports truncation and returns exactly the requested count", async () => {
    vi.mocked(searchRepository.search).mockResolvedValue([
      row({ id: "a" }),
      row({ id: "b" }),
      row({ id: "c" }),
    ]);

    const response = await service.search(CONTEXT, { q: "thrust", limit: 2 });

    expect(response.results).toHaveLength(2);
    expect(response.truncated).toBe(true);
  });

  it("does not claim truncation when the extra row was not there", async () => {
    const response = await service.search(CONTEXT, { q: "thrust", limit: 2 });
    expect(response.truncated).toBe(false);
  });

  it("echoes the term it actually ran, so the UI cannot disagree with the server", async () => {
    const response = await service.search(CONTEXT, { q: "  thrust  " });
    expect(response.query).toBe("thrust");
  });

  it("rejects a term too short to match usefully, rather than scanning every table", async () => {
    await expect(service.search(CONTEXT, { q: "a" })).rejects.toBeInstanceOf(ValidationError);
    expect(searchRepository.search).not.toHaveBeenCalled();
  });

  it("rejects an unknown field — the schema is strict", async () => {
    await expect(
      service.search(CONTEXT, { q: "thrust", includeArchived: true }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(searchRepository.search).not.toHaveBeenCalled();
  });

  it("clamps an absurd limit rather than honouring it", async () => {
    await expect(service.search(CONTEXT, { q: "thrust", limit: 10_000 })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("returns nothing for a request with no actor, rather than searching as nobody", async () => {
    const response = await service.search({ ...CONTEXT, actorId: null }, { q: "thrust" });

    expect(response.results).toEqual([]);
    expect(searchRepository.search).not.toHaveBeenCalled();
  });

  it("narrows by type when asked", async () => {
    await service.search(CONTEXT, { q: "thrust", types: ["RISK", "ISSUE"] });

    expect(searchRepository.search).toHaveBeenCalledWith(
      expect.objectContaining({ types: ["RISK", "ISSUE"] }),
    );
  });

  it("rejects an unknown entity type rather than silently searching everything", async () => {
    await expect(
      service.search(CONTEXT, { q: "thrust", types: ["NOT_A_REAL_TYPE"] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});
