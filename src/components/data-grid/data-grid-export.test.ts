import { describe, expect, it } from "vitest";
import { toCsv, toTsv } from "./data-grid-export";
import type { DataGridColumn } from "./data-grid-types";

interface Row {
  identifier: string;
  title: string;
  note: string | null;
}

const COLUMNS: DataGridColumn<Row>[] = [
  { id: "identifier", header: "Identifier", accessor: (r) => r.identifier, cell: (r) => r.identifier },
  { id: "title", header: "Title", accessor: (r) => r.title, cell: (r) => r.title },
  { id: "note", header: "Note", accessor: (r) => r.note, cell: (r) => r.note },
];

describe("toCsv", () => {
  it("emits a header row and one row per record, using accessor values — not rendered cell output", () => {
    const rows: Row[] = [{ identifier: "REQ-001", title: "Chamber pressure", note: null }];
    const csv = toCsv(rows, COLUMNS);
    expect(csv).toBe("Identifier,Title,Note\r\nREQ-001,Chamber pressure,");
  });

  it("quotes and escapes fields containing a comma, quote, or newline", () => {
    const rows: Row[] = [{ identifier: "REQ-001", title: 'The "hot" case, briefly', note: "line one\nline two" }];
    const csv = toCsv(rows, COLUMNS);
    expect(csv).toContain('"The ""hot"" case, briefly"');
    expect(csv).toContain('"line one\nline two"');
  });

  it("renders a null accessor value as an empty field, not the string \"null\"", () => {
    const rows: Row[] = [{ identifier: "REQ-001", title: "x", note: null }];
    const csv = toCsv(rows, COLUMNS);
    expect(csv).not.toContain("null");
  });
});

describe("toTsv", () => {
  it("is tab-separated and header-free — a copy buffer, not a file", () => {
    const rows: Row[] = [
      { identifier: "REQ-001", title: "Chamber pressure", note: null },
      { identifier: "REQ-002", title: "Wall thickness", note: "checked" },
    ];
    const tsv = toTsv(rows, COLUMNS);
    expect(tsv).toBe("REQ-001\tChamber pressure\t\nREQ-002\tWall thickness\tchecked");
  });
});
