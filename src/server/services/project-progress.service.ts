import {
  type ProgressStep,
  type ProjectProgressCounts,
  nextProgressStep,
  progressSteps,
} from "@/domain/project-progress";
import type { OrganizationContext } from "@/server/context/organization-context";
import * as progressRepository from "@/server/repositories/project-progress.repository";
import { requireProjectAccess } from "./authorization.service";

export interface ProjectProgress {
  counts: ProjectProgressCounts;
  steps: ProgressStep[];
  next: ProgressStep;
}

/**
 * The "what to do next" read model for one project.
 *
 * A read, not an engine: it computes no verdict about the engineering and
 * stores nothing. It counts real rows and hands them to the pure functions
 * in `project-progress.ts`, which decide which stage is unfinished. Any
 * project member may read it, like any other view of the project; someone
 * who cannot read the project gets the same 404 they would get anywhere
 * else, so its existence is not confirmed.
 */
export async function getProjectProgress(
  context: OrganizationContext,
  projectId: string,
): Promise<ProjectProgress> {
  await requireProjectAccess(context, projectId);

  const counts = await progressRepository.countsForProject(projectId);

  return { counts, steps: progressSteps(counts), next: nextProgressStep(counts) };
}
