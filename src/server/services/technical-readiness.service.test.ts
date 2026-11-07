// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TECHNICAL_READINESS_VERSION,
  type AssumptionStatus,
  type ChangeRequestStatus,
  type DecisionStatus,
  type DesignItemStatus,
  type IssueSeverity,
  type IssueStatus,
  type Project,
  type RequirementStatus,
  type RiskStatus,
  type TechnicalReadinessGate,
  type TechnicalReadinessReport,
  type VerificationStatus,
  hasTechnicalReadiness,
  technicalReadinessSignature,
} from "@/domain";
import { ForbiddenError, NotFoundError, ValidationError } from "@/server/errors";
import type { RawEdge } from "@/server/repositories/graph-edge-resolvers";
import {
  BASELINE_REVISION,
  FIXTURE_PROJECT,
  GraphFixture,
  graphEdge,
  graphNode,
  nodeRef,
  resetGraphClock,
} from "@/tests/fixtures/graph-fixture";

/**
 * The gate engine, driven over a hand-built graph.
 *
 * The *real* `EngineeringGraphService` runs on top of an in-memory graph
 * fixture, so the scope walk, the rule registry and the precedence logic are all
 * genuinely exercised — none of it is stubbed. Only persistence, tenancy lookups
 * and the state reads other modules own are faked, and the fake store keeps rows
 * so a report is assembled from what was actually "written".
 *
 * The verification-readiness engine is injected as a stub that returns verdicts:
 * this suite proves that technical readiness *consumes* them correctly, and
 * deliberately does not re-test how they were produced.
 */

const TX = { __transaction: true } as const;

const CONTEXT = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
};

const PROJECT_ID = FIXTURE_PROJECT;

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

vi.mock("@/server/repositories/technical-readiness-scope.repository", () => ({
  loadRequirements: vi.fn(),
  loadDesignItems: vi.fn(),
  loadDecisions: vi.fn(),
  loadAssumptions: vi.fn(),
  loadVerificationActivities: vi.fn(),
  loadStakeholderNeeds: vi.fn(),
  loadRisks: vi.fn(),
  loadIssues: vi.fn(),
  loadActiveChangeRequests: vi.fn(),
  loadLatestAnalyses: vi.fn(),
  loadAnalysisReach: vi.fn(),
}));

vi.mock("@/server/repositories/assumption-monitoring.repository", () => ({
  findLatestForAssumptions: vi.fn(),
}));

vi.mock("@/server/repositories/verification-readiness.repository", () => ({
  findLatestForActivities: vi.fn(async () => new Map()),
}));

vi.mock("@/server/repositories/project-revision.repository", () => ({
  computeProjectFingerprint: vi.fn(),
}));

// Async, matching the real signature: the service attaches a `.catch` to the
// "started" event so losing that marker cannot abort an evaluation.
vi.mock("@/server/repositories/audit-log.repository", () => ({
  recordAuditEvent: vi.fn(async () => undefined),
}));

// An in-memory assessment store, so a report the service returns is assembled
// from rows it actually persisted rather than from its own intent to write.
vi.mock("@/server/repositories/technical-readiness.repository", () => {
  interface Row {
    assessment: Record<string, unknown>;
    findings: Record<string, unknown>[];
  }
  const store = new Map<string, Row>();
  let counter = 0;

  const shape = (a: Record<string, unknown>) => ({
    id: a["id"],
    projectId: a["projectId"],
    gate: a["gate"],
    status: a["status"],
    readinessVersion: a["readinessVersion"],
    fingerprint: a["fingerprint"],
    summary: {
      findings: a["findingCount"],
      blocking: a["blockingCount"],
      warning: a["warningCount"],
      informational: a["informationalCount"],
      unknown: a["unknownCount"],
    },
    evaluatedAt: a["evaluatedAt"],
    evaluatedById: a["evaluatedById"],
    createdAt: a["createdAt"],
  });

  const newestFirst = (rows: Row[]) =>
    [...rows].sort(
      (a, b) =>
        (b.assessment["evaluatedAt"] as Date).getTime() -
        (a.assessment["evaluatedAt"] as Date).getTime(),
    );

  return {
    __store: store,
    __reset: () => {
      store.clear();
      counter = 0;
    },
    createAssessment: vi.fn(async (input: Record<string, unknown>) => {
      counter += 1;
      const id = `assessment${counter}`;
      const assessment = {
        id,
        ...input,
        evaluatedAt: new Date(2026, 0, 1, 0, 0, counter),
        createdAt: new Date(2026, 0, 1, 0, 0, counter),
      };
      store.set(id, { assessment, findings: [] });
      return shape(assessment);
    }),
    createFindings: vi.fn(async (assessmentId: string, findings: Record<string, unknown>[]) => {
      const row = store.get(assessmentId);
      if (!row) return 0;
      findings.forEach((finding, index) => {
        row.findings.push({
          id: `${assessmentId}-finding${index}`,
          assessmentId,
          createdAt: new Date(2026, 0, 1),
          ...finding,
        });
      });
      return findings.length;
    }),
    listFindings: vi.fn(async (assessmentId: string) =>
      [...(store.get(assessmentId)?.findings ?? [])].sort(
        (a, b) => (a["sequence"] as number) - (b["sequence"] as number),
      ),
    ),
    findLatestAssessment: vi.fn(async (projectId: string, gate: string) => {
      const rows = newestFirst(
        [...store.values()].filter(
          (row) =>
            row.assessment["projectId"] === projectId && row.assessment["gate"] === gate,
        ),
      );
      return rows[0] ? shape(rows[0].assessment) : null;
    }),
    listAssessments: vi.fn(async (projectId: string, gate: string | undefined) =>
      newestFirst(
        [...store.values()].filter(
          (row) =>
            row.assessment["projectId"] === projectId &&
            (gate === undefined || row.assessment["gate"] === gate),
        ),
      ).map((row) => shape(row.assessment)),
    ),
    findAssessmentInProject: vi.fn(async (projectId: string, assessmentId: string) => {
      const row = store.get(assessmentId);
      if (!row || row.assessment["projectId"] !== projectId) return null;
      return shape(row.assessment);
    }),
    readAssessmentScope: vi.fn(async (assessment: { id: string }) => {
      const row = store.get(assessment.id);
      return row?.assessment["scope"] ?? null;
    }),
    findLatestPerGate: vi.fn(async () => new Map()),
  };
});

const projectRepository = await import("@/server/repositories/project.repository");
const userRepository = await import("@/server/repositories/user.repository");
const membershipRepository = await import("@/server/repositories/project-membership.repository");
const scopeRepository = await import(
  "@/server/repositories/technical-readiness-scope.repository"
);
const monitoringRepository = await import(
  "@/server/repositories/assumption-monitoring.repository"
);
const verificationReadinessRepository = await import(
  "@/server/repositories/verification-readiness.repository"
);
const revisionRepository = await import("@/server/repositories/project-revision.repository");
const auditLogRepository = await import("@/server/repositories/audit-log.repository");
const readinessRepository = (await import(
  "@/server/repositories/technical-readiness.repository"
)) as unknown as { __reset: () => void } & Record<string, ReturnType<typeof vi.fn>>;

const { EngineeringGraphService } = await import("./engineering-graph.service");
const { TechnicalReadinessService } = await import("./technical-readiness.service");

