import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The certification workspace views, driven through the real API client with a
 * faked `fetch`. Only the network is replaced, so what these views render is
 * exactly what the server said.
 *
 * No test here asserts a percentage, a score, or the words "certified" /
 * "FAA compliant" / "EASA approved" — the interface must never show any of
 * them, and several tests assert their absence directly.
 */

const { CertificationView } = await import("./_components/certification-view");
const { ItemsView } = await import("./items/_components/items-view");
const { ItemDetailView } = await import("./items/[itemId]/_components/item-detail-view");
const { ReviewView } = await import("./review/_components/review-view");

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";
const PROGRAM_ID = "prog1aaaaaaaaaaaaaaaaaa";
const BASIS_ID = "basis1aaaaaaaaaaaaaaaaa";
const ITEM_ID = "item1aaaaaaaaaaaaaaaaaa";

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

function fail(status: number, code: string, message: string): Response {
  return { ok: false, status, json: async () => ({ error: { code, message } }) } as unknown as Response;
}

const PROJECT = {
  id: PROJECT_ID,
  name: "Upper Stage Avionics",
  description: null,
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const PROGRAM = {
  id: PROGRAM_ID,
  projectId: PROJECT_ID,
  identifier: "CERT-001",
  name: "Avionics certification effort",
  description: null,
  status: "DRAFT",
  ownerId: null,
  createdAt: "2026-01-02T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

function basis(overrides: Record<string, unknown> = {}) {
  return {
    id: BASIS_ID,
    certificationProgramId: PROGRAM_ID,
    identifier: "CB-001",
    title: "Part 25 Amdt 25-141",
    description: null,
    revision: "Amdt 25-141",
    sourceReference: null,
    status: "DRAFT",
    supersededById: null,
    createdAt: "2026-01-03T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
    ...overrides,
  };
}

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    certificationBasisId: BASIS_ID,
    identifier: "CI-001",
    title: "Cabin pressurization limits",
    description: null,
    applicability: "UNDETERMINED",
    applicabilityRationale: null,
    applicabilityReviewerId: null,
    applicabilityReviewedAt: null,
    method: null,
    status: "OPEN",
    disposition: "UNASSESSED",
    createdAt: "2026-01-04T00:00:00.000Z",
    updatedAt: "2026-01-04T00:00:00.000Z",
    _count: { findings: 0 },
    ...overrides,
  };
}

function review(overrides: Record<string, unknown> = {}) {
  return {
    review: {
      id: "review1",
      certificationProgramId: PROGRAM_ID,
      status: "READY",
      reviewVersion: "1",
      fingerprint: "fp1",
      summary: "No blocking conditions found across 2 findings (1 warning).",
      evaluatedAt: "2026-02-01T00:00:00.000Z",
      evaluatedById: "u1",
      createdAt: "2026-02-01T00:00:00.000Z",
      counts: { findingCount: 2, blockingCount: 0, warningCount: 1, informationalCount: 1, unknownCount: 0 },
    },
    freshness: "CURRENT",
    findings: [
      {
        id: "rf1",
        reviewId: "review1",
        ruleId: "CR-APL-002",
        category: "APPLICABILITY",
        status: "INFORMATIONAL",
        subjectType: "COMPLIANCE_ITEM",
        subjectId: ITEM_ID,
        subjectIdentifier: "CI-001",
        subjectLabel: "Cabin pressurization limits",
        message: "CI-001 was determined APPLICABLE.",
        basis: ["APPLICABILITY_RECORDED"],
        sequence: 0,
        createdAt: "2026-02-01T00:00:00.000Z",
      },
    ],
    basis: {},
    ...overrides,
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

describe("CertificationView", () => {
  function route({
    programBody = { program: PROGRAM } as { program: typeof PROGRAM | null },
    bases = [basis()],
  } = {}) {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/certification/program")) return ok(programBody);
      if (url.includes("/certification/bases")) return ok({ bases });
      if (/\/api\/projects\/[^/]+$/.test(url)) return ok({ project: PROJECT });
      return fail(404, "NOT_FOUND", "No route");
    });
  }

  it("shows a create-programme prompt when none exists yet, never a blank crash", async () => {
    route({ programBody: { program: null } });

    render(<CertificationView projectId={PROJECT_ID} />);

    expect(await screen.findByText(/no certification programme yet/i)).toBeInTheDocument();
  });

  it("renders the programme without ever claiming regulatory approval", async () => {
    route();

    render(<CertificationView projectId={PROJECT_ID} />);

    await screen.findByText(PROGRAM.name);
    expect(screen.queryByText(/certified/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/FAA/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/EASA/i)).not.toBeInTheDocument();
  });

  it("lists certification bases with their status", async () => {
    route();

    render(<CertificationView projectId={PROJECT_ID} />);

    expect(await screen.findByText("CB-001")).toBeInTheDocument();
    expect(screen.getByText("Part 25 Amdt 25-141")).toBeInTheDocument();
  });

  it("shows an Activate action only for a DRAFT basis", async () => {
    route({ bases: [basis({ status: "ACTIVE" }), basis({ id: "basis2", identifier: "CB-002", status: "DRAFT" })] });

    render(<CertificationView projectId={PROJECT_ID} />);

    await screen.findByText("CB-002");
    const activateButtons = screen.getAllByRole("button", { name: /activate/i });
    expect(activateButtons).toHaveLength(1);
  });
});

