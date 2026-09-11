// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DeclaredImpact, ImpactAnalysisReport, Project } from "@/domain";
import { analysisSignature } from "@/domain";
import {
  FIXTURE_OTHER_PROJECT,
  FIXTURE_PROJECT,
  GraphFixture,
  graphEdge,
  graphNode,
  nodeRef,
} from "@/tests/fixtures/graph-fixture";

/**
 * Supplier changes through the **existing** change-impact engine.
 *
 * The point of this file is what it does *not* contain: there is no
 * `SupplierImpactService`, no supplier-specific engine and no second set of
 * propagation rules. A supplier-side change is an ordinary `ChangeRequest` with
 * an ordinary declared impact, and `ChangeImpactAnalysisService` walks it using
 * the same policy it uses for everything else. These tests exercise that engine
 * unmodified, over a graph that happens to contain supplier nodes.
 *
 * The real `EngineeringGraphService` runs on an in-memory graph fixture, so the
 * traversal, the propagation policy and the classification are all genuinely
 * exercised. Only persistence and tenancy lookups are faked.
 */

const TX = { __transaction: true } as const;

const CONTEXT = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
};

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)) },
}));

vi.mock("@/server/repositories/project.repository", () => ({
  findProjectInOrganization: vi.fn(),
}));

vi.mock("@/server/repositories/change-request.repository", () => ({
  findChangeRequestInProject: vi.fn(),
  listDeclaredImpacts: vi.fn(),
}));

vi.mock("@/server/repositories/project-revision.repository", () => ({
  computeProjectFingerprint: vi.fn(),
}));

vi.mock("@/server/repositories/audit-log.repository", () => ({
  recordAuditEvent: vi.fn(),
  listAuditEventsForEntity: vi.fn(),
}));

vi.mock("@/server/repositories/impact-analysis.repository", () => {
  interface Row {
    analysis: Record<string, unknown>;
    roots: Record<string, unknown>[];
    findings: Record<string, unknown>[];
  }
  const store = new Map<string, Row>();
  let counter = 0;

  const summarize = (a: Record<string, unknown>) => ({
    ...a,
    summary: {
      declaredImpacts: a["rootCount"] as number,
      roots: a["rootCount"] as number,
      findings: a["findingCount"] as number,
      direct: a["directCount"] as number,
      downstream: a["downstreamCount"] as number,
      crossDomain: a["crossDomainCount"] as number,
      upstreamContext: a["upstreamContextCount"] as number,
      unknown: a["unknownCount"] as number,
      notEvaluated: a["notEvaluatedCount"] as number,
    },
    limits: {
      maxDepth: a["maxDepth"] as number,
      maxNodes: a["maxNodes"] as number,
      maxEdges: a["maxEdges"] as number,
      truncated: a["truncated"] as boolean,
      truncatedBy: a["truncatedBy"] as string | null,
    },
  });

  return {
    __store: store,
    __reset: () => {
      store.clear();
      counter = 0;
    },
    createAnalysis: vi.fn(async (input: Record<string, unknown>) => {
      counter += 1;
      const id = `analysis${counter}`;
      const analysis = {
        id,
        ...input,
        status: "RUNNING",
        sourceFingerprint: "",
        failureReason: null,
        startedAt: new Date(2026, 0, 1, 0, 0, counter),
        completedAt: null,
        rootCount: 0,
        findingCount: 0,
        directCount: 0,
        downstreamCount: 0,
        crossDomainCount: 0,
        upstreamContextCount: 0,
        unknownCount: 0,
        notEvaluatedCount: 0,
        truncated: false,
        truncatedBy: null,
      };
      store.set(id, { analysis, roots: [], findings: [] });
      return summarize(analysis);
    }),
    createRoots: vi.fn(async (analysisId: string, roots: Record<string, unknown>[]) => {
      const row = store.get(analysisId)!;
      const byNode = new Map<string, string>();
      roots.forEach((root, index) => {
        const id = `${analysisId}-root${index}`;
        row.roots.push({ id, analysisId, ...root });
        byNode.set(`${root["nodeType"]}:${root["nodeId"]}`, id);
      });
      return byNode;
    }),
    createFindings: vi.fn(async (analysisId: string, findings: Record<string, unknown>[]) => {
      const row = store.get(analysisId)!;
      findings.forEach((finding, index) => {
        row.findings.push({
          id: `${analysisId}-f${index}`,
          analysisId,
          createdAt: new Date(2026, 0, 1),
          ...finding,
        });
      });
      return findings.length;
    }),
    completeAnalysis: vi.fn(async (analysisId: string, input: Record<string, unknown>) => {
      const row = store.get(analysisId)!;
      row.analysis = {
        ...row.analysis,
        ...input,
        status: "COMPLETED",
        completedAt: new Date(2026, 0, 2),
      };
      return summarize(row.analysis);
    }),
    failAnalysis: vi.fn(async (analysisId: string, reason: string) => {
      const row = store.get(analysisId)!;
      row.analysis = { ...row.analysis, status: "FAILED", failureReason: reason };
      return summarize(row.analysis);
    }),
    findLatestAnalysis: vi.fn(async (projectId: string, changeRequestId: string) => {
      const rows = [...store.values()]
        .filter(
          (row) =>
            row.analysis["projectId"] === projectId &&
            row.analysis["changeRequestId"] === changeRequestId,
        )
        .sort(
          (a, b) =>
            (b.analysis["startedAt"] as Date).getTime() -
            (a.analysis["startedAt"] as Date).getTime(),
        );
      return rows[0] ? summarize(rows[0].analysis) : null;
    }),
    listAnalyses: vi.fn(async () => []),
    findAnalysisInProject: vi.fn(async (projectId: string, analysisId: string) => {
      const row = store.get(analysisId);
      if (!row || row.analysis["projectId"] !== projectId) return null;
      return summarize(row.analysis);
    }),
    listRoots: vi.fn(async (analysisId: string) =>
      (store.get(analysisId)?.roots ?? []).map((root) => ({
        id: root["id"],
        analysisId,
        node: { type: root["nodeType"], id: root["nodeId"] },
        identifier: root["identifier"],
        label: root["label"],
        resolved: root["resolved"],
        declaredImpactId: root["declaredImpactId"],
      })),
    ),
    listFindings: vi.fn(async (analysisId: string) =>
      (store.get(analysisId)?.findings ?? []).map((finding) => ({
        id: finding["id"],
        analysisId,
        rootId: finding["rootId"],
        node: { type: finding["nodeType"], id: finding["nodeId"] },
        identifier: finding["identifier"],
        label: finding["label"],
        classification: finding["classification"],
        status: finding["status"],
        depth: finding["depth"],
        basis: finding["basis"],
        path: finding["path"],
        alternatePathCount: finding["alternatePathCount"],
        createdAt: finding["createdAt"],
      })),
    ),
  };
});

