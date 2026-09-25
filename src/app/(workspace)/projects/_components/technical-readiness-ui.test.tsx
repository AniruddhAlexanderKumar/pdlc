import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The technical-readiness workspace, driven through the real API client with a
 * faked `fetch`. Only the network is replaced, so what the panel renders is
 * exactly what the server said — nothing is derived in the browser, and no
 * count is asserted that the fixture did not carry.
 */

/** The panel reads `?gate=` so a link can open it on a specific gate. Empty unless a test sets it. */
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({ useSearchParams: () => searchParams }));

const { TechnicalReadinessPanel } = await import("./technical-readiness-panel");

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";
const ASSESSMENT_ID = "tra1aaaaaaaaaaaaaaaaaa";
const OLDER_ASSESSMENT_ID = "tra0aaaaaaaaaaaaaaaaaa";
const REQUIREMENT_ID = "req1aaaaaaaaaaaaaaaaaa";
const ACTIVITY_ID = "va1aaaaaaaaaaaaaaaaaaa";
const CHANGE_ID = "chg1aaaaaaaaaaaaaaaaaa";
const DECISION_ID = "ed1aaaaaaaaaaaaaaaaaaa";
const ASSUMPTION_ID = "asm1aaaaaaaaaaaaaaaaa";

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

function notEvaluated(gate = "SYSTEM_DEFINITION") {
  return {
    status: "NOT_EVALUATED",
    projectId: PROJECT_ID,
    gate,
    readinessVersion: "1",
  };
}

const BLOCKING_FINDING = {
  id: "finding-blocking",
  assessmentId: ASSESSMENT_ID,
  ruleId: "TR-REQ-002",
  category: "REQUIREMENT",
  status: "BLOCKING",
  severity: "BLOCKER",
  subjectType: "REQUIREMENT",
  subjectId: REQUIREMENT_ID,
  subjectIdentifier: "REQ-104",
  subjectLabel: "Maximum chamber pressure",
  message:
    "Requirement REQ-104 is DRAFT. It has not been through review, so nothing downstream of it can be relied on at the system definition gate.",
  basis: ["REQUIREMENT_LIFECYCLE_STATE"],
  sequence: 0,
  createdAt: "2026-03-01T00:00:00.000Z",
};

const UNKNOWN_FINDING = {
  id: "finding-unknown",
  assessmentId: ASSESSMENT_ID,
  ruleId: "TR-ASM-004",
  category: "ASSUMPTION",
  status: "UNKNOWN",
  severity: "INDETERMINATE",
  subjectType: "DECISION_ASSUMPTION",
  subjectId: ASSUMPTION_ID,
  subjectIdentifier: null,
  subjectLabel: "Nozzle wall temperature stays below 900 K",
  message:
    'Assumption "Nozzle wall temperature stays below 900 K" behind decision ED-001 has never been monitored, so nobody has checked whether what it stands on still holds.',
  basis: ["ASSUMPTION_MONITORING_NOT_EVALUATED"],
  sequence: 1,
  createdAt: "2026-03-01T00:00:00.000Z",
};

const WARNING_FINDING = {
  id: "finding-warning",
  assessmentId: ASSESSMENT_ID,
  ruleId: "TR-TRC-002",
  category: "TRACEABILITY",
  status: "WARNING",
  severity: "ADVISORY",
  subjectType: "REQUIREMENT",
  subjectId: REQUIREMENT_ID,
  subjectIdentifier: "REQ-104",
  subjectLabel: "Maximum chamber pressure",
  message: "Requirement REQ-104 is not allocated to any design item.",
  basis: ["REQUIREMENT_DESIGN_LINK", "TRACEABILITY_GAP"],
  sequence: 2,
  createdAt: "2026-03-01T00:00:00.000Z",
};

const INFORMATIONAL_FINDING = {
  id: "finding-info",
  assessmentId: ASSESSMENT_ID,
  ruleId: "TR-SCP-001",
  category: "UNKNOWN",
  status: "INFORMATIONAL",
  severity: "NOTE",
  subjectType: "PROJECT",
  subjectId: PROJECT_ID,
  subjectIdentifier: null,
  subjectLabel: "Upper Stage Propulsion",
  message:
    "Evaluated the current active engineering scope: 1 requirement(s), 1 design item(s), 1 decision(s).",
  basis: ["PROJECT_SCOPE"],
  sequence: 3,
  createdAt: "2026-03-01T00:00:00.000Z",
};

