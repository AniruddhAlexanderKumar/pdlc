"use client";

import * as React from "react";
import type {
  CertificationBasisStatus,
  CertificationFindingSeverity,
  CertificationFindingStatus,
  CertificationProgramStatus,
  CertificationReviewCategory,
  CertificationReviewFindingStatus,
  CertificationReviewStatus,
  ComplianceApplicability,
  ComplianceDisposition,
  ComplianceItemStatus,
  ComplianceLinkType,
  ComplianceMethod,
  CreateCertificationBasisRequest,
  CreateCertificationFindingRequest,
  CreateCertificationProgramRequest,
  CreateComplianceItemRequest,
  CreateComplianceLinkRequest,
  UpdateCertificationBasisRequest,
  UpdateCertificationFindingRequest,
  UpdateCertificationProgramRequest,
  UpdateComplianceItemRequest,
} from "@/domain";
import { requestJson } from "./client";
import { useResource } from "./use-resource";

/**
 * Certification workspace API access.
 *
 * Same conventions as the other clients: HTTP only, never imports server
 * code, and every call is scoped by the project in the URL. Nothing here
 * evaluates a certification review implicitly — there is one explicit
 * `evaluateCertificationReview`, and every hook only ever reads.
 *
 * Never render a status from here as a regulatory claim. READY means "ready
 * for internal review" and nothing else.
 */

// --- Program ------------------------------------------------------------

export interface CertificationProgramDto {
  id: string;
  projectId: string;
  identifier: string;
  name: string;
  description: string | null;
  status: CertificationProgramStatus;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
}

function programBase(projectId: string): string {
  return `/api/projects/${projectId}/certification/program`;
}

export async function fetchProgram(
  projectId: string,
  signal?: AbortSignal,
): Promise<CertificationProgramDto | null> {
  return requestJson<CertificationProgramDto | null>(programBase(projectId), "program", { signal });
}

