"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { EVIDENCE_TYPES, createEvidenceRequestSchema, evidenceTypeLabel, updateEvidenceRequestSchema } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type EvidenceDetailDto,
  type EvidenceDto,
  createEvidence,
  updateEvidence,
} from "@/lib/api/evidence";
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

type FieldErrors = Record<string, string>;

export interface EvidenceFormDialogProps {
  mode: "create" | "edit";
  projectId: string;
  evidence?: EvidenceDetailDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (evidence: EvidenceDto) => void;
}

/**
 * Create/edit form for a piece of evidence.
 *
 * Validates with the same schemas the API enforces. Identifier is only
 * offered on create — the evidence's project-scoped key. Status is never a
 * form field: it moves through the lifecycle controls on the detail page.
 * There is no file picker anywhere in this form — `sourceReference` is a
 * plain text external locator, and the interface never pretends otherwise.
 */
export function EvidenceFormDialog({
  mode,
  projectId,
  evidence,
  open,
  onOpenChange,
  onSaved,
}: EvidenceFormDialogProps) {
  const isCreate = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? "Record evidence" : "Edit evidence"}</DialogTitle>
          <DialogDescription>
            {isCreate
              ? "A reference to something that already exists — a report, a test result, an inspection record."
              : "Update the evidence's content. This is only possible while it is a DRAFT."}
          </DialogDescription>
        </DialogHeader>

        <EvidenceFormBody
          mode={mode}
          projectId={projectId}
          evidence={evidence}
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

function EvidenceFormBody({
  mode,
  projectId,
  evidence,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  projectId: string;
  evidence?: EvidenceDetailDto;
  onCancel: () => void;
  onSaved: (evidence: EvidenceDto) => void;
}) {
  const isCreate = mode === "create";

  const [identifier, setIdentifier] = React.useState(evidence?.identifier ?? "");
  const [title, setTitle] = React.useState(evidence?.title ?? "");
  const [description, setDescription] = React.useState(evidence?.description ?? "");
  const [evidenceType, setEvidenceType] = React.useState(evidence?.evidenceType ?? "DOCUMENT");
  const [sourceReference, setSourceReference] = React.useState(evidence?.sourceReference ?? "");

  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const shared = {
      title,
      description: description.trim() === "" ? null : description,
      evidenceType,
      sourceReference,
    };

    const parsed = isCreate
      ? createEvidenceRequestSchema.safeParse({ ...shared, identifier })
      : updateEvidenceRequestSchema.safeParse(shared);

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
        isCreate || !evidence
          ? await createEvidence(projectId, parsed.data as never)
          : await updateEvidence(projectId, evidence.id, parsed.data as never);
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
          <Field
            id="evidence-identifier"
            label="Identifier"
            required
            error={fieldErrors["identifier"]}
            hint="Project-scoped key, e.g. EV-001."
          >
            <Input
              id="evidence-identifier"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value.toUpperCase())}
              disabled={isSubmitting}
              placeholder="EV-001"
              className="font-mono"
              aria-invalid={fieldErrors["identifier"] ? true : undefined}
              aria-describedby={
                fieldErrors["identifier"] ? "evidence-identifier-error" : "evidence-identifier-hint"
              }
            />
          </Field>
        )}

        <Field id="evidence-title" label="Title" required error={fieldErrors["title"]}>
          <Input
            id="evidence-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={isSubmitting}
            placeholder="Hot fire test report"
            aria-invalid={fieldErrors["title"] ? true : undefined}
            aria-describedby={fieldErrors["title"] ? "evidence-title-error" : undefined}
          />
        </Field>

        <Field
          id="evidence-type"
          label="Type"
          required
          error={fieldErrors["evidenceType"]}
        >
          <Select
            id="evidence-type"
            value={evidenceType}
            onChange={(event) => setEvidenceType(event.target.value as typeof evidenceType)}
            disabled={isSubmitting}
          >
            {EVIDENCE_TYPES.map((value) => (
              <option key={value} value={value}>
                {evidenceTypeLabel(value)}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          id="evidence-source-reference"
          label="Source reference"
          required
          error={fieldErrors["sourceReference"]}
          hint="An external locator — a document number, a URL, a test report id. This system does not store the file itself."
        >
          <Input
            id="evidence-source-reference"
            value={sourceReference}
            onChange={(event) => setSourceReference(event.target.value)}
            disabled={isSubmitting}
            placeholder="TR-2026-014"
            aria-invalid={fieldErrors["sourceReference"] ? true : undefined}
            aria-describedby={
              fieldErrors["sourceReference"] ? "evidence-source-reference-error" : "evidence-source-reference-hint"
            }
          />
        </Field>

        <Field
          id="evidence-description"
          label="Description"
          error={fieldErrors["description"]}
          hint="Optional."
        >
          <Textarea
            id="evidence-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={isSubmitting}
            rows={3}
            aria-describedby="evidence-description-hint"
          />
        </Field>
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (isCreate ? "Recording…" : "Saving…") : isCreate ? "Record evidence" : "Save changes"}
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
