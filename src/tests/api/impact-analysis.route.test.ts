// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { IMPACT_ENGINE_VERSION, type ImpactAnalysis, type ImpactAnalysisReport } from "@/domain";
import { NotFoundError, UnauthorizedError, ValidationError } from "@/server/errors";

/**
 * Impact-analysis route handlers driven through a faked service, so that path
 * parsing, authentication, body handling and error-to-status mapping are
 * exercised without re-testing the engine. The engine itself is covered in
 * `change-impact-analysis.service.test.ts` against a real graph.
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

vi.mock("@/server/services/change-impact-analysis.service", () => ({
  changeImpactAnalysisService: {
    runImpactAnalysis: vi.fn(),
    getLatestImpactAnalysis: vi.fn(),
    listImpactAnalyses: vi.fn(),
    getImpactAnalysis: vi.fn(),
  },
}));

const authContext = await import("@/server/auth/context");
const { changeImpactAnalysisService: service } = await import(
  "@/server/services/change-impact-analysis.service"
);

const runRoute = await import(
  "@/app/api/projects/[projectId]/changes/[changeId]/impact-analysis/route"
);
const latestRoute = await import(
  "@/app/api/projects/[projectId]/changes/[changeId]/impact-analysis/latest/route"
);
const detailRoute = await import(
  "@/app/api/projects/[projectId]/impact-analyses/[analysisId]/route"
);

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";
const CHANGE_ID = "chg1aaaaaaaaaaaaaaaaaaa";
const ANALYSIS_ID = "ana1aaaaaaaaaaaaaaaaaaa";

const BASE = `http://localhost/api/projects/${PROJECT_ID}`;
const changeParams = { params: Promise.resolve({ projectId: PROJECT_ID, changeId: CHANGE_ID }) };
const analysisParams = {
  params: Promise.resolve({ projectId: PROJECT_ID, analysisId: ANALYSIS_ID }),
};

const ANALYSIS: ImpactAnalysis = {
  id: ANALYSIS_ID,
  projectId: PROJECT_ID,
  changeRequestId: CHANGE_ID,
  status: "COMPLETED",
  engineVersion: IMPACT_ENGINE_VERSION,
  sourceFingerprint: "fingerprint-a",
  failureReason: null,
  startedAt: new Date("2026-03-01T00:00:00.000Z"),
  completedAt: new Date("2026-03-01T00:00:01.000Z"),
  requestedById: CONTEXT.actorId,
  summary: {
    declaredImpacts: 1,
    roots: 1,
    findings: 2,
    direct: 1,
    downstream: 0,
    crossDomain: 1,
    upstreamContext: 0,
    unknown: 0,
    notEvaluated: 0,
  },
  limits: { maxDepth: 3, maxNodes: 200, maxEdges: 1000, truncated: false, truncatedBy: null },
};

const REPORT: ImpactAnalysisReport = {
  analysis: ANALYSIS,
  freshness: "CURRENT",
  roots: [
    {
      id: "root1",
      analysisId: ANALYSIS_ID,
      node: { type: "REQUIREMENT", id: "req1" },
      identifier: "REQ-001",
      label: "Maximum chamber pressure",
      resolved: true,
      declaredImpactId: "imp1",
    },
  ],
  findings: [
    {
      id: "finding1",
      analysisId: ANALYSIS_ID,
      rootId: "root1",
      node: { type: "REQUIREMENT", id: "req1" },
      identifier: "REQ-001",
      label: "Maximum chamber pressure",
      classification: "DIRECT",
      status: "POTENTIALLY_AFFECTED",
      depth: 0,
      basis: ["DECLARED_IMPACT"],
      path: [],
      alternatePathCount: 0,
      createdAt: new Date("2026-03-01T00:00:01.000Z"),
    },
  ],
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
  it("401s every impact route without a session", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());

    const responses = await Promise.all([
      runRoute.POST(jsonRequest(`${BASE}/changes/${CHANGE_ID}/impact-analysis`, {}), changeParams),
      runRoute.GET(new Request(`${BASE}/changes/${CHANGE_ID}/impact-analysis`), changeParams),
      latestRoute.GET(
        new Request(`${BASE}/changes/${CHANGE_ID}/impact-analysis/latest`),
        changeParams,
      ),
      detailRoute.GET(new Request(`${BASE}/impact-analyses/${ANALYSIS_ID}`), analysisParams),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401]);
  });
});

describe("POST /impact-analysis", () => {
  it("runs an analysis and returns 201 with the report", async () => {
    vi.mocked(service.runImpactAnalysis).mockResolvedValue(REPORT);

    const response = await runRoute.POST(
      jsonRequest(`${BASE}/changes/${CHANGE_ID}/impact-analysis`, {}),
      changeParams,
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.report.analysis.id).toBe(ANALYSIS_ID);
    expect(body.report.analysis.engineVersion).toBe(IMPACT_ENGINE_VERSION);
    expect(body.report.findings).toHaveLength(1);
  });

  it("passes the project and change from the path, never from the body", async () => {
    vi.mocked(service.runImpactAnalysis).mockResolvedValue(REPORT);

    await runRoute.POST(
      jsonRequest(`${BASE}/changes/${CHANGE_ID}/impact-analysis`, {
        projectId: "proj9aaaaaaaaaaaaaaaaaa",
        changeId: "chg9aaaaaaaaaaaaaaaaaa",
      }),
      changeParams,
    );

    expect(service.runImpactAnalysis).toHaveBeenCalledWith(
      CONTEXT,
      PROJECT_ID,
      CHANGE_ID,
      expect.anything(),
    );
  });

  it("tolerates an empty body", async () => {
    vi.mocked(service.runImpactAnalysis).mockResolvedValue(REPORT);

    const response = await runRoute.POST(
      new Request(`${BASE}/changes/${CHANGE_ID}/impact-analysis`, { method: "POST" }),
      changeParams,
    );

    expect(response.status).toBe(201);
  });

  it("400s on malformed analysis parameters", async () => {
    vi.mocked(service.runImpactAnalysis).mockRejectedValue(
      new ValidationError("Invalid analysis request"),
    );

    const response = await runRoute.POST(
      jsonRequest(`${BASE}/changes/${CHANGE_ID}/impact-analysis`, { maxDepth: 99 }),
      changeParams,
    );

    expect(response.status).toBe(400);
  });

  it("404s for a change outside the caller's project", async () => {
    vi.mocked(service.runImpactAnalysis).mockRejectedValue(
      new NotFoundError("Change request was not found."),
    );

    const response = await runRoute.POST(
      jsonRequest(`${BASE}/changes/${CHANGE_ID}/impact-analysis`, {}),
      changeParams,
    );

    expect(response.status).toBe(404);
  });

  it("surfaces an engine failure as a typed error, not a partial success", async () => {
    const { ImpactAnalysisFailure } = await vi.importActual<
      typeof import("@/server/services/change-impact-analysis.service")
    >("@/server/services/change-impact-analysis.service");

    vi.mocked(service.runImpactAnalysis).mockRejectedValue(
      new ImpactAnalysisFailure("The analysis could not be completed."),
    );

    const response = await runRoute.POST(
      jsonRequest(`${BASE}/changes/${CHANGE_ID}/impact-analysis`, {}),
      changeParams,
    );
    const body = await response.json();

    expect(response.status).toBe(422);
    expect(body.error.message).not.toMatch(/relation|column|prisma/i);
  });
});

describe("GET /impact-analysis", () => {
  it("returns the run history", async () => {
    const older: ImpactAnalysis = {
      ...ANALYSIS,
      id: "ana0aaaaaaaaaaaaaaaaaaa",
      startedAt: new Date("2026-02-01T00:00:00.000Z"),
    };
    vi.mocked(service.listImpactAnalyses).mockResolvedValue([ANALYSIS, older]);

    const response = await runRoute.GET(
      new Request(`${BASE}/changes/${CHANGE_ID}/impact-analysis`),
      changeParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.analyses).toHaveLength(2);
    // Newest first; nothing was overwritten.
    expect(body.analyses[0].id).toBe(ANALYSIS_ID);
  });
});

describe("GET /impact-analysis/latest", () => {
  it("returns the latest report with its freshness", async () => {
    vi.mocked(service.getLatestImpactAnalysis).mockResolvedValue(REPORT);

    const response = await latestRoute.GET(
      new Request(`${BASE}/changes/${CHANGE_ID}/impact-analysis/latest`),
      changeParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.latest.freshness).toBe("CURRENT");
    expect(body.latest.analysis.summary.direct).toBe(1);
  });

  it("reports a stale result as stale rather than refreshing it", async () => {
    vi.mocked(service.getLatestImpactAnalysis).mockResolvedValue({
      ...REPORT,
      freshness: "STALE",
    });

    const response = await latestRoute.GET(
      new Request(`${BASE}/changes/${CHANGE_ID}/impact-analysis/latest`),
      changeParams,
    );
    const body = await response.json();

    expect(body.latest.freshness).toBe("STALE");
    // Reading must never trigger a run.
    expect(service.runImpactAnalysis).not.toHaveBeenCalled();
  });

  it("says NOT_RUN rather than returning an empty analysis", async () => {
    vi.mocked(service.getLatestImpactAnalysis).mockResolvedValue({
      status: "NOT_RUN",
      changeRequestId: CHANGE_ID,
      engineVersion: IMPACT_ENGINE_VERSION,
    });

    const response = await latestRoute.GET(
      new Request(`${BASE}/changes/${CHANGE_ID}/impact-analysis/latest`),
      changeParams,
    );
    const body = await response.json();

    expect(body.latest.status).toBe("NOT_RUN");
    expect(body.latest.analysis).toBeUndefined();
  });
});

describe("GET /impact-analyses/[analysisId]", () => {
  it("returns one analysis in full", async () => {
    vi.mocked(service.getImpactAnalysis).mockResolvedValue(REPORT);

    const response = await detailRoute.GET(
      new Request(`${BASE}/impact-analyses/${ANALYSIS_ID}`),
      analysisParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.report.roots).toHaveLength(1);
    expect(body.report.findings[0].basis).toEqual(["DECLARED_IMPACT"]);
  });

  it("404s for an analysis id belonging to another project", async () => {
    vi.mocked(service.getImpactAnalysis).mockRejectedValue(
      new NotFoundError("Impact analysis was not found."),
    );

    const response = await detailRoute.GET(
      new Request(`${BASE}/impact-analyses/${ANALYSIS_ID}`),
      analysisParams,
    );

    // Not 403 — the API does not confirm the existence of what it will not show.
    expect(response.status).toBe(404);
  });

  it("400s on a malformed analysis id", async () => {
    vi.mocked(service.getImpactAnalysis).mockRejectedValue(
      new ValidationError("Invalid analysis id"),
    );

    const response = await detailRoute.GET(new Request(`${BASE}/impact-analyses/..`), {
      params: Promise.resolve({ projectId: PROJECT_ID, analysisId: ".." }),
    });

    expect(response.status).toBe(400);
  });
});
