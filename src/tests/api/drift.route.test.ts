// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  DriftReport,
  EngineeringBaseline,
  OperationalObservation,
  Project,
} from "@/domain";
import { ConflictError, UnauthorizedError } from "@/server/errors";

/**
 * Drift route handlers, driven through the *real* service with only
 * repositories and the transaction faked. Validation, lifecycle rules, tenancy
 * and status mapping are genuinely exercised without PostgreSQL.
 */
const TX = { __transaction: true } as const;

const CONTEXT = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
  sessionId: "sess1aaaaaaaaaaaaaaaaaa",
  user: { id: "user1aaaaaaaaaaaaaaaaaaa", name: "Ada", email: "ada@example.test", role: "ADMIN" },
  organization: { id: "org1aaaaaaaaaaaaaaaaaaaa", name: "Example Aerospace" },
};

vi.mock("@/lib/db", () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(TX)) },
}));

vi.mock("@/server/auth/context", () => ({
  requireAuthenticatedContext: vi.fn(async () => CONTEXT),
}));

vi.mock("@/server/repositories/project.repository", () => ({
  findProjectInOrganization: vi.fn(),
}));

vi.mock("@/server/repositories/engineering-baseline.repository", () => ({
  createBaseline: vi.fn(),
  findBaselineInProject: vi.fn(),
  listBaselinesInProject: vi.fn(),
  findActiveBaseline: vi.fn(),
  updateBaseline: vi.fn(),
  activateBaseline: vi.fn(),
  supersedeBaseline: vi.fn(),
}));

vi.mock("@/server/repositories/baseline-member.repository", () => ({
  createMember: vi.fn(),
  listMembers: vi.fn(),
  findMemberInBaseline: vi.fn(),
  deleteMember: vi.fn(),
  loadBaselineableObjects: vi.fn(),
}));

vi.mock("@/server/repositories/operational-observation.repository", () => ({
  createObservation: vi.fn(),
  findObservationInProject: vi.fn(),
  listObservationsInProject: vi.fn(),
  listObservationsForEvaluation: vi.fn(),
  updateObservation: vi.fn(),
  transitionObservation: vi.fn(),
  observationSubjectExistsInProject: vi.fn(),
}));

vi.mock("@/server/repositories/drift-assessment.repository", () => ({
  createAssessment: vi.fn(),
  createFindings: vi.fn(),
  findLatestAssessment: vi.fn(),
  listAssessments: vi.fn(),
  findAssessmentInProject: vi.fn(),
  readAssessmentBasis: vi.fn(),
  listFindings: vi.fn(),
  loadChangeContext: vi.fn(),
}));

vi.mock("@/server/repositories/project-artifacts.repository", () => ({
  listBaselineMemberTargets: vi.fn(),
}));

vi.mock("@/server/repositories/audit-log.repository", () => ({
  recordAuditEvent: vi.fn(),
  listAuditEventsForEntity: vi.fn(),
}));

const authContext = await import("@/server/auth/context");
const projectRepository = await import("@/server/repositories/project.repository");
const baselineRepository = await import("@/server/repositories/engineering-baseline.repository");
const memberRepository = await import("@/server/repositories/baseline-member.repository");
const observationRepository = await import(
  "@/server/repositories/operational-observation.repository"
);
const assessmentRepository = await import("@/server/repositories/drift-assessment.repository");
const artifactsRepository = await import("@/server/repositories/project-artifacts.repository");
const auditLogRepository = await import("@/server/repositories/audit-log.repository");

