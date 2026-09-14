"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, ArrowRight, ArrowRightLeft, RefreshCw } from "lucide-react";
import {
  GRAPH_DIRECTIONS,
  GRAPH_EDGE_DEFINITIONS,
  edgeTypesFrom,
  edgeTypesInto,
  graphEdgeTypeLabel,
  graphNodeTypeLabel,
  traceabilityDetailRoute,
  type GraphDirection,
  type GraphEdgeType,
  type GraphNodeType,
} from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type GraphConnectionDto,
  type GraphNodeDto,
  useGraphNeighborhood,
} from "@/lib/api/traceability";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import { formatIsoDate } from "@/lib/utils";
import type { VisitedNode } from "./traceability-view";
import { TraceabilityGraphView } from "./traceability-graph-view";
import { TraceabilityPathExplorer } from "./traceability-path-explorer";

const DIRECTION_LABELS: Record<GraphDirection, string> = {
  BOTH: "Both",
  OUTBOUND: "Outbound",
  INBOUND: "Inbound",
};

/** The relationship types the registry permits for this node in this direction — never invented. */
function availableEdgeTypes(nodeType: GraphNodeType, direction: GraphDirection): GraphEdgeType[] {
  const outgoing = direction !== "INBOUND" ? edgeTypesFrom(nodeType) : [];
  const incoming = direction !== "OUTBOUND" ? edgeTypesInto(nodeType) : [];
  return [...new Set([...outgoing, ...incoming])].sort();
}

