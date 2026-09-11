// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  VERIFICATION_READINESS_VERSION,
  type VerificationReadinessAssessment,
  type VerificationReadinessReport,
} from "@/domain";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/server/errors";

/**
 * Readiness route handlers driven through a faked service, so that path
 * parsing, authentication, body handling and error-to-status mapping are
 * exercised without re-testing the engine. The engine itself is covered in
 * `verification-readiness.service.test.ts` against a real graph.
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

vi.mock("@/server/services/verification-readiness.service", () => ({
  verificationReadinessService: {
    evaluateVerificationReadiness: vi.fn(),
    getLatestVerificationReadiness: vi.fn(),
    listVerificationReadinessHistory: vi.fn(),
    explainVerificationReadiness: vi.fn(),
  },
}));

const authContext = await import("@/server/auth/context");
const { verificationReadinessService: service } = await import(
  "@/server/services/verification-readiness.service"
);

const readinessRoute = await import(
  "@/app/api/projects/[projectId]/verification-activities/[activityId]/readiness/route"
);
const latestRoute = await import(
  "@/app/api/projects/[projectId]/verification-activities/[activityId]/readiness/latest/route"
);
const detailRoute = await import(
  "@/app/api/projects/[projectId]/verification-readiness/[assessmentId]/route"
);

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";
const ACTIVITY_ID = "va1aaaaaaaaaaaaaaaaaaaa";
const ASSESSMENT_ID = "vra1aaaaaaaaaaaaaaaaaa";

const BASE = `http://localhost/api/projects/${PROJECT_ID}`;
const activityParams = {
  params: Promise.resolve({ projectId: PROJECT_ID, activityId: ACTIVITY_ID }),
};
const assessmentParams = {
  params: Promise.resolve({ projectId: PROJECT_ID, assessmentId: ASSESSMENT_ID }),
};

const ASSESSMENT: VerificationReadinessAssessment = {
  id: ASSESSMENT_ID,
  projectId: PROJECT_ID,
  verificationActivityId: ACTIVITY_ID,
  status: "NOT_READY",
  scope: "EXECUTION",
  readinessVersion: VERIFICATION_READINESS_VERSION,
  fingerprint: "fingerprint-a",
  summary: { findings: 3, blocking: 1, warning: 1, informational: 1, unknown: 0 },
  evaluatedAt: new Date("2026-03-01T00:00:00.000Z"),
  evaluatedById: CONTEXT.actorId,
  createdAt: new Date("2026-03-01T00:00:00.000Z"),
};

const REPORT: VerificationReadinessReport = {
  assessment: ASSESSMENT,
  freshness: "CURRENT",
  findings: [
    {
      id: "finding1",
      assessmentId: ASSESSMENT_ID,
      ruleId: "VR-REQ-001",
      category: "REQUIREMENT_STATE",
      status: "BLOCKING",
      severity: "BLOCKER",
      subjectType: "REQUIREMENT",
      subjectId: "req1",
      subjectIdentifier: "REQ-104",
      subjectLabel: "Maximum chamber pressure",
      message:
        "Requirement REQ-104 is IN_REVIEW. A verification activity cannot be considered ready until the requirement reaches APPROVED or BASELINED.",
      basis: ["REQUIREMENT_LIFECYCLE_STATE", "REQUIREMENT_VERIFICATION_LINK"],
      sequence: 0,
      createdAt: new Date("2026-03-01T00:00:00.000Z"),
    },
  ],
  basis: {
    verificationActivityId: ACTIVITY_ID,
    scope: "EXECUTION",
    objects: [
      {
        role: "VERIFIED_REQUIREMENT",
        type: "REQUIREMENT",
        id: "req1",
        identifier: "REQ-104",
        label: "Maximum chamber pressure",
        revision: "2026-02-01T00:00:00.000Z",
        state: "IN_REVIEW",
      },
    ],
    relationships: [
      {
        edgeType: "REQUIREMENT_VERIFIED_BY",
        relationshipId: "rel1",
        fromType: "REQUIREMENT",
        fromId: "req1",
        toType: "VERIFICATION_ACTIVITY",
        toId: ACTIVITY_ID,
        linkType: null,
      },
    ],
    monitoring: [],
    changes: [],
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
  it("401s every readiness route without a session", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());

    const responses = await Promise.all([
      readinessRoute.POST(
        jsonRequest(`${BASE}/verification-activities/${ACTIVITY_ID}/readiness`, {}),
        activityParams,
      ),
      readinessRoute.GET(
        new Request(`${BASE}/verification-activities/${ACTIVITY_ID}/readiness`),
        activityParams,
      ),
      latestRoute.GET(
        new Request(`${BASE}/verification-activities/${ACTIVITY_ID}/readiness/latest`),
        activityParams,
      ),
      detailRoute.GET(
        new Request(`${BASE}/verification-readiness/${ASSESSMENT_ID}`),
        assessmentParams,
      ),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401]);
  });

  it("never reaches the service when the session is missing", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());

    await readinessRoute.POST(
      jsonRequest(`${BASE}/verification-activities/${ACTIVITY_ID}/readiness`, {}),
      activityParams,
    );

    expect(service.evaluateVerificationReadiness).not.toHaveBeenCalled();
  });
});

describe("POST /readiness", () => {
  it("evaluates and returns 201 with the report", async () => {
    vi.mocked(service.evaluateVerificationReadiness).mockResolvedValue(REPORT);

    const response = await readinessRoute.POST(
      jsonRequest(`${BASE}/verification-activities/${ACTIVITY_ID}/readiness`, {}),
      activityParams,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.report.assessment.status).toBe("NOT_READY");
    expect(body.report.assessment.readinessVersion).toBe(VERIFICATION_READINESS_VERSION);
    expect(body.report.findings).toHaveLength(1);
    expect(body.report.findings[0].ruleId).toBe("VR-REQ-001");
  });

  it("takes the project and activity from the path, never from the body", async () => {
    vi.mocked(service.evaluateVerificationReadiness).mockResolvedValue(REPORT);

    await readinessRoute.POST(
      jsonRequest(`${BASE}/verification-activities/${ACTIVITY_ID}/readiness`, {
        projectId: "proj9aaaaaaaaaaaaaaaaaa",
        activityId: "va9aaaaaaaaaaaaaaaaaaa",
        organizationId: "org9aaaaaaaaaaaaaaaaaa",
      }),
      activityParams,
    );

    expect(service.evaluateVerificationReadiness).toHaveBeenCalledWith(
      CONTEXT,
      PROJECT_ID,
      ACTIVITY_ID,
      expect.anything(),
    );
  });

  it("tolerates an empty body", async () => {
    vi.mocked(service.evaluateVerificationReadiness).mockResolvedValue(REPORT);

    const response = await readinessRoute.POST(
      new Request(`${BASE}/verification-activities/${ACTIVITY_ID}/readiness`, {
        method: "POST",
      }),
      activityParams,
    );

    expect(response.status).toBe(201);
  });

  it("400s when the client tries to supply a readiness verdict", async () => {
    // The service refuses it; the route must surface that as a client error
    // rather than silently accepting a fabricated result.
    vi.mocked(service.evaluateVerificationReadiness).mockRejectedValue(
      new ValidationError("Invalid readiness request"),
    );

    const response = await readinessRoute.POST(
      jsonRequest(`${BASE}/verification-activities/${ACTIVITY_ID}/readiness`, {
        status: "READY",
      }),
      activityParams,
    );

    expect(response.status).toBe(400);
  });

  it("404s for an activity outside the caller's project", async () => {
    vi.mocked(service.evaluateVerificationReadiness).mockRejectedValue(
      new NotFoundError("Verification activity was not found."),
    );

    const response = await readinessRoute.POST(
      jsonRequest(`${BASE}/verification-activities/${ACTIVITY_ID}/readiness`, {}),
      activityParams,
    );

    // Not 403 — the API does not confirm what it will not show.
    expect(response.status).toBe(404);
  });

  it("400s on a malformed activity id", async () => {
    vi.mocked(service.evaluateVerificationReadiness).mockRejectedValue(
      new ValidationError("Invalid verification activity id"),
    );

    const response = await readinessRoute.POST(
      jsonRequest(`${BASE}/verification-activities/../readiness`, {}),
      { params: Promise.resolve({ projectId: PROJECT_ID, activityId: ".." }) },
    );

    expect(response.status).toBe(400);
  });

  it("surfaces an engine failure without leaking database detail", async () => {
    const { VerificationReadinessFailure } = await vi.importActual<
      typeof import("@/server/services/verification-readiness.service")
    >("@/server/services/verification-readiness.service");

    vi.mocked(service.evaluateVerificationReadiness).mockRejectedValue(
      new VerificationReadinessFailure("The readiness evaluation could not be completed."),
    );

    const response = await readinessRoute.POST(
      jsonRequest(`${BASE}/verification-activities/${ACTIVITY_ID}/readiness`, {}),
      activityParams,
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.message).not.toMatch(/relation|column|prisma/i);
  });
});

describe("GET /readiness", () => {
  it("returns the assessment history", async () => {
    const older: VerificationReadinessAssessment = {
      ...ASSESSMENT,
      id: "vra0aaaaaaaaaaaaaaaaaa",
      status: "READY",
      evaluatedAt: new Date("2026-02-01T00:00:00.000Z"),
    };
    vi.mocked(service.listVerificationReadinessHistory).mockResolvedValue([ASSESSMENT, older]);

    const response = await readinessRoute.GET(
      new Request(`${BASE}/verification-activities/${ACTIVITY_ID}/readiness`),
      activityParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.assessments).toHaveLength(2);
    // Newest first; nothing was overwritten.
    expect(body.assessments[0].id).toBe(ASSESSMENT_ID);
    expect(body.assessments[1].status).toBe("READY");
  });

  it("returns an empty history rather than inventing one", async () => {
    vi.mocked(service.listVerificationReadinessHistory).mockResolvedValue([]);

    const response = await readinessRoute.GET(
      new Request(`${BASE}/verification-activities/${ACTIVITY_ID}/readiness`),
      activityParams,
    );
    const body = await response.json();

    expect(body.assessments).toEqual([]);
  });
});

describe("GET /readiness/latest", () => {
  it("returns the latest report with its freshness", async () => {
    vi.mocked(service.getLatestVerificationReadiness).mockResolvedValue(REPORT);

    const response = await latestRoute.GET(
      new Request(`${BASE}/verification-activities/${ACTIVITY_ID}/readiness/latest`),
      activityParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.latest.freshness).toBe("CURRENT");
    expect(body.latest.assessment.summary.blocking).toBe(1);
  });

  it("reports a stale assessment as stale rather than refreshing it", async () => {
    vi.mocked(service.getLatestVerificationReadiness).mockResolvedValue({
      ...REPORT,
      freshness: "STALE",
    });

    const response = await latestRoute.GET(
      new Request(`${BASE}/verification-activities/${ACTIVITY_ID}/readiness/latest`),
      activityParams,
    );
    const body = await response.json();

    expect(body.latest.freshness).toBe("STALE");
    // Reading must never trigger an evaluation.
    expect(service.evaluateVerificationReadiness).not.toHaveBeenCalled();
  });

  it("says NOT_EVALUATED rather than returning an empty assessment", async () => {
    vi.mocked(service.getLatestVerificationReadiness).mockResolvedValue({
      status: "NOT_EVALUATED",
      verificationActivityId: ACTIVITY_ID,
      readinessVersion: VERIFICATION_READINESS_VERSION,
    });

    const response = await latestRoute.GET(
      new Request(`${BASE}/verification-activities/${ACTIVITY_ID}/readiness/latest`),
      activityParams,
    );
    const body = await response.json();

    expect(body.latest.status).toBe("NOT_EVALUATED");
    expect(body.latest.assessment).toBeUndefined();
    // No zero-valued summary that could be read as "assessed, nothing wrong".
    expect(body.latest.summary).toBeUndefined();
  });

  it("404s for an activity in another project", async () => {
    vi.mocked(service.getLatestVerificationReadiness).mockRejectedValue(
      new NotFoundError("Verification activity was not found."),
    );

    const response = await latestRoute.GET(
      new Request(`${BASE}/verification-activities/${ACTIVITY_ID}/readiness/latest`),
      activityParams,
    );

    expect(response.status).toBe(404);
  });
});

describe("GET /verification-readiness/[assessmentId]", () => {
  it("returns one assessment in full, with its basis", async () => {
    vi.mocked(service.explainVerificationReadiness).mockResolvedValue(REPORT);

    const response = await detailRoute.GET(
      new Request(`${BASE}/verification-readiness/${ASSESSMENT_ID}`),
      assessmentParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.report.findings[0].basis).toEqual([
      "REQUIREMENT_LIFECYCLE_STATE",
      "REQUIREMENT_VERIFICATION_LINK",
    ]);
    expect(body.report.basis.objects).toHaveLength(1);
    expect(body.report.basis.relationships[0].relationshipId).toBe("rel1");
  });

  it("404s for an assessment id belonging to another project", async () => {
    vi.mocked(service.explainVerificationReadiness).mockRejectedValue(
      new NotFoundError("Verification readiness assessment was not found."),
    );

    const response = await detailRoute.GET(
      new Request(`${BASE}/verification-readiness/${ASSESSMENT_ID}`),
      assessmentParams,
    );

    expect(response.status).toBe(404);
  });

  it("400s on a malformed assessment id", async () => {
    vi.mocked(service.explainVerificationReadiness).mockRejectedValue(
      new ValidationError("Invalid assessment id"),
    );

    const response = await detailRoute.GET(new Request(`${BASE}/verification-readiness/..`), {
      params: Promise.resolve({ projectId: PROJECT_ID, assessmentId: ".." }),
    });

    expect(response.status).toBe(400);
  });

  it("passes the project from the path so an id cannot be read cross-project", async () => {
    vi.mocked(service.explainVerificationReadiness).mockResolvedValue(REPORT);

    await detailRoute.GET(
      new Request(`${BASE}/verification-readiness/${ASSESSMENT_ID}`),
      assessmentParams,
    );

    expect(service.explainVerificationReadiness).toHaveBeenCalledWith(
      CONTEXT,
      PROJECT_ID,
      ASSESSMENT_ID,
    );
  });
});

describe("what the API never exposes", () => {
  it("offers no route that would rewrite an assessment", () => {
    // Immutability is structural: there is no PATCH, PUT or DELETE to call.
    for (const route of [readinessRoute, latestRoute, detailRoute]) {
      const handlers = Object.keys(route);
      expect(handlers).not.toContain("PATCH");
      expect(handlers).not.toContain("PUT");
      expect(handlers).not.toContain("DELETE");
    }
  });

  it("returns no score, percentage or confidence in any payload", async () => {
    vi.mocked(service.evaluateVerificationReadiness).mockResolvedValue(REPORT);

    const response = await readinessRoute.POST(
      jsonRequest(`${BASE}/verification-activities/${ACTIVITY_ID}/readiness`, {}),
      activityParams,
    );
    const text = JSON.stringify(await response.json());

    expect(text).not.toMatch(/"score"|"percent|"confidence"|"probability"/i);
  });
});
