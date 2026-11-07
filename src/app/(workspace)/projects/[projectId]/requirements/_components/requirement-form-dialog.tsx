"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import {
  REQUIREMENT_PRIORITIES,
  createRequirementRequestSchema,
  deriveRequirementTitle,
  updateRequirementRequestSchema,
} from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type RequirementDetailDto,
  type RequirementDto,
  createRequirement,
  updateRequirement,
  useOrganizationMembers,
} from "@/lib/api/requirements";
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
import { MoreDetails, RecordNumberField, identifierOrAuto } from "@/components/common/artifact-form";

type FieldErrors = Record<string, string>;

export interface RequirementFormDialogProps {
  mode: "create" | "edit";
  projectId: string;
  requirement?: RequirementDetailDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (requirement: RequirementDto) => void;
}

/**
 * Create/edit form for a requirement.
 *
 * Validates with the same schemas the API enforces. Identifier and owner are
 * only offered on create — the identifier is the requirement's project-scoped
 * key and ownership has its own audited endpoint on the detail page. Status is
 * never a form field: it moves through the lifecycle controls.
 */
export function RequirementFormDialog({
  mode,
  projectId,
  requirement,
  open,
  onOpenChange,
  onSaved,
}: RequirementFormDialogProps) {
  const isCreate = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? "New requirement" : "Edit requirement"}</DialogTitle>
          <DialogDescription>
            {isCreate
              ? "Requirements start as a draft and move through review before approval."
              : "Update the requirement's content. Status changes use the lifecycle controls."}
          </DialogDescription>
        </DialogHeader>

        <RequirementFormBody
          mode={mode}
          projectId={projectId}
          requirement={requirement}
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

function RequirementFormBody({
  mode,
  projectId,
  requirement,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  projectId: string;
  requirement?: RequirementDetailDto;
  onCancel: () => void;
  onSaved: (requirement: RequirementDto) => void;
}) {
  const isCreate = mode === "create";
  const members = useOrganizationMembers();

  const [identifier, setIdentifier] = React.useState(requirement?.identifier ?? "");
  const [title, setTitle] = React.useState(requirement?.title ?? "");
  const [statement, setStatement] = React.useState(requirement?.statement ?? "");
  const [rationale, setRationale] = React.useState(requirement?.rationale ?? "");
  const [priority, setPriority] = React.useState(requirement?.priority ?? "MEDIUM");
  const [source, setSource] = React.useState(requirement?.source ?? "");
  const [ownerId, setOwnerId] = React.useState(requirement?.ownerId ?? "");

  /** Used when the short name is left blank — every word from the statement itself. */
  const derivedTitle = statement.trim() === "" ? "" : deriveRequirementTitle(statement);

  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const shared = {
      title: title.trim() === "" ? derivedTitle : title,
      statement,
      rationale: rationale.trim() === "" ? null : rationale,
      priority,
      source: source.trim() === "" ? null : source,
    };

    const parsed = isCreate
      ? createRequirementRequestSchema.safeParse({
          ...shared,
          identifier: identifierOrAuto(identifier),
          ownerId: ownerId === "" ? null : ownerId,
        })
      : updateRequirementRequestSchema.safeParse(shared);

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
        isCreate || !requirement
          ? await createRequirement(projectId, parsed.data as never)
          : await updateRequirement(projectId, requirement.id, parsed.data as never);
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
            id="requirement-identifier"
            prefix="REQ"
            value={identifier}
            onChange={setIdentifier}
            error={fieldErrors["identifier"]}
            disabled={isSubmitting}
          />
        )}

        <Field
          id="requirement-statement"
          label="What must it do?"
          required
          error={fieldErrors["statement"]}
          hint="One clear sentence someone could check — for example “The pump shall deliver at least 5 litres per minute.”"
        >
          <Textarea
            id="requirement-statement"
            value={statement}
            onChange={(event) => setStatement(event.target.value)}
            disabled={isSubmitting}
            rows={3}
            placeholder="The product shall …"
            autoFocus={isCreate}
            aria-invalid={fieldErrors["statement"] ? true : undefined}
            aria-describedby={
              fieldErrors["statement"] ? "requirement-statement-error" : "requirement-statement-hint"
            }
          />
        </Field>

        <Field
          id="requirement-title"
          label="Short name"
          error={fieldErrors["title"]}
          hint="How it appears in lists. Leave it blank to use the first words above."
        >
          <Input
            id="requirement-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={isSubmitting}
            placeholder={derivedTitle || "Maximum chamber pressure"}
            aria-invalid={fieldErrors["title"] ? true : undefined}
            aria-describedby={fieldErrors["title"] ? "requirement-title-error" : "requirement-title-hint"}
          />
        </Field>

        <MoreDetails
          startOpen={!isCreate && (rationale !== "" || source !== "")}
          hasErrors={Boolean(fieldErrors["rationale"] || fieldErrors["source"])}
        >
          <Field
            id="requirement-rationale"
            label="Why is it needed?"
            error={fieldErrors["rationale"]}
            hint="Lets whoever reads it later judge whether a proposed change is safe."
          >
            <Textarea
              id="requirement-rationale"
              value={rationale}
              onChange={(event) => setRationale(event.target.value)}
              disabled={isSubmitting}
              rows={3}
              aria-describedby="requirement-rationale-hint"
            />
          </Field>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field id="requirement-priority" label="Priority">
              <Select
                id="requirement-priority"
                value={priority}
                onChange={(event) => setPriority(event.target.value as typeof priority)}
                disabled={isSubmitting}
              >
                {REQUIREMENT_PRIORITIES.map((value) => (
                  <option key={value} value={value}>
                    {value.charAt(0) + value.slice(1).toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>

            <Field
              id="requirement-source"
              label="Where it came from"
              error={fieldErrors["source"]}
              hint="A document, standard, customer or meeting."
            >
              <Input
                id="requirement-source"
                value={source}
                onChange={(event) => setSource(event.target.value)}
                disabled={isSubmitting}
                aria-describedby="requirement-source-hint"
              />
            </Field>
          </div>

          {isCreate && (
            <Field id="requirement-owner" label="Owner">
              <Select
                id="requirement-owner"
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
          {isSubmitting
            ? isCreate
              ? "Creating…"
              : "Saving…"
            : isCreate
              ? "Create requirement"
              : "Save changes"}
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
