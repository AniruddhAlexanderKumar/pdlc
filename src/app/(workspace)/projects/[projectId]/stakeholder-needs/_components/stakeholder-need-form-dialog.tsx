"use client";

import * as React from "react";
import {
  STAKEHOLDER_NEED_STATUSES,
  createStakeholderNeedRequestSchema,
  updateStakeholderNeedRequestSchema,
} from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type StakeholderNeedDetailDto,
  type StakeholderNeedDto,
  createStakeholderNeed,
  updateStakeholderNeed,
} from "@/lib/api/artifacts";
import { artifactLabel } from "@/components/common/artifact-badges";
import { FormError, FormField, RecordNumberField, describedBy, identifierOrAuto, toFieldErrors, type FieldErrors } from "@/components/common/artifact-form";
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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export interface StakeholderNeedFormDialogProps {
  mode: "create" | "edit";
  projectId: string;
  need?: StakeholderNeedDetailDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (need: StakeholderNeedDto) => void;
}

/**
 * Create/edit form for a stakeholder need. Validates against the same schemas
 * the API enforces; the identifier is fixed after creation because it is the
 * need's project-scoped key.
 */
export function StakeholderNeedFormDialog({
  mode,
  projectId,
  need,
  open,
  onOpenChange,
  onSaved,
}: StakeholderNeedFormDialogProps) {
  const isCreate = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? "New stakeholder need" : "Edit stakeholder need"}</DialogTitle>
          <DialogDescription>
            The originating problem or need that requirements will derive from.
          </DialogDescription>
        </DialogHeader>

        <FormBody
          mode={mode}
          projectId={projectId}
          need={need}
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
  need,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  projectId: string;
  need?: StakeholderNeedDetailDto;
  onCancel: () => void;
  onSaved: (need: StakeholderNeedDto) => void;
}) {
  const isCreate = mode === "create";

  const [identifier, setIdentifier] = React.useState(need?.identifier ?? "");
  const [title, setTitle] = React.useState(need?.title ?? "");
  const [description, setDescription] = React.useState(need?.description ?? "");
  const [stakeholder, setStakeholder] = React.useState(need?.stakeholder ?? "");
  const [status, setStatus] = React.useState(need?.status ?? "DRAFT");

  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const parsed = isCreate
      ? createStakeholderNeedRequestSchema.safeParse({
          identifier: identifierOrAuto(identifier),
          title,
          description,
          stakeholder,
        })
      : updateStakeholderNeedRequestSchema.safeParse({
          title,
          description,
          stakeholder,
          status,
        });

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
        isCreate || !need
          ? await createStakeholderNeed(projectId, parsed.data as never)
          : await updateStakeholderNeed(projectId, need.id, parsed.data as never);
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
          <RecordNumberField
            id="need-identifier"
            prefix="SN"
            value={identifier}
            onChange={setIdentifier}
            error={fieldErrors["identifier"]}
            disabled={isSubmitting}
          />
        )}

        <FormField id="need-title" label="Title" required error={fieldErrors["title"]}>
          <Input
            id="need-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={isSubmitting}
            placeholder="Payload mass capability"
            aria-invalid={fieldErrors["title"] ? true : undefined}
            aria-describedby={describedBy("need-title", fieldErrors["title"])}
          />
        </FormField>

        <FormField
          id="need-stakeholder"
          label="Stakeholder"
          required
          error={fieldErrors["stakeholder"]}
          hint="Who needs this — a role, customer, or organization."
        >
          <Input
            id="need-stakeholder"
            value={stakeholder}
            onChange={(event) => setStakeholder(event.target.value)}
            disabled={isSubmitting}
            placeholder="Launch customer"
            aria-invalid={fieldErrors["stakeholder"] ? true : undefined}
            aria-describedby={describedBy("need-stakeholder", fieldErrors["stakeholder"], "hint")}
          />
        </FormField>

        <FormField
          id="need-description"
          label="Description"
          required
          error={fieldErrors["description"]}
        >
          <Textarea
            id="need-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={isSubmitting}
            rows={4}
            aria-invalid={fieldErrors["description"] ? true : undefined}
            aria-describedby={describedBy("need-description", fieldErrors["description"])}
          />
        </FormField>

        {!isCreate && (
          <FormField id="need-status" label="Status">
            <Select
              id="need-status"
              value={status}
              onChange={(event) => setStatus(event.target.value as typeof status)}
              disabled={isSubmitting}
            >
              {STAKEHOLDER_NEED_STATUSES.map((value) => (
                <option key={value} value={value}>
                  {artifactLabel(value)}
                </option>
              ))}
            </Select>
          </FormField>
        )}
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : isCreate ? "Create need" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
