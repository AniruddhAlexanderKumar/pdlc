"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { createProjectRequestSchema, updateProjectRequestSchema } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { type ProjectDto, createProject, updateProject } from "@/lib/api/projects";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface ProjectFormDialogProps {
  mode: "create" | "edit";
  /** Required in edit mode; supplies the initial values. */
  project?: ProjectDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Receives the authoritative project returned by the API. */
  onSaved: (project: ProjectDto) => void;
}

type FieldErrors = Partial<Record<"name" | "description", string>>;

/**
 * Create/edit form for a project.
 *
 * Client-side validation reuses the same schemas the API enforces
 * (`@/domain`), so the two cannot drift — but the API remains authoritative:
 * a server rejection is always surfaced, never assumed impossible.
 *
 * The form body is a separate component mounted only while the dialog is
 * open, so each opening starts from the current values instead of needing an
 * effect to reset stale state.
 */
export function ProjectFormDialog({
  mode,
  project,
  open,
  onOpenChange,
  onSaved,
}: ProjectFormDialogProps) {
  const isCreate = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isCreate ? "New project" : "Edit project"}</DialogTitle>
          <DialogDescription>
            {isCreate
              ? "Create a program or product to hold its engineering record."
              : "Update the project's name and description."}
          </DialogDescription>
        </DialogHeader>

        <ProjectFormBody
          mode={mode}
          project={project}
          onCancel={() => onOpenChange(false)}
          onSaved={(saved) => {
            onSaved(saved);
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function ProjectFormBody({
  mode,
  project,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  project?: ProjectDto;
  onCancel: () => void;
  onSaved: (project: ProjectDto) => void;
}) {
  const isCreate = mode === "create";

  const [name, setName] = React.useState(project?.name ?? "");
  const [description, setDescription] = React.useState(project?.description ?? "");
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return; // guards against double submission

    const payload = {
      name,
      description: description.trim() === "" ? null : description,
    };

    const schema = isCreate ? createProjectRequestSchema : updateProjectRequestSchema;
    const parsed = schema.safeParse(payload);

    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if ((field === "name" || field === "description") && !errors[field]) {
          errors[field] = issue.message;
        }
      }
      setFieldErrors(errors);
      setFormError(null);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setIsSubmitting(true);

    try {
      const saved =
        isCreate || !project
          ? await createProject(payload)
          : await updateProject(project.id, payload);
      onSaved(saved);
    } catch (error) {
      setFormError(describeApiError(error));
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-4">
        {formError && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{formError}</span>
          </p>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-name" required>
            Name
          </Label>
          <Input
            id="project-name"
            name="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={isSubmitting}
            aria-invalid={fieldErrors.name ? true : undefined}
            aria-describedby={fieldErrors.name ? "project-name-error" : undefined}
            placeholder="Upper Stage Propulsion"
          />
          {fieldErrors.name && (
            <p id="project-name-error" role="alert" className="text-sm text-destructive">
              {fieldErrors.name}
            </p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-description">Description</Label>
          <Textarea
            id="project-description"
            name="description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={isSubmitting}
            aria-invalid={fieldErrors.description ? true : undefined}
            aria-describedby={
              fieldErrors.description ? "project-description-error" : "project-description-hint"
            }
            placeholder="Scope, purpose, or programme context."
          />
          {fieldErrors.description ? (
            <p id="project-description-error" role="alert" className="text-sm text-destructive">
              {fieldErrors.description}
            </p>
          ) : (
            <p id="project-description-hint" className="text-xs text-muted-foreground">
              Optional.
            </p>
          )}
        </div>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting
            ? isCreate
              ? "Creating…"
              : "Saving…"
            : isCreate
              ? "Create project"
              : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
