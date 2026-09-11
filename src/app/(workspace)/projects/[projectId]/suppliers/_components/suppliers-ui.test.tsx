import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The supplier engineering workspace, driven through the real API client with a
 * faked `fetch`. Only the network is replaced, so what these views render is
 * exactly what the server said — no count, status or verdict is derived in the
 * browser.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const { SuppliersView } = await import("./suppliers-view");
const { SupplierDetailView } = await import("./supplier-detail-view");
const { SuppliedItemDetailView } = await import("./supplied-item-detail-view");
const { QualificationDetailView } = await import("./qualification-detail-view");

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";
const SUPPLIER_ID = "sup1aaaaaaaaaaaaaaaaaaa";
const ITEM_ID = "item1aaaaaaaaaaaaaaaaaa";
const QUAL_ID = "qual1aaaaaaaaaaaaaaaaaa";

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

function supplier(overrides: Record<string, unknown> = {}) {
  return {
    id: SUPPLIER_ID,
    projectId: PROJECT_ID,
    identifier: "SUP-001",
    name: "Vulcan Alloys",
    description: "Nickel superalloy forgings.",
    status: "ACTIVE",
    createdAt: "2026-01-02T00:00:00.000Z",
    updatedAt: "2026-01-02T00:00:00.000Z",
    suppliedItemCount: 2,
    qualificationCount: 1,
    ...overrides,
  };
}

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: ITEM_ID,
    projectId: PROJECT_ID,
    supplierId: SUPPLIER_ID,
    identifier: "SI-001",
    name: "Inconel 718 billet",
    description: null,
    itemType: "MATERIAL",
    status: "ACTIVE",
    createdAt: "2026-01-03T00:00:00.000Z",
    updatedAt: "2026-01-03T00:00:00.000Z",
    supplier: { id: SUPPLIER_ID, identifier: "SUP-001", name: "Vulcan Alloys", status: "ACTIVE" },
    ...overrides,
  };
}

function qualification(overrides: Record<string, unknown> = {}) {
  return {
    id: QUAL_ID,
    projectId: PROJECT_ID,
    supplierId: SUPPLIER_ID,
    suppliedItemId: ITEM_ID,
    title: "VIM material qualification",
    qualificationType: "MATERIAL",
    status: "ACTIVE",
    evidenceReference: "QMS-2026-114",
    effectiveDate: "2026-01-01T00:00:00.000Z",
    expiryDate: "2027-01-01T00:00:00.000Z",
    createdAt: "2026-01-04T00:00:00.000Z",
    updatedAt: "2026-01-04T00:00:00.000Z",
    supplier: { id: SUPPLIER_ID, identifier: "SUP-001", name: "Vulcan Alloys" },
    suppliedItem: { id: ITEM_ID, identifier: "SI-001", name: "Inconel 718 billet" },
    ...overrides,
  };
}

type TargetOption = { id: string; identifier: string; title: string };

