import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { IMPACT_ENGINE_VERSION, analysisSignature, hasImpactAnalysis } from "@/domain";
import {
  SKIP_REASON,
  type TestTenant,
  createTestTenant,
  databaseAvailable,
  destroyTestTenant,
  disconnectIntegrationPrisma,
  integrationPrisma,
} from "./setup";

/**
 * The impact engine against real PostgreSQL.
 *
 * The unit suite drives the engine over an in-memory graph, so it proves the
 * policy and the classification but nothing about persistence. This runs the
 * real path end to end: a real project graph, a real change with real declared
 * impacts, the real graph traversal, and the real analysis/finding rows —
 * including the array and JSON columns, the composite unique keys, the
 * cascades, the freshness fingerprint and the audit row.
 */

const modules = databaseAvailable
  ? {
      impact: await import("@/server/services/change-impact-analysis.service"),
      graph: await import("@/server/services/engineering-graph.service"),
      graphRepo: await import("@/server/repositories/graph-repository"),
      analysisRepo: await import("@/server/repositories/impact-analysis.repository"),
      revision: await import("@/server/repositories/project-revision.repository"),
      audit: await import("@/server/repositories/audit-log.repository"),
    }
  : null;

describe.skipIf(!databaseAvailable)(`impact analysis against PostgreSQL (${SKIP_REASON})`, () => {
  const prisma = integrationPrisma!;

  let tenant: TestTenant;
  let otherTenant: TestTenant;
  let context: { organizationId: string; actorId: string };
  let service: InstanceType<
    typeof import("@/server/services/change-impact-analysis.service").ChangeImpactAnalysisService
  >;

  const ids = {
    need: "",
    requirement: "",
    designItem: "",
    interfaceDefinition: "",
    verification: "",
    decision: "",
    assumption: "",
    expectation: "",
    risk: "",
    changeRequest: "",
    requirementImpact: "",
    foreignChange: "",
  };

  beforeAll(async () => {
    tenant = await createTestTenant("impact");
    otherTenant = await createTestTenant("impact-other");
    context = { organizationId: tenant.organizationId, actorId: tenant.userId };

    // The engine reads the graph through the real service, which reads the real
    // repository — bound here to the integration client.
    service = new modules!.impact.ChangeImpactAnalysisService(
      new modules!.graph.EngineeringGraphService(
        new modules!.graphRepo.EngineeringGraphRepository(prisma),
      ),
    );

    const projectId = tenant.projectId;

    //   SN-1 ─▶ REQ-1 ─┬─allocated▶ DI-1 ─provides▶ IF-1
    //                  ├─verified by▶ VA-1
    //                  └─linked to──▶ ED-1 ─┬─assumption▶
    //                                       └─expectation▶
    //   RISK-1 ─affects▶ REQ-1
    const need = await prisma.stakeholderNeed.create({
      data: {
        projectId,
        identifier: "SN-001",
        title: "Survive ascent loads",
        description: "The vehicle must survive max q.",
        stakeholder: "Chief Engineer",
      },
    });
    ids.need = need.id;

    const requirement = await prisma.requirement.create({
      data: {
        projectId,
        identifier: "REQ-001",
        title: "Maximum chamber pressure",
        statement: "The engine shall not exceed 120 bar.",
      },
    });
    ids.requirement = requirement.id;

    const designItem = await prisma.designItem.create({
      data: {
        projectId,
        identifier: "DI-001",
        name: "Combustion chamber",
        itemType: "COMPONENT",
      },
    });
    ids.designItem = designItem.id;

    const interfaceDefinition = await prisma.interfaceDefinition.create({
      data: {
        projectId,
        identifier: "IF-001",
        name: "Chamber to injector flange",
        interfaceType: "MECHANICAL",
      },
    });
    ids.interfaceDefinition = interfaceDefinition.id;

    const verification = await prisma.verificationActivity.create({
      data: { projectId, identifier: "VA-001", title: "Hot fire test", method: "TEST" },
    });
    ids.verification = verification.id;

    const decision = await prisma.engineeringDecision.create({
      data: {
        projectId,
        identifier: "ED-001",
        title: "Use regenerative cooling",
        statement: "The chamber will be regeneratively cooled.",
        rationale: "Ablative liner mass was prohibitive.",
      },
    });
    ids.decision = decision.id;

    const assumption = await prisma.decisionAssumption.create({
      data: {
        engineeringDecisionId: decision.id,
        statement: "Coolant flow stays above 2.4 kg/s.",
      },
    });
    ids.assumption = assumption.id;

    const expectation = await prisma.decisionExpectation.create({
      data: {
        engineeringDecisionId: decision.id,
        statement: "Wall temperature stays below the material limit.",
      },
    });
    ids.expectation = expectation.id;

    const risk = await prisma.risk.create({
      data: {
        projectId,
        identifier: "RISK-001",
        title: "Coolant channel blockage",
        description: "Debris could block a channel.",
      },
    });
    ids.risk = risk.id;

    await prisma.needRequirementLink.create({
      data: {
        stakeholderNeedId: need.id,
        requirementId: requirement.id,
        createdById: tenant.userId,
      },
    });
    await prisma.requirementDesignLink.create({
      data: {
        requirementId: requirement.id,
        designItemId: designItem.id,
        linkType: "ALLOCATED_TO",
        createdById: tenant.userId,
      },
    });
    await prisma.designInterfaceLink.create({
      data: {
        designItemId: designItem.id,
        interfaceDefinitionId: interfaceDefinition.id,
        linkType: "PROVIDES",
        createdById: tenant.userId,
      },
    });
    await prisma.requirementVerificationLink.create({
      data: {
        requirementId: requirement.id,
        verificationActivityId: verification.id,
        createdById: tenant.userId,
      },
    });
    await prisma.requirementDecisionLink.create({
      data: {
        requirementId: requirement.id,
        engineeringDecisionId: decision.id,
        linkType: "DECISION_ADDRESSES_REQUIREMENT",
        createdById: tenant.userId,
      },
    });
    await prisma.riskRequirementLink.create({
      data: { riskId: risk.id, requirementId: requirement.id, createdById: tenant.userId },
    });

    const changeRequest = await prisma.changeRequest.create({
      data: {
        projectId,
        identifier: "CR-001",
        title: "Raise the pressure limit",
        description: "Raise the chamber pressure limit to 130 bar.",
        reason: "Performance shortfall.",
        requestedById: tenant.userId,
      },
    });
    ids.changeRequest = changeRequest.id;

    const impact = await prisma.changeRequestImpact.create({
      data: {
        changeRequestId: changeRequest.id,
        requirementId: requirement.id,
        note: "The limit is stated here.",
        createdById: tenant.userId,
      },
    });
    ids.requirementImpact = impact.id;

    // A change in the other tenant, to prove analyses do not leak across.
    const foreignChange = await prisma.changeRequest.create({
      data: {
        projectId: otherTenant.projectId,
        identifier: "CR-900",
        title: "Someone else's change",
        description: "Not ours.",
        reason: "Not ours.",
        requestedById: otherTenant.userId,
      },
    });
    ids.foreignChange = foreignChange.id;
  });

  afterAll(async () => {
    if (tenant) await destroyTestTenant(tenant);
    if (otherTenant) await destroyTestTenant(otherTenant);
    await disconnectIntegrationPrisma();
  });

  describe("running an analysis", () => {
    it("persists the analysis, its roots and its findings", async () => {
      const report = await service.runImpactAnalysis(
        context,
        tenant.projectId,
        ids.changeRequest,
      );

      const stored = await prisma.impactAnalysis.findUniqueOrThrow({
        where: { id: report.analysis.id },
      });
      expect(stored.status).toBe("COMPLETED");
      expect(stored.engineVersion).toBe(IMPACT_ENGINE_VERSION);
      expect(stored.sourceFingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(stored.completedAt).not.toBeNull();
      expect(stored.requestedById).toBe(tenant.userId);

      const rootRows = await prisma.impactAnalysisRoot.count({
        where: { analysisId: report.analysis.id },
      });
      const findingRows = await prisma.impactFinding.count({
        where: { analysisId: report.analysis.id },
      });
      expect(rootRows).toBe(1);
      expect(findingRows).toBeGreaterThan(1);
      // The summary must describe the rows actually written.
      expect(stored.findingCount).toBe(findingRows);
    });

    it("links the root back to the declared impact it came from", async () => {
      const report = await service.runImpactAnalysis(
        context,
        tenant.projectId,
        ids.changeRequest,
      );

      expect(report.roots).toHaveLength(1);
      expect(report.roots[0]?.declaredImpactId).toBe(ids.requirementImpact);
      expect(report.roots[0]?.node).toEqual({ type: "REQUIREMENT", id: ids.requirement });
    });

    it("reaches the real graph across domains", async () => {
      const report = await service.runImpactAnalysis(
        context,
        tenant.projectId,
        ids.changeRequest,
      );

      const byId = new Map(report.findings.map((f) => [f.node.id, f]));

      expect(byId.get(ids.requirement)?.classification).toBe("DIRECT");
      expect(byId.get(ids.designItem)?.classification).toBe("CROSS_DOMAIN");
      expect(byId.get(ids.verification)?.classification).toBe("CROSS_DOMAIN");
      expect(byId.get(ids.decision)?.classification).toBe("CROSS_DOMAIN");
      // Two hops out, through the design item.
      expect(byId.get(ids.interfaceDefinition)?.depth).toBe(2);
      // Decision memory is reached, ready for a later readiness engine.
      expect(byId.get(ids.assumption)).toBeDefined();
      expect(byId.get(ids.expectation)).toBeDefined();
    });

    it("stores provenance that cites the real relationship rows", async () => {
      const report = await service.runImpactAnalysis(
        context,
        tenant.projectId,
        ids.changeRequest,
      );

      const finding = report.findings.find((f) => f.node.id === ids.interfaceDefinition)!;
      expect(finding.path).toHaveLength(2);
      expect(finding.path[0]?.edgeType).toBe("REQUIREMENT_ALLOCATED_TO_DESIGN");
      expect(finding.path[1]?.edgeType).toBe("DESIGN_CONNECTS_INTERFACE");

      // Every cited relationship id is a row that genuinely exists.
      const allocation = await prisma.requirementDesignLink.findUnique({
        where: { id: finding.path[0]!.relationshipId },
      });
      expect(allocation).not.toBeNull();
    });

    it("round-trips the basis array and the path JSON", async () => {
      const report = await service.runImpactAnalysis(
        context,
        tenant.projectId,
        ids.changeRequest,
      );

      const assumption = report.findings.find((f) => f.node.id === ids.assumption)!;
      expect(assumption.basis).toContain("ASSUMPTION_PRESENT");
      expect(assumption.basis).toContain("ASSUMPTION_VALIDITY_NOT_EVALUATED");

      const verification = report.findings.find((f) => f.node.id === ids.verification)!;
      expect(verification.basis).toContain("VERIFICATION_OUTCOME_NOT_EVALUATED");
      expect(verification.status).toBe("POTENTIALLY_AFFECTED");
    });

    it("surfaces the risk as context, not as impact", async () => {
      const report = await service.runImpactAnalysis(
        context,
        tenant.projectId,
        ids.changeRequest,
      );

      const risk = report.findings.find((f) => f.node.id === ids.risk)!;
      expect(risk.classification).toBe("UPSTREAM_CONTEXT");
      expect(risk.status).toBe("NOT_EVALUATED");
    });

    it("refuses a second finding for the same object in one analysis", async () => {
      const report = await service.runImpactAnalysis(
        context,
        tenant.projectId,
        ids.changeRequest,
      );

      // The composite unique key is what guarantees one finding per object.
      await expect(
        prisma.impactFinding.create({
          data: {
            analysisId: report.analysis.id,
            rootId: report.roots[0]!.id,
            nodeType: "REQUIREMENT",
            nodeId: ids.requirement,
            label: "Duplicate",
            classification: "DOWNSTREAM",
            status: "POTENTIALLY_AFFECTED",
            depth: 1,
            basis: [],
            path: [],
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe("history and retrieval", () => {
    it("keeps every run and returns the newest as latest", async () => {
      const first = await service.runImpactAnalysis(context, tenant.projectId, ids.changeRequest);
      const second = await service.runImpactAnalysis(context, tenant.projectId, ids.changeRequest);

      expect(second.analysis.id).not.toBe(first.analysis.id);

      const history = await service.listImpactAnalyses(
        context,
        tenant.projectId,
        ids.changeRequest,
      );
      expect(history.length).toBeGreaterThanOrEqual(2);
      expect(history[0]?.id).toBe(second.analysis.id);

      const latest = await service.getLatestImpactAnalysis(
        context,
        tenant.projectId,
        ids.changeRequest,
      );
      expect(hasImpactAnalysis(latest) && latest.analysis.id).toBe(second.analysis.id);

      // The earlier run is still readable in full.
      const older = await service.getImpactAnalysis(
        context,
        tenant.projectId,
        first.analysis.id,
      );
      expect(older.analysis.id).toBe(first.analysis.id);
      expect(older.findings.length).toBeGreaterThan(0);
    });

    it("produces an equivalent result on an unchanged graph", async () => {
      const first = await service.runImpactAnalysis(context, tenant.projectId, ids.changeRequest);
      const second = await service.runImpactAnalysis(context, tenant.projectId, ids.changeRequest);

      expect(analysisSignature(second)).toBe(analysisSignature(first));
    });
  });

  describe("freshness", () => {
    it("reports a fresh run as current", async () => {
      await service.runImpactAnalysis(context, tenant.projectId, ids.changeRequest);

      const latest = await service.getLatestImpactAnalysis(
        context,
        tenant.projectId,
        ids.changeRequest,
      );
      expect(hasImpactAnalysis(latest) && latest.freshness).toBe("CURRENT");
    });

    it("goes stale when a relevant artifact is edited", async () => {
      await service.runImpactAnalysis(context, tenant.projectId, ids.changeRequest);

      await prisma.requirement.update({
        where: { id: ids.requirement },
        data: { statement: "The engine shall not exceed 130 bar." },
      });

      const latest = await service.getLatestImpactAnalysis(
        context,
        tenant.projectId,
        ids.changeRequest,
      );
      expect(hasImpactAnalysis(latest) && latest.freshness).toBe("STALE");
    });

    it("goes stale when a relationship is added", async () => {
      await service.runImpactAnalysis(context, tenant.projectId, ids.changeRequest);
      const before = await modules!.revision.computeProjectFingerprint(tenant.projectId);

      const extra = await prisma.designItem.create({
        data: {
          projectId: tenant.projectId,
          identifier: "DI-050",
          name: "Injector",
          itemType: "COMPONENT",
        },
      });
      const link = await prisma.designItemLink.create({
        data: {
          sourceDesignItemId: ids.designItem,
          targetDesignItemId: extra.id,
          linkType: "CONTAINS",
          createdById: tenant.userId,
        },
      });

      try {
        const after = await modules!.revision.computeProjectFingerprint(tenant.projectId);
        expect(after).not.toBe(before);

        const latest = await service.getLatestImpactAnalysis(
          context,
          tenant.projectId,
          ids.changeRequest,
        );
        expect(hasImpactAnalysis(latest) && latest.freshness).toBe("STALE");
      } finally {
        await prisma.designItemLink.delete({ where: { id: link.id } });
        await prisma.designItem.delete({ where: { id: extra.id } });
      }
    });

    it("does not re-run when a stale result is read", async () => {
      const run = await service.runImpactAnalysis(context, tenant.projectId, ids.changeRequest);
      await prisma.requirement.update({
        where: { id: ids.requirement },
        data: { title: "Maximum chamber pressure (revised)" },
      });

      const latest = await service.getLatestImpactAnalysis(
        context,
        tenant.projectId,
        ids.changeRequest,
      );

      // Same row, reported honestly as stale rather than quietly refreshed.
      expect(hasImpactAnalysis(latest) && latest.analysis.id).toBe(run.analysis.id);
      expect(hasImpactAnalysis(latest) && latest.freshness).toBe("STALE");
    });

    it("is deterministic for an unchanged project", async () => {
      const a = await modules!.revision.computeProjectFingerprint(tenant.projectId);
      const b = await modules!.revision.computeProjectFingerprint(tenant.projectId);

      expect(b).toBe(a);
    });
  });

  describe("scoping", () => {
    it("does not return an analysis through another project", async () => {
      const run = await service.runImpactAnalysis(context, tenant.projectId, ids.changeRequest);

      const leaked = await modules!.analysisRepo.findAnalysisInProject(
        otherTenant.projectId,
        run.analysis.id,
      );
      expect(leaked).toBeNull();
    });

    it("refuses an analysis id from another organization", async () => {
      const run = await service.runImpactAnalysis(context, tenant.projectId, ids.changeRequest);

      await expect(
        service.getImpactAnalysis(
          { organizationId: otherTenant.organizationId, actorId: otherTenant.userId },
          tenant.projectId,
          run.analysis.id,
        ),
      ).rejects.toThrow();
    });

    it("keeps history separate per change request", async () => {
      await service.runImpactAnalysis(context, tenant.projectId, ids.changeRequest);

      const foreignHistory = await modules!.analysisRepo.listAnalyses(
        otherTenant.projectId,
        ids.foreignChange,
      );
      expect(foreignHistory).toEqual([]);
    });
  });

  describe("audit", () => {
    it("records who ran the analysis, without embedding the findings", async () => {
      const run = await service.runImpactAnalysis(context, tenant.projectId, ids.changeRequest);

      const history = await modules!.audit.listAuditEventsForEntity({
        organizationId: tenant.organizationId,
        entityType: "ImpactAnalysis",
        entityId: run.analysis.id,
      });

      expect(history).toHaveLength(1);
      expect(history[0]?.action).toBe("change.impact_analysis_run");
      expect(history[0]?.actor?.id).toBe(tenant.userId);
      expect(history[0]?.metadata).toMatchObject({
        changeRequestId: ids.changeRequest,
        engineVersion: IMPACT_ENGINE_VERSION,
      });
      // The analysis row is the detailed record; the event points at it.
      expect(JSON.stringify(history[0]?.metadata)).not.toContain("REQUIREMENT_ALLOCATED_TO_DESIGN");
    });
  });

  describe("cascades", () => {
    it("removes an analysis with its change request", async () => {
      const doomed = await prisma.changeRequest.create({
        data: {
          projectId: tenant.projectId,
          identifier: "CR-800",
          title: "Temporary change",
          description: "Exists only for this test.",
          reason: "Cascade check.",
          requestedById: tenant.userId,
        },
      });
      await prisma.changeRequestImpact.create({
        data: {
          changeRequestId: doomed.id,
          requirementId: ids.requirement,
          createdById: tenant.userId,
        },
      });

      const run = await service.runImpactAnalysis(context, tenant.projectId, doomed.id);

      await prisma.changeRequest.delete({ where: { id: doomed.id } });

      expect(await prisma.impactAnalysis.count({ where: { id: run.analysis.id } })).toBe(0);
      expect(
        await prisma.impactFinding.count({ where: { analysisId: run.analysis.id } }),
      ).toBe(0);
      expect(
        await prisma.impactAnalysisRoot.count({ where: { analysisId: run.analysis.id } }),
      ).toBe(0);
    });

    it("keeps the analysis when its declared impact is withdrawn", async () => {
      const change = await prisma.changeRequest.create({
        data: {
          projectId: tenant.projectId,
          identifier: "CR-801",
          title: "Withdrawal check",
          description: "Exists only for this test.",
          reason: "Cascade check.",
          requestedById: tenant.userId,
        },
      });
      const impact = await prisma.changeRequestImpact.create({
        data: {
          changeRequestId: change.id,
          requirementId: ids.requirement,
          createdById: tenant.userId,
        },
      });

      const run = await service.runImpactAnalysis(context, tenant.projectId, change.id);
      await prisma.changeRequestImpact.delete({ where: { id: impact.id } });

      try {
        // SetNull, not cascade: an earlier analysis must still explain itself
        // even after the declaration it was run against is removed.
        const roots = await modules!.analysisRepo.listRoots(run.analysis.id);
        expect(roots).toHaveLength(1);
        expect(roots[0]?.declaredImpactId).toBeNull();
        expect(roots[0]?.node.id).toBe(ids.requirement);
      } finally {
        await prisma.changeRequest.delete({ where: { id: change.id } });
      }
    });
  });

  describe("a change with nothing declared", () => {
    it("completes with no roots rather than failing", async () => {
      const bare = await prisma.changeRequest.create({
        data: {
          projectId: tenant.projectId,
          identifier: "CR-802",
          title: "Nothing declared yet",
          description: "No declared impacts.",
          reason: "Empty scope.",
          requestedById: tenant.userId,
        },
      });

      try {
        const report = await service.runImpactAnalysis(context, tenant.projectId, bare.id);

        expect(report.analysis.status).toBe("COMPLETED");
        expect(report.roots).toEqual([]);
        expect(report.findings).toEqual([]);
        expect(report.analysis.summary.findings).toBe(0);
      } finally {
        await prisma.changeRequest.delete({ where: { id: bare.id } });
      }
    });
  });
});