export function TraceabilityExplorer({
  projectId,
  current,
  canGoBack,
  onNavigate,
  onBack,
}: {
  projectId: string;
  current: VisitedNode;
  canGoBack: boolean;
  onNavigate: (node: GraphNodeDto) => void;
  onBack: () => void;
}) {
  const [viewMode, setViewMode] = React.useState<"graph" | "list">("graph");
  const [direction, setDirection] = React.useState<GraphDirection>("BOTH");
  const [edgeTypeFilter, setEdgeTypeFilter] = React.useState<GraphEdgeType | "">("");
  const [neighborTypeFilter, setNeighborTypeFilter] = React.useState<GraphNodeType | "">("");

  const ref = React.useMemo(
    () => ({ type: current.type, id: current.id }),
    [current.type, current.id],
  );
  const edgeTypes = edgeTypeFilter ? [edgeTypeFilter] : undefined;
  // Skipped entirely in graph mode — no point loading a neighborhood list
  // nobody is about to look at.
  const { state, reload } = useGraphNeighborhood(
    projectId,
    viewMode === "list" ? ref : null,
    direction,
    edgeTypes,
  );

  const edgeOptions = availableEdgeTypes(current.type, direction);

  function changeDirection(next: GraphDirection) {
    setDirection(next);
    setEdgeTypeFilter("");
    setNeighborTypeFilter("");
  }

  const connections = React.useMemo(
    () => (state.phase === "ready" && state.data ? state.data.connections : []),
    [state],
  );
  const neighborTypeOptions = React.useMemo(
    () => [...new Set(connections.map((connection) => connection.neighbor.type))].sort(),
    [connections],
  );
  const filtered = neighborTypeFilter
    ? connections.filter((connection) => connection.neighbor.type === neighborTypeFilter)
    : connections;

  const outbound = filtered.filter((connection) => connection.direction === "OUTBOUND");
  const inbound = filtered.filter((connection) => connection.direction === "INBOUND");

  const detailRoute = traceabilityDetailRoute(current.type, projectId, current.id);

  return (
    <div className="flex flex-col gap-4">
      <Card className="border-primary/40 bg-primary/5">
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <Badge variant="default">{graphNodeTypeLabel(current.type)}</Badge>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                Currently inspecting
              </span>
            </div>
            <CardTitle className="text-base">
              {current.identifier ? (
                <>
                  <span className="font-mono">{current.identifier}</span> — {current.label}
                </>
              ) : (
                current.label
              )}
            </CardTitle>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {detailRoute && (
              <Button asChild variant="outline" size="sm">
                <Link href={detailRoute}>Open in module</Link>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={onBack} disabled={!canGoBack}>
              <ArrowLeft aria-hidden="true" />
              Back
            </Button>
          </div>
        </CardHeader>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-foreground">Digital thread</h2>
        <div className="flex gap-1" role="group" aria-label="View">
          <Button
            type="button"
            size="sm"
            variant={viewMode === "graph" ? "default" : "outline"}
            onClick={() => setViewMode("graph")}
            aria-pressed={viewMode === "graph"}
          >
            Graph
          </Button>
          <Button
            type="button"
            size="sm"
            variant={viewMode === "list" ? "default" : "outline"}
            onClick={() => setViewMode("list")}
            aria-pressed={viewMode === "list"}
          >
            List
          </Button>
        </div>
      </div>

      {viewMode === "graph" && (
        <Card>
          <CardHeader>
            <CardTitle>Digital thread graph</CardTitle>
            <CardDescription>
              A real, interactive layout of this object&apos;s traced relationships — the same
              bounded traversal the list view reads, drawn spatially instead of listed as text.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TraceabilityGraphView
              key={`${current.type}:${current.id}`}
              projectId={projectId}
              root={ref}
              onNavigate={onNavigate}
            />
          </CardContent>
        </Card>
      )}

      {viewMode === "list" && (
        <Card>
          <CardHeader>
            <CardTitle>Direct relationships</CardTitle>
            <CardDescription>
              One hop from this object, read straight from the engineering graph.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Direction</Label>
                <div className="flex gap-1" role="group" aria-label="Direction">
                  {GRAPH_DIRECTIONS.map((value) => (
                    <Button
                      key={value}
                      type="button"
                      size="sm"
                      variant={direction === value ? "default" : "outline"}
                      onClick={() => changeDirection(value)}
                      aria-pressed={direction === value}
                    >
                      {DIRECTION_LABELS[value]}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="traceability-edge-filter">Relationship type</Label>
                <Select
                  id="traceability-edge-filter"
                  className="w-64"
                  value={edgeTypeFilter}
                  onChange={(event) => setEdgeTypeFilter(event.target.value as GraphEdgeType | "")}
                >
                  <option value="">All relationship types</option>
                  {edgeOptions.map((type) => (
                    <option key={type} value={type}>
                      {graphEdgeTypeLabel(type)}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="traceability-neighbor-filter">Connected object type</Label>
                <Select
                  id="traceability-neighbor-filter"
                  className="w-56"
                  value={neighborTypeFilter}
                  onChange={(event) =>
                    setNeighborTypeFilter(event.target.value as GraphNodeType | "")
                  }
                  disabled={neighborTypeOptions.length === 0}
                >
                  <option value="">All object types</option>
                  {neighborTypeOptions.map((type) => (
                    <option key={type} value={type}>
                      {graphNodeTypeLabel(type)}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            {state.phase === "loading" && <LoadingState label="Loading relationships…" />}

            {state.phase === "error" && (
              <div
                role="alert"
                className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
              >
                <p className="flex items-start gap-2 text-sm text-destructive">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                  <span>{describeApiError(state.error)}</span>
                </p>
                <Button variant="outline" size="sm" onClick={reload}>
                  <RefreshCw aria-hidden="true" />
                  Try again
                </Button>
              </div>
            )}

            {state.phase === "ready" && filtered.length === 0 && (
              <EmptyState
                icon={<ArrowRightLeft aria-hidden="true" />}
                title="No relationships"
                description={
                  edgeTypeFilter || neighborTypeFilter
                    ? "Nothing matches this filter. Clear it to see this object's other relationships."
                    : "This object has no direct relationships recorded in this project."
                }
              />
            )}

            {state.phase === "ready" && filtered.length > 0 && (
              <div className="flex flex-col gap-5">
                {direction !== "INBOUND" && (
                  <ConnectionGroup
                    title="Outbound — what this affects"
                    connections={outbound}
                    projectId={projectId}
                    onNavigate={onNavigate}
                    emptyLabel={direction === "BOTH" ? "Nothing outbound." : undefined}
                  />
                )}
                {direction !== "OUTBOUND" && (
                  <ConnectionGroup
                    title="Inbound — what affects this"
                    connections={inbound}
                    projectId={projectId}
                    onNavigate={onNavigate}
                    emptyLabel={direction === "BOTH" ? "Nothing inbound." : undefined}
                  />
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {viewMode === "list" && (
        <TraceabilityPathExplorer
          key={`${current.type}:${current.id}`}
          projectId={projectId}
          root={ref}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}

function ConnectionGroup({
  title,
  connections,
  projectId,
  onNavigate,
  emptyLabel,
}: {
  title: string;
  connections: GraphConnectionDto[];
  projectId: string;
  onNavigate: (node: GraphNodeDto) => void;
  emptyLabel?: string;
}) {
  if (connections.length === 0) {
    if (!emptyLabel) return null;
    return (
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </h3>
        <p className="text-sm text-muted-foreground">{emptyLabel}</p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h3>
      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {connections.map((connection) => (
          <li
            key={`${connection.edge.type}:${connection.edge.relationshipId}:${connection.direction}`}
            className="flex flex-col gap-1.5 p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Badge variant="outline">{graphNodeTypeLabel(connection.neighbor.type)}</Badge>
                <button
                  type="button"
                  onClick={() => onNavigate(connection.neighbor)}
                  className="min-w-0 truncate text-left text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {connection.neighbor.identifier ? (
                    <>
                      <span className="font-mono">{connection.neighbor.identifier}</span> —{" "}
                      {connection.neighbor.label}
                    </>
                  ) : (
                    connection.neighbor.label
                  )}
                </button>
                {connection.direction === "OUTBOUND" ? (
                  <ArrowRight
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                ) : (
                  <ArrowLeft
                    className="size-3.5 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
              </div>
              {(() => {
                const route = traceabilityDetailRoute(
                  connection.neighbor.type,
                  projectId,
                  connection.neighbor.id,
                );
                return route ? (
                  <Button asChild variant="ghost" size="sm">
                    <Link href={route}>Open in module</Link>
                  </Button>
                ) : null;
              })()}
            </div>

            <p className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">
                {graphEdgeTypeLabel(connection.edge.type)}
              </span>
              {connection.edge.linkType && ` (${connection.edge.linkType})`} —{" "}
              {GRAPH_EDGE_DEFINITIONS[connection.edge.type].meaning}
            </p>

            {connection.edge.note && (
              <p className="rounded bg-secondary px-2 py-1 text-xs text-secondary-foreground">
                “{connection.edge.note}”
              </p>
            )}

            <p
              className="font-mono text-[11px] text-muted-foreground"
              title={connection.edge.createdAt}
            >
              Recorded {formatIsoDate(connection.edge.createdAt)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
