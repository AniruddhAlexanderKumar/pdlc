"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Plus, Unlink } from "lucide-react";
import { describeApiError } from "@/lib/api/client";
import type { VerificationActivityDetailDto } from "@/lib/api/artifacts";
import { linkVerificationEvidence, unlinkVerificationEvidence } from "@/lib/api/artifacts";
import { useEvidenceList } from "@/lib/api/evidence";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";

/**
 * Evidence attached to a verification activity, recording its execution or
 * result. Attaches an *existing* evidence record — there is no upload here,
 * and evidence is created through the project's own Evidence module.
 *
 * Deliberately available regardless of the activity's own editability: the
 * plan is frozen once concluded, but attaching result evidence is exactly
 * what happens as an activity concludes.
 */
export function VerificationEvidencePanel({
  projectId,
  activityId,
  evidence,
  onChanged,
}: {
  projectId: string;
  activityId: string;
  evidence: VerificationActivityDetailDto["evidence"];
  onChanged: () => void;
}) {
  const candidates = useEvidenceList(projectId, "");
  const [selected, setSelected] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);

  const linkedIds = new Set(evidence.map((item) => item.id));
  const selectable =
    candidates.state.phase === "ready"
      ? candidates.state.data.filter((row) => !linkedIds.has(row.id))
      : [];

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy) return;
    if (!selected) {
      setError("Choose the evidence to attach.");
      return;
    }

    setError(null);
    setIsBusy(true);
    try {
      await linkVerificationEvidence(projectId, activityId, selected);
      setSelected("");
      onChanged();
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRemove(evidenceId: string) {
    if (isBusy) return;
    setError(null);
    setIsBusy(true);
    try {
      await unlinkVerificationEvidence(projectId, activityId, evidenceId);
      onChanged();
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Evidence</CardTitle>
        <CardDescription>
          Real evidence records attached to this activity. Evidence records what a verification
          produced, so its absence is not a readiness deficiency.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}

        {evidence.length === 0 ? (
          <p className="text-sm text-muted-foreground">No evidence attached yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {evidence.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                <span className="min-w-0 truncate text-sm text-foreground">
                  <Link
                    href={`/projects/${projectId}/evidence/${item.id}`}
                    className="font-mono underline-offset-4 hover:underline"
                  >
                    {item.identifier}
                  </Link>{" "}
                  — {item.title}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemove(item.id)}
                  disabled={isBusy}
                  aria-label={`Detach ${item.identifier}`}
                >
                  <Unlink aria-hidden="true" />
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleAdd} className="flex flex-col gap-3 border-t border-border pt-4">
          <h3 className="text-sm font-medium text-foreground">Attach evidence</h3>

          {candidates.state.phase === "loading" && <LoadingState inline label="Loading evidence…" />}

          {candidates.state.phase === "ready" && (
            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_auto]">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="verification-evidence-select">Evidence</Label>
                <Select
                  id="verification-evidence-select"
                  value={selected}
                  onChange={(event) => setSelected(event.target.value)}
                  disabled={isBusy || selectable.length === 0}
                >
                  <option value="">
                    {selectable.length === 0 ? "None available in this project" : "Choose…"}
                  </option>
                  {selectable.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.identifier} — {option.title}
                    </option>
                  ))}
                </Select>
              </div>
              <Button type="submit" disabled={isBusy || selectable.length === 0}>
                <Plus aria-hidden="true" />
                {isBusy ? "Attaching…" : "Attach"}
              </Button>
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
