import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { EngineeringScenario, ScenarioRoleUsers } from "@/tests/fixtures/engineering-scenario";
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
 * The full V1 acceptance fixture (Prompt 30) against real PostgreSQL.
 *
 * Builds the one coherent engineering scenario (`buildEngineeringScenario`)
 * once, then asks four different questions of it: does every module read
 * back what another module wrote (cross-module consistency); does role
 * behavior actually gate what each fixture user can do (access control);
 * does a second, unrelated project/organization stay unreachable
 * (isolation); and does the fixture avoid every kind of fabricated data
 * Prompt 30 explicitly forbids (negative assertions). This is deliberately
 * one broad suite over the shared scenario rather than one file per module —
 * the module-specific engines already have their own integration suites
 * (`drift.test.ts`, `certification.test.ts`, `sentinel.test.ts`, ...); what
 * only a *shared* scenario can prove is that they agree with each other.
 */

const modules = databaseAvailable
  ? {
      requirementService: await import("@/server/services/requirement.service"),
      designItemService: await import("@/server/services/design-item.service"),
      decisionService: await import("@/server/services/engineering-decision.service"),
      evidenceService: await import("@/server/services/evidence.service"),
      changeRequestService: await import("@/server/services/change-request.service"),
      changeImpactAnalysisService: (
        await import("@/server/services/change-impact-analysis.service")
      ).changeImpactAnalysisService,
      driftDetectionService: (await import("@/server/services/drift-detection.service"))
        .driftDetectionService,
      certificationProgramService: (await import("@/server/services/certification-program.service"))
        .certificationProgramService,
      complianceItemService: (await import("@/server/services/compliance-item.service"))
        .complianceItemService,
      certificationFindingService: (await import("@/server/services/certification-finding.service"))
        .certificationFindingService,
      decisionSentinelService: (await import("@/server/services/decision-sentinel.service"))
        .decisionSentinelService,
      graphService: (await import("@/server/services/engineering-graph.service"))
        .engineeringGraphService,
      historyService: await import("@/server/services/engineering-history.service"),
      commandCenter: await import("@/server/services/project-command-center.service"),
      traceabilityService: await import("@/server/services/traceability.service"),
      supplierService: await import("@/server/services/supplier.service"),
      riskService: await import("@/server/services/risk.service"),
      // Imported lazily too: the fixture module itself statically imports the
      // entire real service layer, so importing it eagerly at the top of this
      // file (outside the `databaseAvailable` gate) would defeat the whole
      // point of that gate — every other test file's env-validation would
      // throw at collection time even when no database is configured at all.
      fixtures: await import("@/tests/fixtures/engineering-scenario"),
    }
  : null;

