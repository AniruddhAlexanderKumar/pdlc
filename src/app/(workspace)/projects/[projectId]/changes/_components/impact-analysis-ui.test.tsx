import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The impact analysis workspace, driven through the real API client with a
 * faked `fetch`. Only the network is replaced, so what the panel renders is
 * exactly what the server said — nothing is derived in the browser.
 */

const { ImpactAnalysisPanel } = await import("./impact-analysis-panel");

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";
const CHANGE_ID = "chg1aaaaaaaaaaaaaaaaaaa";
const ANALYSIS_ID = "ana1aaaaaaaaaaaaaaaaaaa";
const REQUIREMENT_ID = "req1aaaaaaaaaaaaaaaaaaa";
const DESIGN_ID = "di1aaaaaaaaaaaaaaaaaaaa";
const VERIFICATION_ID = "va1aaaaaaaaaaaaaaaaaaa";

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

const NOT_RUN = {
  status: "NOT_RUN",
  changeRequestId: CHANGE_ID,
  engineVersion: "1",
};

const DIRECT_FINDING = {
  id: "finding-direct",
  analysisId: ANALYSIS_ID,
  rootId: "root1",
  node: { type: "REQUIREMENT", id: REQUIREMENT_ID },
  identifier: "REQ-001",
  label: "Maximum chamber pressure",
  classification: "DIRECT",
  status: "POTENTIALLY_AFFECTED",
  depth: 0,
  basis: ["DECLARED_IMPACT"],
  path: [],
  alternatePathCount: 0,
  createdAt: "2026-03-01T00:00:01.000Z",
};

const DESIGN_FINDING = {
  id: "finding-design",
  analysisId: ANALYSIS_ID,
  rootId: "root1",
  node: { type: "DESIGN_ITEM", id: DESIGN_ID },
  identifier: "DI-001",
  label: "Combustion chamber",
  classification: "CROSS_DOMAIN",
  status: "POTENTIALLY_AFFECTED",
  depth: 1,
  basis: ["DOMAIN_BOUNDARY_CROSSED", "GRAPH_PROPAGATION"],
  path: [
    {
      edgeType: "REQUIREMENT_ALLOCATED_TO_DESIGN",
      relationshipId: "rel-allocation",
      traversed: "FORWARD",
      from: { type: "REQUIREMENT", id: REQUIREMENT_ID },
      to: { type: "DESIGN_ITEM", id: DESIGN_ID },
    },
  ],
  alternatePathCount: 0,
  createdAt: "2026-03-01T00:00:01.000Z",
};

const VERIFICATION_FINDING = {
  id: "finding-verification",
  analysisId: ANALYSIS_ID,
  rootId: "root1",
  node: { type: "VERIFICATION_ACTIVITY", id: VERIFICATION_ID },
  identifier: "VA-001",
  label: "Hot fire test",
  classification: "CROSS_DOMAIN",
  status: "POTENTIALLY_AFFECTED",
  depth: 1,
  basis: [
    "DOMAIN_BOUNDARY_CROSSED",
    "GRAPH_PROPAGATION",
    "VERIFICATION_ACTIVITY_AFFECTED",
    "VERIFICATION_OUTCOME_NOT_EVALUATED",
  ],
  path: [
    {
      edgeType: "REQUIREMENT_VERIFIED_BY",
      relationshipId: "rel-verify",
      traversed: "FORWARD",
      from: { type: "REQUIREMENT", id: REQUIREMENT_ID },
      to: { type: "VERIFICATION_ACTIVITY", id: VERIFICATION_ID },
    },
  ],
  alternatePathCount: 0,
  createdAt: "2026-03-01T00:00:01.000Z",
};

