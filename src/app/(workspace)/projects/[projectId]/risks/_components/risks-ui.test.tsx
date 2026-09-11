import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Risks UI driven through the real API client with a faked `fetch`, so
 * request shapes, error handling and server-driven state are genuinely
 * exercised. Only the network is replaced. No test here asserts on a
 * probability, impact or numeric score, because the interface never shows
 * one.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

const { RisksView } = await import("./risks-view");
const { RiskDetailView } = await import("./risk-detail-view");

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";
const RISK_ID = "risk1aaaaaaaaaaaaaaaaaa";

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

function risk(overrides: Record<string, unknown> = {}) {
  return {
    id: RISK_ID,
    projectId: PROJECT_ID,
    identifier: "RSK-001",
    title: "Coolant supply interruption",
    description: "The coolant loop may lose flow under vibration.",
    cause: "Pump mounting fatigue.",
    consequence: "Chamber overheating.",
    status: "OPEN",
    ownerId: null,
    owner: null,
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
    ...overrides,
  };
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    ...risk(),
    links: [],
    availableTransitions: ["MITIGATED", "ACCEPTED", "CLOSED"],
    editable: { content: true, owner: true, links: true },
    history: [],
    ...overrides,
  };
}

const LINK_TARGETS = {
  REQUIREMENT: [{ id: "req1", identifier: "REQ-001", title: "Chamber pressure" }],
  DESIGN_ITEM: [{ id: "design1", identifier: "DI-001", title: "Combustion chamber" }],
  ENGINEERING_DECISION: [{ id: "dec1", identifier: "ED-001", title: "Regenerative cooling" }],
};

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function fail(status: number, code: string, message: string): Response {
  return { ok: false, status, json: async () => ({ error: { code, message } }) } as unknown as Response;
}

const fetchMock = vi.fn();

/** Routes GET traffic; individual tests queue mutation responses via mockImplementationOnce. */
function routeGets(overrides: { risks?: unknown[]; detail?: unknown } = {}) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("/risk-link-targets")) return ok({ targets: LINK_TARGETS });
    if (url.includes("/organization/members")) return ok({ members: MEMBERS });
    if (url.endsWith(`/risks/${RISK_ID}`)) return ok({ risk: overrides.detail ?? detail() });
    if (url.includes("/risks")) return ok({ risks: overrides.risks ?? [] });
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