const projectRepository = await import("@/server/repositories/project.repository");
const changeRepository = await import("@/server/repositories/change-request.repository");
const revisionRepository = await import("@/server/repositories/project-revision.repository");
const auditLogRepository = await import("@/server/repositories/audit-log.repository");
const analysisRepository = (await import(
  "@/server/repositories/impact-analysis.repository"
)) as unknown as { __reset: () => void };

const { EngineeringGraphService } = await import("./engineering-graph.service");
const { ChangeImpactAnalysisService } = await import("./change-impact-analysis.service");

const PROJECT_ID = FIXTURE_PROJECT;
const CHANGE_ID = "chg1aaaaaaaaaaaaaaaaaaa";

const PROJECT: Project = {
  id: PROJECT_ID,
  organizationId: CONTEXT.organizationId,
  name: "Upper Stage Propulsion",
  description: null,
  status: "ACTIVE",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

const CHANGE = {
  id: CHANGE_ID,
  projectId: PROJECT_ID,
  identifier: "CR-014",
  title: "Second-source the chamber billet",
  description: "Qualify a second supplier for the Inconel 718 billet.",
  reason: "Single-source lead time risk.",
  status: "DRAFT" as const,
  requestedById: CONTEXT.actorId,
  createdAt: new Date("2026-02-01T00:00:00.000Z"),
  updatedAt: new Date("2026-02-01T00:00:00.000Z"),
};

/**
 * A supplier slice wired into a real engineering slice:
 *
 *   SUP-1 ─provides▶ SI-1 ─┬─allocated───▶ DI-1 ─connects▶ IF-1
 *     │                    ├─supports────▶ REQ-1 ─verified by▶ VA-2
 *     │                    ├─requires────▶ VA-1
 *     │                    ├─linked to───▶ ED-1 ─affects▶ DI-2
 *     │                    ├─linked to───▶ RISK-1
 *     │                    ├─has evidence▶ EV-1
 *     │                    └─qualified by▶ QUAL-1 ─has evidence▶ EV-2
 *     └─has qualification▶ QUAL-1
 */
const supplier = graphNode("SUPPLIER", "sup1");
const suppliedItem = graphNode("SUPPLIED_ITEM", "si1");
const qualification = graphNode("SUPPLIER_QUALIFICATION", "qual1");
const designItem = graphNode("DESIGN_ITEM", "di1");
const decisionDesign = graphNode("DESIGN_ITEM", "di2");
const interfaceDef = graphNode("INTERFACE_DEFINITION", "if1");
const requirement = graphNode("REQUIREMENT", "req1");
const itemVerification = graphNode("VERIFICATION_ACTIVITY", "va1");
const requirementVerification = graphNode("VERIFICATION_ACTIVITY", "va2");
const decision = graphNode("ENGINEERING_DECISION", "ed1");
const risk = graphNode("RISK", "risk1");
const itemEvidence = graphNode("EVIDENCE", "ev1");
const qualEvidence = graphNode("EVIDENCE", "ev2");

function buildGraph() {
  return new GraphFixture(
    [
      supplier,
      suppliedItem,
      qualification,
      designItem,
      decisionDesign,
      interfaceDef,
      requirement,
      itemVerification,
      requirementVerification,
      decision,
      risk,
      itemEvidence,
      qualEvidence,
    ],
    [
      graphEdge("SUPPLIER_PROVIDES_ITEM", nodeRef(supplier), nodeRef(suppliedItem), "eProvides"),
      graphEdge(
        "SUPPLIER_HAS_QUALIFICATION",
        nodeRef(supplier),
        nodeRef(qualification),
        "eSupQual",
      ),
      graphEdge(
        "SUPPLIED_ITEM_QUALIFIED_BY",
        nodeRef(suppliedItem),
        nodeRef(qualification),
        "eItemQual",
      ),
      graphEdge(
        "SUPPLIED_ITEM_ALLOCATED_TO_DESIGN",
        nodeRef(suppliedItem),
        nodeRef(designItem),
        "eItemDesign",
      ),
      graphEdge("DESIGN_CONNECTS_INTERFACE", nodeRef(designItem), nodeRef(interfaceDef), "eIface"),
      graphEdge(
        "SUPPLIED_ITEM_SUPPORTS_REQUIREMENT",
        nodeRef(suppliedItem),
        nodeRef(requirement),
        "eItemReq",
      ),
      graphEdge(
        "REQUIREMENT_VERIFIED_BY",
        nodeRef(requirement),
        nodeRef(requirementVerification),
        "eReqVer",
      ),
      graphEdge(
        "SUPPLIED_ITEM_REQUIRES_VERIFICATION",
        nodeRef(suppliedItem),
        nodeRef(itemVerification),
        "eItemVer",
      ),
      graphEdge(
        "SUPPLIED_ITEM_LINKED_TO_DECISION",
        nodeRef(suppliedItem),
        nodeRef(decision),
        "eItemDec",
      ),
      graphEdge("DECISION_AFFECTS_DESIGN", nodeRef(decision), nodeRef(decisionDesign), "eDecDes"),
      graphEdge("SUPPLIED_ITEM_LINKED_TO_RISK", nodeRef(suppliedItem), nodeRef(risk), "eItemRisk"),
      graphEdge(
        "SUPPLIED_ITEM_HAS_EVIDENCE",
        nodeRef(suppliedItem),
        nodeRef(itemEvidence),
        "eItemEv",
      ),
      graphEdge(
        "SUPPLIER_QUALIFICATION_HAS_EVIDENCE",
        nodeRef(qualification),
        nodeRef(qualEvidence),
        "eQualEv",
      ),
    ],
  );
}

function declaredImpact(
  type: DeclaredImpact["target"]["type"],
  id: string,
  impactId: string,
): DeclaredImpact {
  return {
    id: impactId,
    changeRequestId: CHANGE_ID,
    target: { type, id },
    targetIdentifier: id.toUpperCase(),
    targetTitle: `${type} ${id}`,
    note: null,
    createdAt: new Date("2026-02-02T00:00:00.000Z"),
    createdBy: { id: CONTEXT.actorId, name: "Ada" },
  };
}

let service: InstanceType<typeof ChangeImpactAnalysisService>;

beforeEach(() => {
  vi.clearAllMocks();
  analysisRepository.__reset();

  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
  vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(CHANGE);
  vi.mocked(changeRepository.listDeclaredImpacts).mockResolvedValue([
    declaredImpact("SUPPLIED_ITEM", suppliedItem.id, "imp1"),
  ]);
  vi.mocked(revisionRepository.computeProjectFingerprint).mockResolvedValue("fingerprint-a");
  vi.mocked(auditLogRepository.listAuditEventsForEntity).mockResolvedValue([]);

  service = new ChangeImpactAnalysisService(new EngineeringGraphService(buildGraph()));
});

function findingFor(report: ImpactAnalysisReport, id: string) {
  return report.findings.find((finding) => finding.node.id === id);
}

describe("a change declared against a supplied item", () => {
  it("makes the supplied item a DIRECT finding at depth zero", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    const root = findingFor(report, suppliedItem.id)!;
    expect(root.classification).toBe("DIRECT");
    expect(root.status).toBe("POTENTIALLY_AFFECTED");
    expect(root.depth).toBe(0);
    expect(root.basis).toContain("DECLARED_IMPACT");
    expect(root.basis).toContain("SUPPLIED_ITEM_AFFECTED");
  });

  it("reaches the design that incorporates it", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    const design = findingFor(report, designItem.id)!;
    expect(design.depth).toBe(1);
    // Supply → design leaves the supply domain, which is exactly what an
    // engineer needs to notice.
    expect(design.classification).toBe("CROSS_DOMAIN");
    expect(design.status).toBe("POTENTIALLY_AFFECTED");
    expect(design.basis).toContain("DOMAIN_BOUNDARY_CROSSED");
  });

  it("reaches the requirement it helps meet", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    const req = findingFor(report, requirement.id)!;
    expect(req.depth).toBe(1);
    expect(req.classification).toBe("CROSS_DOMAIN");
  });

  it("reaches verification both directly and through the requirement", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    // Verified against the item itself…
    expect(findingFor(report, itemVerification.id)?.depth).toBe(1);
    // …and reached again two hops out, through the requirement it supports.
    expect(findingFor(report, requirementVerification.id)?.depth).toBe(2);
  });

  it("reaches the decision that rests on it, and the design that decision shaped", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    expect(findingFor(report, decision.id)?.depth).toBe(1);
    expect(findingFor(report, decisionDesign.id)?.depth).toBe(2);
  });

  it("reaches the risk recorded against it without ranking it", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    const found = findingFor(report, risk.id)!;
    expect(found.depth).toBe(1);
    // No severity, score or ranking anywhere on the finding.
    expect(JSON.stringify(found)).not.toMatch(/score|severity|rating/i);
  });

  it("surfaces the qualification without concluding anything about it", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    const found = findingFor(report, qualification.id)!;
    expect(found.basis).toContain("QUALIFICATION_PRESENT");
    // The critical pairing: the engine says it did NOT judge whether the
    // qualification still holds. A change is not a failure.
    expect(found.basis).toContain("QUALIFICATION_VALIDITY_NOT_EVALUATED");
  });

  it("reaches evidence attached to the item and to the qualification", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    expect(findingFor(report, itemEvidence.id)?.depth).toBe(1);
    expect(findingFor(report, qualEvidence.id)?.depth).toBe(2);
  });

  it("preserves provenance naming the real relationship rows", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    const design = findingFor(report, designItem.id)!;
    expect(design.path).toEqual([
      {
        edgeType: "SUPPLIED_ITEM_ALLOCATED_TO_DESIGN",
        relationshipId: "eItemDesign",
        traversed: "FORWARD",
        from: { type: "SUPPLIED_ITEM", id: suppliedItem.id },
        to: { type: "DESIGN_ITEM", id: designItem.id },
      },
    ]);

    // Two hops keeps both steps, in order.
    const iface = findingFor(report, interfaceDef.id)!;
    expect(iface.path.map((step) => step.relationshipId)).toEqual(["eItemDesign", "eIface"]);
  });

  it("is deterministic across repeated runs", async () => {
    const first = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);
    const second = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    expect(analysisSignature(second)).toBe(analysisSignature(first));
  });

  it("orders findings strongest first, then by depth within each class", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    // Classification leads: a cross-domain finding two hops out is more worth
    // reading than a same-domain one at one hop, so depth is the *secondary*
    // key, not the primary one.
    expect(report.findings[0]?.classification).toBe("DIRECT");

    const rank = ["DIRECT", "CROSS_DOMAIN", "DOWNSTREAM", "UPSTREAM_CONTEXT", "UNKNOWN"];
    const ranks = report.findings.map((f) => rank.indexOf(f.classification));
    expect([...ranks].sort((a, b) => a - b)).toEqual(ranks);

    for (const classification of rank) {
      const depths = report.findings
        .filter((f) => f.classification === classification)
        .map((f) => f.depth);
      expect([...depths].sort((a, b) => a - b)).toEqual(depths);
    }
  });
});

