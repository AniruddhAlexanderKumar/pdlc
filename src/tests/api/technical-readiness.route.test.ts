// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  TECHNICAL_READINESS_VERSION,
  type TechnicalReadinessAssessment,
  type TechnicalReadinessReport,
} from "@/domain";
import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from "@/server/errors";

/**
 * Gate route handlers driven through a faked service, so that path parsing,
 * authentication, query handling, body handling and error-to-status mapping are
 * exercised without re-testing the engine. The engine itself is covered in
 * `technical-readiness.service.test.ts` against a real graph.
 */

const CONTEXT = {
  organizationId: "org1aaaaaaaaaaaaaaaaaaaa",
  actorId: "user1aaaaaaaaaaaaaaaaaaa",
  sessionId: "sess1aaaaaaaaaaaaaaaaaa",
  user: { id: "user1aaaaaaaaaaaaaaaaaaa", name: "Ada", email: "ada@example.test", role: "ADMIN" },
  organization: { id: "org1aaaaaaaaaaaaaaaaaaaa", name: "Example Aerospace" },
};

vi.mock("@/server/auth/context", () => ({
  requireAuthenticatedContext: vi.fn(async () => CONTEXT),
}));

vi.mock("@/server/services/technical-readiness.service", () => ({
  technicalReadinessService: {
    evaluateTechnicalReadiness: vi.fn(),
    getLatestTechnicalReadiness: vi.fn(),
    listTechnicalReadinessHistory: vi.fn(),
    explainTechnicalReadiness: vi.fn(),
  },
}));

const authContext = await import("@/server/auth/context");
const { technicalReadinessService: service } = await import(
  "@/server/services/technical-readiness.service"
);

const gateRoute = await import("@/app/api/projects/[projectId]/technical-readiness/route");
const latestRoute = await import(
  "@/app/api/projects/[projectId]/technical-readiness/latest/route"
);
const detailRoute = await import(
  "@/app/api/projects/[projectId]/technical-readiness/[assessmentId]/route"
);

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";
const ASSESSMENT_ID = "tra1aaaaaaaaaaaaaaaaaa";

const BASE = `http://localhost/api/projects/${PROJECT_ID}/technical-readiness`;
const projectParams = { params: Promise.resolve({ projectId: PROJECT_ID }) };
const assessmentParams = {
  params: Promise.resolve({ projectId: PROJECT_ID, assessmentId: ASSESSMENT_ID }),
};

const ASSESSMENT: TechnicalReadinessAssessment = {
  id: ASSESSMENT_ID,
  projectId: PROJECT_ID,
  gate: "DESIGN_FREEZE",
  status: "NOT_READY",
  readinessVersion: TECHNICAL_READINESS_VERSION,
  fingerprint: "fingerprint-a",
  summary: { findings: 4, blocking: 1, warning: 1, informational: 1, unknown: 1 },
  evaluatedAt: new Date("2026-03-01T00:00:00.000Z"),
  evaluatedById: CONTEXT.actorId,
  createdAt: new Date("2026-03-01T00:00:00.000Z"),
};

const REPORT: TechnicalReadinessReport = {
  assessment: ASSESSMENT,
  freshness: "CURRENT",
  findings: [
    {
      id: "finding1",
      assessmentId: ASSESSMENT_ID,
      ruleId: "TR-REQ-004",
      category: "REQUIREMENT",
      status: "BLOCKING",
      severity: "BLOCKER",
      subjectType: "REQUIREMENT",
      subjectId: "req1",
      subjectIdentifier: "REQ-104",
      subjectLabel: "Maximum chamber pressure",
      message:
        "Requirement REQ-104 is IN_REVIEW. The design freeze gate rests on a settled requirement set.",
      basis: ["REQUIREMENT_LIFECYCLE_STATE"],
      sequence: 0,
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
    },
  ],
  scope: {
    gate: "DESIGN_FREEZE",
    label: "Current active engineering scope",
    counts: {
      REQUIREMENT: 1,
      DESIGN_ITEM: 1,
      ENGINEERING_DECISION: 0,
      DECISION_ASSUMPTION: 0,
      VERIFICATION_ACTIVITY: 0,
      STAKEHOLDER_NEED: 0,
      EVIDENCE: 0,
      CHANGE_REQUEST: 0,
      RISK: 0,
      ISSUE: 0,
    },
    objects: [
      {
        role: "REQUIREMENT",
        type: "REQUIREMENT",
        id: "req1",
        identifier: "REQ-104",
        state: "IN_REVIEW",
        revision: "2026-02-01T00:00:00.000Z",
      },
    ],
    relationships: [
      {
        edgeType: "REQUIREMENT_ALLOCATED_TO_DESIGN",
        relationshipId: "rel1",
        fromType: "REQUIREMENT",
        fromId: "req1",
        toType: "DESIGN_ITEM",
        toId: "di1",
      },
    ],
    consumed: {
      verificationReadiness: [],
      changeImpact: [],
      assumptionMonitoring: [],
    },
  },
};

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authContext.requireAuthenticatedContext).mockResolvedValue(CONTEXT as never);
});

