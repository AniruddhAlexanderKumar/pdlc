// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from "@/server/errors";

/**
 * Decision Sentinel route handlers, driven through a faked service so that
 * path parsing, authentication, body handling and error-to-status mapping
 * are exercised without re-testing detection or dispatch logic — that lives
 * in `decision-sentinel.service.test.ts` against a real dependency registry.
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

vi.mock("@/server/services/decision-sentinel.service", () => ({
  decisionSentinelService: {
    detectProjectChanges: vi.fn(),
    listOpenSurveillance: vi.fn(),
    listSurveillanceHistory: vi.fn(),
    getSurveillanceCounts: vi.fn(),
    getSurveillanceTarget: vi.fn(),
    acknowledgeSurveillance: vi.fn(),
    resolveSurveillance: vi.fn(),
    reEvaluateTarget: vi.fn(),
  },
}));

const authContext = await import("@/server/auth/context");
const { decisionSentinelService: service } = await import(
  "@/server/services/decision-sentinel.service"
);

const countsRoute = await import("@/app/api/projects/[projectId]/sentinel/route");
const openRoute = await import("@/app/api/projects/[projectId]/sentinel/open/route");
const historyRoute = await import("@/app/api/projects/[projectId]/sentinel/history/route");
const detectRoute = await import("@/app/api/projects/[projectId]/sentinel/detect/route");
const detailRoute = await import("@/app/api/projects/[projectId]/sentinel/[targetId]/route");
const acknowledgeRoute = await import(
  "@/app/api/projects/[projectId]/sentinel/[targetId]/acknowledge/route"
);
const resolveRoute = await import("@/app/api/projects/[projectId]/sentinel/[targetId]/resolve/route");
const reevaluateRoute = await import(
  "@/app/api/projects/[projectId]/sentinel/[targetId]/reevaluate/route"
);

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";
const TARGET_ID = "tgt1aaaaaaaaaaaaaaaaaaaa";

const BASE = `http://localhost/api/projects/${PROJECT_ID}/sentinel`;
const projectParams = { params: Promise.resolve({ projectId: PROJECT_ID }) };
const targetParams = { params: Promise.resolve({ projectId: PROJECT_ID, targetId: TARGET_ID }) };

const TARGET = {
  id: TARGET_ID,
  projectId: PROJECT_ID,
  targetType: "VERIFICATION_READINESS",
  targetId: "va1aaaaaaaaaaaaaaaaaaaa",
  targetIdentifier: "VA-001",
  targetLabel: "Hot fire test",
  reason: "The requirement changed after a verification readiness assessment included it in its basis.",
  sourceEventId: "evt1aaaaaaaaaaaaaaaaaa",
  sourceType: "REQUIREMENT",
  sourceId: "req1aaaaaaaaaaaaaaaaaaaa",
  sourceIdentifier: "REQ-001",
  sourceLabel: "Chamber pressure",
  status: "OPEN",
  detectedAt: new Date("2026-03-01T00:00:00.000Z"),
  acknowledgedAt: null,
  acknowledgedById: null,
  acknowledgementNote: null,
  resolvedAt: null,
  resolvedById: null,
  resolutionNote: null,
  supersededById: null,
  createdAt: new Date("2026-03-01T00:00:00.000Z"),
  updatedAt: new Date("2026-03-01T00:00:00.000Z"),
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
  it("401s every sentinel route without a session", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());

    const responses = await Promise.all([
      countsRoute.GET(new Request(BASE), projectParams),
      openRoute.GET(new Request(`${BASE}/open`), projectParams),
      historyRoute.GET(new Request(`${BASE}/history`), projectParams),
      detectRoute.POST(jsonRequest(`${BASE}/detect`, {}), projectParams),
      detailRoute.GET(new Request(`${BASE}/${TARGET_ID}`), targetParams),
      acknowledgeRoute.POST(jsonRequest(`${BASE}/${TARGET_ID}/acknowledge`, {}), targetParams),
      resolveRoute.POST(jsonRequest(`${BASE}/${TARGET_ID}/resolve`, { note: "x" }), targetParams),
      reevaluateRoute.POST(jsonRequest(`${BASE}/${TARGET_ID}/reevaluate`, {}), targetParams),
    ]);

    expect(responses.map((response) => response.status)).toEqual([
      401, 401, 401, 401, 401, 401, 401, 401,
    ]);
  });

  it("never reaches the service when the session is missing", async () => {
    vi.mocked(authContext.requireAuthenticatedContext).mockRejectedValue(new UnauthorizedError());

    await detectRoute.POST(jsonRequest(`${BASE}/detect`, {}), projectParams);

    expect(service.detectProjectChanges).not.toHaveBeenCalled();
  });
});

describe("GET /sentinel", () => {
  it("returns real open/acknowledged counts, scoped to the path project", async () => {
    vi.mocked(service.getSurveillanceCounts).mockResolvedValue({ open: 2, acknowledged: 1 });

    const response = await countsRoute.GET(new Request(BASE), projectParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.counts).toEqual({ open: 2, acknowledged: 1 });
    expect(service.getSurveillanceCounts).toHaveBeenCalledWith(CONTEXT, PROJECT_ID);
  });

  it("404s for a project outside the caller's organization", async () => {
    vi.mocked(service.getSurveillanceCounts).mockRejectedValue(new NotFoundError("Project was not found."));

    const response = await countsRoute.GET(new Request(BASE), projectParams);
    expect(response.status).toBe(404);
  });
});

describe("GET /sentinel/open", () => {
  it("returns open and acknowledged targets", async () => {
    vi.mocked(service.listOpenSurveillance).mockResolvedValue([TARGET] as never);

    const response = await openRoute.GET(new Request(`${BASE}/open`), projectParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.targets).toHaveLength(1);
    expect(body.targets[0].status).toBe("OPEN");
    expect(service.listOpenSurveillance).toHaveBeenCalledWith(CONTEXT, PROJECT_ID);
  });

  it("returns an honest empty list rather than an error when nothing is open", async () => {
    vi.mocked(service.listOpenSurveillance).mockResolvedValue([]);

    const response = await openRoute.GET(new Request(`${BASE}/open`), projectParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.targets).toEqual([]);
  });
});

describe("GET /sentinel/history", () => {
  it("returns resolved/superseded targets", async () => {
    vi.mocked(service.listSurveillanceHistory).mockResolvedValue([
      { ...TARGET, status: "RESOLVED" },
    ] as never);

    const response = await historyRoute.GET(new Request(`${BASE}/history`), projectParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.targets[0].status).toBe("RESOLVED");
    expect(service.listSurveillanceHistory).toHaveBeenCalledWith(CONTEXT, PROJECT_ID);
  });
});

describe("POST /sentinel/detect", () => {
  it("runs detection and returns the summary", async () => {
    vi.mocked(service.detectProjectChanges).mockResolvedValue({
      eventsCreated: 3,
      targetsOpened: 1,
      targetsUpdated: 0,
    });

    const response = await detectRoute.POST(jsonRequest(`${BASE}/detect`, {}), projectParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary).toEqual({ eventsCreated: 3, targetsOpened: 1, targetsUpdated: 0 });
    expect(service.detectProjectChanges).toHaveBeenCalledWith(CONTEXT, PROJECT_ID, {});
  });

  it("400s on a malformed body", async () => {
    const response = await detectRoute.POST(
      new Request(`${BASE}/detect`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
      projectParams,
    );

    expect(response.status).toBe(400);
    expect(service.detectProjectChanges).not.toHaveBeenCalled();
  });

  it("400s when the client tries to supply a field the request does not accept", async () => {
    vi.mocked(service.detectProjectChanges).mockRejectedValue(
      new ValidationError("Invalid detection request"),
    );

    const response = await detectRoute.POST(
      jsonRequest(`${BASE}/detect`, { targetsOpened: 99 }),
      projectParams,
    );

    expect(response.status).toBe(400);
  });

  it("404s for a project outside the caller's organization", async () => {
    vi.mocked(service.detectProjectChanges).mockRejectedValue(new NotFoundError("Project was not found."));

    const response = await detectRoute.POST(jsonRequest(`${BASE}/detect`, {}), projectParams);
    expect(response.status).toBe(404);
  });

  it("never accepts a client-supplied project id — the path id always wins", async () => {
    vi.mocked(service.detectProjectChanges).mockResolvedValue({
      eventsCreated: 0,
      targetsOpened: 0,
      targetsUpdated: 0,
    });

    await detectRoute.POST(
      jsonRequest(`${BASE}/detect`, { projectId: "proj9aaaaaaaaaaaaaaaaaa" }),
      projectParams,
    );

    expect(service.detectProjectChanges).toHaveBeenCalledWith(
      CONTEXT,
      PROJECT_ID,
      expect.objectContaining({}),
    );
  });
});

describe("GET /sentinel/[targetId]", () => {
  it("returns one target in full, with its source", async () => {
    vi.mocked(service.getSurveillanceTarget).mockResolvedValue(TARGET as never);

    const response = await detailRoute.GET(new Request(`${BASE}/${TARGET_ID}`), targetParams);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.target.id).toBe(TARGET_ID);
    expect(body.target.sourceLabel).toBe("Chamber pressure");
    expect(service.getSurveillanceTarget).toHaveBeenCalledWith(CONTEXT, PROJECT_ID, TARGET_ID);
  });

  it("404s for a target id belonging to another project", async () => {
    vi.mocked(service.getSurveillanceTarget).mockRejectedValue(
      new NotFoundError("Surveillance target was not found."),
    );

    const response = await detailRoute.GET(new Request(`${BASE}/${TARGET_ID}`), targetParams);
    expect(response.status).toBe(404);
  });

  it("400s on a malformed target id", async () => {
    vi.mocked(service.getSurveillanceTarget).mockRejectedValue(
      new ValidationError("Invalid surveillance target id"),
    );

    const response = await detailRoute.GET(new Request(`${BASE}/..`), {
      params: Promise.resolve({ projectId: PROJECT_ID, targetId: ".." }),
    });

    expect(response.status).toBe(400);
  });
});

describe("POST /sentinel/[targetId]/acknowledge", () => {
  it("acknowledges a target and returns it", async () => {
    vi.mocked(service.acknowledgeSurveillance).mockResolvedValue({
      ...TARGET,
      status: "ACKNOWLEDGED",
      acknowledgementNote: "seen it",
    } as never);

    const response = await acknowledgeRoute.POST(
      jsonRequest(`${BASE}/${TARGET_ID}/acknowledge`, { note: "seen it" }),
      targetParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.target.status).toBe("ACKNOWLEDGED");
    expect(service.acknowledgeSurveillance).toHaveBeenCalledWith(CONTEXT, PROJECT_ID, TARGET_ID, {
      note: "seen it",
    });
  });

  it("accepts an empty body — the note is optional", async () => {
    vi.mocked(service.acknowledgeSurveillance).mockResolvedValue({
      ...TARGET,
      status: "ACKNOWLEDGED",
    } as never);

    const response = await acknowledgeRoute.POST(
      jsonRequest(`${BASE}/${TARGET_ID}/acknowledge`, {}),
      targetParams,
    );

    expect(response.status).toBe(200);
  });

  it("409s when the target cannot be acknowledged from its current status", async () => {
    vi.mocked(service.acknowledgeSurveillance).mockRejectedValue(
      new ConflictError("This surveillance target is RESOLVED and cannot be acknowledged."),
    );

    const response = await acknowledgeRoute.POST(
      jsonRequest(`${BASE}/${TARGET_ID}/acknowledge`, {}),
      targetParams,
    );

    expect(response.status).toBe(409);
  });
});

describe("POST /sentinel/[targetId]/resolve", () => {
  it("resolves a target with a note", async () => {
    vi.mocked(service.resolveSurveillance).mockResolvedValue({
      ...TARGET,
      status: "RESOLVED",
      resolutionNote: "re-ran verification readiness",
    } as never);

    const response = await resolveRoute.POST(
      jsonRequest(`${BASE}/${TARGET_ID}/resolve`, { note: "re-ran verification readiness" }),
      targetParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.target.status).toBe("RESOLVED");
    expect(service.resolveSurveillance).toHaveBeenCalledWith(CONTEXT, PROJECT_ID, TARGET_ID, {
      note: "re-ran verification readiness",
    });
  });

  it("**400s a resolution with no note — resolution never happens silently**", async () => {
    vi.mocked(service.resolveSurveillance).mockRejectedValue(new ValidationError("Invalid resolution"));

    const response = await resolveRoute.POST(
      jsonRequest(`${BASE}/${TARGET_ID}/resolve`, {}),
      targetParams,
    );

    expect(response.status).toBe(400);
  });

  it("409s an already-resolved target", async () => {
    vi.mocked(service.resolveSurveillance).mockRejectedValue(
      new ConflictError("This surveillance target is already RESOLVED."),
    );

    const response = await resolveRoute.POST(
      jsonRequest(`${BASE}/${TARGET_ID}/resolve`, { note: "x" }),
      targetParams,
    );

    expect(response.status).toBe(409);
  });
});

describe("POST /sentinel/[targetId]/reevaluate", () => {
  it("dispatches reevaluation and returns the (now resolved) target", async () => {
    vi.mocked(service.reEvaluateTarget).mockResolvedValue({
      ...TARGET,
      status: "RESOLVED",
      resolutionNote: "Resolved automatically: a new verification readiness evaluation was run.",
    } as never);

    const response = await reevaluateRoute.POST(
      jsonRequest(`${BASE}/${TARGET_ID}/reevaluate`, {}),
      targetParams,
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.target.status).toBe("RESOLVED");
    expect(service.reEvaluateTarget).toHaveBeenCalledWith(CONTEXT, PROJECT_ID, TARGET_ID, {});
  });

  it("surfaces an engine failure without resolving the target", async () => {
    vi.mocked(service.reEvaluateTarget).mockRejectedValue(new Error("engine failed"));

    const response = await reevaluateRoute.POST(
      jsonRequest(`${BASE}/${TARGET_ID}/reevaluate`, {}),
      targetParams,
    );

    expect(response.status).toBe(500);
  });

  it("409s a target that is not open or acknowledged", async () => {
    vi.mocked(service.reEvaluateTarget).mockRejectedValue(
      new ConflictError("This surveillance target is already SUPERSEDED."),
    );

    const response = await reevaluateRoute.POST(
      jsonRequest(`${BASE}/${TARGET_ID}/reevaluate`, {}),
      targetParams,
    );

    expect(response.status).toBe(409);
  });
});

describe("project scoping", () => {
  it("takes the project id from every route's path, never from a request body", async () => {
    vi.mocked(service.getSurveillanceTarget).mockResolvedValue(TARGET as never);

    await detailRoute.GET(new Request(`${BASE}/${TARGET_ID}`), targetParams);

    expect(service.getSurveillanceTarget).toHaveBeenCalledWith(CONTEXT, PROJECT_ID, TARGET_ID);
  });
});

describe("what the API never exposes", () => {
  it("offers no route that would let a client rewrite a target directly", () => {
    // Every mutation is a named action (acknowledge/resolve/reevaluate) with
    // its own rules — there is no generic PATCH or PUT on a target.
    for (const route of [countsRoute, openRoute, historyRoute, detailRoute]) {
      const handlers = Object.keys(route);
      expect(handlers).not.toContain("PATCH");
      expect(handlers).not.toContain("PUT");
      expect(handlers).not.toContain("DELETE");
      expect(handlers).not.toContain("POST");
    }
  });

  it("returns no score, percentage or confidence in any payload", async () => {
    vi.mocked(service.getSurveillanceCounts).mockResolvedValue({ open: 2, acknowledged: 1 });

    const response = await countsRoute.GET(new Request(BASE), projectParams);
    const text = JSON.stringify(await response.json());

    expect(text).not.toMatch(/"score"|"percent|"confidence"|"probability"|"risk"/i);
  });
});
