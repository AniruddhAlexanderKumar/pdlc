"use client";

import * as React from "react";
import type {
  AssumptionStatus,
  ComparisonOperator,
  CreateAlternativeRequest,
  CreateAssumptionRequest,
  CreateDecisionRequest,
  DecisionLinkRequest,
  DecisionRelation,
  DecisionStatus,
  ExpectationStatus,
  SetExpectationRequest,
  UpdateAlternativeRequest,
  UpdateAssumptionRequest,
  UpdateDecisionRequest,
} from "@/domain";
import { requestJson } from "./client";
import type { AuditEventDto, OwnerSummary } from "./requirements";
import { useResource } from "./use-resource";

/**
 * Decision memory API access.
 *
 * Same conventions as the other clients: HTTP only, no organization id ever
 * crosses into the browser, every call scoped by the project in the URL.
 */

export interface DecisionDto {
  id: string;
  projectId: string;
  identifier: string;
  title: string;
  statement: string;
  rationale: string;
  status: DecisionStatus;
  ownerId: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DecisionListItemDto extends DecisionDto {
  owner: OwnerSummary | null;
}

export interface AlternativeDto {
  id: string;
  engineeringDecisionId: string;
  title: string;
  description: string | null;
  reasonRejected: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssumptionDto {
  id: string;
  engineeringDecisionId: string;
  statement: string;
  status: AssumptionStatus;
  rationale: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExpectationDto {
  id: string;
  engineeringDecisionId: string;
  statement: string;
  measure: string | null;
  expectedValue: string | null;
  unit: string | null;
  /**
   * How `expectedValue` should be compared. Null means "not comparable" — the
   * design/operations drift engine reports that explicitly rather than parsing
   * an operator out of the expected-value text.
   */
  comparisonOperator: ComparisonOperator | null;
  dueAt: string | null;
  status: ExpectationStatus;
  actualValue: string | null;
  observedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DecisionLinkDto {
  relation: DecisionRelation;
  targetId: string;
  identifier: string;
  title: string;
  linkType: string | null;
  note: string | null;
  createdAt: string;
}

export interface DecisionDetailDto extends DecisionDto {
  owner: OwnerSummary | null;
  alternatives: AlternativeDto[];
  assumptions: AssumptionDto[];
  expectation: ExpectationDto | null;
  links: DecisionLinkDto[];
  availableTransitions: DecisionStatus[];
  editable: { content: boolean; owner: boolean; assumptions: boolean; links: boolean };
  history: AuditEventDto[];
}

export interface LinkTargetOptionDto {
  id: string;
  identifier: string;
  title: string;
}

export type DecisionLinkTargetsDto = Record<DecisionRelation, LinkTargetOptionDto[]>;

function base(projectId: string): string {
  return `/api/projects/${projectId}/decisions`;
}

// --- Decision ---------------------------------------------------------------

export async function fetchDecisions(
  projectId: string,
  options: { status?: DecisionStatus | "" } = {},
  signal?: AbortSignal,
): Promise<DecisionListItemDto[]> {
  const query = options.status ? `?status=${encodeURIComponent(options.status)}` : "";
  return requestJson<DecisionListItemDto[]>(`${base(projectId)}${query}`, "decisions", { signal });
}

export async function fetchDecision(
  projectId: string,
  decisionId: string,
  signal?: AbortSignal,
): Promise<DecisionDetailDto> {
  return requestJson<DecisionDetailDto>(`${base(projectId)}/${decisionId}`, "decision", { signal });
}

export async function createDecision(
  projectId: string,
  input: CreateDecisionRequest,
): Promise<DecisionDto> {
  return requestJson<DecisionDto>(base(projectId), "decision", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateDecision(
  projectId: string,
  decisionId: string,
  input: UpdateDecisionRequest,
): Promise<DecisionDto> {
  return requestJson<DecisionDto>(`${base(projectId)}/${decisionId}`, "decision", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function transitionDecision(
  projectId: string,
  decisionId: string,
  to: DecisionStatus,
  rationale?: string | null,
): Promise<DecisionDto> {
  return requestJson<DecisionDto>(`${base(projectId)}/${decisionId}/transition`, "decision", {
    method: "POST",
    body: JSON.stringify({ to, rationale: rationale ?? null }),
  });
}

export async function assignDecisionOwner(
  projectId: string,
  decisionId: string,
  ownerId: string | null,
): Promise<DecisionDto> {
  return requestJson<DecisionDto>(`${base(projectId)}/${decisionId}/owner`, "decision", {
    method: "POST",
    body: JSON.stringify({ ownerId }),
  });
}

// --- Alternatives -----------------------------------------------------------

export async function addAlternative(
  projectId: string,
  decisionId: string,
  input: CreateAlternativeRequest,
): Promise<AlternativeDto> {
  return requestJson<AlternativeDto>(
    `${base(projectId)}/${decisionId}/alternatives`,
    "alternative",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function updateAlternative(
  projectId: string,
  decisionId: string,
  alternativeId: string,
  input: UpdateAlternativeRequest,
): Promise<AlternativeDto> {
  return requestJson<AlternativeDto>(
    `${base(projectId)}/${decisionId}/alternatives/${alternativeId}`,
    "alternative",
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export async function removeAlternative(
  projectId: string,
  decisionId: string,
  alternativeId: string,
): Promise<void> {
  await requestJson<boolean>(
    `${base(projectId)}/${decisionId}/alternatives/${alternativeId}`,
    "removed",
    { method: "DELETE" },
  );
}

// --- Assumptions ------------------------------------------------------------

export async function addAssumption(
  projectId: string,
  decisionId: string,
  input: CreateAssumptionRequest,
): Promise<AssumptionDto> {
  return requestJson<AssumptionDto>(`${base(projectId)}/${decisionId}/assumptions`, "assumption", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateAssumption(
  projectId: string,
  decisionId: string,
  assumptionId: string,
  input: UpdateAssumptionRequest,
): Promise<AssumptionDto> {
  return requestJson<AssumptionDto>(
    `${base(projectId)}/${decisionId}/assumptions/${assumptionId}`,
    "assumption",
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export async function removeAssumption(
  projectId: string,
  decisionId: string,
  assumptionId: string,
): Promise<void> {
  await requestJson<boolean>(
    `${base(projectId)}/${decisionId}/assumptions/${assumptionId}`,
    "removed",
    { method: "DELETE" },
  );
}

// --- Expectation ------------------------------------------------------------

export async function setExpectation(
  projectId: string,
  decisionId: string,
  input: SetExpectationRequest,
): Promise<ExpectationDto> {
  return requestJson<ExpectationDto>(
    `${base(projectId)}/${decisionId}/expectation`,
    "expectation",
    { method: "PUT", body: JSON.stringify(input) },
  );
}

export async function clearExpectation(projectId: string, decisionId: string): Promise<void> {
  await requestJson<boolean>(`${base(projectId)}/${decisionId}/expectation`, "removed", {
    method: "DELETE",
  });
}

// --- Traceability -----------------------------------------------------------

export async function addDecisionLink(
  projectId: string,
  decisionId: string,
  input: DecisionLinkRequest,
): Promise<DecisionLinkDto[]> {
  return requestJson<DecisionLinkDto[]>(`${base(projectId)}/${decisionId}/links`, "links", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function removeDecisionLink(
  projectId: string,
  decisionId: string,
  link: { relation: DecisionRelation; targetId: string; linkType?: string | null },
): Promise<DecisionLinkDto[]> {
  const params = new URLSearchParams({ relation: link.relation, targetId: link.targetId });
  if (link.linkType) params.set("linkType", link.linkType);

  return requestJson<DecisionLinkDto[]>(
    `${base(projectId)}/${decisionId}/links?${params.toString()}`,
    "links",
    { method: "DELETE" },
  );
}

export async function fetchDecisionLinkTargets(
  projectId: string,
  signal?: AbortSignal,
): Promise<DecisionLinkTargetsDto> {
  return requestJson<DecisionLinkTargetsDto>(
    `/api/projects/${projectId}/decision-link-targets`,
    "targets",
    { signal },
  );
}

// --- Hooks ------------------------------------------------------------------

export function useDecisions(projectId: string, status: DecisionStatus | "") {
  return useResource<DecisionListItemDto[]>(
    React.useCallback(
      (signal) => fetchDecisions(projectId, { status }, signal),
      [projectId, status],
    ),
    `decisions:${projectId}:${status}`,
  );
}

export function useDecision(projectId: string, decisionId: string) {
  return useResource<DecisionDetailDto>(
    React.useCallback(
      (signal) => fetchDecision(projectId, decisionId, signal),
      [projectId, decisionId],
    ),
    `decision:${projectId}:${decisionId}`,
  );
}

export function useDecisionLinkTargets(projectId: string) {
  return useResource<DecisionLinkTargetsDto>(
    React.useCallback((signal) => fetchDecisionLinkTargets(projectId, signal), [projectId]),
    `decision-link-targets:${projectId}`,
  );
}