const EMPTY_TARGETS: Record<string, TargetOption[]> = {
  DESIGN_ITEM: [],
  REQUIREMENT: [],
  VERIFICATION_ACTIVITY: [],
  ENGINEERING_DECISION: [],
  RISK: [],
  EVIDENCE: [],
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// --- Supplier list ----------------------------------------------------------

describe("SuppliersView", () => {
  function routeList(suppliers: unknown[]) {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/suppliers")) return ok({ suppliers });
      if (url.includes(`/api/projects/${PROJECT_ID}`)) return ok({ project: PROJECT });
      return fail(404, "NOT_FOUND", "No route");
    });
  }

  it("lists suppliers with the counts the server returned", async () => {
    routeList([supplier()]);

    render(<SuppliersView projectId={PROJECT_ID} />);

    expect(await screen.findByRole("link", { name: "SUP-001" })).toBeInTheDocument();
    expect(screen.getByText("Vulcan Alloys")).toBeInTheDocument();
    // Real aggregates from the list query, not derived in the browser.
    const row = screen.getByRole("row", { name: /SUP-001/ });
    expect(within(row).getByText("2")).toBeInTheDocument();
  });

  it("shows an honest empty state rather than a placeholder row", async () => {
    routeList([]);

    render(<SuppliersView projectId={PROJECT_ID} />);

    expect(await screen.findByText(/No suppliers yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("filters by status through the API rather than in the browser", async () => {
    routeList([supplier()]);
    const user = userEvent.setup();

    render(<SuppliersView projectId={PROJECT_ID} />);
    await screen.findByRole("link", { name: "SUP-001" });

    await user.selectOptions(screen.getByLabelText("Status"), "UNDER_REVIEW");

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([url]) => String(url).includes("status=UNDER_REVIEW")),
      ).toBe(true);
    });
  });

  it("surfaces an API error with a retry rather than an empty table", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/suppliers")) return fail(500, "INTERNAL", "Database unreachable");
      return ok({ project: PROJECT });
    });

    render(<SuppliersView projectId={PROJECT_ID} />);

    // The client deliberately does not pass a raw server error through for a
    // 500 — it says something went wrong without leaking internals.
    expect(await screen.findByRole("alert")).toHaveTextContent(/went wrong on the server/i);
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("says plainly that this is not a procurement record", async () => {
    routeList([supplier()]);

    render(<SuppliersView projectId={PROJECT_ID} />);

    expect(await screen.findByText(/Not a procurement record/i)).toBeInTheDocument();
  });

  it("shows no rating, tier or score anywhere", async () => {
    routeList([supplier()]);

    const { container } = render(<SuppliersView projectId={PROJECT_ID} />);
    await screen.findByRole("link", { name: "SUP-001" });

    expect(container.textContent).not.toMatch(/rating|tier|preferred|score|health/i);
  });
});

// --- Supplier detail --------------------------------------------------------

describe("SupplierDetailView", () => {
  function routeDetail(overrides: Record<string, unknown> = {}) {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes(`/suppliers/${SUPPLIER_ID}`)) {
        return ok({
          supplier: {
            ...supplier(),
            suppliedItems: [item()],
            qualifications: [qualification()],
            history: [],
            ...overrides,
          },
        });
      }
      if (url.includes("/suppliers")) return ok({ suppliers: [supplier()] });
      return fail(404, "NOT_FOUND", "No route");
    });
  }

  it("shows the supplier, its items and its qualifications", async () => {
    routeDetail();

    render(<SupplierDetailView projectId={PROJECT_ID} supplierId={SUPPLIER_ID} />);

    expect(await screen.findByRole("heading", { name: "Vulcan Alloys" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /SI-001 — Inconel 718 billet/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /VIM material qualification/ })).toBeInTheDocument();
  });

  it("shows supplier and qualification status side by side without reconciling them", async () => {
    // ACTIVE supplier with an EXPIRED qualification is a real state. The page
    // must show both rather than blending them into one indicator.
    routeDetail({
      status: "ACTIVE",
      suppliedItems: [],
      qualifications: [qualification({ status: "EXPIRED" })],
    });

    render(<SupplierDetailView projectId={PROJECT_ID} supplierId={SUPPLIER_ID} />);

    await screen.findByRole("heading", { name: "Vulcan Alloys" });
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("explains that a supplier with no items reaches nothing", async () => {
    routeDetail({ suppliedItems: [] });

    render(<SupplierDetailView projectId={PROJECT_ID} supplierId={SUPPLIER_ID} />);

    expect(
      await screen.findByText(/a change to this supplier will find nothing until an item is added/i),
    ).toBeInTheDocument();
  });

  it("surfaces a load error", async () => {
    fetchMock.mockImplementation(async () => fail(404, "NOT_FOUND", "Supplier was not found."));

    render(<SupplierDetailView projectId={PROJECT_ID} supplierId={SUPPLIER_ID} />);

    // A 404 is reported without confirming whether the record exists.
    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer exists/i);
  });
});

// --- Supplied item detail ---------------------------------------------------

