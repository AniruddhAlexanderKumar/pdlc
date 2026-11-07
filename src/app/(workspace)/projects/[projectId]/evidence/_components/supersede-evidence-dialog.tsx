"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";
import { describeApiError } from "@/lib/api/client";
import { type EvidenceDto, supersedeEvidence, useEvidenceList } from "@/lib/api/evidence";
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
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * Records that a *real, existing* evidence record replaces this one.
 *
 * Never creates evidence — the replacement must already exist, so the
 * selector only offers evidence this project actually has. Superseding never
 * touches this evidence's own traceability links: whatever cited it keeps
 * citing exactly this version.
 */
export function SupersedeEvidenceDialog({
  projectId,
  evidenceId,
  open,
  onOpenChange,
  onSuperseded,
}: {
  projectId: string;
  evidenceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuperseded: (evidence: EvidenceDto) => void;
}) {
  const candidates = useEvidenceList(projectId, "");
  const [newEvidenceId, setNewEvidenceId] = React.useState("");
  const [rationale, setRationale] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const options =
    candidates.state.phase === "ready"
      ? candidates.state.data.filter((row) => row.id !== evidenceId && row.status !== "SUPERSEDED")
      : [];

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    if (!newEvidenceId) {
      setError("Choose the evidence that replaces this record.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    try {
      const superseded = await supersedeEvidence(projectId, evidenceId, {
        newEvidenceId,
        rationale: rationale.trim() === "" ? null : rationale,
      });
      onSuperseded(superseded);
      onOpenChange(false);
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Supersede this evidence</DialogTitle>
          <DialogDescription>
            Records that a real, existing record replaces this one. This evidence remains readable —
            it is marked SUPERSEDED, not deleted — and every historical link that cites it keeps
            pointing at exactly this version.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} noValidate>
          <div className="flex flex-col gap-4">
            {error && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
              >
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </p>
            )}

            {candidates.state.phase === "loading" && <LoadingState inline label="Loading evidence…" />}

            {candidates.state.phase === "ready" && (
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="supersede-target" required>
                  Replacement evidence
                </Label>
                <Select
                  id="supersede-target"
                  value={newEvidenceId}
                  onChange={(event) => setNewEvidenceId(event.target.value)}
                  disabled={isSubmitting || options.length === 0}
                >
                  <option value="">
                    {options.length === 0 ? "No other evidence available in this project" : "Choose…"}
                  </option>
                  {options.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.identifier} — {option.title}
                    </option>
                  ))}
                </Select>
              </div>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="supersede-rationale">Rationale</Label>
              <Textarea
                id="supersede-rationale"
                value={rationale}
                onChange={(event) => setRationale(event.target.value)}
                disabled={isSubmitting}
                rows={2}
                placeholder="Why this evidence is being replaced. Optional."
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || options.length === 0}>
              {isSubmitting ? "Superseding…" : "Supersede"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
