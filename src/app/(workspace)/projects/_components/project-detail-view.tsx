"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowLeft,
  Boxes,
  CircleAlert,
  Eye,
  Factory,
  FileCheck,
  FileText,
  GitBranch,
  History,
  Layers,
  LayoutDashboard,
  ListChecks,
  Pencil,
  Radar,
  Scale,
  ShieldAlert,
  ShieldCheck,
  UserCog,
  Users,
  Waypoints,
} from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { ProjectStatusBadge } from "@/components/common/project-status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { describeApiError } from "@/lib/api/client";
import { useProject } from "@/lib/api/projects";
import { formatIsoDate } from "@/lib/utils";
import { ProjectArchiveDialog } from "./project-archive-dialog";
import { ProjectFormDialog } from "./project-form-dialog";
import { SentinelSummaryCard } from "./sentinel-summary-card";
import { TechnicalReadinessPanel } from "./technical-readiness-panel";

/**
 * The artifact modules that actually exist. Nothing is listed here that a
 * user cannot open — unbuilt modules are named in the empty state instead.
 */
const IMPLEMENTED_MODULES = [
  {
    label: "Command Center",
    href: "/command-center",
    icon: LayoutDashboard,
    description: "One view of what needs attention and the current readiness/traceability state.",
  },
  {
    label: "Requirements",
    href: "/requirements",
    icon: ListChecks,
    description: "Author requirements, manage their lifecycle and trace them.",
  },
  {
    label: "Stakeholder needs",
    href: "/stakeholder-needs",
    icon: Users,
    description: "The originating needs requirements derive from.",
  },
  {
    label: "Design items",
    href: "/design-items",
    icon: Boxes,
    description: "Product structure that requirements are allocated to.",
  },
  {
    label: "Verification",
    href: "/verification",
    icon: ShieldCheck,
    description: "How requirements are shown to be met.",
  },
  {
    label: "Evidence",
    href: "/evidence",
    icon: FileText,
    description: "Controlled engineering evidence: what it is, where it came from, and what depends on it.",
  },
  {
    label: "Decisions",
    href: "/decisions",
    icon: Scale,
    description: "What was decided, why, and what it depended on.",
  },
  {
    label: "Changes",
    href: "/changes",
    icon: GitBranch,
    description: "Proposed changes and what each one declares it affects.",
  },
  {
    label: "Risks",
    href: "/risks",
    icon: ShieldAlert,
    description: "What could go wrong, why, and what is being done about it.",
  },
  {
    label: "Issues",
    href: "/issues",
    icon: CircleAlert,
    description: "Problems actually found, their owners, and their disposition.",
  },
  {
    label: "Suppliers",
    href: "/suppliers",
    icon: Factory,
    description: "Supplier engineering dependencies, and what the product relies on them for.",
  },
  {
    label: "Baselines",
    href: "/baselines",
    icon: Layers,
    description: "The approved engineering basis that drift is measured against.",
  },
  {
    label: "Observations",
    href: "/observations",
    icon: Radar,
    description: "What has actually been observed in operation.",
  },
  {
    label: "Drift",
    href: "/drift",
    icon: Activity,
    description: "Where operational reality no longer matches the approved basis.",
  },
  {
    label: "Certification",
    href: "/certification",
    icon: FileCheck,
    description: "Certification obligations, traced to the engineering evidence that supports them.",
  },
  {
    label: "Decision Sentinel",
    href: "/sentinel",
    icon: Eye,
    description: "Surveillance signals for engineering changes that may need re-review.",
  },
  {
    label: "Traceability",
    href: "/traceability",
    icon: Waypoints,
    description: "Trace real relationships across the engineering graph, hop by hop.",
  },
  {
    label: "Engineering History",
    href: "/history",
    icon: History,
    description: "The chronological record of what happened, and when, across this project.",
  },
] as const;

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

      <Card>
        <CardHeader>
          <CardTitle>Engineering workspace</CardTitle>
          <CardDescription>
            Requirements, needs, design, verification, evidence, decisions, changes, risks, issues,
            suppliers, baselines, observations, drift, certification, surveillance and
            traceability for this project.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {IMPLEMENTED_MODULES.map((module) => {
              const Icon = module.icon;
              return (
                <div
                  key={module.href}
                  className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Icon className="size-5 shrink-0 text-primary" aria-hidden="true" />
                    <div className="flex min-w-0 flex-col">
                      <span className="text-sm font-medium text-foreground">{module.label}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {module.description}
                      </span>
                    </div>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/projects/${project.id}${module.href}`}>Open</Link>
                  </Button>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <SentinelSummaryCard projectId={project.id} />

      <TechnicalReadinessPanel projectId={project.id} />

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