const SCOPE = {
  gate: "SYSTEM_DEFINITION",
  label: "Current active engineering scope",
  counts: {
    REQUIREMENT: 1,
    DESIGN_ITEM: 1,
    ENGINEERING_DECISION: 1,
    DECISION_ASSUMPTION: 1,
    VERIFICATION_ACTIVITY: 1,
    STAKEHOLDER_NEED: 0,
    EVIDENCE: 0,
    CHANGE_REQUEST: 1,
    RISK: 0,
    ISSUE: 0,
  },
  objects: [
    {
      role: "REQUIREMENT",
      type: "REQUIREMENT",
      id: REQUIREMENT_ID,
      identifier: "REQ-104",
      state: "DRAFT",
      revision: "2026-02-01T00:00:00.000Z",
    },
  ],
  relationships: [
    {
      edgeType: "REQUIREMENT_ALLOCATED_TO_DESIGN",
      relationshipId: "rel1",
      fromType: "REQUIREMENT",
      fromId: REQUIREMENT_ID,
      toType: "DESIGN_ITEM",
      toId: "di1",
    },
  ],
  consumed: {
    verificationReadiness: [
      {
        verificationActivityId: ACTIVITY_ID,
        assessmentId: "vra1",
        status: "NOT_READY",
        freshness: "STALE",
        blockingCount: 2,
      },
    ],
    changeImpact: [
      {
        changeRequestId: CHANGE_ID,
        identifier: "CR-014",
        status: "UNDER_REVIEW",
        analysisId: "ana1",
        analysisFreshness: "STALE",
        reachedScopeKeys: [`REQUIREMENT:${REQUIREMENT_ID}`],
      },
    ],
    assumptionMonitoring: [
      {
        assumptionId: ASSUMPTION_ID,
        decisionId: DECISION_ID,
        monitoringStatus: "REVIEW_REQUIRED",
        assumptionStatus: "VALIDATED",
      },
    ],
  },
};

function assessment(overrides: Record<string, unknown> = {}) {
  return {
    id: ASSESSMENT_ID,
    projectId: PROJECT_ID,
    gate: "SYSTEM_DEFINITION",
    status: "NOT_READY",
    readinessVersion: "1",
    fingerprint: "fingerprint-a",
    summary: { findings: 4, blocking: 1, warning: 1, informational: 1, unknown: 1 },
    evaluatedAt: "2026-03-01T00:00:00.000Z",
    evaluatedById: "user1",
    createdAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

function report(overrides: Record<string, unknown> = {}) {
  // `assessment` is merged rather than replaced, so a test that overrides one
  // field of it does not silently drop the summary the panel renders.
  const { assessment: assessmentOverrides, ...rest } = overrides;

  return {
    assessment: assessment((assessmentOverrides as Record<string, unknown>) ?? {}),
    freshness: "CURRENT",
    findings: [BLOCKING_FINDING, UNKNOWN_FINDING, WARNING_FINDING, INFORMATIONAL_FINDING],
    scope: SCOPE,
    ...rest,
  };
}

const fetchMock = vi.fn();

/** Routes the two GETs the panel issues for the selected gate. */
function routeGets(latest: unknown, assessments: unknown[] = []) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("/technical-readiness/latest")) return ok({ latest });
    if (/\/technical-readiness(\?|$)/.test(url)) return ok({ assessments });
    if (url.includes("/technical-readiness/")) return ok({ report: report() });
    return fail(404, "NOT_FOUND", "No route");
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  searchParams = new URLSearchParams();
});

// --- Arriving from a link ---------------------------------------------------

/**
 * The project page's "next step" panel sends the release stage here with
 * `?gate=RELEASE_READY#release-check`. Without honouring that, the link would
 * land on "System definition" and leave the reader to find "Release ready" in
 * a list of five — the kind of hunting the next-step panel exists to remove.
 */
