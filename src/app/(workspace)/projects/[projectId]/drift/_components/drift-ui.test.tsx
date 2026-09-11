import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The drift, baseline and observation workspaces, driven through the real API
 * client with a faked `fetch`. Only the network is replaced, so what these views
 * render is exactly what the server said.
 *
 * No test here asserts a percentage or a score, because the interface must never
 * show one.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const { DriftView } = await import("./drift-view");
const { BaselinesView } = await import("../../baselines/_components/baselines-view");
const { BaselineDetailView } = await import(
  "../../baselines/_components/baseline-detail-view"
);
const { ObservationsView } = await import(
  "../../observations/_components/observations-view"
);

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";
const BASELINE_ID = "bl1aaaaaaaaaaaaaaaaaaaa";
const ASSESSMENT_ID = "drf1aaaaaaaaaaaaaaaaaa";

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function fail(status: number, code: string, message: string): Response {
  return {
    ok: false,
    status,
    json: async () => ({ error: { code, message } }),
  } as unknown as Response;
}

const PROJECT = {
  id: PROJECT_ID,
  name: "Upper Stage Propulsion",
  description: null,
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function baseline(overrides: Record<string, unknown> = {}) {
  return {
    id: BASELINE_ID,
    projectId: PROJECT_ID,
    identifier: "BL-001",
    name: "Design baseline",
    description: null,
    status: "ACTIVE",
    createdById: "u1",
    baselinedAt: "2026-02-01T00:00:00.000Z",
    baselinedById: "u1",
    supersededAt: null,
    supersededById: null,
    createdAt: "2026-01-15T00:00:00.000Z",
    updatedAt: "2026-02-01T00:00:00.000Z",
    memberCount: 2,
    assessmentCount: 1,
    ...overrides,
  };
}

function member(overrides: Record<string, unknown> = {}) {
  return {
    id: "mem1",
    baselineId: BASELINE_ID,
    nodeType: "DESIGN_ITEM",
    nodeId: "di1",
    identifierSnapshot: "DI-001",
    labelSnapshot: "Combustion chamber",
    stateSnapshot: "APPROVED",
    fingerprint: "fp-old",
    revisionSnapshot: "2026-01-20T00:00:00.000Z",
    createdAt: "2026-01-20T00:00:00.000Z",
    currentFingerprint: "fp-old",
    currentLabel: "Combustion chamber",
    currentState: "APPROVED",
    changed: false,
    ...overrides,
  };
}

const EMPTY_TARGETS = {
  REQUIREMENT: [],
  DESIGN_ITEM: [],
  ENGINEERING_DECISION: [],
  DECISION_EXPECTATION: [],
  VERIFICATION_ACTIVITY: [],
  SUPPLIED_ITEM: [],
  SUPPLIER_QUALIFICATION: [],
} as Record<string, Array<{ id: string; identifier: string; title: string }>>;

function finding(overrides: Record<string, unknown> = {}) {
  return {
    id: "f1",
    assessmentId: ASSESSMENT_ID,
    ruleId: "DR-BAS-002",
    category: "BASELINE_CHANGED",
    status: "REVIEW_REQUIRED",
    severity: "ATTENTION",
    baselineSubject: {
      type: "DESIGN_ITEM",
      id: "di1",
      identifier: "DI-001",
      label: "Combustion chamber",
    },
    observationSubject: null,
    expectedValue: "fp-old",
    observedValue: "fp-new",
    explanation:
      "DI-001 (design item) has changed since baseline BL-001 was activated. This is not a finding that the change was wrong.",
    basis: ["BASELINE_MEMBER_FINGERPRINT", "ENGINEERING_JUDGEMENT_REQUIRED"],
    sequence: 0,
    createdAt: "2026-06-01T00:00:00.000Z",
    ...overrides,
  };
}

function report(overrides: Record<string, unknown> = {}) {
  const { assessment: assessmentOverrides, ...rest } = overrides;
  return {
    assessment: {
      id: ASSESSMENT_ID,
      projectId: PROJECT_ID,
      baselineId: BASELINE_ID,
      status: "DRIFT_DETECTED",
      driftVersion: "1",
      fingerprint: "fp",
      summary: { findings: 2, reviewRequired: 1, informational: 1, unknown: 0 },
      evaluatedAt: "2026-06-01T00:00:00.000Z",
      evaluatedById: "u1",
      createdAt: "2026-06-01T00:00:00.000Z",
      ...((assessmentOverrides as Record<string, unknown>) ?? {}),
    },
    freshness: "CURRENT",
    findings: [finding()],
    basis: {
      baselineId: BASELINE_ID,
      baselineIdentifier: "BL-001",
      baselineName: "Design baseline",
      baselineStatus: "ACTIVE",
      members: [
        {
          memberId: "mem1",
          nodeType: "DESIGN_ITEM",
          nodeId: "di1",
          identifier: "DI-001",
          baselinedFingerprint: "fp-old",
          currentFingerprint: "fp-new",
        },
      ],
      observations: [],
    },
    ...rest,
  };
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// --- Drift workspace --------------------------------------------------------

describe("DriftView", () => {
  function routeDrift(latest: unknown, assessments: unknown[] = []) {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/drift/evaluate")) return ok({ report: report() });
      if (url.includes("/drift/latest")) return ok({ latest });
      if (/\/drift(\?|$)/.test(url)) return ok({ assessments });
      if (url.includes("/drift/")) return ok({ report: report() });
      if (url.includes("/baselines")) return ok({ baselines: [baseline()] });
      if (init?.method === undefined) return ok({ project: PROJECT });
      return fail(404, "NOT_FOUND", "No route");
    });
  }

  it("does not evaluate on load", async () => {
    routeDrift({ status: "NOT_EVALUATED", projectId: PROJECT_ID, driftVersion: "1" });

    render(<DriftView projectId={PROJECT_ID} />);

    await screen.findByText(/has not been evaluated for drift/i);

    // Selecting a baseline reads; it never computes.
    const wrote = fetchMock.mock.calls.some(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST",
    );
    expect(wrote).toBe(false);
  });

  it("says a baseline has never been evaluated rather than showing zero findings", async () => {
    routeDrift({ status: "NOT_EVALUATED", projectId: PROJECT_ID, driftVersion: "1" });

    render(<DriftView projectId={PROJECT_ID} />);

    expect(await screen.findByText(/has not been evaluated for drift/i)).toBeInTheDocument();
    expect(screen.queryByLabelText("Drift finding counts")).not.toBeInTheDocument();
  });

  it("shows DRIFT DETECTED with an explanation that it is not a failure", async () => {
    routeDrift(report());

    render(<DriftView projectId={PROJECT_ID} />);

    const verdict = await screen.findByRole("group", { name: "Drift verdict" });
    expect(verdict).toHaveTextContent("Drift detected");
    expect(verdict).toHaveTextContent(/not a finding that anything failed/i);
  });

  it("shows NO DRIFT as a statement about records, not a guarantee", async () => {
    routeDrift(report({ assessment: { status: "NO_DRIFT" } }));

    render(<DriftView projectId={PROJECT_ID} />);

    const verdict = await screen.findByRole("group", { name: "Drift verdict" });
    expect(verdict).toHaveTextContent("No drift");
    expect(verdict).toHaveTextContent(/not a guarantee about the product/i);
  });

  it("shows UNKNOWN when something could not be compared", async () => {
    routeDrift(report({ assessment: { status: "UNKNOWN" } }));

    render(<DriftView projectId={PROJECT_ID} />);

    const verdict = await screen.findByRole("group", { name: "Drift verdict" });
    expect(verdict).toHaveTextContent("Unknown");
    expect(verdict).toHaveTextContent(/reported rather than assumed away/i);
  });

  it("renders findings with both values and the rule that produced them", async () => {
    routeDrift(report());

    render(<DriftView projectId={PROJECT_ID} />);

    const row = await screen.findByRole("row", { name: /DR-BAS-002/ });
    expect(row).toHaveTextContent("Baseline changed");
    expect(row).toHaveTextContent("Review required");
    expect(row).toHaveTextContent("DI-001");
    expect(row).toHaveTextContent("fp-old");
    expect(row).toHaveTextContent("fp-new");
  });

  it("exposes the basis a finding was read from", async () => {
    routeDrift(report());
    const user = userEvent.setup();

    render(<DriftView projectId={PROJECT_ID} />);

    await screen.findByRole("row", { name: /DR-BAS-002/ });
    await user.click(screen.getByRole("button", { name: /Inspect basis for DR-BAS-002/i }));

    expect(await screen.findByText(/baseline member fingerprint/i)).toBeInTheDocument();
    expect(screen.getByText(/engineering judgement required/i)).toBeInTheDocument();
  });

  it("says an assessment is stale and does not recompute it", async () => {
    routeDrift(report({ freshness: "STALE" }));

    render(<DriftView projectId={PROJECT_ID} />);

    expect(await screen.findByText(/This drift assessment is stale/i)).toBeInTheDocument();
    expect(screen.getByText(/Nothing has been recomputed/i)).toBeInTheDocument();

    const wrote = fetchMock.mock.calls.some(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST",
    );
    expect(wrote).toBe(false);
  });

  it("says so when freshness could not be determined", async () => {
    routeDrift(report({ freshness: "UNKNOWN" }));

    render(<DriftView projectId={PROJECT_ID} />);

    expect(
      await screen.findByText(/Whether this assessment still holds could not be determined/i),
    ).toBeInTheDocument();
    expect(screen.getByText(/not being presented as current/i)).toBeInTheDocument();
  });

  it("evaluates only when asked", async () => {
    routeDrift({ status: "NOT_EVALUATED", projectId: PROJECT_ID, driftVersion: "1" });
    const user = userEvent.setup();

    render(<DriftView projectId={PROJECT_ID} />);

    await screen.findByText(/has not been evaluated for drift/i);
    await user.click(screen.getAllByRole("button", { name: /evaluate drift/i })[0]!);

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).includes("/drift/evaluate") &&
            (init as RequestInit | undefined)?.method === "POST",
        ),
      ).toBe(true);
    });
  });

  it("lists history and opens a historical assessment read-only", async () => {
    routeDrift(report(), [
      {
        id: ASSESSMENT_ID,
        projectId: PROJECT_ID,
        baselineId: BASELINE_ID,
        status: "DRIFT_DETECTED",
        driftVersion: "1",
        fingerprint: "fp",
        summary: { findings: 2, reviewRequired: 1, informational: 1, unknown: 0 },
        evaluatedAt: "2026-06-01T00:00:00.000Z",
        evaluatedById: "u1",
        createdAt: "2026-06-01T00:00:00.000Z",
      },
    ]);
    const user = userEvent.setup();

    render(<DriftView projectId={PROJECT_ID} />);

    expect(await screen.findByRole("heading", { name: "History" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Open$/ }));

    expect(await screen.findByText(/Viewing a historical assessment/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot be edited/i)).toBeInTheDocument();
  });

  it("points at baselines when there is nothing to compare against", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/baselines")) return ok({ baselines: [] });
      if (url.includes("/drift/latest"))
        return ok({ latest: { status: "NOT_EVALUATED", projectId: PROJECT_ID, driftVersion: "1" } });
      if (/\/drift(\?|$)/.test(url)) return ok({ assessments: [] });
      return ok({ project: PROJECT });
    });

    render(<DriftView projectId={PROJECT_ID} />);

    expect(await screen.findByText(/No baseline to compare against/i)).toBeInTheDocument();
  });

  it("surfaces an evaluation error", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/drift/evaluate") && init?.method === "POST") {
        return fail(409, "CONFLICT", "That baseline is a draft and cannot be evaluated.");
      }
      if (url.includes("/drift/latest"))
        return ok({ latest: { status: "NOT_EVALUATED", projectId: PROJECT_ID, driftVersion: "1" } });
      if (/\/drift(\?|$)/.test(url)) return ok({ assessments: [] });
      if (url.includes("/baselines")) return ok({ baselines: [baseline()] });
      return ok({ project: PROJECT });
    });
    const user = userEvent.setup();

    render(<DriftView projectId={PROJECT_ID} />);

    await screen.findByText(/has not been evaluated for drift/i);
    await user.click(screen.getAllByRole("button", { name: /evaluate drift/i })[0]!);

    expect(await screen.findByText(/cannot be evaluated/i)).toBeInTheDocument();
  });

  it("shows no score, percentage or confidence anywhere", async () => {
    routeDrift(report());

    const { container } = render(<DriftView projectId={PROJECT_ID} />);
    await screen.findByRole("group", { name: "Drift verdict" });

    expect(container.textContent).not.toMatch(/%|score|confidence|probability|aligned/i);
  });
});

