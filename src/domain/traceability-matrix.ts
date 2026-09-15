/**
 * The traceability matrix (Master Prompt 4 §4).
 *
 * Question this answers: *which requirements are verified by what, and
 * where are the holes?*
 *
 * A read composition over the same relationship table
 * `RequirementService`/`VerificationActivityService` already write to —
 * there is no second graph, and nothing here computes a coverage
 * percentage. A row with zero cells is reported by id, in
 * `uncoveredRowIds`, and that count *is* the primary read: "14 requirements
 * with no verification activity," never "84% covered."
 */

export interface TraceabilityMatrixAxisItem {
  id: string;
  identifier: string;
  title: string;
}

/** One real relationship, at the (row, column) it occupies. Cells are sparse — an absent cell means no relationship, and that absence is the point of the view. */
export interface TraceabilityMatrixCell {
  rowId: string;
  columnId: string;
  /** The underlying relationship row's own id — what a cell click resolves to for its detail. */
  linkId: string;
  note: string | null;
  createdAt: string;
  createdById: string | null;
}

export interface TraceabilityMatrix {
  rowAxis: "REQUIREMENT";
  columnAxis: "VERIFICATION_ACTIVITY";
  rows: TraceabilityMatrixAxisItem[];
  columns: TraceabilityMatrixAxisItem[];
  cells: TraceabilityMatrixCell[];
  /** Row ids with no cell at all — requirements nothing verifies. The primary read (§4). */
  uncoveredRowIds: string[];
  /** Column ids with no cell at all — verification activities that verify nothing recorded here. */
  uncoveredColumnIds: string[];
}
