import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { OrganizationContext } from "@/server/context/organization-context";
import { NotFoundError } from "@/server/errors";
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
 * "What to do next" against real PostgreSQL.
 *
 * The unit tests prove the stage logic given some counts. What they cannot
 * prove is that the counts are right — in particular that "has no check"
 * and "has no proof", written as `none: {}` on a relation, really mean "not
 * one linking row exists". A wrong relation filter here would not throw; it
 * would quietly tell an engineer their project was further along than it
 * is. So this builds a project with a known shape and checks every count.
 */

const modules = databaseAvailable
  ? { service: await import("@/server/services/project-progress.service") }
  : null;

describe.skipIf(!databaseAvailable)(`Project progress against PostgreSQL (${SKIP_REASON})`, () => {
  let tenant: TestTenant;
  let other: TestTenant;

  const ownerContext = (): OrganizationContext => ({
    organizationId: tenant.organizationId,
    actorId: tenant.userId,
  });

  beforeAll(async () => {
    if (!databaseAvailable) return;
    const prisma = integrationPrisma!;

    tenant = await createTestTenant("progress");
    other = await createTestTenant("progress-other");
    const projectId = tenant.projectId;
    const tag = uniqueSuffix("p").replace(/[^a-z0-9]/gi, "").slice(-8);

    await prisma.stakeholderNeed.create({
      data: {
        projectId,
        identifier: `SN-${tag}`,
        title: "Reliable thrust",
        description: "Thrust within limits across the envelope.",
        stakeholder: "Mission",
      },
    });

    // Four requirements: two will get a check, one will not, one is obsolete
    // and must be ignored entirely.
    const [reqChecked1, reqChecked2] = await Promise.all([
      prisma.requirement.create({
        data: { projectId, identifier: `R1-${tag}`, title: "Thrust", statement: "Shall produce 450 kN." },
      }),
      prisma.requirement.create({
        data: { projectId, identifier: `R2-${tag}`, title: "Mass", statement: "Shall weigh under 900 kg." },
      }),
      prisma.requirement.create({
        data: { projectId, identifier: `R3-${tag}`, title: "Unchecked", statement: "Shall survive 20 g." },
      }),
      prisma.requirement.create({
        data: {
          projectId,
          identifier: `R4-${tag}`,
          title: "Retired",
          statement: "No longer applies.",
          status: "OBSOLETE",
        },
      }),
    ]);

    // Two checks: one with proof, one without.
    const [checkProven, checkUnproven] = await Promise.all([
      prisma.verificationActivity.create({
        data: { projectId, identifier: `V1-${tag}`, title: "Hot fire", method: "TEST" },
      }),
      prisma.verificationActivity.create({
        data: { projectId, identifier: `V2-${tag}`, title: "Mass audit", method: "INSPECTION" },
      }),
    ]);

    await prisma.requirementVerificationLink.createMany({
      data: [
        { requirementId: reqChecked1!.id, verificationActivityId: checkProven!.id },
        { requirementId: reqChecked2!.id, verificationActivityId: checkUnproven!.id },
      ],
    });

    const evidence = await prisma.evidence.create({
      data: {
        projectId,
        identifier: `E1-${tag}`,
        title: "Hot fire report",
        evidenceType: "TEST_RESULT",
        sourceReference: "TR-001",
      },
    });
    await prisma.evidenceLink.create({
      data: { evidenceId: evidence.id, verificationActivityId: checkProven!.id },
    });

    // One open change and one closed one — only the open one counts.
    await prisma.changeRequest.createMany({
      data: [
        {
          projectId,
          identifier: `CR1-${tag}`,
          title: "Raise thrust",
          description: "Increase margin.",
          reason: "Payload growth",
          requestedById: tenant.userId,
          status: "SUBMITTED",
        },
        {
          projectId,
          identifier: `CR2-${tag}`,
          title: "Old change",
          description: "Done.",
          reason: "Historic",
          requestedById: tenant.userId,
          status: "IMPLEMENTED",
        },
      ],
    });
  }, 60_000);

  afterAll(async () => {
    if (!databaseAvailable) return;
    if (tenant) await destroyTestTenant(tenant);
    if (other) await destroyTestTenant(other);
    await disconnectIntegrationPrisma();
  });

  it("counts each fact from the real rows", async () => {
    const { counts } = await modules!.service.getProjectProgress(ownerContext(), tenant.projectId);

    expect(counts).toEqual({
      stakeholderNeeds: 1,
      requirements: 3, // the obsolete one is excluded
      requirementsWithoutCheck: 1,
      verificationActivities: 2,
      checksWithoutProof: 1,
      openChanges: 1, // the implemented one is excluded
    });
  });

  it("names the unchecked requirement as the next step, not the missing proof", async () => {
    const { next } = await modules!.service.getProjectProgress(ownerContext(), tenant.projectId);

    expect(next.stage).toBe("PLAN_CHECKS");
    expect(next.status).toBe("1 requirement has no check yet.");
  });

  it("does not let an obsolete requirement count as needing a check", async () => {
    const { counts } = await modules!.service.getProjectProgress(ownerContext(), tenant.projectId);

    // R3 is the only live unchecked one; R4 is obsolete and unchecked too.
    expect(counts.requirementsWithoutCheck).toBe(1);
  });

  it("an empty project is told to write its first requirement", async () => {
    const { next } = await modules!.service.getProjectProgress(
      { organizationId: other.organizationId, actorId: other.userId },
      other.projectId,
    );

    expect(next.stage).toBe("DEFINE");
    expect(next.actionLabel).toBe("Write the first requirement");
  });

  it("404s for a project in another organization, rather than confirming it exists", async () => {
    await expect(
      modules!.service.getProjectProgress(ownerContext(), other.projectId),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