function report(overrides: Record<string, unknown> = {}) {
  return {
    analysis: {
      id: ANALYSIS_ID,
      projectId: PROJECT_ID,
      changeRequestId: CHANGE_ID,
      status: "COMPLETED",
      engineVersion: "1",
      sourceFingerprint: "fingerprint-a",
      failureReason: null,
      startedAt: "2026-03-01T00:00:00.000Z",
      completedAt: "2026-03-01T00:00:01.000Z",
      requestedById: "user1",
      summary: {
        declaredImpacts: 1,
        roots: 1,
        findings: 3,
        direct: 1,
        downstream: 0,
        crossDomain: 2,
        upstreamContext: 0,
        unknown: 0,
        notEvaluated: 0,
      },
      limits: {
        maxDepth: 3,
        maxNodes: 200,
        maxEdges: 1000,
        truncated: false,
        truncatedBy: null,
      },
    },
    freshness: "CURRENT",
    roots: [
      {
        id: "root1",
        analysisId: ANALYSIS_ID,
        node: { type: "REQUIREMENT", id: REQUIREMENT_ID },
        identifier: "REQ-001",
        label: "Maximum chamber pressure",
        resolved: true,
        declaredImpactId: "imp1",
      },
    ],
    findings: [DIRECT_FINDING, DESIGN_FINDING, VERIFICATION_FINDING],
    ...overrides,
  };
}

const fetchMock = vi.fn();

function routeGets(latest: unknown) {
  fetchMock.mockImplementation(async () => ok({ latest }));
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("when nothing has been run", () => {
  it("says so rather than showing zeroes", async () => {
    routeGets(NOT_RUN);

    render(<ImpactAnalysisPanel projectId={PROJECT_ID} changeId={CHANGE_ID} />);

    expect(await screen.findByText(/No impact analysis has been run/i)).toBeInTheDocument();
    // Zero counts would read as "we looked and found nothing".
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByText("Cross-domain")).not.toBeInTheDocument();
  });

  it("offers an explicit run action", async () => {
    routeGets(NOT_RUN);

    render(<ImpactAnalysisPanel projectId={PROJECT_ID} changeId={CHANGE_ID} />);

    expect(
      await screen.findByRole("button", { name: /run impact analysis/i }),
    ).toBeInTheDocument();
  });

  it("does not run one on its own", async () => {
    routeGets(NOT_RUN);

    render(<ImpactAnalysisPanel projectId={PROJECT_ID} changeId={CHANGE_ID} />);
    await screen.findByText(/No impact analysis has been run/i);

    // Reading the page must never compute anything.
    expect(fetchMock.mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true);
  });
});

