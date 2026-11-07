"use client";

import * as React from "react";
import type {
  GraphDirection,
  GraphEdgeType,
  GraphNodeRef,
  GraphNodeType,
  TraceabilitySelectableNodeType,
} from "@/domain";
import { graphNodeKey } from "@/domain";
import { requestJson, requestJsonBody } from "./client";
import { useResource } from "./use-resource";

/**
 * Traceability workspace API access and its loading hooks.
 *
 * The workspace talks to two things: the pre-existing, unmodified graph API
 * (`/graph/node/...`, `/graph/node/.../neighbors`, `/graph/traverse`) for
 * everything about relationships, and the one new endpoint this capability
 * adds (`/traceability/objects`) purely to populate the root-object picker.
 * Nothing here recomputes a relationship — every shape below is a wire mirror
 * of what `EngineeringGraphService` already returns.
 */

export interface GraphNodeDto {
  type: GraphNodeType;
  id: string;
  projectId: string;
  identifier: string | null;
  label: string;
}

export interface GraphEdgeDto {
  type: GraphEdgeType;
  source: GraphNodeDto;
  target: GraphNodeDto;
  relationshipId: string;
  createdAt: string;
  createdById: string | null;
  note: string | null;
  linkType: string | null;
}

export interface GraphConnectionDto {
  edge: GraphEdgeDto;
  neighbor: GraphNodeDto;
  direction: "OUTBOUND" | "INBOUND";
}

export interface GraphNeighborhoodDto {
  node: GraphNodeDto;
  connections: GraphConnectionDto[];
}

export interface TraversalStepDto {
  edgeType: GraphEdgeType;
  relationshipId: string;
  traversed: "FORWARD" | "REVERSE";
  from: GraphNodeRef;
  to: GraphNodeRef;
}

export interface TraversalNodeDto {
  node: GraphNodeDto;
  depth: number;
  path: TraversalStepDto[];
}

export interface TraversalLimitsDto {
  maxDepth: number;
  maxNodes: number;
  maxEdges: number;
  truncated: boolean;
  truncatedBy: "MAX_DEPTH" | "MAX_NODES" | "MAX_EDGES" | null;
}

export interface TraversalResultDto {
  root: GraphNodeDto;
  nodes: TraversalNodeDto[];
  edges: GraphEdgeDto[];
  limits: TraversalLimitsDto;
}

export interface TraceabilityRootOptionDto {
  id: string;
  identifier: string | null;
  label: string;
}

function nodeUrl(projectId: string, ref: GraphNodeRef): string {
  return `/api/projects/${projectId}/graph/node/${ref.type}/${encodeURIComponent(ref.id)}`;
}

export async function fetchGraphNode(
  projectId: string,
  ref: GraphNodeRef,
  signal?: AbortSignal,
): Promise<GraphNodeDto> {
  return requestJson<GraphNodeDto>(nodeUrl(projectId, ref), "node", { signal });
}

export async function fetchGraphNeighborhood(
  projectId: string,
  ref: GraphNodeRef,
  direction: GraphDirection,
  edgeTypes: readonly GraphEdgeType[] | undefined,
  signal?: AbortSignal,
): Promise<GraphNeighborhoodDto> {
  const params = new URLSearchParams({ direction });
  for (const type of edgeTypes ?? []) params.append("edgeType", type);
  return requestJsonBody<GraphNeighborhoodDto>(`${nodeUrl(projectId, ref)}/neighbors?${params}`, {
    signal,
  });
}

export interface RunTraversalInput {
  root: GraphNodeRef;
  direction: GraphDirection;
  maxDepth: number;
  edgeTypes?: readonly GraphEdgeType[];
}

export async function runGraphTraversal(
  projectId: string,
  input: RunTraversalInput,
  signal?: AbortSignal,
): Promise<TraversalResultDto> {
  return requestJsonBody<TraversalResultDto>(`/api/projects/${projectId}/graph/traverse`, {
    method: "POST",
    body: JSON.stringify(input),
    signal,
  });
}

export async function fetchTraceabilityRoots(
  projectId: string,
  nodeType: TraceabilitySelectableNodeType,
  signal?: AbortSignal,
): Promise<TraceabilityRootOptionDto[]> {
  return requestJson<TraceabilityRootOptionDto[]>(
    `/api/projects/${projectId}/traceability/objects?type=${encodeURIComponent(nodeType)}`,
    "objects",
    { signal },
  );
}

// --- Hooks --------------------------------------------------------------------

export function useTraceabilityRoots(
  projectId: string,
  nodeType: TraceabilitySelectableNodeType | "",
) {
  return useResource<TraceabilityRootOptionDto[]>(
    React.useCallback(
      (signal) =>
        nodeType ? fetchTraceabilityRoots(projectId, nodeType, signal) : Promise.resolve([]),
      [projectId, nodeType],
    ),
    `traceability-roots:${projectId}:${nodeType}`,
  );
}

export function useGraphNeighborhood(
  projectId: string,
  ref: GraphNodeRef | null,
  direction: GraphDirection,
  edgeTypes?: readonly GraphEdgeType[],
) {
  const edgeTypesKey = [...(edgeTypes ?? [])].sort().join(",");
  return useResource<GraphNeighborhoodDto | null>(
    React.useCallback(
      (signal) =>
        ref ? fetchGraphNeighborhood(projectId, ref, direction, edgeTypes, signal) : Promise.resolve(null),
      // edgeTypes is intentionally represented by edgeTypesKey below; a new
      // array with the same contents must not trigger a refetch.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [projectId, ref?.type, ref?.id, direction, edgeTypesKey],
    ),
    `graph-neighborhood:${projectId}:${ref ? graphNodeKey(ref) : "none"}:${direction}:${edgeTypesKey}`,
  );
}