// --- Baselines --------------------------------------------------------------

describe("BaselinesView", () => {
  function routeList(baselines: unknown[]) {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/baselines")) return ok({ baselines });
      return ok({ project: PROJECT });
    });
  }

  it("lists baselines with their status and counts", async () => {
    routeList([baseline()]);

    render(<BaselinesView projectId={PROJECT_ID} />);

    expect(await screen.findByRole("link", { name: "BL-001" })).toBeInTheDocument();
    const row = screen.getByRole("row", { name: /BL-001/ });
    expect(within(row).getByText("Active")).toBeInTheDocument();
    expect(within(row).getByText("2")).toBeInTheDocument();
  });

  it("does not hide superseded baselines", async () => {
    routeList([baseline({ status: "SUPERSEDED", supersededAt: "2026-07-01T00:00:00.000Z" })]);

    render(<BaselinesView projectId={PROJECT_ID} />);

    // Scoped to the row: the table's own "Superseded" column header would
    // otherwise also match the text query.
    const row = await screen.findByRole("row", { name: /BL-001/ });
    expect(within(row).getByText("Superseded")).toBeInTheDocument();
  });

  it("explains why a baseline is needed when none exists", async () => {
    routeList([]);

    render(<BaselinesView projectId={PROJECT_ID} />);

    expect(await screen.findByText(/No baselines yet/i)).toBeInTheDocument();
    expect(screen.getByText(/there is nothing to compare operational reality to/i)).toBeInTheDocument();
  });
});

