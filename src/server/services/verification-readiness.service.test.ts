// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  VERIFICATION_READINESS_VERSION,
  type AssumptionStatus,
  type DecisionStatus,
  type DesignItemStatus,
  type Project,
  type RequirementStatus,
  type VerificationActivity,
  type VerificationReadinessReport,
  type VerificationStatus,
  hasVerificationReadiness,
  readinessSignature,
} from "@/domain";
import { NotFoundError, ValidationError } from "@/server/errors";
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
 * The readiness engine, driven over a hand-built graph.
 *
 * The *real* `EngineeringGraphService` runs on top of an in-memory graph
 * fixture, so the basis walk, the rule registry and the precedence logic are
 * all genuinely exercised — none of it is stubbed. Only persistence, tenancy
 * lookups and the state reads other modules own are faked, and the fake store
 * keeps rows so a report is assembled from what was actually "written".
 */

const TX = { __transaction: true } as const;

const CONTEXT = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
};

const PROJECT_ID = FIXTURE_PROJECT;
const ACTIVITY_ID = "va1";

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)) },
}));

vi.mock("@/server/repositories/project.repository", () => ({
  findProjectInOrganization: vi.fn(),
}));

vi.mock("@/server/repositories/verification-activity.repository", () => ({
  findVerificationActivityInProject: vi.fn(),
}));

vi.mock("@/server/repositories/verification-readiness-basis.repository", () => ({
  loadRequirementStates: vi.fn(),
  loadDesignItemStates: vi.fn(),
  loadDecisionStates: vi.fn(),
  loadAssumptionStates: vi.fn(),
  loadRequirementVerificationLinks: vi.fn(),
  loadChangeImpactContext: vi.fn(),
}));

