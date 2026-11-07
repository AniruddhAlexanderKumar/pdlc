"use client";

import * as React from "react";
import { AlertTriangle, Route } from "lucide-react";
import {
  GRAPH_DIRECTIONS,
  GRAPH_LIMITS,
  graphEdgeTypeLabel,
  graphNodeTypeLabel,
  type GraphDirection,
  type GraphNodeRef,
} from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type GraphNodeDto,
  type TraversalResultDto,
  runGraphTraversal,
} from "@/lib/api/traceability";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";

const DIRECTION_LABELS: Record<GraphDirection, string> = {
  BOTH: "Both",
  OUTBOUND: "Outbound",
  INBOUND: "Inbound",
};

const TRUNCATION_MESSAGES: Record<string, string> = {
  MAX_DEPTH: "the maximum depth",
  MAX_NODES: "the maximum number of objects",
  MAX_EDGES: "the maximum number of relationships",
};

/**
 * Bounded multi-hop exploration beyond one relationship at a time.
 *
 * A thin form over `POST /graph/traverse` — the same breadth-first traversal
 * with the same caps `EngineeringGraphService.traverse` always enforces. Each
 * row's path is the shortest chain of edges the traversal actually followed
 * to reach it, not a guess.
 */
export function TraceabilityPathExplorer({
  projectId,
  root,
  onNavigate,
}: {
  projectId: string;
  root: GraphNodeRef;
  onNavigate: (node: GraphNodeDto) => void;
}) {
  const [direction, setDirection] = React.useState<GraphDirection>("BOTH");
  const [maxDepth, setMaxDepth] = React.useState<number>(GRAPH_LIMITS.defaultMaxDepth);
  const [isBusy, setIsBusy] = React.useState(false);
  const [error, setError] = React.useState<unknown>(null);
  const [result, setResult] = React.useState<TraversalResultDto | null>(null);

  // The parent remounts this component (via a `key` on `root`) whenever the
  // object being explored changes, so a stale result from a different object
  // is never left on screen — there is no cross-root state to reset here.

  async function run() {
    setIsBusy(true);
    setError(null);
    try {
      const traversal = await runGraphTraversal(projectId, { root, direction, maxDepth });
      setResult(traversal);
    } catch (caught) {
      setError(caught);
    } finally {
      setIsBusy(false);
    }
  }

  const reached = result ? result.nodes.filter((entry) => entry.depth > 0) : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Extended neighborhood</CardTitle>
        <CardDescription>
          Explore several hops at once, bounded by a conservative depth limit. Each object&apos;s
          path is the shortest chain of relationships that reaches it.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="traceability-traversal-direction">Direction</Label>
            <Select
              id="traceability-traversal-direction"
              className="w-40"
              value={direction}
              onChange={(event) => setDirection(event.target.value as GraphDirection)}
              disabled={isBusy}
            >
              {GRAPH_DIRECTIONS.map((value) => (
                <option key={value} value={value}>
                  {DIRECTION_LABELS[value]}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="traceability-traversal-depth">Depth</Label>
            <Select
              id="traceability-traversal-depth"
              className="w-32"
              value={String(maxDepth)}
              onChange={(event) => setMaxDepth(Number(event.target.value))}
              disabled={isBusy}
            >
              {Array.from({ length: GRAPH_LIMITS.maxMaxDepth }, (_, index) => index + 1).map((depth) => (
                <option key={depth} value={depth}>
                  {depth} {depth === 1 ? "hop" : "hops"}
                </option>
              ))}
            </Select>
          </div>

          <Button type="button" onClick={run} disabled={isBusy}>
            <Route aria-hidden="true" />
            {isBusy ? "Running…" : "Run traversal"}
          </Button>
        </div>

        {error ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{describeApiError(error)}</span>
          </p>
        ) : null}

        {isBusy && <LoadingState inline label="Traversing…" />}

        {!isBusy && result && reached.length === 0 && (
          <EmptyState
            icon={<Route aria-hidden="true" />}
            title="Nothing found within this depth"
            description="Nothing was reached in this direction within the chosen number of hops."
          />
        )}

        {!isBusy && result && reached.length > 0 && (
          <div className="flex flex-col gap-3">
            {result.limits.truncated && result.limits.truncatedBy && (
              <p
                role="status"
                className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning"
              >
                Stopped early at {TRUNCATION_MESSAGES[result.limits.truncatedBy] ?? "a traversal limit"}.
                Not every relationship within this depth is shown.
              </p>
            )}

            <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
              {reached.map((entry) => (
                <li key={`${entry.node.type}:${entry.node.id}`} className="flex flex-col gap-1.5 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Badge variant="outline">{graphNodeTypeLabel(entry.node.type)}</Badge>
                      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {entry.depth} {entry.depth === 1 ? "hop" : "hops"} away
                      </span>
                      <button
                        type="button"
                        onClick={() => onNavigate(entry.node)}
                        className="min-w-0 truncate text-left text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {entry.node.identifier ? (
                          <>
                            <span className="font-mono">{entry.node.identifier}</span> — {entry.node.label}
                          </>
                        ) : (
                          entry.node.label
                        )}
                      </button>
                    </div>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {entry.path
                      .map((step) => `${graphEdgeTypeLabel(step.edgeType)} (${step.traversed.toLowerCase()})`)
                      .join(" → ")}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
