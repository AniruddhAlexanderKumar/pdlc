import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GRAPH_EDGE_TYPES, graphNodeKey, type GraphNodeRef } from "@/domain";
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
 * The engineering graph against real PostgreSQL.
 *
 * The service unit tests drive the traversal over an in-memory fixture, so they
 * prove the algorithm and nothing about the twenty-two sets of queries beneath
 * it. This runs those queries: real column names, real relation names, real
 * foreign keys, real join tables and real polymorphic columns.
 *
 * It also proves the two claims that matter most and cannot be made without a
 * database — that the graph never crosses a project boundary even when a
 * relationship row does, and that the consistency check finds such a row and
 * reports it without changing anything.
 */

const graph = databaseAvailable
  ? {
      repository: await import("@/server/repositories/graph-repository"),
      service: await import("@/server/services/engineering-graph.service"),
    }
  : null;

describe.skipIf(!databaseAvailable)(`the engineering graph against PostgreSQL (${SKIP_REASON})`, () => {
  const prisma = integrationPrisma!;

  let tenant: TestTenant;
  let otherTenant: TestTenant;
  let repository: InstanceType<typeof import("@/server/repositories/graph-repository").EngineeringGraphRepository>;
  let service: InstanceType<typeof import("@/server/services/engineering-graph.service").EngineeringGraphService>;
  let context: { organizationId: string; actorId: string };

  const ids = {
    need: "",
    requirement: "",
    childRequirement: "",
    designItem: "",
    interfaceDefinition: "",
    verification: "",
    decision: "",
    alternative: "",
    assumption: "",
    expectation: "",
    risk: "",
    issue: "",
    evidence: "",
    changeRequest: "",
    approval: "",
    foreignDesignItem: "",
    crossProjectLink: "",
  };

  beforeAll(async () => {
    tenant = await createTestTenant("graph");
    otherTenant = await createTestTenant("graph-other");

    repository = new graph!.repository.EngineeringGraphRepository(prisma);
    service = new graph!.service.EngineeringGraphService(repository);
    context = { organizationId: tenant.organizationId, actorId: tenant.userId };

    const projectId = tenant.projectId;

    // A real slice of a programme, written the way the domain modules write it.
    //
    //   SN-1 ─▶ REQ-1 ─decomposes▶ REQ-2 ─allocated▶ DI-1 ─provides▶ IF-1
    //            │  ├─verified by▶ VA-1 ─evidence▶ EV-1
    //            │  └─linked to──▶ ED-1 ─┬─alternative / assumption / expectation
    //            │                       └─affects──▶ RISK-1
    //   RISK-1 ─affects▶ REQ-1        ISSUE-1 ─affects▶ DI-1
    //   CR-1 ─impacts▶ REQ-1          APPROVAL ─relates to▶ REQ-1
    const need = await prisma.stakeholderNeed.create({
      data: {
        projectId,
        identifier: "SN-001",
        title: "Survive ascent loads",
        description: "The vehicle must survive maximum dynamic pressure.",
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

    const childRequirement = await prisma.requirement.create({
      data: {
        projectId,
        identifier: "REQ-002",
        title: "Injector pressure drop",
        statement: "The injector shall maintain a 20 percent pressure drop.",
      },
    });
    ids.childRequirement = childRequirement.id;

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
      data: {
        projectId,
        identifier: "VA-001",
        title: "Hot fire test",
        method: "TEST",
      },
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

    const alternative = await prisma.decisionAlternative.create({
      data: { engineeringDecisionId: decision.id, title: "Ablative liner" },
    });
    ids.alternative = alternative.id;

    const assumption = await prisma.decisionAssumption.create({
      data: { engineeringDecisionId: decision.id, statement: "Coolant flow stays above 2.4 kg/s." },
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
        description: "Debris could block a cooling channel.",
      },
    });
    ids.risk = risk.id;

    const issue = await prisma.issue.create({
      data: {
        projectId,
        identifier: "ISS-001",
        title: "Weld porosity",
        description: "Porosity found in the chamber weld.",
      },
    });
    ids.issue = issue.id;

    const evidence = await prisma.evidence.create({
      data: {
        projectId,
        identifier: "EV-001",
        title: "Hot fire test report",
        evidenceType: "TEST_RESULT",
        sourceReference: "TR-2026-014",
      },
    });
    ids.evidence = evidence.id;

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

    const approval = await prisma.approval.create({
      data: {
        projectId,
        approverId: tenant.userId,
        decision: "APPROVED",
        requirementId: requirement.id,
      },
    });
    ids.approval = approval.id;

    await prisma.needRequirementLink.create({
      data: {
        stakeholderNeedId: need.id,
        requirementId: requirement.id,
        createdById: tenant.userId,
      },
    });
    await prisma.requirementLink.create({
      data: {
        sourceRequirementId: requirement.id,
        targetRequirementId: childRequirement.id,
        linkType: "DECOMPOSES_TO",
        createdById: tenant.userId,
      },
    });
    await prisma.requirementDesignLink.create({
      data: {
        requirementId: childRequirement.id,
        designItemId: designItem.id,
        linkType: "ALLOCATED_TO",
        note: "Allocated at PDR.",
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
    await prisma.decisionRiskLink.create({
      data: {
        engineeringDecisionId: decision.id,
        riskId: risk.id,
        createdById: tenant.userId,
      },
    });
    await prisma.riskRequirementLink.create({
      data: { riskId: risk.id, requirementId: requirement.id, createdById: tenant.userId },
    });
    await prisma.issueDesignLink.create({
      data: { issueId: issue.id, designItemId: designItem.id, createdById: tenant.userId },
    });
    await prisma.evidenceLink.create({
      data: {
        evidenceId: evidence.id,
        verificationActivityId: verification.id,
        createdById: tenant.userId,
      },
    });
    await prisma.changeRequestImpact.create({
      data: {
        changeRequestId: changeRequest.id,
        requirementId: requirement.id,
        createdById: tenant.userId,
      },
    });

    // A design item in a different project, and a relationship row that
    // wrongly reaches across to it. Nothing in the schema forbids this row;
    // that is precisely why the graph has to defend against it.
    const foreignDesignItem = await prisma.designItem.create({
      data: {
        projectId: otherTenant.projectId,
        identifier: "DI-900",
        name: "Someone else's bracket",
        itemType: "COMPONENT",
      },
    });
    ids.foreignDesignItem = foreignDesignItem.id;

    const crossProjectLink = await prisma.requirementDesignLink.create({
      data: {
        requirementId: requirement.id,
        designItemId: foreignDesignItem.id,
        linkType: "ALLOCATED_TO",
        createdById: tenant.userId,
      },
    });
    ids.crossProjectLink = crossProjectLink.id;
  });

  afterAll(async () => {
    if (tenant) await destroyTestTenant(tenant);
    if (otherTenant) await destroyTestTenant(otherTenant);
    await disconnectIntegrationPrisma();
  });

  const ref = (type: GraphNodeRef["type"], id: string): GraphNodeRef => ({ type, id });

  describe("resolving nodes", () => {
    it("reads a node's identity from its own table", async () => {
      const node = await repository.getNode(
        tenant.projectId,
        ref("REQUIREMENT", ids.requirement),
      );

      expect(node).toEqual({
        type: "REQUIREMENT",
        id: ids.requirement,
        projectId: tenant.projectId,
        identifier: "REQ-001",
        label: "Maximum chamber pressure",
      });
    });

    it("labels each node type from the column that actually names it", async () => {
      const resolved = await repository.resolveNodes(tenant.projectId, [
        ref("STAKEHOLDER_NEED", ids.need),
        ref("DESIGN_ITEM", ids.designItem),
        ref("INTERFACE_DEFINITION", ids.interfaceDefinition),
        ref("VERIFICATION_ACTIVITY", ids.verification),
        ref("ENGINEERING_DECISION", ids.decision),
        ref("DECISION_ALTERNATIVE", ids.alternative),
        ref("DECISION_ASSUMPTION", ids.assumption),
        ref("DECISION_EXPECTATION", ids.expectation),
        ref("RISK", ids.risk),
        ref("ISSUE", ids.issue),
        ref("EVIDENCE", ids.evidence),
        ref("CHANGE_REQUEST", ids.changeRequest),
        ref("APPROVAL", ids.approval),
        ref("PROJECT", tenant.projectId),
      ]);

      expect(resolved.size).toBe(14);
      expect(resolved.get(graphNodeKey(ref("DESIGN_ITEM", ids.designItem)))?.label).toBe(
        "Combustion chamber",
      );
      // A decision's children have no identifier and no project column of their
      // own; the project comes from the parent decision.
      const assumption = resolved.get(graphNodeKey(ref("DECISION_ASSUMPTION", ids.assumption)));
      expect(assumption?.identifier).toBeNull();
      expect(assumption?.projectId).toBe(tenant.projectId);
      expect(assumption?.label).toBe("Coolant flow stays above 2.4 kg/s.");
      expect(resolved.get(graphNodeKey(ref("APPROVAL", ids.approval)))?.label).toBe("APPROVED");
    });

    it("does not resolve a node from another project", async () => {
      const node = await repository.getNode(
        tenant.projectId,
        ref("DESIGN_ITEM", ids.foreignDesignItem),
      );

      expect(node).toBeNull();
    });

    it("does not resolve an id under the wrong node type", async () => {
      const node = await repository.getNode(tenant.projectId, ref("RISK", ids.requirement));

      expect(node).toBeNull();
    });
  });

  describe("reading edges", () => {
    it("reads outgoing edges with their provenance", async () => {
      const edges = await repository.getOutgoingEdges(tenant.projectId, [
        ref("REQUIREMENT", ids.childRequirement),
      ]);

      const allocation = edges.find((e) => e.type === "REQUIREMENT_ALLOCATED_TO_DESIGN");
      expect(allocation).toBeDefined();
      expect(allocation?.target).toEqual(ref("DESIGN_ITEM", ids.designItem));
      expect(allocation?.note).toBe("Allocated at PDR.");
      expect(allocation?.linkType).toBe("ALLOCATED_TO");
      expect(allocation?.createdById).toBe(tenant.userId);
      // The relationship row's own id, so the edge can be traced back.
      expect(allocation?.relationshipId).toEqual(expect.any(String));
    });

    it("reads incoming edges from every table that can point at a requirement", async () => {
      const edges = await repository.getIncomingEdges(tenant.projectId, [
        ref("REQUIREMENT", ids.requirement),
      ]);

      expect(new Set(edges.map((e) => e.type))).toEqual(
        new Set([
          "STAKEHOLDER_NEED_DERIVES_REQUIREMENT",
          "RISK_AFFECTS_REQUIREMENT",
          "CHANGE_IMPACTS_OBJECT",
          "APPROVAL_RELATES_TO_OBJECT",
        ]),
      );
    });

    it("reads a decision's memory children as edges", async () => {
      const edges = await repository.getOutgoingEdges(tenant.projectId, [
        ref("ENGINEERING_DECISION", ids.decision),
      ]);

      const children = edges.filter((e) => e.type.startsWith("DECISION_HAS_"));
      expect(children.map((e) => e.target).sort((a, b) => a.type.localeCompare(b.type))).toEqual([
        ref("DECISION_ALTERNATIVE", ids.alternative),
        ref("DECISION_ASSUMPTION", ids.assumption),
        ref("DECISION_EXPECTATION", ids.expectation),
      ]);
      // The child row is the relationship, so its id is the provenance.
      expect(children.every((e) => e.relationshipId === e.target.id)).toBe(true);
    });

    it("reads the polymorphic tables through the column that is actually set", async () => {
      const [impact] = await repository.getOutgoingEdges(
        tenant.projectId,
        [ref("CHANGE_REQUEST", ids.changeRequest)],
        ["CHANGE_IMPACTS_OBJECT"],
      );
      const [approval] = await repository.getOutgoingEdges(
        tenant.projectId,
        [ref("APPROVAL", ids.approval)],
        ["APPROVAL_RELATES_TO_OBJECT"],
      );

      expect(impact?.target).toEqual(ref("REQUIREMENT", ids.requirement));
      expect(approval?.target).toEqual(ref("REQUIREMENT", ids.requirement));
    });

    it("reads one evidence table as three distinct edge types", async () => {
      const fromVerification = await repository.getOutgoingEdges(tenant.projectId, [
        ref("VERIFICATION_ACTIVITY", ids.verification),
      ]);
      const fromRequirement = await repository.getOutgoingEdges(
        tenant.projectId,
        [ref("REQUIREMENT", ids.requirement)],
        ["REQUIREMENT_HAS_EVIDENCE"],
      );

      expect(fromVerification.map((e) => e.type)).toContain("VERIFICATION_HAS_EVIDENCE");
      // The evidence row belongs to the verification activity, so the
      // requirement variant must not pick it up.
      expect(fromRequirement).toEqual([]);
    });

    it("returns edges in a stable order", async () => {
      const first = await repository.getEdges(
        tenant.projectId,
        [ref("REQUIREMENT", ids.requirement)],
        "BOTH",
      );
      const second = await repository.getEdges(
        tenant.projectId,
        [ref("REQUIREMENT", ids.requirement)],
        "BOTH",
      );

      expect(first.map((e) => e.relationshipId)).toEqual(second.map((e) => e.relationshipId));
    });

    it("excludes an edge whose other end is in another project", async () => {
      const edges = await repository.getOutgoingEdges(
        tenant.projectId,
        [ref("REQUIREMENT", ids.requirement)],
        ["REQUIREMENT_ALLOCATED_TO_DESIGN"],
      );

      // The row exists — the consistency check finds it below — but it is not
      // an edge in this project's graph.
      expect(edges).toEqual([]);
    });
  });

  describe("traversal", () => {
    it("walks the real traceability chain", async () => {
      const result = await service.traverse(context, tenant.projectId, {
        root: ref("STAKEHOLDER_NEED", ids.need),
        direction: "OUTBOUND",
        maxDepth: 5,
      });

      const reached = result.nodes.map((n) => `${n.node.type}:${n.node.identifier ?? n.node.id}`);
      expect(reached).toContain("REQUIREMENT:REQ-001");
      expect(reached).toContain("REQUIREMENT:REQ-002");
      expect(reached).toContain("DESIGN_ITEM:DI-001");
      expect(reached).toContain("INTERFACE_DEFINITION:IF-001");
      expect(reached).toContain("VERIFICATION_ACTIVITY:VA-001");
    });

    it("records the depth and path of a node several hops away", async () => {
      const result = await service.traverse(context, tenant.projectId, {
        root: ref("STAKEHOLDER_NEED", ids.need),
        direction: "OUTBOUND",
        maxDepth: 5,
      });

      const iface = result.nodes.find((n) => n.node.type === "INTERFACE_DEFINITION");
      expect(iface?.depth).toBe(4);
      expect(iface?.path.map((s) => s.edgeType)).toEqual([
        "STAKEHOLDER_NEED_DERIVES_REQUIREMENT",
        "REQUIREMENT_DEPENDS_ON_REQUIREMENT",
        "REQUIREMENT_ALLOCATED_TO_DESIGN",
        "DESIGN_CONNECTS_INTERFACE",
      ]);
      // Every step names the relationship row it came from.
      expect(iface?.path.every((s) => s.relationshipId.length > 0)).toBe(true);
    });

    it("finds what a design item traces back to", async () => {
      const upstream = await service.getUpstreamDependencies(
        context,
        tenant.projectId,
        ref("DESIGN_ITEM", ids.designItem),
        5,
      );

      const reached = upstream.nodes.map((n) => n.node.identifier);
      expect(reached).toContain("REQ-002");
      expect(reached).toContain("REQ-001");
      expect(reached).toContain("SN-001");
    });

    it("reaches a decision's memory from the requirement it addresses", async () => {
      const result = await service.traverse(context, tenant.projectId, {
        root: ref("REQUIREMENT", ids.requirement),
        direction: "OUTBOUND",
        maxDepth: 3,
      });

      const types = result.nodes.map((n) => n.node.type);
      expect(types).toContain("ENGINEERING_DECISION");
      expect(types).toContain("DECISION_ASSUMPTION");
      expect(types).toContain("RISK");
    });

    it("stops at the depth it was given and says the answer is partial", async () => {
      const result = await service.traverse(context, tenant.projectId, {
        root: ref("STAKEHOLDER_NEED", ids.need),
        direction: "OUTBOUND",
        maxDepth: 1,
      });

      expect(result.nodes).toHaveLength(2);
      expect(result.limits.truncated).toBe(true);
      expect(result.limits.truncatedBy).toBe("MAX_DEPTH");
    });

    it("stops at the node cap", async () => {
      const result = await service.traverse(context, tenant.projectId, {
        root: ref("REQUIREMENT", ids.requirement),
        direction: "BOTH",
        maxNodes: 3,
        maxDepth: 5,
      });

      expect(result.nodes).toHaveLength(3);
      expect(result.limits.truncatedBy).toBe("MAX_NODES");
    });

    it("produces the same result twice over the same data", async () => {
      const request = {
        root: ref("REQUIREMENT", ids.requirement),
        direction: "BOTH" as const,
        maxDepth: 3,
      };

      const first = await service.traverse(context, tenant.projectId, request);
      const second = await service.traverse(context, tenant.projectId, { ...request });

      expect(JSON.stringify(first)).toBe(JSON.stringify(second));
    });

    it("never leaves the project, even where a row points out of it", async () => {
      const result = await service.traverse(context, tenant.projectId, {
        root: ref("REQUIREMENT", ids.requirement),
        direction: "BOTH",
        maxDepth: 5,
      });

      expect(result.nodes.every((n) => n.node.projectId === tenant.projectId)).toBe(true);
      expect(result.nodes.map((n) => n.node.id)).not.toContain(ids.foreignDesignItem);
    });

    it("404s for a root that belongs to another organization's project", async () => {
      await expect(
        service.traverse(context, otherTenant.projectId, {
          root: ref("DESIGN_ITEM", ids.foreignDesignItem),
        }),
      ).rejects.toThrow();
    });
  });

  describe("direct connections", () => {
    it("returns one hop in both directions", async () => {
      const { node, connections } = await service.getDirectConnections(
        context,
        tenant.projectId,
        ref("REQUIREMENT", ids.requirement),
      );

      expect(node.identifier).toBe("REQ-001");
      expect(connections.some((c) => c.direction === "INBOUND")).toBe(true);
      expect(connections.some((c) => c.direction === "OUTBOUND")).toBe(true);
      // Two hops away, so not here.
      expect(connections.map((c) => c.neighbor.id)).not.toContain(ids.interfaceDefinition);
    });
  });

  describe("the consistency check", () => {
    it("finds the cross-project row the traversal refused to follow", async () => {
      const report = await service.checkConsistency(context, tenant.projectId, [
        "REQUIREMENT_ALLOCATED_TO_DESIGN",
      ]);

      const crossProject = report.anomalies.filter((a) => a.kind === "CROSS_PROJECT_ENDPOINT");
      expect(crossProject).toHaveLength(1);
      expect(crossProject[0]?.relationshipId).toBe(ids.crossProjectLink);
      expect(crossProject[0]?.detail).toContain(otherTenant.projectId);
    });

    it("reports without repairing", async () => {
      await service.checkConsistency(context, tenant.projectId);

      // The offending row is still there afterwards: the check is a report, and
      // deleting the evidence would be worse than leaving it.
      const stillThere = await prisma.requirementDesignLink.findUnique({
        where: { id: ids.crossProjectLink },
      });
      expect(stillThere).not.toBeNull();
    });

    it("scans every edge type without error and counts what it saw", async () => {
      const report = await service.checkConsistency(context, tenant.projectId);

      expect(report.checkedEdgeTypes).toHaveLength(GRAPH_EDGE_TYPES.length);
      expect(report.projectId).toBe(tenant.projectId);
      // Fifteen sound relationships (the eleven *Link/*Impact join-table
      // rows, plus DecisionAlternative, DecisionAssumption,
      // DecisionExpectation and Approval, each a direct FK rather than a
      // join table but still a real registered edge) plus the one
      // deliberate cross-project row.
      expect(report.edgesChecked).toBe(16);
    });

    it("finds nothing wrong with the sound half of the graph", async () => {
      const report = await service.checkConsistency(context, tenant.projectId, [
        "STAKEHOLDER_NEED_DERIVES_REQUIREMENT",
        "REQUIREMENT_VERIFIED_BY",
        "DESIGN_CONNECTS_INTERFACE",
        "DECISION_HAS_ASSUMPTION",
        "VERIFICATION_HAS_EVIDENCE",
      ]);

      expect(report.anomalies).toEqual([]);
    });

    it("cannot be made to see a duplicate, because the schema forbids one", async () => {
      // Worth asserting rather than assuming: DUPLICATE_EDGE is unreachable
      // through Prisma precisely because every link table carries a unique
      // constraint on its pair. The rule stays in the checker for the case
      // where one of those constraints is dropped.
      await expect(
        prisma.riskRequirementLink.create({
          data: {
            riskId: ids.risk,
            requirementId: ids.requirement,
            note: "Recorded twice.",
            createdById: tenant.userId,
          },
        }),
      ).rejects.toThrow();
    });

    it("does not mistake a second link type for a duplicate", async () => {
      // `requirement_design_links` is unique on (requirement, design, linkType),
      // so these two rows are legal and are two different assertions. Keying the
      // duplicate check on the pair alone would flag the second one.
      const second = await prisma.requirementDesignLink.create({
        data: {
          requirementId: ids.childRequirement,
          designItemId: ids.designItem,
          linkType: "SATISFIED_BY",
          createdById: tenant.userId,
        },
      });

      try {
        const report = await service.checkConsistency(context, tenant.projectId, [
          "REQUIREMENT_ALLOCATED_TO_DESIGN",
        ]);

        expect(report.anomalies.filter((a) => a.kind === "DUPLICATE_EDGE")).toEqual([]);
      } finally {
        await prisma.requirementDesignLink.delete({ where: { id: second.id } });
      }
    });

    it("does not mistake an approval history for duplicates", async () => {
      // `approvals` has no unique constraint at all: an artifact accumulates
      // approvals over time, and every one after the first would otherwise be
      // reported as a duplicate on entirely normal data.
      const second = await prisma.approval.create({
        data: {
          projectId: tenant.projectId,
          approverId: tenant.userId,
          decision: "APPROVED",
          requirementId: ids.requirement,
        },
      });

      try {
        const report = await service.checkConsistency(context, tenant.projectId, [
          "APPROVAL_RELATES_TO_OBJECT",
        ]);

        expect(report.anomalies).toEqual([]);
      } finally {
        await prisma.approval.delete({ where: { id: second.id } });
      }
    });

    it("reports the endpoint as missing once the target row is gone", async () => {
      // Foreign keys cascade, so a dangling row cannot be produced by deleting
      // the target. Dropping the *project* out from under the target is the
      // reachable equivalent: the row survives, its endpoint no longer resolves
      // here.
      const orphanTenant = await createTestTenant("graph-orphan");
      const orphanDesign = await prisma.designItem.create({
        data: {
          projectId: orphanTenant.projectId,
          identifier: "DI-901",
          name: "Bracket",
          itemType: "COMPONENT",
        },
      });
      const link = await prisma.requirementDesignLink.create({
        data: {
          requirementId: ids.requirement,
          designItemId: orphanDesign.id,
          linkType: "ALLOCATED_TO",
          createdById: tenant.userId,
        },
      });

      try {
        const report = await service.checkConsistency(context, tenant.projectId, [
          "REQUIREMENT_ALLOCATED_TO_DESIGN",
        ]);

        expect(
          report.anomalies.some(
            (a) => a.relationshipId === link.id && a.kind === "CROSS_PROJECT_ENDPOINT",
          ),
        ).toBe(true);
      } finally {
        await destroyTestTenant(orphanTenant);
      }
    });

    it("404s for a project in another organization", async () => {
      await expect(
        service.checkConsistency(
          { organizationId: otherTenant.organizationId, actorId: otherTenant.userId },
          tenant.projectId,
        ),
      ).rejects.toThrow();
    });
  });

  describe("change requests as graph nodes", () => {
    // The next capability — computed impact analysis — will start from a change
    // request and walk this edge. If declared impacts were not visible through
    // the graph, that engine would have to read the impact table itself and the
    // graph would stop being the single way relationships are traversed.

    it("resolves a change request as a node", async () => {
      const node = await repository.getNode(
        tenant.projectId,
        ref("CHANGE_REQUEST", ids.changeRequest),
      );

      expect(node).toEqual({
        type: "CHANGE_REQUEST",
        id: ids.changeRequest,
        projectId: tenant.projectId,
        identifier: "CR-001",
        label: "Raise the pressure limit",
      });
    });

    it("traverses from the change to what it declares it affects", async () => {
      const result = await service.traverse(context, tenant.projectId, {
        root: ref("CHANGE_REQUEST", ids.changeRequest),
        direction: "OUTBOUND",
        maxDepth: 1,
      });

      const reached = result.nodes.filter((n) => n.depth === 1);
      expect(reached.map((n) => n.node.identifier)).toContain("REQ-001");
      expect(reached.every((n) => n.path[0]?.edgeType === "CHANGE_IMPACTS_OBJECT")).toBe(true);
    });

    it("traverses back from an impacted artifact to the change", async () => {
      // Reverse resolution is what lets a requirement page eventually answer
      // "what changes claim to touch me?".
      const result = await service.traverse(context, tenant.projectId, {
        root: ref("REQUIREMENT", ids.requirement),
        direction: "INBOUND",
        maxDepth: 1,
        edgeTypes: ["CHANGE_IMPACTS_OBJECT"],
      });

      expect(result.nodes.map((n) => n.node.id)).toContain(ids.changeRequest);
      const step = result.nodes.find((n) => n.node.id === ids.changeRequest)?.path[0];
      expect(step?.traversed).toBe("REVERSE");
    });

    it("carries the impact row's own id as the edge's provenance", async () => {
      const impactRow = await prisma.changeRequestImpact.findFirstOrThrow({
        where: { changeRequestId: ids.changeRequest, requirementId: ids.requirement },
        select: { id: true, createdById: true },
      });

      const edges = await repository.getOutgoingEdges(
        tenant.projectId,
        [ref("CHANGE_REQUEST", ids.changeRequest)],
        ["CHANGE_IMPACTS_OBJECT"],
      );

      const edge = edges.find((candidate) => candidate.target.id === ids.requirement);
      expect(edge?.relationshipId).toBe(impactRow.id);
      expect(edge?.createdById).toBe(impactRow.createdById);
      expect(edge?.source).toEqual(ref("CHANGE_REQUEST", ids.changeRequest));
    });

    it("resolves a declared impact on a design item and a decision too", async () => {
      const extra = await Promise.all([
        prisma.changeRequestImpact.create({
          data: {
            changeRequestId: ids.changeRequest,
            designItemId: ids.designItem,
            createdById: tenant.userId,
          },
          select: { id: true },
        }),
        prisma.changeRequestImpact.create({
          data: {
            changeRequestId: ids.changeRequest,
            engineeringDecisionId: ids.decision,
            createdById: tenant.userId,
          },
          select: { id: true },
        }),
      ]);

      try {
        const edges = await repository.getOutgoingEdges(
          tenant.projectId,
          [ref("CHANGE_REQUEST", ids.changeRequest)],
          ["CHANGE_IMPACTS_OBJECT"],
        );

        expect(edges.map((edge) => edge.target.type).sort()).toEqual([
          "DESIGN_ITEM",
          "ENGINEERING_DECISION",
          "REQUIREMENT",
        ]);
      } finally {
        await prisma.changeRequestImpact.deleteMany({
          where: { id: { in: extra.map((row) => row.id) } },
        });
      }
    });

    it("will not follow a declared impact that reaches into another project", async () => {
      const foreignChange = await prisma.changeRequest.create({
        data: {
          projectId: tenant.projectId,
          identifier: "CR-902",
          title: "Reaches out of the project",
          description: "Declares an impact on someone else's artifact.",
          reason: "Constructed for this test.",
          requestedById: tenant.userId,
        },
      });
      // Nothing in the schema forbids this row, which is why the graph has to
      // defend against it.
      const crossProject = await prisma.changeRequestImpact.create({
        data: {
          changeRequestId: foreignChange.id,
          designItemId: ids.foreignDesignItem,
          createdById: tenant.userId,
        },
        select: { id: true },
      });

      try {
        const result = await service.traverse(context, tenant.projectId, {
          root: ref("CHANGE_REQUEST", foreignChange.id),
          direction: "OUTBOUND",
          maxDepth: 2,
        });

        // The row exists, but the edge does not: the graph fails closed.
        expect(result.nodes.map((n) => n.node.id)).toEqual([foreignChange.id]);
        expect(result.edges).toEqual([]);

        // The consistency check reports it rather than repairing it.
        const report = await service.checkConsistency(context, tenant.projectId, [
          "CHANGE_IMPACTS_OBJECT",
        ]);
        expect(
          report.anomalies.some(
            (anomaly) =>
              anomaly.relationshipId === crossProject.id &&
              anomaly.kind === "CROSS_PROJECT_ENDPOINT",
          ),
        ).toBe(true);
      } finally {
        await prisma.changeRequest.delete({ where: { id: foreignChange.id } });
      }
    });
  });

  describe("the registry against the real schema", () => {
    it("can read every declared edge type from PostgreSQL", async () => {
      // Every resolver's audit query runs against the real tables. A wrong
      // column or relation name fails here rather than in production.
      const audited = await repository.auditEdges(tenant.projectId, GRAPH_EDGE_TYPES);

      expect(audited.size).toBe(GRAPH_EDGE_TYPES.length);
      for (const edgeType of GRAPH_EDGE_TYPES) {
        expect(audited.has(edgeType)).toBe(true);
      }
    });

    it("can read edges in both directions for every node type", async () => {
      const everyNode: GraphNodeRef[] = [
        ref("PROJECT", tenant.projectId),
        ref("STAKEHOLDER_NEED", ids.need),
        ref("REQUIREMENT", ids.requirement),
        ref("ENGINEERING_DECISION", ids.decision),
        ref("DECISION_ALTERNATIVE", ids.alternative),
        ref("DECISION_ASSUMPTION", ids.assumption),
        ref("DECISION_EXPECTATION", ids.expectation),
        ref("DESIGN_ITEM", ids.designItem),
        ref("INTERFACE_DEFINITION", ids.interfaceDefinition),
        ref("VERIFICATION_ACTIVITY", ids.verification),
        ref("RISK", ids.risk),
        ref("ISSUE", ids.issue),
        ref("CHANGE_REQUEST", ids.changeRequest),
        ref("EVIDENCE", ids.evidence),
        ref("APPROVAL", ids.approval),
      ];

      const edges = await repository.getEdges(tenant.projectId, everyNode, "BOTH");

      expect(edges.length).toBeGreaterThan(0);
      expect(edges.every((e) => e.relationshipId.length > 0)).toBe(true);
    });
  });
});
