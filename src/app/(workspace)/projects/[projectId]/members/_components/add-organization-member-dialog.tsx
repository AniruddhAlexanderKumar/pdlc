"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { addOrganizationMemberRequestSchema } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { addOrganizationMember, type OrganizationMemberDto } from "@/lib/api/organization-membership";
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

type FieldErrors = Record<string, string>;

export interface AddOrganizationMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (member: OrganizationMemberDto) => void;
}

/**
 * Provisions a new user account directly inside the caller's organization.
 *
 * There is no invitation-email flow in this product — this is the minimum
 * viable "add someone to my organization," the same password-based account
 * creation `register()` performs for a brand-new organization, scoped here
 * into an existing one instead. Server-enforced owner-only: a manager who
 * is not the organization owner sees this dialog's submit fail with the
 * API's own message, not a silently different outcome.
 */
export function AddOrganizationMemberDialog({
  open,
  onOpenChange,
  onAdded,
}: AddOrganizationMemberDialogProps) {
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [fieldErrors, setFieldErrors] = React.useState<FieldErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  function handleOpenChange(next: boolean) {
    if (!next) {
      setName("");
      setEmail("");
      setPassword("");
      setFieldErrors({});
      setFormError(null);
      setIsSubmitting(false);
    }
    onOpenChange(next);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;

    const parsed = addOrganizationMemberRequestSchema.safeParse({ name, email, password });
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
      const member = await addOrganizationMember(parsed.data);
      onAdded(member);
      handleOpenChange(false);
    } catch (error) {
      setFormError(describeApiError(error));
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add an organization member</DialogTitle>
          <DialogDescription>
            Creates a new account in this organization. They start with no project access — add
            them to specific projects afterward.
          </DialogDescription>
        </DialogHeader>

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

            <Field id="org-member-name" label="Name" required error={fieldErrors["name"]}>
              <Input
                id="org-member-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                disabled={isSubmitting}
                autoComplete="name"
                aria-invalid={fieldErrors["name"] ? true : undefined}
              />
            </Field>

            <Field id="org-member-email" label="Email" required error={fieldErrors["email"]}>
              <Input
                id="org-member-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                disabled={isSubmitting}
                autoComplete="email"
                aria-invalid={fieldErrors["email"] ? true : undefined}
              />
            </Field>

            <Field
              id="org-member-password"
              label="Temporary password"
              required
              error={fieldErrors["password"]}
              hint="Share this with them directly; there is no reset-by-email flow yet."
            >
              <Input
                id="org-member-password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={isSubmitting}
                autoComplete="new-password"
                aria-invalid={fieldErrors["password"] ? true : undefined}
                aria-describedby="org-member-password-hint"
              />
            </Field>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating…" : "Create account"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
