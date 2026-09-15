import * as React from "react";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Requirements UI driven through the real API client with a faked `fetch`, so
 * request shapes, error handling and server-driven state are genuinely
 * exercised. Only the network is replaced.
 */

const push = vi.fn();

// The list view's filters live in the URL (see use-url-filter-state.ts):
// `router.replace(url)` is what actually changes them, and `useSearchParams`
// has to reflect that change back — a static mock would leave `filters`
// permanently frozen at its initial value, silently defeating every test
// that changes a filter. A tiny external store, read through
// `useSyncExternalStore`, is the minimum needed to make `replace` and
// `useSearchParams` actually agree with each other the way the real router
// does.
let currentSearch = new URLSearchParams();
const searchListeners = new Set<() => void>();
function replace(url: string) {
  const query = url.split("?")[1] ?? "";
  currentSearch = new URLSearchParams(query);
  searchListeners.forEach((listener) => listener());
}

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace, refresh: vi.fn() }),
  usePathname: () => "/projects/proj1aaaaaaaaaaaaaaaaaaa/requirements",
  useSearchParams: () =>
    React.useSyncExternalStore(
      (onChange) => {
        searchListeners.add(onChange);
        return () => searchListeners.delete(onChange);
      },
      () => currentSearch,
    ),
}));

const { RequirementsView } = await import("./requirements-view");
const { RequirementDetailView } = await import("./requirement-detail-view");

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";
const REQUIREMENT_ID = "req1aaaaaaaaaaaaaaaaaaaa";

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

function requirement(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUIREMENT_ID,
    projectId: PROJECT_ID,
    identifier: "REQ-001",
    title: "Maximum chamber pressure",
    statement: "The engine shall not exceed 120 bar chamber pressure.",
    rationale: "Structural margin of the chamber wall.",
    status: "DRAFT",
    priority: "HIGH",
    source: "SRD-4.2",
    ownerId: null,
    owner: null,
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
    ...overrides,
  };
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    ...requirement(),
    links: [],
    availableTransitions: ["IN_REVIEW", "OBSOLETE"],
    editable: { content: true, owner: true, links: true },
    history: [],
    ...overrides,
  };
}

const LINK_TARGETS = {
  STAKEHOLDER_NEED: [{ id: "need1", identifier: "SN-001", title: "Payload mass" }],
  DESIGN_ITEM: [{ id: "design1", identifier: "DI-001", title: "Combustion chamber" }],
  VERIFICATION_ACTIVITY: [{ id: "ver1", identifier: "VER-001", title: "Hot fire test" }],
  ENGINEERING_DECISION: [{ id: "dec1", identifier: "ED-001", title: "Regenerative cooling" }],
};

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