describe("SuppliedItemDetailView", () => {
  function routeItem(links: unknown[] = [], targets = EMPTY_TARGETS) {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/supplied-item-link-targets")) return ok({ targets });
      if (url.includes(`/supplied-items/${ITEM_ID}`)) {
        return ok({
          suppliedItem: { ...item(), links, qualifications: [], history: [] },
        });
      }
      return fail(404, "NOT_FOUND", "No route");
    });
  }

  it("shows the item, its type and its supplier", async () => {
    routeItem();

    render(<SuppliedItemDetailView projectId={PROJECT_ID} suppliedItemId={ITEM_ID} />);

    expect(await screen.findByRole("heading", { name: "Inconel 718 billet" })).toBeInTheDocument();
    expect(screen.getByText("Material")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /SUP-001/ }).length).toBeGreaterThan(0);
  });

  it("lists the engineering relationships that make impact answerable", async () => {
    routeItem([
      {
        relation: "DESIGN_ITEM",
        targetId: "d1",
        identifier: "DI-001",
        title: "Combustion chamber",
        note: null,
        createdAt: "2026-01-05T00:00:00.000Z",
      },
      {
        relation: "REQUIREMENT",
        targetId: "r1",
        identifier: "REQ-001",
        title: "Chamber pressure",
        note: null,
        createdAt: "2026-01-05T00:00:00.000Z",
      },
    ]);

    render(<SuppliedItemDetailView projectId={PROJECT_ID} suppliedItemId={ITEM_ID} />);

    const list = await screen.findByRole("list");
    expect(within(list).getByText(/DI-001/)).toBeInTheDocument();
    expect(within(list).getByText(/REQ-001/)).toBeInTheDocument();
    // Each link names the relationship it represents. Scoped to the list so the
    // relation *picker's* options are not what satisfies the assertion.
    expect(within(list).getByText("Design item")).toBeInTheDocument();
    expect(within(list).getByText("Requirement")).toBeInTheDocument();
  });

  it("says plainly that an unlinked item produces no downstream findings", async () => {
    routeItem([]);

    render(<SuppliedItemDetailView projectId={PROJECT_ID} suppliedItemId={ITEM_ID} />);

    expect(
      await screen.findByText(/will produce no downstream findings/i),
    ).toBeInTheDocument();
  });

  it("offers every declared relation in the picker", async () => {
    routeItem();

    render(<SuppliedItemDetailView projectId={PROJECT_ID} suppliedItemId={ITEM_ID} />);

    const select = await screen.findByLabelText("Relationship");
    const options = within(select).getAllByRole("option").map((o) => o.textContent);
    expect(options).toEqual([
      "Design item",
      "Requirement",
      "Verification activity",
      "Decision",
      "Risk",
      "Evidence",
    ]);
  });

  it("offers only targets the project actually has", async () => {
    routeItem([], {
      ...EMPTY_TARGETS,
      DESIGN_ITEM: [{ id: "d1", identifier: "DI-001", title: "Combustion chamber" }],
    });

    render(<SuppliedItemDetailView projectId={PROJECT_ID} suppliedItemId={ITEM_ID} />);

    const select = await screen.findByLabelText("Artifact");
    await waitFor(() => {
      expect(within(select).getByRole("option", { name: /DI-001/ })).toBeInTheDocument();
    });
  });

  it("says so honestly when a relation has no targets rather than offering nothing", async () => {
    routeItem();

    render(<SuppliedItemDetailView projectId={PROJECT_ID} suppliedItemId={ITEM_ID} />);

    const select = await screen.findByLabelText("Artifact");
    expect(within(select).getByText(/None recorded in this project/i)).toBeInTheDocument();
  });

  it("posts a link and surfaces a rejection", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (url.includes("/supplied-item-link-targets")) {
        return ok({
          targets: {
            ...EMPTY_TARGETS,
            DESIGN_ITEM: [{ id: "d1", identifier: "DI-001", title: "Combustion chamber" }],
          },
        });
      }
      if (url.includes("/links") && init?.method === "POST") {
        return fail(400, "VALIDATION_ERROR", "That design item does not exist in this project.");
      }
      if (url.includes(`/supplied-items/${ITEM_ID}`)) {
        return ok({ suppliedItem: { ...item(), links: [], qualifications: [], history: [] } });
      }
      return fail(404, "NOT_FOUND", "No route");
    });
    const user = userEvent.setup();

    render(<SuppliedItemDetailView projectId={PROJECT_ID} suppliedItemId={ITEM_ID} />);

    const select = await screen.findByLabelText("Artifact");
    await waitFor(() => {
      expect(within(select).getByRole("option", { name: /DI-001/ })).toBeInTheDocument();
    });
    await user.selectOptions(select, "d1");
    await user.click(screen.getByRole("button", { name: /add link/i }));

    expect(
      await screen.findByText(/That design item does not exist in this project/i),
    ).toBeInTheDocument();
  });
});

