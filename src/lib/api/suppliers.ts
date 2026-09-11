"use client";

import * as React from "react";
import type {
  CreateSuppliedItemRequest,
  CreateSupplierQualificationRequest,
  CreateSupplierRequest,
  QualificationEvidenceLinkRequest,
  SuppliedItemLinkRequest,
  SuppliedItemRelation,
  SuppliedItemStatus,
  SuppliedItemType,
  SuppliedItemUnlinkRequest,
  SupplierQualificationStatus,
  SupplierQualificationType,
  SupplierStatus,
  UpdateSuppliedItemRequest,
  UpdateSupplierQualificationRequest,
  UpdateSupplierRequest,
} from "@/domain";
import { requestJson } from "./client";
import type { AuditEventDto } from "./requirements";
import { useResource } from "./use-resource";

/**
 * Supplier engineering API access.
 *
 * Same conventions as the other clients: HTTP only, never imports server code,
 * no organization id ever leaves or enters the browser, and every call is scoped
 * by the project in the URL.
 *
 * Note there is no supplier-impact call here. A supplier-side change is declared
 * on an ordinary change request and analysed by the existing change-impact
 * endpoints — there is no second engine to call.
 */

// --- Suppliers --------------------------------------------------------------

export interface SupplierDto {
  id: string;
  projectId: string;
  identifier: string;
  name: string;
  description: string | null;
  status: SupplierStatus;
  createdAt: string;
  updatedAt: string;
}

/** Counts are real aggregates from the list query, never estimated client-side. */
export interface SupplierListDto extends SupplierDto {
  suppliedItemCount: number;
  qualificationCount: number;
}

export interface SupplierDetailDto extends SupplierDto {
  suppliedItems: SuppliedItemListDto[];
  qualifications: QualificationListDto[];
  history: AuditEventDto[];
}

function suppliersBase(projectId: string): string {
  return `/api/projects/${projectId}/suppliers`;
}

export async function fetchSuppliers(
  projectId: string,
  status?: SupplierStatus | "",
  signal?: AbortSignal,
): Promise<SupplierListDto[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  return requestJson<SupplierListDto[]>(`${suppliersBase(projectId)}${query}`, "suppliers", {
    signal,
  });
}

export async function fetchSupplier(
  projectId: string,
  supplierId: string,
  signal?: AbortSignal,
): Promise<SupplierDetailDto> {
  return requestJson<SupplierDetailDto>(
    `${suppliersBase(projectId)}/${supplierId}`,
    "supplier",
    { signal },
  );
}