describe("arriving from a link", () => {
  it("opens on the gate the link asks for", async () => {
    searchParams = new URLSearchParams("gate=RELEASE_READY");
    routeGets(notEvaluated());

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);

    expect(await screen.findByLabelText("Gate")).toHaveValue("RELEASE_READY");
  });

  it("ignores a gate that does not exist, rather than asking the server for it", async () => {
    searchParams = new URLSearchParams("gate=ANYTHING_ELSE");
    routeGets(notEvaluated());

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);

    expect(await screen.findByLabelText("Gate")).toHaveValue("SYSTEM_DEFINITION");
    expect(fetchMock.mock.calls.some((call) => String(call[0]).includes("ANYTHING_ELSE"))).toBe(false);
  });

  /**
   * The link and the panel are on the same page, so following it changes
   * only the query string and nothing remounts. A new link must still win
   * over a choice the reader made before following it.
   */
  it("follows a new link even after the reader picked a different gate", async () => {
    routeGets(notEvaluated());
    const user = userEvent.setup();
    const view = render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);

    await user.selectOptions(await screen.findByLabelText("Gate"), "DESIGN_FREEZE");
    expect(screen.getByLabelText("Gate")).toHaveValue("DESIGN_FREEZE");

    searchParams = new URLSearchParams("gate=RELEASE_READY");
    view.rerender(<TechnicalReadinessPanel projectId={PROJECT_ID} />);

    expect(screen.getByLabelText("Gate")).toHaveValue("RELEASE_READY");
  });

  it("carries the anchor the next-step panel links to", async () => {
    routeGets(notEvaluated());
    const { container } = render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);
    await screen.findByLabelText("Gate");

    expect(container.querySelector("#release-check")).not.toBeNull();
  });
});

// --- Gate selector ----------------------------------------------------------

describe("the gate selector", () => {
  it("offers the five internal gates", async () => {
    routeGets(notEvaluated());

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);

    const select = await screen.findByLabelText("Gate");
    const options = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual([
      "System definition",
      "Design review",
      "Design freeze",
      "Verification ready",
      "Release ready",
    ]);
  });

  it("states the question the selected gate answers", async () => {
    routeGets(notEvaluated());

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);

    expect(
      await screen.findByText(/Is what the product must do recorded, controlled and traceable/i),
    ).toBeInTheDocument();
  });

  it("re-reads for a different gate without evaluating it", async () => {
    routeGets(notEvaluated());
    const user = userEvent.setup();

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);
    await screen.findByLabelText("Gate");

    await user.selectOptions(screen.getByLabelText("Gate"), "RELEASE_READY");

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) => String(call[0]).includes("gate=RELEASE_READY")),
      ).toBe(true);
    });
    // Changing the question must not answer it.
    const posts = fetchMock.mock.calls.filter(
      (call) => (call[1] as RequestInit | undefined)?.method === "POST",
    );
    expect(posts).toHaveLength(0);
  });

  it("says the gate is not certification", async () => {
    routeGets(notEvaluated());

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);

    expect(await screen.findByText(/they are not certification/i)).toBeInTheDocument();
  });
});

// --- No assessment ----------------------------------------------------------

describe("when a gate has not been evaluated", () => {
  it("says so rather than showing a zero or a hundred per cent", async () => {
    routeGets(notEvaluated());

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);

    expect(
      await screen.findByText(/The system definition gate has not been assessed/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Gate finding counts")).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("offers an explicit evaluate action", async () => {
    routeGets(notEvaluated());

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);

    expect(await screen.findByRole("button", { name: /evaluate gate/i })).toBeInTheDocument();
  });

  it("does not evaluate on its own", async () => {
    routeGets(notEvaluated());

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);
    await screen.findByText(/has not been assessed/i);

    const posts = fetchMock.mock.calls.filter(
      (call) => (call[1] as RequestInit | undefined)?.method === "POST",
    );
    expect(posts).toHaveLength(0);
  });
});

// --- The three verdicts -----------------------------------------------------

