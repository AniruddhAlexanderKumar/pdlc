"use client";

import * as React from "react";
import type { ProgressStep, ProjectProgressFacts } from "@/domain/project-progress";
import { requestJson } from "./client";
import { useResource } from "./use-resource";

export interface ProjectProgressDto {
  facts: ProjectProgressFacts;
  steps: ProgressStep[];
  next: ProgressStep;
}

export async function fetchProjectProgress(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectProgressDto> {
  return requestJson<ProjectProgressDto>(`/api/projects/${projectId}/progress`, "progress", {
    signal,
  });
}

export function useProjectProgress(projectId: string) {
  return useResource<ProjectProgressDto>(
    React.useCallback((signal) => fetchProjectProgress(projectId, signal), [projectId]),
    `project-progress:${projectId}`,
  );
}
