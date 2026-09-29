import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The traceability matrix UI driven through the real API client with a
 * faked `fetch`. No test here asserts a percentage or a computed coverage
 * score, because the view never renders one — only counts.
 */

vi.mock("next/navigation", () => ({
  usePathname: () => "/projects/proj1aaaaaaaaaaaaaaaaaaa/traceability/matrix",
  useSearchParams: () => new URLSearchParams(),
}));

const { TraceabilityMatrixView } = await import("./traceability-matrix-view");

const PROJECT_ID = "proj1aaaaaaaaaaaaaaaaaaa";

const PROJECT = {
  id: PROJECT_ID,
  organizationId: "org1",
  name: "Upper Stage Propulsion",
  description: null,
  status: "ACTIVE",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

function baseMatrix(overrides: Record<string, unknown> = {}) {
  return {
    rowAxis: "REQUIREMENT",
    columnAxis: "VERIFICATION_ACTIVITY",
    rows: [],
    columns: [],
    cells: [],
    uncoveredRowIds: [],
    uncoveredColumnIds: [],
    ...overrides,
  };
}

function ok(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/traceability-matrix")) return ok({ matrix: currentMatrix });
    if (url.includes("/projects/") && !url.includes("/traceability-matrix")) return ok({ project: PROJECT });
    return ok({});
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

let currentMatrix: unknown = baseMatrix();

describe("TraceabilityMatrixView", () => {
  it("shows every requirement covered when there are no gaps", async () => {
    currentMatrix = baseMatrix({
      rows: [{ id: "r1", identifier: "REQ-001", title: "Max chamber pressure" }],
      columns: [{ id: "v1", identifier: "VER-001", title: "Hot fire test" }],
      cells: [{ rowId: "r1", columnId: "v1", linkId: "link1", note: null, createdAt: "2026-02-01T00:00:00.000Z", createdById: null }],
    });

    render(<TraceabilityMatrixView projectId={PROJECT_ID} />);

    expect(await screen.findByText(/every requirement has at least one verification activity/i)).toBeInTheDocument();
    expect(screen.getByText("REQ-001")).toBeInTheDocument();
    expect(screen.getByText("VER-001")).toBeInTheDocument();
  });

  it("states the uncovered count as the primary read — never a percentage", async () => {
    currentMatrix = baseMatrix({
      rows: [
        { id: "r1", identifier: "REQ-001", title: "Covered" },
        { id: "r2", identifier: "REQ-002", title: "Not covered" },
      ],
      columns: [{ id: "v1", identifier: "VER-001", title: "Hot fire test" }],
      cells: [{ rowId: "r1", columnId: "v1", linkId: "link1", note: null, createdAt: "2026-02-01T00:00:00.000Z", createdById: null }],
      uncoveredRowIds: ["r2"],
    });

    render(<TraceabilityMatrixView projectId={PROJECT_ID} />);

    await screen.findByText("REQ-002");
    const text = document.body.textContent ?? "";
    expect(text).toMatch(/1.*of.*2.*requirement/i);
    expect(text).not.toMatch(/\d+%/);
  });

  it("filters to only uncovered requirements on request", async () => {
    currentMatrix = baseMatrix({
      rows: [
        { id: "r1", identifier: "REQ-001", title: "Covered" },
        { id: "r2", identifier: "REQ-002", title: "Not covered" },
      ],
      columns: [{ id: "v1", identifier: "VER-001", title: "Hot fire test" }],
      cells: [{ rowId: "r1", columnId: "v1", linkId: "link1", note: null, createdAt: "2026-02-01T00:00:00.000Z", createdById: null }],
      uncoveredRowIds: ["r2"],
    });
    const user = userEvent.setup();

    render(<TraceabilityMatrixView projectId={PROJECT_ID} />);
    await screen.findByText("REQ-001");

    await user.click(screen.getByRole("button", { name: /show only uncovered/i }));

    expect(screen.queryByText("REQ-001")).not.toBeInTheDocument();
    expect(screen.getByText("REQ-002")).toBeInTheDocument();
  });

  it("opens the real relationship detail when a filled cell is clicked", async () => {
    currentMatrix = baseMatrix({
      rows: [{ id: "r1", identifier: "REQ-001", title: "Max chamber pressure" }],
      columns: [{ id: "v1", identifier: "VER-001", title: "Hot fire test" }],
      cells: [{ rowId: "r1", columnId: "v1", linkId: "link1", note: "Confirmed in run 3", createdAt: "2026-02-01T00:00:00.000Z", createdById: null }],
    });
    const user = userEvent.setup();

    render(<TraceabilityMatrixView projectId={PROJECT_ID} />);
    const cell = await screen.findByRole("button", { name: /REQ-001 is verified by VER-001/i });
    await user.click(cell);

    expect(await screen.findByText("Confirmed in run 3")).toBeInTheDocument();
  });

  it("shows an honest empty state when the project has no requirements, with the step that fills it", async () => {
    currentMatrix = baseMatrix();

    render(<TraceabilityMatrixView projectId={PROJECT_ID} />);

    expect(await screen.findByText("No requirements yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Write the first requirement" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/requirements`,
    );
  });

  it("shows an honest empty state when nothing verifies anything yet, with the step that fills it", async () => {
    currentMatrix = baseMatrix({
      rows: [{ id: "r1", identifier: "REQ-001", title: "x" }],
      uncoveredRowIds: ["r1"],
    });

    render(<TraceabilityMatrixView projectId={PROJECT_ID} />);

    expect(await screen.findByText("No checks planned yet")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Plan the first check" })).toHaveAttribute(
      "href",
      `/projects/${PROJECT_ID}/verification`,
    );
  });

  it("never renders a percentage anywhere on the page", async () => {
    currentMatrix = baseMatrix({
      rows: [
        { id: "r1", identifier: "REQ-001", title: "x" },
        { id: "r2", identifier: "REQ-002", title: "y" },
      ],
      columns: [{ id: "v1", identifier: "VER-001", title: "z" }],
      cells: [{ rowId: "r1", columnId: "v1", linkId: "link1", note: null, createdAt: "2026-02-01T00:00:00.000Z", createdById: null }],
      uncoveredRowIds: ["r2"],
    });

    render(<TraceabilityMatrixView projectId={PROJECT_ID} />);
    await screen.findByText("REQ-001");

    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/\d+%/);
    expect(text.toLowerCase()).not.toMatch(/coverage score|percent covered/);
  });
});