// --- Qualification detail ---------------------------------------------------

describe("QualificationDetailView", () => {
  function routeQualification(overrides: Record<string, unknown> = {}) {
    fetchMock.mockImplementation(async (url: string) => {
      if (url.includes("/decision-link-targets")) {
        return ok({ targets: { REQUIREMENT: [], DESIGN_ITEM: [], RISK: [], ISSUE: [], EVIDENCE: [] } });
      }
      if (url.includes(`/supplier-qualifications/${QUAL_ID}`)) {
        return ok({
          qualification: { ...qualification(), evidence: [], history: [], ...overrides },
        });
      }
      return fail(404, "NOT_FOUND", "No route");
    });
  }

  it("shows the qualification with both parents", async () => {
    routeQualification();

    render(<QualificationDetailView projectId={PROJECT_ID} qualificationId={QUAL_ID} />);

    expect(
      await screen.findByRole("heading", { name: "VIM material qualification" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Material")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /SI-001/ })).toBeInTheDocument();
  });

  it("says a source qualification covers no single item", async () => {
    routeQualification({ suppliedItemId: null, suppliedItem: null, qualificationType: "SOURCE" });

    render(<QualificationDetailView projectId={PROJECT_ID} qualificationId={QUAL_ID} />);

    expect(
      await screen.findByText(/qualifies the supplier as a source/i),
    ).toBeInTheDocument();
  });

  it("reports a passed expiry date without changing the status", async () => {
    // The central discipline: a lapsed date is a fact, not a verdict.
    routeQualification({ status: "ACTIVE", expiryDate: "2020-01-01T00:00:00.000Z" });

    render(<QualificationDetailView projectId={PROJECT_ID} qualificationId={QUAL_ID} />);

    expect(await screen.findByText(/The recorded expiry date has passed/i)).toBeInTheDocument();
    expect(screen.getByText(/not one this system will make/i)).toBeInTheDocument();
    // The badge still reads what was recorded.
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.queryByText("Expired")).not.toBeInTheDocument();
  });

  it("does not warn when the recorded status already says EXPIRED", async () => {
    routeQualification({ status: "EXPIRED", expiryDate: "2020-01-01T00:00:00.000Z" });

    render(<QualificationDetailView projectId={PROJECT_ID} qualificationId={QUAL_ID} />);

    await screen.findByRole("heading", { name: "VIM material qualification" });
    expect(screen.queryByText(/The recorded expiry date has passed/i)).not.toBeInTheDocument();
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("says it stores no files", async () => {
    routeQualification();

    render(<QualificationDetailView projectId={PROJECT_ID} qualificationId={QUAL_ID} />);

    expect(await screen.findByText(/this system stores no files/i)).toBeInTheDocument();
  });

  it("says plainly that it is not a certification record", async () => {
    routeQualification();

    render(<QualificationDetailView projectId={PROJECT_ID} qualificationId={QUAL_ID} />);

    expect(await screen.findByText(/not a certification record/i)).toBeInTheDocument();
  });

  it("surfaces a load error", async () => {
    fetchMock.mockImplementation(async () =>
      fail(404, "NOT_FOUND", "Supplier qualification was not found."),
    );

    render(<QualificationDetailView projectId={PROJECT_ID} qualificationId={QUAL_ID} />);

    expect(await screen.findByRole("alert")).toHaveTextContent(/no longer exists/i);
  });
});
