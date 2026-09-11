"use client";

import * as React from "react";
import type {
  CreateDesignItemRequest,
  CreateStakeholderNeedRequest,
  CreateVerificationActivityRequest,
  DesignItemStatus,
  DesignItemType,
  StakeholderNeedStatus,
  UpdateDesignItemRequest,
  UpdateStakeholderNeedRequest,
  UpdateVerificationActivityRequest,
  VerificationMethod,
  VerificationReadinessScope,
  VerificationReadinessStatus,
  VerificationStatus,
} from "@/domain";
import { requestJson } from "./client";
import type { AuditEventDto, OwnerSummary } from "./requirements";
import { useResource } from "./use-resource";

/**
 * API access for the three foundational artifact modules: stakeholder needs,
 * design items and verification activities.
 *
 * Same conventions as the other clients — HTTP only, no organization id ever
 * leaves or enters the browser, every call scoped by the project in the URL.
 */

export interface LinkedRequirementDto {
  id: string;
  identifier: string;
  title: string;
  status: string;
}

// --- Stakeholder needs ------------------------------------------------------

export interface StakeholderNeedDto {
  id: string;
  projectId: string;
  identifier: string;
  title: string;
  description: string;
  stakeholder: string;
  status: StakeholderNeedStatus;
  createdAt: string;
  updatedAt: string;
}

export interface StakeholderNeedDetailDto extends StakeholderNeedDto {
  requirements: LinkedRequirementDto[];
  history: AuditEventDto[];
}

function needsBase(projectId: string): string {
  return `/api/projects/${projectId}/stakeholder-needs`;
}

export async function fetchStakeholderNeeds(
  projectId: string,
  signal?: AbortSignal,
): Promise<StakeholderNeedDto[]> {
  return requestJson<StakeholderNeedDto[]>(needsBase(projectId), "stakeholderNeeds", { signal });
}

export async function fetchStakeholderNeed(
  projectId: string,
  needId: string,
  signal?: AbortSignal,
): Promise<StakeholderNeedDetailDto> {
  return requestJson<StakeholderNeedDetailDto>(
    `${needsBase(projectId)}/${needId}`,
    "stakeholderNeed",
    { signal },
  );
}

