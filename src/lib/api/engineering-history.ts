"use client";

import * as React from "react";
import type { HistoryEventCategory, HistoryObjectType, HistorySourceModule } from "@/domain";
import { requestJson } from "./client";
import { useResource } from "./use-resource";

/**
 * Engineering History API access.
 *
 * A read model: every function here is a `GET`. Nothing in this file ever
 * writes, and there is no create/update/delete function to accidentally
 * reach for — the workspace this feeds only ever reads.
 */

export interface HistoryEventDto {
  key: string;
  timestamp: string;
  category: HistoryEventCategory;
  sourceModule: HistorySourceModule;
  sourceType: string;
  sourceId: string;
  sourceIdentifier: string | null;
  sourceLabel: string;
  action: string;
  label: string;
  actorId: string | null;
  actorName: string | null;
  detail: string | null;
  href: string;
}

export interface HistoryPageDto {
  offset: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

export interface ProjectHistoryDto {
  events: HistoryEventDto[];
  page: HistoryPageDto;
}

export interface ObjectHistoryDto extends ProjectHistoryDto {
  object: { type: HistoryObjectType; id: string; identifier: string | null; label: string; href: string };
}

export interface ProjectHistoryFilters {
  module?: HistorySourceModule | "";
  objectType?: string;
  actorId?: string;
  from?: string;
  to?: string;
  offset?: number;
  limit?: number;
}

function historyBase(projectId: string): string {
  return `/api/projects/${projectId}/history`;
}

function buildQuery(filters: Record<string, string | number | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value === undefined || value === "") continue;
    query.set(key, String(value));
  }
  const q = query.toString();
  return q ? `?${q}` : "";
}

export async function fetchProjectHistory(
  projectId: string,
  filters: ProjectHistoryFilters = {},
  signal?: AbortSignal,
): Promise<ProjectHistoryDto> {
  const query = buildQuery({
    module: filters.module,
    objectType: filters.objectType,
    actorId: filters.actorId,
    from: filters.from,
    to: filters.to,
    offset: filters.offset,
    limit: filters.limit,
  });
  return requestJson<ProjectHistoryDto>(`${historyBase(projectId)}${query}`, "history", { signal });
}

export function useProjectHistory(projectId: string, filters: ProjectHistoryFilters = {}) {
  const { module, objectType, actorId, from, to, offset, limit } = filters;
  return useResource<ProjectHistoryDto>(
    React.useCallback(
      (signal) =>
        fetchProjectHistory(projectId, { module, objectType, actorId, from, to, offset, limit }, signal),
      [projectId, module, objectType, actorId, from, to, offset, limit],
    ),
    `history:${projectId}:${module ?? ""}:${objectType ?? ""}:${actorId ?? ""}:${from ?? ""}:${to ?? ""}:${offset ?? ""}:${limit ?? ""}`,
  );
}

export async function fetchObjectHistory(
  projectId: string,
  objectType: string,
  objectId: string,
  pagination: { offset?: number; limit?: number } = {},
  signal?: AbortSignal,
): Promise<ObjectHistoryDto> {
  const query = buildQuery({ offset: pagination.offset, limit: pagination.limit });
  return requestJson<ObjectHistoryDto>(
    `${historyBase(projectId)}/${objectType}/${objectId}${query}`,
    "history",
    { signal },
  );
}

export function useObjectHistory(
  projectId: string,
  objectType: string,
  objectId: string,
  pagination: { offset?: number; limit?: number } = {},
) {
  const { offset, limit } = pagination;
  return useResource<ObjectHistoryDto>(
    React.useCallback(
      (signal) => fetchObjectHistory(projectId, objectType, objectId, { offset, limit }, signal),
      [projectId, objectType, objectId, offset, limit],
    ),
    `objectHistory:${projectId}:${objectType}:${objectId}:${offset ?? ""}:${limit ?? ""}`,
  );
}
