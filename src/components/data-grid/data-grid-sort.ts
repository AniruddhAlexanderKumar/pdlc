import type { DataGridColumn, SortRule } from "./data-grid-types";

/**
 * Applies multi-column sort rules to a row array, with a final, always-on
 * tie-break by `identifierAccessor` — so two rows with an identical sort
 * key (two requirements both DRAFT, say) still land in the same relative
 * order on every render, every reload, every export. Without this, a
 * browser's sort stability is the only thing keeping the table from
 * visibly reshuffling rows a user didn't touch (Master Prompt 4 §0:
 * "Determinism extends to pixels").
 *
 * Pure and side-effect-free — the same input array and rules always produce
 * the same output order, which is what makes it directly testable for
 * determinism (render/sort twice, assert identical order) without a DOM.
 */
export function sortRows<T>(
  rows: readonly T[],
  columns: readonly DataGridColumn<T>[],
  sort: readonly SortRule[],
  identifierAccessor: (row: T) => string,
): T[] {
  const columnsById = new Map(columns.map((c) => [c.id, c]));

  function compareValues(a: string | number | null, b: string | number | null): number {
    if (a === null && b === null) return 0;
    if (a === null) return -1;
    if (b === null) return 1;
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
  }

  const indexed = rows.map((row, index) => ({ row, index }));

  indexed.sort((left, right) => {
    for (const rule of sort) {
      const column = columnsById.get(rule.columnId);
      if (!column) continue;
      const a = column.accessor(left.row);
      const b = column.accessor(right.row);
      const cmp = compareValues(a, b);
      if (cmp !== 0) return rule.direction === "asc" ? cmp : -cmp;
    }

    // Deterministic tie-break: always ascending by identifier, regardless
    // of any column's own sort direction — "deterministic," not "matching
    // whatever direction the user last clicked."
    const idCmp = identifierAccessor(left.row).localeCompare(identifierAccessor(right.row), undefined, {
      numeric: true,
      sensitivity: "base",
    });
    if (idCmp !== 0) return idCmp;

    // Two rows with the same identifier (should not happen within one
    // project, but a cross-project view can legitimately show two "REQ-001"
    // rows) — original array position is the last, fully deterministic
    // resort, since `rows` itself is always server-ordered the same way for
    // the same query.
    return left.index - right.index;
  });

  return indexed.map((entry) => entry.row);
}