const baselinesCollection = await import("@/app/api/projects/[projectId]/baselines/route");
const baselineDetail = await import(
  "@/app/api/projects/[projectId]/baselines/[baselineId]/route"
);
const baselineActivate = await import(
  "@/app/api/projects/[projectId]/baselines/[baselineId]/activate/route"
);
const baselineSupersede = await import(
  "@/app/api/projects/[projectId]/baselines/[baselineId]/supersede/route"
);
const baselineCompare = await import(
  "@/app/api/projects/[projectId]/baselines/[baselineId]/compare/route"
);
const membersCollection = await import(
  "@/app/api/projects/[projectId]/baselines/[baselineId]/members/route"
);
const memberDetail = await import(
  "@/app/api/projects/[projectId]/baselines/[baselineId]/members/[memberId]/route"
);
const memberTargets = await import("@/app/api/projects/[projectId]/baseline-member-targets/route");
const observationsCollection = await import("@/app/api/projects/[projectId]/observations/route");
const observationDetail = await import(
  "@/app/api/projects/[projectId]/observations/[observationId]/route"
);
const observationReview = await import(
  "@/app/api/projects/[projectId]/observations/[observationId]/review/route"
);
const observationReject = await import(
  "@/app/api/projects/[projectId]/observations/[observationId]/reject/route"
);
const driftEvaluate = await import("@/app/api/projects/[projectId]/drift/evaluate/route");
const driftLatest = await import("@/app/api/projects/[projectId]/drift/latest/route");
const driftHistory = await import("@/app/api/projects/[projectId]/drift/route");
const driftAssessment = await import("@/app/api/projects/[projectId]/drift/[assessmentId]/route");

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";
const BASELINE_ID = "bl1aaaaaaaaaaaaaaaaaaaa";
const OBSERVATION_ID = "obs1aaaaaaaaaaaaaaaaaa";
const ASSESSMENT_ID = "drf1aaaaaaaaaaaaaaaaaa";

const PROJECT: Project = {
  id: PROJECT_ID,
  organizationId: CONTEXT.organizationId,
  name: "Upper Stage Propulsion",
  description: null,
  status: "ACTIVE",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function baseline(overrides: Partial<EngineeringBaseline> = {}): EngineeringBaseline {
  return {
    id: BASELINE_ID,
    projectId: PROJECT_ID,
    identifier: "BL-001",
    name: "Design baseline",
    description: null,
    status: "DRAFT",
    createdById: CONTEXT.actorId,
    baselinedAt: null,
    baselinedById: null,
    supersededAt: null,
    supersededById: null,
    createdAt: new Date("2026-01-15T00:00:00.000Z"),
    updatedAt: new Date("2026-01-15T00:00:00.000Z"),
    ...overrides,
  };
}

function observation(
  overrides: Partial<OperationalObservation> = {},
): OperationalObservation {
  return {
    id: OBSERVATION_ID,
    projectId: PROJECT_ID,
    identifier: "OBS-001",
    title: "Peak wall temperature",
    description: "Measured on flight 14.",
    observationType: "MEASUREMENT",
    status: "RECORDED",
    source: null,
    observedAt: new Date("2026-05-01T00:00:00.000Z"),
    subjectLabel: null,
    numericValue: "842.5",
    unit: "K",
    textValue: null,
    subject: null,
    createdById: CONTEXT.actorId,
    reviewedAt: null,
    reviewedById: null,
    createdAt: new Date("2026-05-01T00:00:00.000Z"),
    updatedAt: new Date("2026-05-01T00:00:00.000Z"),
    ...overrides,
  };
}

const ASSESSMENT: DriftReport["assessment"] = {
  id: ASSESSMENT_ID,
  projectId: PROJECT_ID,
  baselineId: BASELINE_ID,
  status: "DRIFT_DETECTED",
  driftVersion: "1",
  fingerprint: "fp",
  summary: { findings: 2, reviewRequired: 1, informational: 1, unknown: 0 },
  evaluatedAt: new Date("2026-06-01T00:00:00.000Z"),
  evaluatedById: CONTEXT.actorId,
  createdAt: new Date("2026-06-01T00:00:00.000Z"),
};

const BASE = `http://localhost/api/projects/${PROJECT_ID}`;

function request(method: string, body?: unknown, url = BASE): Request {
  return new Request(url, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
  });
}

