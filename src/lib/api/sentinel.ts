"use client";

import * as React from "react";
import type {
  SurveillanceEventType,
  SurveillanceSourceType,
  SurveillanceTargetStatus,
  SurveillanceTargetType,
} from "@/domain";
import { requestJson } from "./client";
import { useResource } from "./use-resource";

/**
 * Decision Sentinel API access.
 *
 * Same conventions as the other clients: HTTP only, never imports server
 * code. Nothing here evaluates or resolves anything implicitly — detection,
 * acknowledgement, resolution and reevaluation are each one explicit call.
 */

export interface SurveillanceTargetDto {
  id: string;
  projectId: string;
  targetType: SurveillanceTargetType;
  targetId: string;
  targetIdentifier: string | null;
  targetLabel: string;
  reason: string;
  sourceEventId: string;
  /** Present on list/detail reads — the source event this target's current reason came from. */
  sourceType?: SurveillanceSourceType;
  sourceId?: string;
  sourceIdentifier?: string | null;
  sourceLabel?: string;
  status: SurveillanceTargetStatus;
  detectedAt: string;
  acknowledgedAt: string | null;
  acknowledgedById: string | null;
  acknowledgementNote: string | null;
  resolvedAt: string | null;
  resolvedById: string | null;
  resolutionNote: string | null;
  supersededById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SentinelEventDto {
  id: string;
  projectId: string;
  eventType: SurveillanceEventType;
  sourceType: SurveillanceSourceType;
  sourceId: string;
  sourceIdentifier: string | null;
  sourceLabel: string;
  sourceRevision: string;
  detectedAt: string;
  actorId: string | null;
  createdAt: string;
}

export interface SurveillanceCountsDto {
  open: number;
  acknowledged: number;
}

export interface DetectionSummaryDto {
  eventsCreated: number;
  targetsOpened: number;
  targetsUpdated: number;
}

function sentinelBase(projectId: string): string {
  return `/api/projects/${projectId}/sentinel`;
}

export async function fetchSurveillanceCounts(
  projectId: string,
  signal?: AbortSignal,
): Promise<SurveillanceCountsDto> {
  return requestJson<SurveillanceCountsDto>(sentinelBase(projectId), "counts", { signal });
}

export async function fetchOpenSurveillance(
  projectId: string,
  signal?: AbortSignal,
): Promise<SurveillanceTargetDto[]> {
  return requestJson<SurveillanceTargetDto[]>(`${sentinelBase(projectId)}/open`, "targets", { signal });
}

export async function fetchSurveillanceHistory(
  projectId: string,
  signal?: AbortSignal,
): Promise<SurveillanceTargetDto[]> {
  return requestJson<SurveillanceTargetDto[]>(`${sentinelBase(projectId)}/history`, "targets", { signal });
}

export async function fetchSurveillanceTarget(
  projectId: string,
  targetId: string,
  signal?: AbortSignal,
): Promise<SurveillanceTargetDto> {
  return requestJson<SurveillanceTargetDto>(`${sentinelBase(projectId)}/${targetId}`, "target", { signal });
}

/** The only call that writes new detections. Explicit, never issued on a page load. */
export async function detectSurveillance(projectId: string): Promise<DetectionSummaryDto> {
  return requestJson<DetectionSummaryDto>(`${sentinelBase(projectId)}/detect`, "summary", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function acknowledgeSurveillance(
  projectId: string,
  targetId: string,
  note?: string,
): Promise<SurveillanceTargetDto> {
  return requestJson<SurveillanceTargetDto>(`${sentinelBase(projectId)}/${targetId}/acknowledge`, "target", {
    method: "POST",
    body: JSON.stringify(note ? { note } : {}),
  });
}

export async function resolveSurveillance(
  projectId: string,
  targetId: string,
  note: string,
): Promise<SurveillanceTargetDto> {
  return requestJson<SurveillanceTargetDto>(`${sentinelBase(projectId)}/${targetId}/resolve`, "target", {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

/** Dispatches to the real engine for this target's domain, then resolves on success. */
export async function reEvaluateSurveillance(
  projectId: string,
  targetId: string,
): Promise<SurveillanceTargetDto> {
  return requestJson<SurveillanceTargetDto>(`${sentinelBase(projectId)}/${targetId}/reevaluate`, "target", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export function useSurveillanceCounts(projectId: string) {
  return useResource<SurveillanceCountsDto>(
    React.useCallback((signal) => fetchSurveillanceCounts(projectId, signal), [projectId]),
    `sentinelCounts:${projectId}`,
  );
}

export function useOpenSurveillance(projectId: string) {
  return useResource<SurveillanceTargetDto[]>(
    React.useCallback((signal) => fetchOpenSurveillance(projectId, signal), [projectId]),
    `sentinelOpen:${projectId}`,
  );
}

export function useSurveillanceHistory(projectId: string) {
  return useResource<SurveillanceTargetDto[]>(
    React.useCallback((signal) => fetchSurveillanceHistory(projectId, signal), [projectId]),
    `sentinelHistory:${projectId}`,
  );
}
