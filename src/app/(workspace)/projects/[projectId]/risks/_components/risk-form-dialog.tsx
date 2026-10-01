"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { createRiskRequestSchema, updateRiskRequestSchema } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { useOrganizationMembers } from "@/lib/api/requirements";
import { type RiskDetailDto, type RiskDto, createRisk, updateRisk } from "@/lib/api/risks";
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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  RecordNumberField,
  identifierOrAuto,
  MoreDetails,
} from "@/components/common/artifact-form";

type FieldErrors = Record<string, string>;

export interface RiskFormDialogProps {
  mode: "create" | "edit";
  projectId: string;
  risk?: RiskDetailDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (risk: RiskDto) => void;
}

/**
 * Create/edit form for a risk.
 *
 * Validates with the same schemas the API enforces. Identifier and owner are
 * only offered on create — the identifier is the risk's project-scoped key
 * and ownership has its own audited endpoint on the detail page. Status is
 * never a form field: it moves through the lifecycle controls. There is no
 * probability, impact, or score field anywhere in this form.
 */
export function RiskFormDialog({ mode, projectId, risk, open, onOpenChange, onSaved }: RiskFormDialogProps) {
  const isCreate = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? "New risk" : "Edit risk"}</DialogTitle>
          <DialogDescription>
            {isCreate
              ? "What could go wrong, why, and what would happen."
              : "Update the risk's content. Status changes use the lifecycle controls."}
          </DialogDescription>
        </DialogHeader>

        <RiskFormBody
          mode={mode}
          projectId={projectId}
          risk={risk}
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

function RiskFormBody({
  mode,
  projectId,
  risk,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  projectId: string;
  risk?: RiskDetailDto;
  onCancel: () => void;
  onSaved: (risk: RiskDto) => void;
}) {
  const isCreate = mode === "create";
  const members = useOrganizationMembers();

  const [identifier, setIdentifier] = React.useState(risk?.identifier ?? "");
  const [title, setTitle] = React.useState(risk?.title ?? "");
  const [description, setDescription] = React.useState(risk?.description ?? "");
  const [cause, setCause] = React.useState(risk?.cause ?? "");
  const [consequence, setConsequence] = React.useState(risk?.consequence ?? "");
  const [ownerId, setOwnerId] = React.useState(risk?.ownerId ?? "");

  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const shared = {
      title,
      description,
      cause: cause.trim() === "" ? null : cause,
      consequence: consequence.trim() === "" ? null : consequence,
    };

    const parsed = isCreate
      ? createRiskRequestSchema.safeParse({
          ...shared,
          identifier: identifierOrAuto(identifier),
          ownerId: ownerId === "" ? null : ownerId,
        })
      : updateRiskRequestSchema.safeParse(shared);

    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (typeof field === "string" && !errors[field]) errors[field] = issue.message;
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
        isCreate || !risk
          ? await createRisk(projectId, parsed.data as never)
          : await updateRisk(projectId, risk.id, parsed.data as never);
      onSaved(saved);
    } catch (error) {
      setFormError(describeApiError(error));
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1">
        {formError && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{formError}</span>
          </p>
        )}

        {isCreate && (
          <RecordNumberField
            id="risk-identifier"
            prefix="RSK"
            value={identifier}
            onChange={setIdentifier}
            error={fieldErrors["identifier"]}
            disabled={isSubmitting}
          />
        )}

        <Field id="risk-title" label="Title" required error={fieldErrors["title"]}>
          <Input
            id="risk-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={isSubmitting}
            placeholder="Coolant supply interruption"
            aria-invalid={fieldErrors["title"] ? true : undefined}
            aria-describedby={fieldErrors["title"] ? "risk-title-error" : undefined}
          />
        </Field>

        <Field
          id="risk-description"
          label="Description"
          required
          error={fieldErrors["description"]}
          hint="What could go wrong."
        >
          <Textarea
            id="risk-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={isSubmitting}
            rows={3}
            aria-invalid={fieldErrors["description"] ? true : undefined}
            aria-describedby={fieldErrors["description"] ? "risk-description-error" : "risk-description-hint"}
          />
        </Field>

        <MoreDetails startOpen={!isCreate && (cause !== "" || consequence !== "")} hasErrors={Boolean(fieldErrors["cause"] || fieldErrors["consequence"])}>
          <Field id="risk-cause" label="Cause" error={fieldErrors["cause"]} hint="Why this could happen. Optional.">
            <Textarea
              id="risk-cause"
              value={cause}
              onChange={(event) => setCause(event.target.value)}
              disabled={isSubmitting}
              rows={3}
              aria-describedby="risk-cause-hint"
            />
          </Field>

          <Field
            id="risk-consequence"
            label="Consequence"
            error={fieldErrors["consequence"]}
            hint="What would happen if it occurred. Optional."
          >
            <Textarea
              id="risk-consequence"
              value={consequence}
              onChange={(event) => setConsequence(event.target.value)}
              disabled={isSubmitting}
              rows={3}
              aria-describedby="risk-consequence-hint"
            />
          </Field>

          {isCreate && (
            <Field id="risk-owner" label="Owner">
              <Select
                id="risk-owner"
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
            </Field>
          )}
        </MoreDetails>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (isCreate ? "Creating…" : "Saving…") : isCreate ? "Create risk" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function Field({
  id,
  label,
  required = false,
  error,
  hint,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  error?: string | undefined;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} required={required}>
        {label}
      </Label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
