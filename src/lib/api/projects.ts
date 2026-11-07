"use client";

import * as React from "react";
import type { CreateProjectRequest, ProjectStatus, UpdateProjectRequest } from "@/domain";
import { requestJson } from "./client";
import { useResource } from "./use-resource";

/**
 * Project API access and the shared loading hooks.
 *
 * One module so the Projects pages and the dashboard card read projects the
 * same way rather than each growing their own fetch logic. Tenancy is not
 * represented here at all: the API resolves the caller's organization
 * server-side, and the browser is never trusted with it.
 */

/**
 * A project as it arrives over HTTP. Identical to the domain entity except
 * that dates are ISO strings — JSON has no Date.
 */
export interface ProjectDto {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export async function fetchProjects(signal?: AbortSignal): Promise<ProjectDto[]> {
  return requestJson<ProjectDto[]>("/api/projects", "projects", { signal });
}

export async function fetchProject(projectId: string, signal?: AbortSignal): Promise<ProjectDto> {
  return requestJson<ProjectDto>(`/api/projects/${projectId}`, "project", { signal });
}

export async function createProject(input: CreateProjectRequest): Promise<ProjectDto> {
  return requestJson<ProjectDto>("/api/projects", "project", {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export async function updateProject(
  projectId: string,
  input: UpdateProjectRequest,
): Promise<ProjectDto> {
  return requestJson<ProjectDto>(`/api/projects/${projectId}`, "project", {
    method: "PATCH",
    body: JSON.stringify(input),
  });
}

export async function archiveProject(projectId: string): Promise<ProjectDto> {
  return requestJson<ProjectDto>(`/api/projects/${projectId}/archive`, "project", {
    method: "POST",
  });
}

// --- Hooks ------------------------------------------------------------------

export function useProjects() {
  return useResource<ProjectDto[]>(
    React.useCallback((signal) => fetchProjects(signal), []),
    "projects",
  );
}

export function useProject(projectId: string) {
  return useResource<ProjectDto>(
    React.useCallback((signal) => fetchProject(projectId, signal), [projectId]),
    projectId,
  );
}
