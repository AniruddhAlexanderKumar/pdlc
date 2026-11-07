"use client";

import * as React from "react";
import type { ProjectRole } from "@/domain";
import { requestJson } from "./client";
import { useResource } from "./use-resource";

/**
 * Project membership API access and its loading hooks.
 *
 * Explicit project membership is the whole mechanism behind "organization
 * membership no longer implies project access" — a user reaches a project
 * either through a real row here, or by being their organization's owner.
 * Every mutation below requires MANAGER on the project (or the organization
 * owner), enforced server-side; hiding a button here is convenience only.
 */

export interface ProjectMemberDto {
  id: string;
  projectId: string;
  role: ProjectRole;
  createdAt: string;
  updatedAt: string;
  user: { id: string; name: string; email: string; organizationRole: string };
}

function base(projectId: string): string {
  return `/api/projects/${projectId}/members`;
}

export async function fetchProjectMembers(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectMemberDto[]> {
  return requestJson<ProjectMemberDto[]>(base(projectId), "members", { signal });
}

export async function addProjectMember(
  projectId: string,
  userId: string,
  role: ProjectRole,
): Promise<ProjectMemberDto> {
  return requestJson<ProjectMemberDto>(base(projectId), "member", {
    method: "POST",
    body: JSON.stringify({ userId, role }),
  });
}

export async function changeProjectMemberRole(
  projectId: string,
  memberId: string,
  role: ProjectRole,
): Promise<ProjectMemberDto> {
  return requestJson<ProjectMemberDto>(`${base(projectId)}/${memberId}`, "member", {
    method: "PATCH",
    body: JSON.stringify({ role }),
  });
}

export async function removeProjectMember(projectId: string, memberId: string): Promise<void> {
  await requestJson<boolean>(`${base(projectId)}/${memberId}`, "removed", { method: "DELETE" });
}

/** The caller's own effective access to this project — see `MyProjectAccessDto`. */
export interface MyProjectAccessDto {
  role: ProjectRole;
  isOrganizationOwner: boolean;
}

/**
 * A convenience read for the UI to decide what to show and enable. Never
 * itself an authorization check: every mutation route re-derives access
 * from the session server-side regardless of what this returns.
 */
export async function fetchMyProjectAccess(
  projectId: string,
  signal?: AbortSignal,
): Promise<MyProjectAccessDto> {
  return requestJson<MyProjectAccessDto>(`/api/projects/${projectId}/role`, "access", { signal });
}

// --- Hooks --------------------------------------------------------------------

export function useProjectMembers(projectId: string) {
  return useResource<ProjectMemberDto[]>(
    React.useCallback((signal) => fetchProjectMembers(projectId, signal), [projectId]),
    `project-members:${projectId}`,
  );
}

export function useMyProjectAccess(projectId: string) {
  return useResource<MyProjectAccessDto>(
    React.useCallback((signal) => fetchMyProjectAccess(projectId, signal), [projectId]),
    `my-project-access:${projectId}`,
  );
}