const projectParams = { params: Promise.resolve({ projectId: PROJECT_ID }) };
const baselineParams = {
  params: Promise.resolve({ projectId: PROJECT_ID, baselineId: BASELINE_ID }),
};
const memberParams = {
  params: Promise.resolve({ projectId: PROJECT_ID, baselineId: BASELINE_ID, memberId: "mem1" }),
};
const observationParams = {
  params: Promise.resolve({ projectId: PROJECT_ID, observationId: OBSERVATION_ID }),
};
const assessmentParams = {
  params: Promise.resolve({ projectId: PROJECT_ID, assessmentId: ASSESSMENT_ID }),
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authContext.requireAuthenticatedContext).mockResolvedValue(CONTEXT as never);
  vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(PROJECT);
  vi.mocked(auditLogRepository.recordAuditEvent).mockResolvedValue(undefined as never);
  vi.mocked(auditLogRepository.listAuditEventsForEntity).mockResolvedValue([]);
  vi.mocked(assessmentRepository.loadChangeContext).mockResolvedValue(new Map());
  vi.mocked(memberRepository.loadBaselineableObjects).mockResolvedValue(new Map());
  vi.mocked(observationRepository.listObservationsForEvaluation).mockResolvedValue([]);
});

// --- Authentication ---------------------------------------------------------

describe("authentication", () => {
  it("401s every drift route without a session", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(
      new UnauthorizedError("Sign in required."),
    );

    const responses = await Promise.all([
      baselinesCollection.GET(request("GET"), projectParams),
      baselinesCollection.POST(request("POST", { identifier: "BL-1", name: "X" }), projectParams),
      baselineDetail.GET(request("GET"), baselineParams),
      baselineDetail.PATCH(request("PATCH", { name: "X" }), baselineParams),
      baselineActivate.POST(request("POST", {}), baselineParams),
      baselineSupersede.POST(request("POST"), baselineParams),
      baselineCompare.GET(request("GET"), baselineParams),
      membersCollection.GET(request("GET"), baselineParams),
      membersCollection.POST(
        request("POST", { nodeType: "DESIGN_ITEM", nodeId: "d1" }),
        baselineParams,
      ),
      memberDetail.DELETE(request("DELETE"), memberParams),
      memberTargets.GET(request("GET"), projectParams),
      observationsCollection.GET(request("GET"), projectParams),
      observationDetail.GET(request("GET"), observationParams),
      observationReview.POST(request("POST", {}), observationParams),
      observationReject.POST(request("POST", {}), observationParams),
      driftEvaluate.POST(request("POST", { baselineId: BASELINE_ID }), projectParams),
      driftLatest.GET(request("GET"), projectParams),
      driftHistory.GET(request("GET"), projectParams),
      driftAssessment.GET(request("GET"), assessmentParams),
    ]);

    for (const response of responses) {
      expect(response.status).toBe(401);
    }
  });

  it("never reaches a repository when the session is missing", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(
      new UnauthorizedError("Sign in required."),
    );

    await driftEvaluate.POST(request("POST", { baselineId: BASELINE_ID }), projectParams);

    expect(projectRepository.findProjectInOrganization).not.toHaveBeenCalled();
    expect(assessmentRepository.createAssessment).not.toHaveBeenCalled();
  });
});

// --- Baselines --------------------------------------------------------------

