import type { DataGridColumn } from "./data-grid-types";

/**
 * CSV/TSV generation for the grid's current view — visible columns, in
 * their current order, over exactly the rows passed in (already filtered
 * and sorted by the caller). Uses each column's `accessor`, never its
 * rendered `cell` output, so a badge or link cell exports as plain text a
 * spreadsheet can actually use.
 */

function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function cellText(column: DataGridColumn<unknown>, row: unknown): string {
  const value = column.accessor(row);
  return value === null ? "" : String(value);
}

export function toCsv<T>(rows: readonly T[], columns: readonly DataGridColumn<T>[]): string {
  const header = columns.map((c) => escapeCsvField(c.header)).join(",");
  const lines = rows.map((row) =>
    columns.map((c) => escapeCsvField(cellText(c as DataGridColumn<unknown>, row))).join(","),
  );
  // CRLF: the conventional CSV line ending, and what makes Excel on Windows
  // read the file without treating it as one long unbroken line.
  return [header, ...lines].join("\r\n");
}

/** Tab-separated, header-free — this is what a spreadsheet's paste buffer expects from a copied selection. */
export function toTsv<T>(rows: readonly T[], columns: readonly DataGridColumn<T>[]): string {
  return rows.map((row) => columns.map((c) => cellText(c as DataGridColumn<unknown>, row)).join("\t")).join("\n");
}

/** Triggers a browser download of `content` as `filename`. No-op outside a browser (SSR, tests without a DOM). */
export function downloadText(content: string, filename: string, mimeType: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