describe("the gate verdict", () => {
  it("shows NOT READY with the gate it answered", async () => {
    routeGets(report(), [assessment()]);

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);

    const verdict = within(await screen.findByRole("group", { name: "Gate verdict" }));
    expect(verdict.getByText("Not ready")).toBeInTheDocument();
    expect(verdict.getByText("System definition")).toBeInTheDocument();
  });

  it("shows READY without implying the gate has been held", async () => {
    routeGets(
      report({ assessment: { status: "READY" }, findings: [INFORMATIONAL_FINDING] }),
      [assessment({ status: "READY" })],
    );

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);

    const verdict = within(await screen.findByRole("group", { name: "Gate verdict" }));
    expect(verdict.getByText("Ready")).toBeInTheDocument();
    expect(verdict.getByText(/not a decision to hold it/i)).toBeInTheDocument();
    expect(verdict.getByText(/not certification/i)).toBeInTheDocument();
  });

  it("shows UNKNOWN, and says readiness is not being claimed", async () => {
    routeGets(
      report({ assessment: { status: "UNKNOWN" }, findings: [UNKNOWN_FINDING] }),
      [assessment({ status: "UNKNOWN" })],
    );

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);

    const verdict = within(await screen.findByRole("group", { name: "Gate verdict" }));
    expect(verdict.getByText("Unknown")).toBeInTheDocument();
    expect(
      verdict.getByText(/not being claimed on information that is missing/i),
    ).toBeInTheDocument();
  });
});

// --- Findings ---------------------------------------------------------------

describe("findings", () => {
  it("renders the rule, category, status, subject and explanation the server sent", async () => {
    routeGets(report(), [assessment()]);

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);

    const row = (await screen.findByText("TR-REQ-002")).closest("tr");
    expect(row).not.toBeNull();
    const cells = within(row as HTMLElement);
    expect(cells.getByText("Requirement")).toBeInTheDocument();
    expect(cells.getByText("Blocking")).toBeInTheDocument();
    expect(cells.getByRole("link", { name: "REQ-104" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/requirements/${REQUIREMENT_ID}`,
    );
    expect(cells.getByText(/Requirement REQ-104 is DRAFT/)).toBeInTheDocument();
  });

  it("distinguishes blocking, warning, unknown and informational", async () => {
    routeGets(report(), [assessment()]);

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);
    await screen.findByText("TR-REQ-002");

    const table = screen.getByRole("table");
    expect(within(table).getByText("Blocking")).toBeInTheDocument();
    expect(within(table).getByText("Warning")).toBeInTheDocument();
    expect(within(table).getByText("Unknown")).toBeInTheDocument();
    expect(within(table).getByText("Information")).toBeInTheDocument();
  });

  it("shows the counts the server reported, and no other figure", async () => {
    routeGets(report(), [assessment()]);

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);

    const counts = await screen.findByLabelText("Gate finding counts");
    expect(within(counts).getByText("Blocking")).toBeInTheDocument();
    // Exactly what the fixture's summary said: one of each.
    expect(within(counts).getAllByText("1")).toHaveLength(4);
    expect(within(counts).queryByText(/%/)).not.toBeInTheDocument();
  });

  it("explains a finding's rule, gates and basis on demand", async () => {
    routeGets(report(), [assessment()]);
    const user = userEvent.setup();

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);
    await screen.findByText("TR-REQ-002");

    const row = screen.getByText("TR-REQ-002").closest("tr") as HTMLElement;
    await user.click(within(row).getByRole("button", { name: /why/i }));

    expect(await screen.findByText("Rule TR-REQ-002")).toBeInTheDocument();
    expect(screen.getByText(/Condition:/)).toBeInTheDocument();
    expect(screen.getByText(/Evaluated at:/)).toBeInTheDocument();
    expect(screen.getByText("requirement lifecycle state")).toBeInTheDocument();
  });

  it("never renders a percentage or a score", async () => {
    routeGets(report(), [assessment()]);

    const { container } = render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);
    await screen.findByText("TR-REQ-002");

    expect(container.textContent).not.toMatch(/\d+\s*%/);
  });
});

// --- Scope ------------------------------------------------------------------

describe("the evaluated scope", () => {
  it("names what is being evaluated without inventing a count", async () => {
    routeGets(report(), [assessment()]);

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);

    expect(
      await screen.findByText(/Current active engineering scope — 1 object\(s\)/),
    ).toBeInTheDocument();
  });

  it("lets the reader inspect the counts the engine resolved", async () => {
    routeGets(report(), [assessment()]);
    const user = userEvent.setup();

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);
    await screen.findByText("TR-REQ-002");

    await user.click(screen.getByRole("button", { name: /inspect scope/i }));

    const counts = within(await screen.findByLabelText("Scope counts"));
    expect(counts.getByText("Requirements")).toBeInTheDocument();
    expect(counts.getByText("Design items")).toBeInTheDocument();
    // Roles with nothing in them are not padded with zeroes.
    expect(counts.queryByText("Open risks")).not.toBeInTheDocument();
  });

  it("summarises consumed verification readiness and links to each activity", async () => {
    routeGets(report(), [assessment()]);
    const user = userEvent.setup();

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);
    await screen.findByText("TR-REQ-002");
    await user.click(screen.getByRole("button", { name: /inspect scope/i }));

    expect(await screen.findByText("Verification readiness consumed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Verification activity" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/verification/${ACTIVITY_ID}`,
    );
    // The stale verdict is reported as not current, not read as a pass.
    expect(screen.getByText(/NOT_READY · stale/)).toBeInTheDocument();
    expect(screen.getByText(/were not read as current/i)).toBeInTheDocument();
  });

  it("surfaces the change impact it consumed and links to the change", async () => {
    routeGets(report(), [assessment()]);
    const user = userEvent.setup();

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);
    await screen.findByText("TR-REQ-002");
    await user.click(screen.getByRole("button", { name: /inspect scope/i }));

    expect(await screen.findByText("Change impact consumed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "CR-014" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/changes/${CHANGE_ID}`,
    );
    expect(screen.getByText(/impact analysis: stale/i)).toBeInTheDocument();
  });

  it("surfaces assumptions requiring review and links to the decision", async () => {
    routeGets(report(), [assessment()]);
    const user = userEvent.setup();

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);
    await screen.findByText("TR-REQ-002");
    await user.click(screen.getByRole("button", { name: /inspect scope/i }));

    expect(await screen.findByText("Assumption monitoring consumed")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Assumption on decision" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/decisions/${DECISION_ID}`,
    );
    expect(screen.getByText(/review required · recorded validated/i)).toBeInTheDocument();
    // The engine does not change an assumption's status.
    expect(screen.getByText(/Their status is unchanged/i)).toBeInTheDocument();
  });
});

