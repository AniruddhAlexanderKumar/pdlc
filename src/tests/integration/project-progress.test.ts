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
 * "Where is this project?" against real PostgreSQL.
 *
 * The unit tests prove the stage rules given some facts. What they cannot
 * prove is that the facts are right: that `groupBy` sees every status, that
 * "has no check" written as `none: {}` on a relation really means "not one
 * linking row exists", and that retired records are left out. A wrong
 * filter here would not throw — it would quietly tell an engineer their
 * project was further along than it is. So this builds a project whose
 * every stage has a known answer, and checks each.
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
    const id = (prefix: string) => `${prefix}-${tag}`;

    await prisma.stakeholderNeed.create({
      data: {
        projectId,
        identifier: id("SN1"),
        title: "Reliable thrust",
        description: "Thrust within limits across the envelope.",
        stakeholder: "Mission",
      },
    });

    // Define: three live drafts (two checked, one not) and one retired.
    const [reqA, reqB] = await Promise.all([
      prisma.requirement.create({ data: { projectId, identifier: id("R1"), title: "Thrust", statement: "Shall produce 450 kN." } }),
      prisma.requirement.create({ data: { projectId, identifier: id("R2"), title: "Mass", statement: "Shall weigh under 900 kg." } }),
      prisma.requirement.create({ data: { projectId, identifier: id("R3"), title: "Unchecked", statement: "Shall survive 20 g." } }),
      prisma.requirement.create({
        data: { projectId, identifier: id("R4"), title: "Retired", statement: "No longer applies.", status: "OBSOLETE" },
      }),
    ]);

    // Design and Decide: one draft each, plus a retired decision that must not count.
    await prisma.designItem.create({
      data: { projectId, identifier: id("DI1"), name: "Combustion chamber", itemType: "COMPONENT" },
    });
    await prisma.engineeringDecision.createMany({
      data: [
        { projectId, identifier: id("ED1"), title: "Cooling", statement: "Regenerative cooling.", rationale: "Heat flux." },
        {
          projectId,
          identifier: id("ED2"),
          title: "Rejected",
          statement: "Ablative liner.",
          rationale: "Mass.",
          status: "REJECTED",
        },
      ],
    });

    // Verify: two passed checks, only one with proof.
    const [proven, unproven] = await Promise.all([
      prisma.verificationActivity.create({
        data: { projectId, identifier: id("V1"), title: "Hot fire", method: "TEST", status: "PASSED" },
      }),
      prisma.verificationActivity.create({
        data: { projectId, identifier: id("V2"), title: "Mass audit", method: "INSPECTION", status: "PASSED" },
      }),
    ]);
    await prisma.requirementVerificationLink.createMany({
      data: [
        { requirementId: reqA!.id, verificationActivityId: proven!.id },
        { requirementId: reqB!.id, verificationActivityId: unproven!.id },
      ],
    });
    const evidence = await prisma.evidence.create({
      data: { projectId, identifier: id("E1"), title: "Hot fire report", evidenceType: "TEST_RESULT", sourceReference: "TR-001" },
    });
    await prisma.evidenceLink.create({ data: { evidenceId: evidence.id, verificationActivityId: proven!.id } });

    // Control: one change awaiting review, one finished; one open risk and one accepted; one resolved issue.
    await prisma.changeRequest.createMany({
      data: [
        {
          projectId,
          identifier: id("CR1"),
          title: "Raise thrust",
          description: "Increase margin.",
          reason: "Payload growth",
          requestedById: tenant.userId,
          status: "SUBMITTED",
        },
        {
          projectId,
          identifier: id("CR2"),
          title: "Old change",
          description: "Done.",
          reason: "Historic",
          requestedById: tenant.userId,
          status: "IMPLEMENTED",
        },
      ],
    });
    await prisma.risk.createMany({
      data: [
        { projectId, identifier: id("RK1"), title: "Supplier slip", description: "Valve late." },
        { projectId, identifier: id("RK2"), title: "Known limit", description: "Accepted margin.", status: "ACCEPTED" },
      ],
    });
    await prisma.issue.create({
      data: { projectId, identifier: id("IS1"), title: "Leak", description: "Found and fixed.", status: "RESOLVED" },
    });

    // Release: a locked version of the design, and no release check run.
    await prisma.engineeringBaseline.create({
      data: { projectId, identifier: id("BL1"), name: "Design freeze", status: "ACTIVE" },
    });
  }, 60_000);

  afterAll(async () => {
    if (!databaseAvailable) return;
    if (tenant) await destroyTestTenant(tenant);
    if (other) await destroyTestTenant(other);
    await disconnectIntegrationPrisma();
  });

  it("counts every fact from the real rows, leaving retired records out", async () => {
    const { facts } = await modules!.service.getProjectProgress(ownerContext(), tenant.projectId);

    expect(facts).toEqual({
      stakeholderNeeds: { total: 1, draft: 1 },
      requirements: { total: 3, draft: 3, inReview: 0, withoutCheck: 1 }, // the obsolete one is excluded
      designItems: { total: 1, draft: 1, inReview: 0 },
      decisions: { total: 1, proposed: 1, underReview: 0 }, // the rejected one is excluded
      checks: { total: 2, notRun: 0, failed: 0, passedWithoutProof: 1 },
      control: {
        draftChanges: 0,
        changesAwaitingReview: 1,
        openRisks: 1, // the accepted risk has been dealt with
        openIssues: 0,
        everRecorded: 5,
      },
      release: { activeBaseline: true, draftBaseline: false, gate: { assessed: false } },
    });
  });

  it("puts the change waiting for review first, because a person is waiting on it", async () => {
    const { next } = await modules!.service.getProjectProgress(ownerContext(), tenant.projectId);

    expect(next.stage).toBe("CONTROL");
    expect(next.state).toBe("NEEDS_REVIEW");
  });

  it("reports the release stage as in progress, not ready, when the check has never been run", async () => {
    const { steps } = await modules!.service.getProjectProgress(ownerContext(), tenant.projectId);
    const release = steps.find((step) => step.stage === "RELEASE")!;

    expect(release.state).toBe("IN_PROGRESS");
    expect(release.facts).toContain("The release check has not been run.");
  });

  it("tells an empty project to write its first requirement", async () => {
    const { next } = await modules!.service.getProjectProgress(
      { organizationId: other.organizationId, actorId: other.userId },
      other.projectId,
    );

    expect(next.stage).toBe("DEFINE");
    expect(next.actionLabel).toBe("Write the first requirement");
  });

  it("404s for a project in another organization, rather than confirming it exists", async () => {
    await expect(modules!.service.getProjectProgress(ownerContext(), other.projectId)).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });
});