describe("baseline routes", () => {
  it("creates a baseline and returns 201", async () => {
    vi.mocked(baselineRepository.createBaseline).mockResolvedValue(baseline());

    const response = await baselinesCollection.POST(
      request("POST", { identifier: "BL-001", name: "Design baseline" }),
      projectParams,
    );

    expect(response.status).toBe(201);
    expect((await response.json()).baseline.status).toBe("DRAFT");
  });

  it("400s when a client tries to set a status", async () => {
    const response = await baselinesCollection.POST(
      request("POST", { identifier: "BL-001", name: "X", status: "ACTIVE" }),
      projectParams,
    );

    expect(response.status).toBe(400);
    expect(baselineRepository.createBaseline).not.toHaveBeenCalled();
  });

  it("400s when a client tries to supply a project or actor", async () => {
    for (const extra of [{ projectId: "other" }, { createdById: "someone" }]) {
      const response = await baselinesCollection.POST(
        request("POST", { identifier: "BL-001", name: "X", ...extra }),
        projectParams,
      );
      expect(response.status).toBe(400);
    }
  });

  it("404s for a project outside the caller's organization", async () => {
    vi.mocked(projectRepository.findProjectInOrganization).mockResolvedValue(null);

    const response = await baselinesCollection.GET(request("GET"), projectParams);

    expect(response.status).toBe(404);
  });

  it("lists baselines including superseded ones", async () => {
    vi.mocked(baselineRepository.listBaselinesInProject).mockResolvedValue([
      { ...baseline({ status: "SUPERSEDED" }), memberCount: 3, assessmentCount: 2 },
    ]);

    const response = await baselinesCollection.GET(request("GET"), projectParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.baselines[0].status).toBe("SUPERSEDED");
    expect(body.baselines[0].memberCount).toBe(3);
  });

  it("returns a baseline with its membership and change flags", async () => {
    vi.mocked(baselineRepository.findBaselineInProject).mockResolvedValue(baseline());
    vi.mocked(memberRepository.listMembers).mockResolvedValue([
      {
        id: "mem1",
        baselineId: BASELINE_ID,
        nodeType: "DESIGN_ITEM",
        nodeId: "di1",
        identifierSnapshot: "DI-001",
        labelSnapshot: "Chamber",
        stateSnapshot: "APPROVED",
        fingerprint: "fp-old",
        revisionSnapshot: new Date("2026-01-20T00:00:00.000Z"),
        createdAt: new Date("2026-01-20T00:00:00.000Z"),
      },
    ]);
    vi.mocked(memberRepository.loadBaselineableObjects).mockResolvedValue(
      new Map([
        [
          "DESIGN_ITEM:di1",
          {
            nodeType: "DESIGN_ITEM" as const,
            nodeId: "di1",
            identifier: "DI-001",
            label: "Chamber",
            state: "BASELINED",
            fingerprint: "fp-new",
            revision: new Date("2026-03-01T00:00:00.000Z"),
            comparisonTerms: null,
          },
        ],
      ]),
    );

    const response = await baselineDetail.GET(request("GET"), baselineParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.baseline.members[0].changed).toBe(true);
    expect(body.baseline.members[0].currentState).toBe("BASELINED");
  });

  it("404s for a baseline belonging to another project", async () => {
    vi.mocked(baselineRepository.findBaselineInProject).mockResolvedValue(null);

    const response = await baselineDetail.GET(request("GET"), baselineParams);

    expect(response.status).toBe(404);
  });

  it("409s when editing an active baseline", async () => {
    vi.mocked(baselineRepository.findBaselineInProject).mockResolvedValue(
      baseline({ status: "ACTIVE" }),
    );

    const response = await baselineDetail.PATCH(
      request("PATCH", { name: "Renamed" }),
      baselineParams,
    );

    expect(response.status).toBe(409);
  });

  it("409s when activating while another baseline is active", async () => {
    vi.mocked(baselineRepository.findBaselineInProject).mockResolvedValue(baseline());
    vi.mocked(memberRepository.listMembers).mockResolvedValue([
      {
        id: "mem1",
        baselineId: BASELINE_ID,
        nodeType: "DESIGN_ITEM",
        nodeId: "di1",
        identifierSnapshot: "DI-001",
        labelSnapshot: "Chamber",
        stateSnapshot: "APPROVED",
        fingerprint: "fp",
        revisionSnapshot: new Date(),
        createdAt: new Date(),
      },
    ]);
    vi.mocked(baselineRepository.findActiveBaseline).mockResolvedValue(
      baseline({ id: "bl-other", identifier: "BL-000", status: "ACTIVE" }),
    );

    const response = await baselineActivate.POST(request("POST", {}), baselineParams);
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error.message).toMatch(/already active/i);
    expect(baselineRepository.activateBaseline).not.toHaveBeenCalled();
  });

  it("409s when superseding a draft", async () => {
    vi.mocked(baselineRepository.findBaselineInProject).mockResolvedValue(baseline());

    const response = await baselineSupersede.POST(request("POST"), baselineParams);

    expect(response.status).toBe(409);
  });
});

// --- Baseline comparison -----------------------------------------------------

