import {
  type ProgressStep,
  type ProjectProgressFacts,
  type ReleaseGateFact,
  nextProgressStep,
  progressSteps,
} from "@/domain/project-progress";
import { hasTechnicalReadiness } from "@/domain/technical-readiness";
import type { OrganizationContext } from "@/server/context/organization-context";
import * as progressRepository from "@/server/repositories/project-progress.repository";
import { requireProjectAccess } from "./authorization.service";
import { technicalReadinessService } from "./technical-readiness.service";

export interface ProjectProgress {
  facts: ProjectProgressFacts;
  steps: ProgressStep[];
  next: ProgressStep;
}

/**
 * The release gate, in the terms the progress stages need.
 *
 * Read through `getLatestTechnicalReadiness`, the same call the project
 * page's readiness panel makes, so "is the last release check still
 * current?" has exactly one answer in the product. That call never
 * evaluates — it reports the last verdict and whether the project has moved
 * since — so opening a project page does not quietly run the gate.
 *
 * Only a `CURRENT` freshness counts as current. `STALE` and `UNKNOWN` both
 * mean the verdict can no longer be read as describing the project as it
 * stands, and are reported that way.
 */
async function releaseGate(context: OrganizationContext, projectId: string): Promise<ReleaseGateFact> {
  const latest = await technicalReadinessService.getLatestTechnicalReadiness(
    context,
    projectId,
    "RELEASE_READY",
  );

  if (!hasTechnicalReadiness(latest)) return { assessed: false };

  return {
    assessed: true,
    status: latest.assessment.status,
    current: latest.freshness === "CURRENT",
    evaluatedAt: new Date(latest.assessment.evaluatedAt).toISOString(),
    openFindings: latest.findings.filter(
      (finding) => finding.status === "BLOCKING" || finding.status === "UNKNOWN",
    ).length,
  };
}

/**
 * Where one project stands, stage by stage, and the one thing to do next.
 *
 * A read, not an engine: it computes no verdict about the engineering and
 * stores nothing. It counts real rows, borrows the release gate's verdict
 * from the engine that owns it, and hands both to the pure rules in
 * `project-progress.ts`. Any project member may read it; someone who cannot
 * read the project gets the same 404 they would get anywhere else.
 */
export async function getProjectProgress(
  context: OrganizationContext,
  projectId: string,
): Promise<ProjectProgress> {
  await requireProjectAccess(context, projectId);

  const [records, gate] = await Promise.all([
    progressRepository.recordFactsForProject(projectId),
    releaseGate(context, projectId),
  ]);

  const facts: ProjectProgressFacts = { ...records, release: { ...records.release, gate } };

  return { facts, steps: progressSteps(facts), next: nextProgressStep(facts) };
}