describe("ItemsView", () => {
  function route({ bases = [basis({ status: "ACTIVE" })], items = [item()] } = {}) {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/certification/bases")) return ok({ bases });
      if (url.includes("/certification/items")) return ok({ items });
      return fail(404, "NOT_FOUND", "No route");
    });
  }

  it("does not evaluate anything on load — it only lists", async () => {
    route();

    render(<ItemsView projectId={PROJECT_ID} />);

    await screen.findByText("Cabin pressurization limits");
    const wrote = fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(wrote).toBe(false);
  });

  it("shows the applicability, status and disposition badges for each item", async () => {
    route();

    render(<ItemsView projectId={PROJECT_ID} />);

    const row = await screen.findByRole("row", { name: /CI-001/ });
    expect(row).toHaveTextContent("Undetermined");
    expect(row).toHaveTextContent("Open");
    expect(row).toHaveTextContent("Unassessed");
  });

  it("filters by applicability without a server round trip", async () => {
    route({
      items: [item(), item({ id: "item2", identifier: "CI-002", applicability: "APPLICABLE" })],
    });
    const user = userEvent.setup();

    render(<ItemsView projectId={PROJECT_ID} />);

    await screen.findByText("CI-002");
    // The Applicability filter is the first of the three filter selects.
    const select = screen.getAllByRole("combobox")[0];
    expect(select).toBeDefined();
    await user.selectOptions(select as HTMLSelectElement, "APPLICABLE");

    expect(screen.queryByText("CI-001")).not.toBeInTheDocument();
    expect(screen.getByText("CI-002")).toBeInTheDocument();
  });

  it("prompts to activate a basis first when none is active, rather than offering to create items against nothing", async () => {
    route({ bases: [basis({ status: "DRAFT" })], items: [] });

    render(<ItemsView projectId={PROJECT_ID} />);

    expect(await screen.findByText(/no active certification basis/i)).toBeInTheDocument();
  });
});

describe("ItemDetailView", () => {
  function route({
    itemBody = item(),
    links = [] as unknown[],
    findings = [] as unknown[],
    targets = {
      REQUIREMENT: [{ id: "req1", identifier: "REQ-001", title: "Cabin pressurization" }],
      VERIFICATION_ACTIVITY: [],
      EVIDENCE: [],
      ENGINEERING_DECISION: [],
      DESIGN_ITEM: [],
      RISK: [],
      ISSUE: [],
      SUPPLIER_QUALIFICATION: [],
    },
  } = {}) {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/link-targets")) return ok({ targets });
      if (url.includes("/links") && init?.method === "POST") {
        return ok({
          link: {
            id: "REQUIREMENT:newlink",
            complianceItemId: ITEM_ID,
            linkType: "REQUIREMENT",
            targetId: "req1",
            targetIdentifier: "REQ-001",
            targetLabel: "Cabin pressurization",
            note: null,
            createdAt: "2026-02-01T00:00:00.000Z",
            createdById: "u1",
          },
        });
      }
      if (url.includes("/links")) return ok({ links });
      if (url.includes("/findings")) return ok({ findings });
      if (url.includes("/certification/items/")) {
        if (init?.method === "PATCH") {
          const body = JSON.parse(String(init.body));
          return ok({ item: { ...itemBody, ...body } });
        }
        return ok({ item: itemBody });
      }
      return fail(404, "NOT_FOUND", "No route");
    });
  }

  it("never shows a disposition other than exactly what the item record carries", async () => {
    route({ itemBody: item({ disposition: "UNASSESSED" }) });

    render(<ItemDetailView projectId={PROJECT_ID} itemId={ITEM_ID} />);

    const header = await screen.findByText("CI-001");
    expect(header.closest("div")?.parentElement).toHaveTextContent("Unassessed");
  });

  it("saving applicability sends exactly the applicability and rationale, not a derived disposition", async () => {
    route();
    const user = userEvent.setup();

    render(<ItemDetailView projectId={PROJECT_ID} itemId={ITEM_ID} />);

    await screen.findByText("CI-001");
    // Locate the Applicability & method panel's select specifically — it is
    // the only combobox whose current value is UNDETERMINED.
    const panelSelect = screen
      .getAllByRole("combobox")
      .find((el) => (el as HTMLSelectElement).value === "UNDETERMINED");
    expect(panelSelect).toBeDefined();
    await user.selectOptions(panelSelect as HTMLSelectElement, "APPLICABLE");

    const saveButton = await screen.findByRole("button", { name: /save applicability/i });
    await user.click(saveButton);

    await waitFor(() => {
      const patchCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          typeof url === "string" &&
          url.includes(`/certification/items/${ITEM_ID}`) &&
          (init as RequestInit | undefined)?.method === "PATCH",
      );
      expect(patchCall).toBeDefined();
      const body = JSON.parse(String((patchCall?.[1] as RequestInit).body));
      expect(body).toHaveProperty("applicability", "APPLICABLE");
      expect(body).not.toHaveProperty("disposition");
    });
  });

  it("lists an engineering link with its identifier", async () => {
    route({
      links: [
        {
          id: "REQUIREMENT:link1",
          complianceItemId: ITEM_ID,
          linkType: "REQUIREMENT",
          targetId: "req1",
          targetIdentifier: "REQ-001",
          targetLabel: "Cabin pressurization",
          note: null,
          createdAt: "2026-01-10T00:00:00.000Z",
          createdById: "u1",
        },
      ],
    });

    render(<ItemDetailView projectId={PROJECT_ID} itemId={ITEM_ID} />);

    expect(await screen.findByText(/REQ-001/)).toBeInTheDocument();
  });

  it("shows an empty state, not a crash, when there are no findings", async () => {
    route();

    render(<ItemDetailView projectId={PROJECT_ID} itemId={ITEM_ID} />);

    expect(await screen.findByText(/no findings recorded/i)).toBeInTheDocument();
  });
});