describe("baseline compare route", () => {
  function draftMember(overrides: Record<string, unknown> = {}) {
    return {
      id: "mem1",
      baselineId: BASELINE_ID,
      nodeType: "DESIGN_ITEM",
      nodeId: "di1",
      identifierSnapshot: "DI-001",
      labelSnapshot: "Combustion chamber",
      stateSnapshot: "APPROVED",
      fingerprint: "fp-baselined",
      revisionSnapshot: new Date("2026-01-20T00:00:00.000Z"),
      createdAt: new Date("2026-01-20T00:00:00.000Z"),
      ...overrides,
    };
  }

  it("200s with a real classification and summary counts", async () => {
    vi.mocked(baselineRepository.findBaselineInProject).mockResolvedValue(baseline());
    vi.mocked(memberRepository.listMembers).mockResolvedValue([draftMember()] as never);
    vi.mocked(memberRepository.loadBaselineableObjects).mockResolvedValue(
      new Map([
        [
          "DESIGN_ITEM:di1",
          {
            nodeType: "DESIGN_ITEM",
            nodeId: "di1",
            identifier: "DI-001",
            label: "Combustion chamber (rev B)",
            state: "APPROVED",
            fingerprint: "fp-current",
            revision: new Date(),
            comparisonTerms: null,
          },
        ],
      ]) as never,
    );

    const response = await baselineCompare.GET(request("GET"), baselineParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.comparison.summary).toEqual({ total: 1, unchanged: 0, changed: 1, missing: 0, unknown: 0 });
    expect(body.comparison.members[0].status).toBe("CHANGED");
  });

  it("404s for a baseline belonging to another project", async () => {
    vi.mocked(baselineRepository.findBaselineInProject).mockResolvedValue(null);

    const response = await baselineCompare.GET(request("GET"), baselineParams);

    expect(response.status).toBe(404);
  });

  it("compares a DRAFT baseline too — comparison is not restricted to ACTIVE/SUPERSEDED", async () => {
    vi.mocked(baselineRepository.findBaselineInProject).mockResolvedValue(baseline({ status: "DRAFT" }));
    vi.mocked(memberRepository.listMembers).mockResolvedValue([draftMember()] as never);

    const response = await baselineCompare.GET(request("GET"), baselineParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.comparison.baselineStatus).toBe("DRAFT");
  });

  it("exposes only GET on this route", () => {
    const routeModule = baselineCompare as unknown as Record<string, unknown>;
    expect(routeModule.POST).toBeUndefined();
    expect(routeModule.PATCH).toBeUndefined();
    expect(routeModule.DELETE).toBeUndefined();
  });

  it("contains no score, percentage, confidence or probability anywhere in the response", async () => {
    vi.mocked(baselineRepository.findBaselineInProject).mockResolvedValue(baseline());
    vi.mocked(memberRepository.listMembers).mockResolvedValue([draftMember()] as never);

    const response = await baselineCompare.GET(request("GET"), baselineParams);
    const text = await response.text();

    expect(text).not.toMatch(/score|percent|confidence|probability/i);
  });
});

// --- Members ----------------------------------------------------------------

