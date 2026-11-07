"use client";

import Link from "next/link";
import { AlertTriangle, ArrowLeft, RefreshCw, Waypoints } from "lucide-react";
import { graphNodeTypeLabel } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { useObjectHistory } from "@/lib/api/engineering-history";
import { EngineeringHistoryTimeline } from "@/components/common/engineering-history-timeline";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";

/**
 * One object's real history — its own audit trail, plus (for a change
 * request, a baseline, or a verification activity) the real assessment
 * history genuinely about it. The same `EngineeringHistoryTimeline` the
 * project-level workspace uses, so a reader sees one presentation either
 * way.
 */
export function ObjectHistoryView({
  projectId,
  objectType,
  objectId,
}: {
  projectId: string;
  objectType: string;
  objectId: string;
}) {
  const { state, reload } = useObjectHistory(projectId, objectType, objectId);

  if (state.phase === "loading") return <LoadingState label="Loading history…" />;

  if (state.phase === "error") {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Object History" />
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
      </div>
    );
  }

  const { object, events } = state.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={`History — ${object.identifier ?? object.label}`}
        description={`${graphNodeTypeLabel(object.type)}${object.identifier ? ` · ${object.label}` : ""}`}
        actions={
          <div className="flex flex-wrap gap-2">
            {object.href && (
              <Button variant="outline" asChild>
                <Link href={object.href}>
                  <ArrowLeft aria-hidden="true" />
                  Open source object
                </Link>
              </Button>
            )}
            <Button variant="outline" asChild>
              <Link href={`/projects/${projectId}/traceability`}>
                <Waypoints aria-hidden="true" />
                Open Traceability
              </Link>
            </Button>
          </div>
        }
      />

      <EngineeringHistoryTimeline
        events={events}
        emptyDescription="Nothing has been recorded against this object yet."
      />
    </div>
  );
}
