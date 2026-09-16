"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Archive, ArrowLeft, LayoutDashboard, Pencil, UserCog } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ProjectStatusBadge } from "@/components/common/project-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { describeApiError } from "@/lib/api/client";
import { useProject } from "@/lib/api/projects";
import { formatIsoDate } from "@/lib/utils";
import { useModuleLabel } from "../../_components/terminology-context";
import { MODULE_GROUPS, PROJECT_MODULES, type ProjectModule } from "./project-modules";
import { ProjectArchiveDialog } from "./project-archive-dialog";
import { ProjectFormDialog } from "./project-form-dialog";
import { SentinelSummaryCard } from "./sentinel-summary-card";
import { TechnicalReadinessPanel } from "./technical-readiness-panel";

/**
 * The overview grid shows every module except Members — Members has its own
 * dedicated header button here (and its own tab in the project-scoped tab
 * bar), so listing it twice in the same grid would be redundant.
 */
const OVERVIEW_MODULES = PROJECT_MODULES.filter((module) => module.href !== "/members");

/**
 * Project detail.
 *
 * Holds exactly one authoritative copy of the project: whatever the API last
 * returned. Edit and archive both replace it with the object from their own
 * response rather than patching a local guess, so the view cannot drift from
 * the server.
 */
export function ProjectDetailView({ projectId }: { projectId: string }) {
  const { state, set } = useProject(projectId);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [isArchiveOpen, setIsArchiveOpen] = React.useState(false);

  if (state.phase === "loading") {
    return <LoadingState label="Loading project…" />;
  }

  if (state.phase === "error") {
    return (
      <div className="flex flex-col gap-4">
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{describeApiError(state.error)}</span>
        </div>
        <Button asChild variant="outline" size="sm" className="self-start">
          <Link href="/projects">
            <ArrowLeft aria-hidden="true" />
            Back to projects
          </Link>
        </Button>
      </div>
    );
  }

  const project = state.data;
  const isArchived = project.status === "ARCHIVED";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={project.name}
        description={project.description ?? "No description."}
        actions={
          <>
            <Button asChild>
              <Link href={`/projects/${project.id}/command-center`}>
                <LayoutDashboard aria-hidden="true" />
                Command Center
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href={`/projects/${project.id}/members`}>
                <UserCog aria-hidden="true" />
                Members
              </Link>
            </Button>
            <Button
              variant="outline"
              onClick={() => setIsEditOpen(true)}
              disabled={isArchived}
              title={isArchived ? "Archived projects are read-only" : undefined}
            >
              <Pencil aria-hidden="true" />
              Edit
            </Button>
            {!isArchived && (
              <Button variant="outline" onClick={() => setIsArchiveOpen(true)}>
                <Archive aria-hidden="true" />
                Archive
              </Button>
            )}
          </>
        }
      />

      {isArchived && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-md border border-border bg-secondary p-3 text-sm text-secondary-foreground"
        >
          <Archive className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>This project is archived and read-only. It can no longer be edited.</span>
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Project record</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Status
              </dt>
              <dd>
                <ProjectStatusBadge status={project.status} />
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Created
              </dt>
              <dd className="font-mono text-sm text-foreground" title={project.createdAt}>
                {formatIsoDate(project.createdAt)}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Updated
              </dt>
              <dd className="font-mono text-sm text-foreground" title={project.updatedAt}>
                {formatIsoDate(project.updatedAt)}
              </dd>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Identifier
              </dt>
              <dd className="truncate font-mono text-sm text-foreground" title={project.id}>
                {project.id}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <SentinelSummaryCard projectId={project.id} />

      <TechnicalReadinessPanel projectId={project.id} />

      <Card>
        <CardHeader>
          <CardTitle>All modules</CardTitle>
          <CardDescription>
            Everything in this project, including the modules that have no permanent place in the
            sidebar. The sidebar is the faster way to whichever ones you use daily.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {MODULE_GROUPS.map((group) => {
            const members = OVERVIEW_MODULES.filter((module) => module.group === group.id);
            if (members.length === 0) return null;
            return (
              <ModuleLinkGroup
                key={group.id}
                label={group.label}
                modules={members}
                projectId={project.id}
              />
            );
          })}
          <ModuleLinkGroup
            label="Elsewhere"
            modules={OVERVIEW_MODULES.filter((module) => module.group === null)}
            projectId={project.id}
          />
        </CardContent>
      </Card>

      <ProjectFormDialog
        mode="edit"
        project={project}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSaved={set}
      />

      <ProjectArchiveDialog
        project={project}
        open={isArchiveOpen}
        onOpenChange={setIsArchiveOpen}
        onArchived={set}
      />
    </div>
  );
}

/**
 * One work-group's modules, as plain links.
 *
 * This replaced a grid of eighteen bordered cards, each with its own
 * description and its own "Open" button — which rendered the same
 * eighteen destinations the sidebar was already showing, at far greater
 * visual weight, directly above the two panels that carry this page's only
 * genuinely project-specific state. A reader arriving here met a menu, not
 * their project. Grouped links say the same thing in a fraction of the
 * space, and the group headings match the sidebar's exactly, so the two
 * read as one navigation rather than two competing ones.
 */
function ModuleLinkGroup({
  label,
  modules,
  projectId,
}: {
  label: string;
  modules: readonly ProjectModule[];
  projectId: string;
}) {
  if (modules.length === 0) return null;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {modules.map((module) => (
          <ModuleLink key={module.href} module={module} projectId={projectId} />
        ))}
      </div>
    </div>
  );
}

/** Its own component so `useModuleLabel` has a stable place to be called from — a hook cannot be called inside a `.map()` callback. */
function ModuleLink({ module, projectId }: { module: ProjectModule; projectId: string }) {
  const Icon = module.icon;
  const label = useModuleLabel(module.labelKey, module.label);
  return (
    <Link
      href={`/projects/${projectId}${module.href}`}
      title={module.description}
      className="flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {label}
    </Link>
  );
}