export async function createSupplier(
  projectId: string,
  input: CreateSupplierRequest,
): Promise<SupplierDto> {
  return requestJson<SupplierDto>(suppliersBase(projectId), "supplier", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateSupplier(
  projectId: string,
  supplierId: string,
  input: UpdateSupplierRequest,
): Promise<SupplierDto> {
  return requestJson<SupplierDto>(`${suppliersBase(projectId)}/${supplierId}`, "supplier", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function useSuppliers(projectId: string, status: SupplierStatus | "" = "") {
  return useResource<SupplierListDto[]>(
    React.useCallback(
      (signal) => fetchSuppliers(projectId, status, signal),
      [projectId, status],
    ),
    `suppliers:${projectId}:${status}`,
  );
}

export function useSupplier(projectId: string, supplierId: string) {
  return useResource<SupplierDetailDto>(
    React.useCallback(
      (signal) => fetchSupplier(projectId, supplierId, signal),
      [projectId, supplierId],
    ),
    `supplier:${projectId}:${supplierId}`,
  );
}

// --- Supplied items ---------------------------------------------------------

export interface SuppliedItemDto {
  id: string;
  projectId: string;
  supplierId: string;
  identifier: string;
  name: string;
  description: string | null;
  itemType: SuppliedItemType;
  status: SuppliedItemStatus;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierSummaryDto {
  id: string;
  identifier: string;
  name: string;
  status: string;
}

export interface SuppliedItemListDto extends SuppliedItemDto {
  supplier: SupplierSummaryDto;
}

export interface SuppliedItemLinkDto {
  relation: SuppliedItemRelation;
  targetId: string;
  identifier: string | null;
  title: string;
  note: string | null;
  createdAt: string;
}

export interface SuppliedItemDetailDto extends SuppliedItemDto {
  supplier: SupplierSummaryDto;
  links: SuppliedItemLinkDto[];
  qualifications: QualificationListDto[];
  history: AuditEventDto[];
}

function itemsBase(projectId: string): string {
  return `/api/projects/${projectId}/supplied-items`;
}

export async function fetchSuppliedItems(
  projectId: string,
  filter: { supplierId?: string; itemType?: string; status?: string } = {},
  signal?: AbortSignal,
): Promise<SuppliedItemListDto[]> {
  const params = new URLSearchParams();
  if (filter.supplierId) params.set("supplierId", filter.supplierId);
  if (filter.itemType) params.set("itemType", filter.itemType);
  if (filter.status) params.set("status", filter.status);
  const query = params.size > 0 ? `?${params.toString()}` : "";

  return requestJson<SuppliedItemListDto[]>(`${itemsBase(projectId)}${query}`, "suppliedItems", {
    signal,
  });
}

export async function fetchSuppliedItem(
  projectId: string,
  suppliedItemId: string,
  signal?: AbortSignal,
): Promise<SuppliedItemDetailDto> {
  return requestJson<SuppliedItemDetailDto>(
    `${itemsBase(projectId)}/${suppliedItemId}`,
    "suppliedItem",
    { signal },
  );
}

export async function createSuppliedItem(
  projectId: string,
  input: CreateSuppliedItemRequest,
): Promise<SuppliedItemDto> {
  return requestJson<SuppliedItemDto>(itemsBase(projectId), "suppliedItem", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateSuppliedItem(
  projectId: string,
  suppliedItemId: string,
  input: UpdateSuppliedItemRequest,
): Promise<SuppliedItemDto> {
  return requestJson<SuppliedItemDto>(
    `${itemsBase(projectId)}/${suppliedItemId}`,
    "suppliedItem",
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export async function linkSuppliedItem(
  projectId: string,
  suppliedItemId: string,
  input: SuppliedItemLinkRequest,
): Promise<SuppliedItemLinkDto[]> {
  return requestJson<SuppliedItemLinkDto[]>(
    `${itemsBase(projectId)}/${suppliedItemId}/links`,
    "links",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export async function unlinkSuppliedItem(
  projectId: string,
  suppliedItemId: string,
  input: SuppliedItemUnlinkRequest,
): Promise<SuppliedItemLinkDto[]> {
  return requestJson<SuppliedItemLinkDto[]>(
    `${itemsBase(projectId)}/${suppliedItemId}/links`,
    "links",
    { method: "DELETE", body: JSON.stringify(input) },
  );
}

export function useSuppliedItems(
  projectId: string,
  filter: { supplierId?: string; itemType?: string; status?: string } = {},
) {
  const key = `${filter.supplierId ?? ""}:${filter.itemType ?? ""}:${filter.status ?? ""}`;
  return useResource<SuppliedItemListDto[]>(
    // The filter object is rebuilt on every render, so the key string — not the
    // object — is what the callback depends on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useCallback((signal) => fetchSuppliedItems(projectId, filter, signal), [projectId, key]),
    `suppliedItems:${projectId}:${key}`,
  );
}

export function useSuppliedItem(projectId: string, suppliedItemId: string) {
  return useResource<SuppliedItemDetailDto>(
    React.useCallback(
      (signal) => fetchSuppliedItem(projectId, suppliedItemId, signal),
      [projectId, suppliedItemId],
    ),
    `suppliedItem:${projectId}:${suppliedItemId}`,
  );
}

export interface LinkTargetOptionDto {
  id: string;
  identifier: string;
  title: string;
}

export type SuppliedItemLinkTargetsDto = Record<SuppliedItemRelation, LinkTargetOptionDto[]>;

export async function fetchSuppliedItemLinkTargets(
  projectId: string,
  signal?: AbortSignal,
): Promise<SuppliedItemLinkTargetsDto> {
  return requestJson<SuppliedItemLinkTargetsDto>(
    `/api/projects/${projectId}/supplied-item-link-targets`,
    "targets",
    { signal },
  );
}

export function useSuppliedItemLinkTargets(projectId: string) {
  return useResource<SuppliedItemLinkTargetsDto>(
    React.useCallback(
      (signal) => fetchSuppliedItemLinkTargets(projectId, signal),
      [projectId],
    ),
    `suppliedItemLinkTargets:${projectId}`,
  );
}

// --- Qualifications ---------------------------------------------------------

export interface QualificationDto {
  id: string;
  projectId: string;
  supplierId: string;
  suppliedItemId: string | null;
  title: string;
  qualificationType: SupplierQualificationType;
  status: SupplierQualificationStatus;
  evidenceReference: string | null;
  effectiveDate: string | null;
  expiryDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QualificationListDto extends QualificationDto {
  supplier: { id: string; identifier: string; name: string };
  suppliedItem: { id: string; identifier: string; name: string } | null;
}

export interface QualificationEvidenceDto {
  evidenceId: string;
  title: string;
  evidenceType: string;
  sourceReference: string;
  note: string | null;
  createdAt: string;
}

export interface QualificationDetailDto extends QualificationListDto {
  evidence: QualificationEvidenceDto[];
  history: AuditEventDto[];
}

function qualificationsBase(projectId: string): string {
  return `/api/projects/${projectId}/supplier-qualifications`;
}

export async function fetchQualifications(
  projectId: string,
  filter: { supplierId?: string; suppliedItemId?: string; status?: string } = {},
  signal?: AbortSignal,
): Promise<QualificationListDto[]> {
  const params = new URLSearchParams();
  if (filter.supplierId) params.set("supplierId", filter.supplierId);
  if (filter.suppliedItemId) params.set("suppliedItemId", filter.suppliedItemId);
  if (filter.status) params.set("status", filter.status);
  const query = params.size > 0 ? `?${params.toString()}` : "";

  return requestJson<QualificationListDto[]>(
    `${qualificationsBase(projectId)}${query}`,
    "qualifications",
    { signal },
  );
}

export async function fetchQualification(
  projectId: string,
  qualificationId: string,
  signal?: AbortSignal,
): Promise<QualificationDetailDto> {
  return requestJson<QualificationDetailDto>(
    `${qualificationsBase(projectId)}/${qualificationId}`,
    "qualification",
    { signal },
  );
}

export async function createQualification(
  projectId: string,
  input: CreateSupplierQualificationRequest,
): Promise<QualificationDto> {
  return requestJson<QualificationDto>(qualificationsBase(projectId), "qualification", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateQualification(
  projectId: string,
  qualificationId: string,
  input: UpdateSupplierQualificationRequest,
): Promise<QualificationDto> {
  return requestJson<QualificationDto>(
    `${qualificationsBase(projectId)}/${qualificationId}`,
    "qualification",
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export async function linkQualificationEvidence(
  projectId: string,
  qualificationId: string,
  input: QualificationEvidenceLinkRequest,
): Promise<QualificationEvidenceDto[]> {
  return requestJson<QualificationEvidenceDto[]>(
    `${qualificationsBase(projectId)}/${qualificationId}/evidence`,
    "evidence",
    { method: "POST", body: JSON.stringify(input) },
  );
}

export function useQualifications(
  projectId: string,
  filter: { supplierId?: string; suppliedItemId?: string; status?: string } = {},
) {
  const key = `${filter.supplierId ?? ""}:${filter.suppliedItemId ?? ""}:${filter.status ?? ""}`;
  return useResource<QualificationListDto[]>(
    // eslint-disable-next-line react-hooks/exhaustive-deps
    React.useCallback((signal) => fetchQualifications(projectId, filter, signal), [projectId, key]),
    `qualifications:${projectId}:${key}`,
  );
}

export function useQualification(projectId: string, qualificationId: string) {
  return useResource<QualificationDetailDto>(
    React.useCallback(
      (signal) => fetchQualification(projectId, qualificationId, signal),
      [projectId, qualificationId],
    ),
    `qualification:${projectId}:${qualificationId}`,
  );
}