export async function createProgram(
  projectId: string,
  input: CreateCertificationProgramRequest,
): Promise<CertificationProgramDto> {
  return requestJson<CertificationProgramDto>(programBase(projectId), "program", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateProgram(
  projectId: string,
  input: UpdateCertificationProgramRequest,
): Promise<CertificationProgramDto> {
  return requestJson<CertificationProgramDto>(programBase(projectId), "program", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function useProgram(projectId: string) {
  return useResource<CertificationProgramDto | null>(
    React.useCallback((signal) => fetchProgram(projectId, signal), [projectId]),
    `certProgram:${projectId}`,
  );
}

// --- Basis ----------------------------------------------------------------

export interface CertificationBasisDto {
  id: string;
  certificationProgramId: string;
  identifier: string;
  title: string;
  description: string | null;
  revision: string;
  sourceReference: string | null;
  status: CertificationBasisStatus;
  supersededById: string | null;
  createdAt: string;
  updatedAt: string;
}

function basesBase(projectId: string): string {
  return `/api/projects/${projectId}/certification/bases`;
}

export async function fetchBases(
  projectId: string,
  signal?: AbortSignal,
): Promise<CertificationBasisDto[]> {
  return requestJson<CertificationBasisDto[]>(basesBase(projectId), "bases", { signal });
}

export async function fetchBasis(
  projectId: string,
  basisId: string,
  signal?: AbortSignal,
): Promise<CertificationBasisDto> {
  return requestJson<CertificationBasisDto>(`${basesBase(projectId)}/${basisId}`, "basis", { signal });
}

export async function createBasis(
  projectId: string,
  input: CreateCertificationBasisRequest,
): Promise<CertificationBasisDto> {
  return requestJson<CertificationBasisDto>(basesBase(projectId), "basis", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateBasis(
  projectId: string,
  basisId: string,
  input: UpdateCertificationBasisRequest,
): Promise<CertificationBasisDto> {
  return requestJson<CertificationBasisDto>(`${basesBase(projectId)}/${basisId}`, "basis", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function activateBasis(
  projectId: string,
  basisId: string,
  supersedeActive = false,
): Promise<CertificationBasisDto> {
  return requestJson<CertificationBasisDto>(`${basesBase(projectId)}/${basisId}/activate`, "basis", {
    method: "POST",
    body: JSON.stringify(supersedeActive ? { supersedeActive } : {}),
  });
}

export async function supersedeBasis(
  projectId: string,
  basisId: string,
  newBasisId: string,
): Promise<CertificationBasisDto> {
  return requestJson<CertificationBasisDto>(`${basesBase(projectId)}/${basisId}/supersede`, "basis", {
    method: "POST",
    body: JSON.stringify({ newBasisId }),
  });
}

export function useBases(projectId: string) {
  return useResource<CertificationBasisDto[]>(
    React.useCallback((signal) => fetchBases(projectId, signal), [projectId]),
    `certBases:${projectId}`,
  );
}

// --- Compliance items -------------------------------------------------------

export interface ComplianceItemDto {
  id: string;
  certificationBasisId: string;
  identifier: string;
  title: string;
  description: string | null;
  applicability: ComplianceApplicability;
  applicabilityRationale: string | null;
  applicabilityReviewerId: string | null;
  applicabilityReviewedAt: string | null;
  method: ComplianceMethod | null;
  status: ComplianceItemStatus;
  disposition: ComplianceDisposition;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceItemListDto extends ComplianceItemDto {
  _count: { findings: number };
}

function itemsBase(projectId: string): string {
  return `/api/projects/${projectId}/certification/items`;
}

export async function fetchItems(
  projectId: string,
  basisId?: string,
  signal?: AbortSignal,
): Promise<ComplianceItemListDto[]> {
  const query = basisId ? `?basisId=${encodeURIComponent(basisId)}` : "";
  return requestJson<ComplianceItemListDto[]>(`${itemsBase(projectId)}${query}`, "items", { signal });
}

export async function fetchItem(
  projectId: string,
  itemId: string,
  signal?: AbortSignal,
): Promise<ComplianceItemDto> {
  return requestJson<ComplianceItemDto>(`${itemsBase(projectId)}/${itemId}`, "item", { signal });
}

export async function createItem(
  projectId: string,
  input: CreateComplianceItemRequest,
  basisId?: string,
): Promise<ComplianceItemDto> {
  const query = basisId ? `?basisId=${encodeURIComponent(basisId)}` : "";
  return requestJson<ComplianceItemDto>(`${itemsBase(projectId)}${query}`, "item", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateItem(
  projectId: string,
  itemId: string,
  input: UpdateComplianceItemRequest,
): Promise<ComplianceItemDto> {
  return requestJson<ComplianceItemDto>(`${itemsBase(projectId)}/${itemId}`, "item", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function useItems(projectId: string, basisId: string) {
  return useResource<ComplianceItemListDto[]>(
    React.useCallback((signal) => fetchItems(projectId, basisId || undefined, signal), [projectId, basisId]),
    `certItems:${projectId}:${basisId}`,
  );
}

export function useItem(projectId: string, itemId: string) {
  return useResource<ComplianceItemDto>(
    React.useCallback((signal) => fetchItem(projectId, itemId, signal), [projectId, itemId]),
    `certItem:${projectId}:${itemId}`,
  );
}

// --- Compliance links --------------------------------------------------------

export interface ComplianceLinkDto {
  id: string;
  complianceItemId: string;
  linkType: ComplianceLinkType;
  targetId: string;
  targetIdentifier: string | null;
  targetLabel: string;
  note: string | null;
  createdAt: string;
  createdById: string | null;
}

export interface LinkTargetOptionDto {
  id: string;
  identifier: string;
  title: string;
}

export type ComplianceLinkTargetsDto = Record<ComplianceLinkType, LinkTargetOptionDto[]>;

function linksBase(projectId: string, itemId: string): string {
  return `${itemsBase(projectId)}/${itemId}/links`;
}

export async function fetchLinks(
  projectId: string,
  itemId: string,
  signal?: AbortSignal,
): Promise<ComplianceLinkDto[]> {
  return requestJson<ComplianceLinkDto[]>(linksBase(projectId, itemId), "links", { signal });
}

export async function addLink(
  projectId: string,
  itemId: string,
  input: CreateComplianceLinkRequest,
): Promise<ComplianceLinkDto> {
  return requestJson<ComplianceLinkDto>(linksBase(projectId, itemId), "link", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function removeLink(
  projectId: string,
  itemId: string,
  linkId: string,
): Promise<{ removed: boolean }> {
  return requestJson<boolean>(
    `${linksBase(projectId, itemId)}/${encodeURIComponent(linkId)}`,
    "removed",
    { method: "DELETE" },
  ).then((removed) => ({ removed }));
}

export async function fetchLinkTargets(
  projectId: string,
  signal?: AbortSignal,
): Promise<ComplianceLinkTargetsDto> {
  return requestJson<ComplianceLinkTargetsDto>(
    `/api/projects/${projectId}/certification/link-targets`,
    "targets",
    { signal },
  );
}

export function useLinks(projectId: string, itemId: string) {
  return useResource<ComplianceLinkDto[]>(
    React.useCallback((signal) => fetchLinks(projectId, itemId, signal), [projectId, itemId]),
    `certLinks:${projectId}:${itemId}`,
  );
}

export function useLinkTargets(projectId: string) {
  return useResource<ComplianceLinkTargetsDto>(
    React.useCallback((signal) => fetchLinkTargets(projectId, signal), [projectId]),
    `certLinkTargets:${projectId}`,
  );
}

// --- Findings ---------------------------------------------------------------

export interface CertificationFindingDto {
  id: string;
  complianceItemId: string;
  identifier: string;
  title: string;
  description: string | null;
  severity: CertificationFindingSeverity;
  status: CertificationFindingStatus;
  resolutionNote: string | null;
  evidenceId: string | null;
  resolvedAt: string | null;
  resolvedById: string | null;
  createdAt: string;
  updatedAt: string;
}

function findingsBase(projectId: string, itemId: string): string {
  return `${itemsBase(projectId)}/${itemId}/findings`;
}

export async function fetchFindings(
  projectId: string,
  itemId: string,
  signal?: AbortSignal,
): Promise<CertificationFindingDto[]> {
  return requestJson<CertificationFindingDto[]>(findingsBase(projectId, itemId), "findings", { signal });
}

export async function createFinding(
  projectId: string,
  itemId: string,
  input: CreateCertificationFindingRequest,
): Promise<CertificationFindingDto> {
  return requestJson<CertificationFindingDto>(findingsBase(projectId, itemId), "finding", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateFinding(
  projectId: string,
  itemId: string,
  findingId: string,
  input: UpdateCertificationFindingRequest,
): Promise<CertificationFindingDto> {
  return requestJson<CertificationFindingDto>(
    `${findingsBase(projectId, itemId)}/${findingId}`,
    "finding",
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export async function resolveFinding(
  projectId: string,
  itemId: string,
  findingId: string,
  note: string,
  evidenceId?: string,
): Promise<CertificationFindingDto> {
  return requestJson<CertificationFindingDto>(
    `${findingsBase(projectId, itemId)}/${findingId}/resolve`,
    "finding",
    { method: "POST", body: JSON.stringify(evidenceId ? { note, evidenceId } : { note }) },
  );
}

export async function acceptFinding(
  projectId: string,
  itemId: string,
  findingId: string,
  note: string,
  evidenceId?: string,
): Promise<CertificationFindingDto> {
  return requestJson<CertificationFindingDto>(
    `${findingsBase(projectId, itemId)}/${findingId}/accept`,
    "finding",
    { method: "POST", body: JSON.stringify(evidenceId ? { note, evidenceId } : { note }) },
  );
}

export function useFindings(projectId: string, itemId: string) {
  return useResource<CertificationFindingDto[]>(
    React.useCallback((signal) => fetchFindings(projectId, itemId, signal), [projectId, itemId]),
    `certFindings:${projectId}:${itemId}`,
  );
}

// --- Review -----------------------------------------------------------------

export interface CertificationReviewSummaryDto {
  findingCount: number;
  blockingCount: number;
  warningCount: number;
  informationalCount: number;
  unknownCount: number;
}

export interface CertificationReviewDto {
  id: string;
  certificationProgramId: string;
  status: CertificationReviewStatus;
  reviewVersion: string;
  fingerprint: string;
  summary: string | null;
  evaluatedAt: string;
  evaluatedById: string | null;
  createdAt: string;
  counts: CertificationReviewSummaryDto;
}

export interface CertificationReviewFindingDto {
  id: string;
  reviewId: string;
  ruleId: string;
  category: CertificationReviewCategory;
  status: CertificationReviewFindingStatus;
  subjectType: string;
  subjectId: string;
  subjectIdentifier: string | null;
  subjectLabel: string;
  message: string;
  basis: string[];
  sequence: number;
  createdAt: string;
}

export interface CertificationReviewReportDto {
  review: CertificationReviewDto;
  freshness: "CURRENT" | "STALE" | "UNKNOWN";
  findings: CertificationReviewFindingDto[];
  basis: unknown;
}

export interface NoCertificationReviewDto {
  status: "NOT_EVALUATED";
  certificationProgramId: string;
  reviewVersion: string;
}

export type LatestCertificationReviewDto = CertificationReviewReportDto | NoCertificationReviewDto;

export function hasCertificationReviewDto(
  value: LatestCertificationReviewDto,
): value is CertificationReviewReportDto {
  return "review" in value;
}

function reviewsBase(projectId: string): string {
  return `/api/projects/${projectId}/certification/reviews`;
}

/** The only call that writes. Explicit, never issued on a page load. */
export async function evaluateCertificationReview(
  projectId: string,
): Promise<CertificationReviewReportDto> {
  return requestJson<CertificationReviewReportDto>(reviewsBase(projectId), "report", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function fetchLatestReview(
  projectId: string,
  signal?: AbortSignal,
): Promise<LatestCertificationReviewDto> {
  return requestJson<LatestCertificationReviewDto>(`${reviewsBase(projectId)}/latest`, "report", {
    signal,
  });
}

export async function fetchReviewHistory(
  projectId: string,
  signal?: AbortSignal,
): Promise<CertificationReviewDto[]> {
  return requestJson<CertificationReviewDto[]>(reviewsBase(projectId), "reviews", { signal });
}

export async function fetchReview(
  projectId: string,
  reviewId: string,
  signal?: AbortSignal,
): Promise<CertificationReviewReportDto> {
  return requestJson<CertificationReviewReportDto>(`${reviewsBase(projectId)}/${reviewId}`, "report", {
    signal,
  });
}

export function useLatestReview(projectId: string) {
  return useResource<LatestCertificationReviewDto>(
    React.useCallback((signal) => fetchLatestReview(projectId, signal), [projectId]),
    `certLatestReview:${projectId}`,
  );
}

export function useReviewHistory(projectId: string) {
  return useResource<CertificationReviewDto[]>(
    React.useCallback((signal) => fetchReviewHistory(projectId, signal), [projectId]),
    `certReviewHistory:${projectId}`,
  );
}