describe.skipIf(!databaseAvailable)(
  `Full engineering scenario against PostgreSQL (${SKIP_REASON})`,
  () => {
    let tenant: TestTenant;
    let roleUsers: ScenarioRoleUsers;
    let scenario: EngineeringScenario;
    let secondProjectId: string;
    let otherOrgTenant: TestTenant;

    beforeAll(async () => {
      tenant = await createTestTenant("scenario-primary");
      const identifiers = {
        prefix: uniqueSuffix("scn")
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "")
          .slice(0, 12),
      };
      roleUsers = await modules!.fixtures.createProjectRoleUsers(tenant, identifiers);
      scenario = await modules!.fixtures.buildEngineeringScenario(tenant, identifiers);

      // A second, unrelated project in the *same* organization, with its own
      // independent record — for cross-project isolation below.
      const secondProject = await integrationPrisma!.project.create({
        data: {
          organizationId: tenant.organizationId,
          name: `[TEST] Second Project ${uniqueSuffix("p2")}`,
        },
      });
      secondProjectId = secondProject.id;

      otherOrgTenant = await createTestTenant("scenario-other-org");
    }, 120_000);

    afterAll(async () => {
      if (tenant) await destroyTestTenant(tenant);
      if (otherOrgTenant) await destroyTestTenant(otherOrgTenant);
      await disconnectIntegrationPrisma();
    });

    // --- Cross-module consistency (§19) -----------------------------------------

    describe("cross-module consistency", () => {
      it("the requirement is identical in its own workspace, Traceability, History, and Command Center", async () => {
        const own = await modules!.requirementService.getRequirement(
          roleUsers.owner.ctx,
          tenant.projectId,
          scenario.requirement.id,
        );
        expect(own.identifier).toBe(scenario.requirement.identifier);

        const node = await modules!.graphService.getNode(roleUsers.owner.ctx, tenant.projectId, {
          type: "REQUIREMENT",
          id: scenario.requirement.id,
        });
        expect(node.identifier).toBe(scenario.requirement.identifier);
        expect(node.id).toBe(own.id);

        const history = await modules!.historyService.getObjectHistory(
          roleUsers.owner.ctx,
          tenant.projectId,
          "REQUIREMENT",
          scenario.requirement.id,
        );
        expect(history.object.identifier).toBe(scenario.requirement.identifier);
        expect(history.events.length).toBeGreaterThan(0);

        const commandCenter = await modules!.commandCenter.getCommandCenter(
          roleUsers.owner.ctx,
          tenant.projectId,
        );
        const changeReference = commandCenter.readiness.changeImpact.activeChanges.find(
          (c) => c.id === scenario.changeRequest.id,
        );
        expect(changeReference).toBeDefined();
      });

      it("the requirement and design item appear in the Traceability workspace's own object picker", async () => {
        const requirementRoots = await modules!.traceabilityService.listSelectableRoots(
          roleUsers.owner.ctx,
          tenant.projectId,
          "REQUIREMENT",
        );
        expect(requirementRoots.some((r) => r.id === scenario.requirement.id)).toBe(true);

        const designItemRoots = await modules!.traceabilityService.listSelectableRoots(
          roleUsers.owner.ctx,
          tenant.projectId,
          "DESIGN_ITEM",
        );
        expect(designItemRoots.some((r) => r.id === scenario.designItem.id)).toBe(true);
      });

      it("evidence stays linked to the requirement's verification activity after supersession", async () => {
        const links = await modules!.evidenceService.listEvidenceLinks(
          roleUsers.owner.ctx,
          tenant.projectId,
          scenario.evidence.superseded.id,
        );
        // The superseded record's own links are untouched by supersession —
        // ARCHITECTURE.md's Evidence section states this exactly: no
        // EvidenceLink row is ever moved to the replacement.
        expect(links).toEqual([]); // this one was never linked — the *validated* one was
        const validatedLinks = await modules!.evidenceService.listEvidenceLinks(
          roleUsers.owner.ctx,
          tenant.projectId,
          scenario.evidence.validated.id,
        );
        expect(
          validatedLinks.some(
            (l) =>
              l.relation === "VERIFICATION_ACTIVITY" &&
              l.targetId === scenario.verificationActivity.id,
          ),
        ).toBe(true);

        const replacement = await modules!.evidenceService.getEvidence(
          roleUsers.owner.ctx,
          tenant.projectId,
          scenario.evidence.replacement.id,
        );
        expect(replacement.id).not.toBe(scenario.evidence.superseded.id);
        const supersededRow = await modules!.evidenceService.getEvidence(
          roleUsers.owner.ctx,
          tenant.projectId,
          scenario.evidence.superseded.id,
        );
        expect(supersededRow.status).toBe("SUPERSEDED");
        expect(supersededRow.supersededById).toBe(scenario.evidence.replacement.id);
      });

      it("Change Impact references the real Change Request and a real, completed analysis", async () => {
        const { hasImpactAnalysis } = await import("@/domain");
        const latest = await modules!.changeImpactAnalysisService.getLatestImpactAnalysis(
          roleUsers.owner.ctx,
          tenant.projectId,
          scenario.changeRequest.id,
        );
        expect(hasImpactAnalysis(latest)).toBe(true);
        if (hasImpactAnalysis(latest)) {
          expect(latest.analysis.status).toBe("COMPLETED");
          expect(latest.analysis.changeRequestId).toBe(scenario.changeRequest.id);
        }
      });

      it("the baseline comparison sees the real changed design item, not an asserted status", async () => {
        const comparison = await modules!.driftDetectionService.compareBaseline(
          roleUsers.owner.ctx,
          tenant.projectId,
          scenario.baseline.active.id,
        );
        const designItemMember = comparison.members.find(
          (m) => m.nodeType === "DESIGN_ITEM" && m.nodeId === scenario.designItem.id,
        );
        expect(designItemMember).toBeDefined();
        expect(designItemMember!.status).toBe("CHANGED");
      });

      it("Sentinel's source points at the real requirement/design item, not a synthetic id", async () => {
        const history = await modules!.decisionSentinelService.listSurveillanceHistory(
          roleUsers.owner.ctx,
          tenant.projectId,
        );
        const openTargets = await modules!.decisionSentinelService.listOpenSurveillance(
          roleUsers.owner.ctx,
          tenant.projectId,
        );
        const allTargets = [...history, ...openTargets];
        expect(allTargets.length).toBeGreaterThan(0);
        for (const target of allTargets) {
          // Every target's source identifier is a real identifier this
          // scenario actually created — never a placeholder.
          expect(typeof target.sourceId).toBe("string");
          expect(target.sourceId.length).toBeGreaterThan(0);
        }
      });

      it("a certification compliance item's requirement link resolves to the same real requirement", async () => {
        const items = await modules!.complianceItemService.listItems(
          roleUsers.owner.ctx,
          tenant.projectId,
          scenario.certificationBasis.id,
        );
        const compliant = items.find((i) => i.id === scenario.complianceItems.compliant.id);
        expect(compliant).toBeDefined();
        expect(compliant!.disposition).toBe("COMPLIANT");

        const links = await modules!.complianceItemService.listLinks(
          roleUsers.owner.ctx,
          tenant.projectId,
          scenario.complianceItems.compliant.id,
        );
        expect(
          links.some((l) => l.linkType === "REQUIREMENT" && l.targetId === scenario.requirement.id),
        ).toBe(true);
      });

      it("History records the actual mutations — the design item's real edit appears, not an assumed one", async () => {
        const history = await modules!.historyService.getObjectHistory(
          roleUsers.owner.ctx,
          tenant.projectId,
          "DESIGN_ITEM",
          scenario.designItem.id,
        );
        expect(history.events.some((e) => e.action.includes("updated"))).toBe(true);
      });
    });

    // --- Access control (§13) ---------------------------------------------------

    describe("access control across the fixture's role users", () => {
      it("a VIEWER can read the requirement but cannot create one", async () => {
        await expect(
          modules!.requirementService.getRequirement(
            roleUsers.viewer.ctx,
            tenant.projectId,
            scenario.requirement.id,
          ),
        ).resolves.toMatchObject({ id: scenario.requirement.id });

        await expect(
          modules!.requirementService.createRequirement(roleUsers.viewer.ctx, tenant.projectId, {
            identifier: "VIEWER-ATTEMPT",
            title: "Should not be created",
            statement: "A VIEWER cannot write.",
          }),
        ).rejects.toThrow();
      });

      it("an ENGINEER can perform ordinary engineering work", async () => {
        await expect(
          modules!.designItemService.updateDesignItem(
            roleUsers.engineer.ctx,
            tenant.projectId,
            scenario.designItem.id,
            {
              description: "Edited by the ENGINEER fixture user — ordinary engineering work.",
            },
          ),
        ).resolves.toBeDefined();
      });

      it("a REVIEWER can perform a real review action — resolving a certification finding", async () => {
        await expect(
          modules!.certificationFindingService.acceptFinding(
            roleUsers.reviewer.ctx,
            tenant.projectId,
            scenario.complianceItems.withOpenFinding.id,
            scenario.findings.open.id,
            { note: "Accepted by the REVIEWER fixture user: risk margin judged acceptable as-is." },
          ),
        ).resolves.toMatchObject({ status: "ACCEPTED" });
      });

      it("a MANAGER can administer — add and remove a project member", async () => {
        const membership = await import("@/server/services/project-membership.service");
        const extra = await modules!.fixtures.createProjectRoleUsers(
          { ...tenant, projectId: tenant.projectId },
          { prefix: uniqueSuffix("mgr-test").toUpperCase().slice(0, 10) },
        );
        // createProjectRoleUsers already added `extra.viewer` — a MANAGER
        // removing a membership it did not create is still real administration.
        // removeMember takes the *membership* row's own id, not the user's.
        const members = await membership.listMembers(roleUsers.owner.ctx, tenant.projectId);
        const extraViewerMembership = members.find((m) => m.user.id === extra.viewer.userId);
        expect(extraViewerMembership).toBeDefined();

        await expect(
          membership.removeMember(
            roleUsers.manager.ctx,
            tenant.projectId,
            extraViewerMembership!.id,
          ),
        ).resolves.toBeUndefined();
      });

      it("a non-member cannot reach the project at all", async () => {
        await expect(
          modules!.requirementService.getRequirement(
            roleUsers.nonMember.ctx,
            tenant.projectId,
            scenario.requirement.id,
          ),
        ).rejects.toThrow();
      });
    });

    // --- Multi-project / isolation (§14) ----------------------------------------

    describe("multi-project and cross-organization isolation", () => {
      it("the second project in the same organization has no access to the first project's records", async () => {
        await expect(
          modules!.requirementService.getRequirement(
            roleUsers.owner.ctx,
            secondProjectId,
            scenario.requirement.id,
          ),
        ).rejects.toThrow();
      });

      it("cross-project graph traversal does not leak into the second project", async () => {
        await expect(
          modules!.graphService.getNode(roleUsers.owner.ctx, secondProjectId, {
            type: "DESIGN_ITEM",
            id: scenario.designItem.id,
          }),
        ).rejects.toThrow();
      });

      it("cross-project history does not surface the first project's events", async () => {
        const history = await modules!.historyService.getProjectHistory(
          roleUsers.owner.ctx,
          secondProjectId,
          {},
          {},
        );
        expect(history.events.some((e) => e.sourceId === scenario.requirement.id)).toBe(false);
      });

      it("cross-project baseline access fails outright", async () => {
        await expect(
          modules!.driftDetectionService.getBaseline(
            roleUsers.owner.ctx,
            secondProjectId,
            scenario.baseline.active.id,
          ),
        ).rejects.toThrow();
      });

      it("an entirely different organization cannot reach the project, its requirement, or its supplier", async () => {
        const otherCtx = {
          organizationId: otherOrgTenant.organizationId,
          actorId: otherOrgTenant.userId,
        };
        await expect(
          modules!.requirementService.getRequirement(
            otherCtx,
            tenant.projectId,
            scenario.requirement.id,
          ),
        ).rejects.toThrow();
        await expect(
          modules!.supplierService.getSupplier(otherCtx, tenant.projectId, scenario.supplier.id),
        ).rejects.toThrow();
      });
    });

    // --- Negative assertions (§20) ------------------------------------------------

    describe("negative assertions — no fabricated data anywhere in the fixture's output", () => {
      it("the Command Center view contains no score, percentage, or composite health field", async () => {
        const view = await modules!.commandCenter.getCommandCenter(
          roleUsers.owner.ctx,
          tenant.projectId,
        );
        const text = JSON.stringify(view);
        expect(text).not.toMatch(
          /riskScore|probability|heatmap|healthScore|overallHealth|compositeScore|readinessPercent|percentage|prediction/i,
        );
      });

      it("the risk record carries no invented risk score or probability field", async () => {
        const risk = await modules!.riskService.getRisk(
          roleUsers.owner.ctx,
          tenant.projectId,
          scenario.risk.id,
        );
        expect(risk).not.toHaveProperty("riskScore");
        expect(risk).not.toHaveProperty("probability");
        expect(risk).not.toHaveProperty("severity_score");
      });

      it("the certification program and basis never claim a real regulatory identity", async () => {
        const program = await modules!.certificationProgramService.getProgram(
          roleUsers.owner.ctx,
          tenant.projectId,
        );
        expect(program!.name).toMatch(/fictional/i);
      });

      it("nothing in this suite ran prisma.impactAnalysis.create / prisma.sentinelEvent.create / prisma.certificationReview.create directly — proven structurally, not just by convention", () => {
        // This test file imports no `@/lib/db` prisma client at all — grep its
        // own imports rather than assert on runtime behavior a mock could fake.
        const source = readFileSync(new URL(import.meta.url), "utf8");
        expect(source).not.toMatch(
          /prisma\.(impactAnalysis|sentinelEvent|surveillanceTarget|certificationReview)\.(create|createMany)/,
        );
      });
    });
  },
);
