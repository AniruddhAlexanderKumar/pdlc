"use client";

import * as React from "react";
import type {
  TechnicalReadinessCategory,
  TechnicalReadinessFindingStatus,
  TechnicalReadinessFreshness,
  TechnicalReadinessGate,
  TechnicalReadinessScope,
  TechnicalReadinessSeverity,
  TechnicalReadinessStatus,
  TechnicalReadinessSummary,
} from "@/domain";
import { requestJson } from "./client";
import { useResource } from "./use-resource";

/**
 * Technical readiness API access.
 *
 * Same conventions as the other clients: HTTP only, no organization id ever
 * crosses into the browser, every call scoped by the project in the URL.
 *
 * Nothing here derives a gate verdict. Status, findings, scope and freshness all
 * come from the server. The only thing the browser chooses is *which gate to
 * ask about* — rule selection belongs entirely to the backend, and there is no
 * request shape that would let a client add to or subtract from a gate's rules.
 */

export interface TechnicalReadinessFindingDto {
  id: string;
  assessmentId: string;
  ruleId: string;
  category: TechnicalReadinessCategory;
  status: TechnicalReadinessFindingStatus;
  severity: TechnicalReadinessSeverity;
  subjectType: string;
  subjectId: string;
  subjectIdentifier: string | null;
  subjectLabel: string;
  message: string;
  basis: string[];
  sequence: number;
  createdAt: string;
}

export interface TechnicalReadinessAssessmentDto {
  id: string;
  projectId: string;
  gate: TechnicalReadinessGate;
  status: TechnicalReadinessStatus;
  readinessVersion: string;
  fingerprint: string;
  summary: TechnicalReadinessSummary;
  evaluatedAt: string;
  evaluatedById: string | null;
  createdAt: string;
}

export interface TechnicalReadinessReportDto {
  assessment: TechnicalReadinessAssessmentDto;
  freshness: TechnicalReadinessFreshness;
  findings: TechnicalReadinessFindingDto[];
  scope: TechnicalReadinessScope;
}

export interface NoTechnicalReadinessDto {
  status: "NOT_EVALUATED";
  projectId: string;
  gate: TechnicalReadinessGate;
  readinessVersion: string;
}

export type LatestTechnicalReadinessDto =
  | TechnicalReadinessReportDto
  | NoTechnicalReadinessDto;

/**
 * Distinguishes "nobody has assessed this gate" from "assessed and clean".
 *
 * Null-safe: a response the client could not unwrap must fall through to the
 * no-assessment branch rather than throwing. Failing to read a verdict is not a
 * verdict, and a crashed panel tells the reader nothing at all.
 */
export function hasTechnicalAssessment(
  value: LatestTechnicalReadinessDto | null | undefined,
): value is TechnicalReadinessReportDto {
  return value != null && typeof value === "object" && "assessment" in value;
}

function base(projectId: string): string {
  return `/api/projects/${projectId}/technical-readiness`;
}

/**
 * Evaluates one gate.
 *
 * The gate is the only thing sent. There is no verdict, rule, finding or actor
 * a client may supply, and the server rejects any other field.
 */
export async function evaluateTechnicalReadiness(
  projectId: string,
  gate: TechnicalReadinessGate,
): Promise<TechnicalReadinessReportDto> {
  return requestJson<TechnicalReadinessReportDto>(base(projectId), "report", {
    method: "POST",
    body: JSON.stringify({ gate }),
  });
}

export async function fetchLatestTechnicalReadiness(
  projectId: string,
  gate: TechnicalReadinessGate,
  signal?: AbortSignal,
): Promise<LatestTechnicalReadinessDto> {
  return requestJson<LatestTechnicalReadinessDto>(
    `${base(projectId)}/latest?gate=${encodeURIComponent(gate)}`,
    "latest",
    { signal },
  );
}

export async function fetchTechnicalReadinessHistory(
  projectId: string,
  gate: TechnicalReadinessGate | "",
  signal?: AbortSignal,
): Promise<TechnicalReadinessAssessmentDto[]> {
  const query = gate ? `?gate=${encodeURIComponent(gate)}` : "";
  return requestJson<TechnicalReadinessAssessmentDto[]>(
    `${base(projectId)}${query}`,
    "assessments",
    { signal },
  );
}

export async function fetchTechnicalReadinessAssessment(
  projectId: string,
  assessmentId: string,
  signal?: AbortSignal,
): Promise<TechnicalReadinessReportDto> {
  return requestJson<TechnicalReadinessReportDto>(
    `${base(projectId)}/${assessmentId}`,
    "report",
    { signal },
  );
}

export function useLatestTechnicalReadiness(
  projectId: string,
  gate: TechnicalReadinessGate,
) {
  return useResource<LatestTechnicalReadinessDto>(
    React.useCallback(
      (signal) => fetchLatestTechnicalReadiness(projectId, gate, signal),
      [projectId, gate],
    ),
    `technical-readiness-latest:${projectId}:${gate}`,
  );
}

export function useTechnicalReadinessHistory(
  projectId: string,
  gate: TechnicalReadinessGate | "",
) {
  return useResource<TechnicalReadinessAssessmentDto[]>(
    React.useCallback(
      (signal) => fetchTechnicalReadinessHistory(projectId, gate, signal),
      [projectId, gate],
    ),
    `technical-readiness-history:${projectId}:${gate}`,
  );
}
