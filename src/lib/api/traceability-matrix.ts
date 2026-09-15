"use client";

import * as React from "react";
import { requestJson } from "./client";
import { useResource } from "./use-resource";

/**
 * Traceability matrix API access. A single GET — this is a read model over
 * `RequirementVerificationLink`, nothing here creates or evaluates
 * anything. Field names mirror `TraceabilityMatrix` in `@/domain`.
 */

export interface TraceabilityMatrixAxisItemDto {
  id: string;
  identifier: string;
  title: string;
}

export interface TraceabilityMatrixCellDto {
  rowId: string;
  columnId: string;
  linkId: string;
  note: string | null;
  createdAt: string;
  createdById: string | null;
}

export interface TraceabilityMatrixDto {
  rowAxis: "REQUIREMENT";
  columnAxis: "VERIFICATION_ACTIVITY";
  rows: TraceabilityMatrixAxisItemDto[];
  columns: TraceabilityMatrixAxisItemDto[];
  cells: TraceabilityMatrixCellDto[];
  uncoveredRowIds: string[];
  uncoveredColumnIds: string[];
}

export async function fetchTraceabilityMatrix(
  projectId: string,
  signal?: AbortSignal,
): Promise<TraceabilityMatrixDto> {
  return requestJson<TraceabilityMatrixDto>(`/api/projects/${projectId}/traceability-matrix`, "matrix", {
    signal,
  });
}

export function useTraceabilityMatrix(projectId: string) {
  return useResource<TraceabilityMatrixDto>(
    React.useCallback((signal) => fetchTraceabilityMatrix(projectId, signal), [projectId]),
    `traceability-matrix:${projectId}`,
  );
}
