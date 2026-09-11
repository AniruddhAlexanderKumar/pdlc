"use client";

import * as React from "react";
import { createDecisionRequestSchema, updateDecisionRequestSchema } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type DecisionDetailDto,
  type DecisionDto,
  createDecision,
  updateDecision,
} from "@/lib/api/decisions";
import { useOrganizationMembers } from "@/lib/api/requirements";
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
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

export interface DecisionFormDialogProps {
  mode: "create" | "edit";
  projectId: string;
  decision?: DecisionDetailDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (decision: DecisionDto) => void;
}

function toDateInput(value: string | null | undefined): string {
  return value ? value.slice(0, 10) : "";
}

/**
 * Create/edit form for a decision.
 *
 * Only the decision's own substance lives here. Alternatives, assumptions and
 * the expectation are added on the detail page afterwards — they are separate
 * records with their own audited operations, and cramming them into a create
 * wizard would make recording a decision feel like filing paperwork.
 */
export function DecisionFormDialog({
  mode,
  projectId,
  decision,
  open,
  onOpenChange,
  onSaved,
}: DecisionFormDialogProps) {
  const isCreate = mode === "create";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isCreate ? "New decision" : "Edit decision"}</DialogTitle>
          <DialogDescription>
            {isCreate
              ? "Record what was decided and why. Alternatives, assumptions and the expected outcome are added next."
              : "Revise the decision's statement and rationale."}
          </DialogDescription>
        </DialogHeader>

        <FormBody
          mode={mode}
          projectId={projectId}
          decision={decision}
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
  decision,
  onCancel,
  onSaved,
}: {
  mode: "create" | "edit";
  projectId: string;
  decision?: DecisionDetailDto;
  onCancel: () => void;
  onSaved: (decision: DecisionDto) => void;
}) {
  const isCreate = mode === "create";
  const members = useOrganizationMembers();

  const [identifier, setIdentifier] = React.useState(decision?.identifier ?? "");
  const [title, setTitle] = React.useState(decision?.title ?? "");
  const [statement, setStatement] = React.useState(decision?.statement ?? "");
  const [rationale, setRationale] = React.useState(decision?.rationale ?? "");
  const [decidedAt, setDecidedAt] = React.useState(toDateInput(decision?.decidedAt));
  const [ownerId, setOwnerId] = React.useState(decision?.ownerId ?? "");

  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const shared = {
      title,
      statement,
      rationale,
      decidedAt: decidedAt === "" ? null : decidedAt,
    };

    const parsed = isCreate
      ? createDecisionRequestSchema.safeParse({
          ...shared,
          identifier,
          ownerId: ownerId === "" ? null : ownerId,
        })
      : updateDecisionRequestSchema.safeParse(shared);

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
        isCreate || !decision
          ? await createDecision(projectId, parsed.data as never)
          : await updateDecision(projectId, decision.id, parsed.data as never);
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
            id="decision-identifier"
            label="Identifier"
            required
            error={fieldErrors["identifier"]}
            hint="Project-scoped key, e.g. ED-001."
          >
            <Input
              id="decision-identifier"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value.toUpperCase())}
              disabled={isSubmitting}
              placeholder="ED-001"
              className="font-mono"
              aria-invalid={fieldErrors["identifier"] ? true : undefined}
              aria-describedby={describedBy(
                "decision-identifier",
                fieldErrors["identifier"],
                "hint",
              )}
            />
          </FormField>
        )}

        <FormField id="decision-title" label="Title" required error={fieldErrors["title"]}>
          <Input
            id="decision-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={isSubmitting}
            placeholder="Use regenerative cooling for the chamber"
            aria-invalid={fieldErrors["title"] ? true : undefined}
            aria-describedby={describedBy("decision-title", fieldErrors["title"])}
          />
        </FormField>

        <FormField
          id="decision-statement"
          label="Statement"
          required
          error={fieldErrors["statement"]}
          hint="What was decided, stated plainly."
        >
          <Textarea
            id="decision-statement"
            value={statement}
            onChange={(event) => setStatement(event.target.value)}
            disabled={isSubmitting}
            rows={3}
            aria-invalid={fieldErrors["statement"] ? true : undefined}
            aria-describedby={describedBy(
              "decision-statement",
              fieldErrors["statement"],
              "hint",
            )}
          />
        </FormField>

        <FormField
          id="decision-rationale"
          label="Rationale"
          required
          error={fieldErrors["rationale"]}
          hint="Why this was chosen. This is what a reader years from now will actually need."
        >
          <Textarea
            id="decision-rationale"
            value={rationale}
            onChange={(event) => setRationale(event.target.value)}
            disabled={isSubmitting}
            rows={4}
            aria-invalid={fieldErrors["rationale"] ? true : undefined}
            aria-describedby={describedBy(
              "decision-rationale",
              fieldErrors["rationale"],
              "hint",
            )}
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField
            id="decision-decided-at"
            label="Decided date"
            error={fieldErrors["decidedAt"]}
            hint="Optional. Set automatically on approval if left blank."
          >
            <Input
              id="decision-decided-at"
              type="date"
              value={decidedAt}
              onChange={(event) => setDecidedAt(event.target.value)}
              disabled={isSubmitting}
              aria-describedby={describedBy(
                "decision-decided-at",
                fieldErrors["decidedAt"],
                "hint",
              )}
            />
          </FormField>

          {isCreate && (
            <FormField id="decision-owner" label="Owner">
              <Select
                id="decision-owner"
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
      </div>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : isCreate ? "Create decision" : "Save changes"}
        </Button>
      </DialogFooter>
    </form>
  );
}