vi.mock("@/server/repositories/assumption-monitoring.repository", () => ({
  findLatestForAssumptions: vi.fn(),
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
vi.mock("@/server/repositories/verification-readiness.repository", () => {
  interface Row {
    assessment: Record<string, unknown>;
    findings: Record<string, unknown>[];
  }
  const store = new Map<string, Row>();
  let counter = 0;

  const shape = (a: Record<string, unknown>) => ({
    id: a["id"],
    projectId: a["projectId"],
    verificationActivityId: a["verificationActivityId"],
    status: a["status"],
    scope: a["scope"],
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
    findLatestAssessment: vi.fn(async (projectId: string, activityId: string) => {
      const rows = newestFirst(
        [...store.values()].filter(
          (row) =>
            row.assessment["projectId"] === projectId &&
            row.assessment["verificationActivityId"] === activityId,
        ),
      );
      return rows[0] ? shape(rows[0].assessment) : null;
    }),
    listAssessments: vi.fn(async (projectId: string, activityId: string) =>
      newestFirst(
        [...store.values()].filter(
          (row) =>
            row.assessment["projectId"] === projectId &&
            row.assessment["verificationActivityId"] === activityId,
        ),
      ).map((row) => shape(row.assessment)),
    ),
    findAssessmentInProject: vi.fn(async (projectId: string, assessmentId: string) => {
      const row = store.get(assessmentId);
      if (!row || row.assessment["projectId"] !== projectId) return null;
      return shape(row.assessment);
    }),
    readAssessmentBasis: vi.fn(async (assessment: { id: string }) => {
      const row = store.get(assessment.id);
      return (
        row?.assessment["basis"] ?? {
          verificationActivityId: "",
          scope: "EXECUTION",
          objects: [],
          relationships: [],
          monitoring: [],
          changes: [],
        }
      );
    }),
    findLatestForActivities: vi.fn(async () => new Map()),
  };
});

const projectRepository = await import("@/server/repositories/project.repository");
const verificationRepository = await import(
  "@/server/repositories/verification-activity.repository"
);
const basisRepository = await import(
  "@/server/repositories/verification-readiness-basis.repository"
);
const monitoringRepository = await import(
  "@/server/repositories/assumption-monitoring.repository"
);
const revisionRepository = await import("@/server/repositories/project-revision.repository");
const auditLogRepository = await import("@/server/repositories/audit-log.repository");
const readinessRepository = (await import(
  "@/server/repositories/verification-readiness.repository"
)) as unknown as { __reset: () => void } & Record<string, ReturnType<typeof vi.fn>>;

const { EngineeringGraphService } = await import("./engineering-graph.service");
const { VerificationReadinessService } = await import("./verification-readiness.service");

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
  /** False to record the link row but leave the requirement outside the project. */
  inProject?: boolean;
}

interface DesignSpec {
  id: string;
  status: DesignItemStatus;
  /** The requirement it is allocated from. Defaults to the first requirement. */
  from?: string;
}

interface DecisionSpec {
  id: string;
  status: DecisionStatus;
  /** A requirement this decision addresses. */
  addresses?: string;
  /** A design item this decision shapes. */
  shapes?: string;
  /** Recorded but with the link type that means "derived from", not a dependency. */
  derivedFrom?: string;
}

interface AssumptionSpec {
  id: string;
  decisionId: string;
  status?: AssumptionStatus;
  monitoring?: "CURRENT" | "BASIS_CHANGED" | "REVIEW_REQUIRED" | null;
}

interface ChangeSpec {
  id: string;
  identifier: string;
  status?: string;
  analysis?: { id: string; status?: string; sourceFingerprint: string } | null;
  declared?: Array<{ type: string; id: string }>;
  affected?: Array<{ type: string; id: string }>;
}

interface Scenario {
  activityStatus?: VerificationStatus;
  activity?: Partial<VerificationActivity>;
  requirements?: RequirementSpec[];
  designItems?: DesignSpec[];
  decisions?: DecisionSpec[];
  assumptions?: AssumptionSpec[];
  evidence?: string[];
  changes?: ChangeSpec[];
  projectFingerprint?: string;
}

let fixture: GraphFixture;

/**
 * Builds a graph and wires the faked state reads to agree with it.
 *
 * The graph and the state maps are constructed from one spec so they cannot
 * drift — a test that adds a requirement to the graph automatically gets a
 * state row for it.
 */
function buildScenario(scenario: Scenario = {}): VerificationActivity {
  resetGraphClock();

  const activity: VerificationActivity = {
    id: ACTIVITY_ID,
    projectId: PROJECT_ID,
    identifier: "VA-001",
    title: "Proof pressure test",
    description: null,
    method: "TEST",
    status: scenario.activityStatus ?? "PLANNED",
    ownerId: CONTEXT.actorId,
    plannedDate: null,
    completedDate: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...scenario.activity,
  };

  const requirements = scenario.requirements ?? [];
  const designItems = scenario.designItems ?? [];
  const decisions = scenario.decisions ?? [];
  const assumptions = scenario.assumptions ?? [];
  const evidence = scenario.evidence ?? [];

  const activityNode = graphNode("VERIFICATION_ACTIVITY", activity.id);
  const nodes = [activityNode];
  const edges: RawEdge[] = [];

  const inProjectRequirements = requirements.filter((r) => r.inProject !== false);

  for (const requirement of inProjectRequirements) {
    const node = graphNode("REQUIREMENT", requirement.id);
    nodes.push(node);
    edges.push(
      graphEdge(
        "REQUIREMENT_VERIFIED_BY",
        nodeRef(node),
        nodeRef(activityNode),
        `rel-ver-${requirement.id}`,
      ),
    );
  }

  for (const design of designItems) {
    const node = graphNode("DESIGN_ITEM", design.id);
    nodes.push(node);
    const from = design.from ?? inProjectRequirements[0]?.id;
    if (from) {
      edges.push(
        graphEdge(
          "REQUIREMENT_ALLOCATED_TO_DESIGN",
          { type: "REQUIREMENT", id: from },
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

    if (decision.derivedFrom) {
      edges.push({
        ...graphEdge(
          "REQUIREMENT_LINKED_TO_DECISION",
          { type: "REQUIREMENT", id: decision.derivedFrom },
          nodeRef(node),
          `rel-derived-${decision.id}`,
        ),
        linkType: "REQUIREMENT_DERIVED_FROM_DECISION",
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

  for (const item of evidence) {
    const node = graphNode("EVIDENCE", item);
    nodes.push(node);
    edges.push(
      graphEdge("VERIFICATION_HAS_EVIDENCE", nodeRef(activityNode), nodeRef(node), `rel-ev-${item}`),
    );
  }

  fixture = new GraphFixture(nodes, edges);

  // Mirrors the real guard: a project is only resolvable from the organization
  // that owns it, so a caller naming someone else's project gets nothing.
  vi.mocked(projectRepository.findProjectInOrganization).mockImplementation(
    async (organizationId: string, id: string) =>
      organizationId === CONTEXT.organizationId && id === PROJECT_ID ? PROJECT : null,
  );
  vi.mocked(verificationRepository.findVerificationActivityInProject).mockResolvedValue(activity);

  vi.mocked(basisRepository.loadRequirementStates).mockResolvedValue(
    new Map(
      inProjectRequirements.map((requirement) => [
        requirement.id,
        {
          id: requirement.id,
          identifier: requirement.id.toUpperCase(),
          title: `Requirement ${requirement.id}`,
          status: requirement.status,
        },
      ]),
    ),
  );

  vi.mocked(basisRepository.loadDesignItemStates).mockResolvedValue(
    new Map(
      designItems.map((design) => [
        design.id,
        {
          id: design.id,
          identifier: design.id.toUpperCase(),
          name: `Design ${design.id}`,
          status: design.status,
        },
      ]),
    ),
  );

  vi.mocked(basisRepository.loadDecisionStates).mockResolvedValue(
    new Map(
      decisions.map((decision) => [
        decision.id,
        {
          id: decision.id,
          identifier: decision.id.toUpperCase(),
          title: `Decision ${decision.id}`,
          status: decision.status,
        },
      ]),
    ),
  );

  vi.mocked(basisRepository.loadAssumptionStates).mockResolvedValue(
    new Map(
      assumptions.map((assumption) => [
        assumption.id,
        {
          id: assumption.id,
          statement: `Assumption ${assumption.id}`,
          status: assumption.status ?? "UNKNOWN",
          engineeringDecisionId: assumption.decisionId,
        },
      ]),
    ),
  );

  vi.mocked(basisRepository.loadRequirementVerificationLinks).mockResolvedValue(
    requirements.map((requirement) => ({
      relationshipId: `rel-ver-${requirement.id}`,
      requirementId: requirement.id,
      inProject: requirement.inProject !== false,
    })),
  );

  vi.mocked(monitoringRepository.findLatestForAssumptions).mockResolvedValue(
    new Map(
      assumptions
        .filter((assumption) => assumption.monitoring)
        .map((assumption) => [
          assumption.id,
          {
            id: `mon-${assumption.id}`,
            status: assumption.monitoring,
            basisFingerprint: `fp-${assumption.id}`,
          },
        ]) as never,
    ),
  );

  vi.mocked(basisRepository.loadChangeImpactContext).mockResolvedValue(
    (scenario.changes ?? []).map((change) => ({
      changeRequestId: change.id,
      identifier: change.identifier,
      title: `Change ${change.identifier}`,
      status: (change.status ?? "UNDER_REVIEW") as never,
      analysis:
        change.analysis === undefined || change.analysis === null
          ? null
          : {
              id: change.analysis.id,
              status: (change.analysis.status ?? "COMPLETED") as never,
              sourceFingerprint: change.analysis.sourceFingerprint,
              startedAt: new Date("2026-02-01T00:00:00.000Z"),
            },
      declaredSubjects: (change.declared ?? []) as never,
      affectedSubjects: (change.affected ?? []) as never,
    })),
  );

  vi.mocked(revisionRepository.computeProjectFingerprint).mockResolvedValue(
    scenario.projectFingerprint ?? "fp-project",
  );

  return activity;
}

function service() {
  return new VerificationReadinessService(new EngineeringGraphService(fixture));
}

/** A single verified, approved requirement — the "nothing wrong" baseline. */
function healthyScenario(overrides: Scenario = {}): Scenario {
  return {
    requirements: [{ id: "req1", status: "APPROVED" }],
    ...overrides,
  };
}

function ruleIds(report: VerificationReadinessReport): string[] {
  return report.findings.map((finding) => finding.ruleId);
}

function findingFor(report: VerificationReadinessReport, ruleId: string) {
  return report.findings.find((finding) => finding.ruleId === ruleId);
}

beforeEach(() => {
  vi.clearAllMocks();
  readinessRepository.__reset();
});

// --- The baseline -----------------------------------------------------------

describe("a well-formed activity", () => {
  it("is READY, and says so without claiming it has passed", async () => {
    buildScenario(healthyScenario());
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(report.assessment.status).toBe("READY");
    expect(report.assessment.scope).toBe("EXECUTION");
    expect(report.assessment.summary.blocking).toBe(0);
    // Readiness says nothing about the activity's own outcome.
    expect(report.assessment).not.toHaveProperty("result");
  });

  it("explains a READY verdict rather than returning an empty report", async () => {
    buildScenario(healthyScenario());
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    // A pass with no reasons would be indistinguishable from "we did not look".
    expect(report.findings.length).toBeGreaterThan(0);
    expect(ruleIds(report)).toContain("VR-REQ-003");
    expect(ruleIds(report)).toContain("VR-LIFE-001");
  });

  it("records no score, percentage or confidence anywhere in the assessment", async () => {
    buildScenario(healthyScenario());
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    const serialized = JSON.stringify(report);
    expect(serialized).not.toMatch(/"score"|"percent|"confidence"|"probability"/i);
  });
});

// --- Requirement state ------------------------------------------------------

describe("requirement state", () => {
  it("blocks readiness while the requirement is DRAFT", async () => {
    buildScenario({ requirements: [{ id: "req1", status: "DRAFT" }] });
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(report.assessment.status).toBe("NOT_READY");
    const finding = findingFor(report, "VR-REQ-001");
    expect(finding?.status).toBe("BLOCKING");
    expect(finding?.category).toBe("REQUIREMENT_STATE");
    expect(finding?.subjectIdentifier).toBe("REQ1");
    // Named object, named state, named remedy — never "readiness failed".
    expect(finding?.message).toMatch(/REQ1 is DRAFT/);
    expect(finding?.message).toMatch(/APPROVED or BASELINED/);
  });

  it("blocks readiness while the requirement is IN_REVIEW", async () => {
    buildScenario({ requirements: [{ id: "req1", status: "IN_REVIEW" }] });
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(report.assessment.status).toBe("NOT_READY");
    expect(findingFor(report, "VR-REQ-001")?.message).toMatch(/IN_REVIEW/);
  });

  it("lets an APPROVED requirement satisfy the requirement-state condition", async () => {
    buildScenario({ requirements: [{ id: "req1", status: "APPROVED" }] });
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(findingFor(report, "VR-REQ-003")?.status).toBe("INFORMATIONAL");
    expect(findingFor(report, "VR-REQ-001")).toBeUndefined();
    expect(report.assessment.status).toBe("READY");
  });

  it("lets a BASELINED requirement satisfy it too", async () => {
    buildScenario({ requirements: [{ id: "req1", status: "BASELINED" }] });
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(findingFor(report, "VR-REQ-003")?.message).toMatch(/BASELINED/);
    expect(report.assessment.status).toBe("READY");
  });

  it("never lets an OBSOLETE requirement become ready", async () => {
    buildScenario({ requirements: [{ id: "req1", status: "OBSOLETE" }] });
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(report.assessment.status).toBe("NOT_READY");
    expect(findingFor(report, "VR-REQ-002")?.status).toBe("BLOCKING");
  });
});

// --- Verification definition and lifecycle ---------------------------------

describe("the verification definition", () => {
  it("blocks readiness when the activity carries no title", async () => {
    buildScenario(healthyScenario({ activity: { title: "   " } }));
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(findingFor(report, "VR-DEF-001")?.status).toBe("BLOCKING");
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("blocks readiness when no verification method is recorded", async () => {
    buildScenario(healthyScenario({ activity: { method: "" as never } }));
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(findingFor(report, "VR-DEF-002")?.status).toBe("BLOCKING");
  });

  it("warns about a missing owner without blocking, because the domain allows one", async () => {
    buildScenario(healthyScenario({ activity: { ownerId: null } }));
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    const finding = findingFor(report, "VR-OWN-001");
    expect(finding?.status).toBe("WARNING");
    expect(finding?.category).toBe("OWNER");
    // The warning is real, and it does not disqualify.
    expect(report.assessment.status).toBe("READY");
    expect(report.assessment.summary.warning).toBeGreaterThan(0);
  });

  it("does not warn when an owner is assigned", async () => {
    buildScenario(healthyScenario());
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(findingFor(report, "VR-OWN-001")).toBeUndefined();
  });
});

describe("the verification lifecycle", () => {
  it("asks the execution question of a PLANNED activity", async () => {
    buildScenario(healthyScenario({ activityStatus: "PLANNED" }));
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(report.assessment.scope).toBe("EXECUTION");
    expect(findingFor(report, "VR-LIFE-001")?.message).toMatch(/can be executed/);
  });

  it("asks the closure question once the activity is IN_PROGRESS", async () => {
    buildScenario(healthyScenario({ activityStatus: "IN_PROGRESS" }));
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    // Not READY-as-if-waiting-to-start, and not NOT_READY either: the scope
    // records honestly which question was answered.
    expect(report.assessment.scope).toBe("CLOSURE");
    expect(findingFor(report, "VR-LIFE-002")?.message).toMatch(/concluded responsibly/);
    expect(findingFor(report, "VR-LIFE-001")).toBeUndefined();
  });

  it("refuses to call a concluded activity ready merely because it exists", async () => {
    for (const status of ["PASSED", "FAILED", "WAIVED"] as VerificationStatus[]) {
      readinessRepository.__reset();
      buildScenario(
        healthyScenario({
          activityStatus: status,
          activity: { completedDate: new Date("2026-04-01T00:00:00.000Z") },
        }),
      );
      const report = await service().evaluateVerificationReadiness(
        CONTEXT,
        PROJECT_ID,
        ACTIVITY_ID,
      );

      expect(report.assessment.scope).toBe("NOT_APPLICABLE");
      expect(report.assessment.status).toBe("NOT_READY");
      const finding = findingFor(report, "VR-LIFE-003");
      expect(finding?.status).toBe("BLOCKING");
      expect(finding?.message).toMatch(new RegExp(`concluded as ${status}`));
      expect(finding?.message).toMatch(/2026-04-01/);
    }
  });

  it("says only the concluded-record condition about a closed activity", async () => {
    // Asking "is the requirement approved?" of a finished record is noise.
    buildScenario({
      activityStatus: "PASSED",
      requirements: [{ id: "req1", status: "DRAFT" }],
    });
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(ruleIds(report)).toEqual(["VR-LIFE-003"]);
  });
});

// --- Traceability -----------------------------------------------------------

describe("traceability", () => {
  it("blocks readiness when the activity verifies no requirement", async () => {
    buildScenario({ requirements: [] });
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    const finding = findingFor(report, "VR-TRACE-001");
    expect(finding?.status).toBe("BLOCKING");
    expect(finding?.category).toBe("TRACEABILITY");
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("reports a link whose requirement is outside the project as indeterminate", async () => {
    // The graph drops the edge (it fails closed); the link row still exists, so
    // the condition is "we cannot tell", never "satisfied".
    buildScenario({
      requirements: [{ id: "reqX", status: "APPROVED", inProject: false }],
    });
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    const finding = findingFor(report, "VR-TRACE-002");
    expect(finding?.status).toBe("UNKNOWN");
    expect(report.assessment.status).toBe("UNKNOWN");

    // Nothing about the record outside the project is named. The subject is the
    // activity, whose traceability is in question; the only citation is this
    // project's own relationship row, which is what someone would investigate.
    expect(finding?.subjectType).toBe("VERIFICATION_ACTIVITY");
    expect(finding?.subjectId).toBe(ACTIVITY_ID);
    expect(finding?.message).toMatch(/relationship rel-ver-reqX/);

    // The foreign requirement appears nowhere as an object in its own right.
    expect(report.findings.some((f) => f.subjectId === "reqX")).toBe(false);
    expect(report.basis.objects.some((object) => object.id === "reqX")).toBe(false);
  });
});

// --- Design state -----------------------------------------------------------

describe("prerequisite design state", () => {
  it("blocks readiness when a prerequisite design item is obsolete", async () => {
    buildScenario(
      healthyScenario({ designItems: [{ id: "di1", status: "OBSOLETE" }] }),
    );
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(findingFor(report, "VR-DES-001")?.status).toBe("BLOCKING");
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("warns, without blocking, when the design is still uncontrolled", async () => {
    // Verifying against a draft design is legitimate; the record should say so
    // rather than inventing a universal approved-design requirement.
    buildScenario(healthyScenario({ designItems: [{ id: "di1", status: "DRAFT" }] }));
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(findingFor(report, "VR-DES-002")?.status).toBe("WARNING");
    expect(report.assessment.status).toBe("READY");
  });

  it("records a controlled design item as satisfying the condition", async () => {
    buildScenario(healthyScenario({ designItems: [{ id: "di1", status: "BASELINED" }] }));
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(findingFor(report, "VR-DES-003")?.status).toBe("INFORMATIONAL");
  });
});

// --- Decision state ---------------------------------------------------------

describe("decision dependencies", () => {
  it("blocks readiness when a decision that establishes the configuration is unsettled", async () => {
    buildScenario(
      healthyScenario({
        decisions: [{ id: "ed1", status: "UNDER_REVIEW", addresses: "req1" }],
      }),
    );
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    const finding = findingFor(report, "VR-DEC-001");
    expect(finding?.status).toBe("BLOCKING");
    expect(finding?.subjectIdentifier).toBe("ED1");
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("accepts an approved decision", async () => {
    buildScenario(
      healthyScenario({ decisions: [{ id: "ed1", status: "APPROVED", addresses: "req1" }] }),
    );
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(findingFor(report, "VR-DEC-004")?.status).toBe("INFORMATIONAL");
    expect(report.assessment.status).toBe("READY");
  });

  it("blocks on a rejected decision the record still treats as a dependency", async () => {
    buildScenario(
      healthyScenario({ decisions: [{ id: "ed1", status: "REJECTED", addresses: "req1" }] }),
    );
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(findingFor(report, "VR-DEC-002")?.status).toBe("BLOCKING");
  });

  it("warns on a superseded decision, saying it cannot resolve the successor", async () => {
    buildScenario(
      healthyScenario({ decisions: [{ id: "ed1", status: "SUPERSEDED", addresses: "req1" }] }),
    );
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    const finding = findingFor(report, "VR-DEC-003");
    expect(finding?.status).toBe("WARNING");
    expect(finding?.message).toMatch(/successor/);
    expect(report.assessment.status).toBe("READY");
  });

  it("follows a decision that shapes a prerequisite design item", async () => {
    buildScenario(
      healthyScenario({
        designItems: [{ id: "di1", status: "APPROVED" }],
        decisions: [{ id: "ed1", status: "PROPOSED", shapes: "di1" }],
      }),
    );
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(findingFor(report, "VR-DEC-001")?.subjectIdentifier).toBe("ED1");
  });

  it("ignores a decision the requirement merely derives from", async () => {
    // Upstream provenance is not a dependency of the verification. Applying the
    // rule blindly to every connected decision would fire on records nobody
    // would call prerequisites.
    buildScenario(
      healthyScenario({ decisions: [{ id: "ed1", status: "PROPOSED", derivedFrom: "req1" }] }),
    );
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(findingFor(report, "VR-DEC-001")).toBeUndefined();
    expect(report.assessment.status).toBe("READY");
  });
});

// --- Assumption state -------------------------------------------------------

describe("assumption monitoring", () => {
  const withAssumption = (
    monitoring: AssumptionSpec["monitoring"],
    status: AssumptionStatus = "UNKNOWN",
  ) =>
    healthyScenario({
      decisions: [{ id: "ed1", status: "APPROVED", addresses: "req1" }],
      assumptions: [{ id: "asm1", decisionId: "ed1", status, monitoring }],
    });

  it("blocks when monitoring says a judged assumption needs review", async () => {
    buildScenario(withAssumption("REVIEW_REQUIRED", "VALIDATED"));
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(findingFor(report, "VR-ASM-001")?.status).toBe("BLOCKING");
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("warns when the basis moved but nothing had been judged on it", async () => {
    buildScenario(withAssumption("BASIS_CHANGED"));
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(findingFor(report, "VR-ASM-002")?.status).toBe("WARNING");
    expect(report.assessment.status).toBe("READY");
  });

  it("reports an unmonitored assumption as indeterminate, never as a failure", async () => {
    buildScenario(withAssumption(null));
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    const finding = findingFor(report, "VR-ASM-003");
    expect(finding?.status).toBe("UNKNOWN");
    expect(report.assessment.status).toBe("UNKNOWN");
    expect(report.assessment.summary.blocking).toBe(0);
  });

  it("consumes an engineer's INVALIDATED judgement without producing one", async () => {
    buildScenario(withAssumption("CURRENT", "INVALIDATED"));
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(findingFor(report, "VR-ASM-005")?.status).toBe("BLOCKING");
    // Nothing wrote to the assumption; the engine only read it.
    expect(basisRepository.loadAssumptionStates).toHaveBeenCalled();
  });

  it("never writes assumption or monitoring state", async () => {
    buildScenario(withAssumption("REVIEW_REQUIRED", "VALIDATED"));
    await service().evaluateVerificationReadiness(CONTEXT, PROJECT_ID, ACTIVITY_ID);

    // The monitoring module exposes only a read to this engine, and the mock
    // would fail on any other call.
    expect(Object.keys(monitoringRepository)).toEqual(["findLatestForAssumptions"]);
  });
});

// --- Change impact ----------------------------------------------------------

describe("change impact", () => {
  it("blocks when a current analysis reaches the activity itself", async () => {
    buildScenario(
      healthyScenario({
        changes: [
          {
            id: "chg1",
            identifier: "CR-001",
            analysis: { id: "ana1", sourceFingerprint: "fp-project" },
            affected: [{ type: "VERIFICATION_ACTIVITY", id: ACTIVITY_ID }],
          },
        ],
      }),
    );
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(findingFor(report, "VR-CHG-001")?.status).toBe("BLOCKING");
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("blocks when a current analysis reaches a requirement being verified", async () => {
    buildScenario(
      healthyScenario({
        changes: [
          {
            id: "chg1",
            identifier: "CR-001",
            analysis: { id: "ana1", sourceFingerprint: "fp-project" },
            affected: [{ type: "REQUIREMENT", id: "req1" }],
          },
        ],
      }),
    );
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    const finding = findingFor(report, "VR-CHG-002");
    expect(finding?.status).toBe("BLOCKING");
    expect(finding?.message).toMatch(/REQ1/);
  });

  it("warns, without blocking, when it only reaches a prerequisite design item", async () => {
    buildScenario(
      healthyScenario({
        designItems: [{ id: "di1", status: "APPROVED" }],
        changes: [
          {
            id: "chg1",
            identifier: "CR-001",
            analysis: { id: "ana1", sourceFingerprint: "fp-project" },
            affected: [{ type: "DESIGN_ITEM", id: "di1" }],
          },
        ],
      }),
    );
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(findingFor(report, "VR-CHG-005")?.status).toBe("WARNING");
    expect(report.assessment.status).toBe("READY");
  });

  it("reports a change that was never analysed as indeterminate", async () => {
    buildScenario(
      healthyScenario({
        changes: [
          {
            id: "chg1",
            identifier: "CR-001",
            analysis: null,
            declared: [{ type: "REQUIREMENT", id: "req1" }],
          },
        ],
      }),
    );
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(findingFor(report, "VR-CHG-004")?.status).toBe("UNKNOWN");
    expect(report.assessment.status).toBe("UNKNOWN");
  });

  it("treats a failed analysis as no analysis rather than as a result", async () => {
    buildScenario(
      healthyScenario({
        changes: [
          {
            id: "chg1",
            identifier: "CR-001",
            analysis: { id: "ana1", status: "FAILED", sourceFingerprint: "" },
            declared: [{ type: "REQUIREMENT", id: "req1" }],
          },
        ],
      }),
    );
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(findingFor(report, "VR-CHG-004")?.status).toBe("UNKNOWN");
  });

  it("never uses a stale analysis as current evidence", async () => {
    buildScenario(
      healthyScenario({
        changes: [
          {
            id: "chg1",
            identifier: "CR-001",
            // The analysis was computed against a project state that has moved.
            analysis: { id: "ana1", sourceFingerprint: "fp-older" },
            declared: [{ type: "REQUIREMENT", id: "req1" }],
            affected: [{ type: "REQUIREMENT", id: "req1" }],
          },
        ],
      }),
    );
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(findingFor(report, "VR-CHG-003")?.status).toBe("UNKNOWN");
    // The stale result is not promoted into a blocking or a clean verdict.
    expect(findingFor(report, "VR-CHG-002")).toBeUndefined();
    expect(report.assessment.status).toBe("UNKNOWN");
  });

  it("is not disturbed by changes that do not reach this activity's basis", async () => {
    buildScenario(healthyScenario({ changes: [] }));
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(ruleIds(report).filter((id) => id.startsWith("VR-CHG"))).toEqual([]);
    expect(report.assessment.status).toBe("READY");
  });

  it("never runs an impact analysis of its own", async () => {
    buildScenario(
      healthyScenario({
        changes: [
          {
            id: "chg1",
            identifier: "CR-001",
            analysis: null,
            declared: [{ type: "REQUIREMENT", id: "req1" }],
          },
        ],
      }),
    );
    await service().evaluateVerificationReadiness(CONTEXT, PROJECT_ID, ACTIVITY_ID);

    // The basis repository exposes only reads; there is no run entry point.
    expect(Object.keys(basisRepository)).not.toContain("runImpactAnalysis");
    expect(basisRepository.loadChangeImpactContext).toHaveBeenCalledTimes(1);
  });
});

// --- Evidence ---------------------------------------------------------------

describe("evidence", () => {
  it("does not treat missing evidence before execution as a deficiency", async () => {
    buildScenario(healthyScenario());
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    const finding = findingFor(report, "VR-EVD-002");
    expect(finding?.status).toBe("INFORMATIONAL");
    expect(finding?.message).toMatch(/not a readiness deficiency/);
    expect(report.assessment.status).toBe("READY");
  });

  it("warns, without blocking, when an in-progress activity has recorded nothing", async () => {
    buildScenario(healthyScenario({ activityStatus: "IN_PROGRESS" }));
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(findingFor(report, "VR-EVD-003")?.status).toBe("WARNING");
    expect(report.assessment.status).toBe("READY");
  });

  it("names the evidence already attached", async () => {
    buildScenario(healthyScenario({ evidence: ["ev1"] }));
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(findingFor(report, "VR-EVD-001")?.subjectType).toBe("EVIDENCE");
    expect(findingFor(report, "VR-EVD-002")).toBeUndefined();
  });
});

// --- Precedence over a whole assessment -------------------------------------

describe("assessment precedence", () => {
  it("records every blocking condition, not only the first", async () => {
    buildScenario({
      requirements: [{ id: "req1", status: "DRAFT" }],
      designItems: [{ id: "di1", status: "OBSOLETE" }],
      decisions: [{ id: "ed1", status: "PROPOSED", addresses: "req1" }],
    });
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(report.assessment.status).toBe("NOT_READY");
    expect(report.assessment.summary.blocking).toBe(3);
    expect(ruleIds(report).slice(0, 3).sort()).toEqual([
      "VR-DEC-001",
      "VR-DES-001",
      "VR-REQ-001",
    ]);
  });

  it("leads with blocking findings, then unknown, then the rest", async () => {
    buildScenario({
      requirements: [{ id: "req1", status: "DRAFT" }],
      decisions: [{ id: "ed1", status: "APPROVED", addresses: "req1" }],
      assumptions: [{ id: "asm1", decisionId: "ed1", monitoring: null }],
      activity: { ownerId: null },
    });
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    const statuses = report.findings.map((finding) => finding.status);
    expect(statuses[0]).toBe("BLOCKING");
    expect(statuses).toContain("UNKNOWN");
    expect(statuses.indexOf("UNKNOWN")).toBeLessThan(statuses.indexOf("WARNING"));
  });

  it("lets blocking outrank an indeterminate condition", async () => {
    buildScenario({
      requirements: [{ id: "req1", status: "DRAFT" }],
      decisions: [{ id: "ed1", status: "APPROVED", addresses: "req1" }],
      assumptions: [{ id: "asm1", decisionId: "ed1", monitoring: null }],
    });
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(report.assessment.summary.unknown).toBeGreaterThan(0);
    expect(report.assessment.status).toBe("NOT_READY");
  });

  it("counts every outcome it wrote", async () => {
    buildScenario({
      requirements: [{ id: "req1", status: "DRAFT" }],
      designItems: [{ id: "di1", status: "IN_REVIEW" }],
      decisions: [{ id: "ed1", status: "APPROVED", addresses: "req1" }],
      assumptions: [{ id: "asm1", decisionId: "ed1", monitoring: null }],
    });
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    const { summary } = report.assessment;
    expect(summary.findings).toBe(report.findings.length);
    expect(summary.blocking + summary.warning + summary.informational + summary.unknown).toBe(
      summary.findings,
    );
  });
});

// --- Determinism, freshness and immutability --------------------------------

describe("determinism", () => {
  it("reaches the same conclusion twice over an unchanged basis", async () => {
    buildScenario(
      healthyScenario({
        designItems: [{ id: "di1", status: "DRAFT" }],
        decisions: [{ id: "ed1", status: "APPROVED", addresses: "req1" }],
        assumptions: [{ id: "asm1", decisionId: "ed1", monitoring: "CURRENT" }],
      }),
    );
    const engine = service();

    const first = await engine.evaluateVerificationReadiness(CONTEXT, PROJECT_ID, ACTIVITY_ID);
    const second = await engine.evaluateVerificationReadiness(CONTEXT, PROJECT_ID, ACTIVITY_ID);

    expect(readinessSignature(second)).toBe(readinessSignature(first));
    expect(second.assessment.fingerprint).toBe(first.assessment.fingerprint);
    // A new record, not an edit of the old one.
    expect(second.assessment.id).not.toBe(first.assessment.id);
  });

  it("orders findings identically across runs", async () => {
    buildScenario({
      requirements: [
        { id: "req2", status: "DRAFT" },
        { id: "req1", status: "OBSOLETE" },
      ],
    });
    const engine = service();

    const first = await engine.evaluateVerificationReadiness(CONTEXT, PROJECT_ID, ACTIVITY_ID);
    const second = await engine.evaluateVerificationReadiness(CONTEXT, PROJECT_ID, ACTIVITY_ID);

    expect(second.findings.map((f) => `${f.ruleId}:${f.subjectId}`)).toEqual(
      first.findings.map((f) => `${f.ruleId}:${f.subjectId}`),
    );
  });
});

describe("freshness", () => {
  it("reports a fresh assessment as current without re-evaluating", async () => {
    buildScenario(healthyScenario());
    const engine = service();
    await engine.evaluateVerificationReadiness(CONTEXT, PROJECT_ID, ACTIVITY_ID);

    const latest = await engine.getLatestVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(hasVerificationReadiness(latest)).toBe(true);
    if (!hasVerificationReadiness(latest)) return;
    expect(latest.freshness).toBe("CURRENT");
    // Reading created nothing.
    expect(readinessRepository["createAssessment"]).toHaveBeenCalledTimes(1);
  });

  it("goes stale when a basis object is revised", async () => {
    buildScenario(healthyScenario());
    const engine = service();
    await engine.evaluateVerificationReadiness(CONTEXT, PROJECT_ID, ACTIVITY_ID);

    fixture.setRevision(
      { type: "REQUIREMENT", id: "req1" },
      new Date("2026-09-01T00:00:00.000Z"),
    );

    const latest = await engine.getLatestVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );
    if (!hasVerificationReadiness(latest)) throw new Error("expected an assessment");
    expect(latest.freshness).toBe("STALE");
    // The stored verdict is returned unchanged, not silently recomputed.
    expect(latest.assessment.status).toBe("READY");
  });

  it("goes stale when a verified requirement's state changes", async () => {
    buildScenario(healthyScenario());
    const engine = service();
    await engine.evaluateVerificationReadiness(CONTEXT, PROJECT_ID, ACTIVITY_ID);

    vi.mocked(basisRepository.loadRequirementStates).mockResolvedValue(
      new Map([
        [
          "req1",
          { id: "req1", identifier: "REQ1", title: "Requirement req1", status: "DRAFT" },
        ],
      ]),
    );

    const latest = await engine.getLatestVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );
    if (!hasVerificationReadiness(latest)) throw new Error("expected an assessment");
    expect(latest.freshness).toBe("STALE");
  });

  it("is not staled by an object outside the basis moving", async () => {
    buildScenario(healthyScenario());
    const engine = service();
    await engine.evaluateVerificationReadiness(CONTEXT, PROJECT_ID, ACTIVITY_ID);

    // A requirement in the project that this activity has nothing to do with.
    fixture.setRevision(
      { type: "REQUIREMENT", id: "unrelated" },
      new Date("2026-09-01T00:00:00.000Z"),
    );

    const latest = await engine.getLatestVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );
    if (!hasVerificationReadiness(latest)) throw new Error("expected an assessment");
    expect(latest.freshness).toBe("CURRENT");
  });

  it("is not staled by a project-wide edit when no impact analysis is in the basis", async () => {
    buildScenario(healthyScenario());
    const engine = service();
    await engine.evaluateVerificationReadiness(CONTEXT, PROJECT_ID, ACTIVITY_ID);

    vi.mocked(revisionRepository.computeProjectFingerprint).mockResolvedValue("fp-moved");

    const latest = await engine.getLatestVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );
    if (!hasVerificationReadiness(latest)) throw new Error("expected an assessment");
    expect(latest.freshness).toBe("CURRENT");
  });

  it("goes stale when a consumed impact analysis stops being current", async () => {
    buildScenario(
      healthyScenario({
        changes: [
          {
            id: "chg1",
            identifier: "CR-001",
            analysis: { id: "ana1", sourceFingerprint: "fp-project" },
            affected: [{ type: "REQUIREMENT", id: "req1" }],
          },
        ],
      }),
    );
    const engine = service();
    await engine.evaluateVerificationReadiness(CONTEXT, PROJECT_ID, ACTIVITY_ID);

    // The project moved, so the analysis this assessment relied on is no longer
    // current — which genuinely changes what the assessment rested on.
    vi.mocked(revisionRepository.computeProjectFingerprint).mockResolvedValue("fp-moved");

    const latest = await engine.getLatestVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );
    if (!hasVerificationReadiness(latest)) throw new Error("expected an assessment");
    expect(latest.freshness).toBe("STALE");
  });
});

describe("history and immutability", () => {
  it("says NOT_EVALUATED rather than returning an empty assessment", async () => {
    buildScenario(healthyScenario());
    const latest = await service().getLatestVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(hasVerificationReadiness(latest)).toBe(false);
    expect(latest).toMatchObject({ status: "NOT_EVALUATED" });
  });

  it("keeps every assessment, newest first", async () => {
    buildScenario(healthyScenario());
    const engine = service();
    await engine.evaluateVerificationReadiness(CONTEXT, PROJECT_ID, ACTIVITY_ID);
    await engine.evaluateVerificationReadiness(CONTEXT, PROJECT_ID, ACTIVITY_ID);

    const history = await engine.listVerificationReadinessHistory(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );
    expect(history).toHaveLength(2);
    expect(history[0]!.evaluatedAt.getTime()).toBeGreaterThan(
      history[1]!.evaluatedAt.getTime(),
    );
  });

  it("leaves a historical assessment exactly as it was recorded", async () => {
    buildScenario(healthyScenario());
    const engine = service();
    const first = await engine.evaluateVerificationReadiness(CONTEXT, PROJECT_ID, ACTIVITY_ID);

    // The requirement is withdrawn, and readiness is evaluated again.
    vi.mocked(basisRepository.loadRequirementStates).mockResolvedValue(
      new Map([
        [
          "req1",
          { id: "req1", identifier: "REQ1", title: "Requirement req1", status: "OBSOLETE" },
        ],
      ]),
    );
    const second = await engine.evaluateVerificationReadiness(CONTEXT, PROJECT_ID, ACTIVITY_ID);
    expect(second.assessment.status).toBe("NOT_READY");

    const historical = await engine.explainVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      first.assessment.id,
    );

    // The old record still says what was believed then, and is honest about no
    // longer holding.
    expect(historical.assessment.status).toBe("READY");
    expect(historical.assessment.fingerprint).toBe(first.assessment.fingerprint);
    expect(readinessSignature(historical)).toBe(readinessSignature(first));
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
    buildScenario(healthyScenario());
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    const events = vi
      .mocked(auditLogRepository.recordAuditEvent)
      .mock.calls.map((call) => call[0] as unknown as Record<string, unknown>);

    expect(events.map((event) => event["action"])).toEqual([
      "verification_readiness.evaluation_started",
      "verification_readiness.evaluated",
    ]);

    const completed = events[1]!;
    expect(completed["entityType"]).toBe("VerificationReadinessAssessment");
    expect(completed["entityId"]).toBe(report.assessment.id);
    expect(completed["actorId"]).toBe(CONTEXT.actorId);
    expect(completed["organizationId"]).toBe(CONTEXT.organizationId);
    expect(completed["metadata"]).toMatchObject({
      projectId: PROJECT_ID,
      verificationActivityId: ACTIVITY_ID,
      status: "READY",
      readinessVersion: VERIFICATION_READINESS_VERSION,
    });
  });

  it("does not put every finding in the audit log", async () => {
    buildScenario({
      requirements: [{ id: "req1", status: "DRAFT" }],
      designItems: [{ id: "di1", status: "OBSOLETE" }],
    });
    await service().evaluateVerificationReadiness(CONTEXT, PROJECT_ID, ACTIVITY_ID);

    // The persisted assessment holds the detail; the audit log holds the event.
    expect(vi.mocked(auditLogRepository.recordAuditEvent)).toHaveBeenCalledTimes(2);
  });

  it("audits no read", async () => {
    buildScenario(healthyScenario());
    const engine = service();
    await engine.evaluateVerificationReadiness(CONTEXT, PROJECT_ID, ACTIVITY_ID);
    vi.mocked(auditLogRepository.recordAuditEvent).mockClear();

    await engine.getLatestVerificationReadiness(CONTEXT, PROJECT_ID, ACTIVITY_ID);
    await engine.listVerificationReadinessHistory(CONTEXT, PROJECT_ID, ACTIVITY_ID);

    expect(vi.mocked(auditLogRepository.recordAuditEvent)).not.toHaveBeenCalled();
  });
});

// --- Boundaries -------------------------------------------------------------

describe("scope and input boundaries", () => {
  it("refuses a project outside the caller's organization", async () => {
    buildScenario(healthyScenario());
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    await expect(
      service().evaluateVerificationReadiness(CONTEXT, PROJECT_ID, ACTIVITY_ID),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses an activity that is not in the project", async () => {
    buildScenario(healthyScenario());
    vi.mocked(verificationRepository.findVerificationActivityInProject).mockResolvedValue(null);

    await expect(
      service().evaluateVerificationReadiness(CONTEXT, PROJECT_ID, "vaX"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("does not reach an assessment through another project's id", async () => {
    buildScenario(healthyScenario());
    const engine = service();
    const report = await engine.evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    // The tenancy guard refuses before the assessment is ever looked up, and
    // reports "not found" rather than confirming that it exists.
    await expect(
      engine.explainVerificationReadiness(
        CONTEXT,
        "proj2aaaaaaaaaaaaaaaaaa",
        report.assessment.id,
      ),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("does not return an assessment id that is not in this project", async () => {
    buildScenario(healthyScenario());
    const engine = service();
    await engine.evaluateVerificationReadiness(CONTEXT, PROJECT_ID, ACTIVITY_ID);

    // Second line of defence: even inside a project the caller may read, the
    // repository query is project-scoped, so a guessed id resolves to nothing.
    await expect(
      engine.explainVerificationReadiness(CONTEXT, PROJECT_ID, "assessment999"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects a client that tries to supply a readiness verdict", async () => {
    buildScenario(healthyScenario());

    await expect(
      service().evaluateVerificationReadiness(CONTEXT, PROJECT_ID, ACTIVITY_ID, {
        status: "READY",
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("never references an object outside the project in a finding", async () => {
    buildScenario(
      healthyScenario({
        designItems: [{ id: "di1", status: "APPROVED" }],
        decisions: [{ id: "ed1", status: "APPROVED", addresses: "req1" }],
      }),
    );
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    const known = new Set([ACTIVITY_ID, "req1", "di1", "ed1"]);
    for (const finding of report.findings) {
      expect(known.has(finding.subjectId)).toBe(true);
    }
  });
});

// --- The basis --------------------------------------------------------------

describe("the recorded basis", () => {
  it("names every object the walk actually reached, and no others", async () => {
    buildScenario(
      healthyScenario({
        designItems: [{ id: "di1", status: "APPROVED" }],
        decisions: [{ id: "ed1", status: "APPROVED", addresses: "req1" }],
        assumptions: [{ id: "asm1", decisionId: "ed1", monitoring: "CURRENT" }],
        evidence: ["ev1"],
      }),
    );
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(report.basis.objects.map((object) => object.id).sort()).toEqual([
      "asm1",
      "di1",
      "ed1",
      "ev1",
      "req1",
      ACTIVITY_ID,
    ].sort());
  });

  it("cites the real relationship rows it was reached through", async () => {
    buildScenario(healthyScenario({ designItems: [{ id: "di1", status: "APPROVED" }] }));
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(report.basis.relationships.map((r) => r.relationshipId).sort()).toEqual([
      "rel-alloc-di1",
      "rel-ver-req1",
    ]);
    expect(report.basis.relationships.every((r) => r.edgeType.length > 0)).toBe(true);
  });

  it("stamps each object with its own revision, never with the evaluation time", async () => {
    buildScenario(healthyScenario());
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    for (const object of report.basis.objects) {
      expect(object.revision).toBe(BASELINE_REVISION.toISOString());
    }
  });

  it("records the monitoring verdict it consumed for each assumption", async () => {
    buildScenario(
      healthyScenario({
        decisions: [{ id: "ed1", status: "APPROVED", addresses: "req1" }],
        assumptions: [{ id: "asm1", decisionId: "ed1", monitoring: "REVIEW_REQUIRED" }],
      }),
    );
    const report = await service().evaluateVerificationReadiness(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
    );

    expect(report.basis.monitoring).toEqual([
      {
        assumptionId: "asm1",
        recordId: "mon-asm1",
        monitoringStatus: "REVIEW_REQUIRED",
        basisFingerprint: "fp-asm1",
      },
    ]);
  });
});
