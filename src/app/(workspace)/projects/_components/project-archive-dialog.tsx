"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { describeApiError } from "@/lib/api/client";
import { type ProjectDto, archiveProject } from "@/lib/api/projects";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export interface ProjectArchiveDialogProps {
  project: ProjectDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onArchived: (project: ProjectDto) => void;
}

/**
 * Explicit confirmation before archiving.
 *
 * The wording states plainly that there is no way back: the product has no
 * unarchive action, and promising a reversal that does not exist would be
 * worse than the archive itself. Nothing is sent until the confirm button is
 * pressed — cancelling or dismissing calls no API.
 */
export function ProjectArchiveDialog({
  project,
  open,
  onOpenChange,
  onArchived,
}: ProjectArchiveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive this project?</DialogTitle>
          <DialogDescription>
            <span className="font-medium text-foreground">{project.name}</span> will be marked
            archived and become read-only — it can no longer be edited. The project and its history
            are retained, but this product has no unarchive action, so the change cannot be undone
            from the interface.
          </DialogDescription>
        </DialogHeader>

        <ArchiveConfirmation
          project={project}
          onCancel={() => onOpenChange(false)}
          onArchived={(archived) => {
            onArchived(archived);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function ArchiveConfirmation({
  project,
  onCancel,
  onArchived,
}: {
  project: ProjectDto;
  onCancel: () => void;
  onArchived: (project: ProjectDto) => void;
}) {
  const [error, setError] = React.useState<string | null>(null);
  const [isArchiving, setIsArchiving] = React.useState(false);

  async function handleConfirm() {
    if (isArchiving) return;

    setError(null);
    setIsArchiving(true);

    try {
      onArchived(await archiveProject(project.id));
    } catch (caught) {
      setError(describeApiError(caught));
      setIsArchiving(false);
    }
  }

  return (
    <>
      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isArchiving}>
          Cancel
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={handleConfirm}
          disabled={isArchiving}
        >
          {isArchiving ? "Archiving…" : "Archive project"}
        </Button>
      </DialogFooter>
    </>
  );
}
