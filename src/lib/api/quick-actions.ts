"use client";

import type {
  CreateRequirementsInBulkRequest,
  PlanChecksRequest,
  RequirementStatus,
} from "@/domain";
import type { VerificationActivityDto } from "./artifacts";
import { requestJson } from "./client";
import type { RequirementDto } from "./requirements";

/**
 * Client for the two automations in `@/domain/quick-actions`: adding
 * several requirements from a pasted list, and planning a linked check for
 * each requirement that needs one.
 */

export interface RequirementCheckCandidateDto {
  id: string;
  identifier: string;
  title: string;
  status: RequirementStatus;
}

export interface PlannedCheckDto {
  requirementId: string;
  requirementIdentifier: string;
  activity: VerificationActivityDto;
}

export async function createRequirementsInBulk(
  projectId: string,
  input: CreateRequirementsInBulkRequest,
): Promise<RequirementDto[]> {
  return requestJson<RequirementDto[]>(`/api/projects/${projectId}/requirements/bulk`, "requirements", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function fetchRequirementsNeedingChecks(
  projectId: string,
  signal?: AbortSignal,
): Promise<RequirementCheckCandidateDto[]> {
  return requestJson<RequirementCheckCandidateDto[]>(
    `/api/projects/${projectId}/verification-activities/plan`,
    "requirements",
    signal ? { signal } : {},
  );
}

export async function planChecks(projectId: string, input: PlanChecksRequest): Promise<PlannedCheckDto[]> {
  return requestJson<PlannedCheckDto[]>(`/api/projects/${projectId}/verification-activities/plan`, "checks", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
