"use client";

import * as React from "react";
import type {
  AddBaselineMemberRequest,
  BaselineMemberType,
  BaselineStatus,
  CreateBaselineRequest,
  CreateObservationRequest,
  DriftCategory,
  DriftFindingStatus,
  DriftFreshness,
  DriftSeverity,
  DriftStatus,
  ObservationStatus,
  ObservationType,
  UpdateBaselineRequest,
  UpdateObservationRequest,
} from "@/domain";
import { requestJson } from "./client";
import type { AuditEventDto } from "./requirements";
import { useResource } from "./use-resource";

/**
 * Design / operations drift API access.
 *
 * Same conventions as the other clients: HTTP only, never imports server code,
 * no organization id ever leaves or enters the browser, and every call is scoped
 * by the project in the URL.
 *
 * Note what has no client function: nothing evaluates drift implicitly. There is
 * an explicit `evaluateDrift`, and the hooks below only ever *read*.
 */

// --- Baselines --------------------------------------------------------------

export interface BaselineDto {
  id: string;
  projectId: string;
  identifier: string;
  name: string;
  description: string | null;
  status: BaselineStatus;
  createdById: string | null;
  baselinedAt: string | null;
  baselinedById: string | null;
  supersededAt: string | null;
  supersededById: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Counts are real aggregates from the list query, never derived in the browser. */
export interface BaselineListDto extends BaselineDto {
  memberCount: number;
  assessmentCount: number;
}

export interface BaselineMemberDto {
  id: string;
  baselineId: string;
  nodeType: BaselineMemberType;
  nodeId: string;
  identifierSnapshot: string | null;
  labelSnapshot: string;
  stateSnapshot: string | null;
  fingerprint: string;
  revisionSnapshot: string;
  createdAt: string;
}

export interface BaselineMemberWithCurrentDto extends BaselineMemberDto {
  currentFingerprint: string | null;
  currentLabel: string | null;
  currentState: string | null;
  /** Whether the object has moved since it was baselined. */
  changed: boolean;
}

export interface BaselineDetailDto extends BaselineDto {
  members: BaselineMemberWithCurrentDto[];
  history: AuditEventDto[];
}

function baselinesBase(projectId: string): string {
  return `/api/projects/${projectId}/baselines`;
}

export async function fetchBaselines(
  projectId: string,
  signal?: AbortSignal,
): Promise<BaselineListDto[]> {
  return requestJson<BaselineListDto[]>(baselinesBase(projectId), "baselines", { signal });
}

export async function fetchBaseline(
  projectId: string,
  baselineId: string,
  signal?: AbortSignal,
): Promise<BaselineDetailDto> {
  return requestJson<BaselineDetailDto>(
    `${baselinesBase(projectId)}/${baselineId}`,
    "baseline",
    { signal },
  );
}

export async function createBaseline(
  projectId: string,
  input: CreateBaselineRequest,
): Promise<BaselineDto> {
  return requestJson<BaselineDto>(baselinesBase(projectId), "baseline", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateBaseline(
  projectId: string,
  baselineId: string,
  input: UpdateBaselineRequest,
): Promise<BaselineDto> {
  return requestJson<BaselineDto>(`${baselinesBase(projectId)}/${baselineId}`, "baseline", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function addBaselineMember(
  projectId: string,
  baselineId: string,
  input: AddBaselineMemberRequest,
): Promise<BaselineMemberDto> {
  return requestJson<BaselineMemberDto>(
    `${baselinesBase(projectId)}/${baselineId}/members`,
    "member",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function removeBaselineMember(
  projectId: string,
  baselineId: string,
  memberId: string,
): Promise<{ removed: boolean }> {
  return requestJson<boolean>(
    `${baselinesBase(projectId)}/${baselineId}/members/${memberId}`,
    "removed",
    { method: "DELETE" },
  ).then((removed) => ({ removed }));
}

/** `supersedeActive` must be sent deliberately; nothing is replaced silently. */
export async function activateBaseline(
  projectId: string,
  baselineId: string,
  supersedeActive = false,
): Promise<BaselineDto> {
  return requestJson<BaselineDto>(
    `${baselinesBase(projectId)}/${baselineId}/activate`,
    "baseline",
    { method: "POST", body: JSON.stringify({ supersedeActive }) },
  );
}

export async function supersedeBaseline(
  projectId: string,
  baselineId: string,
): Promise<BaselineDto> {
  return requestJson<BaselineDto>(
    `${baselinesBase(projectId)}/${baselineId}/supersede`,
    "baseline",
    { method: "POST" },
  );
}

export type BaselineMemberTargetsDto = Record<
  BaselineMemberType,
  Array<{ id: string; identifier: string; title: string }>
>;

export async function fetchBaselineMemberTargets(
  projectId: string,
  signal?: AbortSignal,
): Promise<BaselineMemberTargetsDto> {
  return requestJson<BaselineMemberTargetsDto>(
    `/api/projects/${projectId}/baseline-member-targets`,
    "targets",
    { signal },
  );
}

export function useBaselines(projectId: string) {
  return useResource<BaselineListDto[]>(
    React.useCallback((signal) => fetchBaselines(projectId, signal), [projectId]),
    `baselines:${projectId}`,
  );
}

export function useBaseline(projectId: string, baselineId: string) {
  return useResource<BaselineDetailDto>(
    React.useCallback(
      (signal) => fetchBaseline(projectId, baselineId, signal),
      [projectId, baselineId],
    ),
    `baseline:${projectId}:${baselineId}`,
  );
}

export function useBaselineMemberTargets(projectId: string) {
  return useResource<BaselineMemberTargetsDto>(
    React.useCallback((signal) => fetchBaselineMemberTargets(projectId, signal), [projectId]),
    `baselineTargets:${projectId}`,
  );
}

// --- Observations -----------------------------------------------------------

export interface ObservationDto {
  id: string;
  projectId: string;
  identifier: string;
  title: string;
  description: string;
  observationType: ObservationType;
  status: ObservationStatus;
  source: string | null;
  observedAt: string;
  subjectLabel: string | null;
  /** Exact decimal text, never a JavaScript number. */
  numericValue: string | null;
  unit: string | null;
  textValue: string | null;
  subject: { type: string; id: string } | null;
  createdById: string | null;
  reviewedAt: string | null;
  reviewedById: string | null;
  createdAt: string;
  updatedAt: string;
}

function observationsBase(projectId: string): string {
  return `/api/projects/${projectId}/observations`;
}

export async function fetchObservations(
  projectId: string,
  status?: ObservationStatus | "",
  signal?: AbortSignal,
): Promise<ObservationDto[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return requestJson<ObservationDto[]>(`${observationsBase(projectId)}${query}`, "observations", {
    signal,
  });
}

export async function fetchObservation(
  projectId: string,
  observationId: string,
  signal?: AbortSignal,
): Promise<ObservationDto> {
  return requestJson<ObservationDto>(
    `${observationsBase(projectId)}/${observationId}`,
    "observation",
    { signal },
  );
}

export async function createObservation(
  projectId: string,
  input: CreateObservationRequest,
): Promise<ObservationDto> {
  return requestJson<ObservationDto>(observationsBase(projectId), "observation", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateObservation(
  projectId: string,
  observationId: string,
  input: UpdateObservationRequest,
): Promise<ObservationDto> {
  return requestJson<ObservationDto>(
    `${observationsBase(projectId)}/${observationId}`,
    "observation",
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export async function reviewObservation(
  projectId: string,
  observationId: string,
  note?: string | null,
): Promise<ObservationDto> {
  return requestJson<ObservationDto>(
    `${observationsBase(projectId)}/${observationId}/review`,
    "observation",
    { method: "POST", body: JSON.stringify({ note: note ?? null }) },
  );
}

export async function rejectObservation(
  projectId: string,
  observationId: string,
  note?: string | null,
): Promise<ObservationDto> {
  return requestJson<ObservationDto>(
    `${observationsBase(projectId)}/${observationId}/reject`,
    "observation",
    { method: "POST", body: JSON.stringify({ note: note ?? null }) },
  );
}

export function useObservations(projectId: string, status: ObservationStatus | "" = "") {
  return useResource<ObservationDto[]>(
    React.useCallback(
      (signal) => fetchObservations(projectId, status, signal),
      [projectId, status],
    ),
    `observations:${projectId}:${status}`,
  );
}

// --- Drift ------------------------------------------------------------------

export interface DriftSubjectDto {
  type: string;
  id: string;
  identifier: string | null;
  label: string;
}

export interface DriftFindingDto {
  id: string;
  assessmentId: string;
  ruleId: string;
  category: DriftCategory;
  status: DriftFindingStatus;
  severity: DriftSeverity;
  baselineSubject: DriftSubjectDto | null;
  observationSubject: DriftSubjectDto | null;
  expectedValue: string | null;
  observedValue: string | null;
  explanation: string;
  basis: string[];
  sequence: number;
  createdAt: string;
}

export interface DriftAssessmentDto {
  id: string;
  projectId: string;
  baselineId: string;
  status: DriftStatus;
  driftVersion: string;
  fingerprint: string;
  summary: {
    findings: number;
    reviewRequired: number;
    informational: number;
    unknown: number;
  };
  evaluatedAt: string;
  evaluatedById: string | null;
  createdAt: string;
}

export interface DriftBasisDto {
  baselineId: string;
  baselineIdentifier: string;
  baselineName: string;
  baselineStatus: BaselineStatus;
  members: Array<{
    memberId: string;
    nodeType: BaselineMemberType;
    nodeId: string;
    identifier: string | null;
    baselinedFingerprint: string;
    currentFingerprint: string | null;
  }>;
  observations: Array<{
    observationId: string;
    identifier: string;
    status: ObservationStatus;
    subjectType: string | null;
    subjectId: string | null;
    revision: string;
  }>;
}

export interface DriftReportDto {
  assessment: DriftAssessmentDto;
  freshness: DriftFreshness;
  findings: DriftFindingDto[];
  basis: DriftBasisDto;
}

export interface NoDriftDto {
  status: "NOT_EVALUATED";
  projectId: string;
  driftVersion: string;
}

export type LatestDriftDto = DriftReportDto | NoDriftDto;

export function hasDriftReport(value: LatestDriftDto): value is DriftReportDto {
  return "assessment" in value;
}

function driftBase(projectId: string): string {
  return `/api/projects/${projectId}/drift`;
}

/** The only call that writes. Explicit, never issued on a page load. */
export async function evaluateDrift(
  projectId: string,
  baselineId: string,
): Promise<DriftReportDto> {
  return requestJson<DriftReportDto>(`${driftBase(projectId)}/evaluate`, "report", {
    method: "POST",
    body: JSON.stringify({ baselineId }),
  });
}

export async function fetchLatestDrift(
  projectId: string,
  baselineId?: string,
  signal?: AbortSignal,
): Promise<LatestDriftDto> {
  const query = baselineId ? `?baselineId=${encodeURIComponent(baselineId)}` : "";
  return requestJson<LatestDriftDto>(`${driftBase(projectId)}/latest${query}`, "latest", {
    signal,
  });
}

export async function fetchDriftHistory(
  projectId: string,
  baselineId?: string,
  signal?: AbortSignal,
): Promise<DriftAssessmentDto[]> {
  const query = baselineId ? `?baselineId=${encodeURIComponent(baselineId)}` : "";
  return requestJson<DriftAssessmentDto[]>(`${driftBase(projectId)}${query}`, "assessments", {
    signal,
  });
}

export async function fetchDriftAssessment(
  projectId: string,
  assessmentId: string,
  signal?: AbortSignal,
): Promise<DriftReportDto> {
  return requestJson<DriftReportDto>(`${driftBase(projectId)}/${assessmentId}`, "report", {
    signal,
  });
}

export function useLatestDrift(projectId: string, baselineId: string) {
  return useResource<LatestDriftDto>(
    React.useCallback(
      (signal) => fetchLatestDrift(projectId, baselineId || undefined, signal),
      [projectId, baselineId],
    ),
    `drift:${projectId}:${baselineId}`,
  );
}

export function useDriftHistory(projectId: string, baselineId: string) {
  return useResource<DriftAssessmentDto[]>(
    React.useCallback(
      (signal) => fetchDriftHistory(projectId, baselineId || undefined, signal),
      [projectId, baselineId],
    ),
    `driftHistory:${projectId}:${baselineId}`,
  );
}
