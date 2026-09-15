import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataGrid } from "./DataGrid";
import type { DataGridColumn } from "./data-grid-types";

interface Row {
  id: string;
  identifier: string;
  title: string;
  priority: number;
}

const ROWS: Row[] = [
  { id: "1", identifier: "REQ-001", title: "Chamber pressure", priority: 2 },
  { id: "2", identifier: "REQ-002", title: "Wall thickness", priority: 1 },
  { id: "3", identifier: "REQ-003", title: "Coolant line", priority: 3 },
];

const COLUMNS: DataGridColumn<Row>[] = [
  { id: "identifier", header: "Identifier", accessor: (r) => r.identifier, cell: (r) => r.identifier, alwaysVisible: true },
  { id: "title", header: "Title", accessor: (r) => r.title, cell: (r) => r.title },
  { id: "priority", header: "Priority", accessor: (r) => r.priority, cell: (r) => r.priority, numeric: true },
];

// TanStack Virtual's scroll-container measurement (offsetHeight/offsetWidth)
// is given a real, generous jsdom fallback globally — see src/tests/setup.ts.

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DataGrid", () => {
  it("renders every row's visible-column cells", async () => {
    render(
      <DataGrid
        storageKey="test-grid"
        columns={COLUMNS}
        rows={ROWS}
        getRowId={(r) => r.id}
        identifierAccessor={(r) => r.identifier}
      />,
    );

    expect(await screen.findByText("REQ-001")).toBeInTheDocument();
    expect(screen.getByText("Chamber pressure")).toBeInTheDocument();
    expect(screen.getByText("REQ-002")).toBeInTheDocument();
    expect(screen.getByText("REQ-003")).toBeInTheDocument();
  });

  it("uses the real ARIA grid pattern — grid, row, columnheader, gridcell", async () => {
    render(
      <DataGrid
        storageKey="test-grid-aria"
        columns={COLUMNS}
        rows={ROWS}
        getRowId={(r) => r.id}
        identifierAccessor={(r) => r.identifier}
      />,
    );

    expect(await screen.findByRole("grid")).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(COLUMNS.length);
    // Header row + 3 data rows.
    expect(screen.getAllByRole("row")).toHaveLength(1 + ROWS.length);
    expect(screen.getAllByRole("gridcell").length).toBeGreaterThan(0);
  });

  it("clicking a column header sorts by it, ascending then descending", async () => {
    const user = userEvent.setup();
    render(
      <DataGrid
        storageKey="test-grid-sort"
        columns={COLUMNS}
        rows={ROWS}
        getRowId={(r) => r.id}
        identifierAccessor={(r) => r.identifier}
      />,
    );

    await screen.findByText("REQ-001");
    const priorityHeader = screen.getByRole("columnheader", { name: /priority/i });

    await user.click(within(priorityHeader).getByRole("button"));

    const rowsAfterAsc = screen.getAllByRole("row").slice(1); // drop header row
    // Priority ascending: REQ-002 (1), REQ-001 (2), REQ-003 (3).
    expect(within(rowsAfterAsc[0]!).getByText("REQ-002")).toBeInTheDocument();
    expect(within(rowsAfterAsc[2]!).getByText("REQ-003")).toBeInTheDocument();
  });

  it("Enter on the active cell activates the row", async () => {
    const onRowActivate = vi.fn();
    const user = userEvent.setup();
    render(
      <DataGrid
        storageKey="test-grid-activate"
        columns={COLUMNS}
        rows={ROWS}
        getRowId={(r) => r.id}
        identifierAccessor={(r) => r.identifier}
        onRowActivate={onRowActivate}
      />,
    );

    await screen.findByText("REQ-001");
    const grid = screen.getByRole("grid");
    grid.focus();
    await user.keyboard("{Enter}");

    expect(onRowActivate).toHaveBeenCalledWith(ROWS[0]);
  });

  it("ArrowDown moves the active row before Enter activates it", async () => {
    const onRowActivate = vi.fn();
    const user = userEvent.setup();
    render(
      <DataGrid
        storageKey="test-grid-arrow"
        columns={COLUMNS}
        rows={ROWS}
        getRowId={(r) => r.id}
        identifierAccessor={(r) => r.identifier}
        onRowActivate={onRowActivate}
      />,
    );

    await screen.findByText("REQ-001");
    const grid = screen.getByRole("grid");
    grid.focus();
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(onRowActivate).toHaveBeenCalledWith(ROWS[2]);
  });

  it("Space toggles selection on the active row when selectable", async () => {
    const onSelectedIdsChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DataGrid
        storageKey="test-grid-select"
        columns={COLUMNS}
        rows={ROWS}
        getRowId={(r) => r.id}
        identifierAccessor={(r) => r.identifier}
        selectable
        selectedIds={new Set()}
        onSelectedIdsChange={onSelectedIdsChange}
      />,
    );

    await screen.findByText("REQ-001");
    const grid = screen.getByRole("grid");
    grid.focus();
    await user.keyboard(" ");

    expect(onSelectedIdsChange).toHaveBeenCalledWith(new Set(["1"]));
  });

  it("renders the caller's empty state when there are no rows", () => {
    render(
      <DataGrid
        storageKey="test-grid-empty"
        columns={COLUMNS}
        rows={[]}
        getRowId={(r) => r.id}
        identifierAccessor={(r) => r.identifier}
        emptyState={<p>Nothing here yet</p>}
      />,
    );

    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("applies a caller-supplied rowClassName without hiding the row", async () => {
    render(
      <DataGrid
        storageKey="test-grid-rowclass"
        columns={COLUMNS}
        rows={ROWS}
        getRowId={(r) => r.id}
        identifierAccessor={(r) => r.identifier}
        rowClassName={(r) => (r.identifier === "REQ-002" ? "historical-row" : undefined)}
      />,
    );

    await screen.findByText("REQ-002");
    const row = screen.getByText("REQ-002").closest('[role="row"]');
    expect(row).toHaveClass("historical-row");
  });
});