// --- Stale ------------------------------------------------------------------

describe("a stale assessment", () => {
  it("says it is stale and explains why", async () => {
    routeGets(report({ freshness: "STALE" }), [assessment()]);

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);

    expect(await screen.findByText(/Gate assessment is stale/i)).toBeInTheDocument();
    expect(
      screen.getByText(/engineering state this gate was assessed against has changed/i),
    ).toBeInTheDocument();
  });

  it("offers a re-evaluation instead of performing one", async () => {
    routeGets(report({ freshness: "STALE" }), [assessment()]);

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);
    await screen.findByText(/Gate assessment is stale/i);

    expect(screen.getByRole("button", { name: /evaluate again/i })).toBeInTheDocument();
    const posts = fetchMock.mock.calls.filter(
      (call) => (call[1] as RequestInit | undefined)?.method === "POST",
    );
    expect(posts).toHaveLength(0);
  });

  it("still shows the stored verdict rather than hiding it", async () => {
    routeGets(report({ freshness: "STALE" }), [assessment()]);

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);

    const verdict = within(await screen.findByRole("group", { name: "Gate verdict" }));
    expect(verdict.getByText("Not ready")).toBeInTheDocument();
    expect(screen.getByText("Stale")).toBeInTheDocument();
  });

  it("does not present an unknown freshness as current", async () => {
    routeGets(report({ freshness: "UNKNOWN" }), [assessment()]);

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);

    expect(await screen.findByText(/could not be determined/i)).toBeInTheDocument();
    expect(screen.getByText(/not being presented as current/i)).toBeInTheDocument();
  });
});

// --- Evaluate action --------------------------------------------------------

