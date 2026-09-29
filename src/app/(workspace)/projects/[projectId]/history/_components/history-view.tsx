"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw, Waypoints } from "lucide-react";
import { HISTORY_SOURCE_MODULES, type HistorySourceModule } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { useProject } from "@/lib/api/projects";
import { useProjectHistory } from "@/lib/api/engineering-history";
import { EngineeringHistoryTimeline } from "@/components/common/engineering-history-timeline";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";

const MODULE_LABELS: Record<HistorySourceModule, string> = {
  REQUIREMENT: "Requirements",
  STAKEHOLDER_NEED: "Stakeholder needs",
  DESIGN_ITEM: "Design items",
  DECISION: "Engineering decisions",
  RISK: "Risks",
  ISSUE: "Issues",
  EVIDENCE: "Evidence",
  CHANGE_MANAGEMENT: "Change management",
  VERIFICATION: "Verification",
  SUPPLIER: "Suppliers",
  BASELINE: "Configuration baselines",
  CERTIFICATION: "Certification",
  DRIFT: "Design / operations drift",
  TECHNICAL_READINESS: "Technical readiness",
  VERIFICATION_READINESS: "Verification readiness",
  SENTINEL: "Decision Sentinel",
};

/**
 * The project-level Engineering History workspace.
 *
 * A chronological read model over what other engines already recorded —
 * every filter here narrows a real, already-composed stream; nothing on
 * this page evaluates, detects, or writes anything. Pagination is a plain
 * "load more": the server owns the bound on how much any one request can
 * return.
 */
export function HistoryView({ projectId }: { projectId: string }) {
  const project = useProject(projectId);
  const projectName = project.state.phase === "ready" ? project.state.data.name : null;

  const [module, setModule] = React.useState<HistorySourceModule | "">("");
  const [objectType, setObjectType] = React.useState("");
  const [actorId, setActorId] = React.useState("");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [limit, setLimit] = React.useState(50);

  const { state, reload } = useProjectHistory(projectId, {
    module: module || undefined,
    objectType: objectType || undefined,
    actorId: actorId || undefined,
    from: from ? new Date(from).toISOString() : undefined,
    to: to ? new Date(to).toISOString() : undefined,
    limit,
  });

  const page = state.phase === "ready" ? state.data.page : null;
  const events = React.useMemo(
    () => (state.phase === "ready" ? state.data.events : []),
    [state],
  );

  const objectTypesPresent = React.useMemo(
    () => [...new Set(events.map((e) => e.sourceType))].sort(),
    [events],
  );
  const actorsPresent = React.useMemo(
    () => [...new Map(events.filter((e) => e.actorId).map((e) => [e.actorId!, e.actorName ?? e.actorId!])).entries()],
    [events],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        guide="/history"
        title="Engineering History"
        description={
          projectName
            ? `The chronological record of what happened to ${projectName}'s engineering objects.`
            : "The chronological record of what happened to this project's engineering objects."
        }
        actions={
          <Button asChild variant="outline">
            <Link href={`/projects/${projectId}/traceability`}>
              <Waypoints aria-hidden="true" />
              Open Traceability
            </Link>
          </Button>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="history-module">Module</Label>
              <Select
                id="history-module"
                value={module}
                onChange={(event) => setModule(event.target.value as HistorySourceModule | "")}
              >
                <option value="">All modules</option>
                {HISTORY_SOURCE_MODULES.map((value) => (
                  <option key={value} value={value}>
                    {MODULE_LABELS[value]}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="history-object-type">Object type</Label>
              <Select
                id="history-object-type"
                value={objectType}
                onChange={(event) => setObjectType(event.target.value)}
                disabled={objectTypesPresent.length === 0}
              >
                <option value="">All object types</option>
                {objectTypesPresent.map((value) => (
                  <option key={value} value={value}>
                    {value.replaceAll("_", " ")}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="history-actor">Actor</Label>
              <Select
                id="history-actor"
                value={actorId}
                onChange={(event) => setActorId(event.target.value)}
                disabled={actorsPresent.length === 0}
              >
                <option value="">Everyone</option>
                {actorsPresent.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="history-from">From</Label>
              <input
                id="history-from"
                type="date"
                value={from}
                onChange={(event) => setFrom(event.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-card px-2.5 py-1 text-sm shadow-sm"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="history-to">To</Label>
              <input
                id="history-to"
                type="date"
                value={to}
                onChange={(event) => setTo(event.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-card px-2.5 py-1 text-sm shadow-sm"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {state.phase === "loading" && <LoadingState label="Loading history…" />}

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

      {state.phase === "ready" && (
        <>
          <EngineeringHistoryTimeline
            events={events}
            emptyTitle="Nothing recorded yet"
            emptyDescription="No matching engineering events have been recorded for this project."
          />
          {page && (
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Showing {events.length} of {page.total}
              </span>
              {page.hasMore && (
                <Button variant="outline" size="sm" onClick={() => setLimit((value) => value + 50)}>
                  Load more
                </Button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
