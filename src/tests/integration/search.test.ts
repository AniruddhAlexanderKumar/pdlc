import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { OrganizationContext } from "@/server/context/organization-context";
import {
  SKIP_REASON,
  type TestTenant,
  createTestTenant,
  databaseAvailable,
  destroyTestTenant,
  disconnectIntegrationPrisma,
  integrationPrisma,
  uniqueSuffix,
} from "./setup";

/**
 * Search against real PostgreSQL.
 *
 * The unit suite fakes the repository, so it proves the orchestration and
 * nothing about the query. Everything that actually protects a tenant here
 * lives *in* that query — the `readable` CTE, the inner joins onto it, the
 * `pg_trgm` similarity, the full-text expressions matching their indexes —
 * and none of it can be exercised without a real database.
 *
 * The isolation cases are the point. A search that returned one row it
 * should not have would be a cross-tenant data leak, and it is exactly the
 * kind of defect that a faked repository cannot catch and a hand-written
 * `UNION ALL` across eighteen tables makes easy to introduce: one branch
 * missing its join is enough.
 */

const modules = databaseAvailable
  ? {
      searchService: await import("@/server/services/search.service"),
      requirementService: await import("@/server/services/requirement.service"),
      projectMembership: await import("@/server/services/project-membership.service"),
    }
  : null;

