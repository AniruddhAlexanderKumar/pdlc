"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, FolderGit2, FolderOpen, RefreshCw } from "lucide-react";
import { ProjectStatusBadge } from "@/components/common/project-status-badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { describeApiError } from "@/lib/api/client";
import { progressDestinationHref } from "@/domain/project-progress";
import { useProjectProgress } from "@/lib/api/project-progress";
import { ProgressStateChip } from "../../projects/_components/next-step-panel";
import { type ProjectDto, useProjects } from "@/lib/api/projects";
import { useUserPersonalization } from "@/lib/use-user-personalization";
import { cn } from "@/lib/utils";

/** How many projects to show before deferring to the full Projects page. */
const PREVIEW_LIMIT = 6;

/**
 * The dashboard's real content: the projects you can open, and for each one
 * the single thing to do next.
 *
 * Each card used to offer "Open Workspace" and "All modules" — two ways in,
 * and no hint of what to do on arrival. It now states the next step,
 * computed from the project's real rows, with a button straight to it, so
 * someone who has just signed in can act without first learning the
 * product's map. "Open project" follows the landing preference in Settings.
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
  const { landingModule } = useUserPersonalization();
  const openPath = landingModule ? `/projects/${project.id}${landingModule}` : `/projects/${project.id}`;
  const isArchived = project.status === "ARCHIVED";

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <Link
          href={openPath}
          className="min-w-0 text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
          {project.name}
        </Link>
        <ProjectStatusBadge status={project.status} />
      </div>

      {project.description && (
        <p className="line-clamp-2 text-sm text-muted-foreground">{project.description}</p>
      )}

      {/* An archived project is read-only, so there is no "next" to do in it. */}
      {!isArchived && <ProjectNextStep projectId={project.id} />}

      <div className="mt-auto">
        <Button asChild variant="outline" size="sm">
          <Link href={openPath}>
            <FolderOpen aria-hidden="true" />
            Open project
          </Link>
        </Button>
      </div>
    </div>
  );
}

/**
 * The project's one next step, right on the dashboard.
 *
 * Someone who has just signed in should not have to open a project and
 * then work out what to do inside it — the answer is computed from the
 * project's real rows (see `project-progress.ts`) and shown here, with a
 * button straight to it. A failed load says nothing rather than something
 * wrong: this line is a shortcut, and the project page carries the same
 * panel with a retry.
 */
function ProjectNextStep({ projectId }: { projectId: string }) {
  const { state } = useProjectProgress(projectId);

  if (state.phase === "loading") {
    return <div className="h-14 animate-pulse rounded-md bg-muted/50" aria-hidden="true" />;
  }
  if (state.phase === "error") return null;

  const { next } = state.data;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-accent/30 px-3 py-2.5">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          Next step
          <ProgressStateChip state={next.state} />
        </span>
        <span className="text-sm font-medium text-foreground">
          {next.title}
          <span className="font-normal text-muted-foreground"> — {next.question}</span>
        </span>
        <span className="text-xs text-muted-foreground">{next.facts[0]}</span>
      </div>
      <Button asChild size="sm" className="shrink-0">
        <Link href={progressDestinationHref(projectId, next.destination, next.opensForm)}>
          {next.actionLabel}
          <ArrowRight aria-hidden="true" />
        </Link>
      </Button>
    </div>
  );
}
