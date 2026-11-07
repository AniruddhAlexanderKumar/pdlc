"use client";

import * as React from "react";
import type {
  CreateEvidenceRequest,
  EvidenceRelation,
  EvidenceStatus,
  EvidenceType,
  SupersedeEvidenceRequest,
  UpdateEvidenceRequest,
} from "@/domain";
import { requestJson } from "./client";
import type { AuditEventDto, OwnerSummary } from "./requirements";
import { useResource } from "./use-resource";

/**
 * Evidence API access and its loading hooks.
 *
 * Follows the same conventions as the risk/issue clients: the browser talks
 * HTTP only, never sees an organization id, and every call is scoped by the
 * project in the URL. There is no file upload anywhere in this module,
 * because the API never accepts one — evidence here is a record and a
 * reference, never a stored file.
 */

export type { AuditEventDto, OwnerSummary };

/** Evidence over the wire — dates are ISO strings. */
export interface EvidenceDto {
  id: string;
  projectId: string;
  identifier: string;
  title: string;
  description: string | null;
  evidenceType: EvidenceType;
  sourceReference: string;
  status: EvidenceStatus;
  recordedById: string | null;
  validatedById: string | null;
  validatedAt: string | null;
  supersededById: string | null;
  supersededAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceListItemDto extends EvidenceDto {
  recordedBy: OwnerSummary | null;
}

export interface EvidenceLinkDto {
  id: string;
  relation: EvidenceRelation;
  targetId: string;
  identifier: string;
  title: string;
  note: string | null;
  createdAt: string;
}

export interface EvidenceCitingFindingDto {
  id: string;
  identifier: string;
  title: string;
  complianceItemId: string;
}

export interface EvidenceDetailDto extends EvidenceDto {
  recordedBy: OwnerSummary | null;
  validatedBy: OwnerSummary | null;
  supersededByRef: { id: string; identifier: string; title: string } | null;
  links: EvidenceLinkDto[];
  citingFindings: EvidenceCitingFindingDto[];
  availableTransitions: EvidenceStatus[];
  editable: { content: boolean; links: boolean };
  history: AuditEventDto[];
}

export interface LinkTargetOptionDto {
  id: string;
  identifier: string;
  title: string;
}

export type EvidenceLinkTargetsDto = Record<EvidenceRelation, LinkTargetOptionDto[]>;

function base(projectId: string): string {
  return `/api/projects/${projectId}/evidence`;
}

export async function fetchEvidenceList(
  projectId: string,
  options: { status?: EvidenceStatus | ""; evidenceType?: EvidenceType | "" } = {},
  signal?: AbortSignal,
): Promise<EvidenceListItemDto[]> {
  const params = new URLSearchParams();
  if (options.status) params.set("status", options.status);
  if (options.evidenceType) params.set("evidenceType", options.evidenceType);
  const query = params.toString();
  return requestJson<EvidenceListItemDto[]>(`${base(projectId)}${query ? `?${query}` : ""}`, "evidence", {
    signal,
  });
}

export async function fetchEvidence(
  projectId: string,
  evidenceId: string,
  signal?: AbortSignal,
): Promise<EvidenceDetailDto> {
  return requestJson<EvidenceDetailDto>(`${base(projectId)}/${evidenceId}`, "evidence", { signal });
}

export async function createEvidence(
  projectId: string,
  input: CreateEvidenceRequest,
): Promise<EvidenceDto> {
  return requestJson<EvidenceDto>(base(projectId), "evidence", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateEvidence(
  projectId: string,
  evidenceId: string,
  input: UpdateEvidenceRequest,
): Promise<EvidenceDto> {
  return requestJson<EvidenceDto>(`${base(projectId)}/${evidenceId}`, "evidence", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function validateEvidence(
  projectId: string,
  evidenceId: string,
  rationale?: string | null,
): Promise<EvidenceDto> {
  return requestJson<EvidenceDto>(`${base(projectId)}/${evidenceId}/validate`, "evidence", {
    method: "POST",
    body: JSON.stringify({ rationale: rationale ?? null }),
  });
}

export async function supersedeEvidence(
  projectId: string,
  evidenceId: string,
  input: SupersedeEvidenceRequest,
): Promise<EvidenceDto> {
  return requestJson<EvidenceDto>(`${base(projectId)}/${evidenceId}/supersede`, "evidence", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

function linksBase(projectId: string, evidenceId: string): string {
  return `${base(projectId)}/${evidenceId}/links`;
}

export async function fetchEvidenceLinks(
  projectId: string,
  evidenceId: string,
  signal?: AbortSignal,
): Promise<EvidenceLinkDto[]> {
  return requestJson<EvidenceLinkDto[]>(linksBase(projectId, evidenceId), "links", { signal });
}

export async function addEvidenceLink(
  projectId: string,
  evidenceId: string,
  input: { relation: EvidenceRelation; targetId: string; note?: string | null },
): Promise<EvidenceLinkDto> {
  return requestJson<EvidenceLinkDto>(linksBase(projectId, evidenceId), "link", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function removeEvidenceLink(
  projectId: string,
  evidenceId: string,
  linkId: string,
): Promise<void> {
  await requestJson<boolean>(
    `${linksBase(projectId, evidenceId)}/${encodeURIComponent(linkId)}`,
    "removed",
    { method: "DELETE" },
  );
}

export async function fetchEvidenceLinkTargets(
  projectId: string,
  signal?: AbortSignal,
): Promise<EvidenceLinkTargetsDto> {
  return requestJson<EvidenceLinkTargetsDto>(`/api/projects/${projectId}/evidence-link-targets`, "targets", {
    signal,
  });
}

// --- Hooks --------------------------------------------------------------------

export function useEvidenceList(
  projectId: string,
  status: EvidenceStatus | "",
  evidenceType: EvidenceType | "" = "",
) {
  return useResource<EvidenceListItemDto[]>(
    React.useCallback(
      (signal) => fetchEvidenceList(projectId, { status, evidenceType }, signal),
      [projectId, status, evidenceType],
    ),
    `evidence-list:${projectId}:${status}:${evidenceType}`,
  );
}

export function useEvidence(projectId: string, evidenceId: string) {
  return useResource<EvidenceDetailDto>(
    React.useCallback((signal) => fetchEvidence(projectId, evidenceId, signal), [projectId, evidenceId]),
    `evidence:${projectId}:${evidenceId}`,
  );
}

export function useEvidenceLinkTargets(projectId: string) {
  return useResource<EvidenceLinkTargetsDto>(
    React.useCallback((signal) => fetchEvidenceLinkTargets(projectId, signal), [projectId]),
    `evidence-link-targets:${projectId}`,
  );
}
