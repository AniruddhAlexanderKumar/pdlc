import { describe, expect, it } from "vitest";
import { sortRows } from "./data-grid-sort";
import type { DataGridColumn } from "./data-grid-types";

interface Row {
  id: string;
  identifier: string;
  title: string;
  priority: number;
}

const ROWS: Row[] = [
  { id: "1", identifier: "REQ-003", title: "Coolant line", priority: 2 },
  { id: "2", identifier: "REQ-001", title: "Chamber pressure", priority: 2 },
  { id: "3", identifier: "REQ-002", title: "Wall thickness", priority: 1 },
];

const COLUMNS: DataGridColumn<Row>[] = [
  { id: "identifier", header: "Identifier", accessor: (r) => r.identifier, cell: (r) => r.identifier, alwaysVisible: true },
  { id: "title", header: "Title", accessor: (r) => r.title, cell: (r) => r.title },
  { id: "priority", header: "Priority", accessor: (r) => r.priority, cell: (r) => r.priority },
];

const identifierAccessor = (r: Row) => r.identifier;

describe("sortRows", () => {
  it("returns rows unchanged in identifier order when no sort rule is given", () => {
    const result = sortRows(ROWS, COLUMNS, [], identifierAccessor);
    expect(result.map((r) => r.identifier)).toEqual(["REQ-001", "REQ-002", "REQ-003"]);
  });

  it("sorts ascending and descending by one column", () => {
    const asc = sortRows(ROWS, COLUMNS, [{ columnId: "priority", direction: "asc" }], identifierAccessor);
    expect(asc.map((r) => r.identifier)).toEqual(["REQ-002", "REQ-001", "REQ-003"]);

    const desc = sortRows(ROWS, COLUMNS, [{ columnId: "priority", direction: "desc" }], identifierAccessor);
    // Both priority-2 rows tie, so the deterministic identifier tie-break
    // (always ascending) decides their relative order regardless of the
    // column's own descending direction.
    expect(desc.map((r) => r.identifier)).toEqual(["REQ-001", "REQ-003", "REQ-002"]);
  });

  it("applies multi-column sort in rule order, first rule taking precedence", () => {
    const rows: Row[] = [
      { id: "1", identifier: "REQ-004", title: "A", priority: 1 },
      { id: "2", identifier: "REQ-001", title: "B", priority: 2 },
      { id: "3", identifier: "REQ-002", title: "A", priority: 2 },
    ];
    const result = sortRows(
      rows,
      COLUMNS,
      [
        { columnId: "title", direction: "asc" },
        { columnId: "priority", direction: "desc" },
      ],
      identifierAccessor,
    );
    // Group by title ascending (A, A, B), then within "A" by priority
    // descending (2 before 1).
    expect(result.map((r) => r.identifier)).toEqual(["REQ-002", "REQ-004", "REQ-001"]);
  });

  it("always tie-breaks on identifier — ties within a sorted column never depend on array position", () => {
    // Same priority (2) for both, but supplied in reverse-identifier order.
    const reversed: Row[] = [
      { id: "1", identifier: "REQ-002", title: "X", priority: 2 },
      { id: "2", identifier: "REQ-001", title: "X", priority: 2 },
    ];
    const result = sortRows(reversed, COLUMNS, [{ columnId: "priority", direction: "asc" }], identifierAccessor);
    expect(result.map((r) => r.identifier)).toEqual(["REQ-001", "REQ-002"]);
  });

  it("is deterministic — sorting the same input twice produces byte-identical order (Master Prompt 4 §0)", () => {
    const first = sortRows(ROWS, COLUMNS, [{ columnId: "title", direction: "asc" }], identifierAccessor);
    const second = sortRows(ROWS, COLUMNS, [{ columnId: "title", direction: "asc" }], identifierAccessor);
    expect(second.map((r) => r.id)).toEqual(first.map((r) => r.id));
  });

  it("sorts null accessor values first, consistently", () => {
    interface Nullable {
      identifier: string;
      owner: string | null;
    }
    const rows: Nullable[] = [
      { identifier: "REQ-002", owner: "Ada" },
      { identifier: "REQ-001", owner: null },
      { identifier: "REQ-003", owner: "Grace" },
    ];
    const columns: DataGridColumn<Nullable>[] = [
      { id: "owner", header: "Owner", accessor: (r) => r.owner, cell: (r) => r.owner },
    ];
    const result = sortRows(rows, columns, [{ columnId: "owner", direction: "asc" }], (r) => r.identifier);
    expect(result.map((r) => r.identifier)).toEqual(["REQ-001", "REQ-002", "REQ-003"]);
  });

  it("does not mutate the input array", () => {
    const copy = [...ROWS];
    sortRows(ROWS, COLUMNS, [{ columnId: "priority", direction: "asc" }], identifierAccessor);
    expect(ROWS).toEqual(copy);
  });
});
