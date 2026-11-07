"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { ISSUE_SEVERITIES, createIssueRequestSchema, updateIssueRequestSchema } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { type IssueDetailDto, type IssueDto, createIssue, updateIssue } from "@/lib/api/issues";
import { useOrganizationMembers } from "@/lib/api/requirements";
import { issueSeverityLabel } from "@/components/common/risk-issue-badges";
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
import { RecordNumberField, identifierOrAuto } from "@/components/common/artifact-form";

type FieldErrors = Record<string, string>;

export interface IssueFormDialogProps {
  mode: "create" | "edit";
  projectId: string;
  issue?: IssueDetailDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (issue: IssueDto) => void;
}

/**
 * Create/edit form for an issue.
 *
 * Validates with the same schemas the API enforces. Identifier and owner are
 * only offered on create — the identifier is the issue's project-scoped key
 * and ownership has its own audited endpoint on the detail page. Status is
 * never a form field: it moves through the lifecycle controls. Severity is
 * an explicit human choice, never a derived score.
 */
export function IssueFormDialog({ mode, projectId, issue, open, onOpenChange, onSaved }: IssueFormDialogProps) {
  const isCreate = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? "New issue" : "Edit issue"}</DialogTitle>
          <DialogDescription>
            {isCreate
              ? "Something has actually gone wrong or requires resolution."
              : "Update the issue's content. Status changes use the lifecycle controls."}
          </DialogDescription>
        </DialogHeader>

        <IssueFormBody
          mode={mode}
          projectId={projectId}
          issue={issue}
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

function IssueFormBody({
  mode,
  projectId,
  issue,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  projectId: string;
  issue?: IssueDetailDto;
  onCancel: () => void;
  onSaved: (issue: IssueDto) => void;
}) {
  const isCreate = mode === "create";
  const members = useOrganizationMembers();

  const [identifier, setIdentifier] = React.useState(issue?.identifier ?? "");
  const [title, setTitle] = React.useState(issue?.title ?? "");
  const [description, setDescription] = React.useState(issue?.description ?? "");
  const [severity, setSeverity] = React.useState(issue?.severity ?? "MEDIUM");
  const [ownerId, setOwnerId] = React.useState(issue?.ownerId ?? "");

  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const shared = { title, description, severity };

    const parsed = isCreate
      ? createIssueRequestSchema.safeParse({
          ...shared,
          identifier: identifierOrAuto(identifier),
          ownerId: ownerId === "" ? null : ownerId,
        })
      : updateIssueRequestSchema.safeParse(shared);

    if (!parsed.success) {
      const errors: FieldErrors = {};
      for (const issueError of parsed.error.issues) {
        const field = issueError.path[0];
        if (typeof field === "string" && !errors[field]) errors[field] = issueError.message;
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
        isCreate || !issue
          ? await createIssue(projectId, parsed.data as never)
          : await updateIssue(projectId, issue.id, parsed.data as never);
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
            id="issue-identifier"
            prefix="ISS"
            value={identifier}
            onChange={setIdentifier}
            error={fieldErrors["identifier"]}
            disabled={isSubmitting}
          />
        )}

        <Field id="issue-title" label="Title" required error={fieldErrors["title"]}>
          <Input
            id="issue-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={isSubmitting}
            placeholder="Chamber wall crack found"
            aria-invalid={fieldErrors["title"] ? true : undefined}
            aria-describedby={fieldErrors["title"] ? "issue-title-error" : undefined}
          />
        </Field>

        <Field
          id="issue-description"
          label="Description"
          required
          error={fieldErrors["description"]}
          hint="What was found."
        >
          <Textarea
            id="issue-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            disabled={isSubmitting}
            rows={4}
            aria-invalid={fieldErrors["description"] ? true : undefined}
            aria-describedby={fieldErrors["description"] ? "issue-description-error" : "issue-description-hint"}
          />
        </Field>

        <Field id="issue-severity" label="Severity" required>
          <Select
            id="issue-severity"
            value={severity}
            onChange={(event) => setSeverity(event.target.value as typeof severity)}
            disabled={isSubmitting}
          >
            {ISSUE_SEVERITIES.map((value) => (
              <option key={value} value={value}>
                {issueSeverityLabel(value)}
              </option>
            ))}
          </Select>
        </Field>

        {isCreate && (
          <Field id="issue-owner" label="Owner">
            <Select
              id="issue-owner"
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
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (isCreate ? "Creating…" : "Saving…") : isCreate ? "Create issue" : "Save changes"}
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
