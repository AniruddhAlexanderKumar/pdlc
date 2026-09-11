"use client";

import * as React from "react";
import type {
  CreateRiskRequest,
  RiskLinkRequest,
  RiskRelation,
  RiskStatus,
  UpdateRiskRequest,
} from "@/domain";
import { requestJson } from "./client";
import type { AuditEventDto, OwnerSummary } from "./requirements";
import { useResource } from "./use-resource";

/**
 * Risk API access and its loading hooks.
 *
 * Follows the same conventions as the requirements client: the browser talks
 * HTTP only, never sees an organization id, and every call is scoped by the
 * project in the URL. There is no numerical risk score anywhere in this
 * module, because the API never returns one.
 */

export type { OwnerSummary, AuditEventDto };

/** A risk over the wire — dates are ISO strings. */
export interface RiskDto {
  id: string;
  projectId: string;
  identifier: string;
  title: string;
  description: string;
  cause: string | null;
  consequence: string | null;
  status: RiskStatus;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RiskListItemDto extends RiskDto {
  owner: OwnerSummary | null;
}

export interface RiskLinkDto {
  id: string;
  relation: RiskRelation;
  targetId: string;
  identifier: string;
  title: string;
  note: string | null;
  createdAt: string;
}

export interface RiskDetailDto extends RiskDto {
  owner: OwnerSummary | null;
  links: RiskLinkDto[];
  availableTransitions: RiskStatus[];
  editable: { content: boolean; owner: boolean; links: boolean };
  history: AuditEventDto[];
}

export interface LinkTargetOptionDto {
  id: string;
  identifier: string;
  title: string;
}

export type RiskLinkTargetsDto = Record<RiskRelation, LinkTargetOptionDto[]>;

function base(projectId: string): string {
  return `/api/projects/${projectId}/risks`;
}

export async function fetchRisks(
  projectId: string,
  options: { status?: RiskStatus | "" } = {},
  signal?: AbortSignal,
): Promise<RiskListItemDto[]> {
  const query = options.status ? `?status=${encodeURIComponent(options.status)}` : "";
  return requestJson<RiskListItemDto[]>(`${base(projectId)}${query}`, "risks", { signal });
}

export async function fetchRisk(
  projectId: string,
  riskId: string,
  signal?: AbortSignal,
): Promise<RiskDetailDto> {
  return requestJson<RiskDetailDto>(`${base(projectId)}/${riskId}`, "risk", { signal });
}

export async function createRisk(projectId: string, input: CreateRiskRequest): Promise<RiskDto> {
  return requestJson<RiskDto>(base(projectId), "risk", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateRisk(
  projectId: string,
  riskId: string,
  input: UpdateRiskRequest,
): Promise<RiskDto> {
  return requestJson<RiskDto>(`${base(projectId)}/${riskId}`, "risk", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function transitionRisk(
  projectId: string,
  riskId: string,
  to: RiskStatus,
  rationale?: string | null,
): Promise<RiskDto> {
  return requestJson<RiskDto>(`${base(projectId)}/${riskId}/transition`, "risk", {
    method: "POST",
    body: JSON.stringify({ to, rationale: rationale ?? null }),
  });
}

export async function assignRiskOwner(
  projectId: string,
  riskId: string,
  ownerId: string | null,
): Promise<RiskDto> {
  return requestJson<RiskDto>(`${base(projectId)}/${riskId}/owner`, "risk", {
    method: "POST",
    body: JSON.stringify({ ownerId }),
  });
}

function linksBase(projectId: string, riskId: string): string {
  return `${base(projectId)}/${riskId}/links`;
}

export async function fetchRiskLinks(
  projectId: string,
  riskId: string,
  signal?: AbortSignal,
): Promise<RiskLinkDto[]> {
  return requestJson<RiskLinkDto[]>(linksBase(projectId, riskId), "links", { signal });
}

export async function addRiskLink(
  projectId: string,
  riskId: string,
  input: RiskLinkRequest,
): Promise<RiskLinkDto> {
  return requestJson<RiskLinkDto>(linksBase(projectId, riskId), "link", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function removeRiskLink(
  projectId: string,
  riskId: string,
  linkId: string,
): Promise<void> {
  await requestJson<boolean>(`${linksBase(projectId, riskId)}/${encodeURIComponent(linkId)}`, "removed", {
    method: "DELETE",
  });
}

export async function fetchRiskLinkTargets(
  projectId: string,
  signal?: AbortSignal,
): Promise<RiskLinkTargetsDto> {
  return requestJson<RiskLinkTargetsDto>(`/api/projects/${projectId}/risk-link-targets`, "targets", {
    signal,
  });
}

// --- Hooks --------------------------------------------------------------------

export function useRisks(projectId: string, status: RiskStatus | "") {
  return useResource<RiskListItemDto[]>(
    React.useCallback((signal) => fetchRisks(projectId, { status }, signal), [projectId, status]),
    `risks:${projectId}:${status}`,
  );
}

export function useRisk(projectId: string, riskId: string) {
  return useResource<RiskDetailDto>(
    React.useCallback((signal) => fetchRisk(projectId, riskId, signal), [projectId, riskId]),
    `risk:${projectId}:${riskId}`,
  );
}

export function useRiskLinkTargets(projectId: string) {
  return useResource<RiskLinkTargetsDto>(
    React.useCallback((signal) => fetchRiskLinkTargets(projectId, signal), [projectId]),
    `risk-link-targets:${projectId}`,
  );
}