describe("running an analysis", () => {
  it("posts to the run endpoint and re-reads the result", async () => {
    routeGets(NOT_RUN);
    const user = userEvent.setup();

    render(<ImpactAnalysisPanel projectId={PROJECT_ID} changeId={CHANGE_ID} />);
    await screen.findByText(/No impact analysis has been run/i);

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return ok({ report: report() });
      return ok({ latest: report() });
    });

    await user.click(screen.getByRole("button", { name: /run impact analysis/i }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/impact-analysis") && init?.method === "POST",
        ),
      ).toBe(true),
    );

    // The panel shows what the server will return next time, not the POST body.
    expect(await screen.findByRole("table")).toBeInTheDocument();
  });

  it("shows a busy state while it runs", async () => {
    routeGets(NOT_RUN);
    const user = userEvent.setup();

    render(<ImpactAnalysisPanel projectId={PROJECT_ID} changeId={CHANGE_ID} />);
    await screen.findByText(/No impact analysis has been run/i);

    let release: (value: Response) => void = () => {};
    fetchMock.mockImplementation(
      async (_url: string, init?: RequestInit) =>
        init?.method === "POST"
          ? new Promise<Response>((resolve) => {
              release = resolve;
            })
          : ok({ latest: NOT_RUN }),
    );

    await user.click(screen.getByRole("button", { name: /run impact analysis/i }));

    expect(await screen.findByRole("button", { name: /running…/i })).toBeDisabled();
    release(ok({ report: report() }));
  });

  it("surfaces a server error without pretending the run succeeded", async () => {
    routeGets(NOT_RUN);
    const user = userEvent.setup();

    render(<ImpactAnalysisPanel projectId={PROJECT_ID} changeId={CHANGE_ID} />);
    await screen.findByText(/No impact analysis has been run/i);

    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === "POST"
        ? fail(422, "IMPACT_ANALYSIS_FAILED", "The analysis could not be completed.")
        : ok({ latest: NOT_RUN }),
    );

    await user.click(screen.getByRole("button", { name: /run impact analysis/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("a completed analysis", () => {
  it("shows when it ran, with which engine, and whether it is current", async () => {
    routeGets(report());

    render(<ImpactAnalysisPanel projectId={PROJECT_ID} changeId={CHANGE_ID} />);

    expect(await screen.findByText("2026-03-01")).toBeInTheDocument();
    expect(screen.getByText("v1")).toBeInTheDocument();
    expect(screen.getByText("Current")).toBeInTheDocument();
  });

  it("renders only counts the server returned", async () => {
    routeGets(report());

    render(<ImpactAnalysisPanel projectId={PROJECT_ID} changeId={CHANGE_ID} />);

    // "Declared" is also a finding's path button, so scope to the summary list.
    const summary = within(await screen.findByLabelText("Impact summary"));

    expect(within(summary.getByText("Declared").closest("div")!).getByText("1")).toBeInTheDocument();
    expect(
      within(summary.getByText("Cross-domain").closest("div")!).getByText("2"),
    ).toBeInTheDocument();
    expect(
      within(summary.getByText("Not evaluated").closest("div")!).getByText("0"),
    ).toBeInTheDocument();
  });

  it("lists each finding with its classification, depth and status", async () => {
    routeGets(report());

    render(<ImpactAnalysisPanel projectId={PROJECT_ID} changeId={CHANGE_ID} />);

    const row = (await screen.findByRole("link", { name: "DI-001" })).closest("tr")!;
    expect(within(row).getByText("Design item")).toBeInTheDocument();
    expect(within(row).getByText("Cross-domain")).toBeInTheDocument();
    expect(within(row).getByText("Potentially affected")).toBeInTheDocument();
  });

  it("links a finding to the affected object", async () => {
    routeGets(report());

    render(<ImpactAnalysisPanel projectId={PROJECT_ID} changeId={CHANGE_ID} />);

    expect(await screen.findByRole("link", { name: "DI-001" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/design-items/${DESIGN_ID}`,
    );
    expect(screen.getByRole("link", { name: "VA-001" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/verification/${VERIFICATION_ID}`,
    );
  });

  it("shows the real path when a finding is opened", async () => {
    routeGets(report());
    const user = userEvent.setup();

    render(<ImpactAnalysisPanel projectId={PROJECT_ID} changeId={CHANGE_ID} />);

    const row = (await screen.findByRole("link", { name: "DI-001" })).closest("tr")!;
    await user.click(within(row).getByRole("button"));

    expect(await screen.findByText("REQUIREMENT_ALLOCATED_TO_DESIGN")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Path" })).toBeInTheDocument();
  });

  it("says a declared finding involved no traversal", async () => {
    routeGets(report());
    const user = userEvent.setup();

    render(<ImpactAnalysisPanel projectId={PROJECT_ID} changeId={CHANGE_ID} />);

    const row = (await screen.findByRole("link", { name: "REQ-001" })).closest("tr")!;
    await user.click(within(row).getByRole("button", { name: /declared/i }));

    expect(await screen.findByText(/no traversal was involved/i)).toBeInTheDocument();
  });

  it("shows what the engine deliberately did not evaluate", async () => {
    routeGets(report());
    const user = userEvent.setup();

    render(<ImpactAnalysisPanel projectId={PROJECT_ID} changeId={CHANGE_ID} />);

    const row = (await screen.findByRole("link", { name: "VA-001" })).closest("tr")!;
    await user.click(within(row).getByRole("button"));

    // Reaching a verification activity is not a claim that it failed.
    expect(await screen.findByText("verification outcome not evaluated")).toBeInTheDocument();
    expect(screen.getByText("verification activity affected")).toBeInTheDocument();
  });

  it("presents no score, confidence or severity anywhere", async () => {
    routeGets(report());

    render(<ImpactAnalysisPanel projectId={PROJECT_ID} changeId={CHANGE_ID} />);
    await screen.findByRole("table");

    expect(screen.queryByText(/risk score/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/confidence/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/severity/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/blast radius/i)).not.toBeInTheDocument();
  });

  it("says plainly when an analysis reached nothing", async () => {
    routeGets(
      report({
        findings: [],
        analysis: {
          ...report().analysis,
          summary: { ...report().analysis.summary, findings: 0, direct: 0, crossDomain: 0 },
        },
      }),
    );

    render(<ImpactAnalysisPanel projectId={PROJECT_ID} changeId={CHANGE_ID} />);

    expect(
      await screen.findByText(/reached nothing beyond the change's declared scope/i),
    ).toBeInTheDocument();
  });
});

describe("staleness", () => {
  it("says the analysis is stale and explains why", async () => {
    routeGets(report({ freshness: "STALE" }));

    render(<ImpactAnalysisPanel projectId={PROJECT_ID} changeId={CHANGE_ID} />);

    expect(await screen.findByText("Analysis is stale.")).toBeInTheDocument();
    expect(
      screen.getByText(/engineering graph changed after this analysis was run/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Stale")).toBeInTheDocument();
  });

  it("still shows the stale findings rather than hiding them", async () => {
    routeGets(report({ freshness: "STALE" }));

    render(<ImpactAnalysisPanel projectId={PROJECT_ID} changeId={CHANGE_ID} />);

    expect(await screen.findByRole("link", { name: "DI-001" })).toBeInTheDocument();
  });

  it("does not rerun automatically — it offers the action", async () => {
    routeGets(report({ freshness: "STALE" }));

    render(<ImpactAnalysisPanel projectId={PROJECT_ID} changeId={CHANGE_ID} />);
    await screen.findByText("Analysis is stale.");

    expect(fetchMock.mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true);
    expect(screen.getByRole("button", { name: /run new analysis/i })).toBeInTheDocument();
  });
});

describe("partial and failed results", () => {
  it("says the result is partial when a limit stopped the walk", async () => {
    routeGets(
      report({
        analysis: {
          ...report().analysis,
          limits: {
            maxDepth: 1,
            maxNodes: 200,
            maxEdges: 1000,
            truncated: true,
            truncatedBy: "MAX_DEPTH",
          },
        },
      }),
    );

    render(<ImpactAnalysisPanel projectId={PROJECT_ID} changeId={CHANGE_ID} />);

    expect(await screen.findByText(/stopped at its depth limit of 1/i)).toBeInTheDocument();
    expect(screen.getByText(/were not examined/i)).toBeInTheDocument();
  });

  it("shows a failed run as failed", async () => {
    routeGets(
      report({
        analysis: {
          ...report().analysis,
          status: "FAILED",
          failureReason: "The analysis could not be completed.",
        },
        findings: [],
      }),
    );

    render(<ImpactAnalysisPanel projectId={PROJECT_ID} changeId={CHANGE_ID} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not be completed/i);
  });
});

describe("load failure", () => {
  it("surfaces the error with a retry", async () => {
    fetchMock.mockImplementation(async () =>
      fail(500, "INTERNAL_ERROR", "Database unavailable"),
    );

    render(<ImpactAnalysisPanel projectId={PROJECT_ID} changeId={CHANGE_ID} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/went wrong on the server/i);
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
