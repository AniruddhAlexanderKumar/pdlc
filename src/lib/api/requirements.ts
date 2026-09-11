"use client";

import * as React from "react";
import type {
  CreateRequirementRequest,
  RequirementLinkRequest,
  RequirementPriority,
  RequirementRelation,
  RequirementStatus,
  UpdateRequirementRequest,
} from "@/domain";
import { requestJson } from "./client";
import { useResource } from "./use-resource";

/**
 * Requirement API access and its loading hooks.
 *
 * Follows the same conventions as the projects client: the browser talks HTTP
 * only, never sees an organization id, and every call is scoped by the project
 * in the URL. No new data-fetching framework.
 */

export interface OwnerSummary {
  id: string;
  name: string;
  email: string;
}

/** A requirement over the wire — dates are ISO strings. */
export interface RequirementDto {
  id: string;
  projectId: string;
  identifier: string;
  title: string;
  statement: string;
  rationale: string | null;
  status: RequirementStatus;
  priority: RequirementPriority;
  source: string | null;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RequirementListItemDto extends RequirementDto {
  owner: OwnerSummary | null;
}

export interface RequirementLinkDto {
  relation: RequirementRelation;
  targetId: string;
  identifier: string;
  title: string;
  linkType: string | null;
  note: string | null;
  createdAt: string;
}

export interface AuditEventDto {
  id: string;
  action: string;
  createdAt: string;
  actor: { id: string; name: string } | null;
  metadata: unknown;
}

export interface RequirementDetailDto extends RequirementDto {
  owner: OwnerSummary | null;
  links: RequirementLinkDto[];
  availableTransitions: RequirementStatus[];
  editable: { content: boolean; owner: boolean; links: boolean };
  history: AuditEventDto[];
}

export interface LinkTargetOptionDto {
  id: string;
  identifier: string;
  title: string;
}

export type LinkTargetsDto = Record<RequirementRelation, LinkTargetOptionDto[]>;

function base(projectId: string): string {
  return `/api/projects/${projectId}/requirements`;
}

export async function fetchRequirements(
  projectId: string,
  options: { status?: RequirementStatus | "" } = {},
  signal?: AbortSignal,
): Promise<RequirementListItemDto[]> {
  const query = options.status ? `?status=${encodeURIComponent(options.status)}` : "";
  return requestJson<RequirementListItemDto[]>(`${base(projectId)}${query}`, "requirements", {
    signal,
  });
}

export async function fetchRequirement(
  projectId: string,
  requirementId: string,
  signal?: AbortSignal,
): Promise<RequirementDetailDto> {
  return requestJson<RequirementDetailDto>(
    `${base(projectId)}/${requirementId}`,
    "requirement",
    { signal },
  );
}

export async function createRequirement(
  projectId: string,
  input: CreateRequirementRequest,
): Promise<RequirementDto> {
  return requestJson<RequirementDto>(base(projectId), "requirement", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateRequirement(
  projectId: string,
  requirementId: string,
  input: UpdateRequirementRequest,
): Promise<RequirementDto> {
  return requestJson<RequirementDto>(`${base(projectId)}/${requirementId}`, "requirement", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function transitionRequirement(
  projectId: string,
  requirementId: string,
  to: RequirementStatus,
  rationale?: string | null,
): Promise<RequirementDto> {
  return requestJson<RequirementDto>(
    `${base(projectId)}/${requirementId}/transition`,
    "requirement",
    { method: "POST", body: JSON.stringify({ to, rationale: rationale ?? null }) },
  );
}

export async function assignRequirementOwner(
  projectId: string,
  requirementId: string,
  ownerId: string | null,
): Promise<RequirementDto> {
  return requestJson<RequirementDto>(`${base(projectId)}/${requirementId}/owner`, "requirement", {
    method: "POST",
    body: JSON.stringify({ ownerId }),
  });
}

export async function addRequirementLink(
  projectId: string,
  requirementId: string,
  input: RequirementLinkRequest,
): Promise<RequirementLinkDto[]> {
  return requestJson<RequirementLinkDto[]>(`${base(projectId)}/${requirementId}/links`, "links", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function removeRequirementLink(
  projectId: string,
  requirementId: string,
  link: { relation: RequirementRelation; targetId: string; linkType?: string | null },
): Promise<RequirementLinkDto[]> {
  const params = new URLSearchParams({ relation: link.relation, targetId: link.targetId });
  if (link.linkType) params.set("linkType", link.linkType);

  return requestJson<RequirementLinkDto[]>(
    `${base(projectId)}/${requirementId}/links?${params.toString()}`,
    "links",
    { method: "DELETE" },
  );
}

export async function fetchLinkTargets(
  projectId: string,
  signal?: AbortSignal,
): Promise<LinkTargetsDto> {
  return requestJson<LinkTargetsDto>(`/api/projects/${projectId}/link-targets`, "targets", {
    signal,
  });
}

export async function fetchOrganizationMembers(signal?: AbortSignal): Promise<OwnerSummary[]> {
  return requestJson<OwnerSummary[]>("/api/organization/members", "members", { signal });
}

// --- Hooks ------------------------------------------------------------------

export function useRequirements(projectId: string, status: RequirementStatus | "") {
  return useResource<RequirementListItemDto[]>(
    React.useCallback(
      (signal) => fetchRequirements(projectId, { status }, signal),
      [projectId, status],
    ),
    `${projectId}:${status}`,
  );
}

export function useRequirement(projectId: string, requirementId: string) {
  return useResource<RequirementDetailDto>(
    React.useCallback(
      (signal) => fetchRequirement(projectId, requirementId, signal),
      [projectId, requirementId],
    ),
    `${projectId}:${requirementId}`,
  );
}

export function useLinkTargets(projectId: string) {
  return useResource<LinkTargetsDto>(
    React.useCallback((signal) => fetchLinkTargets(projectId, signal), [projectId]),
    `link-targets:${projectId}`,
  );
}

export function useOrganizationMembers() {
  return useResource<OwnerSummary[]>(
    React.useCallback((signal) => fetchOrganizationMembers(signal), []),
    "organization-members",
  );
}
