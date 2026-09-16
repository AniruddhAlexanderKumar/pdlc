"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, FolderGit2, LayoutDashboard, RefreshCw } from "lucide-react";
import { ProjectStatusBadge } from "@/components/common/project-status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { describeApiError } from "@/lib/api/client";
import { type ProjectDto, useProjects } from "@/lib/api/projects";
import { cn } from "@/lib/utils";

/** How many projects to show before deferring to the full Projects page. */
const PREVIEW_LIMIT = 6;

/**
 * The dashboard's real content: which programs you can open, and one click
 * into each.
 *
 * Every card's primary action is Command Center, not the project overview
 * — Command Center is the page that actually answers "what needs me
 * today"; the overview answers "what modules exist", which the sidebar
 * already answers permanently. Landing a reader on the second one was a
 * large part of why getting oriented took so many clicks.
 */
export function ProjectsCard() {
  const { state, reload } = useProjects();

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          Your projects
          {state.phase === "ready" && state.data.length > 0 && (
            <span className="ml-2 font-mono text-sm font-normal text-muted-foreground">
              {state.data.length}
            </span>
          )}
        </h2>
        {state.phase === "ready" && state.data.length > PREVIEW_LIMIT && (
          <Button asChild variant="outline" size="sm">
            <Link href="/projects">
              View all
              <ArrowRight aria-hidden="true" />
            </Link>
          </Button>
        )}
      </div>

      {state.phase === "loading" && <LoadingState label="Loading projects…" />}

      {state.phase === "error" && (
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
        >
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{describeApiError(state.error)}</span>
          </p>
          <Button variant="outline" size="sm" onClick={reload}>
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
        </div>
      )}

      {state.phase === "ready" &&
        (state.data.length === 0 ? (
          <EmptyState
            icon={<FolderGit2 aria-hidden="true" />}
            title="No projects yet"
            description="A project is the container for everything else — requirements, decisions, verification, risk. Create one to start."
            action={
              <Button asChild>
                <Link href="/projects">Create the first project</Link>
              </Button>
            }
          />
        ) : (
          // A single project gets the full width rather than sitting in a
          // half-width column beside dead space — the two-column grid only
          // earns its keep once there is something to put in both.
          <div
            className={cn(
              "grid grid-cols-1 gap-3",
              state.data.length > 1 && "lg:grid-cols-2",
            )}
          >
            {state.data.slice(0, PREVIEW_LIMIT).map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}
          </div>
        ))}
    </section>
  );
}

function ProjectCard({ project }: { project: ProjectDto }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={`/projects/${project.id}/command-center`}
          className="min-w-0 text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
          {project.name}
        </Link>
        <ProjectStatusBadge status={project.status} />
      </div>

      {project.description && (
        <p className="line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
      )}

      <div className="mt-auto flex flex-wrap gap-2">
        <Button asChild size="sm">
          <Link href={`/projects/${project.id}/command-center`}>
            <LayoutDashboard aria-hidden="true" />
            Command Center
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link href={`/projects/${project.id}`}>All modules</Link>
        </Button>
      </div>
    </div>
  );
}
