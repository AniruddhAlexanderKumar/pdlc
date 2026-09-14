import type { ReactNode } from "react";
import { ProjectTabs } from "./_components/project-tabs";

/**
 * Shared shell for every page scoped to one project.
 *
 * Before this existed, each of the ~19 project modules (Requirements, Risks,
 * Command Center, Certification, ...) was an island — the only way to move
 * from one to another was back through the project overview page. This adds
 * one persistent tab bar, present on every page under `/projects/[projectId]`
 * (list pages and their detail sub-pages alike), so every module is one
 * click away from every other at all times.
 *
 * Deliberately minimal: this owns navigation chrome only. It does not fetch
 * the project itself — every page below already does that on its own terms
 * (loading/error states included), and duplicating that fetch here would
 * just be a second, potentially-inconsistent source of the same data.
 */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  return (
    <div className="flex flex-col gap-6">
      <ProjectTabs projectId={projectId} />
      {children}
    </div>
  );
}