describe("the evaluate action", () => {
  it("posts the selected gate and nothing else, then re-reads", async () => {
    routeGets(report(), [assessment()]);
    const user = userEvent.setup();

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);
    await screen.findByText("TR-REQ-002");

    fetchMock.mockClear();
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return ok({ report: report() });
      if (url.includes("/technical-readiness/latest")) return ok({ latest: report() });
      if (/\/technical-readiness(\?|$)/.test(url)) return ok({ assessments: [assessment()] });
      return fail(404, "NOT_FOUND", "No route");
    });

    await user.click(screen.getByRole("button", { name: /evaluate gate/i }));

    await waitFor(() => {
      const posts = fetchMock.mock.calls.filter(
        (call) => (call[1] as RequestInit | undefined)?.method === "POST",
      );
      expect(posts).toHaveLength(1);
      expect(posts[0]?.[0]).toBe(`/api/projects/${PROJECT_ID}/technical-readiness`);
      // The gate, and nothing else — no verdict, no rules.
      expect(posts[0]?.[1]?.body).toBe(JSON.stringify({ gate: "SYSTEM_DEFINITION" }));
    });

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some((call) =>
          String(call[0]).includes("/technical-readiness/latest"),
        ),
      ).toBe(true);
    });
  });

  it("reports a server error without fabricating a verdict", async () => {
    routeGets(report(), [assessment()]);
    const user = userEvent.setup();

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);
    await screen.findByText("TR-REQ-002");

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return fail(422, "TECHNICAL_READINESS_FAILED", "The evaluation could not complete.");
      }
      if (url.includes("/technical-readiness/latest")) return ok({ latest: report() });
      if (/\/technical-readiness(\?|$)/.test(url)) return ok({ assessments: [assessment()] });
      return fail(404, "NOT_FOUND", "No route");
    });

    await user.click(screen.getByRole("button", { name: /evaluate gate/i }));

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    // The previous assessment is still shown, unchanged.
    const verdict = within(screen.getByRole("group", { name: "Gate verdict" }));
    expect(verdict.getByText("Not ready")).toBeInTheDocument();
  });

  it("surfaces a failed initial load with a retry", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/technical-readiness/latest")) {
        return fail(500, "INTERNAL_ERROR", "Something went wrong");
      }
      return ok({ assessments: [] });
    });

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);

    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});

// --- History ----------------------------------------------------------------

describe("history", () => {
  it("lists prior assessments with their gate, date, result and version", async () => {
    routeGets(report(), [
      assessment(),
      assessment({
        id: OLDER_ASSESSMENT_ID,
        status: "READY",
        evaluatedAt: "2026-02-01T00:00:00.000Z",
      }),
    ]);

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);

    expect(await screen.findByText("History")).toBeInTheDocument();
    expect(screen.getAllByText("System definition").length).toBeGreaterThan(0);
    expect(screen.getAllByText("v1").length).toBeGreaterThan(0);
    expect(screen.getByText("Latest")).toBeInTheDocument();
    expect(screen.getByText(/Assessments are immutable/i)).toBeInTheDocument();
  });

  it("opens a historical assessment read-only", async () => {
    routeGets(report(), [
      assessment(),
      assessment({
        id: OLDER_ASSESSMENT_ID,
        status: "READY",
        evaluatedAt: "2026-02-01T00:00:00.000Z",
      }),
    ]);
    const user = userEvent.setup();

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);
    await screen.findByText("History");

    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes(`/technical-readiness/${OLDER_ASSESSMENT_ID}`)) {
        return ok({
          report: report({
            assessment: { id: OLDER_ASSESSMENT_ID, status: "READY" },
            freshness: "STALE",
          }),
        });
      }
      return fail(404, "NOT_FOUND", "No route");
    });

    const openButtons = screen.getAllByRole("button", { name: /^Open/ });
    await user.click(openButtons[openButtons.length - 1] as HTMLElement);

    expect(await screen.findByText(/Viewing a historical assessment/i)).toBeInTheDocument();
    expect(screen.getByText(/cannot be edited/i)).toBeInTheDocument();
  });

  it("offers no way to edit or delete an old assessment", async () => {
    routeGets(report(), [assessment()]);

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);
    await screen.findByText("History");

    expect(screen.queryByRole("button", { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /delete/i })).not.toBeInTheDocument();
  });

  it("shows no history section before a gate has been evaluated", async () => {
    routeGets(notEvaluated(), []);

    render(<TechnicalReadinessPanel projectId={PROJECT_ID} />);
    await screen.findByText(/has not been assessed/i);

    expect(screen.queryByText("History")).not.toBeInTheDocument();
  });
});
