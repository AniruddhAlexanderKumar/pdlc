"use client";

import * as React from "react";
import type { EngineeringIndustry } from "@/domain";
import { requestJson } from "./client";
import { useResource } from "./use-resource";

/**
 * The organization profile — currently just the industry selection.
 * `GET /api/organization/profile` is readable by any authenticated member;
 * the server enforces owner-only on the `PATCH`, the same as every other
 * authorization boundary in this app — nothing here is a client-side gate.
 */

export interface OrganizationProfileDto {
  id: string;
  name: string;
  industry: EngineeringIndustry | null;
  industryOtherDetail: string | null;
  industrySetAt: string | null;
  industrySetBy: { id: string; name: string } | null;
}

export interface SetOrganizationIndustryInput {
  industry: EngineeringIndustry;
  otherDetail?: string;
}

export async function fetchOrganizationProfile(
  signal?: AbortSignal,
): Promise<OrganizationProfileDto> {
  return requestJson<OrganizationProfileDto>("/api/organization/profile", "profile", { signal });
}

export async function setOrganizationIndustry(
  input: SetOrganizationIndustryInput,
): Promise<OrganizationProfileDto> {
  return requestJson<OrganizationProfileDto>("/api/organization/profile", "profile", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export function useOrganizationProfile() {
  return useResource<OrganizationProfileDto>(
    React.useCallback((signal) => fetchOrganizationProfile(signal), []),
    "organization-profile",
  );
}