describe("baseline member routes", () => {
  it("400s on a node type outside the baselineable list", async () => {
    const response = await membersCollection.POST(
      request("POST", { nodeType: "CHANGE_REQUEST", nodeId: "chg1aaaaaaaaaaaaaaaaaa" }),
      baselineParams,
    );

    expect(response.status).toBe(400);
    expect(memberRepository.createMember).not.toHaveBeenCalled();
  });

  it("400s when the object is not in this project", async () => {
    vi.mocked(baselineRepository.findBaselineInProject).mockResolvedValue(baseline());
    vi.mocked(memberRepository.loadBaselineableObjects).mockResolvedValue(new Map());

    const response = await membersCollection.POST(
      request("POST", { nodeType: "DESIGN_ITEM", nodeId: "di1aaaaaaaaaaaaaaaaaaa" }),
      baselineParams,
    );

    expect(response.status).toBe(400);
  });

  it("409s when adding to an active baseline", async () => {
    vi.mocked(baselineRepository.findBaselineInProject).mockResolvedValue(
      baseline({ status: "ACTIVE" }),
    );

    const response = await membersCollection.POST(
      request("POST", { nodeType: "DESIGN_ITEM", nodeId: "di1aaaaaaaaaaaaaaaaaaa" }),
      baselineParams,
    );

    expect(response.status).toBe(409);
  });

  it("404s removing a member that is not on this baseline", async () => {
    vi.mocked(baselineRepository.findBaselineInProject).mockResolvedValue(baseline());
    vi.mocked(memberRepository.findMemberInBaseline).mockResolvedValue(null);

    const response = await memberDetail.DELETE(request("DELETE"), memberParams);

    expect(response.status).toBe(404);
  });

  it("offers only project-scoped member targets", async () => {
    vi.mocked(artifactsRepository.listBaselineMemberTargets).mockResolvedValue({
      REQUIREMENT: [],
      DESIGN_ITEM: [],
      ENGINEERING_DECISION: [],
      DECISION_EXPECTATION: [],
      VERIFICATION_ACTIVITY: [],
      SUPPLIED_ITEM: [],
      SUPPLIER_QUALIFICATION: [],
    });

    const response = await memberTargets.GET(request("GET"), projectParams);

    expect(response.status).toBe(200);
    expect(artifactsRepository.listBaselineMemberTargets).toHaveBeenCalledWith(PROJECT_ID);
  });
});

// --- Observations -----------------------------------------------------------

describe("observation routes", () => {
  it("creates an observation as RECORDED", async () => {
    vi.mocked(observationRepository.createObservation).mockResolvedValue(observation());

    const response = await observationsCollection.POST(
      request("POST", {
        identifier: "OBS-001",
        title: "Peak wall temperature",
        description: "Measured on flight 14.",
        observationType: "MEASUREMENT",
        observedAt: "2026-05-01T00:00:00.000Z",
        numericValue: "842.5",
        unit: "K",
      }),
      projectParams,
    );

    expect(response.status).toBe(201);
    expect((await response.json()).observation.status).toBe("RECORDED");
  });

  it("400s when a client tries to set the status", async () => {
    const response = await observationsCollection.POST(
      request("POST", {
        identifier: "OBS-001",
        title: "T",
        description: "d",
        observationType: "MEASUREMENT",
        observedAt: "2026-05-01T00:00:00.000Z",
        status: "REVIEWED",
      }),
      projectParams,
    );

    expect(response.status).toBe(400);
  });

  it("400s on a numeric value that is not an exact decimal", async () => {
    const response = await observationsCollection.POST(
      request("POST", {
        identifier: "OBS-001",
        title: "T",
        description: "d",
        observationType: "MEASUREMENT",
        observedAt: "2026-05-01T00:00:00.000Z",
        numericValue: "about 840",
      }),
      projectParams,
    );

    expect(response.status).toBe(400);
  });

  it("400s on a subject type the domain does not allow", async () => {
    const response = await observationsCollection.POST(
      request("POST", {
        identifier: "OBS-001",
        title: "T",
        description: "d",
        observationType: "MEASUREMENT",
        observedAt: "2026-05-01T00:00:00.000Z",
        subject: { type: "CHANGE_REQUEST", id: "chg1aaaaaaaaaaaaaaaaaa" },
      }),
      projectParams,
    );

    expect(response.status).toBe(400);
  });

  it("400s when the subject is in another project", async () => {
    vi.mocked(observationRepository.observationSubjectExistsInProject).mockResolvedValue(false);

    const response = await observationsCollection.POST(
      request("POST", {
        identifier: "OBS-001",
        title: "T",
        description: "d",
        observationType: "MEASUREMENT",
        observedAt: "2026-05-01T00:00:00.000Z",
        subject: { type: "DESIGN_ITEM", id: "di1aaaaaaaaaaaaaaaaaaa" },
      }),
      projectParams,
    );

    expect(response.status).toBe(400);
    expect(observationRepository.createObservation).not.toHaveBeenCalled();
  });

  it("reviews a recorded observation", async () => {
    vi.mocked(observationRepository.findObservationInProject).mockResolvedValue(observation());
    vi.mocked(observationRepository.transitionObservation).mockResolvedValue(
      observation({ status: "REVIEWED" }),
    );

    const response = await observationReview.POST(request("POST", {}), observationParams);

    expect(response.status).toBe(200);
    expect((await response.json()).observation.status).toBe("REVIEWED");
  });

  it("409s editing a reviewed observation", async () => {
    vi.mocked(observationRepository.findObservationInProject).mockResolvedValue(
      observation({ status: "REVIEWED" }),
    );

    const response = await observationDetail.PATCH(
      request("PATCH", { title: "Rewritten" }),
      observationParams,
    );

    expect(response.status).toBe(409);
  });

  it("409s rejecting an already-reviewed observation", async () => {
    vi.mocked(observationRepository.findObservationInProject).mockResolvedValue(
      observation({ status: "REVIEWED" }),
    );

    const response = await observationReject.POST(request("POST", {}), observationParams);

    expect(response.status).toBe(409);
  });

  it("400s on an unknown status filter", async () => {
    const response = await observationsCollection.GET(
      request("GET", undefined, `${BASE}/observations?status=ACCEPTED`),
      projectParams,
    );

    expect(response.status).toBe(400);
  });

  it("404s for an observation in another project", async () => {
    vi.mocked(observationRepository.findObservationInProject).mockResolvedValue(null);

    const response = await observationDetail.GET(request("GET"), observationParams);

    expect(response.status).toBe(404);
  });
});

