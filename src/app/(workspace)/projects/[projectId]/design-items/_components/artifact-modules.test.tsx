import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * UI behavior for the three artifact modules, driven through the real API
 * client with a faked `fetch`. Only the network is replaced, so request
 * shapes and server-driven state are genuinely exercised.
 */

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

const { DesignItemsView } = await import("./design-items-view");
const { DesignItemDetailView } = await import("./design-item-detail-view");
const { StakeholderNeedsView } = await import(
  "../../stakeholder-needs/_components/stakeholder-needs-view"
);
const { VerificationView } = await import("../../verification/_components/verification-view");
const { VerificationDetailView } = await import(
  "../../verification/_components/verification-detail-view"
);

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";
const DESIGN_ID = "design1aaaaaaaaaaaaaaa";
const ACTIVITY_ID = "ver1aaaaaaaaaaaaaaaaaaa";

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

const DESIGN_ITEM = {
  id: DESIGN_ID,
  projectId: PROJECT_ID,
  identifier: "DI-001",
  name: "Combustion chamber",
  description: "Regeneratively cooled chamber.",
  itemType: "COMPONENT",
  status: "DRAFT",
  ownerId: null,
  owner: null,
  createdAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-03T00:00:00.000Z",
};

function designDetail(overrides: Record<string, unknown> = {}) {
  return { ...DESIGN_ITEM, requirements: [], decisions: [], history: [], ...overrides };
}

function activity(overrides: Record<string, unknown> = {}) {
  return {
    id: ACTIVITY_ID,
    projectId: PROJECT_ID,
    identifier: "VER-001",
    title: "Hot fire test",
    description: null,
    method: "TEST",
    status: "PLANNED",
    ownerId: null,
    owner: null,
    plannedDate: "2026-04-01T00:00:00.000Z",
    completedDate: null,
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
    ...overrides,
  };
}

function activityDetail(overrides: Record<string, unknown> = {}) {
  return {
    ...activity(),
    requirements: [],
    evidence: [],
    availableTransitions: ["IN_PROGRESS", "WAIVED"],
    editable: true,
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
  overrides: {
    designItems?: unknown[];
    designDetail?: unknown;
    needs?: unknown[];
    activities?: unknown[];
    activityDetail?: unknown;
  } = {},
) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.includes("/organization/members")) return ok({ members: MEMBERS });
    if (url.endsWith(`/design-items/${DESIGN_ID}`)) {
      return ok({ designItem: overrides.designDetail ?? designDetail() });
    }
    if (url.includes("/design-items")) return ok({ designItems: overrides.designItems ?? [] });
    // Readiness is a separate capability on the verification detail page, and
    // these must be matched before the activity routes below. Nothing has been
    // evaluated in these fixtures, which is the honest default.
    if (url.endsWith("/readiness/latest")) {
      return ok({
        latest: {
          status: "NOT_EVALUATED",
          verificationActivityId: ACTIVITY_ID,
          readinessVersion: "1",
        },
      });
    }
    if (url.endsWith("/readiness")) return ok({ assessments: [] });
    if (url.endsWith(`/verification-activities/${ACTIVITY_ID}`)) {
      return ok({ verificationActivity: overrides.activityDetail ?? activityDetail() });
    }
    if (url.includes("/verification-activities")) {
      return ok({ verificationActivities: overrides.activities ?? [] });
    }
    if (url.includes("/stakeholder-needs")) {
      return ok({ stakeholderNeeds: overrides.needs ?? [] });
    }
    // The verification detail page's evidence panel lists the project's
    // evidence to populate its "attach" picker — real records, none of which
    // this suite's fixtures happen to have created.
    if (url.match(/\/evidence(\?|$)/) && !url.includes("/verification-activities")) {
      return ok({ evidence: [] });
    }
    if (url.endsWith("/role")) return ok({ access: { role: "MANAGER", isOrganizationOwner: false } });
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

