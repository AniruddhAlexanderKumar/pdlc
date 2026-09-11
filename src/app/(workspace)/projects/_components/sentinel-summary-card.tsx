"use client";

import Link from "next/link";
import { AlertTriangle, Eye } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { describeApiError } from "@/lib/api/client";
import { useSurveillanceCounts } from "@/lib/api/sentinel";

/**
 * The project-dashboard summary of the Decision Sentinel.
 *
 * Deliberately compact and deliberately honest: it shows the two counts the
 * database actually holds — open and acknowledged surveillance targets — and
 * nothing else. There is no health score, no risk rating, and no colour
 * standing in for a number nobody computed. Zero of both is shown as a plain
 * empty state, not hidden and not dressed up as "all clear" — the workspace
 * itself, not this card, is where that judgement belongs.
 */
export function SentinelSummaryCard({ projectId }: { projectId: string }) {
  const { state } = useSurveillanceCounts(projectId);

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Decision Sentinel</CardTitle>
            <CardDescription>
              Surveillance signals for engineering changes that existing analyses may not yet
              reflect. Detection is explicit — nothing here runs on its own.
            </CardDescription>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`/projects/${projectId}/sentinel`}>
              <Eye aria-hidden="true" />
              Open
            </Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {state.phase === "loading" && <LoadingState label="Loading surveillance counts…" />}

        {state.phase === "error" && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{describeApiError(state.error)}</span>
          </p>
        )}

        {state.phase === "ready" &&
          (state.data.open === 0 && state.data.acknowledged === 0 ? (
            <p className="text-sm text-muted-foreground">
              No open surveillance signals. This means detection has found nothing yet — it is
              not a statement that nothing has changed.
            </p>
          ) : (
            <dl className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">Open</dt>
                <dd>
                  <Badge variant={state.data.open > 0 ? "warning" : "outline"}>
                    {state.data.open}
                  </Badge>
                </dd>
              </div>
              <div className="flex items-center gap-2">
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Acknowledged
                </dt>
                <dd>
                  <Badge variant="outline">{state.data.acknowledged}</Badge>
                </dd>
              </div>
            </dl>
          ))}
      </CardContent>
    </Card>
  );
}