describe("a change declared against a supplier", () => {
  beforeEach(() => {
    vi.mocked(changeRepository.listDeclaredImpacts).mockResolvedValue([
      declaredImpact("SUPPLIER", supplier.id, "imp1"),
    ]);
  });

  it("makes the supplier a DIRECT finding", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    const root = findingFor(report, supplier.id)!;
    expect(root.classification).toBe("DIRECT");
    expect(root.basis).toContain("SUPPLIER_IN_PATH");
  });

  it("reaches engineering through what the supplier provides", async () => {
    // A supplier reaches the product only through its items. This is the path
    // that makes a supplier-level declaration useful at all.
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    expect(findingFor(report, suppliedItem.id)?.depth).toBe(1);
    expect(findingFor(report, designItem.id)?.depth).toBe(2);
    expect(findingFor(report, requirement.id)?.depth).toBe(2);
    expect(findingFor(report, requirementVerification.id)?.depth).toBe(3);
  });

  it("reaches the supplier's qualifications", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    const found = findingFor(report, qualification.id)!;
    expect(found.depth).toBe(1);
    expect(found.basis).toContain("QUALIFICATION_VALIDITY_NOT_EVALUATED");
  });

  it("cites the provides edge as the first step", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    expect(findingFor(report, designItem.id)?.path.map((s) => s.edgeType)).toEqual([
      "SUPPLIER_PROVIDES_ITEM",
      "SUPPLIED_ITEM_ALLOCATED_TO_DESIGN",
    ]);
  });
});