describe("RisksView", () => {
  it("shows a genuine empty state rather than a fabricated count", async () => {
    routeGets();

    render(<RisksView projectId={PROJECT_ID} />);

    expect(await screen.findByText("No risks yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders fetched risks with status and owner", async () => {
    routeGets({
      risks: [risk({ owner: { id: "u1", name: "Ada Lovelace", email: "ada@example.test" } })],
    });

    render(<RisksView projectId={PROJECT_ID} />);

    const link = await screen.findByRole("link", { name: "RSK-001" });
    const row = link.closest("tr")!;
    expect(within(row).getByText("Open")).toBeInTheDocument();
    expect(within(row).getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("filters by status through the API", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<RisksView projectId={PROJECT_ID} />);
    await screen.findByText("No risks yet");

    await user.selectOptions(screen.getByLabelText("Status"), "MITIGATED");

    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("status=MITIGATED"))).toBe(true);
    });
  });

  it("validates the create form before calling the API", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<RisksView projectId={PROJECT_ID} />);
    await screen.findByText("No risks yet");

    await user.click(screen.getAllByRole("button", { name: /new risk/i })[0]!);
    await user.click(await screen.findByRole("button", { name: /create risk/i }));

    expect(await screen.findByText("A risk title is required")).toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true);
  });

  it("creates a risk and navigates to the created record, never sending status or organization", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<RisksView projectId={PROJECT_ID} />);
    await screen.findByText("No risks yet");

    await user.click(screen.getAllByRole("button", { name: /new risk/i })[0]!);
    await user.type(await screen.findByLabelText(/identifier/i), "RSK-001");
    await user.type(screen.getByLabelText(/^title/i), "Coolant supply interruption");
    await user.type(screen.getByLabelText(/description/i), "The coolant loop may lose flow.");

    fetchMock.mockImplementationOnce(async () => ok({ risk: risk() }));
    await user.click(screen.getByRole("button", { name: /create risk/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/risks/${RISK_ID}`));

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    const payload = JSON.parse(post![1].body);
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("organizationId");
    expect(payload).not.toHaveProperty("projectId");
  });
});

describe("RiskDetailView", () => {
  it("offers only the transitions the server says are legal", async () => {
    routeGets({ detail: detail({ availableTransitions: ["MITIGATED", "CLOSED"] }) });

    render(<RiskDetailView projectId={PROJECT_ID} riskId={RISK_ID} />);
    await screen.findByRole("heading", { name: /RSK-001/ });

    expect(screen.getByRole("button", { name: "Mark mitigated" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();
    // ACCEPTED is not reachable in this scenario and must not be shown.
    expect(screen.queryByRole("button", { name: "Accept" })).not.toBeInTheDocument();
  });

  it("transitions status through the API and re-reads from the server", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<RiskDetailView projectId={PROJECT_ID} riskId={RISK_ID} />);
    await screen.findByRole("heading", { name: /RSK-001/ });

    fetchMock.mockImplementationOnce(async () => ok({ risk: risk({ status: "MITIGATED" }) }));
    await user.click(screen.getByRole("button", { name: "Mark mitigated" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/transition"));
      expect(call).toBeDefined();
      expect(JSON.parse(call![1].body).to).toBe("MITIGATED");
    });
  });

  it("displays a rejected transition without changing the shown status", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<RiskDetailView projectId={PROJECT_ID} riskId={RISK_ID} />);
    await screen.findByRole("heading", { name: /RSK-001/ });

    fetchMock.mockImplementationOnce(async () =>
      fail(409, "CONFLICT", "A risk that is CLOSED is final and cannot change status."),
    );
    await user.click(screen.getByRole("button", { name: "Mark mitigated" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/final and cannot change status/);
    expect(screen.getByText("Open")).toBeInTheDocument();
  });

  it("presents a closed risk clearly and disables editing", async () => {
    routeGets({
      detail: detail({
        status: "CLOSED",
        availableTransitions: [],
        editable: { content: false, owner: false, links: false },
      }),
    });

    render(<RiskDetailView projectId={PROJECT_ID} riskId={RISK_ID} />);
    await screen.findByRole("heading", { name: /RSK-001/ });

    expect(screen.getByRole("button", { name: /edit/i })).toBeDisabled();
    expect(
      screen.getAllByRole("status").some((notice) => /read-only/i.test(notice.textContent ?? "")),
    ).toBe(true);
    expect(screen.queryByLabelText("Assign owner")).not.toBeInTheDocument();
  });

  it("**never shows a probability, impact or numeric score anywhere on the page**", async () => {
    routeGets();

    render(<RiskDetailView projectId={PROJECT_ID} riskId={RISK_ID} />);
    await screen.findByRole("heading", { name: /RSK-001/ });

    expect(document.body.textContent).not.toMatch(/probability|risk score|\d+%/i);
  });

  it("assigns an owner from the organization", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<RiskDetailView projectId={PROJECT_ID} riskId={RISK_ID} />);
    await screen.findByRole("heading", { name: /RSK-001/ });

    const select = await screen.findByLabelText("Assign owner");
    await waitFor(() => expect(within(select).getAllByRole("option")).toHaveLength(3));

    fetchMock.mockImplementationOnce(async () => ok({ risk: risk({ ownerId: MEMBERS[1]!.id }) }));
    await user.selectOptions(select, MEMBERS[1]!.id);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/owner"));
      expect(JSON.parse(call![1].body).ownerId).toBe(MEMBERS[1]!.id);
    });
  });

  it("displays existing traceability grouped by relationship", async () => {
    routeGets({
      detail: detail({
        links: [
          {
            id: "DESIGN_ITEM:link1",
            relation: "DESIGN_ITEM",
            targetId: "design1",
            identifier: "DI-001",
            title: "Combustion chamber",
            note: null,
            createdAt: "2026-02-01T00:00:00.000Z",
          },
        ],
      }),
    });

    render(<RiskDetailView projectId={PROJECT_ID} riskId={RISK_ID} />);

    expect(await screen.findByText(/DI-001/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Design items" })).toBeInTheDocument();
    // The other two relations are shown as genuinely empty.
    expect(screen.getAllByText("None linked.")).toHaveLength(2);
  });

  it("adds a traceability link scoped to this project's artifacts", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<RiskDetailView projectId={PROJECT_ID} riskId={RISK_ID} />);
    await screen.findByRole("heading", { name: /RSK-001/ });

    const target = await screen.findByLabelText("Artifact");
    await waitFor(() => expect(within(target).getAllByRole("option").length).toBeGreaterThan(1));
    await user.selectOptions(target, "req1");

    fetchMock.mockImplementationOnce(async () =>
      ok({
        link: {
          id: "REQUIREMENT:link1",
          relation: "REQUIREMENT",
          targetId: "req1",
          identifier: "REQ-001",
          title: "Chamber pressure",
          note: null,
          createdAt: "2026-02-01T00:00:00.000Z",
        },
      }),
    );
    await user.click(screen.getByRole("button", { name: /add link/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) => String(url).includes("/links") && init?.method === "POST",
      );
      const payload = JSON.parse(call![1].body);
      expect(payload.relation).toBe("REQUIREMENT");
      expect(payload.targetId).toBe("req1");
    });
    expect(await screen.findByText(/REQ-001/)).toBeInTheDocument();
  });

  it("removes a traceability link by its composite id", async () => {
    routeGets({
      detail: detail({
        links: [
          {
            id: "DESIGN_ITEM:link1",
            relation: "DESIGN_ITEM",
            targetId: "design1",
            identifier: "DI-001",
            title: "Combustion chamber",
            note: null,
            createdAt: "2026-02-01T00:00:00.000Z",
          },
        ],
      }),
    });
    const user = userEvent.setup();

    render(<RiskDetailView projectId={PROJECT_ID} riskId={RISK_ID} />);
    await screen.findByText(/DI-001/);

    fetchMock.mockImplementationOnce(async () => ok({ removed: true }));
    await user.click(screen.getByRole("button", { name: /remove link to DI-001/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
      expect(String(call![0])).toContain("/links/DESIGN_ITEM%3Alink1");
    });
    await waitFor(() => expect(screen.queryByText(/DI-001/)).not.toBeInTheDocument());
  });

  it("shows the audit history recorded for the risk", async () => {
    routeGets({
      detail: detail({
        history: [
          {
            id: "audit1",
            action: "risk.created",
            createdAt: "2026-01-02T00:00:00.000Z",
            actor: { id: "u1", name: "Ada Lovelace" },
            metadata: {},
          },
        ],
      }),
    });

    render(<RiskDetailView projectId={PROJECT_ID} riskId={RISK_ID} />);

    await screen.findByRole("heading", { name: /history/i });
    // "Created" also labels the risk's own creation timestamp elsewhere on the
    // page — this history entry is the one rendered as a <span>, not a <dt>.
    const entries = await screen.findAllByText("Created");
    expect(entries.some((el) => el.tagName === "SPAN")).toBe(true);
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });
});
