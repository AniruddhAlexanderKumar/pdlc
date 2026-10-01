"use client";

import * as React from "react";
import {
  VERIFICATION_METHODS,
  createVerificationActivityRequestSchema,
  updateVerificationActivityRequestSchema,
} from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type VerificationActivityDetailDto,
  type VerificationActivityDto,
  createVerificationActivity,
  updateVerificationActivity,
} from "@/lib/api/artifacts";
import { useOrganizationMembers } from "@/lib/api/requirements";
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

export interface VerificationFormDialogProps {
  mode: "create" | "edit";
  projectId: string;
  activity?: VerificationActivityDetailDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (activity: VerificationActivityDto) => void;
}

/** An ISO instant rendered for a date input, or "" when absent. */
function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}

/**
 * Create/edit form for a verification activity.
 *
 * Status and completion date are absent by design: an activity always starts
 * PLANNED, and its outcome (with the completion stamp) is recorded through the
 * lifecycle controls on the detail page.
 */
export function VerificationFormDialog({
  mode,
  projectId,
  activity,
  open,
  onOpenChange,
  onSaved,
}: VerificationFormDialogProps) {
  const isCreate = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {isCreate ? "New check" : "Edit check"}
          </DialogTitle>
          <DialogDescription>
            How you will show a requirement is met — by a test, an analysis, an inspection or a
            demonstration.
          </DialogDescription>
        </DialogHeader>

        <FormBody
          mode={mode}
          projectId={projectId}
          activity={activity}
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
  activity,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  projectId: string;
  activity?: VerificationActivityDetailDto;
  onCancel: () => void;
  onSaved: (activity: VerificationActivityDto) => void;
}) {
  const isCreate = mode === "create";
  const members = useOrganizationMembers();

  const [identifier, setIdentifier] = React.useState(activity?.identifier ?? "");
  const [title, setTitle] = React.useState(activity?.title ?? "");
  const [description, setDescription] = React.useState(activity?.description ?? "");
  const [method, setMethod] = React.useState(activity?.method ?? "TEST");
  const [plannedDate, setPlannedDate] = React.useState(toDateInput(activity?.plannedDate));
  const [ownerId, setOwnerId] = React.useState(activity?.ownerId ?? "");

  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const shared = {
      title,
      description: description.trim() === "" ? null : description,
      method,
      plannedDate: plannedDate === "" ? null : plannedDate,
    };

    const parsed = isCreate
      ? createVerificationActivityRequestSchema.safeParse({
          ...shared,
          identifier: identifierOrAuto(identifier),
          ownerId: ownerId === "" ? null : ownerId,
        })
      : updateVerificationActivityRequestSchema.safeParse(shared);

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
        isCreate || !activity
          ? await createVerificationActivity(projectId, parsed.data as never)
          : await updateVerificationActivity(projectId, activity.id, parsed.data as never);
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
            id="verification-identifier"
            prefix="VER"
            value={identifier}
            onChange={setIdentifier}
            error={fieldErrors["identifier"]}
            disabled={isSubmitting}
          />
        )}

        <FormField id="verification-title" label="Title" required error={fieldErrors["title"]}>
          <Input
            id="verification-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={isSubmitting}
            placeholder="Chamber pressure hot-fire test"
            aria-invalid={fieldErrors["title"] ? true : undefined}
            aria-describedby={describedBy("verification-title", fieldErrors["title"])}
          />
        </FormField>

        <FormField
          id="verification-description"
          label="Description"
          error={fieldErrors["description"]}
        >
          <Textarea
            id="verification-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={isSubmitting}
            rows={3}
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField id="verification-method" label="Method" required>
            <Select
              id="verification-method"
              value={method}
              onChange={(event) => setMethod(event.target.value as typeof method)}
              disabled={isSubmitting}
            >
              {VERIFICATION_METHODS.map((value) => (
                <option key={value} value={value}>
                  {artifactLabel(value)}
                </option>
              ))}
            </Select>
          </FormField>

          <FormField
            id="verification-planned-date"
            label="Planned date"
            error={fieldErrors["plannedDate"]}
            hint="Interpreted as a UTC calendar date."
          >
            <Input
              id="verification-planned-date"
              type="date"
              value={plannedDate}
              onChange={(event) => setPlannedDate(event.target.value)}
              disabled={isSubmitting}
              aria-describedby={describedBy(
                "verification-planned-date",
                fieldErrors["plannedDate"],
                "hint",
              )}
            />
          </FormField>
        </div>

        {isCreate && (
          <FormField id="verification-owner" label="Owner">
            <Select
              id="verification-owner"
              value={ownerId}
              onChange={(event) => setOwnerId(event.target.value)}
              disabled={isSubmitting || members.state.phase !== "ready"}
            >
              <option value="">Unassigned</option>
              {members.state.phase === "ready" &&
                members.state.data.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name} ({member.email})
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
          {isSubmitting ? "Saving…" : isCreate ? "Create check" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
