"use client";

import * as React from "react";
import { createBaselineRequestSchema, updateBaselineRequestSchema } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type BaselineDetailDto,
  type BaselineDto,
  createBaseline,
  updateBaseline,
} from "@/lib/api/drift";
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

export interface BaselineFormDialogProps {
  mode: "create" | "edit";
  projectId: string;
  baseline?: BaselineDetailDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (baseline: BaselineDto) => void;
}

/**
 * Create/edit form for an engineering baseline.
 *
 * There is no status field. A baseline is created as DRAFT and fixed by an
 * explicit activation, because activation is the moment the engineering basis
 * becomes the thing every later comparison is against — not something to set
 * from a dropdown alongside the name.
 */
export function BaselineFormDialog({
  mode,
  projectId,
  baseline,
  open,
  onOpenChange,
  onSaved,
}: BaselineFormDialogProps) {
  const isCreate = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? "New baseline" : "Edit baseline"}</DialogTitle>
          <DialogDescription>
            A record of the engineering basis you approved, as a reference point for later
            comparison. Assemble its membership while it is a draft, then activate it.
          </DialogDescription>
        </DialogHeader>

        <FormBody
          mode={mode}
          projectId={projectId}
          baseline={baseline}
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
  baseline,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  projectId: string;
  baseline?: BaselineDetailDto;
  onCancel: () => void;
  onSaved: (baseline: BaselineDto) => void;
}) {
  const isCreate = mode === "create";

  const [identifier, setIdentifier] = React.useState(baseline?.identifier ?? "");
  const [name, setName] = React.useState(baseline?.name ?? "");
  const [description, setDescription] = React.useState(baseline?.description ?? "");

  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const description_ = description.trim() === "" ? null : description;

    const parsed = isCreate
      ? createBaselineRequestSchema.safeParse({ identifier, name, description: description_ })
      : updateBaselineRequestSchema.safeParse({ name, description: description_ });

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
        isCreate || !baseline
          ? await createBaseline(projectId, parsed.data as never)
          : await updateBaseline(projectId, baseline.id, parsed.data as never);
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
            id="baseline-identifier"
            label="Identifier"
            required
            error={fieldErrors["identifier"]}
            hint="Project-scoped key, e.g. BL-001."
          >
            <Input
              id="baseline-identifier"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value.toUpperCase())}
              disabled={isSubmitting}
              placeholder="BL-001"
              className="font-mono"
              aria-invalid={fieldErrors["identifier"] ? true : undefined}
              aria-describedby={describedBy(
                "baseline-identifier",
                fieldErrors["identifier"],
                "hint",
              )}
            />
          </FormField>
        )}

        <FormField id="baseline-name" label="Name" required error={fieldErrors["name"]}>
          <Input
            id="baseline-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={isSubmitting}
            placeholder="Preliminary design baseline"
            aria-invalid={fieldErrors["name"] ? true : undefined}
            aria-describedby={describedBy("baseline-name", fieldErrors["name"])}
          />
        </FormField>

        <FormField
          id="baseline-description"
          label="Description"
          error={fieldErrors["description"]}
          hint="What this basis represents, and what it was approved for."
        >
          <Textarea
            id="baseline-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={isSubmitting}
            rows={3}
            aria-describedby={describedBy(
              "baseline-description",
              fieldErrors["description"],
              "hint",
            )}
          />
        </FormField>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : isCreate ? "Create baseline" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