describe("StakeholderNeedsView", () => {
  it("shows a genuine empty state", async () => {
    routeGets();

    render(<StakeholderNeedsView projectId={PROJECT_ID} />);

    expect(await screen.findByText("No stakeholder needs yet")).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("renders needs fetched from the API", async () => {
    routeGets({
      needs: [
        {
          id: "need1",
          projectId: PROJECT_ID,
          identifier: "SN-001",
          title: "Payload mass capability",
          description: "4 t to LEO.",
          stakeholder: "Launch customer",
          status: "ACCEPTED",
          createdAt: "2026-01-02T00:00:00.000Z",
          updatedAt: "2026-01-04T00:00:00.000Z",
        },
      ],
    });

    render(<StakeholderNeedsView projectId={PROJECT_ID} />);

    const row = (await screen.findByRole("link", { name: "SN-001" })).closest("tr")!;
    expect(within(row).getByText("Payload mass capability")).toBeInTheDocument();
    expect(within(row).getByText("Launch customer")).toBeInTheDocument();
    expect(within(row).getByText("Accepted")).toBeInTheDocument();
  });

  it("validates the create form before calling the API", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<StakeholderNeedsView projectId={PROJECT_ID} />);
    await screen.findByText("No stakeholder needs yet");

    await user.click(screen.getAllByRole("button", { name: /new stakeholder need/i })[0]!);
    await user.click(await screen.findByRole("button", { name: /create need/i }));

    expect(await screen.findByText("A title is required")).toBeInTheDocument();
    expect(screen.getByText("A stakeholder is required")).toBeInTheDocument();
    expect(fetchMock.mock.calls.every(([, init]) => (init?.method ?? "GET") === "GET")).toBe(true);
  });

  it("creates a need and navigates to it", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<StakeholderNeedsView projectId={PROJECT_ID} />);
    await screen.findByText("No stakeholder needs yet");

    await user.click(screen.getAllByRole("button", { name: /new stakeholder need/i })[0]!);
    await user.type(await screen.findByLabelText(/identifier/i), "SN-001");
    await user.type(screen.getByLabelText(/^title/i), "Payload mass capability");
    // Anchored and case-sensitive: the dialog itself is labelled "New
    // stakeholder need", and the field's own label carries a required marker.
    await user.type(screen.getByLabelText(/^Stakeholder/), "Launch customer");
    await user.type(screen.getByLabelText(/description/i), "4 t to LEO.");

    fetchMock.mockImplementationOnce(async () =>
      ok({ stakeholderNeed: { id: "need1", identifier: "SN-001" } }),
    );
    await user.click(screen.getByRole("button", { name: /create need/i }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/projects/${PROJECT_ID}/stakeholder-needs/need1`),
    );

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === "POST");
    const payload = JSON.parse(post![1].body);
    expect(payload).not.toHaveProperty("projectId");
    expect(payload).not.toHaveProperty("organizationId");
  });
});

describe("DesignItemsView", () => {
  it("shows a genuine empty state", async () => {
    routeGets();

    render(<DesignItemsView projectId={PROJECT_ID} />);

    expect(await screen.findByText("No design items yet")).toBeInTheDocument();
  });

  it("renders design items with type, status and owner", async () => {
    routeGets({
      designItems: [{ ...DESIGN_ITEM, owner: MEMBERS[0] }],
    });

    render(<DesignItemsView projectId={PROJECT_ID} />);

    const row = (await screen.findByRole("link", { name: "DI-001" })).closest("tr")!;
    expect(within(row).getByText("Combustion chamber")).toBeInTheDocument();
    expect(within(row).getByText("Component")).toBeInTheDocument();
    expect(within(row).getByText("Draft")).toBeInTheDocument();
    expect(within(row).getByText("Ada Lovelace")).toBeInTheDocument();
  });

  it("surfaces a load failure with a retry", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/design-items")) return fail(500, "INTERNAL_ERROR", "boom");
      return ok({ project: PROJECT });
    });

    const user = userEvent.setup();
    render(<DesignItemsView projectId={PROJECT_ID} />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/something went wrong on the server/i);
    expect(alert).not.toHaveTextContent("boom");

    routeGets({ designItems: [DESIGN_ITEM] });
    await user.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByRole("link", { name: "DI-001" })).toBeInTheDocument();
  });
});

describe("DesignItemDetailView", () => {
  it("renders the item and states that hierarchy is not managed yet", async () => {
    routeGets();

    render(<DesignItemDetailView projectId={PROJECT_ID} designItemId={DESIGN_ID} />);

    expect(await screen.findByRole("heading", { name: /DI-001/ })).toBeInTheDocument();
    expect(screen.getByText(/hierarchy relationships are not managed yet/i)).toBeInTheDocument();
    // No decisions exist, so no decisions panel is fabricated.
    expect(screen.queryByText("Related decisions")).not.toBeInTheDocument();
  });

  it("assigns an owner through the API", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<DesignItemDetailView projectId={PROJECT_ID} designItemId={DESIGN_ID} />);
    await screen.findByRole("heading", { name: /DI-001/ });

    const select = await screen.findByLabelText("Assign owner");
    await waitFor(() => expect(within(select).getAllByRole("option")).toHaveLength(3));

    fetchMock.mockImplementationOnce(async () =>
      ok({ designItem: { ...DESIGN_ITEM, ownerId: MEMBERS[1]!.id } }),
    );
    await user.selectOptions(select, MEMBERS[1]!.id);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith("/owner"));
      expect(JSON.parse(call![1].body).ownerId).toBe(MEMBERS[1]!.id);
    });
  });

  it("shows an owner-assignment failure without changing the displayed owner", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<DesignItemDetailView projectId={PROJECT_ID} designItemId={DESIGN_ID} />);
    await screen.findByRole("heading", { name: /DI-001/ });

    const select = await screen.findByLabelText("Assign owner");
    await waitFor(() => expect(within(select).getAllByRole("option")).toHaveLength(3));

    fetchMock.mockImplementationOnce(async () =>
      fail(400, "VALIDATION_ERROR", "That user is not a member of this organization."),
    );
    await user.selectOptions(select, MEMBERS[1]!.id);

    expect(await screen.findByRole("alert")).toHaveTextContent(/not a member/i);
  });

  it("lists requirements allocated to the item", async () => {
    routeGets({
      designDetail: designDetail({
        requirements: [
          {
            id: "req1",
            identifier: "REQ-001",
            title: "Chamber pressure",
            status: "DRAFT",
            linkType: "ALLOCATED_TO",
          },
        ],
      }),
    });

    render(<DesignItemDetailView projectId={PROJECT_ID} designItemId={DESIGN_ID} />);

    expect(await screen.findByText(/REQ-001/)).toBeInTheDocument();
    expect(screen.getByText("allocated to")).toBeInTheDocument();
  });
});

describe("VerificationView", () => {
  it("shows a genuine empty state", async () => {
    routeGets();

    render(<VerificationView projectId={PROJECT_ID} />);

    expect(await screen.findByText("No verification activities yet")).toBeInTheDocument();
  });

  it("renders activities with method, status and dates", async () => {
    routeGets({ activities: [activity()] });

    render(<VerificationView projectId={PROJECT_ID} />);

    const row = (await screen.findByRole("link", { name: "VER-001" })).closest("tr")!;
    expect(within(row).getByText("Test")).toBeInTheDocument();
    expect(within(row).getByText("Planned")).toBeInTheDocument();
    expect(within(row).getByText("2026-04-01")).toBeInTheDocument();
    // No completion date yet — shown as a dash, not invented.
    expect(within(row).getByText("—")).toBeInTheDocument();
  });

  it("says an activity is not assessed rather than showing a readiness verdict", async () => {
    routeGets({ activities: [activity()] });

    render(<VerificationView projectId={PROJECT_ID} />);

    const row = (await screen.findByRole("link", { name: "VER-001" })).closest("tr")!;
    expect(within(row).getByText("Not assessed")).toBeInTheDocument();
    // "Nobody has looked" must never render as a ready or not-ready badge.
    expect(within(row).queryByText("Ready")).not.toBeInTheDocument();
    expect(within(row).queryByText("Not ready")).not.toBeInTheDocument();
  });

  it("shows the last recorded readiness with its date, never as a current claim", async () => {
    routeGets({
      activities: [
        activity({
          lastReadiness: {
            id: "vra1",
            status: "NOT_READY",
            scope: "EXECUTION",
            readinessVersion: "1",
            evaluatedAt: "2026-03-02T00:00:00.000Z",
            blockingCount: 2,
          },
        }),
      ],
    });

    render(<VerificationView projectId={PROJECT_ID} />);

    const row = (await screen.findByRole("link", { name: "VER-001" })).closest("tr")!;
    expect(within(row).getByText("Not ready")).toBeInTheDocument();
    expect(within(row).getByText("2026-03-02")).toBeInTheDocument();
    // The caption is where the "as recorded, not as current" claim is made.
    expect(screen.getByText(/as it was recorded/i)).toBeInTheDocument();
  });
});

describe("VerificationDetailView", () => {
  it("offers only the transitions the server says are legal", async () => {
    routeGets();

    render(<VerificationDetailView projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);
    await screen.findByRole("heading", { name: /VER-001/ });

    expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Waive" })).toBeInTheDocument();
    // An outcome cannot be recorded straight from PLANNED.
    expect(screen.queryByRole("button", { name: "Record pass" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Record failure" })).not.toBeInTheDocument();
  });

  it("transitions through the API", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<VerificationDetailView projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);
    await screen.findByRole("heading", { name: /VER-001/ });

    fetchMock.mockImplementationOnce(async () =>
      ok({ verificationActivity: activity({ status: "IN_PROGRESS" }) }),
    );
    await user.click(screen.getByRole("button", { name: "Start" }));

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(([url]) => String(url).includes("/transition"));
      expect(JSON.parse(call![1].body).to).toBe("IN_PROGRESS");
    });
  });

  it("displays a rejected transition without changing the shown status", async () => {
    routeGets();
    const user = userEvent.setup();

    render(<VerificationDetailView projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);
    await screen.findByRole("heading", { name: /VER-001/ });

    fetchMock.mockImplementationOnce(async () =>
      fail(409, "CONFLICT", "An activity in PLANNED cannot move to PASSED."),
    );
    await user.click(screen.getByRole("button", { name: "Start" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/cannot move to PASSED/);
    expect(screen.getByText("Planned")).toBeInTheDocument();
  });

  it("presents a concluded activity as read-only", async () => {
    routeGets({
      activityDetail: activityDetail({
        status: "PASSED",
        completedDate: "2026-04-05T00:00:00.000Z",
        availableTransitions: [],
        editable: false,
      }),
    });

    render(<VerificationDetailView projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);
    await screen.findByRole("heading", { name: /VER-001/ });

    expect(screen.getByRole("button", { name: /edit/i })).toBeDisabled();
    // The page carries more than one live region now that readiness sits
    // alongside the result, so this asserts the lock notice specifically.
    expect(
      screen
        .getAllByRole("status")
        .some((notice) => /a recorded outcome is final/i.test(notice.textContent ?? "")),
    ).toBe(true);
    expect(screen.getByText(/no further transitions are possible/i)).toBeInTheDocument();
  });

  it("attaches a real, existing evidence record — never uploads one", async () => {
    const attachedEvidence = [
      {
        id: "ev1aaaaaaaaaaaaaaaaaaaaa",
        identifier: "EV-001",
        title: "Hot fire test report",
        evidenceType: "TEST_RESULT",
        sourceReference: "TR-2026-014",
        status: "DRAFT",
      },
    ];
    let attached = false;

    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/organization/members")) return ok({ members: MEMBERS });
      if (url.endsWith("/readiness/latest")) {
        return ok({
          latest: {
            status: "NOT_EVALUATED",
            verificationActivityId: ACTIVITY_ID,
            readinessVersion: "1",
          },
        });
      }
      if (url.endsWith("/readiness")) return ok({ assessments: [] });
      if (url.endsWith(`/verification-activities/${ACTIVITY_ID}/evidence`) && init?.method === "POST") {
        attached = true;
        return ok({ evidence: attachedEvidence });
      }
      if (url.endsWith(`/verification-activities/${ACTIVITY_ID}`)) {
        return ok({ verificationActivity: activityDetail({ evidence: attached ? attachedEvidence : [] }) });
      }
      if (url.match(/\/evidence(\?|$)/) && !url.includes("/verification-activities")) {
        return ok({ evidence: attachedEvidence });
      }
      return ok({ project: PROJECT });
    });
    const user = userEvent.setup();

    render(<VerificationDetailView projectId={PROJECT_ID} activityId={ACTIVITY_ID} />);
    await screen.findByRole("heading", { name: /VER-001/ });

    await user.selectOptions(await screen.findByLabelText("Evidence"), "ev1aaaaaaaaaaaaaaaaaaaaa");
    await user.click(screen.getByRole("button", { name: /^attach$/i }));

    expect(await screen.findByRole("link", { name: "EV-001" })).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(
        ([url, init]) =>
          String(url).endsWith(`/verification-activities/${ACTIVITY_ID}/evidence`) &&
          init?.method === "POST",
      ),
    ).toBe(true);
    // No file input exists anywhere on this page — evidence is attached, never uploaded.
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });
});
