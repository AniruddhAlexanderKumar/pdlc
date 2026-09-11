"use client";

import * as React from "react";
import type {
  ChangeImpactTarget,
  ChangeImpactTargetType,
  ChangeRequestStatus,
  CreateChangeRequestRequest,
  ImpactAnalysisStatus,
  ImpactClassification,
  ImpactFindingStatus,
  ImpactFreshness,
  ImpactSummary,
  TraversalStep,
  UpdateChangeRequestRequest,
} from "@/domain";
import { requestJson } from "./client";
import type { AuditEventDto, OwnerSummary } from "./requirements";
import { useResource } from "./use-resource";

/**
 * Change request API access.
 *
 * Same conventions as the other clients: HTTP only, no organization id ever
 * crosses into the browser, every call scoped by the project in the URL. The
 * requester is never sent — the server takes it from the session.
 */

export interface ChangeRequestDto {
  id: string;
  projectId: string;
  identifier: string;
  title: string;
  description: string;
  reason: string;
  status: ChangeRequestStatus;
  requestedById: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChangeRequestListItemDto extends ChangeRequestDto {
  requestedBy: OwnerSummary | null;
}

/**
 * One artifact an engineer *declared* this change affects.
 *
 * Not a computed impact. Nothing in the system has traversed the graph to
 * produce this — it is a person's assertion, and the naming keeps it that way.
 */
export interface DeclaredImpactDto {
  id: string;
  changeRequestId: string;
  target: ChangeImpactTarget;
  targetIdentifier: string | null;
  targetTitle: string;
  note: string | null;
  createdAt: string;
  createdBy: OwnerSummary | null;
}

export interface ChangeRequestDetailDto extends ChangeRequestDto {
  requestedBy: OwnerSummary | null;
  declaredImpacts: DeclaredImpactDto[];
  availableTransitions: ChangeRequestStatus[];
  editable: { definition: boolean; declaredImpacts: boolean };
  history: AuditEventDto[];
}

export interface ChangeImpactTargetOptionDto {
  id: string;
  identifier: string;
  title: string;
}

export type ChangeImpactTargetsDto = Record<
  ChangeImpactTargetType,
  ChangeImpactTargetOptionDto[]
>;

function base(projectId: string): string {
  return `/api/projects/${projectId}/changes`;
}

export async function fetchChangeRequests(
  projectId: string,
  options: { status?: ChangeRequestStatus | "" } = {},
  signal?: AbortSignal,
): Promise<ChangeRequestListItemDto[]> {
  const query = options.status ? `?status=${encodeURIComponent(options.status)}` : "";
  return requestJson<ChangeRequestListItemDto[]>(`${base(projectId)}${query}`, "changes", {
    signal,
  });
}

export async function fetchChangeRequest(
  projectId: string,
  changeId: string,
  signal?: AbortSignal,
): Promise<ChangeRequestDetailDto> {
  return requestJson<ChangeRequestDetailDto>(`${base(projectId)}/${changeId}`, "change", {
    signal,
  });
}

export async function createChangeRequest(
  projectId: string,
  input: CreateChangeRequestRequest,
): Promise<ChangeRequestDto> {
  return requestJson<ChangeRequestDto>(base(projectId), "change", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateChangeRequest(
  projectId: string,
  changeId: string,
  input: UpdateChangeRequestRequest,
): Promise<ChangeRequestDto> {
  return requestJson<ChangeRequestDto>(`${base(projectId)}/${changeId}`, "change", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function transitionChangeRequest(
  projectId: string,
  changeId: string,
  to: ChangeRequestStatus,
  rationale?: string | null,
): Promise<ChangeRequestDto> {
  return requestJson<ChangeRequestDto>(`${base(projectId)}/${changeId}/transition`, "change", {
    method: "POST",
    body: JSON.stringify({ to, rationale: rationale ?? null }),
  });
}

export async function addDeclaredImpact(
  projectId: string,
  changeId: string,
  input: { target: ChangeImpactTarget; note?: string | null },
): Promise<DeclaredImpactDto[]> {
  return requestJson<DeclaredImpactDto[]>(`${base(projectId)}/${changeId}/impacts`, "impacts", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function removeDeclaredImpact(
  projectId: string,
  changeId: string,
  impactId: string,
): Promise<DeclaredImpactDto[]> {
  return requestJson<DeclaredImpactDto[]>(
    `${base(projectId)}/${changeId}/impacts/${impactId}`,
    "impacts",
    { method: "DELETE" },
  );
}

export async function fetchChangeImpactTargets(
  projectId: string,
  signal?: AbortSignal,
): Promise<ChangeImpactTargetsDto> {
  return requestJson<ChangeImpactTargetsDto>(
    `/api/projects/${projectId}/change-impact-targets`,
    "targets",
    { signal },
  );
}

// --- Hooks ------------------------------------------------------------------

export function useChangeRequests(projectId: string, status: ChangeRequestStatus | "") {
  return useResource<ChangeRequestListItemDto[]>(
    React.useCallback(
      (signal) => fetchChangeRequests(projectId, { status }, signal),
      [projectId, status],
    ),
    `changes:${projectId}:${status}`,
  );
}

export function useChangeRequest(projectId: string, changeId: string) {
  return useResource<ChangeRequestDetailDto>(
    React.useCallback(
      (signal) => fetchChangeRequest(projectId, changeId, signal),
      [projectId, changeId],
    ),
    `change:${projectId}:${changeId}`,
  );
}

export function useChangeImpactTargets(projectId: string) {
  return useResource<ChangeImpactTargetsDto>(
    React.useCallback((signal) => fetchChangeImpactTargets(projectId, signal), [projectId]),
    `change-impact-targets:${projectId}`,
  );
}

// --- Impact analysis --------------------------------------------------------

/**
 * Computed impact. Kept in the same client as declared impact, but never mixed
 * with it: a declared impact is a person's assertion, an impact finding is what
 * the engine derived by walking the graph.
 */

export interface ImpactFindingDto {
  id: string;
  analysisId: string;
  rootId: string;
  node: { type: string; id: string };
  identifier: string | null;
  label: string;
  classification: ImpactClassification;
  status: ImpactFindingStatus;
  depth: number;
  basis: string[];
  path: TraversalStep[];
  alternatePathCount: number;
  createdAt: string;
}

export interface ImpactAnalysisRootDto {
  id: string;
  analysisId: string;
  node: { type: string; id: string };
  identifier: string | null;
  label: string;
  resolved: boolean;
  declaredImpactId: string | null;
}

export interface ImpactAnalysisDto {
  id: string;
  projectId: string;
  changeRequestId: string;
  status: ImpactAnalysisStatus;
  engineVersion: string;
  sourceFingerprint: string;
  failureReason: string | null;
  startedAt: string;
  completedAt: string | null;
  requestedById: string | null;
  summary: ImpactSummary;
  limits: {
    maxDepth: number;
    maxNodes: number;
    maxEdges: number;
    truncated: boolean;
    truncatedBy: string | null;
  };
}

export interface ImpactAnalysisReportDto {
  analysis: ImpactAnalysisDto;
  freshness: ImpactFreshness;
  roots: ImpactAnalysisRootDto[];
  findings: ImpactFindingDto[];
}

export interface NoImpactAnalysisDto {
  status: "NOT_RUN";
  changeRequestId: string;
  engineVersion: string;
}

export type LatestImpactAnalysisDto = ImpactAnalysisReportDto | NoImpactAnalysisDto;

/** Distinguishes "nobody has run one" from "one was run and found nothing". */
export function hasAnalysis(
  value: LatestImpactAnalysisDto,
): value is ImpactAnalysisReportDto {
  return "analysis" in value;
}

export async function runImpactAnalysis(
  projectId: string,
  changeId: string,
): Promise<ImpactAnalysisReportDto> {
  return requestJson<ImpactAnalysisReportDto>(
    `${base(projectId)}/${changeId}/impact-analysis`,
    "report",
    { method: "POST", body: JSON.stringify({}) },
  );
}

export async function fetchLatestImpactAnalysis(
  projectId: string,
  changeId: string,
  signal?: AbortSignal,
): Promise<LatestImpactAnalysisDto> {
  return requestJson<LatestImpactAnalysisDto>(
    `${base(projectId)}/${changeId}/impact-analysis/latest`,
    "latest",
    { signal },
  );
}

export async function fetchImpactAnalyses(
  projectId: string,
  changeId: string,
  signal?: AbortSignal,
): Promise<ImpactAnalysisDto[]> {
  return requestJson<ImpactAnalysisDto[]>(
    `${base(projectId)}/${changeId}/impact-analysis`,
    "analyses",
    { signal },
  );
}

export async function fetchImpactAnalysis(
  projectId: string,
  analysisId: string,
  signal?: AbortSignal,
): Promise<ImpactAnalysisReportDto> {
  return requestJson<ImpactAnalysisReportDto>(
    `/api/projects/${projectId}/impact-analyses/${analysisId}`,
    "report",
    { signal },
  );
}

export function useLatestImpactAnalysis(projectId: string, changeId: string) {
  return useResource<LatestImpactAnalysisDto>(
    React.useCallback(
      (signal) => fetchLatestImpactAnalysis(projectId, changeId, signal),
      [projectId, changeId],
    ),
    `impact-latest:${projectId}:${changeId}`,
  );
}

export function useImpactAnalyses(projectId: string, changeId: string) {
  return useResource<ImpactAnalysisDto[]>(
    React.useCallback(
      (signal) => fetchImpactAnalyses(projectId, changeId, signal),
      [projectId, changeId],
    ),
    `impact-history:${projectId}:${changeId}`,
  );
}