describe.skipIf(!databaseAvailable)(`Search against PostgreSQL (${SKIP_REASON})`, () => {
  let tenantA: TestTenant;
  let tenantB: TestTenant;
  /** A second project inside tenant A, which the member below is never added to. */
  let projectA2: string;
  let memberId: string;
  let executiveId: string;
  let term: string;

  const ownerContext = (): OrganizationContext => ({
    organizationId: tenantA.organizationId,
    actorId: tenantA.userId,
  });
  const memberContext = (): OrganizationContext => ({
    organizationId: tenantA.organizationId,
    actorId: memberId,
  });
  const executiveContext = (): OrganizationContext => ({
    organizationId: tenantA.organizationId,
    actorId: executiveId,
  });

  beforeAll(async () => {
    if (!databaseAvailable || !modules) return;
    const prisma = integrationPrisma!;

    tenantA = await createTestTenant("search-a");
    tenantB = await createTestTenant("search-b");

    // A distinctive term, so nothing else in a shared development database
    // can satisfy these assertions by accident.
    term = `zorblat${uniqueSuffix("t").replace(/[^a-z0-9]/gi, "")}`;

    const second = await prisma.project.create({
      data: { organizationId: tenantA.organizationId, name: "[TEST] Second project" },
    });
    projectA2 = second.id;

    const member = await prisma.user.create({
      data: {
        email: `${uniqueSuffix("member")}@test.invalid`,
        name: "Project Member",
        role: "ENGINEER",
        organizationId: tenantA.organizationId,
        organizationRole: "MEMBER",
      },
    });
    memberId = member.id;

    const executive = await prisma.user.create({
      data: {
        email: `${uniqueSuffix("exec")}@test.invalid`,
        name: "Org Executive",
        role: "VIEWER",
        organizationId: tenantA.organizationId,
        organizationRole: "EXECUTIVE",
      },
    });
    executiveId = executive.id;

    // The member reaches the first project only — never the second.
    await modules.projectMembership.addMember(ownerContext(), tenantA.projectId, {
      userId: memberId,
      role: "ENGINEER",
    });

    // One requirement carrying the term in each of the three projects.
    await modules.requirementService.createRequirement(ownerContext(), tenantA.projectId, {
      identifier: "SEARCH-REQ-001",
      title: `Primary ${term} requirement`,
      statement: `The system shall maintain ${term} within limits.`,
    });
    await modules.requirementService.createRequirement(ownerContext(), projectA2, {
      identifier: "SEARCH-REQ-002",
      title: `Second project ${term} requirement`,
      statement: `The system shall record ${term}.`,
    });
    await modules.requirementService.createRequirement(
      { organizationId: tenantB.organizationId, actorId: tenantB.userId },
      tenantB.projectId,
      {
        identifier: "SEARCH-REQ-003",
        title: `Other tenant ${term} requirement`,
        statement: `Another organization's ${term} record entirely.`,
      },
    );
  }, 60_000);

  afterAll(async () => {
    if (!databaseAvailable) return;
    if (tenantA) await destroyTestTenant(tenantA);
    if (tenantB) await destroyTestTenant(tenantB);
    await disconnectIntegrationPrisma();
  });

  describe("tenant isolation", () => {
    it("never returns another organization's record, however well it matches", async () => {
      const response = await modules!.searchService.search(ownerContext(), { q: term });

      expect(response.results.length).toBeGreaterThan(0);
      for (const result of response.results) {
        expect(result.projectId).not.toBe(tenantB.projectId);
      }
      expect(response.results.map((r) => r.identifier)).not.toContain("SEARCH-REQ-003");
    });

    /**
     * Searching another tenant's exact identifier does not come back empty,
     * and should not: `SEARCH-REQ-003` is one character from this tenant's
     * own `SEARCH-REQ-001`, so trigram matching offers those — which is the
     * whole point of fuzzy identifier search. What must hold is narrower and
     * more important: the record that matched *perfectly* is invisible,
     * because it belongs to someone else.
     */
    it("offers this tenant's similar identifiers but never the other tenant's exact one", async () => {
      const response = await modules!.searchService.search(ownerContext(), { q: "SEARCH-REQ-003" });

      expect(response.results.map((result) => result.identifier)).not.toContain("SEARCH-REQ-003");
      expect(response.results.every((result) => result.matchKind !== "IDENTIFIER_EXACT")).toBe(true);
      for (const result of response.results) {
        expect(result.projectId).not.toBe(tenantB.projectId);
      }
    });
  });

  describe("project reach", () => {
    it("an owner reaches every project in their organization without a membership row", async () => {
      const response = await modules!.searchService.search(ownerContext(), { q: term });
      const projects = new Set(response.results.map((result) => result.projectId));

      expect(projects.has(tenantA.projectId)).toBe(true);
      expect(projects.has(projectA2)).toBe(true);
    });

    it("an executive reaches every project too — the implicit VIEWER grant", async () => {
      const response = await modules!.searchService.search(executiveContext(), { q: term });
      const projects = new Set(response.results.map((result) => result.projectId));

      expect(projects.has(tenantA.projectId)).toBe(true);
      expect(projects.has(projectA2)).toBe(true);
    });

    /** The case a post-filter would get wrong, and the reason the join is in the query. */
    it("a member sees only the project they were actually added to", async () => {
      const response = await modules!.searchService.search(memberContext(), { q: term });

      expect(response.results.length).toBeGreaterThan(0);
      for (const result of response.results) {
        expect(result.projectId).toBe(tenantA.projectId);
      }
      expect(response.results.map((r) => r.identifier)).not.toContain("SEARCH-REQ-002");
    });

    it("a project filter narrows, and cannot widen past what the member may read", async () => {
      const response = await modules!.searchService.search(memberContext(), {
        q: term,
        projectId: projectA2,
      });

      // Asking for a project they cannot read returns nothing — never a 403,
      // which would confirm that the project exists.
      expect(response.results).toEqual([]);
    });
  });

  describe("matching", () => {
    it("finds a record by an exact identifier and says that is how it matched", async () => {
      const response = await modules!.searchService.search(ownerContext(), { q: "SEARCH-REQ-001" });

      expect(response.results[0]?.identifier).toBe("SEARCH-REQ-001");
      expect(response.results[0]?.matchKind).toBe("IDENTIFIER_EXACT");
    });

    it("matches an identifier regardless of case", async () => {
      const response = await modules!.searchService.search(ownerContext(), { q: "search-req-001" });

      expect(response.results[0]?.identifier).toBe("SEARCH-REQ-001");
      expect(response.results[0]?.matchKind).toBe("IDENTIFIER_EXACT");
    });

    /** The pg_trgm case from the brief: a half-remembered identifier still resolves. */
    it("finds REQ-001 when asked for REQ-1", async () => {
      const response = await modules!.searchService.search(ownerContext(), { q: "SEARCH-REQ-1" });

      expect(response.results.map((result) => result.identifier)).toContain("SEARCH-REQ-001");
    });

    it("finds a record by words in its body text, not only its title", async () => {
      const response = await modules!.searchService.search(ownerContext(), {
        q: `${term} limits`,
      });

      expect(response.results.map((result) => result.identifier)).toContain("SEARCH-REQ-001");
    });

    it("carries the project name and status a reader needs to tell two matches apart", async () => {
      const response = await modules!.searchService.search(ownerContext(), { q: "SEARCH-REQ-001" });
      const result = response.results[0]!;

      expect(result.projectName).toContain("[TEST]");
      expect(result.status).toBe("DRAFT");
      expect(result.type).toBe("REQUIREMENT");
    });

    it("narrows by entity type", async () => {
      const asRisks = await modules!.searchService.search(ownerContext(), {
        q: term,
        types: ["RISK"],
      });
      expect(asRisks.results).toEqual([]);

      const asRequirements = await modules!.searchService.search(ownerContext(), {
        q: term,
        types: ["REQUIREMENT"],
      });
      expect(asRequirements.results.length).toBeGreaterThan(0);
    });

    it("returns the same order twice for unchanged data", async () => {
      const first = await modules!.searchService.search(ownerContext(), { q: term });
      const second = await modules!.searchService.search(ownerContext(), { q: term });

      expect(second.results.map((r) => r.id)).toEqual(first.results.map((r) => r.id));
    });

    it("returns nothing, rather than everything, for a term that matches nothing", async () => {
      const response = await modules!.searchService.search(ownerContext(), {
        q: "qqzzxx-no-such-token",
      });
      expect(response.results).toEqual([]);
    });
  });
});