describe("direct outranks downstream for supplier objects", () => {
  it("keeps a declared supplied item DIRECT even when propagation also reaches it", async () => {
    vi.mocked(changeRepository.listDeclaredImpacts).mockResolvedValue([
      declaredImpact("SUPPLIER", supplier.id, "imp1"),
      declaredImpact("SUPPLIED_ITEM", suppliedItem.id, "imp2"),
    ]);

    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    // Reachable from the supplier at depth 1, but declared outright — what the
    // engineer asserted outranks what the walk inferred.
    const item = findingFor(report, suppliedItem.id)!;
    expect(item.classification).toBe("DIRECT");
    expect(item.depth).toBe(0);
  });
});

describe("the project boundary", () => {
  it("does not cross into another project through a supplier edge", async () => {
    const foreignDesign = graphNode("DESIGN_ITEM", "diX", FIXTURE_OTHER_PROJECT);
    const fixture = new GraphFixture(
      [supplier, suppliedItem, designItem, foreignDesign],
      [
        graphEdge("SUPPLIER_PROVIDES_ITEM", nodeRef(supplier), nodeRef(suppliedItem), "eProvides"),
        graphEdge(
          "SUPPLIED_ITEM_ALLOCATED_TO_DESIGN",
          nodeRef(suppliedItem),
          nodeRef(designItem),
          "eItemDesign",
        ),
        // A row that should never be visible: the graph fails closed rather
        // than quietly reaching into another project.
        graphEdge(
          "SUPPLIED_ITEM_ALLOCATED_TO_DESIGN",
          nodeRef(suppliedItem),
          nodeRef(foreignDesign),
          "eForeign",
        ),
      ],
    );
    service = new ChangeImpactAnalysisService(new EngineeringGraphService(fixture));

    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    expect(findingFor(report, designItem.id)).toBeDefined();
    expect(findingFor(report, foreignDesign.id)).toBeUndefined();
  });
});

describe("what the supplier integration deliberately does not produce", () => {
  it("returns no supplier score, health or rating in any finding", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    expect(JSON.stringify(report)).not.toMatch(/supplierScore|health|rating|reliability/i);
  });

  it("produces one report, not a separate supplier impact report", async () => {
    // There is a single analysis for the change, covering supplier and
    // engineering objects together. A second supplier-only report would mean
    // two answers to the same question.
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    expect(report.analysis.changeRequestId).toBe(CHANGE_ID);
    expect(report.findings.some((f) => f.node.type === "SUPPLIED_ITEM")).toBe(true);
    expect(report.findings.some((f) => f.node.type === "DESIGN_ITEM")).toBe(true);
  });
});
