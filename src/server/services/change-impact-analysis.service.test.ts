// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  IMPACT_ENGINE_VERSION,
  type DeclaredImpact,
  type ImpactAnalysisReport,
  type Project,
  analysisSignature,
  hasImpactAnalysis,
} from "@/domain";
import { NotFoundError, ValidationError } from "@/server/errors";
import {
  FIXTURE_PROJECT,
  GraphFixture,
  graphEdge,
  graphNode,
  nodeRef,
} from "@/tests/fixtures/graph-fixture";

/**
 * The impact engine, driven over a hand-built graph.
 *
 * The *real* `EngineeringGraphService` runs on top of an in-memory graph
 * fixture, so the traversal, the propagation policy and the classification
 * logic are all genuinely exercised — none of it is stubbed. Only persistence
 * and tenancy lookups are faked, and the fake store keeps rows so the report is
 * assembled from what was actually "written".
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

vi.mock("@/server/repositories/user.repository", () => ({
  isMemberOfOrganization: vi.fn(),
  getOrganizationRole: vi.fn(),
}));

vi.mock("@/server/repositories/project-membership.repository", () => ({ findMembership: vi.fn() }));

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

// An in-memory analysis store, so the report the service returns is assembled
// from rows it actually persisted rather than from its own intent to write.
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
          id: `${analysisId}-finding${index}`,
          analysisId,
          createdAt: new Date(2026, 0, 1),
          ...finding,
        });
      });
      return findings.length;
    }),
    completeAnalysis: vi.fn(async (analysisId: string, input: Record<string, unknown>) => {
      const row = store.get(analysisId)!;
      Object.assign(row.analysis, input, {
        status: "COMPLETED",
        completedAt: new Date(2026, 0, 2),
      });
      return summarize(row.analysis);
    }),
    failAnalysis: vi.fn(async (analysisId: string, reason: string) => {
      const row = store.get(analysisId);
      if (row) {
        Object.assign(row.analysis, {
          status: "FAILED",
          failureReason: reason,
          completedAt: new Date(2026, 0, 2),
        });
      }
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
    listAnalyses: vi.fn(async (projectId: string, changeRequestId: string) =>
      [...store.values()]
        .filter(
          (row) =>
            row.analysis["projectId"] === projectId &&
            row.analysis["changeRequestId"] === changeRequestId,
        )
        .sort(
          (a, b) =>
            (b.analysis["startedAt"] as Date).getTime() -
            (a.analysis["startedAt"] as Date).getTime(),
        )
        .map((row) => summarize(row.analysis)),
    ),
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
const userRepository = await import("@/server/repositories/user.repository");
const membershipRepository = await import("@/server/repositories/project-membership.repository");
const changeRepository = await import("@/server/repositories/change-request.repository");
const revisionRepository = await import("@/server/repositories/project-revision.repository");
const auditLogRepository = await import("@/server/repositories/audit-log.repository");
const analysisRepository = (await import(
  "@/server/repositories/impact-analysis.repository"
)) as unknown as { __reset: () => void } & Record<string, ReturnType<typeof vi.fn>>;

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
  identifier: "CR-001",
  title: "Raise the chamber pressure limit",
  description: "Raise the limit from 120 to 130 bar.",
  reason: "Performance shortfall.",
  status: "DRAFT" as const,
  requestedById: CONTEXT.actorId,
  createdAt: new Date("2026-02-01T00:00:00.000Z"),
  updatedAt: new Date("2026-02-01T00:00:00.000Z"),
};

// A real slice of a programme:
//
//   SN-1 ─▶ REQ-1 ─┬─allocated▶ DI-1 ─provides▶ IF-1
//                  ├─verified by▶ VA-1
//                  └─linked to──▶ ED-1 ─┬─assumption▶ AS-1
//                                       └─expectation▶ EX-1
//   RISK-1 ─affects▶ REQ-1        APPROVAL-1 ─relates to▶ REQ-1
const need = graphNode("STAKEHOLDER_NEED", "sn1");
const requirement = graphNode("REQUIREMENT", "req1");
const designItem = graphNode("DESIGN_ITEM", "di1");
const interfaceDef = graphNode("INTERFACE_DEFINITION", "if1");
const verification = graphNode("VERIFICATION_ACTIVITY", "va1");
const decision = graphNode("ENGINEERING_DECISION", "ed1");
const assumption = graphNode("DECISION_ASSUMPTION", "as1");
const expectation = graphNode("DECISION_EXPECTATION", "ex1");
const risk = graphNode("RISK", "risk1");
const approval = graphNode("APPROVAL", "app1");

function buildGraph() {
  return new GraphFixture(
    [
      need,
      requirement,
      designItem,
      interfaceDef,
      verification,
      decision,
      assumption,
      expectation,
      risk,
      approval,
    ],
    [
      graphEdge("STAKEHOLDER_NEED_DERIVES_REQUIREMENT", nodeRef(need), nodeRef(requirement), "eNeed"),
      graphEdge("REQUIREMENT_ALLOCATED_TO_DESIGN", nodeRef(requirement), nodeRef(designItem), "eDesign"),
      graphEdge("DESIGN_CONNECTS_INTERFACE", nodeRef(designItem), nodeRef(interfaceDef), "eIface"),
      graphEdge("REQUIREMENT_VERIFIED_BY", nodeRef(requirement), nodeRef(verification), "eVerify"),
      graphEdge("REQUIREMENT_LINKED_TO_DECISION", nodeRef(requirement), nodeRef(decision), "eDecision"),
      graphEdge("DECISION_HAS_ASSUMPTION", nodeRef(decision), nodeRef(assumption), "eAssume"),
      graphEdge("DECISION_HAS_EXPECTATION", nodeRef(decision), nodeRef(expectation), "eExpect"),
      graphEdge("RISK_AFFECTS_REQUIREMENT", nodeRef(risk), nodeRef(requirement), "eRisk"),
      graphEdge("APPROVAL_RELATES_TO_OBJECT", nodeRef(approval), nodeRef(requirement), "eApprove"),
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

function useGraph(fixture: GraphFixture) {
  service = new ChangeImpactAnalysisService(new EngineeringGraphService(fixture));
}

beforeEach(() => {
  vi.clearAllMocks();
  analysisRepository.__reset();

  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
  // CONTEXT's actor is treated as the organization owner — full implicit
  // project access with no explicit ProjectMembership row needed.
  vi.mocked(membershipRepository.findMembership).mockResolvedValue(null);
  vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("OWNER");
  vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(CHANGE);
  vi.mocked(changeRepository.listDeclaredImpacts).mockResolvedValue([
    declaredImpact("REQUIREMENT", requirement.id, "imp1"),
  ]);
  vi.mocked(revisionRepository.computeProjectFingerprint).mockResolvedValue("fingerprint-a");
  vi.mocked(auditLogRepository.listAuditEventsForEntity).mockResolvedValue([]);

  useGraph(buildGraph());
});

function findingFor(report: ImpactAnalysisReport, id: string) {
  return report.findings.find((finding) => finding.node.id === id);
}

describe("roots", () => {
  it("makes each declared impact a DIRECT finding at depth zero", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    const root = findingFor(report, requirement.id)!;
    expect(root.classification).toBe("DIRECT");
    expect(root.status).toBe("POTENTIALLY_AFFECTED");
    expect(root.depth).toBe(0);
    expect(root.basis).toContain("DECLARED_IMPACT");
    expect(root.path).toEqual([]);
  });

  it("records the root itself, never the change request", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    // The analysis starts at the declared target. A change pointing at itself
    // would be nonsense.
    expect(report.roots.map((root) => root.node)).toEqual([
      { type: "REQUIREMENT", id: requirement.id },
    ]);
    expect(report.findings.some((f) => f.node.type === "CHANGE_REQUEST")).toBe(false);
  });

  it("links each root back to the declaration it came from", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    expect(report.roots[0]?.declaredImpactId).toBe("imp1");
    expect(report.roots[0]?.resolved).toBe(true);
  });

  it("merges multiple roots into one finding set", async () => {
    vi.mocked(changeRepository.listDeclaredImpacts).mockResolvedValue([
      declaredImpact("REQUIREMENT", requirement.id, "imp1"),
      declaredImpact("DESIGN_ITEM", designItem.id, "imp2"),
    ]);

    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    expect(report.roots).toHaveLength(2);
    // One finding per object, however many roots reached it.
    const ids = report.findings.map((finding) => finding.node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("keeps DIRECT when an object is both declared and discovered", async () => {
    vi.mocked(changeRepository.listDeclaredImpacts).mockResolvedValue([
      declaredImpact("REQUIREMENT", requirement.id, "imp1"),
      // Also reachable downstream of the requirement.
      declaredImpact("DESIGN_ITEM", designItem.id, "imp2"),
    ]);

    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    // What the engineer asserted outranks what the walk inferred.
    expect(findingFor(report, designItem.id)?.classification).toBe("DIRECT");
    expect(findingFor(report, designItem.id)?.basis).toContain("DECLARED_IMPACT");
  });

  it("records an unresolvable declared target as UNKNOWN rather than dropping it", async () => {
    vi.mocked(changeRepository.listDeclaredImpacts).mockResolvedValue([
      declaredImpact("REQUIREMENT", "ghost", "imp-ghost"),
    ]);

    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    const finding = findingFor(report, "ghost")!;
    expect(finding.classification).toBe("UNKNOWN");
    expect(finding.status).toBe("UNKNOWN");
    expect(finding.basis).toContain("ROOT_NOT_RESOLVABLE");
    expect(report.roots[0]?.resolved).toBe(false);
  });
});

describe("propagation", () => {
  it("reaches downstream objects the requirement points at", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    const reached = report.findings.map((finding) => finding.node.id);
    expect(reached).toContain(designItem.id);
    expect(reached).toContain(verification.id);
    expect(reached).toContain(decision.id);
  });

  it("keeps walking past the first hop", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    expect(findingFor(report, interfaceDef.id)?.depth).toBe(2);
    expect(findingFor(report, assumption.id)?.depth).toBe(2);
  });

  it("does not walk upstream as though it were impact", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    // The need the requirement derives from is context, not something the
    // change propagates into.
    expect(findingFor(report, need.id)?.classification).toBe("UPSTREAM_CONTEXT");
  });

  it("never follows the declared-impact edge itself", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    for (const finding of report.findings) {
      expect(finding.path.map((step) => step.edgeType)).not.toContain("CHANGE_IMPACTS_OBJECT");
    }
  });
});

describe("classification", () => {
  it("marks a same-domain hop DOWNSTREAM", async () => {
    const parent = graphNode("REQUIREMENT", "reqParent");
    const child = graphNode("REQUIREMENT", "reqChild");
    useGraph(
      new GraphFixture(
        [parent, child],
        [
          graphEdge(
            "REQUIREMENT_DEPENDS_ON_REQUIREMENT",
            nodeRef(parent),
            nodeRef(child),
            "eDecompose",
          ),
        ],
      ),
    );
    vi.mocked(changeRepository.listDeclaredImpacts).mockResolvedValue([
      declaredImpact("REQUIREMENT", parent.id, "imp1"),
    ]);

    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    // Multi-hop is not the same thing as cross-domain.
    expect(findingFor(report, child.id)?.classification).toBe("DOWNSTREAM");
  });

  it("marks a hop that leaves the domain CROSS_DOMAIN", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    expect(findingFor(report, designItem.id)?.classification).toBe("CROSS_DOMAIN");
    expect(findingFor(report, verification.id)?.classification).toBe("CROSS_DOMAIN");
    expect(findingFor(report, designItem.id)?.basis).toContain("DOMAIN_BOUNDARY_CROSSED");
  });

  it("measures the crossing against the root, not against the last hop", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    // From a requirement root, everything in the decision domain is a crossing
    // — including the decision's own assumption, which is two hops away but
    // still outside the domain the change was declared in. That is the question
    // an engineer is asking: did this change reach out of its own domain?
    expect(findingFor(report, decision.id)?.classification).toBe("CROSS_DOMAIN");
    expect(findingFor(report, assumption.id)?.classification).toBe("CROSS_DOMAIN");
    expect(findingFor(report, assumption.id)?.basis).toContain("DOMAIN_BOUNDARY_CROSSED");
  });

  it("does not report a crossing when the root is already in that domain", async () => {
    // Same assumption, reached from the decision itself: no boundary is crossed.
    vi.mocked(changeRepository.listDeclaredImpacts).mockResolvedValue([
      declaredImpact("ENGINEERING_DECISION", decision.id, "imp1"),
    ]);

    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    expect(findingFor(report, assumption.id)?.classification).toBe("DOWNSTREAM");
    expect(findingFor(report, assumption.id)?.basis).not.toContain("DOMAIN_BOUNDARY_CROSSED");
  });

  it("surfaces inbound neighbours as context, not as impact", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    for (const id of [risk.id, approval.id, need.id]) {
      const finding = findingFor(report, id)!;
      expect(finding.classification).toBe("UPSTREAM_CONTEXT");
      expect(finding.status).toBe("NOT_EVALUATED");
    }
  });

  it("stops context at one hop", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    const context = report.findings.filter((f) => f.classification === "UPSTREAM_CONTEXT");
    expect(context.length).toBeGreaterThan(0);
    expect(context.every((finding) => finding.depth === 1)).toBe(true);
  });
});

describe("what the engine refuses to conclude", () => {
  it("identifies an assumption without judging it", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    const finding = findingFor(report, assumption.id)!;
    expect(finding.basis).toContain("ASSUMPTION_PRESENT");
    expect(finding.basis).toContain("ASSUMPTION_VALIDITY_NOT_EVALUATED");
    expect(finding.status).toBe("POTENTIALLY_AFFECTED");
    expect(finding.basis.join(" ")).not.toMatch(/INVALID|BROKEN/);
  });

  it("identifies an expectation without evaluating it", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    const finding = findingFor(report, expectation.id)!;
    expect(finding.basis).toContain("EXPECTATION_PRESENT");
    expect(finding.basis).toContain("EXPECTATION_OUTCOME_NOT_EVALUATED");
    expect(finding.basis.join(" ")).not.toMatch(/BREACH|MISSED/);
  });

  it("identifies a verification activity without declaring it failed", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    const finding = findingFor(report, verification.id)!;
    expect(finding.basis).toContain("VERIFICATION_ACTIVITY_AFFECTED");
    expect(finding.basis).toContain("VERIFICATION_OUTCOME_NOT_EVALUATED");
    expect(finding.status).toBe("POTENTIALLY_AFFECTED");
    expect(finding.basis.join(" ")).not.toMatch(/FAIL/);
  });

  it("carries no score, severity or probability on any finding", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    for (const finding of report.findings) {
      expect(Object.keys(finding)).not.toContain("severity");
      expect(Object.keys(finding)).not.toContain("score");
      expect(Object.keys(finding)).not.toContain("confidence");
    }
  });
});

describe("provenance", () => {
  it("records the exact path that reached each object", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    expect(findingFor(report, interfaceDef.id)?.path).toEqual([
      {
        edgeType: "REQUIREMENT_ALLOCATED_TO_DESIGN",
        relationshipId: "eDesign",
        traversed: "FORWARD",
        from: { type: "REQUIREMENT", id: requirement.id },
        to: { type: "DESIGN_ITEM", id: designItem.id },
      },
      {
        edgeType: "DESIGN_CONNECTS_INTERFACE",
        relationshipId: "eIface",
        traversed: "FORWARD",
        from: { type: "DESIGN_ITEM", id: designItem.id },
        to: { type: "INTERFACE_DEFINITION", id: interfaceDef.id },
      },
    ]);
  });

  it("marks a context hop as traversed in reverse", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    expect(findingFor(report, risk.id)?.path[0]?.traversed).toBe("REVERSE");
  });

  it("cites the relationship row behind every hop", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    for (const finding of report.findings) {
      for (const step of finding.path) {
        expect(step.relationshipId).toBeTruthy();
      }
    }
  });

  it("keeps the shortest path and counts the alternatives", async () => {
    const a = graphNode("REQUIREMENT", "a");
    const b = graphNode("REQUIREMENT", "b");
    const c = graphNode("DESIGN_ITEM", "c");
    useGraph(
      new GraphFixture(
        [a, b, c],
        [
          graphEdge("REQUIREMENT_DEPENDS_ON_REQUIREMENT", nodeRef(a), nodeRef(b), "ab"),
          graphEdge("REQUIREMENT_ALLOCATED_TO_DESIGN", nodeRef(b), nodeRef(c), "bc"),
          graphEdge("REQUIREMENT_ALLOCATED_TO_DESIGN", nodeRef(a), nodeRef(c), "ac"),
        ],
      ),
    );
    vi.mocked(changeRepository.listDeclaredImpacts).mockResolvedValue([
      declaredImpact("REQUIREMENT", a.id, "imp1"),
    ]);

    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    const finding = findingFor(report, c.id)!;
    expect(finding.depth).toBe(1);
    expect(finding.path.map((step) => step.relationshipId)).toEqual(["ac"]);
  });
});

describe("summary counts", () => {
  it("derives every count from the findings actually persisted", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);
    const { summary } = report.analysis;

    const count = (classification: string) =>
      report.findings.filter((f) => f.classification === classification).length;

    expect(summary.findings).toBe(report.findings.length);
    expect(summary.direct).toBe(count("DIRECT"));
    expect(summary.downstream).toBe(count("DOWNSTREAM"));
    expect(summary.crossDomain).toBe(count("CROSS_DOMAIN"));
    expect(summary.upstreamContext).toBe(count("UPSTREAM_CONTEXT"));
    expect(summary.unknown).toBe(count("UNKNOWN"));
    expect(summary.notEvaluated).toBe(
      report.findings.filter((f) => f.status === "NOT_EVALUATED").length,
    );
  });

  it("reports the change's declared impact count alongside the roots", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    expect(report.analysis.summary.declaredImpacts).toBe(1);
    expect(report.analysis.summary.roots).toBe(1);
  });
});

describe("limits", () => {
  it("applies and records the caps it was given", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID, {
      maxDepth: 1,
    });

    expect(report.analysis.limits.maxDepth).toBe(1);
    // Nothing beyond one hop from the requirement.
    expect(findingFor(report, interfaceDef.id)).toBeUndefined();
    expect(report.analysis.limits.truncated).toBe(true);
  });

  it("rejects a request beyond the ceiling rather than clamping it", async () => {
    await expect(
      service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID, { maxDepth: 99 }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects parameters the engine does not accept", async () => {
    await expect(
      service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID, { roots: ["req1"] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("reproducibility", () => {
  it("produces an equivalent result when nothing has changed", async () => {
    const first = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);
    const second = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    // Different rows, same conclusion.
    expect(second.analysis.id).not.toBe(first.analysis.id);
    expect(analysisSignature(second)).toBe(analysisSignature(first));
  });

  it("does not depend on the order declarations were entered in", async () => {
    const declarations = [
      declaredImpact("REQUIREMENT", requirement.id, "imp1"),
      declaredImpact("DESIGN_ITEM", designItem.id, "imp2"),
    ];

    vi.mocked(changeRepository.listDeclaredImpacts).mockResolvedValue(declarations);
    const first = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    vi.mocked(changeRepository.listDeclaredImpacts).mockResolvedValue([...declarations].reverse());
    const second = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    expect(analysisSignature(second)).toBe(analysisSignature(first));
  });

  it("records the engine version that produced it", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    expect(report.analysis.engineVersion).toBe(IMPACT_ENGINE_VERSION);
  });
});

describe("history and freshness", () => {
  it("keeps every run rather than overwriting the previous one", async () => {
    await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);
    await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    const history = await service.listImpactAnalyses(CONTEXT, PROJECT_ID, CHANGE_ID);
    expect(history).toHaveLength(2);
  });

  it("returns the newest run as the latest", async () => {
    await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);
    const second = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    const latest = await service.getLatestImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);
    expect(hasImpactAnalysis(latest) && latest.analysis.id).toBe(second.analysis.id);
  });

  it("reports a run as current while the source state is unchanged", async () => {
    await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    const latest = await service.getLatestImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);
    expect(hasImpactAnalysis(latest) && latest.freshness).toBe("CURRENT");
  });

  it("reports a run as stale once the source state moves", async () => {
    await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    vi.mocked(revisionRepository.computeProjectFingerprint).mockResolvedValue("fingerprint-b");

    const latest = await service.getLatestImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);
    expect(hasImpactAnalysis(latest) && latest.freshness).toBe("STALE");
  });

  it("does not re-run when the result is read", async () => {
    await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);
    const createdOnce = analysisRepository["createAnalysis"]!.mock.calls.length;

    vi.mocked(revisionRepository.computeProjectFingerprint).mockResolvedValue("fingerprint-b");
    await service.getLatestImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    // A stale result is reported as stale, never quietly refreshed.
    expect(analysisRepository["createAnalysis"]!.mock.calls.length).toBe(createdOnce);
  });

  it("says NOT_RUN rather than showing an empty analysis", async () => {
    const latest = await service.getLatestImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    // Zero counts would read as "we looked and found nothing".
    expect(hasImpactAnalysis(latest)).toBe(false);
    expect(latest).toEqual({
      status: "NOT_RUN",
      changeRequestId: CHANGE_ID,
      engineVersion: IMPACT_ENGINE_VERSION,
    });
  });
});

describe("tenancy", () => {
  it("404s when the project is not in the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    await expect(
      service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("404s for a change that is not in the project", async () => {
    vi.mocked(changeRepository.findChangeRequestInProject).mockResolvedValue(null);

    await expect(
      service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("404s for an analysis id from another project", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue({
      ...PROJECT,
      id: "proj2aaaaaaaaaaaaaaaaaaa",
    });

    await expect(
      service.getImpactAnalysis(CONTEXT, "proj2aaaaaaaaaaaaaaaaaaa", report.analysis.id),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("failure", () => {
  it("records a failed run rather than reporting a partial success", async () => {
    const exploding = buildGraph();
    vi.spyOn(exploding, "getEdges").mockRejectedValue(new Error("connection reset"));
    useGraph(exploding);

    await expect(service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID)).rejects.toThrow();

    expect(analysisRepository["failAnalysis"]).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringMatching(/could not be completed/i),
    );
  });

  it("does not leak internal detail in the failure reason", async () => {
    const exploding = buildGraph();
    vi.spyOn(exploding, "getEdges").mockRejectedValue(
      new Error('relation "impact_findings" does not exist'),
    );
    useGraph(exploding);

    await expect(service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID)).rejects.toThrow();

    const [, reason] = analysisRepository["failAnalysis"]!.mock.calls[0]!;
    expect(String(reason)).not.toMatch(/relation|impact_findings/);
  });

  it("writes no findings for a failed run", async () => {
    const exploding = buildGraph();
    vi.spyOn(exploding, "getEdges").mockRejectedValue(new Error("boom"));
    useGraph(exploding);

    await expect(service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID)).rejects.toThrow();

    expect(analysisRepository["createFindings"]).not.toHaveBeenCalled();
    expect(analysisRepository["completeAnalysis"]).not.toHaveBeenCalled();
  });
});

describe("audit", () => {
  it("records who ran the analysis, against what, with which engine", async () => {
    const report = await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "change.impact_analysis_run",
        entityType: "ImpactAnalysis",
        entityId: report.analysis.id,
        actorId: CONTEXT.actorId,
        organizationId: CONTEXT.organizationId,
        metadata: expect.objectContaining({
          changeRequestId: CHANGE_ID,
          engineVersion: IMPACT_ENGINE_VERSION,
        }),
      }),
      TX,
    );
  });

  it("does not put the findings themselves in the audit event", async () => {
    await service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID);

    const [event] = vi.mocked(auditLogRepository.recordAuditEvent).mock.calls[0]!;
    // The analysis row is the detailed record; the audit event points at it.
    expect(JSON.stringify(event)).not.toContain("REQUIREMENT_ALLOCATED_TO_DESIGN");
  });

  it("audits a failed run too", async () => {
    const exploding = buildGraph();
    vi.spyOn(exploding, "getEdges").mockRejectedValue(new Error("boom"));
    useGraph(exploding);

    await expect(service.runImpactAnalysis(CONTEXT, PROJECT_ID, CHANGE_ID)).rejects.toThrow();

    expect(auditLogRepository.recordAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({ action: "change.impact_analysis_failed" }),
    );
  });
});
