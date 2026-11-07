"use client";

import * as React from "react";
import { ClipboardCheck, ShieldQuestion } from "lucide-react";
import { VERIFICATION_METHOD_CHOICES, type VerificationMethod } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  fetchRequirementsNeedingChecks,
  planChecks,
  type PlannedCheckDto,
  type RequirementCheckCandidateDto,
} from "@/lib/api/quick-actions";
import { FormError } from "@/components/common/artifact-form";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

/** How many covered requirements the dialog names before summarising. */
const LIST_LIMIT = 8;

/**
 * Plans a check for each of `requirements` — or, when it is the project's
 * whole "no check yet" list, for every one of them — after asking only
 * how they will be checked. The server creates each check as PLANNED,
 * titled after its requirement, and links it to that requirement, all in
 * one transaction; nothing is marked done.
 */
export function PlanChecksDialog({
  projectId,
  requirements,
  planAllWithoutChecks,
  open,
  onOpenChange,
  onPlanned,
}: {
  projectId: string;
  /** The requirements the plan covers, shown to the reader before they confirm. */
  requirements: readonly RequirementCheckCandidateDto[];
  /**
   * True: ask the server to plan for every requirement that has no check
   * (the list above is what it showed a moment ago). False: exactly these.
   */
  planAllWithoutChecks: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPlanned: (checks: PlannedCheckDto[]) => void;
}) {
  const [method, setMethod] = React.useState<VerificationMethod>("TEST");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const count = requirements.length;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || count === 0) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const checks = await planChecks(
        projectId,
        planAllWithoutChecks ? { method } : { method, requirementIds: requirements.map((r) => r.id) },
      );
      onPlanned(checks);
      onOpenChange(false);
    } catch (submitError) {
      setError(describeApiError(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isSubmitting && onOpenChange(next)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{count === 1 ? "Plan a check" : `Plan ${count} checks`}</DialogTitle>
          <DialogDescription>
            A check is how you will show a requirement is met. Each one is created as planned and linked to
            its requirement — you record the result later.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {error && <FormError message={error} />}

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 text-sm font-medium text-foreground">How will you check {count === 1 ? "it" : "them"}?</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {VERIFICATION_METHOD_CHOICES.map((choice) => (
                <label
                  key={choice.method}
                  className={cn(
                    "flex cursor-pointer flex-col gap-0.5 rounded-md border p-3 text-sm transition-colors",
                    "focus-within:ring-2 focus-within:ring-ring",
                    method === choice.method ? "border-primary bg-primary/5" : "border-border hover:bg-secondary",
                  )}
                >
                  <span className="flex items-center gap-2 font-medium text-foreground">
                    <input
                      type="radio"
                      name="check-method"
                      value={choice.method}
                      checked={method === choice.method}
                      onChange={() => setMethod(choice.method)}
                      disabled={isSubmitting}
                      className="accent-[var(--primary)]"
                    />
                    {choice.label}
                  </span>
                  <span className="pl-5 text-xs text-muted-foreground">{choice.explanation}</span>
                </label>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">You can change the method of any single check afterwards.</p>
          </fieldset>

          <section aria-label="Requirements covered" className="flex flex-col gap-1.5 rounded-md border bg-muted/30 p-3">
            <p className="text-sm font-medium text-foreground">
              {count === 1 ? "For this requirement:" : `One check for each of these ${count} requirements:`}
            </p>
            <ul className="flex flex-col gap-1 text-sm">
              {requirements.slice(0, LIST_LIMIT).map((requirement) => (
                <li key={requirement.id} className="flex gap-2">
                  <span className="shrink-0 font-mono text-xs leading-5 text-muted-foreground">
                    {requirement.identifier}
                  </span>
                  <span className="line-clamp-1">{requirement.title}</span>
                </li>
              ))}
              {count > LIST_LIMIT && (
                <li className="text-xs text-muted-foreground">…and {count - LIST_LIMIT} more.</li>
              )}
            </ul>
          </section>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={count === 0 || isSubmitting}>
              <ClipboardCheck aria-hidden="true" />
              {isSubmitting ? "Planning…" : count === 1 ? "Plan the check" : `Plan ${count} checks`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * "N requirements have no check yet — plan one for each": the Verify step's
 * one-click automation. Renders nothing until it knows, nothing when every
 * requirement already has a check, and nothing if the lookup fails (the
 * page works without it; "New check" is still there).
 */
export function MissingChecksBanner({
  projectId,
  refreshKey,
  onPlanned,
}: {
  projectId: string;
  /** Changes whenever the page's own data changes, so the count stays current. */
  refreshKey: number;
  onPlanned: (checks: PlannedCheckDto[]) => void;
}) {
  const [candidates, setCandidates] = React.useState<RequirementCheckCandidateDto[] | null>(null);
  const [isOpen, setIsOpen] = React.useState(false);

  React.useEffect(() => {
    const controller = new AbortController();
    fetchRequirementsNeedingChecks(projectId, controller.signal)
      .then(setCandidates)
      .catch(() => {
        if (!controller.signal.aborted) setCandidates(null);
      });
    return () => controller.abort();
  }, [projectId, refreshKey]);

  if (!candidates || candidates.length === 0) return null;
  const count = candidates.length;

  return (
    <>
      <section
        aria-label="Requirements without a check"
        className="flex flex-col gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <p className="flex items-start gap-2 text-sm text-foreground">
          <ShieldQuestion className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <strong>
              {count === 1 ? "1 requirement has" : `${count} requirements have`} no check yet.
            </strong>{" "}
            Plan {count === 1 ? "one" : "one for each"} in a single step — each is linked to its requirement for
            you.
          </span>
        </p>
        <Button onClick={() => setIsOpen(true)} className="shrink-0">
          <ClipboardCheck aria-hidden="true" />
          {count === 1 ? "Plan a check" : `Plan ${count} checks`}
        </Button>
      </section>
      <PlanChecksDialog
        projectId={projectId}
        requirements={candidates}
        planAllWithoutChecks
        open={isOpen}
        onOpenChange={setIsOpen}
        onPlanned={onPlanned}
      />
    </>
  );
}