/** Routes GET traffic; individual tests queue mutation responses via mockImplementationOnce. */
function routeGets(overrides: { requirements?: unknown[]; detail?: unknown } = {}) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("/link-targets")) return ok({ targets: LINK_TARGETS });
    if (url.includes("/organization/members")) return ok({ members: MEMBERS });
    if (url.endsWith(`/requirements/${REQUIREMENT_ID}`)) {
      return ok({ requirement: overrides.detail ?? detail() });
    }
    if (url.includes("/requirements")) return ok({ requirements: overrides.requirements ?? [] });
    if (url.includes("/api/projects/")) return ok({ project: PROJECT });
    return ok({});
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  push.mockReset();
  currentSearch = new URLSearchParams();
  // The data grid persists column layout and saved views to localStorage
  // (see use-data-grid-state.ts / use-saved-views.ts) — cleared so one
  // test's grid state never leaks into the next.
  window.localStorage.clear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RequirementsView", () => {
  it("shows a genuine empty state rather than a fabricated count", async () => {
    routeGets();

    render(<RequirementsView projectId={PROJECT_ID} />);

    expect(await screen.findByText("No requirements yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("renders fetched requirements with status, priority and owner", async () => {
    routeGets({
      requirements: [
        requirement({ owner: { id: "u1", name: "Ada Lovelace", email: "ada@example.test" } }),
      ],
    });

    render(<RequirementsView projectId={PROJECT_ID} />);

    // Not a real <tr> — the grid is a virtualized ARIA grid (role="row" on a
    // div), not a native table (see DataGrid.tsx).
    const row = (await screen.findByRole("link", { name: "REQ-001" })).closest('[role="row"]') as HTMLElement;
    expect(within(row).getByText("Maximum chamber pressure")).toBeInTheDocument();
    expect(within(row).getByText("Draft")).toBeInTheDocument();
    expect(within(row).getByText("High")).toBeInTheDocument();
    expect(within(row).getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("filters by status through the API", async () => {
    routeGets({ requirements: [requirement()] });

    const user = userEvent.setup();
    render(<RequirementsView projectId={PROJECT_ID} />);
    await screen.findByRole("link", { name: "REQ-001" });

    await user.selectOptions(screen.getByLabelText("Status"), "APPROVED");

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes("status=APPROVED")),
      ).toBe(true),
    );
  });

  it("validates the create form before calling the API", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<RequirementsView projectId={PROJECT_ID} />);
    await screen.findByText("No requirements yet");

    await user.click(screen.getAllByRole("button", { name: /new requirement/i })[0]!);
    await user.click(await screen.findByRole("button", { name: /create requirement/i }));

    expect(await screen.findByText("A requirement title is required")).toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true);
  });

  it("creates a requirement and navigates to the created record", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<RequirementsView projectId={PROJECT_ID} />);
    await screen.findByText("No requirements yet");

    await user.click(screen.getAllByRole("button", { name: /new requirement/i })[0]!);
    await user.type(await screen.findByLabelText(/identifier/i), "REQ-001");
    await user.type(screen.getByLabelText(/^title/i), "Maximum chamber pressure");
    await user.type(screen.getByLabelText(/statement/i), "The engine shall not exceed 120 bar.");

    fetchMock.mockImplementationOnce(async () => ok({ requirement: requirement() }));
    await user.click(screen.getByRole("button", { name: /create requirement/i }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/requirements/${REQUIREMENT_ID}`),
    );

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    const payload = JSON.parse(post![1].body);
    // Identity and lifecycle are never sent by the client.
    expect(payload).not.toHaveProperty("status");
    expect(payload).not.toHaveProperty("organizationId");
    expect(payload).not.toHaveProperty("projectId");
  });
});

describe("RequirementDetailView", () => {
  it("offers only the transitions the server says are legal", async () => {
    routeGets({ detail: detail({ availableTransitions: ["IN_REVIEW", "OBSOLETE"] }) });

    render(<RequirementDetailView projectId={PROJECT_ID} requirementId={REQUIREMENT_ID} />);
    await screen.findByRole("heading", { name: /REQ-001/ });

    expect(screen.getByRole("button", { name: "Move to in review" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark obsolete" })).toBeInTheDocument();
    // Approve and Baseline are not reachable from DRAFT and must not be shown.
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Baseline" })).not.toBeInTheDocument();
  });

  it("transitions status through the API and re-reads from the server", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<RequirementDetailView projectId={PROJECT_ID} requirementId={REQUIREMENT_ID} />);
    await screen.findByRole("heading", { name: /REQ-001/ });

    fetchMock.mockImplementationOnce(async () =>
      ok({ requirement: requirement({ status: "IN_REVIEW" }) }),
    );
    await user.click(screen.getByRole("button", { name: "Move to in review" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/transition"));
      expect(call).toBeDefined();
      expect(JSON.parse(call![1].body).to).toBe("IN_REVIEW");
    });
  });

  it("displays a rejected transition without changing the shown status", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<RequirementDetailView projectId={PROJECT_ID} requirementId={REQUIREMENT_ID} />);
    await screen.findByRole("heading", { name: /REQ-001/ });

    fetchMock.mockImplementationOnce(async () =>
      fail(409, "CONFLICT", "A requirement in DRAFT cannot move to BASELINED."),
    );
    await user.click(screen.getByRole("button", { name: "Move to in review" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/cannot move to BASELINED/);
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("presents a read-only requirement clearly and disables editing", async () => {
    routeGets({
      detail: detail({
        status: "BASELINED",
        availableTransitions: ["OBSOLETE"],
        editable: { content: false, owner: false, links: true },
      }),
    });

    render(<RequirementDetailView projectId={PROJECT_ID} requirementId={REQUIREMENT_ID} />);
    await screen.findByRole("heading", { name: /REQ-001/ });

    expect(screen.getByRole("button", { name: /edit/i })).toBeDisabled();
    // The page can carry more than one live region at a time — a panel further
    // down may still be loading — so this asserts the lock notice specifically
    // rather than assuming it is the only one.
    expect(
      screen
        .getAllByRole("status")
        .some((notice) => /read-only/i.test(notice.textContent ?? "")),
    ).toBe(true);
    // Ownership is frozen too, so no assignment control is offered.
    expect(screen.queryByLabelText("Assign owner")).not.toBeInTheDocument();
  });

  it("assigns an owner from the organization", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<RequirementDetailView projectId={PROJECT_ID} requirementId={REQUIREMENT_ID} />);
    await screen.findByRole("heading", { name: /REQ-001/ });

    const select = await screen.findByLabelText("Assign owner");
    await waitFor(() => expect(within(select).getAllByRole("option")).toHaveLength(3));

    fetchMock.mockImplementationOnce(async () =>
      ok({ requirement: requirement({ ownerId: MEMBERS[1]!.id }) }),
    );
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
            relation: "DESIGN_ITEM",
            targetId: "design1",
            identifier: "DI-001",
            title: "Combustion chamber",
            linkType: "ALLOCATED_TO",
            note: null,
            createdAt: "2026-02-01T00:00:00.000Z",
          },
        ],
      }),
    });

    render(<RequirementDetailView projectId={PROJECT_ID} requirementId={REQUIREMENT_ID} />);

    expect(await screen.findByText(/DI-001/)).toBeInTheDocument();
    // The section heading, not the relation option of the same name in the picker.
    expect(screen.getByRole("heading", { name: "Design items" })).toBeInTheDocument();
    // The other four relations are shown as genuinely empty.
    expect(screen.getAllByText("None linked.")).toHaveLength(4);
  });

  it("adds a traceability link scoped to this project's artifacts", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<RequirementDetailView projectId={PROJECT_ID} requirementId={REQUIREMENT_ID} />);
    await screen.findByRole("heading", { name: /REQ-001/ });

    const target = await screen.findByLabelText("Artifact");
    await waitFor(() => expect(within(target).getAllByRole("option").length).toBeGreaterThan(1));
    await user.selectOptions(target, "design1");

    fetchMock.mockImplementationOnce(async () => ok({ links: [] }));
    await user.click(screen.getByRole("button", { name: /add link/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([url, init]) => String(url).includes("/links") && init?.method === "POST",
      );
      const payload = JSON.parse(call![1].body);
      // A typed relation, not an opaque entityType/entityId pair.
      expect(payload.relation).toBe("DESIGN_ITEM");
      expect(payload.targetId).toBe("design1");
    });
  });

  it("removes a traceability link", async () => {
    routeGets({
      detail: detail({
        links: [
          {
            relation: "DESIGN_ITEM",
            targetId: "design1",
            identifier: "DI-001",
            title: "Combustion chamber",
            linkType: "ALLOCATED_TO",
            note: null,
            createdAt: "2026-02-01T00:00:00.000Z",
          },
        ],
      }),
    });
    const user = userEvent.setup();

    render(<RequirementDetailView projectId={PROJECT_ID} requirementId={REQUIREMENT_ID} />);
    await screen.findByText(/DI-001/);

    fetchMock.mockImplementationOnce(async () => ok({ links: [] }));
    await user.click(screen.getByRole("button", { name: /remove link to DI-001/i }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([, init]) => init?.method === "DELETE");
      expect(String(call![0])).toContain("relation=DESIGN_ITEM");
      expect(String(call![0])).toContain("targetId=design1");
    });
  });

  it("shows the audit history recorded for the requirement", async () => {
    routeGets({
      detail: detail({
        history: [
          {
            id: "audit1",
            action: "requirement.created",
            createdAt: "2026-01-02T00:00:00.000Z",
            actor: { id: "u1", name: "Ada Lovelace" },
            metadata: {},
          },
        ],
      }),
    });

    render(<RequirementDetailView projectId={PROJECT_ID} requirementId={REQUIREMENT_ID} />);

    // Scoped to the History card — "Created" is also a field label on the record.
    const history = (await screen.findByRole("heading", { name: /history/i })).closest(
      "[class*='rounded-lg']",
    )!;
    expect(within(history as HTMLElement).getByText("Created")).toBeInTheDocument();
    expect(within(history as HTMLElement).getByText("Ada Lovelace")).toBeInTheDocument();
  });
});
