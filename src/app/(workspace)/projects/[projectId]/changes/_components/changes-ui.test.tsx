import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Change management UI driven through the real API client with a faked `fetch`.
 * Only the network is replaced, so request shapes and server-driven state are
 * genuinely exercised.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

const { ChangesView } = await import("./changes-view");
const { ChangeDetailView } = await import("./change-detail-view");

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";
const CHANGE_ID = "chg1aaaaaaaaaaaaaaaaaaa";
const REQUIREMENT_ID = "req1aaaaaaaaaaaaaaaaaaa";

const PROJECT = {
  id: PROJECT_ID,
  organizationId: "org1",
  name: "Upper Stage Propulsion",
  description: null,
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const REQUESTER = { id: "user1aaaaaaaaaaaaaaaaaaa", name: "Ada Lovelace" };

const IMPACT_TARGETS = {
  REQUIREMENT: [{ id: REQUIREMENT_ID, identifier: "REQ-001", title: "Chamber pressure" }],
  DESIGN_ITEM: [{ id: "design1", identifier: "DI-001", title: "Combustion chamber" }],
  ENGINEERING_DECISION: [{ id: "dec1", identifier: "ED-001", title: "Regenerative cooling" }],
  VERIFICATION_ACTIVITY: [],
  RISK: [],
  ISSUE: [],
};

function change(overrides: Record<string, unknown> = {}) {
  return {
    id: CHANGE_ID,
    projectId: PROJECT_ID,
    identifier: "CR-001",
    title: "Raise the chamber pressure limit",
    description: "Raise the limit from 120 to 130 bar.",
    reason: "Performance shortfall found in hot fire.",
    status: "DRAFT",
    requestedById: REQUESTER.id,
    requestedBy: REQUESTER,
    createdAt: "2026-02-01T00:00:00.000Z",
    updatedAt: "2026-02-03T00:00:00.000Z",
    ...overrides,
  };
}

function declaredImpact(overrides: Record<string, unknown> = {}) {
  return {
    id: "imp1aaaaaaaaaaaaaaaaaa",
    changeRequestId: CHANGE_ID,
    target: { type: "REQUIREMENT", id: REQUIREMENT_ID },
    targetIdentifier: "REQ-001",
    targetTitle: "Chamber pressure",
    note: "The limit is stated here.",
    createdAt: "2026-02-02T00:00:00.000Z",
    createdBy: REQUESTER,
    ...overrides,
  };
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    ...change(),
    declaredImpacts: [],
    availableTransitions: ["SUBMITTED", "CANCELLED"],
    editable: { definition: true, declaredImpacts: true },
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

function routeGets(
  overrides: { changes?: unknown[]; detail?: unknown; latest?: unknown } = {},
) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("/impact-analysis/latest")) {
      return ok({
        latest: overrides.latest ?? {
          status: "NOT_RUN",
          changeRequestId: CHANGE_ID,
          engineVersion: "1",
        },
      });
    }
    if (url.includes("/change-impact-targets")) return ok({ targets: IMPACT_TARGETS });
    if (url.endsWith(`/changes/${CHANGE_ID}`)) {
      return ok({ change: overrides.detail ?? detail() });
    }
    if (url.includes("/changes")) return ok({ changes: overrides.changes ?? [] });
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

describe("ChangesView", () => {
  it("shows a genuine empty state rather than a fabricated count", async () => {
    routeGets();

    render(<ChangesView projectId={PROJECT_ID} />);

    expect(await screen.findByText("No change requests raised yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders changes with status, requester and dates", async () => {
    routeGets({ changes: [change({ status: "UNDER_REVIEW" })] });

    render(<ChangesView projectId={PROJECT_ID} />);

    const row = (await screen.findByRole("link", { name: "CR-001" })).closest("tr")!;
    expect(within(row).getByText("Raise the chamber pressure limit")).toBeInTheDocument();
    expect(within(row).getByText("Under review")).toBeInTheDocument();
    expect(within(row).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(row).getByText("2026-02-01")).toBeInTheDocument();
    expect(within(row).getByText("2026-02-03")).toBeInTheDocument();
  });

  it("filters by status through the API", async () => {
    routeGets({ changes: [change()] });
    const user = userEvent.setup();

    render(<ChangesView projectId={PROJECT_ID} />);
    await screen.findByRole("link", { name: "CR-001" });

    await user.selectOptions(screen.getByLabelText("Status"), "APPROVED");

    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("status=APPROVED"))).toBe(
        true,
      ),
    );
  });

  it("surfaces a server error with a retry", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/changes")) {
        return fail(500, "INTERNAL_ERROR", "Database unavailable");
      }
      return ok({ project: PROJECT });
    });

    render(<ChangesView projectId={PROJECT_ID} />);

    // A 500 is deliberately not echoed back verbatim.
    expect(await screen.findByRole("alert")).toHaveTextContent(/went wrong on the server/i);
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });

  it("creates a change without ever sending a requester or a status", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<ChangesView projectId={PROJECT_ID} />);
    await screen.findByText("No change requests raised yet");

    await user.click(screen.getAllByRole("button", { name: "New change" })[0]!);
    // A number of their own: the field is automatic until asked for.
    await user.click(await screen.findByRole("button", { name: "Use my own number" }));
    await user.type(screen.getByLabelText(/^Number/), "CR-001");
    await user.type(screen.getByLabelText(/^Title/), "Raise the chamber pressure limit");
    await user.type(screen.getByLabelText(/^Description/), "Raise the limit to 130 bar.");
    await user.type(screen.getByLabelText(/^Reason/), "Performance shortfall.");

    // The list reloads after a create, so the stub has to keep answering both
    // routes rather than returning the created change to everything.
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return ok({ change: change() });
      if (String(url).includes("/changes")) return ok({ changes: [change()] });
      return ok({ project: PROJECT });
    });
    await user.click(screen.getByRole("button", { name: "Create change request" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/changes/${CHANGE_ID}`));

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST")!;
    const body = JSON.parse(String(post[1].body));
    expect(body).toEqual({
      identifier: "CR-001",
      title: "Raise the chamber pressure limit",
      description: "Raise the limit to 130 bar.",
      reason: "Performance shortfall.",
    });
    expect(body).not.toHaveProperty("requestedById");
    expect(body).not.toHaveProperty("status");
    expect(body).not.toHaveProperty("projectId");
  });
});

describe("ChangeDetailView", () => {
  it("shows what is changing, why, who asked and when", async () => {
    routeGets();

    render(<ChangeDetailView projectId={PROJECT_ID} changeId={CHANGE_ID} />);

    expect(
      await screen.findByRole("heading", { name: /CR-001 — Raise the chamber pressure limit/ }),
    ).toBeInTheDocument();
    expect(screen.getByText("Raise the limit from 120 to 130 bar.")).toBeInTheDocument();
    expect(screen.getByText("Performance shortfall found in hot fire.")).toBeInTheDocument();
    expect(screen.getByText("Ada Lovelace")).toBeInTheDocument();
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("offers only the transitions the server said are legal", async () => {
    routeGets({ detail: detail({ status: "SUBMITTED", availableTransitions: ["UNDER_REVIEW", "CANCELLED"] }) });

    render(<ChangeDetailView projectId={PROJECT_ID} changeId={CHANGE_ID} />);

    expect(await screen.findByRole("button", { name: "Begin review" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel change" })).toBeInTheDocument();
    // Approval is not reachable from SUBMITTED, so it is not offered.
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Submit" })).not.toBeInTheDocument();
  });

  it("says plainly when a change is final", async () => {
    routeGets({ detail: detail({ status: "IMPLEMENTED", availableTransitions: [] }) });

    render(<ChangeDetailView projectId={PROJECT_ID} changeId={CHANGE_ID} />);

    expect(await screen.findByText(/final state/i)).toBeInTheDocument();
  });

  it("transitions through the dedicated endpoint", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<ChangeDetailView projectId={PROJECT_ID} changeId={CHANGE_ID} />);
    await user.click(await screen.findByRole("button", { name: "Submit" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => String(url).endsWith("/transition") && init?.method === "POST",
        ),
      ).toBe(true),
    );

    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/transition"))!;
    expect(JSON.parse(String(call[1].body))).toEqual({ to: "SUBMITTED", rationale: null });
  });

  it("locks editing once the change has been reviewed and says why", async () => {
    routeGets({
      detail: detail({
        status: "UNDER_REVIEW",
        editable: { definition: false, declaredImpacts: true },
        availableTransitions: ["APPROVED", "REJECTED", "CANCELLED"],
      }),
    });

    render(<ChangeDetailView projectId={PROJECT_ID} changeId={CHANGE_ID} />);

    expect(await screen.findByRole("button", { name: "Edit" })).toBeDisabled();
    // Located by its text rather than by being the only role="status" on the
    // page: a sibling panel still loading renders a LoadingState, which is also
    // a status region, so `getByRole("status")` is ambiguous under a slow run.
    const lockNotice = await screen.findByText(
      /must not silently become a different change/i,
    );
    expect(lockNotice.closest('[role="status"]')).not.toBeNull();
  });

  it("renders declared impacts as declarations, never as computed results", async () => {
    routeGets({ detail: detail({ declaredImpacts: [declaredImpact()] }) });

    render(<ChangeDetailView projectId={PROJECT_ID} changeId={CHANGE_ID} />);

    expect(await screen.findByRole("heading", { name: "Declared impacts" })).toBeInTheDocument();

    const row = screen.getByText("REQ-001").closest("li")!;
    expect(within(row).getByText("Chamber pressure")).toBeInTheDocument();
    expect(within(row).getByText("The limit is stated here.")).toBeInTheDocument();
    expect(within(row).getByText(/Declared by Ada Lovelace on 2026-02-02/)).toBeInTheDocument();
    // The type is shown as a badge on the declaration itself.
    expect(within(row).getByText("Requirement")).toBeInTheDocument();
  });

  it("keeps declared and computed impact in separate panels", async () => {
    routeGets({ detail: detail({ declaredImpacts: [declaredImpact()] }) });

    render(<ChangeDetailView projectId={PROJECT_ID} changeId={CHANGE_ID} />);

    // One is an assertion, the other a derivation. Merging them would make it
    // impossible to tell what a person claimed from what the graph implied.
    expect(await screen.findByRole("heading", { name: "Declared impacts" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Computed impact" })).toBeInTheDocument();
  });

  it("declares an impact against a selected artifact", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<ChangeDetailView projectId={PROJECT_ID} changeId={CHANGE_ID} />);
    await screen.findByRole("heading", { name: "Declared impacts" });

    await user.selectOptions(screen.getByLabelText("Artifact type"), "REQUIREMENT");
    await screen.findByRole("option", { name: /REQ-001/ });
    await user.selectOptions(screen.getByLabelText("Artifact"), REQUIREMENT_ID);
    await user.type(screen.getByLabelText("Why is it affected?"), "The limit lives here.");
    await user.click(screen.getByRole("button", { name: /declare impact/i }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) => String(url).endsWith("/impacts") && init?.method === "POST",
        ),
      ).toBe(true),
    );

    const call = fetchMock.mock.calls.find(
      ([url, init]) => String(url).endsWith("/impacts") && init?.method === "POST",
    )!;
    // A typed target, never a bare id.
    expect(JSON.parse(String(call[1].body))).toEqual({
      target: { type: "REQUIREMENT", id: REQUIREMENT_ID },
      note: "The limit lives here.",
    });
  });

  it("does not offer an artifact that is already declared", async () => {
    routeGets({ detail: detail({ declaredImpacts: [declaredImpact()] }) });

    render(<ChangeDetailView projectId={PROJECT_ID} changeId={CHANGE_ID} />);
    await screen.findByRole("heading", { name: "Declared impacts" });

    await waitFor(() =>
      expect(
        within(screen.getByLabelText("Artifact")).queryByRole("option", {
          name: /REQ-001/,
        }),
      ).not.toBeInTheDocument(),
    );
  });

  it("withdraws a declared impact", async () => {
    routeGets({ detail: detail({ declaredImpacts: [declaredImpact()] }) });
    const user = userEvent.setup();

    render(<ChangeDetailView projectId={PROJECT_ID} changeId={CHANGE_ID} />);
    await user.click(
      await screen.findByRole("button", { name: /withdraw declared impact on REQ-001/i }),
    );

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).includes("/impacts/imp1aaaaaaaaaaaaaaaaaa") && init?.method === "DELETE",
        ),
      ).toBe(true),
    );
  });

  it("hides the impact controls once the declared scope is fixed", async () => {
    routeGets({
      detail: detail({
        status: "APPROVED",
        declaredImpacts: [declaredImpact()],
        editable: { definition: false, declaredImpacts: false },
        availableTransitions: ["IMPLEMENTED"],
      }),
    });

    render(<ChangeDetailView projectId={PROJECT_ID} changeId={CHANGE_ID} />);

    expect(await screen.findByText(/declared scope of this change is fixed/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /declare impact/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Artifact type")).not.toBeInTheDocument();
  });

  it("surfaces a rejected declaration without pretending it worked", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<ChangeDetailView projectId={PROJECT_ID} changeId={CHANGE_ID} />);
    await screen.findByRole("heading", { name: "Declared impacts" });

    await screen.findByRole("option", { name: /REQ-001/ });
    await user.selectOptions(screen.getByLabelText("Artifact"), REQUIREMENT_ID);

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (String(url).endsWith("/impacts") && init?.method === "POST") {
        return fail(400, "VALIDATION_ERROR", "That artifact was not found in this project.");
      }
      return ok({ change: detail() });
    });

    await user.click(screen.getByRole("button", { name: /declare impact/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/not found in this project/i);
  });

  it("shows the change's history", async () => {
    routeGets({
      detail: detail({
        history: [
          {
            id: "audit1",
            action: "change.created",
            createdAt: "2026-02-01T00:00:00.000Z",
            actor: REQUESTER,
            metadata: null,
          },
          {
            id: "audit2",
            action: "change.declared_impact_added",
            createdAt: "2026-02-02T00:00:00.000Z",
            actor: REQUESTER,
            metadata: null,
          },
        ],
      }),
    });

    render(<ChangeDetailView projectId={PROJECT_ID} changeId={CHANGE_ID} />);

    const history = (await screen.findByRole("heading", { name: /History/ })).closest(
      "div[class*='rounded-lg']",
    )!;
    expect(within(history as HTMLElement).getByText(/created/i)).toBeInTheDocument();
    expect(within(history as HTMLElement).getAllByText("Ada Lovelace")).toHaveLength(2);
  });

  it("surfaces a failed load with a way back", async () => {
    fetchMock.mockImplementation(async () => fail(404, "NOT_FOUND", "Change request not found."));

    render(<ChangeDetailView projectId={PROJECT_ID} changeId={CHANGE_ID} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer exists/i);
    expect(screen.getByRole("link", { name: /back to changes/i })).toBeInTheDocument();
  });
});
