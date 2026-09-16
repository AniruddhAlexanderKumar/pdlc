"use client";

import * as React from "react";
import type { OrganizationRole } from "@/domain";
import { requestJson } from "./client";
import { type OwnerSummary, useOrganizationMembers } from "./requirements";
import { useResource } from "./use-resource";

/**
 * Organization membership mutation. Listing already exists as
 * `useOrganizationMembers`/`fetchOrganizationMembers` in `requirements.ts`
 * (the owner picker's original need); re-exported here rather than
 * duplicated, so there is exactly one client-side read of
 * `GET /api/organization/members`.
 *
 * This product has no invitation-email flow: adding someone to an
 * organization provisions their account directly (owner-only, enforced
 * server-side), the same way `register()` creates the first account. The
 * browser never sees a password hash or an organization id in any of these
 * shapes.
 */

export type { OwnerSummary as OrganizationMemberDto };
export { useOrganizationMembers };

/**
 * The same `GET /api/organization/members` response, read for the People
 * page rather than an owner picker — so it keeps the fields a picker has
 * no use for. `OwnerSummary` stays deliberately narrow (`id`/`name`/`email`)
 * because it is embedded in every artifact DTO that carries an owner;
 * widening that shape everywhere to serve one page would be the wrong
 * trade.
 */
export interface OrganizationPersonDto {
  id: string;
  name: string;
  email: string;
  organizationRole: OrganizationRole;
  joinedAt: string;
  projectCount: number;
}

export async function fetchOrganizationPeople(signal?: AbortSignal): Promise<OrganizationPersonDto[]> {
  return requestJson<OrganizationPersonDto[]>("/api/organization/members", "members", { signal });
}

/**
 * Owner-only server-side. `OWNER` is not an accepted value — organization
 * ownership is not grantable through any path in this pass, and the
 * request schema rejects it rather than the UI merely omitting it.
 */
export async function setOrganizationMemberRole(
  userId: string,
  role: "EXECUTIVE" | "MEMBER",
): Promise<{ id: string; name: string; organizationRole: OrganizationRole }> {
  return requestJson<{ id: string; name: string; organizationRole: OrganizationRole }>(
    `/api/organization/members/${userId}/role`,
    "member",
    { method: "PATCH", body: JSON.stringify({ role }) },
  );
}

export function useOrganizationPeople() {
  return useResource<OrganizationPersonDto[]>(
    React.useCallback((signal) => fetchOrganizationPeople(signal), []),
    "organization-people",
  );
}

export interface AddOrganizationMemberInput {
  name: string;
  email: string;
  password: string;
}

/** Owner-only server-side; a non-owner calling this gets a 403 regardless of what the UI shows. */
export async function addOrganizationMember(
  input: AddOrganizationMemberInput,
): Promise<OwnerSummary> {
  return requestJson<OwnerSummary>("/api/organization/members", "member", {
    method: "POST",
    body: JSON.stringify(input),
  });
}
