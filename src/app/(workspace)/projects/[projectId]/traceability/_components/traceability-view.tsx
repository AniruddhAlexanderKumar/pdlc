"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, ChevronRight, RefreshCw, Table2, Waypoints } from "lucide-react";
import {
  TRACEABILITY_SELECTABLE_NODE_TYPES,
  graphNodeTypeLabel,
  type GraphNodeType,
  type TraceabilitySelectableNodeType,
} from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { useProject } from "@/lib/api/projects";
import { type GraphNodeDto, useTraceabilityRoots } from "@/lib/api/traceability";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import { TraceabilityExplorer } from "./traceability-explorer";

/** The subset of a resolved graph node the workspace needs to navigate and render a breadcrumb. */
export interface VisitedNode {
  type: GraphNodeType;
  id: string;
  identifier: string | null;
  label: string;
}

const SELECTABLE_TYPE_SET = new Set<string>(TRACEABILITY_SELECTABLE_NODE_TYPES);

/**
 * Every other module's detail pages link here with `?type=&id=` (and
 * `identifier=`/`label=` so this view never has to make a second fetch just
 * to resolve what the caller already had in hand) — "one interaction away"
 * from any object to its place in the graph. `type` is re-validated against
 * the same selectable-root list the picker itself offers, since it is a raw
 * query string a link could get wrong; an unrecognized or missing type
 * simply falls back to the ordinary empty state rather than opening
 * something unvalidated. `searchParams` itself is nullable — `useSearchParams()`
 * returns `null` outside a router context (every render in this project's
 * own test suite, for one), and this must degrade to the ordinary "nothing
 * open yet" state there too, not throw.
 */
function readLinkedRoot(searchParams: URLSearchParams | null): VisitedNode | null {
  if (!searchParams) return null;
  const type = searchParams.get("type");
  const id = searchParams.get("id");
  if (!type || !id || !SELECTABLE_TYPE_SET.has(type)) return null;
  return {
    type: type as GraphNodeType,
    id,
    identifier: searchParams.get("identifier"),
    label: searchParams.get("label") ?? id,
  };
}

/**
 * The Traceability workspace.
 *
 * A read-only view over the canonical engineering graph — there is no second
 * graph model and no second traversal engine here. This component owns
 * exactly one thing the graph API does not: which object is currently open,
 * and the back-stack that lets a user retrace how they got there. Every
 * relationship shown comes from `EngineeringGraphService` unchanged.
 */
export function TraceabilityView({ projectId }: { projectId: string }) {
  const project = useProject(projectId);
  const projectName = project.state.phase === "ready" ? project.state.data.name : null;
  const searchParams = useSearchParams();

  const [nodeType, setNodeType] = React.useState<TraceabilitySelectableNodeType | "">("");
  const [pendingObjectId, setPendingObjectId] = React.useState("");
  const [current, setCurrent] = React.useState<VisitedNode | null>(() => readLinkedRoot(searchParams));
  const [history, setHistory] = React.useState<VisitedNode[]>([]);

  const roots = useTraceabilityRoots(projectId, nodeType);

  if (project.state.phase === "error") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          guide="/traceability"
          title="Traceability"
          description="Trace real relationships between this project's engineering objects."
        />
        <div
          role="alert"
          className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
        >
          <p className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{describeApiError(project.state.error)}</span>
          </p>
          <Button variant="outline" size="sm" onClick={project.reload}>
            <RefreshCw aria-hidden="true" />
            Try again
          </Button>
        </div>
      </div>
    );
  }

  function openRoot(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!nodeType || !pendingObjectId || roots.state.phase !== "ready") return;
    const option = roots.state.data.find((candidate) => candidate.id === pendingObjectId);
    if (!option) return;

    setCurrent({ type: nodeType, id: option.id, identifier: option.identifier, label: option.label });
    setHistory([]);
  }

  function navigateTo(node: GraphNodeDto) {
    setCurrent((previous) => {
      if (previous) setHistory((stack) => [...stack, previous]);
      return { type: node.type, id: node.id, identifier: node.identifier, label: node.label };
    });
  }

  function jumpTo(index: number) {
    setHistory((stack) => {
      const target = stack[index];
      if (!target) return stack;
      setCurrent(target);
      return stack.slice(0, index);
    });
  }

  function goBack() {
    jumpTo(history.length - 1);
  }

  function startOver() {
    setCurrent(null);
    setHistory([]);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        guide="/traceability"
        title="Traceability"
        description={
          projectName
            ? `Trace real relationships across ${projectName}'s engineering objects.`
            : "Trace real relationships between this project's engineering objects."
        }
        actions={
          <Button asChild variant="outline">
            <Link href={`/projects/${projectId}/traceability/matrix`}>
              <Table2 aria-hidden="true" />
              Verification Coverage Matrix
            </Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Open an object</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={openRoot}
            className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_1fr_auto]"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="traceability-node-type">Object type</Label>
              <Select
                id="traceability-node-type"
                value={nodeType}
                onChange={(event) => {
                  setNodeType(event.target.value as TraceabilitySelectableNodeType | "");
                  setPendingObjectId("");
                }}
              >
                <option value="">Choose a type…</option>
                {TRACEABILITY_SELECTABLE_NODE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {graphNodeTypeLabel(type)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="traceability-object">Object</Label>
              {roots.state.phase === "loading" && nodeType ? (
                <LoadingState inline label="Loading objects…" />
              ) : (
                <Select
                  id="traceability-object"
                  value={pendingObjectId}
                  onChange={(event) => setPendingObjectId(event.target.value)}
                  disabled={!nodeType || roots.state.phase !== "ready" || roots.state.data.length === 0}
                >
                  <option value="">
                    {!nodeType
                      ? "Choose a type first"
                      : roots.state.phase === "ready" && roots.state.data.length === 0
                        ? "None in this project"
                        : "Choose…"}
                  </option>
                  {roots.state.phase === "ready" &&
                    roots.state.data.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.identifier ? `${option.identifier} — ${option.label}` : option.label}
                      </option>
                    ))}
                </Select>
              )}
            </div>

            <Button type="submit" disabled={!nodeType || !pendingObjectId}>
              Open
            </Button>
          </form>

          {roots.state.phase === "error" && nodeType && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {describeApiError(roots.state.error)}
            </p>
          )}
        </CardContent>
      </Card>

      {!current ? (
        <EmptyState
          icon={<Waypoints aria-hidden="true" />}
          title="Nothing open yet"
          description="Choose an object type and an object above to inspect its traceability."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <nav aria-label="Traceability path" className="flex flex-wrap items-center gap-1 text-sm">
            <Button variant="link" size="sm" className="h-auto p-0" onClick={startOver}>
              Start over
            </Button>
            {history.map((node, index) => (
              <React.Fragment key={`${node.type}:${node.id}`}>
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                <Button variant="link" size="sm" className="h-auto p-0" onClick={() => jumpTo(index)}>
                  {node.identifier ?? node.label}
                </Button>
              </React.Fragment>
            ))}
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="font-medium text-foreground" aria-current="location">
              {current.identifier ?? current.label}
            </span>
          </nav>

          <TraceabilityExplorer
            projectId={projectId}
            current={current}
            canGoBack={history.length > 0}
            onNavigate={navigateTo}
            onBack={goBack}
          />
        </div>
      )}
    </div>
  );
}