describe("BaselineDetailView", () => {
  function routeDetail(overrides: Record<string, unknown> = {}) {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/baseline-member-targets")) return ok({ targets: EMPTY_TARGETS });
      if (url.includes(`/baselines/${BASELINE_ID}`)) {
        return ok({
          baseline: { ...baseline(), members: [member()], history: [], ...overrides },
        });
      }
      return fail(404, "NOT_FOUND", "No route");
    });
  }

  it("shows an active baseline as immutable and explains why", async () => {
    routeDetail();

    render(<BaselineDetailView projectId={PROJECT_ID} baselineId={BASELINE_ID} />);

    expect(await screen.findByText(/is active and immutable/i)).toBeInTheDocument();
    expect(
      screen.getByText(/editing it would silently change what past results meant/i),
    ).toBeInTheDocument();
  });

  it("offers no membership controls on an active baseline", async () => {
    routeDetail();

    render(<BaselineDetailView projectId={PROJECT_ID} baselineId={BASELINE_ID} />);

    await screen.findByRole("heading", { name: "Design baseline" });
    expect(screen.queryByRole("button", { name: /add to baseline/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Remove/ })).not.toBeInTheDocument();
  });

  it("offers membership controls on a draft", async () => {
    routeDetail({ status: "DRAFT", baselinedAt: null });

    render(<BaselineDetailView projectId={PROJECT_ID} baselineId={BASELINE_ID} />);

    expect(await screen.findByRole("button", { name: /add to baseline/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Activate$/ })).toBeInTheDocument();
  });

  it("marks a member that has changed since baselining", async () => {
    routeDetail({
      members: [member({ changed: true, currentFingerprint: "fp-new", currentState: "BASELINED" })],
    });

    render(<BaselineDetailView projectId={PROJECT_ID} baselineId={BASELINE_ID} />);

    const list = await screen.findByRole("list", { name: "Baselined objects" });
    expect(within(list).getByText("Changed since baseline")).toBeInTheDocument();
    expect(within(list).getByText(/now BASELINED/)).toBeInTheDocument();
  });

  it("says a change is not a judgement that anything is wrong", async () => {
    routeDetail({ members: [member({ changed: true, currentFingerprint: "fp-new" })] });

    render(<BaselineDetailView projectId={PROJECT_ID} baselineId={BASELINE_ID} />);

    expect(
      await screen.findByText(/not a judgement that anything is wrong/i),
    ).toBeInTheDocument();
  });

  it("marks a member that no longer resolves", async () => {
    routeDetail({ members: [member({ currentFingerprint: null, changed: false })] });

    render(<BaselineDetailView projectId={PROJECT_ID} baselineId={BASELINE_ID} />);

    const list = await screen.findByRole("list", { name: "Baselined objects" });
    expect(within(list).getByText("Not resolvable")).toBeInTheDocument();
  });
});

