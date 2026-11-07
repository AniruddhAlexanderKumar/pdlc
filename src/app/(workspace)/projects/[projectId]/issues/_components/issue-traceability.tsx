"use client";

import * as React from "react";
import { AlertTriangle, Plus, Unlink } from "lucide-react";
import type { IssueRelation } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { type IssueLinkDto, addIssueLink, removeIssueLink, useIssueLinkTargets } from "@/lib/api/issues";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";

const RELATION_LABELS: Record<IssueRelation, string> = {
  REQUIREMENT: "Requirements",
  DESIGN_ITEM: "Design items",
  ENGINEERING_DECISION: "Engineering decisions",
};

const RELATIONS = Object.keys(RELATION_LABELS) as IssueRelation[];

/**
 * Traceability panel.
 *
 * Each relation is a distinct typed edge (a real join table per pair of
 * endpoint types), so the picker chooses a relation first and then only
 * offers targets that actually exist in this project — cross-project links
 * are impossible to express here, and rejected server-side regardless.
 */
export function IssueTraceability({
  projectId,
  issueId,
  links,
  editable,
  onLinksChanged,
}: {
  projectId: string;
  issueId: string;
  links: IssueLinkDto[];
  editable: boolean;
  onLinksChanged: (links: IssueLinkDto[]) => void;
}) {
  const targets = useIssueLinkTargets(projectId);

  const [relation, setRelation] = React.useState<IssueRelation>("REQUIREMENT");
  const [targetId, setTargetId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);

  const available = targets.state.phase === "ready" ? targets.state.data[relation] : [];
  const linkedIds = new Set(links.filter((link) => link.relation === relation).map((l) => l.targetId));
  const selectable = available.filter((option) => !linkedIds.has(option.id));

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isBusy) return;

    if (!targetId) {
      setError("Choose an artifact to link.");
      return;
    }

    setError(null);
    setIsBusy(true);

    try {
      const created = await addIssueLink(projectId, issueId, { relation, targetId });
      onLinksChanged([...links, created]);
      setTargetId("");
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRemove(link: IssueLinkDto) {
    if (isBusy) return;
    setError(null);
    setIsBusy(true);

    try {
      await removeIssueLink(projectId, issueId, link.id);
      onLinksChanged(links.filter((existing) => existing.id !== link.id));
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Traceability</CardTitle>
        <CardDescription>
          The requirements, design items and decisions this issue affects or touches.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}

        {RELATIONS.map((group) => {
          const groupLinks = links.filter((link) => link.relation === group);
          return (
            <section key={group} className="flex flex-col gap-2">
              <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {RELATION_LABELS[group]}
              </h3>
              {groupLinks.length === 0 ? (
                <p className="text-sm text-muted-foreground">None linked.</p>
              ) : (
                <ul className="flex flex-col divide-y divide-border">
                  {groupLinks.map((link) => (
                    <li key={link.id} className="flex items-center justify-between gap-3 py-2">
                      <span className="min-w-0 truncate text-sm text-foreground">
                        <span className="font-mono">{link.identifier}</span> — {link.title}
                      </span>
                      {editable && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemove(link)}
                          disabled={isBusy}
                          aria-label={`Remove link to ${link.identifier}`}
                        >
                          <Unlink aria-hidden="true" />
                          Remove
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}

        {editable && (
          <form onSubmit={handleAdd} className="flex flex-col gap-3 border-t border-border pt-4">
            <h3 className="text-sm font-medium text-foreground">Add a link</h3>

            {targets.state.phase === "loading" && <LoadingState inline label="Loading targets…" />}

            {targets.state.phase === "error" && (
              <p role="alert" className="text-sm text-destructive">
                {describeApiError(targets.state.error)}
              </p>
            )}

            {targets.state.phase === "ready" && (
              <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="issue-link-relation">Relationship</Label>
                  <Select
                    id="issue-link-relation"
                    value={relation}
                    onChange={(event) => {
                      setRelation(event.target.value as IssueRelation);
                      setTargetId("");
                    }}
                    disabled={isBusy}
                  >
                    {RELATIONS.map((value) => (
                      <option key={value} value={value}>
                        {RELATION_LABELS[value]}
                      </option>
                    ))}
                  </Select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="issue-link-target">Artifact</Label>
                  <Select
                    id="issue-link-target"
                    value={targetId}
                    onChange={(event) => setTargetId(event.target.value)}
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
                  {isBusy ? "Linking…" : "Add link"}
                </Button>
              </div>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
