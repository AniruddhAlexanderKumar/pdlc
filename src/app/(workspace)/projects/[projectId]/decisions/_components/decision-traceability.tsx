"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Plus, Unlink } from "lucide-react";
import type { DecisionRelation } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type DecisionLinkDto,
  addDecisionLink,
  removeDecisionLink,
  useDecisionLinkTargets,
} from "@/lib/api/decisions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";

const RELATION_LABELS: Record<DecisionRelation, string> = {
  REQUIREMENT: "Requirements",
  DESIGN_ITEM: "Design items",
  RISK: "Risks",
  ISSUE: "Issues",
  EVIDENCE: "Evidence",
};

const RELATIONS = Object.keys(RELATION_LABELS) as DecisionRelation[];

/** Relations whose target has its own page to link through to. */
const ROUTED_RELATIONS: Partial<Record<DecisionRelation, string>> = {
  REQUIREMENT: "requirements",
  DESIGN_ITEM: "design-items",
};

/**
 * What the decision affected or depended on, plus the evidence behind it.
 *
 * Risks, issues and evidence have no management module yet, so those
 * selectors are normally empty — shown honestly rather than filled with
 * invented rows.
 */
export function DecisionTraceability({
  projectId,
  decisionId,
  links,
  editable,
  onLinksChanged,
}: {
  projectId: string;
  decisionId: string;
  links: DecisionLinkDto[];
  editable: boolean;
  onLinksChanged: (links: DecisionLinkDto[]) => void;
}) {
  const targets = useDecisionLinkTargets(projectId);

  const [relation, setRelation] = React.useState<DecisionRelation>("REQUIREMENT");
  const [targetId, setTargetId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);

  const available = targets.state.phase === "ready" ? targets.state.data[relation] : [];
  const linkedIds = new Set(
    links.filter((link) => link.relation === relation).map((link) => link.targetId),
  );
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
      onLinksChanged(
        await addDecisionLink(projectId, decisionId, { relation, targetId } as never),
      );
      setTargetId("");
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRemove(link: DecisionLinkDto) {
    if (isBusy) return;
    setError(null);
    setIsBusy(true);

    try {
      onLinksChanged(
        await removeDecisionLink(projectId, decisionId, {
          relation: link.relation,
          targetId: link.targetId,
          linkType: link.linkType,
        }),
      );
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Traceability &amp; evidence</CardTitle>
        <CardDescription>
          The engineering objects this decision affected or depended on, and the evidence behind
          it.
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
          const route = ROUTED_RELATIONS[group];

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
                    <li
                      key={`${link.relation}-${link.targetId}`}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <span className="min-w-0 truncate text-sm text-foreground">
                        {route ? (
                          <Link
                            href={`/projects/${projectId}/${route}/${link.targetId}`}
                            className="underline-offset-4 hover:underline"
                          >
                            <span className="font-mono">{link.identifier}</span> — {link.title}
                          </Link>
                        ) : (
                          <>
                            <span className="font-mono">{link.identifier}</span> — {link.title}
                          </>
                        )}
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
                  <Label htmlFor="decision-link-relation">Relationship</Label>
                  <Select
                    id="decision-link-relation"
                    value={relation}
                    onChange={(event) => {
                      setRelation(event.target.value as DecisionRelation);
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
                  <Label htmlFor="decision-link-target">Artifact</Label>
                  <Select
                    id="decision-link-target"
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