// --- Observations -----------------------------------------------------------

describe("ObservationsView", () => {
  function observation(overrides: Record<string, unknown> = {}) {
    return {
      id: "obs1",
      projectId: PROJECT_ID,
      identifier: "OBS-001",
      title: "Peak wall temperature",
      description: "Measured on flight 14.",
      observationType: "MEASUREMENT",
      status: "RECORDED",
      source: "FT-14",
      observedAt: "2026-05-01T00:00:00.000Z",
      subjectLabel: null,
      numericValue: "842.5",
      unit: "K",
      textValue: null,
      subject: null,
      createdById: "u1",
      reviewedAt: null,
      reviewedById: null,
      createdAt: "2026-05-01T00:00:00.000Z",
      updatedAt: "2026-05-01T00:00:00.000Z",
      ...overrides,
    };
  }

  function routeObservations(observations: unknown[]) {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/baseline-member-targets")) return ok({ targets: EMPTY_TARGETS });
      if (url.includes("/review") && init?.method === "POST") {
        return ok({ observation: observation({ status: "REVIEWED" }) });
      }
      if (url.includes("/reject") && init?.method === "POST") {
        return ok({ observation: observation({ status: "REJECTED" }) });
      }
      if (url.includes("/observations")) return ok({ observations });
      return ok({ project: PROJECT });
    });
  }

  it("lists observations with their value and status", async () => {
    routeObservations([observation()]);

    render(<ObservationsView projectId={PROJECT_ID} />);

    const row = await screen.findByRole("row", { name: /OBS-001/ });
    expect(row).toHaveTextContent("842.5 K");
    expect(row).toHaveTextContent("Measurement");
    expect(within(row).getByText("Recorded")).toBeInTheDocument();
  });

  it("says plainly that there is no telemetry ingestion", async () => {
    routeObservations([observation()]);

    render(<ObservationsView projectId={PROJECT_ID} />);

    expect(await screen.findByText(/no telemetry ingestion/i)).toBeInTheDocument();
  });

  it("offers review and reject on a recorded observation", async () => {
    routeObservations([observation()]);

    render(<ObservationsView projectId={PROJECT_ID} />);

    await screen.findByRole("row", { name: /OBS-001/ });
    expect(screen.getByRole("button", { name: /review/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /reject/i })).toBeInTheDocument();
  });

  it("reviews through the API", async () => {
    routeObservations([observation()]);
    const user = userEvent.setup();

    render(<ObservationsView projectId={PROJECT_ID} />);

    await screen.findByRole("row", { name: /OBS-001/ });
    await user.click(screen.getByRole("button", { name: /review/i }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes("/review")),
      ).toBe(true);
    });
  });

  it("does not pretend a reviewed observation is editable", async () => {
    routeObservations([observation({ status: "REVIEWED" })]);

    render(<ObservationsView projectId={PROJECT_ID} />);

    await screen.findByRole("row", { name: /OBS-001/ });
    expect(screen.queryByRole("button", { name: /^Edit$/ })).not.toBeInTheDocument();
    expect(screen.getByText(/content is now fixed/i)).toBeInTheDocument();
  });

  it("keeps a rejected observation visible as history", async () => {
    routeObservations([observation({ status: "REJECTED" })]);

    render(<ObservationsView projectId={PROJECT_ID} />);

    await screen.findByRole("row", { name: /OBS-001/ });
    expect(screen.getByText(/kept as history/i)).toBeInTheDocument();
  });

  it("surfaces an API error with a retry", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/observations")) return fail(500, "INTERNAL", "Database unreachable");
      return ok({ project: PROJECT });
    });

    render(<ObservationsView projectId={PROJECT_ID} />);

    const alerts = await screen.findAllByRole("alert");
    expect(alerts.some((a) => /went wrong on the server/i.test(a.textContent ?? ""))).toBe(true);
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
