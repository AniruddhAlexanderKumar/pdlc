"use client";

import * as React from "react";
import type {
  CreateIssueRequest,
  IssueLinkRequest,
  IssueRelation,
  IssueSeverity,
  IssueStatus,
  UpdateIssueRequest,
} from "@/domain";
import { requestJson } from "./client";
import type { AuditEventDto, OwnerSummary } from "./requirements";
import { useResource } from "./use-resource";

/**
 * Issue API access and its loading hooks.
 *
 * Follows the same conventions as the requirements client: the browser talks
 * HTTP only, never sees an organization id, and every call is scoped by the
 * project in the URL. `severity` is recorded exactly as a person set it —
 * nothing here ranks issues against each other.
 */

export type { OwnerSummary, AuditEventDto };

/** An issue over the wire — dates are ISO strings. */
export interface IssueDto {
  id: string;
  projectId: string;
  identifier: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  status: IssueStatus;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IssueListItemDto extends IssueDto {
  owner: OwnerSummary | null;
}

export interface IssueLinkDto {
  id: string;
  relation: IssueRelation;
  targetId: string;
  identifier: string;
  title: string;
  note: string | null;
  createdAt: string;
}

export interface IssueDetailDto extends IssueDto {
  owner: OwnerSummary | null;
  links: IssueLinkDto[];
  availableTransitions: IssueStatus[];
  editable: { content: boolean; owner: boolean; links: boolean };
  history: AuditEventDto[];
}

export interface LinkTargetOptionDto {
  id: string;
  identifier: string;
  title: string;
}

export type IssueLinkTargetsDto = Record<IssueRelation, LinkTargetOptionDto[]>;

function base(projectId: string): string {
  return `/api/projects/${projectId}/issues`;
}

export async function fetchIssues(
  projectId: string,
  options: { status?: IssueStatus | ""; severity?: IssueSeverity | "" } = {},
  signal?: AbortSignal,
): Promise<IssueListItemDto[]> {
  const params = new URLSearchParams();
  if (options.status) params.set("status", options.status);
  if (options.severity) params.set("severity", options.severity);
  const query = params.toString() ? `?${params.toString()}` : "";
  return requestJson<IssueListItemDto[]>(`${base(projectId)}${query}`, "issues", { signal });
}

export async function fetchIssue(
  projectId: string,
  issueId: string,
  signal?: AbortSignal,
): Promise<IssueDetailDto> {
  return requestJson<IssueDetailDto>(`${base(projectId)}/${issueId}`, "issue", { signal });
}

export async function createIssue(projectId: string, input: CreateIssueRequest): Promise<IssueDto> {
  return requestJson<IssueDto>(base(projectId), "issue", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateIssue(
  projectId: string,
  issueId: string,
  input: UpdateIssueRequest,
): Promise<IssueDto> {
  return requestJson<IssueDto>(`${base(projectId)}/${issueId}`, "issue", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function transitionIssue(
  projectId: string,
  issueId: string,
  to: IssueStatus,
  rationale?: string | null,
): Promise<IssueDto> {
  return requestJson<IssueDto>(`${base(projectId)}/${issueId}/transition`, "issue", {
    method: "POST",
    body: JSON.stringify({ to, rationale: rationale ?? null }),
  });
}

export async function assignIssueOwner(
  projectId: string,
  issueId: string,
  ownerId: string | null,
): Promise<IssueDto> {
  return requestJson<IssueDto>(`${base(projectId)}/${issueId}/owner`, "issue", {
    method: "POST",
    body: JSON.stringify({ ownerId }),
  });
}

function linksBase(projectId: string, issueId: string): string {
  return `${base(projectId)}/${issueId}/links`;
}

export async function fetchIssueLinks(
  projectId: string,
  issueId: string,
  signal?: AbortSignal,
): Promise<IssueLinkDto[]> {
  return requestJson<IssueLinkDto[]>(linksBase(projectId, issueId), "links", { signal });
}

export async function addIssueLink(
  projectId: string,
  issueId: string,
  input: IssueLinkRequest,
): Promise<IssueLinkDto> {
  return requestJson<IssueLinkDto>(linksBase(projectId, issueId), "link", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function removeIssueLink(
  projectId: string,
  issueId: string,
  linkId: string,
): Promise<void> {
  await requestJson<boolean>(`${linksBase(projectId, issueId)}/${encodeURIComponent(linkId)}`, "removed", {
    method: "DELETE",
  });
}

export async function fetchIssueLinkTargets(
  projectId: string,
  signal?: AbortSignal,
): Promise<IssueLinkTargetsDto> {
  return requestJson<IssueLinkTargetsDto>(`/api/projects/${projectId}/issue-link-targets`, "targets", {
    signal,
  });
}

// --- Hooks --------------------------------------------------------------------

export function useIssues(projectId: string, status: IssueStatus | "", severity: IssueSeverity | "") {
  return useResource<IssueListItemDto[]>(
    React.useCallback(
      (signal) => fetchIssues(projectId, { status, severity }, signal),
      [projectId, status, severity],
    ),
    `issues:${projectId}:${status}:${severity}`,
  );
}

export function useIssue(projectId: string, issueId: string) {
  return useResource<IssueDetailDto>(
    React.useCallback((signal) => fetchIssue(projectId, issueId, signal), [projectId, issueId]),
    `issue:${projectId}:${issueId}`,
  );
}

export function useIssueLinkTargets(projectId: string) {
  return useResource<IssueLinkTargetsDto>(
    React.useCallback((signal) => fetchIssueLinkTargets(projectId, signal), [projectId]),
    `issue-link-targets:${projectId}`,
  );
}
