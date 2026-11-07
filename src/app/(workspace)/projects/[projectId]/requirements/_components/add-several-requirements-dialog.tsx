"use client";

import * as React from "react";
import { ListPlus } from "lucide-react";
import { MAX_REQUIREMENTS_PER_PASTE, deriveRequirementTitle, parseRequirementLines } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { createRequirementsInBulk } from "@/lib/api/quick-actions";
import type { RequirementDto } from "@/lib/api/requirements";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** How many parsed lines the preview lists before summarising the rest. */
const PREVIEW_LIMIT = 6;

const EXAMPLE = [
  "The pump shall deliver at least 5 litres per minute.",
  "The housing shall withstand a 1.5 m drop onto concrete.",
  "The battery shall last 10 hours of normal use.",
].join("\n");

/**
 * Paste a list, get a set of draft requirements.
 *
 * Each non-empty line becomes one requirement — numbered automatically,
 * titled from its own first words (`deriveRequirementTitle`), as a draft
 * that can be edited, reviewed and approved like any other. The preview
 * shows exactly what will be created before anything is saved, and the
 * server adds all of them or none.
 */
export function AddSeveralRequirementsDialog({
  projectId,
  open,
  onOpenChange,
  onAdded,
}: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: (requirements: RequirementDto[]) => void;
}) {
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const statements = React.useMemo(() => parseRequirementLines(text), [text]);
  const tooMany = statements.length > MAX_REQUIREMENTS_PER_PASTE;

  function close(nextOpen: boolean) {
    if (isSubmitting) return;
    if (!nextOpen) {
      setText("");
      setError(null);
    }
    onOpenChange(nextOpen);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || statements.length === 0 || tooMany) return;
    setIsSubmitting(true);
    setError(null);
    try {
      const created = await createRequirementsInBulk(projectId, { statements });
      setText("");
      onAdded(created);
      onOpenChange(false);
    } catch (submitError) {
      setError(describeApiError(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  const count = statements.length;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add several requirements</DialogTitle>
          <DialogDescription>
            Paste or type them, one per line — from a document, an email or a spreadsheet column. Each one
            becomes a draft you can edit later, numbered and titled for you.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
          {error && <FormError message={error} />}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="several-requirements">Requirements, one per line</Label>
            <Textarea
              id="several-requirements"
              value={text}
              onChange={(event) => setText(event.target.value)}
              rows={8}
              placeholder={EXAMPLE}
              disabled={isSubmitting}
              autoFocus
              aria-describedby="several-requirements-hint"
            />
            <p id="several-requirements-hint" className="text-xs text-muted-foreground">
              Bullets and numbering (“-”, “•”, “1.”) are removed automatically. Blank lines are skipped.
            </p>
          </div>

          {count > 0 && (
            <section aria-label="What will be added" className="flex flex-col gap-2 rounded-md border bg-muted/30 p-3">
              <p className="text-sm font-medium text-foreground" aria-live="polite">
                {tooMany
                  ? `That is ${count} lines — add at most ${MAX_REQUIREMENTS_PER_PASTE} at a time.`
                  : `${count} requirement${count === 1 ? "" : "s"} will be added as drafts:`}
              </p>
              {!tooMany && (
                <ol className="flex flex-col gap-1.5 text-sm">
                  {statements.slice(0, PREVIEW_LIMIT).map((statement, index) => {
                    const title = deriveRequirementTitle(statement);
                    // The full text only when the name leaves something out —
                    // not when it is the same sentence without its full stop.
                    const shortened = title !== statement.replace(/[.!?]+$/, "");
                    return (
                      <li key={index} className="flex flex-col">
                        <span className="font-medium text-foreground">{title}</span>
                        {shortened && <span className="line-clamp-1 text-xs text-muted-foreground">{statement}</span>}
                      </li>
                    );
                  })}
                  {count > PREVIEW_LIMIT && (
                    <li className="text-xs text-muted-foreground">…and {count - PREVIEW_LIMIT} more.</li>
                  )}
                </ol>
              )}
            </section>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={count === 0 || tooMany || isSubmitting}>
              <ListPlus aria-hidden="true" />
              {isSubmitting
                ? "Adding…"
                : count === 0
                  ? "Add requirements"
                  : `Add ${count} requirement${count === 1 ? "" : "s"}`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
