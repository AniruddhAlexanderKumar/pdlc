import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Decision memory UI driven through the real API client with a faked `fetch`.
 * Only the network is replaced, so request shapes and server-driven state are
 * genuinely exercised.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

const { DecisionsView } = await import("./decisions-view");
const { DecisionDetailView } = await import("./decision-detail-view");

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";
const DECISION_ID = "dec1aaaaaaaaaaaaaaaaaaa";

const PROJECT = {
  id: PROJECT_ID,
  organizationId: "org1",
  name: "Upper Stage Propulsion",
  description: null,
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const MEMBERS = [
  { id: "user1aaaaaaaaaaaaaaaaaaa", name: "Ada Lovelace", email: "ada@example.test" },
  { id: "user2aaaaaaaaaaaaaaaaaaa", name: "Grace Hopper", email: "grace@example.test" },
];

const LINK_TARGETS = {
  REQUIREMENT: [{ id: "req1", identifier: "REQ-001", title: "Chamber pressure" }],
  DESIGN_ITEM: [{ id: "design1", identifier: "DI-001", title: "Combustion chamber" }],
  RISK: [],
  ISSUE: [],
  EVIDENCE: [],
};

function decision(overrides: Record<string, unknown> = {}) {
  return {
    id: DECISION_ID,
    projectId: PROJECT_ID,
    identifier: "ED-001",
    title: "Use regenerative cooling",
    statement: "The chamber will be regeneratively cooled.",
    rationale: "Ablative liner mass was prohibitive.",
    status: "PROPOSED",
    ownerId: null,
    owner: null,
    decidedAt: null,
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
    ...overrides,
  };
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    ...decision(),
    alternatives: [],
    assumptions: [],
    expectation: null,
    links: [],
    availableTransitions: ["UNDER_REVIEW", "REJECTED"],
    editable: { content: true, owner: true, assumptions: true, links: true },
    history: [],
    ...overrides,
  };
}

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

const fetchMock = vi.fn();