// --- Drift ------------------------------------------------------------------

describe("drift routes", () => {
  beforeEach(() => {
    vi.mocked(baselineRepository.findBaselineInProject).mockResolvedValue(
      baseline({ status: "ACTIVE" }),
    );
    vi.mocked(memberRepository.listMembers).mockResolvedValue([]);
    vi.mocked(assessmentRepository.createAssessment).mockResolvedValue(ASSESSMENT);
    vi.mocked(assessmentRepository.createFindings).mockResolvedValue(0);
    vi.mocked(assessmentRepository.listFindings).mockResolvedValue([]);
  });

  it("evaluates and returns 201", async () => {
    const response = await driftEvaluate.POST(
      request("POST", { baselineId: BASELINE_ID }),
      projectParams,
    );

    expect(response.status).toBe(201);
    expect((await response.json()).report.assessment.driftVersion).toBe("1");
  });

  it("400s when the client tries to supply a verdict or findings", async () => {
    for (const extra of [
      { status: "NO_DRIFT" },
      { findings: [] },
      { driftVersion: "9" },
      { evaluatedById: "someone" },
    ]) {
      const response = await driftEvaluate.POST(
        request("POST", { baselineId: BASELINE_ID, ...extra }),
        projectParams,
      );
      expect(response.status).toBe(400);
    }
    expect(assessmentRepository.createAssessment).not.toHaveBeenCalled();
  });

  it("400s on a malformed baseline id", async () => {
    const response = await driftEvaluate.POST(request("POST", { baselineId: "" }), projectParams);

    expect(response.status).toBe(400);
  });

  it("404s evaluating against a baseline in another project", async () => {
    vi.mocked(baselineRepository.findBaselineInProject).mockResolvedValue(null);

    const response = await driftEvaluate.POST(
      request("POST", { baselineId: BASELINE_ID }),
      projectParams,
    );

    expect(response.status).toBe(404);
  });

  it("says NOT_EVALUATED rather than returning an empty assessment", async () => {
    vi.mocked(assessmentRepository.findLatestAssessment).mockResolvedValue(null);

    const response = await driftLatest.GET(request("GET"), projectParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.latest.status).toBe("NOT_EVALUATED");
    expect(body.latest.findings).toBeUndefined();
  });

  it("reports a stale assessment as stale rather than refreshing it", async () => {
    vi.mocked(assessmentRepository.findLatestAssessment).mockResolvedValue({
      ...ASSESSMENT,
      fingerprint: "a-fingerprint-that-no-longer-matches",
    });
    vi.mocked(assessmentRepository.readAssessmentBasis).mockResolvedValue({
      baselineId: BASELINE_ID,
      baselineIdentifier: "BL-001",
      baselineName: "Design baseline",
      baselineStatus: "ACTIVE",
      members: [],
      observations: [],
    });

    const response = await driftLatest.GET(request("GET"), projectParams);
    const body = await response.json();

    expect(body.latest.freshness).toBe("STALE");
    // Reading never evaluates.
    expect(assessmentRepository.createAssessment).not.toHaveBeenCalled();
  });

  it("returns history newest first", async () => {
    vi.mocked(assessmentRepository.listAssessments).mockResolvedValue([ASSESSMENT]);

    const response = await driftHistory.GET(
      request("GET", undefined, `${BASE}/drift?baselineId=${BASELINE_ID}`),
      projectParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.assessments).toHaveLength(1);
    expect(assessmentRepository.listAssessments).toHaveBeenCalledWith(PROJECT_ID, BASELINE_ID);
  });

  it("returns one assessment in full with its basis", async () => {
    vi.mocked(assessmentRepository.findAssessmentInProject).mockResolvedValue(ASSESSMENT);
    vi.mocked(assessmentRepository.readAssessmentBasis).mockResolvedValue({
      baselineId: BASELINE_ID,
      baselineIdentifier: "BL-001",
      baselineName: "Design baseline",
      baselineStatus: "ACTIVE",
      members: [],
      observations: [],
    });

    const response = await driftAssessment.GET(request("GET"), assessmentParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.report.basis.baselineIdentifier).toBe("BL-001");
  });

  it("404s for an assessment id belonging to another project", async () => {
    vi.mocked(assessmentRepository.findAssessmentInProject).mockResolvedValue(null);

    const response = await driftAssessment.GET(request("GET"), assessmentParams);

    expect(response.status).toBe(404);
  });

  it("surfaces an unexpected failure without leaking database detail", async () => {
    // An unrecognised error is not operational, so the handler must not pass
    // its message through — that is where a raw Postgres string would escape.
    vi.mocked(assessmentRepository.createAssessment).mockRejectedValue(
      new Error('duplicate key value violates unique constraint "drift_assessments_pkey"'),
    );

    const response = await driftEvaluate.POST(
      request("POST", { baselineId: BASELINE_ID }),
      projectParams,
    );

    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toMatch(/pkey|constraint|duplicate key/i);
  });

  it("passes an operational conflict through, because it is meant for the caller", async () => {
    vi.mocked(assessmentRepository.createAssessment).mockRejectedValue(
      new ConflictError("That baseline is already being evaluated."),
    );

    const response = await driftEvaluate.POST(
      request("POST", { baselineId: BASELINE_ID }),
      projectParams,
    );

    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toMatch(/already being evaluated/i);
  });
});

describe("what the drift API never exposes", () => {
  it("offers no route that would rewrite an assessment or a baseline snapshot", () => {
    expect(Object.keys(driftAssessment)).not.toContain("PATCH");
    expect(Object.keys(driftAssessment)).not.toContain("PUT");
    expect(Object.keys(driftAssessment)).not.toContain("DELETE");
    expect(Object.keys(driftHistory)).not.toContain("DELETE");
    expect(Object.keys(baselineDetail)).not.toContain("DELETE");
  });

  it("returns no score, confidence or probability in any payload", async () => {
    vi.mocked(assessmentRepository.findLatestAssessment).mockResolvedValue(ASSESSMENT);
    vi.mocked(assessmentRepository.readAssessmentBasis).mockResolvedValue({
      baselineId: BASELINE_ID,
      baselineIdentifier: "BL-001",
      baselineName: "Design baseline",
      baselineStatus: "ACTIVE",
      members: [],
      observations: [],
    });
    vi.mocked(assessmentRepository.listFindings).mockResolvedValue([]);

    const response = await driftLatest.GET(request("GET"), projectParams);

    expect(JSON.stringify(await response.json())).not.toMatch(
      /score|confidence|probability|anomaly|percent/i,
    );
  });
});