const PROJECT: Project = {
  id: PROJECT_ID,
  organizationId: CONTEXT.organizationId,
  name: "Upper Stage Propulsion",
  description: null,
  status: "ACTIVE",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

// --- Scenario construction --------------------------------------------------

interface RequirementSpec {
  id: string;
  status: RequirementStatus;
}

interface DesignSpec {
  id: string;
  status: DesignItemStatus;
  /** The requirement allocated to it. Omit for an unallocated design item. */
  from?: string;
}

interface DecisionSpec {
  id: string;
  status: DecisionStatus;
  addresses?: string;
  shapes?: string;
}

interface AssumptionSpec {
  id: string;
  decisionId: string;
  status?: AssumptionStatus;
  monitoring?: "CURRENT" | "BASIS_CHANGED" | "REVIEW_REQUIRED" | null;
}

interface ActivitySpec {
  id: string;
  status?: VerificationStatus;
  /** The requirement it verifies. Omit for an activity outside the scope. */
  verifies?: string;
  evidence?: string[];
  readiness?: {
    assessmentId: string;
    status: "READY" | "NOT_READY" | "UNKNOWN";
    freshness: "CURRENT" | "STALE" | "UNKNOWN";
    blocking?: number;
  } | null;
}

interface NeedSpec {
  id: string;
  /** Whether a requirement is derived from it. */
  derives?: string;
}

interface ChangeSpec {
  id: string;
  status?: ChangeRequestStatus;
  analysis?: { id: string; status?: string; sourceFingerprint: string } | null;
  /** Scope node ids the analysis reached. */
  reaches?: Array<{ type: string; id: string }>;
}

interface Scenario {
  requirements?: RequirementSpec[];
  designItems?: DesignSpec[];
  decisions?: DecisionSpec[];
  assumptions?: AssumptionSpec[];
  activities?: ActivitySpec[];
  needs?: NeedSpec[];
  risks?: Array<{ id: string; status: RiskStatus }>;
  issues?: Array<{ id: string; severity: IssueSeverity; status: IssueStatus }>;
  changes?: ChangeSpec[];
  projectFingerprint?: string;
}

let fixture: GraphFixture;
let readinessByActivity: Map<string, ActivitySpec["readiness"]>;

/**
 * Builds a graph and wires the faked state reads to agree with it.
 *
 * The graph and the state maps are constructed from one spec so they cannot
 * drift — a test that adds a requirement to the graph automatically gets a
 * state row for it, and vice versa.
 */
function buildScenario(scenario: Scenario = {}): void {
  resetGraphClock();

  const requirements = scenario.requirements ?? [];
  const designItems = scenario.designItems ?? [];
  const decisions = scenario.decisions ?? [];
  const assumptions = scenario.assumptions ?? [];
  const activities = scenario.activities ?? [];
  const needs = scenario.needs ?? [];
  const risks = scenario.risks ?? [];
  const issues = scenario.issues ?? [];
  const changes = scenario.changes ?? [];

  const nodes = [graphNode("PROJECT", PROJECT_ID)];
  const edges: RawEdge[] = [];

  for (const requirement of requirements) {
    nodes.push(graphNode("REQUIREMENT", requirement.id));
  }
  for (const need of needs) {
    const node = graphNode("STAKEHOLDER_NEED", need.id);
    nodes.push(node);
    if (need.derives) {
      edges.push(
        graphEdge(
          "STAKEHOLDER_NEED_DERIVES_REQUIREMENT",
          nodeRef(node),
          { type: "REQUIREMENT", id: need.derives },
          `rel-need-${need.id}`,
        ),
      );
    }
  }
  for (const design of designItems) {
    const node = graphNode("DESIGN_ITEM", design.id);
    nodes.push(node);
    if (design.from) {
      edges.push(
        graphEdge(
          "REQUIREMENT_ALLOCATED_TO_DESIGN",
          { type: "REQUIREMENT", id: design.from },
          nodeRef(node),
          `rel-alloc-${design.id}`,
        ),
      );
    }
  }
  for (const decision of decisions) {
    const node = graphNode("ENGINEERING_DECISION", decision.id);
    nodes.push(node);
    if (decision.addresses) {
      edges.push({
        ...graphEdge(
          "REQUIREMENT_LINKED_TO_DECISION",
          { type: "REQUIREMENT", id: decision.addresses },
          nodeRef(node),
          `rel-dec-${decision.id}`,
        ),
        linkType: "DECISION_ADDRESSES_REQUIREMENT",
      });
    }
    if (decision.shapes) {
      edges.push(
        graphEdge(
          "DECISION_AFFECTS_DESIGN",
          nodeRef(node),
          { type: "DESIGN_ITEM", id: decision.shapes },
          `rel-shape-${decision.id}`,
        ),
      );
    }
  }
  for (const assumption of assumptions) {
    const node = graphNode("DECISION_ASSUMPTION", assumption.id);
    nodes.push(node);
    edges.push(
      graphEdge(
        "DECISION_HAS_ASSUMPTION",
        { type: "ENGINEERING_DECISION", id: assumption.decisionId },
        nodeRef(node),
        `rel-asm-${assumption.id}`,
      ),
    );
  }
  for (const activity of activities) {
    const node = graphNode("VERIFICATION_ACTIVITY", activity.id);
    nodes.push(node);
    if (activity.verifies) {
      edges.push(
        graphEdge(
          "REQUIREMENT_VERIFIED_BY",
          { type: "REQUIREMENT", id: activity.verifies },
          nodeRef(node),
          `rel-ver-${activity.id}`,
        ),
      );
    }
    for (const item of activity.evidence ?? []) {
      const evidenceNode = graphNode("EVIDENCE", item);
      nodes.push(evidenceNode);
      edges.push(
        graphEdge(
          "VERIFICATION_HAS_EVIDENCE",
          nodeRef(node),
          nodeRef(evidenceNode),
          `rel-ev-${item}`,
        ),
      );
    }
  }
  for (const risk of risks) nodes.push(graphNode("RISK", risk.id));
  for (const issue of issues) nodes.push(graphNode("ISSUE", issue.id));
  for (const change of changes) nodes.push(graphNode("CHANGE_REQUEST", change.id));

  fixture = new GraphFixture(nodes, edges);

  readinessByActivity = new Map(
    activities.map((activity) => [activity.id, activity.readiness ?? null]),
  );

  // Mirrors the real guard: a project resolves only from the organization that
  // owns it, so a caller naming someone else's project gets nothing.
  vi.mocked(projectRepository.findProjectInOrganization).mockImplementation(
    async (organizationId: string, id: string) =>
      organizationId === CONTEXT.organizationId && id === PROJECT_ID ? PROJECT : null,
  );
  // CONTEXT's actor is treated as the organization owner — full implicit
  // project access with no explicit ProjectMembership row needed.
  vi.mocked(membershipRepository.findMembership).mockResolvedValue(null);
  vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("OWNER");

  vi.mocked(scopeRepository.loadRequirements).mockResolvedValue(
    requirements.map((requirement) => ({
      id: requirement.id,
      identifier: requirement.id.toUpperCase(),
      title: `Requirement ${requirement.id}`,
      status: requirement.status,
    })),
  );

  vi.mocked(scopeRepository.loadDesignItems).mockResolvedValue(
    designItems.map((design) => ({
      id: design.id,
      identifier: design.id.toUpperCase(),
      name: `Design ${design.id}`,
      status: design.status,
    })),
  );

  vi.mocked(scopeRepository.loadDecisions).mockResolvedValue(
    decisions.map((decision) => ({
      id: decision.id,
      identifier: decision.id.toUpperCase(),
      title: `Decision ${decision.id}`,
      status: decision.status,
    })),
  );

  vi.mocked(scopeRepository.loadAssumptions).mockImplementation(
    async (_projectId: string, decisionIds: readonly string[]) =>
      assumptions
        .filter((assumption) => decisionIds.includes(assumption.decisionId))
        .map((assumption) => ({
          id: assumption.id,
          statement: `Assumption ${assumption.id}`,
          status: assumption.status ?? "UNKNOWN",
          engineeringDecisionId: assumption.decisionId,
        })),
  );

  vi.mocked(scopeRepository.loadVerificationActivities).mockResolvedValue(
    activities.map((activity) => ({
      id: activity.id,
      identifier: activity.id.toUpperCase(),
      title: `Activity ${activity.id}`,
      method: "TEST" as const,
      status: activity.status ?? "PLANNED",
    })),
  );

  vi.mocked(scopeRepository.loadStakeholderNeeds).mockResolvedValue(
    needs.map((need) => ({
      id: need.id,
      identifier: need.id.toUpperCase(),
      title: `Need ${need.id}`,
    })),
  );

  vi.mocked(scopeRepository.loadRisks).mockResolvedValue(
    risks.map((risk) => ({
      id: risk.id,
      identifier: risk.id.toUpperCase(),
      title: `Risk ${risk.id}`,
      status: risk.status,
    })),
  );

  vi.mocked(scopeRepository.loadIssues).mockResolvedValue(
    issues.map((issue) => ({
      id: issue.id,
      identifier: issue.id.toUpperCase(),
      title: `Issue ${issue.id}`,
      severity: issue.severity,
      status: issue.status,
    })),
  );

  vi.mocked(scopeRepository.loadActiveChangeRequests).mockResolvedValue(
    changes.map((change) => ({
      id: change.id,
      identifier: change.id.toUpperCase(),
      title: `Change ${change.id}`,
      status: change.status ?? "UNDER_REVIEW",
    })),
  );

  vi.mocked(scopeRepository.loadLatestAnalyses).mockResolvedValue(
    new Map(
      changes
        .filter((change) => change.analysis)
        .map((change) => [
          change.id,
          {
            changeRequestId: change.id,
            id: change.analysis!.id,
            status: (change.analysis!.status ?? "COMPLETED") as never,
            sourceFingerprint: change.analysis!.sourceFingerprint,
            startedAt: new Date("2026-02-01T00:00:00.000Z"),
          },
        ]),
    ),
  );

  vi.mocked(scopeRepository.loadAnalysisReach).mockResolvedValue(
    changes.flatMap((change) =>
      change.analysis
        ? (change.reaches ?? []).map((reach) => ({
            analysisId: change.analysis!.id,
            nodeType: reach.type,
            nodeId: reach.id,
          }))
        : [],
    ),
  );

  vi.mocked(monitoringRepository.findLatestForAssumptions).mockResolvedValue(
    new Map(
      assumptions
        .filter((assumption) => assumption.monitoring)
        .map((assumption) => [
          assumption.id,
          { id: `mon-${assumption.id}`, status: assumption.monitoring },
        ]) as never,
    ),
  );

  vi.mocked(verificationReadinessRepository.findLatestForActivities).mockResolvedValue(
    new Map(
      activities
        .filter((activity) => activity.readiness)
        .map((activity) => [activity.id, { id: activity.readiness!.assessmentId }]) as never,
    ),
  );

  vi.mocked(revisionRepository.computeProjectFingerprint).mockResolvedValue(
    scenario.projectFingerprint ?? "fp-project",
  );
}

/**
 * A stub standing in for the verification-readiness engine.
 *
 * Technical readiness consumes verdicts; it does not produce them. Stubbing the
 * engine here is the point — it proves the gate reads what the other engine
 * said, without re-testing how that engine reached it.
 */
function verificationReadinessStub() {
  return {
    getLatestVerificationReadiness: vi.fn(
      async (_context: unknown, _projectId: unknown, activityId: unknown) => {
        const readiness = readinessByActivity.get(activityId as string);
        if (!readiness) {
          return {
            status: "NOT_EVALUATED" as const,
            verificationActivityId: activityId as string,
            readinessVersion: "1",
          };
        }
        return {
          assessment: {
            id: readiness.assessmentId,
            projectId: PROJECT_ID,
            verificationActivityId: activityId as string,
            status: readiness.status,
            scope: "EXECUTION" as const,
            readinessVersion: "1",
            fingerprint: "fp-vr",
            summary: {
              findings: 1,
              blocking: readiness.blocking ?? 0,
              warning: 0,
              informational: 1,
              unknown: 0,
            },
            evaluatedAt: new Date("2026-02-01T00:00:00.000Z"),
            evaluatedById: CONTEXT.actorId,
            createdAt: new Date("2026-02-01T00:00:00.000Z"),
          },
          freshness: readiness.freshness,
          findings: [],
          basis: {
            verificationActivityId: activityId as string,
            scope: "EXECUTION" as const,
            objects: [],
            relationships: [],
            monitoring: [],
            changes: [],
          },
        };
      },
    ),
  };
}

let verificationStub: ReturnType<typeof verificationReadinessStub>;

function service() {
  verificationStub = verificationReadinessStub();
  return new TechnicalReadinessService(
    new EngineeringGraphService(fixture),
    verificationStub as never,
  );
}

async function evaluate(gate: TechnicalReadinessGate): Promise<TechnicalReadinessReport> {
  return service().evaluateTechnicalReadiness(CONTEXT, PROJECT_ID, { gate });
}

function ruleIds(report: TechnicalReadinessReport): string[] {
  return report.findings.map((finding) => finding.ruleId);
}

function findingFor(report: TechnicalReadinessReport, ruleId: string) {
  return report.findings.find((finding) => finding.ruleId === ruleId);
}

/** A project with one baselined requirement and nothing wrong with it. */
function healthy(overrides: Scenario = {}): Scenario {
  return {
    requirements: [{ id: "req1", status: "BASELINED" }],
    designItems: [{ id: "di1", status: "BASELINED", from: "req1" }],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  readinessRepository.__reset();
});

// --- Scope --------------------------------------------------------------

describe("the evaluated scope", () => {
  it("always records what it looked at", async () => {
    buildScenario(healthy());
    const report = await evaluate("SYSTEM_DEFINITION");

    const scope = findingFor(report, "TR-SCP-001");
    expect(scope?.status).toBe("INFORMATIONAL");
    expect(scope?.message).toMatch(/current active engineering scope/i);
    expect(report.scope.label).toBe("Current active engineering scope");
    expect(report.scope.counts.REQUIREMENT).toBe(1);
  });

  it("counts only objects the resolution actually reached", async () => {
    buildScenario(
      healthy({
        // An activity nothing verifies is not part of the active scope.
        activities: [{ id: "va1" }],
      }),
    );
    const report = await evaluate("SYSTEM_DEFINITION");

    expect(report.scope.counts.VERIFICATION_ACTIVITY).toBe(0);
    expect(report.scope.objects.some((object) => object.id === "va1")).toBe(false);
  });

  it("keeps a withdrawn requirement out of scope but visible in the count message", async () => {
    buildScenario({
      requirements: [
        { id: "req1", status: "BASELINED" },
        { id: "req2", status: "OBSOLETE" },
      ],
    });
    const report = await evaluate("SYSTEM_DEFINITION");

    expect(report.scope.counts.REQUIREMENT).toBe(1);
    expect(findingFor(report, "TR-REQ-006")?.message).toMatch(/1 requirement\(s\) are OBSOLETE/);
  });

  it("records no score, percentage or confidence anywhere", async () => {
    buildScenario(healthy());
    const report = await evaluate("DESIGN_REVIEW");

    expect(JSON.stringify(report)).not.toMatch(/"score"|"percent|"confidence"|"probability"/i);
  });

  it("only ever emits rules the registry declares for the gate", async () => {
    // The service owns no policy: nothing it emits can be absent from the
    // registry, and nothing can leak across a gate boundary.
    for (const gate of [
      "SYSTEM_DEFINITION",
      "DESIGN_REVIEW",
      "DESIGN_FREEZE",
      "VERIFICATION_READY",
      "RELEASE_READY",
    ] as TechnicalReadinessGate[]) {
      readinessRepository.__reset();
      buildScenario({
        requirements: [{ id: "req1", status: "DRAFT" }],
        designItems: [{ id: "di1", status: "DRAFT", from: "req1" }],
        decisions: [{ id: "ed1", status: "PROPOSED", addresses: "req1" }],
        assumptions: [{ id: "asm1", decisionId: "ed1", monitoring: "REVIEW_REQUIRED" }],
        activities: [{ id: "va1", verifies: "req1" }],
        needs: [{ id: "sn1" }],
        risks: [{ id: "risk1", status: "OPEN" }],
        issues: [{ id: "iss1", severity: "CRITICAL", status: "OPEN" }],
        changes: [{ id: "chg1", analysis: null }],
      });
      const report = await evaluate(gate);

      const { technicalReadinessRule, ruleAppliesToGate } = await import("@/domain");
      for (const finding of report.findings) {
        const rule = technicalReadinessRule(finding.ruleId);
        expect(rule, `${finding.ruleId} must exist in the registry`).not.toBeNull();
        expect(ruleAppliesToGate(rule!, gate)).toBe(true);
      }
    }
  });
});

// --- SYSTEM_DEFINITION ------------------------------------------------------

describe("SYSTEM_DEFINITION", () => {
  it("blocks a project that records no requirement", async () => {
    buildScenario({ requirements: [] });
    const report = await evaluate("SYSTEM_DEFINITION");

    expect(report.assessment.status).toBe("NOT_READY");
    expect(findingFor(report, "TR-REQ-001")?.status).toBe("BLOCKING");
    expect(findingFor(report, "TR-REQ-001")?.message).toMatch(/records no requirement/);
  });

  it("blocks while a requirement is still a draft", async () => {
    buildScenario({ requirements: [{ id: "req1", status: "DRAFT" }] });
    const report = await evaluate("SYSTEM_DEFINITION");

    const finding = findingFor(report, "TR-REQ-002");
    expect(finding?.status).toBe("BLOCKING");
    expect(finding?.subjectIdentifier).toBe("REQ1");
    expect(finding?.message).toMatch(/REQ1 is DRAFT/);
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("only warns about a requirement under review at this gate", async () => {
    buildScenario({ requirements: [{ id: "req1", status: "IN_REVIEW" }] });
    const report = await evaluate("SYSTEM_DEFINITION");

    expect(findingFor(report, "TR-REQ-003")?.status).toBe("WARNING");
    expect(findingFor(report, "TR-REQ-004")).toBeUndefined();
    expect(report.assessment.status).toBe("READY");
  });

  it("surfaces a stakeholder need nothing was derived from", async () => {
    buildScenario(healthy({ needs: [{ id: "sn1" }] }));
    const report = await evaluate("SYSTEM_DEFINITION");

    const finding = findingFor(report, "TR-TRC-001");
    expect(finding?.status).toBe("WARNING");
    expect(finding?.subjectIdentifier).toBe("SN1");
    expect(report.assessment.status).toBe("READY");
  });

  it("says nothing about need traceability when a project records no needs", async () => {
    buildScenario(healthy());
    const report = await evaluate("SYSTEM_DEFINITION");

    // A project that does not use stakeholder needs is not penalised for it.
    expect(findingFor(report, "TR-TRC-001")).toBeUndefined();
  });

  it("does not penalise a need that is traced", async () => {
    buildScenario(healthy({ needs: [{ id: "sn1", derives: "req1" }] }));
    const report = await evaluate("SYSTEM_DEFINITION");

    expect(findingFor(report, "TR-TRC-001")).toBeUndefined();
    expect(findingFor(report, "TR-TRC-005")?.message).toMatch(/1 of 1 stakeholder need/);
  });

  it("reports an unmonitored assumption as indeterminate, never as a failure", async () => {
    buildScenario(
      healthy({
        decisions: [{ id: "ed1", status: "APPROVED", addresses: "req1" }],
        assumptions: [{ id: "asm1", decisionId: "ed1", monitoring: null }],
      }),
    );
    const report = await evaluate("SYSTEM_DEFINITION");

    const finding = findingFor(report, "TR-ASM-004");
    expect(finding?.status).toBe("UNKNOWN");
    expect(finding?.message).toMatch(/never been monitored/);
    expect(report.assessment.status).toBe("UNKNOWN");
    expect(report.assessment.summary.blocking).toBe(0);
  });

  it("blocks on an unresolved critical issue at every gate", async () => {
    buildScenario(healthy({ issues: [{ id: "iss1", severity: "CRITICAL", status: "OPEN" }] }));
    const report = await evaluate("SYSTEM_DEFINITION");

    expect(findingFor(report, "TR-ISS-001")?.status).toBe("BLOCKING");
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("reports open risks without ranking them", async () => {
    buildScenario(healthy({ risks: [{ id: "risk1", status: "OPEN" }] }));
    const report = await evaluate("SYSTEM_DEFINITION");

    const aggregate = findingFor(report, "TR-RSK-003");
    expect(aggregate?.status).toBe("INFORMATIONAL");
    expect(aggregate?.message).toMatch(/records no risk severity/);
    // Not a gate condition at this stage.
    expect(findingFor(report, "TR-RSK-001")).toBeUndefined();
    expect(findingFor(report, "TR-RSK-002")).toBeUndefined();
    expect(report.assessment.status).toBe("READY");
  });
});

// --- DESIGN_REVIEW ----------------------------------------------------------

describe("DESIGN_REVIEW", () => {
  it("blocks a project with no design item to review", async () => {
    buildScenario({ requirements: [{ id: "req1", status: "APPROVED" }] });
    const report = await evaluate("DESIGN_REVIEW");

    expect(findingFor(report, "TR-DES-001")?.status).toBe("BLOCKING");
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("warns about a requirement with no design allocation, without blocking", async () => {
    buildScenario({
      requirements: [
        { id: "req1", status: "APPROVED" },
        { id: "req2", status: "APPROVED" },
      ],
      designItems: [{ id: "di1", status: "APPROVED", from: "req1" }],
    });
    const report = await evaluate("DESIGN_REVIEW");

    const finding = findingFor(report, "TR-TRC-002");
    expect(finding?.status).toBe("WARNING");
    expect(finding?.subjectIdentifier).toBe("REQ2");
    expect(finding?.message).toMatch(/process one/);
    expect(report.assessment.status).toBe("READY");
  });

  it("blocks on an obsolete design item a live requirement still points at", async () => {
    buildScenario({
      requirements: [{ id: "req1", status: "APPROVED" }],
      designItems: [{ id: "di1", status: "OBSOLETE", from: "req1" }],
    });
    const report = await evaluate("DESIGN_REVIEW");

    const finding = findingFor(report, "TR-DES-002");
    expect(finding?.status).toBe("BLOCKING");
    expect(finding?.message).toMatch(/REQ1 is still allocated to it/);
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("ignores an obsolete design item nothing points at", async () => {
    buildScenario({
      requirements: [{ id: "req1", status: "APPROVED" }],
      designItems: [
        { id: "di1", status: "APPROVED", from: "req1" },
        { id: "di2", status: "OBSOLETE" },
      ],
    });
    const report = await evaluate("DESIGN_REVIEW");

    expect(findingFor(report, "TR-DES-002")).toBeUndefined();
    expect(report.scope.objects.some((object) => object.id === "di2")).toBe(false);
  });

  it("only warns about an uncontrolled design item at this gate", async () => {
    buildScenario({
      requirements: [{ id: "req1", status: "APPROVED" }],
      designItems: [{ id: "di1", status: "DRAFT", from: "req1" }],
    });
    const report = await evaluate("DESIGN_REVIEW");

    expect(findingFor(report, "TR-DES-003")?.status).toBe("WARNING");
    expect(findingFor(report, "TR-DES-004")).toBeUndefined();
    expect(report.assessment.status).toBe("READY");
  });

  it("only warns about an open decision at this gate", async () => {
    buildScenario(
      healthy({ decisions: [{ id: "ed1", status: "UNDER_REVIEW", addresses: "req1" }] }),
    );
    const report = await evaluate("DESIGN_REVIEW");

    expect(findingFor(report, "TR-DEC-001")?.status).toBe("WARNING");
    expect(findingFor(report, "TR-DEC-002")).toBeUndefined();
    expect(report.assessment.status).toBe("READY");
  });

  it("warns when an assumption behind a decision needs review", async () => {
    buildScenario(
      healthy({
        decisions: [{ id: "ed1", status: "APPROVED", addresses: "req1" }],
        assumptions: [
          { id: "asm1", decisionId: "ed1", status: "VALIDATED", monitoring: "REVIEW_REQUIRED" },
        ],
      }),
    );
    const report = await evaluate("DESIGN_REVIEW");

    expect(findingFor(report, "TR-ASM-002")?.status).toBe("WARNING");
    expect(findingFor(report, "TR-ASM-001")).toBeUndefined();
    expect(report.assessment.status).toBe("READY");
  });

  it("warns, without blocking, about a reviewed change reaching the scope", async () => {
    buildScenario(
      healthy({
        changes: [
          {
            id: "chg1",
            status: "UNDER_REVIEW",
            analysis: { id: "ana1", sourceFingerprint: "fp-project" },
            reaches: [{ type: "REQUIREMENT", id: "req1" }],
          },
        ],
      }),
    );
    const report = await evaluate("DESIGN_REVIEW");

    expect(findingFor(report, "TR-CHG-006")?.status).toBe("WARNING");
    expect(findingFor(report, "TR-CHG-005")).toBeUndefined();
    expect(report.assessment.status).toBe("READY");
  });
});

// --- DESIGN_FREEZE ----------------------------------------------------------

describe("DESIGN_FREEZE", () => {
  it("blocks a requirement that is still under review", async () => {
    buildScenario({
      requirements: [{ id: "req1", status: "IN_REVIEW" }],
      designItems: [{ id: "di1", status: "BASELINED", from: "req1" }],
    });
    const report = await evaluate("DESIGN_FREEZE");

    expect(findingFor(report, "TR-REQ-004")?.status).toBe("BLOCKING");
    expect(findingFor(report, "TR-REQ-003")).toBeUndefined();
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("blocks an open decision", async () => {
    buildScenario(
      healthy({ decisions: [{ id: "ed1", status: "PROPOSED", addresses: "req1" }] }),
    );
    const report = await evaluate("DESIGN_FREEZE");

    expect(findingFor(report, "TR-DEC-002")?.status).toBe("BLOCKING");
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("blocks an uncontrolled design item", async () => {
    buildScenario({
      requirements: [{ id: "req1", status: "BASELINED" }],
      designItems: [{ id: "di1", status: "IN_REVIEW", from: "req1" }],
    });
    const report = await evaluate("DESIGN_FREEZE");

    expect(findingFor(report, "TR-DES-004")?.status).toBe("BLOCKING");
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("blocks an unresolved high-severity issue", async () => {
    buildScenario(healthy({ issues: [{ id: "iss1", severity: "HIGH", status: "IN_PROGRESS" }] }));
    const report = await evaluate("DESIGN_FREEZE");

    expect(findingFor(report, "TR-ISS-002")?.status).toBe("BLOCKING");
    expect(findingFor(report, "TR-ISS-003")).toBeUndefined();
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("blocks a reviewed change that reaches the frozen scope", async () => {
    buildScenario(
      healthy({
        changes: [
          {
            id: "chg1",
            status: "APPROVED",
            analysis: { id: "ana1", sourceFingerprint: "fp-project" },
            reaches: [{ type: "REQUIREMENT", id: "req1" }],
          },
        ],
      }),
    );
    const report = await evaluate("DESIGN_FREEZE");

    const finding = findingFor(report, "TR-CHG-005");
    expect(finding?.status).toBe("BLOCKING");
    expect(finding?.message).toMatch(/reaches 1 object\(s\) in the evaluated scope/);
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("blocks an assumption that needs review", async () => {
    buildScenario(
      healthy({
        decisions: [{ id: "ed1", status: "APPROVED", addresses: "req1" }],
        assumptions: [
          { id: "asm1", decisionId: "ed1", status: "VALIDATED", monitoring: "REVIEW_REQUIRED" },
        ],
      }),
    );
    const report = await evaluate("DESIGN_FREEZE");

    expect(findingFor(report, "TR-ASM-001")?.status).toBe("BLOCKING");
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("warns about a verification activity with no readiness assessment", async () => {
    buildScenario(healthy({ activities: [{ id: "va1", verifies: "req1", readiness: null }] }));
    const report = await evaluate("DESIGN_FREEZE");

    expect(findingFor(report, "TR-VER-010")?.status).toBe("WARNING");
    // The verification-ready gate's own condition does not leak into this gate.
    expect(findingFor(report, "TR-VER-001")).toBeUndefined();
    expect(report.assessment.status).toBe("READY");
  });

  it("reads only the existence of a readiness assessment, never its verdict", async () => {
    buildScenario(
      healthy({
        activities: [
          {
            id: "va1",
            verifies: "req1",
            readiness: { assessmentId: "vra1", status: "NOT_READY", freshness: "STALE" },
          },
        ],
      }),
    );
    const report = await evaluate("DESIGN_FREEZE");

    // Existence satisfies TR-VER-010; the verdict belongs to another gate, so
    // this one must not depend on it.
    expect(findingFor(report, "TR-VER-010")).toBeUndefined();
    expect(report.scope.consumed.verificationReadiness[0]?.status).toBeNull();
    expect(verificationStub.getLatestVerificationReadiness).not.toHaveBeenCalled();
  });

  it("makes an un-analysed change indeterminate rather than merely noted", async () => {
    buildScenario(healthy({ changes: [{ id: "chg1", analysis: null }] }));
    const report = await evaluate("DESIGN_FREEZE");

    expect(findingFor(report, "TR-CHG-001")?.status).toBe("UNKNOWN");
    expect(findingFor(report, "TR-CHG-002")).toBeUndefined();
    expect(report.assessment.status).toBe("UNKNOWN");
  });
});

// --- VERIFICATION_READY -----------------------------------------------------

describe("VERIFICATION_READY", () => {
  it("blocks an activity that has never had its readiness assessed", async () => {
    buildScenario(healthy({ activities: [{ id: "va1", verifies: "req1", readiness: null }] }));
    const report = await evaluate("VERIFICATION_READY");

    const finding = findingFor(report, "TR-VER-001");
    expect(finding?.status).toBe("BLOCKING");
    expect(finding?.message).toMatch(/never had its readiness assessed/);
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("makes a stale readiness assessment indeterminate rather than reading it as current", async () => {
    buildScenario(
      healthy({
        activities: [
          {
            id: "va1",
            verifies: "req1",
            readiness: { assessmentId: "vra1", status: "READY", freshness: "STALE" },
          },
        ],
      }),
    );
    const report = await evaluate("VERIFICATION_READY");

    const finding = findingFor(report, "TR-VER-002");
    expect(finding?.status).toBe("UNKNOWN");
    expect(finding?.message).toMatch(/stale/);
    // The stale READY verdict is not promoted into a pass.
    expect(findingFor(report, "TR-VER-003")).toBeUndefined();
    expect(report.assessment.status).toBe("UNKNOWN");
  });

  it("consumes a NOT_READY verdict without restating its findings", async () => {
    buildScenario(
      healthy({
        activities: [
          {
            id: "va1",
            verifies: "req1",
            readiness: {
              assessmentId: "vra1",
              status: "NOT_READY",
              freshness: "CURRENT",
              blocking: 3,
            },
          },
        ],
      }),
    );
    const report = await evaluate("VERIFICATION_READY");

    const finding = findingFor(report, "TR-VER-003");
    expect(finding?.status).toBe("BLOCKING");
    expect(finding?.message).toMatch(/3 blocking finding\(s\)/);
    // It points at the other engine's assessment rather than duplicating it.
    expect(finding?.message).toMatch(/open its assessment/i);
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("does not launder an UNKNOWN readiness verdict into a pass", async () => {
    buildScenario(
      healthy({
        activities: [
          {
            id: "va1",
            verifies: "req1",
            readiness: { assessmentId: "vra1", status: "UNKNOWN", freshness: "CURRENT" },
          },
        ],
      }),
    );
    const report = await evaluate("VERIFICATION_READY");

    expect(findingFor(report, "TR-VER-004")?.status).toBe("UNKNOWN");
    expect(report.assessment.status).toBe("UNKNOWN");
  });

  it("is ready when every in-scope activity holds a current READY verdict", async () => {
    buildScenario(
      healthy({
        activities: [
          {
            id: "va1",
            verifies: "req1",
            readiness: { assessmentId: "vra1", status: "READY", freshness: "CURRENT" },
          },
        ],
      }),
    );
    const report = await evaluate("VERIFICATION_READY");

    expect(findingFor(report, "TR-VER-005")?.message).toMatch(/1 of 1/);
    expect(report.assessment.status).toBe("READY");
  });

  it("blocks a requirement with nothing that would show it is met", async () => {
    buildScenario(healthy());
    const report = await evaluate("VERIFICATION_READY");

    const finding = findingFor(report, "TR-TRC-004");
    expect(finding?.status).toBe("BLOCKING");
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("blocks an uncontrolled requirement", async () => {
    buildScenario({
      requirements: [{ id: "req1", status: "IN_REVIEW" }],
      activities: [
        {
          id: "va1",
          verifies: "req1",
          readiness: { assessmentId: "vra1", status: "READY", freshness: "CURRENT" },
        },
      ],
    });
    const report = await evaluate("VERIFICATION_READY");

    expect(findingFor(report, "TR-REQ-004")?.status).toBe("BLOCKING");
  });

  it("records the readiness verdicts it consumed in the scope", async () => {
    buildScenario(
      healthy({
        activities: [
          {
            id: "va1",
            verifies: "req1",
            readiness: { assessmentId: "vra1", status: "READY", freshness: "CURRENT" },
          },
        ],
      }),
    );
    const report = await evaluate("VERIFICATION_READY");

    expect(report.scope.consumed.verificationReadiness).toEqual([
      {
        verificationActivityId: "va1",
        assessmentId: "vra1",
        status: "READY",
        freshness: "CURRENT",
        blockingCount: 0,
      },
    ]);
  });

  it("never runs a verification-readiness evaluation of its own", async () => {
    buildScenario(healthy({ activities: [{ id: "va1", verifies: "req1", readiness: null }] }));
    await evaluate("VERIFICATION_READY");

    // Only the read entry point is exposed to this engine.
    expect(Object.keys(verificationStub)).toEqual(["getLatestVerificationReadiness"]);
  });
});

// --- RELEASE_READY ----------------------------------------------------------

describe("RELEASE_READY", () => {
  const releasable = (overrides: Scenario = {}): Scenario => ({
    requirements: [{ id: "req1", status: "BASELINED" }],
    designItems: [{ id: "di1", status: "BASELINED", from: "req1" }],
    activities: [{ id: "va1", verifies: "req1", status: "PASSED", evidence: ["ev1"] }],
    ...overrides,
  });

  it("blocks a requirement that is approved but not baselined", async () => {
    buildScenario(
      releasable({ requirements: [{ id: "req1", status: "APPROVED" }] }),
    );
    const report = await evaluate("RELEASE_READY");

    const finding = findingFor(report, "TR-REQ-005");
    expect(finding?.status).toBe("BLOCKING");
    expect(finding?.message).toMatch(/APPROVED but not BASELINED/);
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("blocks verification that has not concluded", async () => {
    buildScenario(
      releasable({
        activities: [{ id: "va1", verifies: "req1", status: "IN_PROGRESS" }],
      }),
    );
    const report = await evaluate("RELEASE_READY");

    expect(findingFor(report, "TR-VER-006")?.status).toBe("BLOCKING");
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("never silently ignores a failed verification", async () => {
    buildScenario(
      releasable({ activities: [{ id: "va1", verifies: "req1", status: "FAILED" }] }),
    );
    const report = await evaluate("RELEASE_READY");

    const finding = findingFor(report, "TR-VER-007");
    expect(finding?.status).toBe("BLOCKING");
    expect(finding?.message).toMatch(/did not do what was required/);
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("surfaces a waiver without overruling the judgement behind it", async () => {
    buildScenario(
      releasable({ activities: [{ id: "va1", verifies: "req1", status: "WAIVED" }] }),
    );
    const report = await evaluate("RELEASE_READY");

    expect(findingFor(report, "TR-VER-008")?.status).toBe("WARNING");
    // A waiver legitimately carries no evidence, so the evidence rule is silent.
    expect(findingFor(report, "TR-EVD-001")).toBeUndefined();
    expect(report.assessment.status).toBe("READY");
  });

  it("blocks a passed verification with nothing recorded behind it", async () => {
    buildScenario(
      releasable({
        activities: [{ id: "va1", verifies: "req1", status: "PASSED", evidence: [] }],
      }),
    );
    const report = await evaluate("RELEASE_READY");

    const finding = findingFor(report, "TR-EVD-001");
    expect(finding?.status).toBe("BLOCKING");
    expect(finding?.message).toMatch(/no evidence attached/);
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("is ready when a baselined requirement was verified and evidenced", async () => {
    buildScenario(releasable());
    const report = await evaluate("RELEASE_READY");

    expect(report.assessment.status).toBe("READY");
    expect(findingFor(report, "TR-VER-009")?.message).toMatch(/1 PASSED/);
    expect(findingFor(report, "TR-EVD-002")?.message).toMatch(/1 of 1 passed activity/);
  });

  it("blocks an open risk at the release gate", async () => {
    buildScenario(releasable({ risks: [{ id: "risk1", status: "OPEN" }] }));
    const report = await evaluate("RELEASE_READY");

    const finding = findingFor(report, "TR-RSK-001");
    expect(finding?.status).toBe("BLOCKING");
    expect(finding?.message).toMatch(/no severity, so the engine does not rank it/);
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("does not block a risk somebody has accepted or mitigated", async () => {
    buildScenario(
      releasable({
        risks: [
          { id: "risk1", status: "ACCEPTED" },
          { id: "risk2", status: "MITIGATED" },
        ],
      }),
    );
    const report = await evaluate("RELEASE_READY");

    expect(findingFor(report, "TR-RSK-001")).toBeUndefined();
    expect(report.assessment.status).toBe("READY");
  });

  it("blocks unresolved change impact on the released scope", async () => {
    buildScenario(
      releasable({
        changes: [
          {
            id: "chg1",
            status: "UNDER_REVIEW",
            analysis: { id: "ana1", sourceFingerprint: "fp-project" },
            reaches: [{ type: "REQUIREMENT", id: "req1" }],
          },
        ],
      }),
    );
    const report = await evaluate("RELEASE_READY");

    expect(findingFor(report, "TR-CHG-005")?.status).toBe("BLOCKING");
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("blocks an assumption requiring review", async () => {
    buildScenario(
      releasable({
        decisions: [{ id: "ed1", status: "APPROVED", addresses: "req1" }],
        assumptions: [
          { id: "asm1", decisionId: "ed1", status: "VALIDATED", monitoring: "REVIEW_REQUIRED" },
        ],
      }),
    );
    const report = await evaluate("RELEASE_READY");

    expect(findingFor(report, "TR-ASM-001")?.status).toBe("BLOCKING");
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("blocks an uncontrolled decision", async () => {
    buildScenario(
      releasable({ decisions: [{ id: "ed1", status: "UNDER_REVIEW", addresses: "req1" }] }),
    );
    const report = await evaluate("RELEASE_READY");

    expect(findingFor(report, "TR-DEC-002")?.status).toBe("BLOCKING");
  });

  it("consumes an engineer's INVALIDATED assumption judgement without producing one", async () => {
    buildScenario(
      releasable({
        decisions: [{ id: "ed1", status: "APPROVED", addresses: "req1" }],
        assumptions: [
          { id: "asm1", decisionId: "ed1", status: "INVALIDATED", monitoring: "CURRENT" },
        ],
      }),
    );
    const report = await evaluate("RELEASE_READY");

    expect(findingFor(report, "TR-ASM-005")?.status).toBe("BLOCKING");
    // Only reads were issued against the assumption's own state.
    expect(Object.keys(monitoringRepository)).toEqual(["findLatestForAssumptions"]);
  });

  it("does not claim to be certification", async () => {
    buildScenario(releasable());
    const report = await evaluate("RELEASE_READY");

    expect(JSON.stringify(report)).not.toMatch(/certif/i);
  });
});

// --- Decisions across gates -------------------------------------------------

describe("decision dependencies", () => {
  it("blocks a rejected decision that the record still connects to the scope", async () => {
    buildScenario(
      healthy({ decisions: [{ id: "ed1", status: "REJECTED", addresses: "req1" }] }),
    );
    const report = await evaluate("SYSTEM_DEFINITION");

    const finding = findingFor(report, "TR-DEC-003");
    expect(finding?.status).toBe("BLOCKING");
    expect(finding?.message).toMatch(/cannot both hold/);
  });

  it("warns on a superseded decision, saying it cannot resolve the successor", async () => {
    buildScenario(
      healthy({ decisions: [{ id: "ed1", status: "SUPERSEDED", addresses: "req1" }] }),
    );
    const report = await evaluate("SYSTEM_DEFINITION");

    expect(findingFor(report, "TR-DEC-004")?.message).toMatch(/successor/);
    expect(report.assessment.status).toBe("READY");
  });

  it("follows a decision that shapes an in-scope design item", async () => {
    buildScenario(
      healthy({ decisions: [{ id: "ed1", status: "PROPOSED", shapes: "di1" }] }),
    );
    const report = await evaluate("DESIGN_FREEZE");

    expect(findingFor(report, "TR-DEC-002")?.subjectIdentifier).toBe("ED1");
  });

  it("ignores a decision nothing in scope connects to", async () => {
    buildScenario(healthy({ decisions: [{ id: "ed1", status: "PROPOSED" }] }));
    const report = await evaluate("DESIGN_FREEZE");

    expect(findingFor(report, "TR-DEC-002")).toBeUndefined();
    expect(report.scope.counts.ENGINEERING_DECISION).toBe(0);
  });
});

// --- Precedence -------------------------------------------------------------

describe("verdict precedence", () => {
  it("records every blocking condition, not only the first", async () => {
    buildScenario({
      requirements: [{ id: "req1", status: "DRAFT" }],
      designItems: [{ id: "di1", status: "OBSOLETE", from: "req1" }],
      issues: [{ id: "iss1", severity: "CRITICAL", status: "OPEN" }],
    });
    const report = await evaluate("DESIGN_REVIEW");

    expect(report.assessment.status).toBe("NOT_READY");
    expect(report.assessment.summary.blocking).toBe(3);
    expect(ruleIds(report).slice(0, 3).sort()).toEqual([
      "TR-DES-002",
      "TR-ISS-001",
      "TR-REQ-002",
    ]);
  });

  it("lets blocking outrank an indeterminate condition", async () => {
    buildScenario(
      healthy({
        requirements: [{ id: "req1", status: "DRAFT" }],
        decisions: [{ id: "ed1", status: "APPROVED", addresses: "req1" }],
        assumptions: [{ id: "asm1", decisionId: "ed1", monitoring: null }],
      }),
    );
    const report = await evaluate("SYSTEM_DEFINITION");

    expect(report.assessment.summary.unknown).toBeGreaterThan(0);
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("leads with blocking findings, then unknown, then the rest", async () => {
    buildScenario(
      healthy({
        requirements: [{ id: "req1", status: "DRAFT" }],
        decisions: [{ id: "ed1", status: "APPROVED", addresses: "req1" }],
        assumptions: [{ id: "asm1", decisionId: "ed1", monitoring: null }],
        needs: [{ id: "sn1" }],
      }),
    );
    const report = await evaluate("SYSTEM_DEFINITION");

    const statuses = report.findings.map((finding) => finding.status);
    expect(statuses[0]).toBe("BLOCKING");
    expect(statuses.indexOf("UNKNOWN")).toBeLessThan(statuses.indexOf("WARNING"));
  });

  it("counts every outcome it wrote", async () => {
    buildScenario(
      healthy({
        requirements: [{ id: "req1", status: "IN_REVIEW" }],
        needs: [{ id: "sn1" }],
        changes: [{ id: "chg1", analysis: null }],
      }),
    );
    const report = await evaluate("DESIGN_REVIEW");

    const { summary } = report.assessment;
    expect(summary.findings).toBe(report.findings.length);
    expect(summary.blocking + summary.warning + summary.informational + summary.unknown).toBe(
      summary.findings,
    );
  });
});

// --- Determinism, freshness, immutability -----------------------------------

describe("determinism", () => {
  it("reaches the same conclusion twice over an unchanged project", async () => {
    buildScenario(
      healthy({
        decisions: [{ id: "ed1", status: "APPROVED", addresses: "req1" }],
        assumptions: [{ id: "asm1", decisionId: "ed1", monitoring: "CURRENT" }],
        needs: [{ id: "sn1", derives: "req1" }],
        risks: [{ id: "risk1", status: "OPEN" }],
      }),
    );

    const first = await evaluate("DESIGN_REVIEW");
    const second = await evaluate("DESIGN_REVIEW");

    expect(technicalReadinessSignature(second)).toBe(technicalReadinessSignature(first));
    expect(second.assessment.fingerprint).toBe(first.assessment.fingerprint);
    // A new record, not an edit of the old one.
    expect(second.assessment.id).not.toBe(first.assessment.id);
  });

  it("orders findings identically across runs", async () => {
    buildScenario({
      requirements: [
        { id: "req2", status: "DRAFT" },
        { id: "req1", status: "IN_REVIEW" },
      ],
      designItems: [{ id: "di1", status: "APPROVED", from: "req1" }],
    });

    const first = await evaluate("DESIGN_REVIEW");
    const second = await evaluate("DESIGN_REVIEW");

    expect(second.findings.map((f) => `${f.ruleId}:${f.subjectId}`)).toEqual(
      first.findings.map((f) => `${f.ruleId}:${f.subjectId}`),
    );
  });

  it("gives two gates different fingerprints over the same project", async () => {
    buildScenario(healthy());

    const review = await evaluate("DESIGN_REVIEW");
    const freeze = await evaluate("DESIGN_FREEZE");

    expect(freeze.assessment.fingerprint).not.toBe(review.assessment.fingerprint);
  });
});

describe("freshness", () => {
  it("reports a fresh assessment as current without re-evaluating", async () => {
    buildScenario(healthy());
    const engine = service();
    await engine.evaluateTechnicalReadiness(CONTEXT, PROJECT_ID, { gate: "DESIGN_REVIEW" });

    const latest = await engine.getLatestTechnicalReadiness(
      CONTEXT,
      PROJECT_ID,
      "DESIGN_REVIEW",
    );

    expect(hasTechnicalReadiness(latest)).toBe(true);
    if (!hasTechnicalReadiness(latest)) return;
    expect(latest.freshness).toBe("CURRENT");
    expect(readinessRepository["createAssessment"]).toHaveBeenCalledTimes(1);
  });

  it("goes stale when a scope object is revised", async () => {
    buildScenario(healthy());
    const engine = service();
    await engine.evaluateTechnicalReadiness(CONTEXT, PROJECT_ID, { gate: "DESIGN_REVIEW" });

    fixture.setRevision(
      { type: "REQUIREMENT", id: "req1" },
      new Date("2026-09-01T00:00:00.000Z"),
    );

    const latest = await engine.getLatestTechnicalReadiness(
      CONTEXT,
      PROJECT_ID,
      "DESIGN_REVIEW",
    );
    if (!hasTechnicalReadiness(latest)) throw new Error("expected an assessment");
    expect(latest.freshness).toBe("STALE");
    // The stored verdict is returned unchanged, not silently recomputed.
    expect(latest.assessment.status).toBe("READY");
  });

  it("goes stale when a requirement's state changes", async () => {
    buildScenario(healthy());
    const engine = service();
    await engine.evaluateTechnicalReadiness(CONTEXT, PROJECT_ID, { gate: "DESIGN_REVIEW" });

    vi.mocked(scopeRepository.loadRequirements).mockResolvedValue([
      { id: "req1", identifier: "REQ1", title: "Requirement req1", status: "DRAFT" },
    ]);

    const latest = await engine.getLatestTechnicalReadiness(
      CONTEXT,
      PROJECT_ID,
      "DESIGN_REVIEW",
    );
    if (!hasTechnicalReadiness(latest)) throw new Error("expected an assessment");
    expect(latest.freshness).toBe("STALE");
  });

  it("is not staled by a change outside the evaluated scope", async () => {
    buildScenario(healthy());
    const engine = service();
    await engine.evaluateTechnicalReadiness(CONTEXT, PROJECT_ID, { gate: "DESIGN_REVIEW" });

    // A closed risk and a resolved issue are outside the active scope, so
    // adding them cannot move the gate's basis.
    vi.mocked(scopeRepository.loadRisks).mockResolvedValue([
      { id: "risk9", identifier: "RISK9", title: "Closed risk", status: "CLOSED" },
    ]);
    vi.mocked(scopeRepository.loadIssues).mockResolvedValue([
      {
        id: "iss9",
        identifier: "ISS9",
        title: "Resolved issue",
        severity: "CRITICAL",
        status: "RESOLVED",
      },
    ]);

    const latest = await engine.getLatestTechnicalReadiness(
      CONTEXT,
      PROJECT_ID,
      "DESIGN_REVIEW",
    );
    if (!hasTechnicalReadiness(latest)) throw new Error("expected an assessment");
    expect(latest.freshness).toBe("CURRENT");
  });

  it("goes stale when a consumed readiness verdict changes", async () => {
    buildScenario(
      healthy({
        activities: [
          {
            id: "va1",
            verifies: "req1",
            readiness: { assessmentId: "vra1", status: "READY", freshness: "CURRENT" },
          },
        ],
      }),
    );
    const engine = service();
    await engine.evaluateTechnicalReadiness(CONTEXT, PROJECT_ID, {
      gate: "VERIFICATION_READY",
    });

    readinessByActivity.set("va1", {
      assessmentId: "vra2",
      status: "NOT_READY",
      freshness: "CURRENT",
      blocking: 1,
    });

    const latest = await engine.getLatestTechnicalReadiness(
      CONTEXT,
      PROJECT_ID,
      "VERIFICATION_READY",
    );
    if (!hasTechnicalReadiness(latest)) throw new Error("expected an assessment");
    expect(latest.freshness).toBe("STALE");
  });

  it("goes stale when a consumed impact analysis stops being current", async () => {
    buildScenario(
      healthy({
        changes: [
          {
            id: "chg1",
            analysis: { id: "ana1", sourceFingerprint: "fp-project" },
            reaches: [{ type: "REQUIREMENT", id: "req1" }],
          },
        ],
      }),
    );
    const engine = service();
    await engine.evaluateTechnicalReadiness(CONTEXT, PROJECT_ID, { gate: "DESIGN_REVIEW" });

    vi.mocked(revisionRepository.computeProjectFingerprint).mockResolvedValue("fp-moved");

    const latest = await engine.getLatestTechnicalReadiness(
      CONTEXT,
      PROJECT_ID,
      "DESIGN_REVIEW",
    );
    if (!hasTechnicalReadiness(latest)) throw new Error("expected an assessment");
    expect(latest.freshness).toBe("STALE");
  });
});

describe("history and immutability", () => {
  it("says NOT_EVALUATED rather than returning an empty assessment", async () => {
    buildScenario(healthy());
    const latest = await service().getLatestTechnicalReadiness(
      CONTEXT,
      PROJECT_ID,
      "RELEASE_READY",
    );

    expect(hasTechnicalReadiness(latest)).toBe(false);
    expect(latest).toMatchObject({ status: "NOT_EVALUATED", gate: "RELEASE_READY" });
  });

  it("keeps every assessment of a gate, newest first", async () => {
    buildScenario(healthy());
    const engine = service();
    await engine.evaluateTechnicalReadiness(CONTEXT, PROJECT_ID, { gate: "DESIGN_REVIEW" });
    await engine.evaluateTechnicalReadiness(CONTEXT, PROJECT_ID, { gate: "DESIGN_REVIEW" });

    const history = await engine.listTechnicalReadinessHistory(
      CONTEXT,
      PROJECT_ID,
      "DESIGN_REVIEW",
    );
    expect(history).toHaveLength(2);
    expect(history[0]!.evaluatedAt.getTime()).toBeGreaterThan(history[1]!.evaluatedAt.getTime());
  });

  it("separates one gate's history from another's", async () => {
    buildScenario(healthy());
    const engine = service();
    await engine.evaluateTechnicalReadiness(CONTEXT, PROJECT_ID, { gate: "DESIGN_REVIEW" });
    await engine.evaluateTechnicalReadiness(CONTEXT, PROJECT_ID, { gate: "DESIGN_FREEZE" });

    expect(
      await engine.listTechnicalReadinessHistory(CONTEXT, PROJECT_ID, "DESIGN_REVIEW"),
    ).toHaveLength(1);
    // And omitting the gate returns both.
    expect(await engine.listTechnicalReadinessHistory(CONTEXT, PROJECT_ID)).toHaveLength(2);
  });

  it("leaves a historical assessment exactly as it was recorded", async () => {
    buildScenario(healthy());
    const engine = service();
    const first = await engine.evaluateTechnicalReadiness(CONTEXT, PROJECT_ID, {
      gate: "DESIGN_REVIEW",
    });

    // The requirement is pushed back into review, and the gate re-evaluated.
    vi.mocked(scopeRepository.loadRequirements).mockResolvedValue([
      { id: "req1", identifier: "REQ1", title: "Requirement req1", status: "DRAFT" },
    ]);
    const second = await engine.evaluateTechnicalReadiness(CONTEXT, PROJECT_ID, {
      gate: "DESIGN_REVIEW",
    });
    expect(second.assessment.status).toBe("NOT_READY");

    const historical = await engine.explainTechnicalReadiness(
      CONTEXT,
      PROJECT_ID,
      first.assessment.id,
    );

    expect(historical.assessment.status).toBe("READY");
    expect(historical.assessment.fingerprint).toBe(first.assessment.fingerprint);
    expect(technicalReadinessSignature(historical)).toBe(technicalReadinessSignature(first));
    expect(historical.freshness).toBe("STALE");
  });

  it("exposes no operation that would rewrite an assessment", () => {
    const operations = Object.keys(readinessRepository);
    expect(operations).not.toContain("updateAssessment");
    expect(operations).not.toContain("deleteAssessment");
    expect(operations).not.toContain("updateFinding");
  });
});

// --- Audit ------------------------------------------------------------------

describe("audit", () => {
  it("records the start and the completion of an evaluation", async () => {
    buildScenario(healthy());
    const report = await evaluate("DESIGN_FREEZE");

    const events = vi
      .mocked(auditLogRepository.recordAuditEvent)
      .mock.calls.map((call) => call[0] as unknown as Record<string, unknown>);

    expect(events.map((event) => event["action"])).toEqual([
      "technical_readiness.evaluation_started",
      "technical_readiness.evaluated",
    ]);

    const completed = events[1]!;
    expect(completed["entityType"]).toBe("TechnicalReadinessAssessment");
    expect(completed["entityId"]).toBe(report.assessment.id);
    expect(completed["actorId"]).toBe(CONTEXT.actorId);
    expect(completed["organizationId"]).toBe(CONTEXT.organizationId);
    expect(completed["metadata"]).toMatchObject({
      projectId: PROJECT_ID,
      gate: "DESIGN_FREEZE",
      readinessVersion: TECHNICAL_READINESS_VERSION,
    });
  });

  it("does not put every finding in the audit log", async () => {
    buildScenario({
      requirements: [{ id: "req1", status: "DRAFT" }],
      issues: [{ id: "iss1", severity: "CRITICAL", status: "OPEN" }],
    });
    await evaluate("SYSTEM_DEFINITION");

    // The persisted assessment holds the detail; the audit log holds the event.
    expect(vi.mocked(auditLogRepository.recordAuditEvent)).toHaveBeenCalledTimes(2);
  });

  it("audits no read", async () => {
    buildScenario(healthy());
    const engine = service();
    await engine.evaluateTechnicalReadiness(CONTEXT, PROJECT_ID, { gate: "DESIGN_REVIEW" });
    vi.mocked(auditLogRepository.recordAuditEvent).mockClear();

    await engine.getLatestTechnicalReadiness(CONTEXT, PROJECT_ID, "DESIGN_REVIEW");
    await engine.listTechnicalReadinessHistory(CONTEXT, PROJECT_ID, "DESIGN_REVIEW");

    expect(vi.mocked(auditLogRepository.recordAuditEvent)).not.toHaveBeenCalled();
  });
});

// --- Boundaries -------------------------------------------------------------

describe("scope and input boundaries", () => {
  it("refuses a project outside the caller's organization", async () => {
    buildScenario(healthy());
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    await expect(
      service().evaluateTechnicalReadiness(CONTEXT, PROJECT_ID, { gate: "DESIGN_REVIEW" }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects a gate the registry does not define", async () => {
    buildScenario(healthy());

    await expect(
      service().evaluateTechnicalReadiness(CONTEXT, PROJECT_ID, {
        gate: "CERTIFICATION_READY",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a client that tries to supply a verdict or a rule set", async () => {
    buildScenario(healthy());

    for (const attempt of [
      { gate: "DESIGN_REVIEW", status: "READY" },
      { gate: "DESIGN_REVIEW", rules: ["TR-REQ-002"] },
      { gate: "DESIGN_REVIEW", evaluatedById: "user9aaaaaaaaaaaaaaaaa" },
    ]) {
      await expect(
        service().evaluateTechnicalReadiness(CONTEXT, PROJECT_ID, attempt),
      ).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it("does not reach an assessment through another project's id", async () => {
    buildScenario(healthy());
    const engine = service();
    const report = await engine.evaluateTechnicalReadiness(CONTEXT, PROJECT_ID, {
      gate: "DESIGN_REVIEW",
    });

    await expect(
      engine.explainTechnicalReadiness(
        CONTEXT,
        "proj2aaaaaaaaaaaaaaaaaa",
        report.assessment.id,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("does not return an assessment id that is not in this project", async () => {
    buildScenario(healthy());
    const engine = service();
    await engine.evaluateTechnicalReadiness(CONTEXT, PROJECT_ID, { gate: "DESIGN_REVIEW" });

    await expect(
      engine.explainTechnicalReadiness(CONTEXT, PROJECT_ID, "assessment999"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("never references an object outside the evaluated scope in a finding", async () => {
    buildScenario(
      healthy({
        decisions: [{ id: "ed1", status: "APPROVED", addresses: "req1" }],
        needs: [{ id: "sn1" }],
        risks: [{ id: "risk1", status: "OPEN" }],
      }),
    );
    const report = await evaluate("SYSTEM_DEFINITION");

    const known = new Set([PROJECT_ID, "req1", "di1", "ed1", "sn1", "risk1"]);
    for (const finding of report.findings) {
      expect(known.has(finding.subjectId)).toBe(true);
    }
  });
});

// --- The recorded scope -----------------------------------------------------

describe("the recorded scope", () => {
  it("stamps each object with its own revision, never with the evaluation time", async () => {
    buildScenario(healthy());
    const report = await evaluate("DESIGN_REVIEW");

    for (const object of report.scope.objects) {
      expect(object.revision).toBe(BASELINE_REVISION.toISOString());
    }
  });

  it("cites the real relationship rows it walked", async () => {
    buildScenario(healthy({ needs: [{ id: "sn1", derives: "req1" }] }));
    const report = await evaluate("DESIGN_REVIEW");

    expect(report.scope.relationships.map((r) => r.relationshipId).sort()).toEqual([
      "rel-alloc-di1",
      "rel-need-sn1",
    ]);
  });

  it("keeps identity and state without copying artifact records", async () => {
    buildScenario(healthy());
    const report = await evaluate("DESIGN_REVIEW");

    const requirement = report.scope.objects.find((object) => object.id === "req1");
    expect(requirement).toMatchObject({
      role: "REQUIREMENT",
      type: "REQUIREMENT",
      identifier: "REQ1",
      state: "BASELINED",
    });
    // No statement, rationale, description or other artifact content.
    expect(Object.keys(requirement ?? {}).sort()).toEqual([
      "id",
      "identifier",
      "revision",
      "role",
      "state",
      "type",
    ]);
  });

  it("records the monitoring verdicts it consumed", async () => {
    buildScenario(
      healthy({
        decisions: [{ id: "ed1", status: "APPROVED", addresses: "req1" }],
        assumptions: [
          { id: "asm1", decisionId: "ed1", status: "VALIDATED", monitoring: "REVIEW_REQUIRED" },
        ],
      }),
    );
    const report = await evaluate("DESIGN_REVIEW");

    expect(report.scope.consumed.assumptionMonitoring).toEqual([
      {
        assumptionId: "asm1",
        decisionId: "ed1",
        monitoringStatus: "REVIEW_REQUIRED",
        assumptionStatus: "VALIDATED",
      },
    ]);
  });

  it("records the impact analyses it consumed and how fresh each was", async () => {
    buildScenario(
      healthy({
        changes: [
          {
            id: "chg1",
            analysis: { id: "ana1", sourceFingerprint: "fp-older" },
            reaches: [{ type: "REQUIREMENT", id: "req1" }],
          },
        ],
      }),
    );
    const report = await evaluate("DESIGN_REVIEW");

    expect(report.scope.consumed.changeImpact[0]).toMatchObject({
      changeRequestId: "chg1",
      analysisId: "ana1",
      analysisFreshness: "STALE",
    });
  });
});

describe("project role authorization", () => {
  function asRole(role: "MANAGER" | "ENGINEER" | "REVIEWER" | "VIEWER") {
    vi.mocked(membershipRepository.findMembership).mockResolvedValue({
      id: "mem1",
      projectId: PROJECT_ID,
      role,
      createdAt: new Date(),
      updatedAt: new Date(),
      user: { id: CONTEXT.actorId, name: "Ada", email: "ada@example.test", organizationRole: "MEMBER" },
    } as never);
  }

  it("refuses a VIEWER evaluating a gate — a persisted, immutable assessment, not a plain read", async () => {
    buildScenario(healthy());
    asRole("VIEWER");

    await expect(evaluate("SYSTEM_DEFINITION")).rejects.toBeInstanceOf(ForbiddenError);
    expect(readinessRepository.createAssessment).not.toHaveBeenCalled();
  });

  it("refuses a REVIEWER evaluating a gate — no approval tier exists for this domain", async () => {
    buildScenario(healthy());
    asRole("REVIEWER");

    await expect(evaluate("SYSTEM_DEFINITION")).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("allows an ENGINEER to evaluate a gate", async () => {
    buildScenario(healthy());
    asRole("ENGINEER");

    await expect(evaluate("SYSTEM_DEFINITION")).resolves.toBeDefined();
  });

  it("a same-organization caller with no project membership cannot even read history", async () => {
    buildScenario(healthy());
    vi.mocked(membershipRepository.findMembership).mockResolvedValue(null);
    vi.mocked(userRepository.getOrganizationRole).mockResolvedValue("MEMBER");

    await expect(
      service().listTechnicalReadinessHistory(CONTEXT, PROJECT_ID),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