function routeGets(overrides: { decisions?: unknown[]; detail?: unknown } = {}) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("/decision-link-targets")) return ok({ targets: LINK_TARGETS });
    if (url.includes("/organization/members")) return ok({ members: MEMBERS });
    if (url.endsWith(`/decisions/${DECISION_ID}`)) {
      return ok({ decision: overrides.detail ?? detail() });
    }
    if (url.includes("/decisions")) return ok({ decisions: overrides.decisions ?? [] });
    if (url.includes("/api/projects/")) return ok({ project: PROJECT });
    return ok({});
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  push.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("DecisionsView", () => {
  it("shows a genuine empty state rather than a fabricated count", async () => {
    routeGets();

    render(<DecisionsView projectId={PROJECT_ID} />);

    expect(await screen.findByText("No decisions recorded yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders decisions with status, owner and decided date", async () => {
    routeGets({
      decisions: [
        decision({ status: "APPROVED", decidedAt: "2026-02-01T00:00:00.000Z", owner: MEMBERS[0] }),
      ],
    });

    render(<DecisionsView projectId={PROJECT_ID} />);

    const row = (await screen.findByRole("link", { name: "ED-001" })).closest("tr")!;
    expect(within(row).getByText("Use regenerative cooling")).toBeInTheDocument();
    expect(within(row).getByText("Approved")).toBeInTheDocument();
    expect(within(row).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(row).getByText("2026-02-01")).toBeInTheDocument();
  });

  it("filters by status through the API", async () => {
    routeGets({ decisions: [decision()] });
    const user = userEvent.setup();

    render(<DecisionsView projectId={PROJECT_ID} />);
    await screen.findByRole("link", { name: "ED-001" });

    await user.selectOptions(screen.getByLabelText("Status"), "APPROVED");

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("status=APPROVED"))).toBe(
        true,
      ),
    );
  });

  it("validates the create form before calling the API", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<DecisionsView projectId={PROJECT_ID} />);
    await screen.findByText("No decisions recorded yet");

    await user.click(screen.getAllByRole("button", { name: /new decision/i })[0]!);
    await user.click(await screen.findByRole("button", { name: /create decision/i }));

    expect(await screen.findByText("A decision title is required")).toBeInTheDocument();
    expect(screen.getByText("A decision must record its rationale")).toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true);
  });

  it(
    "creates a decision and navigates to it",
    async () => {
      routeGets();
      const user = userEvent.setup();

      render(<DecisionsView projectId={PROJECT_ID} />);
      await screen.findByText("No decisions recorded yet");

      await user.click(screen.getAllByRole("button", { name: /new decision/i })[0]!);
      await user.type(await screen.findByLabelText(/identifier/i), "ED-001");
      await user.type(screen.getByLabelText(/^Title/), "Use regenerative cooling");
      await user.type(screen.getByLabelText(/^Statement/), "The chamber will be cooled.");
      await user.type(screen.getByLabelText(/^Rationale/), "Ablative mass was prohibitive.");

      fetchMock.mockImplementationOnce(async () => ok({ decision: decision() }));
      await user.click(screen.getByRole("button", { name: /create decision/i }));

      await waitFor(() =>
        expect(push).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/decisions/${DECISION_ID}`),
      );

      const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
      const payload = JSON.parse(post![1].body);
      expect(payload).not.toHaveProperty("status");
      expect(payload).not.toHaveProperty("organizationId");
    },
    // Four sequential user.type() calls across ~90 characters is the
    // heaviest single interaction sequence in this file — realistic,
    // per-keystroke userEvent simulation over that much text is close
    // enough to Vitest's default 5000ms budget that it has intermittently
    // exceeded it under full-suite parallel load (see Prompt 27/28's
    // regression checks; the test's own logic and assertions are
    // unchanged — this raises only how long it is allowed to take).
    15_000,
  );
});

describe("DecisionDetailView", () => {
  it("shows what was decided and why", async () => {
    routeGets();

    render(<DecisionDetailView projectId={PROJECT_ID} decisionId={DECISION_ID} />);

    expect(await screen.findByRole("heading", { name: /ED-001/ })).toBeInTheDocument();
    expect(screen.getByText("What was decided")).toBeInTheDocument();
    expect(screen.getByText("The chamber will be regeneratively cooled.")).toBeInTheDocument();
    expect(screen.getByText("Ablative liner mass was prohibitive.")).toBeInTheDocument();
  });

  it("offers only the transitions the server says are legal", async () => {
    routeGets();

    render(<DecisionDetailView projectId={PROJECT_ID} decisionId={DECISION_ID} />);
    await screen.findByRole("heading", { name: /ED-001/ });

    expect(screen.getByRole("button", { name: "Begin review" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reject" })).toBeInTheDocument();
    // Approval is not reachable straight from PROPOSED.
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Supersede" })).not.toBeInTheDocument();
  });

  it("transitions through the API", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<DecisionDetailView projectId={PROJECT_ID} decisionId={DECISION_ID} />);
    await screen.findByRole("heading", { name: /ED-001/ });

    fetchMock.mockImplementationOnce(async () =>
      ok({ decision: decision({ status: "UNDER_REVIEW" }) }),
    );
    await user.click(screen.getByRole("button", { name: "Begin review" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/transition"));
      expect(JSON.parse(call![1].body).to).toBe("UNDER_REVIEW");
    });
  });

  it("displays a rejected transition without changing the shown status", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<DecisionDetailView projectId={PROJECT_ID} decisionId={DECISION_ID} />);
    await screen.findByRole("heading", { name: /ED-001/ });

    fetchMock.mockImplementationOnce(async () =>
      fail(409, "CONFLICT", "A decision in PROPOSED cannot move to APPROVED."),
    );
    await user.click(screen.getByRole("button", { name: "Begin review" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/cannot move to APPROVED/);
    expect(screen.getByText("Proposed")).toBeInTheDocument();
  });

  it("presents alternatives as rejected history, with their reason", async () => {
    routeGets({
      detail: detail({
        alternatives: [
          {
            id: "alt1",
            engineeringDecisionId: DECISION_ID,
            title: "Ablative liner",
            description: "Consumable liner.",
            reasonRejected: "Mass and refurbishment cost.",
            createdAt: "2026-01-03T00:00:00.000Z",
            updatedAt: "2026-01-03T00:00:00.000Z",
          },
        ],
      }),
    });

    render(<DecisionDetailView projectId={PROJECT_ID} decisionId={DECISION_ID} />);

    expect(await screen.findByText("Ablative liner")).toBeInTheDocument();
    expect(screen.getByText(/Rejected because:/)).toBeInTheDocument();
    expect(screen.getByText("Mass and refurbishment cost.")).toBeInTheDocument();
  });

  it("adds an alternative through the API", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<DecisionDetailView projectId={PROJECT_ID} decisionId={DECISION_ID} />);
    await screen.findByRole("heading", { name: /ED-001/ });

    await user.click(screen.getByRole("button", { name: /add alternative/i }));
    await user.type(await screen.findByLabelText(/^Alternative/), "Ablative liner");

    fetchMock.mockImplementationOnce(async () => ok({ alternative: {} }));
    await user.click(screen.getByRole("button", { name: "Add alternative" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) => String(url).includes("/alternatives") && init?.method === "POST",
      );
      expect(JSON.parse(call![1].body).title).toBe("Ablative liner");
    });
  });

  it("shows assumption status as words and never implies monitoring", async () => {
    routeGets({
      detail: detail({
        assumptions: [
          {
            id: "asm1",
            engineeringDecisionId: DECISION_ID,
            statement: "Coolant flow stays above 2.4 kg/s.",
            status: "UNKNOWN",
            rationale: null,
            createdAt: "2026-01-03T00:00:00.000Z",
            updatedAt: "2026-01-03T00:00:00.000Z",
          },
        ],
      }),
    });

    render(<DecisionDetailView projectId={PROJECT_ID} decisionId={DECISION_ID} />);

    expect(await screen.findByText("Coolant flow stays above 2.4 kg/s.")).toBeInTheDocument();
    // "Not checked" is the honest label for UNKNOWN.
    expect(screen.getAllByText("Not checked").length).toBeGreaterThan(0);
    expect(screen.getByText(/nothing checks them automatically/i)).toBeInTheDocument();
  });

  it("records an explicit assumption validation", async () => {
    routeGets({
      detail: detail({
        assumptions: [
          {
            id: "asm1",
            engineeringDecisionId: DECISION_ID,
            statement: "Coolant flow is sufficient.",
            status: "UNKNOWN",
            rationale: null,
            createdAt: "2026-01-03T00:00:00.000Z",
            updatedAt: "2026-01-03T00:00:00.000Z",
          },
        ],
      }),
    });
    const user = userEvent.setup();

    render(<DecisionDetailView projectId={PROJECT_ID} decisionId={DECISION_ID} />);
    const select = await screen.findByLabelText(/Status for Coolant flow is sufficient/);

    fetchMock.mockImplementationOnce(async () => ok({ assumption: {} }));
    await user.selectOptions(select, "VALIDATED");

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH");
      expect(JSON.parse(call![1].body).status).toBe("VALIDATED");
    });
  });

  it("distinguishes expected from observed", async () => {
    routeGets({
      detail: detail({
        expectation: {
          id: "exp1",
          engineeringDecisionId: DECISION_ID,
          statement: "Wall temperature stays below limit.",
          measure: "Peak wall temperature",
          expectedValue: "< 800",
          unit: "K",
          comparisonOperator: null,
          dueAt: null,
          status: "NOT_OBSERVED",
          actualValue: null,
          observedAt: null,
          createdAt: "2026-01-03T00:00:00.000Z",
          updatedAt: "2026-01-03T00:00:00.000Z",
        },
      }),
    });

    render(<DecisionDetailView projectId={PROJECT_ID} decisionId={DECISION_ID} />);

    expect(await screen.findByText("Expected")).toBeInTheDocument();
    expect(screen.getByText("Observed")).toBeInTheDocument();
    expect(screen.getByText("< 800 K")).toBeInTheDocument();
    // Nothing is asserted about the outcome.
    expect(screen.getByText("Not yet observed")).toBeInTheDocument();
    expect(screen.getByText("Not observed")).toBeInTheDocument();
    // No operator recorded — the drift engine cannot compare this, and the
    // page says so rather than pretending the prose is a real bound.
    expect(screen.getByText(/not mechanically comparable/i)).toBeInTheDocument();
  });

  it("shows the comparison symbol once an explicit operator is recorded", async () => {
    routeGets({
      detail: detail({
        expectation: {
          id: "exp1",
          engineeringDecisionId: DECISION_ID,
          statement: "Wall temperature stays below limit.",
          measure: "Peak wall temperature",
          expectedValue: "800",
          unit: "K",
          comparisonOperator: "LESS_THAN_OR_EQUAL",
          dueAt: null,
          status: "NOT_OBSERVED",
          actualValue: null,
          observedAt: null,
          createdAt: "2026-01-03T00:00:00.000Z",
          updatedAt: "2026-01-03T00:00:00.000Z",
        },
      }),
    });

    render(<DecisionDetailView projectId={PROJECT_ID} decisionId={DECISION_ID} />);

    expect(await screen.findByText("≤ 800 K")).toBeInTheDocument();
    expect(screen.queryByText(/not mechanically comparable/i)).not.toBeInTheDocument();
  });

  it("records an explicit operator, never inferred from the expected-value text", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<DecisionDetailView projectId={PROJECT_ID} decisionId={DECISION_ID} />);
    await screen.findByRole("heading", { name: /ED-001/ });

    await user.click(screen.getByRole("button", { name: /set expectation/i }));
    await user.type(await screen.findByLabelText(/^Expectation/), "Wall temp stays under limit.");
    await user.type(screen.getByLabelText(/Expected value/), "800");
    await user.selectOptions(
      screen.getByLabelText(/Comparison operator/),
      "LESS_THAN_OR_EQUAL",
    );

    fetchMock.mockImplementationOnce(async () => ok({ expectation: {} }));
    await user.click(screen.getByRole("button", { name: /save expectation/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
      const payload = JSON.parse(call![1].body);
      expect(payload.comparisonOperator).toBe("LESS_THAN_OR_EQUAL");
      expect(payload.expectedValue).toBe("800");
    });
  });

  it("defaults to no operator, so an expectation is never silently made comparable", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<DecisionDetailView projectId={PROJECT_ID} decisionId={DECISION_ID} />);
    await screen.findByRole("heading", { name: /ED-001/ });

    await user.click(screen.getByRole("button", { name: /set expectation/i }));
    await user.type(await screen.findByLabelText(/^Expectation/), "Wall temp stays under limit.");

    fetchMock.mockImplementationOnce(async () => ok({ expectation: {} }));
    await user.click(screen.getByRole("button", { name: /save expectation/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
      expect(JSON.parse(call![1].body).comparisonOperator).toBeNull();
    });
  });

  it("records an expectation without inferring an outcome", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<DecisionDetailView projectId={PROJECT_ID} decisionId={DECISION_ID} />);
    await screen.findByRole("heading", { name: /ED-001/ });

    await user.click(screen.getByRole("button", { name: /set expectation/i }));
    await user.type(await screen.findByLabelText(/^Expectation/), "Wall temp stays under limit.");
    await user.type(screen.getByLabelText(/Expected value/), "< 800");

    fetchMock.mockImplementationOnce(async () => ok({ expectation: {} }));
    await user.click(screen.getByRole("button", { name: /save expectation/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, init]) => init?.method === "PUT");
      const payload = JSON.parse(call![1].body);
      expect(payload.expectedValue).toBe("< 800");
      // The default observation state is carried, not a verdict.
      expect(payload.status).toBe("NOT_OBSERVED");
      expect(payload.actualValue).toBeNull();
    });
  });

  it("shows traceability and links a requirement", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<DecisionDetailView projectId={PROJECT_ID} decisionId={DECISION_ID} />);
    await screen.findByRole("heading", { name: /ED-001/ });

    const target = await screen.findByLabelText("Artifact");
    await waitFor(() => expect(within(target).getAllByRole("option").length).toBeGreaterThan(1));
    await user.selectOptions(target, "req1");

    fetchMock.mockImplementationOnce(async () => ok({ links: [] }));
    await user.click(screen.getByRole("button", { name: /add link/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) => String(url).includes("/links") && init?.method === "POST",
      );
      const payload = JSON.parse(call![1].body);
      // A typed relation, not an opaque entity pair.
      expect(payload.relation).toBe("REQUIREMENT");
      expect(payload.targetId).toBe("req1");
    });
  });

  it("shows an honest empty state for relations with no records", async () => {
    routeGets();

    render(<DecisionDetailView projectId={PROJECT_ID} decisionId={DECISION_ID} />);
    await screen.findByRole("heading", { name: /ED-001/ });

    // Risks, issues and evidence have no module yet, so they are empty.
    expect(screen.getAllByText("None linked.")).toHaveLength(5);
  });

  it("renders history readably without dumping metadata JSON", async () => {
    routeGets({
      detail: detail({
        history: [
          {
            id: "audit1",
            action: "decision.status_transitioned",
            createdAt: "2026-01-04T00:00:00.000Z",
            actor: { id: "u1", name: "Ada Lovelace" },
            metadata: { from: "PROPOSED", to: "UNDER_REVIEW" },
          },
        ],
      }),
    });

    render(<DecisionDetailView projectId={PROJECT_ID} decisionId={DECISION_ID} />);

    expect(await screen.findByText("Status changed")).toBeInTheDocument();
    // Statuses read as words, not stored constants.
    expect(screen.getByText(/Ada Lovelace · Proposed → Under review/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('{"from"');
  });

  it("locks the record once approved but keeps assumptions open", async () => {
    routeGets({
      detail: detail({
        status: "APPROVED",
        availableTransitions: ["SUPERSEDED"],
        editable: { content: false, owner: true, assumptions: true, links: true },
      }),
    });

    render(<DecisionDetailView projectId={PROJECT_ID} decisionId={DECISION_ID} />);
    await screen.findByRole("heading", { name: /ED-001/ });

    expect(screen.getByRole("button", { name: /edit/i })).toBeDisabled();
    // Located by its text rather than by being the only role="status" on the
    // page: a sibling panel still loading renders a LoadingState, which is also
    // a status region, so `getByRole("status")` is ambiguous under a slow run.
    // The assertion still checks both that the notice is there and that it is
    // announced as a status.
    const lockNotice = await screen.findByText(
      /statement, rationale and alternatives are fixed/i,
    );
    expect(lockNotice.closest('[role="status"]')).not.toBeNull();
    // Alternatives close with the content…
    expect(screen.queryByRole("button", { name: /add alternative/i })).not.toBeInTheDocument();
    // …but assumptions stay open, which is when they are usually revisited.
    expect(screen.getByRole("button", { name: /add assumption/i })).toBeInTheDocument();
  });

  it("offers nothing further on a superseded decision", async () => {
    routeGets({
      detail: detail({
        status: "SUPERSEDED",
        availableTransitions: [],
        editable: { content: false, owner: false, assumptions: false, links: false },
      }),
    });

    render(<DecisionDetailView projectId={PROJECT_ID} decisionId={DECISION_ID} />);
    await screen.findByRole("heading", { name: /ED-001/ });

    expect(screen.getByText(/no further transitions are possible/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add assumption/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /add link/i })).not.toBeInTheDocument();
  });
});