describe("ReviewView", () => {
  function route({
    latest,
    history = [] as unknown[],
  }: { latest?: unknown; history?: unknown[] } = {
    latest: { status: "NOT_EVALUATED", certificationProgramId: PROGRAM_ID, reviewVersion: "1" },
  }) {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/reviews/latest")) return ok({ report: latest });
      if (init?.method === "POST" && url.includes("/reviews")) return ok({ report: review() });
      if (url.includes("/reviews/")) return ok({ report: review() });
      if (url.includes("/reviews")) return ok({ reviews: history });
      return fail(404, "NOT_FOUND", "No route");
    });
  }

  it("does not evaluate on load", async () => {
    route();

    render(<ReviewView projectId={PROJECT_ID} />);

    await screen.findByText(/no certification review has been evaluated yet/i);
    const wrote = fetchMock.mock.calls.some(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(wrote).toBe(false);
  });

  it("shows NOT_EVALUATED distinctly rather than a zero-finding report", async () => {
    route();

    render(<ReviewView projectId={PROJECT_ID} />);

    expect(await screen.findByText(/no certification review has been evaluated yet/i)).toBeInTheDocument();
  });

  it("never renders a percentage or the word certified anywhere on the page", async () => {
    route({ latest: review(), history: [review().review] });

    render(<ReviewView projectId={PROJECT_ID} />);

    await screen.findAllByText(/ready for internal review/i);
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\bcertified\b/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/FAA/)).not.toBeInTheDocument();
    expect(screen.queryByText(/EASA/)).not.toBeInTheDocument();
  });

  it("evaluating replaces the shown report with a fresh one, explicitly", async () => {
    route();
    const user = userEvent.setup();

    render(<ReviewView projectId={PROJECT_ID} />);

    await screen.findByText(/no certification review has been evaluated yet/i);
    const evaluateButtons = screen.getAllByRole("button", { name: /evaluate certification review/i });
    await user.click(evaluateButtons[0] as HTMLElement);

    await screen.findByText(/ready for internal review/i);
    const postCall = fetchMock.mock.calls.find(([, init]) => (init as RequestInit | undefined)?.method === "POST");
    expect(postCall).toBeDefined();
  });

  it("shows finding rule ids and messages in the findings table", async () => {
    route({ latest: review() });

    render(<ReviewView projectId={PROJECT_ID} />);

    const row = await screen.findByRole("row", { name: /CR-APL-002/ });
    expect(row).toHaveTextContent("CI-001");
    expect(row).toHaveTextContent("was determined APPLICABLE");
  });

  it("opens a historical review read-only", async () => {
    route({ latest: review(), history: [{ ...review().review, id: "review-old" }] });
    const user = userEvent.setup();

    render(<ReviewView projectId={PROJECT_ID} />);

    await screen.findByText(/review history/i);
    const openButton = await screen.findByRole("button", { name: /open/i });
    await user.click(openButton);

    expect(await screen.findByText(/viewing a historical review, read-only/i)).toBeInTheDocument();
  });
});