describe("authentication", () => {
  it("401s every gate route without a session", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());

    const responses = await Promise.all([
      gateRoute.POST(jsonRequest(BASE, { gate: "DESIGN_REVIEW" }), projectParams),
      gateRoute.GET(new Request(`${BASE}?gate=DESIGN_REVIEW`), projectParams),
      latestRoute.GET(new Request(`${BASE}/latest?gate=DESIGN_REVIEW`), projectParams),
      detailRoute.GET(new Request(`${BASE}/${ASSESSMENT_ID}`), assessmentParams),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401]);
  });

  it("never reaches the service when the session is missing", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());

    await gateRoute.POST(jsonRequest(BASE, { gate: "DESIGN_REVIEW" }), projectParams);

    expect(service.evaluateTechnicalReadiness).not.toHaveBeenCalled();
  });
});

describe("POST /technical-readiness", () => {
  it("evaluates a gate and returns 201 with the report", async () => {
    vi.mocked(service.evaluateTechnicalReadiness).mockResolvedValue(REPORT);

    const response = await gateRoute.POST(
      jsonRequest(BASE, { gate: "DESIGN_FREEZE" }),
      projectParams,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.report.assessment.gate).toBe("DESIGN_FREEZE");
    expect(body.report.assessment.status).toBe("NOT_READY");
    expect(body.report.findings[0].ruleId).toBe("TR-REQ-004");
  });

  it("takes the project from the path, never from the body", async () => {
    vi.mocked(service.evaluateTechnicalReadiness).mockResolvedValue(REPORT);

    await gateRoute.POST(
      jsonRequest(BASE, {
        gate: "DESIGN_FREEZE",
        projectId: "proj9aaaaaaaaaaaaaaaaaa",
        organizationId: "org9aaaaaaaaaaaaaaaaaa",
      }),
      projectParams,
    );

    expect(service.evaluateTechnicalReadiness).toHaveBeenCalledWith(
      CONTEXT,
      PROJECT_ID,
      expect.objectContaining({ gate: "DESIGN_FREEZE" }),
    );
  });

  it("400s when the client tries to supply a verdict or a rule set", async () => {
    // The service refuses it; the route must surface that as a client error
    // rather than silently accepting a fabricated gate result.
    vi.mocked(service.evaluateTechnicalReadiness).mockRejectedValue(
      new ValidationError("Invalid technical readiness request"),
    );

    for (const attempt of [
      { gate: "DESIGN_FREEZE", status: "READY" },
      { gate: "DESIGN_FREEZE", rules: ["TR-REQ-002"] },
      { gate: "DESIGN_FREEZE", evaluatedById: "user9" },
    ]) {
      const response = await gateRoute.POST(jsonRequest(BASE, attempt), projectParams);
      expect(response.status).toBe(400);
    }
  });

  it("400s on a gate the registry does not define", async () => {
    vi.mocked(service.evaluateTechnicalReadiness).mockRejectedValue(
      new ValidationError("Invalid technical readiness request"),
    );

    const response = await gateRoute.POST(
      jsonRequest(BASE, { gate: "CERTIFICATION_READY" }),
      projectParams,
    );

    expect(response.status).toBe(400);
  });

  it("400s on a malformed body", async () => {
    const response = await gateRoute.POST(
      new Request(BASE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
      projectParams,
    );

    expect(response.status).toBe(400);
    expect(service.evaluateTechnicalReadiness).not.toHaveBeenCalled();
  });

  it("404s for a project outside the caller's organization", async () => {
    vi.mocked(service.evaluateTechnicalReadiness).mockRejectedValue(
      new NotFoundError("Project was not found."),
    );

    const response = await gateRoute.POST(
      jsonRequest(BASE, { gate: "DESIGN_REVIEW" }),
      projectParams,
    );

    // Not 403 — the API does not confirm what it will not show.
    expect(response.status).toBe(404);
  });

  it("surfaces an engine failure without leaking database detail", async () => {
    const { TechnicalReadinessFailure } = await vi.importActual<
      typeof import("@/server/services/technical-readiness.service")
    >("@/server/services/technical-readiness.service");

    vi.mocked(service.evaluateTechnicalReadiness).mockRejectedValue(
      new TechnicalReadinessFailure("The gate evaluation could not be completed."),
    );

    const response = await gateRoute.POST(
      jsonRequest(BASE, { gate: "DESIGN_REVIEW" }),
      projectParams,
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.message).not.toMatch(/relation|column|prisma/i);
  });
});

describe("GET /technical-readiness", () => {
  it("returns the history for one gate", async () => {
    const older: TechnicalReadinessAssessment = {
      ...ASSESSMENT,
      id: "tra0aaaaaaaaaaaaaaaaaa",
      status: "READY",
      evaluatedAt: new Date("2026-02-01T00:00:00.000Z"),
    };
    vi.mocked(service.listTechnicalReadinessHistory).mockResolvedValue([ASSESSMENT, older]);

    const response = await gateRoute.GET(
      new Request(`${BASE}?gate=DESIGN_FREEZE`),
      projectParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.assessments).toHaveLength(2);
    // Newest first; nothing was overwritten.
    expect(body.assessments[0].id).toBe(ASSESSMENT_ID);
    expect(service.listTechnicalReadinessHistory).toHaveBeenCalledWith(
      CONTEXT,
      PROJECT_ID,
      "DESIGN_FREEZE",
    );
  });

  it("passes no gate when the query omits one", async () => {
    vi.mocked(service.listTechnicalReadinessHistory).mockResolvedValue([]);

    await gateRoute.GET(new Request(BASE), projectParams);

    expect(service.listTechnicalReadinessHistory).toHaveBeenCalledWith(
      CONTEXT,
      PROJECT_ID,
      undefined,
    );
  });

  it("400s on a gate the registry does not define", async () => {
    vi.mocked(service.listTechnicalReadinessHistory).mockRejectedValue(
      new ValidationError("Invalid gate"),
    );

    const response = await gateRoute.GET(new Request(`${BASE}?gate=NOPE`), projectParams);
    expect(response.status).toBe(400);
  });
});

describe("GET /technical-readiness/latest", () => {
  it("returns the latest report for the requested gate with its freshness", async () => {
    vi.mocked(service.getLatestTechnicalReadiness).mockResolvedValue(REPORT);

    const response = await latestRoute.GET(
      new Request(`${BASE}/latest?gate=DESIGN_FREEZE`),
      projectParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.latest.freshness).toBe("CURRENT");
    expect(body.latest.assessment.summary.blocking).toBe(1);
    expect(service.getLatestTechnicalReadiness).toHaveBeenCalledWith(
      CONTEXT,
      PROJECT_ID,
      "DESIGN_FREEZE",
    );
  });

  it("reports a stale assessment as stale rather than refreshing it", async () => {
    vi.mocked(service.getLatestTechnicalReadiness).mockResolvedValue({
      ...REPORT,
      freshness: "STALE",
    });

    const response = await latestRoute.GET(
      new Request(`${BASE}/latest?gate=DESIGN_FREEZE`),
      projectParams,
    );
    const body = await response.json();

    expect(body.latest.freshness).toBe("STALE");
    // Reading must never trigger an evaluation.
    expect(service.evaluateTechnicalReadiness).not.toHaveBeenCalled();
  });

  it("says NOT_EVALUATED rather than returning an empty assessment", async () => {
    vi.mocked(service.getLatestTechnicalReadiness).mockResolvedValue({
      status: "NOT_EVALUATED",
      projectId: PROJECT_ID,
      gate: "RELEASE_READY",
      readinessVersion: TECHNICAL_READINESS_VERSION,
    });

    const response = await latestRoute.GET(
      new Request(`${BASE}/latest?gate=RELEASE_READY`),
      projectParams,
    );
    const body = await response.json();

    expect(body.latest.status).toBe("NOT_EVALUATED");
    expect(body.latest.assessment).toBeUndefined();
    // No zero-valued summary that could read as "assessed, nothing wrong".
    expect(body.latest.summary).toBeUndefined();
  });

  it("400s when the gate is missing or unknown", async () => {
    vi.mocked(service.getLatestTechnicalReadiness).mockRejectedValue(
      new ValidationError("Invalid gate"),
    );

    const response = await latestRoute.GET(new Request(`${BASE}/latest`), projectParams);
    expect(response.status).toBe(400);
  });
});

describe("GET /technical-readiness/[assessmentId]", () => {
  it("returns one assessment in full, with its scope", async () => {
    vi.mocked(service.explainTechnicalReadiness).mockResolvedValue(REPORT);

    const response = await detailRoute.GET(
      new Request(`${BASE}/${ASSESSMENT_ID}`),
      assessmentParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.report.findings[0].basis).toEqual(["REQUIREMENT_LIFECYCLE_STATE"]);
    expect(body.report.scope.label).toBe("Current active engineering scope");
    expect(body.report.scope.relationships[0].relationshipId).toBe("rel1");
  });

  it("404s for an assessment id belonging to another project", async () => {
    vi.mocked(service.explainTechnicalReadiness).mockRejectedValue(
      new NotFoundError("Technical readiness assessment was not found."),
    );

    const response = await detailRoute.GET(
      new Request(`${BASE}/${ASSESSMENT_ID}`),
      assessmentParams,
    );

    expect(response.status).toBe(404);
  });

  it("400s on a malformed assessment id", async () => {
    vi.mocked(service.explainTechnicalReadiness).mockRejectedValue(
      new ValidationError("Invalid assessment id"),
    );

    const response = await detailRoute.GET(new Request(`${BASE}/..`), {
      params: Promise.resolve({ projectId: PROJECT_ID, assessmentId: ".." }),
    });

    expect(response.status).toBe(400);
  });

  it("passes the project from the path so an id cannot be read cross-project", async () => {
    vi.mocked(service.explainTechnicalReadiness).mockResolvedValue(REPORT);

    await detailRoute.GET(new Request(`${BASE}/${ASSESSMENT_ID}`), assessmentParams);

    expect(service.explainTechnicalReadiness).toHaveBeenCalledWith(
      CONTEXT,
      PROJECT_ID,
      ASSESSMENT_ID,
    );
  });
});

describe("what the API never exposes", () => {
  it("offers no route that would rewrite an assessment", () => {
    // Immutability is structural: there is no PATCH, PUT or DELETE to call.
    for (const route of [gateRoute, latestRoute, detailRoute]) {
      const handlers = Object.keys(route);
      expect(handlers).not.toContain("PATCH");
      expect(handlers).not.toContain("PUT");
      expect(handlers).not.toContain("DELETE");
    }
  });

  it("returns no score, percentage or confidence in any payload", async () => {
    vi.mocked(service.evaluateTechnicalReadiness).mockResolvedValue(REPORT);

    const response = await gateRoute.POST(
      jsonRequest(BASE, { gate: "DESIGN_FREEZE" }),
      projectParams,
    );
    const text = JSON.stringify(await response.json());

    expect(text).not.toMatch(/"score"|"percent|"confidence"|"probability"/i);
  });
});

describe("authorization", () => {
  it("403s when the service refuses an insufficient project role", async () => {
    vi.mocked(service.evaluateTechnicalReadiness).mockRejectedValue(
      new ForbiddenError("Your role on this project does not allow editing engineering content."),
    );

    const response = await gateRoute.POST(
      jsonRequest(BASE, { gate: "DESIGN_FREEZE" }),
      projectParams,
    );

    expect(response.status).toBe(403);
  });
});
