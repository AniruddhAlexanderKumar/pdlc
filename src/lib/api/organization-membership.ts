"use client";

import { requestJson } from "./client";
import { type OwnerSummary, useOrganizationMembers } from "./requirements";

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
