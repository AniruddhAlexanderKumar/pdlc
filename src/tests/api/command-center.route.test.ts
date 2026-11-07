// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotFoundError, UnauthorizedError } from "@/server/errors";

/**
 * Command Center route, driven through a faked service — routing, auth, and
 * error-to-status mapping only. Aggregation correctness lives in
 * `project-command-center.service.test.ts`.
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

vi.mock("@/server/services/project-command-center.service", () => ({
  getCommandCenter: vi.fn(),
}));

const authContext = await import("@/server/auth/context");
const service = await import("@/server/services/project-command-center.service");
const route = await import("@/app/api/projects/[projectId]/command-center/route");

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";
const routeContext = { params: Promise.resolve({ projectId: PROJECT_ID }) };

const VIEW = {
  project: {
    id: PROJECT_ID,
    identifier: null,
    name: "Upper Stage Propulsion",
    description: null,
    status: "ACTIVE",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
  },
  attentionItems: [],
  readiness: {
    technical: [],
    verification: { activitiesTotal: 0, activitiesFailed: 0, activitiesNeverEvaluated: 0, attentionActivities: [] },
    certification: { hasProgram: false, programIdentifier: null, activeBasisIdentifier: null, review: null, openFindings: [] },
    changeImpact: { activeChanges: [] },
    assumptions: { total: 0, reviewRequired: 0, basisChanged: 0, neverEvaluated: 0, attentionAssumptions: [] },
    drift: { status: "NOT_EVALUATED", evaluatedAt: null, findings: 0, reviewRequired: 0, unknown: 0, href: `/projects/${PROJECT_ID}/drift` },
  },
  configuration: {
    hasActiveBaseline: false,
    baselineId: null,
    baselineIdentifier: null,
    baselineName: null,
    status: null,
    memberCount: null,
    changedCount: null,
    missingCount: null,
    comparisonStatus: null,
    href: `/projects/${PROJECT_ID}/baselines`,
  },
  risks: { open: 0, items: [] },
  issues: { open: 0, attentionCount: 0, items: [] },
  suppliers: { suppliersUnderReview: [], suppliedItemsUnderReview: [], qualificationsAttention: [] },
  evidence: { draftCount: 0, validatedCount: 0, supersededCount: 0, draftItems: [] },
  sentinel: { openCount: 0, acknowledgedCount: 0, targets: [] },
  traceabilityHref: `/projects/${PROJECT_ID}/traceability`,
  historyHref: `/projects/${PROJECT_ID}/history`,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(authContext.requireAuthenticatedContext).mockResolvedValue(CONTEXT as never);
});

describe("GET /command-center", () => {
  it("401s without a session", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());

    const response = await route.GET(
      new Request(`http://localhost/api/projects/${PROJECT_ID}/command-center`),
      routeContext,
    );
    expect(response.status).toBe(401);
    expect(service.getCommandCenter).not.toHaveBeenCalled();
  });

  it("returns the composed view", async () => {
    vi.mocked(service.getCommandCenter).mockResolvedValue(VIEW as never);

    const response = await route.GET(
      new Request(`http://localhost/api/projects/${PROJECT_ID}/command-center`),
      routeContext,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.commandCenter.project.id).toBe(PROJECT_ID);
    expect(service.getCommandCenter).toHaveBeenCalledWith(CONTEXT, PROJECT_ID);
  });

  it("404s for a project outside the caller's organization", async () => {
    vi.mocked(service.getCommandCenter).mockRejectedValue(new NotFoundError("Project not found."));

    const response = await route.GET(
      new Request(`http://localhost/api/projects/${PROJECT_ID}/command-center`),
      routeContext,
    );
    expect(response.status).toBe(404);
  });

  it("never exposes a mutating method on this route", () => {
    const routeModule = route as unknown as Record<string, unknown>;
    expect(routeModule.POST).toBeUndefined();
    expect(routeModule.PATCH).toBeUndefined();
    expect(routeModule.DELETE).toBeUndefined();
  });

  it("returns no score, probability, heatmap, percentage or composite health field", async () => {
    vi.mocked(service.getCommandCenter).mockResolvedValue(VIEW as never);

    const response = await route.GET(
      new Request(`http://localhost/api/projects/${PROJECT_ID}/command-center`),
      routeContext,
    );
    const text = await response.text();

    expect(text).not.toMatch(
      /riskScore|probability|heatmap|healthScore|overallHealth|compositeScore|readinessPercent|percentage|prediction/i,
    );
  });
});
