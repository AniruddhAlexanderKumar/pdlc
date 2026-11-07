import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Issues UI driven through the real API client with a faked `fetch`, so
 * request shapes, error handling and server-driven state are genuinely
 * exercised. Only the network is replaced. No test here asserts on a
 * numeric priority score — severity is shown exactly as recorded.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

const { IssuesView } = await import("./issues-view");
const { IssueDetailView } = await import("./issue-detail-view");

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";
const ISSUE_ID = "issue1aaaaaaaaaaaaaaaa";

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

function issue(overrides: Record<string, unknown> = {}) {
  return {
    id: ISSUE_ID,
    projectId: PROJECT_ID,
    identifier: "ISS-001",
    title: "Chamber wall crack found",
    description: "A hairline crack was found during post-test inspection.",
    severity: "HIGH",
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
    ...issue(),
    links: [],
    availableTransitions: ["IN_PROGRESS", "RESOLVED"],
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
function routeGets(overrides: { issues?: unknown[]; detail?: unknown } = {}) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("/issue-link-targets")) return ok({ targets: LINK_TARGETS });
    if (url.includes("/organization/members")) return ok({ members: MEMBERS });
    if (url.endsWith(`/issues/${ISSUE_ID}`)) return ok({ issue: overrides.detail ?? detail() });
    if (url.includes("/issues")) return ok({ issues: overrides.issues ?? [] });
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

describe("IssuesView", () => {
  it("shows a genuine empty state rather than a fabricated count", async () => {
    routeGets();

    render(<IssuesView projectId={PROJECT_ID} />);

    expect(await screen.findByText("No issues yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders fetched issues with severity, status and owner", async () => {
    routeGets({
      issues: [issue({ owner: { id: "u1", name: "Ada Lovelace", email: "ada@example.test" } })],
    });

    render(<IssuesView projectId={PROJECT_ID} />);

    const link = await screen.findByRole("link", { name: "ISS-001" });
    const row = link.closest("tr")!;
    expect(within(row).getByText("High")).toBeInTheDocument();
    expect(within(row).getByText("Open")).toBeInTheDocument();
    expect(within(row).getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("filters by status and severity through the API", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<IssuesView projectId={PROJECT_ID} />);
    await screen.findByText("No issues yet");

    await user.selectOptions(screen.getByLabelText("Status"), "IN_PROGRESS");
    await user.selectOptions(screen.getByLabelText("Severity"), "CRITICAL");

    await waitFor(() => {
      const calls = fetchMock.mock.calls.map(([url]) => String(url)).filter((url) => url.includes("/issues?"));
      const last = calls.at(-1);
      expect(last).toContain("status=IN_PROGRESS");
      expect(last).toContain("severity=CRITICAL");
    });
  });

  it("validates the create form before calling the API", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<IssuesView projectId={PROJECT_ID} />);
    await screen.findByText("No issues yet");

    await user.click(screen.getAllByRole("button", { name: /new issue/i })[0]!);
    await user.click(await screen.findByRole("button", { name: /create issue/i }));

    expect(await screen.findByText("An issue title is required")).toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true);
  });

  it("creates an issue and navigates to the created record, never sending status or organization", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<IssuesView projectId={PROJECT_ID} />);
    await screen.findByText("No issues yet");

    await user.click(screen.getAllByRole("button", { name: /new issue/i })[0]!);
    // A number of their own: the field is automatic until asked for.
    await user.click(await screen.findByRole("button", { name: "Use my own number" }));
    await user.type(screen.getByLabelText(/^Number/), "ISS-001");
    await user.type(screen.getByLabelText(/^title/i), "Chamber wall crack found");
    await user.type(screen.getByLabelText(/description/i), "A hairline crack was found.");

    fetchMock.mockImplementationOnce(async () => ok({ issue: issue() }));
    await user.click(screen.getByRole("button", { name: /create issue/i }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/issues/${ISSUE_ID}`));

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    const payload = JSON.parse(post![1].body);
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("organizationId");
    expect(payload).not.toHaveProperty("projectId");
    // Severity defaults to MEDIUM in the form.
    expect(payload.severity).toBe("MEDIUM");
  });
});

describe("IssueDetailView", () => {
  it("offers only the transitions the server says are legal", async () => {
    routeGets({ detail: detail({ availableTransitions: ["IN_PROGRESS", "RESOLVED"] }) });

    render(<IssueDetailView projectId={PROJECT_ID} issueId={ISSUE_ID} />);
    await screen.findByRole("heading", { name: /ISS-001/ });

    expect(screen.getByRole("button", { name: "Start work" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark resolved" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
  });

  it("transitions status through the API and re-reads from the server", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<IssueDetailView projectId={PROJECT_ID} issueId={ISSUE_ID} />);
    await screen.findByRole("heading", { name: /ISS-001/ });

    fetchMock.mockImplementationOnce(async () => ok({ issue: issue({ status: "IN_PROGRESS" }) }));
    await user.click(screen.getByRole("button", { name: "Start work" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/transition"));
      expect(call).toBeDefined();
      expect(JSON.parse(call![1].body).to).toBe("IN_PROGRESS");
    });
  });

  it("displays a rejected transition without changing the shown status", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<IssueDetailView projectId={PROJECT_ID} issueId={ISSUE_ID} />);
    await screen.findByRole("heading", { name: /ISS-001/ });

    fetchMock.mockImplementationOnce(async () =>
      fail(409, "CONFLICT", "An issue that is IN_PROGRESS cannot move to CLOSED."),
    );
    await user.click(screen.getByRole("button", { name: "Start work" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/cannot move to CLOSED/);
    const statusRow = screen.getByText("Status").closest("div")!;
    expect(within(statusRow).getByText("Open")).toBeInTheDocument();
  });

  it("presents a resolved issue clearly and disables editing", async () => {
    routeGets({
      detail: detail({
        status: "RESOLVED",
        availableTransitions: ["CLOSED"],
        editable: { content: false, owner: true, links: true },
      }),
    });

    render(<IssueDetailView projectId={PROJECT_ID} issueId={ISSUE_ID} />);
    await screen.findByRole("heading", { name: /ISS-001/ });

    expect(screen.getByRole("button", { name: /edit/i })).toBeDisabled();
    expect(
      screen.getAllByRole("status").some((notice) => /read-only/i.test(notice.textContent ?? "")),
    ).toBe(true);
    // Ownership stays assignable one stage past content — this is intentional.
    expect(screen.queryByLabelText("Assign owner")).toBeInTheDocument();
  });

  it("**never shows a probability, priority score or numeric ranking anywhere on the page**", async () => {
    routeGets();

    render(<IssueDetailView projectId={PROJECT_ID} issueId={ISSUE_ID} />);
    await screen.findByRole("heading", { name: /ISS-001/ });

    expect(document.body.textContent).not.toMatch(/probability|priority score|\d+%/i);
  });

  it("assigns an owner from the organization", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<IssueDetailView projectId={PROJECT_ID} issueId={ISSUE_ID} />);
    await screen.findByRole("heading", { name: /ISS-001/ });

    const select = await screen.findByLabelText("Assign owner");
    await waitFor(() => expect(within(select).getAllByRole("option")).toHaveLength(3));

    fetchMock.mockImplementationOnce(async () => ok({ issue: issue({ ownerId: MEMBERS[1]!.id }) }));
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

    render(<IssueDetailView projectId={PROJECT_ID} issueId={ISSUE_ID} />);

    expect(await screen.findByText(/DI-001/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Design items" })).toBeInTheDocument();
    expect(screen.getAllByText("None linked.")).toHaveLength(2);
  });

  it("adds a traceability link scoped to this project's artifacts", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<IssueDetailView projectId={PROJECT_ID} issueId={ISSUE_ID} />);
    await screen.findByRole("heading", { name: /ISS-001/ });

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

    render(<IssueDetailView projectId={PROJECT_ID} issueId={ISSUE_ID} />);
    await screen.findByText(/DI-001/);

    fetchMock.mockImplementationOnce(async () => ok({ removed: true }));
    await user.click(screen.getByRole("button", { name: /remove link to DI-001/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
      expect(String(call![0])).toContain("/links/DESIGN_ITEM%3Alink1");
    });
    await waitFor(() => expect(screen.queryByText(/DI-001/)).not.toBeInTheDocument());
  });

  it("shows the audit history recorded for the issue", async () => {
    routeGets({
      detail: detail({
        history: [
          {
            id: "audit1",
            action: "issue.created",
            createdAt: "2026-01-02T00:00:00.000Z",
            actor: { id: "u1", name: "Ada Lovelace" },
            metadata: {},
          },
        ],
      }),
    });

    render(<IssueDetailView projectId={PROJECT_ID} issueId={ISSUE_ID} />);

    await screen.findByRole("heading", { name: /history/i });
    const entries = await screen.findAllByText("Created");
    expect(entries.some((el) => el.tagName === "SPAN")).toBe(true);
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
  });
});
