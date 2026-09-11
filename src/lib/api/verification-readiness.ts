"use client";

import * as React from "react";
import type {
  ReadinessBasisChange,
  ReadinessBasisMonitoring,
  ReadinessBasisObject,
  ReadinessBasisRelationship,
  ReadinessFreshness,
  VerificationReadinessCategory,
  VerificationReadinessFindingStatus,
  VerificationReadinessScope,
  VerificationReadinessSeverity,
  VerificationReadinessStatus,
  VerificationReadinessSummary,
} from "@/domain";
import { requestJson } from "./client";
import { useResource } from "./use-resource";

/**
 * Verification readiness API access.
 *
 * Same conventions as the other clients: HTTP only, no organization id ever
 * crosses into the browser, every call scoped by the project in the URL.
 *
 * Nothing here derives a readiness verdict. Status, findings and freshness all
 * come from the server — the browser cannot decide that an activity is ready,
 * and there is no request shape that would let it try.
 */

export interface VerificationReadinessFindingDto {
  id: string;
  assessmentId: string;
  ruleId: string;
  category: VerificationReadinessCategory;
  status: VerificationReadinessFindingStatus;
  severity: VerificationReadinessSeverity;
  subjectType: string;
  subjectId: string;
  subjectIdentifier: string | null;
  subjectLabel: string;
  message: string;
  basis: string[];
  sequence: number;
  createdAt: string;
}

export interface VerificationReadinessAssessmentDto {
  id: string;
  projectId: string;
  verificationActivityId: string;
  status: VerificationReadinessStatus;
  scope: VerificationReadinessScope;
  readinessVersion: string;
  fingerprint: string;
  summary: VerificationReadinessSummary;
  evaluatedAt: string;
  evaluatedById: string | null;
  createdAt: string;
}

export interface VerificationReadinessBasisDto {
  verificationActivityId: string;
  scope: VerificationReadinessScope;
  objects: ReadinessBasisObject[];
  relationships: ReadinessBasisRelationship[];
  monitoring: ReadinessBasisMonitoring[];
  changes: ReadinessBasisChange[];
}

export interface VerificationReadinessReportDto {
  assessment: VerificationReadinessAssessmentDto;
  freshness: ReadinessFreshness;
  findings: VerificationReadinessFindingDto[];
  basis: VerificationReadinessBasisDto;
}

export interface NoVerificationReadinessDto {
  status: "NOT_EVALUATED";
  verificationActivityId: string;
  readinessVersion: string;
}

export type LatestVerificationReadinessDto =
  | VerificationReadinessReportDto
  | NoVerificationReadinessDto;

/**
 * Distinguishes "nobody has assessed this" from "assessed and found nothing".
 *
 * Null-safe: a response the client could not unwrap must fall through to the
 * no-assessment branch rather than throwing. Failing to read a verdict is not a
 * verdict, and a crashed panel tells the reader nothing at all.
 */
export function hasReadinessAssessment(
  value: LatestVerificationReadinessDto | null | undefined,
): value is VerificationReadinessReportDto {
  return value != null && typeof value === "object" && "assessment" in value;
}

function base(projectId: string, activityId: string): string {
  return `/api/projects/${projectId}/verification-activities/${activityId}/readiness`;
}

/**
 * Runs an evaluation.
 *
 * The body is empty on purpose: there is no readiness verdict, finding or rule
 * override a client may supply, and the server rejects any field that is sent.
 */
export async function evaluateVerificationReadiness(
  projectId: string,
  activityId: string,
): Promise<VerificationReadinessReportDto> {
  return requestJson<VerificationReadinessReportDto>(base(projectId, activityId), "report", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function fetchLatestVerificationReadiness(
  projectId: string,
  activityId: string,
  signal?: AbortSignal,
): Promise<LatestVerificationReadinessDto> {
  return requestJson<LatestVerificationReadinessDto>(
    `${base(projectId, activityId)}/latest`,
    "latest",
    { signal },
  );
}

export async function fetchVerificationReadinessHistory(
  projectId: string,
  activityId: string,
  signal?: AbortSignal,
): Promise<VerificationReadinessAssessmentDto[]> {
  return requestJson<VerificationReadinessAssessmentDto[]>(
    base(projectId, activityId),
    "assessments",
    { signal },
  );
}

export async function fetchVerificationReadinessAssessment(
  projectId: string,
  assessmentId: string,
  signal?: AbortSignal,
): Promise<VerificationReadinessReportDto> {
  return requestJson<VerificationReadinessReportDto>(
    `/api/projects/${projectId}/verification-readiness/${assessmentId}`,
    "report",
    { signal },
  );
}

export function useLatestVerificationReadiness(projectId: string, activityId: string) {
  return useResource<LatestVerificationReadinessDto>(
    React.useCallback(
      (signal) => fetchLatestVerificationReadiness(projectId, activityId, signal),
      [projectId, activityId],
    ),
    `readiness-latest:${projectId}:${activityId}`,
  );
}

export function useVerificationReadinessHistory(projectId: string, activityId: string) {
  return useResource<VerificationReadinessAssessmentDto[]>(
    React.useCallback(
      (signal) => fetchVerificationReadinessHistory(projectId, activityId, signal),
      [projectId, activityId],
    ),
    `readiness-history:${projectId}:${activityId}`,
  );
}
