"use client";

import * as React from "react";
import { AlertTriangle, FolderGit2, Plus, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { describeApiError } from "@/lib/api/client";
import { useProjects } from "@/lib/api/projects";
import { ProjectFormDialog } from "./project-form-dialog";
import { ProjectTable } from "./project-table";

/**
 * Projects list.
 *
 * Reads `GET /api/projects` and renders exactly what came back — loading,
 * empty, error, or the real rows. Active and archived projects are both
 * listed, with status shown per row, so archiving never makes work disappear.
 */
export function ProjectsView() {
  const { state, reload } = useProjects();
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Projects"
        description="Programs and products in this organization. Each project holds its own engineering record."
        actions={
          <Button onClick={() => setIsCreateOpen(true)}>
            <Plus aria-hidden="true" />
            New project
          </Button>
        }
      />

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
            description="Create the first project to start building its engineering record."
            action={
              <Button onClick={() => setIsCreateOpen(true)}>
                <Plus aria-hidden="true" />
                New project
              </Button>
            }
          />
        ) : (
          <ProjectTable projects={state.data} />
        ))}

      <ProjectFormDialog
        mode="create"
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSaved={reload}
      />
    </div>
  );
}
