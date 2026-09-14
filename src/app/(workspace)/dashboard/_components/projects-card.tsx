"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, FolderGit2 } from "lucide-react";
import { ProjectStatusBadge } from "@/components/common/project-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { describeApiError } from "@/lib/api/client";
import { useProjects } from "@/lib/api/projects";

/** How many projects to preview before deferring to the full Projects page. */
const PREVIEW_LIMIT = 5;

/**
 * Dashboard entry point into Projects.
 *
 * Uses the same `useProjects` hook as the Projects page rather than its own
 * fetch. Every number shown is a count of rows the API actually returned —
 * with no database reachable it reports the error instead of rendering a zero.
 */
export function ProjectsCard() {
  const { state } = useProjects();

  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between space-y-0">
        <div className="flex flex-col gap-1">
          <CardTitle>Projects</CardTitle>
          <CardDescription>
            {state.phase === "ready"
              ? `${state.data.length} in this organization`
              : "Programs and products"}
          </CardDescription>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/projects">
            View all
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {state.phase === "loading" && <LoadingState inline label="Loading projects…" />}

        {state.phase === "error" && (
          <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{describeApiError(state.error)}</span>
          </p>
        )}

        {state.phase === "ready" &&
          (state.data.length === 0 ? (
            <EmptyState
              className="border-0 py-8"
              icon={<FolderGit2 aria-hidden="true" />}
              title="No projects yet"
              description="Create the first project to start building its engineering record."
              action={
                <Button asChild size="sm">
                  <Link href="/projects">Go to projects</Link>
                </Button>
              }
            />
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {state.data.slice(0, PREVIEW_LIMIT).map((project) => (
                <li key={project.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link
                    href={`/projects/${project.id}/command-center`}
                    className="min-w-0 truncate text-sm font-medium text-foreground underline-offset-4 hover:underline"
                  >
                    {project.name}
                  </Link>
                  <ProjectStatusBadge status={project.status} />
                </li>
              ))}
              {state.data.length > PREVIEW_LIMIT && (
                <li className="pt-2.5 text-xs text-muted-foreground">
                  {state.data.length - PREVIEW_LIMIT} more on the Projects page.
                </li>
              )}
            </ul>
          ))}
      </CardContent>
    </Card>
  );
}
