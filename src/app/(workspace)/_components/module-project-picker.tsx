"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { AlertTriangle, FolderGit2 } from "lucide-react";
import { describeApiError } from "@/lib/api/client";
import { useProjects } from "@/lib/api/projects";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";

/**
 * Every engineering artifact belongs to a project, so the top-level nav entry
 * for an implemented module is a chooser rather than a global list. Projects
 * come from the API; nothing here is fabricated.
 */
export function ModuleProjectPicker({
  title,
  description,
  modulePath,
  actionLabel,
  icon: Icon,
}: {
  title: string;
  description: string;
  /** Appended to `/projects/[id]`, e.g. "/requirements". */
  modulePath: string;
  actionLabel: string;
  icon: LucideIcon;
}) {
  const { state } = useProjects();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={title} description={description} />

      {state.phase === "loading" && <LoadingState label="Loading projects…" />}

      {state.phase === "error" && (
        <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{describeApiError(state.error)}</span>
        </p>
      )}

      {state.phase === "ready" &&
        (state.data.length === 0 ? (
          <EmptyState
            icon={<FolderGit2 aria-hidden="true" />}
            title="No projects yet"
            description="This lives inside a project. Create a project first."
            action={
              <Button asChild>
                <Link href="/projects">Go to projects</Link>
              </Button>
            }
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {state.data.map((project) => (
              <Card key={project.id}>
                <CardHeader>
                  <CardTitle>{project.name}</CardTitle>
                  <CardDescription>{project.description ?? "No description."}</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/projects/${project.id}${modulePath}`}>
                      <Icon aria-hidden="true" />
                      {actionLabel}
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        ))}
    </div>
  );
}