export async function createStakeholderNeed(
  projectId: string,
  input: CreateStakeholderNeedRequest,
): Promise<StakeholderNeedDto> {
  return requestJson<StakeholderNeedDto>(needsBase(projectId), "stakeholderNeed", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateStakeholderNeed(
  projectId: string,
  needId: string,
  input: UpdateStakeholderNeedRequest,
): Promise<StakeholderNeedDto> {
  return requestJson<StakeholderNeedDto>(`${needsBase(projectId)}/${needId}`, "stakeholderNeed", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function useStakeholderNeeds(projectId: string) {
  return useResource<StakeholderNeedDto[]>(
    React.useCallback((signal) => fetchStakeholderNeeds(projectId, signal), [projectId]),
    `needs:${projectId}`,
  );
}

export function useStakeholderNeed(projectId: string, needId: string) {
  return useResource<StakeholderNeedDetailDto>(
    React.useCallback(
      (signal) => fetchStakeholderNeed(projectId, needId, signal),
      [projectId, needId],
    ),
    `need:${projectId}:${needId}`,
  );
}

// --- Design items -----------------------------------------------------------

export interface DesignItemDto {
  id: string;
  projectId: string;
  identifier: string;
  name: string;
  description: string | null;
  itemType: DesignItemType;
  status: DesignItemStatus;
  ownerId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DesignItemListDto extends DesignItemDto {
  owner: OwnerSummary | null;
}

export interface DesignItemDetailDto extends DesignItemDto {
  owner: OwnerSummary | null;
  requirements: Array<LinkedRequirementDto & { linkType: string }>;
  decisions: Array<{ id: string; identifier: string; title: string; status: string }>;
  history: AuditEventDto[];
}

function designBase(projectId: string): string {
  return `/api/projects/${projectId}/design-items`;
}

export async function fetchDesignItems(
  projectId: string,
  signal?: AbortSignal,
): Promise<DesignItemListDto[]> {
  return requestJson<DesignItemListDto[]>(designBase(projectId), "designItems", { signal });
}

export async function fetchDesignItem(
  projectId: string,
  designItemId: string,
  signal?: AbortSignal,
): Promise<DesignItemDetailDto> {
  return requestJson<DesignItemDetailDto>(
    `${designBase(projectId)}/${designItemId}`,
    "designItem",
    { signal },
  );
}

export async function createDesignItem(
  projectId: string,
  input: CreateDesignItemRequest,
): Promise<DesignItemDto> {
  return requestJson<DesignItemDto>(designBase(projectId), "designItem", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateDesignItem(
  projectId: string,
  designItemId: string,
  input: UpdateDesignItemRequest,
): Promise<DesignItemDto> {
  return requestJson<DesignItemDto>(`${designBase(projectId)}/${designItemId}`, "designItem", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function assignDesignItemOwner(
  projectId: string,
  designItemId: string,
  ownerId: string | null,
): Promise<DesignItemDto> {
  return requestJson<DesignItemDto>(
    `${designBase(projectId)}/${designItemId}/owner`,
    "designItem",
    { method: "POST", body: JSON.stringify({ ownerId }) },
  );
}

export function useDesignItems(projectId: string) {
  return useResource<DesignItemListDto[]>(
    React.useCallback((signal) => fetchDesignItems(projectId, signal), [projectId]),
    `design-items:${projectId}`,
  );
}

export function useDesignItem(projectId: string, designItemId: string) {
  return useResource<DesignItemDetailDto>(
    React.useCallback(
      (signal) => fetchDesignItem(projectId, designItemId, signal),
      [projectId, designItemId],
    ),
    `design-item:${projectId}:${designItemId}`,
  );
}

// --- Verification activities ------------------------------------------------

export interface VerificationActivityDto {
  id: string;
  projectId: string;
  identifier: string;
  title: string;
  description: string | null;
  method: VerificationMethod;
  status: VerificationStatus;
  ownerId: string | null;
  plannedDate: string | null;
  completedDate: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * A verification activity as the list needs it.
 *
 * `lastReadiness` is the most recent assessment *as recorded*, with no
 * freshness verdict attached: establishing whether it still holds means
 * re-resolving that activity's engineering basis, which the list deliberately
 * does not do per row. The interface must therefore present it as the last
 * recorded assessment and never as a current one. Null means nobody has
 * evaluated the activity — which is not a verdict of any kind.
 */
export interface VerificationActivityListDto extends VerificationActivityDto {
  owner: OwnerSummary | null;
  lastReadiness: {
    id: string;
    status: VerificationReadinessStatus;
    scope: VerificationReadinessScope;
    readinessVersion: string;
    evaluatedAt: string;
    blockingCount: number;
  } | null;
}

export interface VerificationActivityDetailDto extends VerificationActivityDto {
  owner: OwnerSummary | null;
  requirements: LinkedRequirementDto[];
  evidence: Array<{
    id: string;
    title: string;
    evidenceType: string;
    sourceReference: string;
  }>;
  availableTransitions: VerificationStatus[];
  editable: boolean;
  history: AuditEventDto[];
}

function verificationBase(projectId: string): string {
  return `/api/projects/${projectId}/verification-activities`;
}

export async function fetchVerificationActivities(
  projectId: string,
  signal?: AbortSignal,
): Promise<VerificationActivityListDto[]> {
  return requestJson<VerificationActivityListDto[]>(
    verificationBase(projectId),
    "verificationActivities",
    { signal },
  );
}

export async function fetchVerificationActivity(
  projectId: string,
  activityId: string,
  signal?: AbortSignal,
): Promise<VerificationActivityDetailDto> {
  return requestJson<VerificationActivityDetailDto>(
    `${verificationBase(projectId)}/${activityId}`,
    "verificationActivity",
    { signal },
  );
}

export async function createVerificationActivity(
  projectId: string,
  input: CreateVerificationActivityRequest,
): Promise<VerificationActivityDto> {
  return requestJson<VerificationActivityDto>(verificationBase(projectId), "verificationActivity", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateVerificationActivity(
  projectId: string,
  activityId: string,
  input: UpdateVerificationActivityRequest,
): Promise<VerificationActivityDto> {
  return requestJson<VerificationActivityDto>(
    `${verificationBase(projectId)}/${activityId}`,
    "verificationActivity",
    { method: "PATCH", body: JSON.stringify(input) },
  );
}

export async function transitionVerificationActivity(
  projectId: string,
  activityId: string,
  to: VerificationStatus,
  rationale?: string | null,
): Promise<VerificationActivityDto> {
  return requestJson<VerificationActivityDto>(
    `${verificationBase(projectId)}/${activityId}/transition`,
    "verificationActivity",
    { method: "POST", body: JSON.stringify({ to, rationale: rationale ?? null }) },
  );
}

export async function assignVerificationOwner(
  projectId: string,
  activityId: string,
  ownerId: string | null,
): Promise<VerificationActivityDto> {
  return requestJson<VerificationActivityDto>(
    `${verificationBase(projectId)}/${activityId}/owner`,
    "verificationActivity",
    { method: "POST", body: JSON.stringify({ ownerId }) },
  );
}

export function useVerificationActivities(projectId: string) {
  return useResource<VerificationActivityListDto[]>(
    React.useCallback((signal) => fetchVerificationActivities(projectId, signal), [projectId]),
    `verification:${projectId}`,
  );
}

export function useVerificationActivity(projectId: string, activityId: string) {
  return useResource<VerificationActivityDetailDto>(
    React.useCallback(
      (signal) => fetchVerificationActivity(projectId, activityId, signal),
      [projectId, activityId],
    ),
    `verification:${projectId}:${activityId}`,
  );
}
