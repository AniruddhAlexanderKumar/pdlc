"use client";

import * as React from "react";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Shared field and error presentation for the artifact forms.
 *
 * Layout only — no submission logic, no validation, no persistence. Each
 * module keeps its own form and its own rules; this exists so a label, hint
 * and error render the same way in all of them.
 */

export type FieldErrors = Record<string, string>;

/** Maps Zod issues to a field → message map, keeping the first per field. */
export function toFieldErrors(issues: { path: PropertyKey[]; message: string }[]): FieldErrors {
  const errors: FieldErrors = {};
  for (const issue of issues) {
    const field = issue.path[0];
    if (typeof field === "string" && !errors[field]) {
      errors[field] = issue.message;
    }
  }
  return errors;
}

export function FormError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{message}</span>
    </p>
  );
}

export function FormField({
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

/**
 * The record's number (`REQ-004`) on a create form.
 *
 * Numbered automatically by default: the server assigns the next number
 * when none is sent (see `withRecordIdentifier`), so the form shows that
 * as a fact instead of an empty required box someone has to invent a key
 * for. "Use my own number" reveals the old free-text field for teams
 * carrying identifiers over from another system; clearing it, or "Number
 * it for me", goes back to automatic.
 *
 * Send `value.trim() || undefined` as the identifier — see
 * {@link identifierOrAuto}.
 */
export function RecordNumberField({
  id,
  prefix,
  value,
  onChange,
  error,
  disabled = false,
}: {
  id: string;
  /** The record type's prefix, e.g. "REQ" — only used for the example shown. */
  prefix: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  disabled?: boolean;
}) {
  const [custom, setCustom] = React.useState(value.trim() !== "" || Boolean(error));
  const showInput = custom || Boolean(error);

  if (!showInput) {
    return (
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium leading-none text-foreground">Number</span>
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border bg-muted/30 px-3 py-2 text-sm">
          <span className="text-muted-foreground">
            Numbered automatically{" "}
            <span className="font-mono text-foreground">({prefix}-001, {prefix}-002, …)</span>
          </span>
          <button
            type="button"
            className="text-xs font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
            onClick={() => setCustom(true)}
            disabled={disabled}
          >
            Use my own number
          </button>
        </div>
      </div>
    );
  }

  const hintId = `${id}-hint`;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Number</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value.toUpperCase())}
        disabled={disabled}
        placeholder={`${prefix}-001`}
        className="font-mono"
        autoFocus={!error}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : hintId}
      />
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : (
        <p id={hintId} className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span>Leave it blank and it is numbered for you.</span>
          <button
            type="button"
            className="font-medium text-primary underline-offset-4 hover:underline disabled:opacity-50"
            onClick={() => {
              onChange("");
              setCustom(false);
            }}
            disabled={disabled}
          >
            Number it for me
          </button>
        </p>
      )}
    </div>
  );
}

/**
 * The optional part of a form, folded away until wanted.
 *
 * A create form shows what it needs to save — usually one or two fields —
 * and keeps everything optional (owner, priority, source, rationale…)
 * under "More details", so a newcomer is not asked twelve questions to
 * record one thing. Opens by itself when a field inside it has an error,
 * and starts open when it already holds something (an edit of a record
 * that has those details), so nothing filled in is ever hidden.
 */
export function MoreDetails({
  children,
  startOpen = false,
  hasErrors = false,
  summary = "More details (optional)",
}: {
  children: React.ReactNode;
  startOpen?: boolean;
  hasErrors?: boolean;
  summary?: string;
}) {
  const [open, setOpen] = React.useState(startOpen);

  return (
    <details
      open={open || hasErrors}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      className="group rounded-md border border-border"
    >
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium text-muted-foreground select-none hover:text-foreground [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />
        {summary}
      </summary>
      <div className="flex flex-col gap-4 border-t border-border p-3">{children}</div>
    </details>
  );
}

/** What a create form sends as `identifier`: the typed one, or nothing so the server numbers it. */
export function identifierOrAuto(value: string): string | undefined {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

/** Standard describedby wiring for a field that may show an error or a hint. */
export function describedBy(id: string, error: string | undefined, hint?: string): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}
