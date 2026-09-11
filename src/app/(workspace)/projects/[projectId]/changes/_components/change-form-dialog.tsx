"use client";

import * as React from "react";
import { createChangeRequestRequestSchema, updateChangeRequestRequestSchema } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type ChangeRequestDetailDto,
  type ChangeRequestDto,
  createChangeRequest,
  updateChangeRequest,
} from "@/lib/api/changes";
import {
  type FieldErrors,
  FormError,
  FormField,
  describedBy,
  toFieldErrors,
} from "@/components/common/artifact-form";
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
import { Textarea } from "@/components/ui/textarea";

export interface ChangeFormDialogProps {
  mode: "create" | "edit";
  projectId: string;
  change?: ChangeRequestDetailDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (change: ChangeRequestDto) => void;
}

/**
 * Create/edit form for a change request.
 *
 * Only the change's own definition lives here. There is no status field and no
 * requester field: a change always starts in DRAFT, and the server takes the
 * requester from the session. Declared impacts are added on the detail page
 * afterwards, because each is a separately audited assertion rather than part
 * of filling in a form.
 */
export function ChangeFormDialog({
  mode,
  projectId,
  change,
  open,
  onOpenChange,
  onSaved,
}: ChangeFormDialogProps) {
  const isCreate = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? "New change request" : "Edit change request"}</DialogTitle>
          <DialogDescription>
            {isCreate
              ? "Describe what is proposed to change and why. What it affects is declared next."
              : "Revise what is changing and why."}
          </DialogDescription>
        </DialogHeader>

        <FormBody
          mode={mode}
          projectId={projectId}
          change={change}
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

function FormBody({
  mode,
  projectId,
  change,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  projectId: string;
  change?: ChangeRequestDetailDto;
  onCancel: () => void;
  onSaved: (change: ChangeRequestDto) => void;
}) {
  const isCreate = mode === "create";

  const [identifier, setIdentifier] = React.useState(change?.identifier ?? "");
  const [title, setTitle] = React.useState(change?.title ?? "");
  const [description, setDescription] = React.useState(change?.description ?? "");
  const [reason, setReason] = React.useState(change?.reason ?? "");

  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const shared = { title, description, reason };

    const parsed = isCreate
      ? createChangeRequestRequestSchema.safeParse({ ...shared, identifier })
      : updateChangeRequestRequestSchema.safeParse(shared);

    if (!parsed.success) {
      setFieldErrors(toFieldErrors(parsed.error.issues));
      setFormError(null);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    setIsSubmitting(true);

    try {
      const saved =
        isCreate || !change
          ? await createChangeRequest(projectId, parsed.data as never)
          : await updateChangeRequest(projectId, change.id, parsed.data as never);
      onSaved(saved);
    } catch (error) {
      setFormError(describeApiError(error));
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
        {formError && <FormError message={formError} />}

        {isCreate && (
          <FormField
            id="change-identifier"
            label="Identifier"
            required
            error={fieldErrors["identifier"]}
            hint="Project-scoped key, e.g. CR-001."
          >
            <Input
              id="change-identifier"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value.toUpperCase())}
              disabled={isSubmitting}
              placeholder="CR-001"
              className="font-mono"
              aria-invalid={fieldErrors["identifier"] ? true : undefined}
              aria-describedby={describedBy("change-identifier", fieldErrors["identifier"], "hint")}
            />
          </FormField>
        )}

        <FormField id="change-title" label="Title" required error={fieldErrors["title"]}>
          <Input
            id="change-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={isSubmitting}
            placeholder="Raise the chamber pressure limit to 130 bar"
            aria-invalid={fieldErrors["title"] ? true : undefined}
            aria-describedby={describedBy("change-title", fieldErrors["title"])}
          />
        </FormField>

        <FormField
          id="change-description"
          label="Description"
          required
          error={fieldErrors["description"]}
          hint="What is proposed to change, stated plainly."
        >
          <Textarea
            id="change-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={isSubmitting}
            rows={4}
            aria-invalid={fieldErrors["description"] ? true : undefined}
            aria-describedby={describedBy("change-description", fieldErrors["description"], "hint")}
          />
        </FormField>

        <FormField
          id="change-reason"
          label="Reason"
          required
          error={fieldErrors["reason"]}
          hint="Why the change is being proposed — what drove it."
        >
          <Textarea
            id="change-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            disabled={isSubmitting}
            rows={3}
            aria-invalid={fieldErrors["reason"] ? true : undefined}
            aria-describedby={describedBy("change-reason", fieldErrors["reason"], "hint")}
          />
        </FormField>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : isCreate ? "Create change request" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
