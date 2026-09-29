"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, History, Radar, RefreshCw, ShieldAlert } from "lucide-react";
import type { SurveillanceSourceType, SurveillanceTargetType } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type SurveillanceTargetDto,
  acknowledgeSurveillance,
  detectSurveillance,
  reEvaluateSurveillance,
  resolveSurveillance,
  useOpenSurveillance,
  useSurveillanceHistory,
} from "@/lib/api/sentinel";
import { useProject } from "@/lib/api/projects";
import { PageHeader } from "@/components/common/page-header";
import { SurveillanceStatusBadge, SurveillanceTargetTypeBadge } from "@/components/common/sentinel-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Textarea } from "@/components/ui/textarea";
import { formatIsoDate } from "@/lib/utils";

/**
 * The Decision Sentinel workspace.
 *
 * A continuous-surveillance surface, not a notification inbox: every item
 * here names a real engineering source, a real dependent analysis/review
 * domain, and a real reason — never a fabricated risk score. Nothing here
 * evaluates on page load; detection, acknowledgement, resolution and
 * reevaluation are each an explicit action.
 */

const SOURCE_URL: Partial<Record<SurveillanceSourceType, (projectId: string, id: string) => string>> = {
  REQUIREMENT: (p, id) => `/projects/${p}/requirements/${id}`,
  DESIGN_ITEM: (p, id) => `/projects/${p}/design-items/${id}`,
  ENGINEERING_DECISION: (p, id) => `/projects/${p}/decisions/${id}`,
  VERIFICATION_ACTIVITY: (p, id) => `/projects/${p}/verification/${id}`,
  SUPPLIER: (p, id) => `/projects/${p}/suppliers/${id}`,
  SUPPLIED_ITEM: (p, id) => `/projects/${p}/supplied-items/${id}`,
  SUPPLIER_QUALIFICATION: (p, id) => `/projects/${p}/supplier-qualifications/${id}`,
  CHANGE_REQUEST: (p, id) => `/projects/${p}/changes/${id}`,
};

function sourceUrl(projectId: string, sourceType: SurveillanceSourceType, sourceId: string): string | null {
  const resolver = SOURCE_URL[sourceType];
  return resolver ? resolver(projectId, sourceId) : null;
}

const TARGET_URL: Record<SurveillanceTargetType, (projectId: string, targetId: string) => string> = {
  IMPACT_ANALYSIS: (p, id) => `/projects/${p}/changes/${id}`,
  ASSUMPTION_MONITORING: (p) => `/projects/${p}/decisions`,
  VERIFICATION_READINESS: (p, id) => `/projects/${p}/verification/${id}`,
  TECHNICAL_READINESS: (p) => `/projects/${p}`,
  DRIFT_ASSESSMENT: (p) => `/projects/${p}/drift`,
  CERTIFICATION_REVIEW: (p) => `/projects/${p}/certification/review`,
};

function targetUrl(projectId: string, targetType: SurveillanceTargetType, targetId: string): string {
  return TARGET_URL[targetType](projectId, targetId);
}

export function SentinelView({ projectId }: { projectId: string }) {
  const open = useOpenSurveillance(projectId);
  const history = useSurveillanceHistory(projectId);
  const project = useProject(projectId);
  const [isDetecting, setIsDetecting] = React.useState(false);
  const [detectError, setDetectError] = React.useState<string | null>(null);
  const [detectSummary, setDetectSummary] = React.useState<string | null>(null);
  const [showHistory, setShowHistory] = React.useState(false);

  const projectName = project.state.phase === "ready" ? project.state.data.name : null;

  async function handleDetect() {
    setIsDetecting(true);
    setDetectError(null);
    setDetectSummary(null);
    try {
      const summary = await detectSurveillance(projectId);
      setDetectSummary(
        `${summary.eventsCreated} change${summary.eventsCreated === 1 ? "" : "s"} detected — ${summary.targetsOpened} new signal${summary.targetsOpened === 1 ? "" : "s"} opened, ${summary.targetsUpdated} updated.`,
      );
      open.reload();
    } catch (error) {
      setDetectError(describeApiError(error));
    } finally {
      setIsDetecting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        guide="/sentinel"
        title="Decision Sentinel"
        description={
          projectName
            ? `Continuous engineering surveillance for ${projectName} — detects what changed and which analyses may need reevaluation. It never approves, rejects, or rewrites anything.`
            : "Continuous engineering surveillance — detects what changed and which analyses may need reevaluation. It never approves, rejects, or rewrites anything."
        }
        actions={
          <Button onClick={handleDetect} disabled={isDetecting}>
            <Radar aria-hidden="true" />
            {isDetecting ? "Detecting…" : "Run detection"}
          </Button>
        }
      />

      {detectError && <p className="text-destructive text-sm">{detectError}</p>}
      {detectSummary && <p className="text-muted-foreground text-sm" role="status">{detectSummary}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant={showHistory ? "outline" : "default"} size="sm" onClick={() => setShowHistory(false)}>
          <ShieldAlert aria-hidden="true" />
          Open &amp; acknowledged
        </Button>
        <Button variant={showHistory ? "default" : "outline"} size="sm" onClick={() => setShowHistory(true)}>
          <History aria-hidden="true" />
          Recently resolved
        </Button>
        <Button variant="outline" size="sm" onClick={() => (showHistory ? history.reload() : open.reload())}>
          <RefreshCw aria-hidden="true" />
          Refresh
        </Button>
      </div>

      {!showHistory && (
        <SurveillanceList
          projectId={projectId}
          resource={open}
          emptyTitle="No open surveillance"
          emptyDescription="Nothing currently needs reevaluation. Run detection after recording engineering changes to check again."
          onChanged={() => {
            open.reload();
            history.reload();
          }}
        />
      )}

      {showHistory && (
        <SurveillanceList
          projectId={projectId}
          resource={history}
          emptyTitle="No resolved or superseded signals yet"
          emptyDescription="Once a surveillance target is resolved or superseded, it appears here."
          readOnly
        />
      )}
    </div>
  );
}

function SurveillanceList({
  projectId,
  resource,
  emptyTitle,
  emptyDescription,
  onChanged,
  readOnly = false,
}: {
  projectId: string;
  resource: ReturnType<typeof useOpenSurveillance>;
  emptyTitle: string;
  emptyDescription: string;
  onChanged?: () => void;
  readOnly?: boolean;
}) {
  if (resource.state.phase === "loading") return <LoadingState label="Loading surveillance…" />;
  if (resource.state.phase === "error") {
    return (
      <EmptyState
        icon={<AlertTriangle aria-hidden="true" />}
        title="Could not load surveillance"
        description={describeApiError(resource.state.error)}
        action={<Button onClick={resource.reload}>Retry</Button>}
      />
    );
  }
  if (resource.state.data.length === 0) {
    return <EmptyState icon={<Radar aria-hidden="true" />} title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="flex flex-col gap-3">
      {resource.state.data.map((target) => (
        <SurveillanceItemCard
          key={target.id}
          projectId={projectId}
          target={target}
          readOnly={readOnly}
          onChanged={onChanged ?? (() => {})}
        />
      ))}
    </div>
  );
}

function SurveillanceItemCard({
  projectId,
  target,
  readOnly,
  onChanged,
}: {
  projectId: string;
  target: SurveillanceTargetDto;
  readOnly: boolean;
  onChanged: () => void;
}) {
  const [isBusy, setIsBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isResolveOpen, setIsResolveOpen] = React.useState(false);
  const targetHref = targetUrl(projectId, target.targetType, target.targetId);
  const sourceHref = target.sourceType ? sourceUrl(projectId, target.sourceType, target.sourceId ?? "") : null;

  async function handleAcknowledge() {
    setIsBusy(true);
    setError(null);
    try {
      await acknowledgeSurveillance(projectId, target.id);
      onChanged();
    } catch (acknowledgeError) {
      setError(describeApiError(acknowledgeError));
    } finally {
      setIsBusy(false);
    }
  }

  async function handleReevaluate() {
    setIsBusy(true);
    setError(null);
    try {
      await reEvaluateSurveillance(projectId, target.id);
      onChanged();
    } catch (reevaluateError) {
      setError(describeApiError(reevaluateError));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex flex-wrap items-center gap-2">
            <SurveillanceTargetTypeBadge targetType={target.targetType} />
            <SurveillanceStatusBadge status={target.status} />
          </CardTitle>
          <CardDescription>Potentially affects: {target.targetLabel}</CardDescription>
        </div>
        <span className="text-muted-foreground text-xs">Detected {formatIsoDate(target.detectedAt)}</span>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {target.sourceLabel && (
          <p className="text-sm">
            <span className="text-muted-foreground">Changed: </span>
            {target.sourceIdentifier ? `${target.sourceIdentifier} — ` : ""}
            {target.sourceLabel}
          </p>
        )}
        <p className="text-sm">{target.reason}</p>

        {target.status === "RESOLVED" && target.resolutionNote && (
          <p className="text-muted-foreground text-xs">Resolved: {target.resolutionNote}</p>
        )}
        {target.status === "SUPERSEDED" && (
          <p className="text-muted-foreground text-xs">Superseded by a newer surveillance signal on the same target.</p>
        )}
        {target.status === "ACKNOWLEDGED" && target.acknowledgementNote && (
          <p className="text-muted-foreground text-xs">Acknowledged: {target.acknowledgementNote}</p>
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}

        <div className="flex flex-wrap items-center gap-2">
          {sourceHref && (
            <Button variant="outline" size="sm" asChild>
              <Link href={sourceHref}>Open source object</Link>
            </Button>
          )}
          <Button variant="outline" size="sm" asChild>
            <Link href={targetHref}>Open affected {target.targetType === "IMPACT_ANALYSIS" ? "change" : "page"}</Link>
          </Button>
          {!readOnly && target.status === "OPEN" && (
            <Button variant="outline" size="sm" onClick={handleAcknowledge} disabled={isBusy}>
              Acknowledge
            </Button>
          )}
          {!readOnly && (target.status === "OPEN" || target.status === "ACKNOWLEDGED") && (
            <>
              <Button size="sm" onClick={handleReevaluate} disabled={isBusy}>
                Re-evaluate
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setIsResolveOpen(true)} disabled={isBusy}>
                Resolve
              </Button>
            </>
          )}
        </div>
      </CardContent>

      <ResolveDialog
        projectId={projectId}
        target={target}
        open={isResolveOpen}
        onOpenChange={setIsResolveOpen}
        onResolved={onChanged}
      />
    </Card>
  );
}

function ResolveDialog({
  projectId,
  target,
  open,
  onOpenChange,
  onResolved,
}: {
  projectId: string;
  target: SurveillanceTargetDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onResolved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Resolve surveillance signal</DialogTitle>
          <DialogDescription>
            Resolution requires objective evidence — a new current assessment, or an explicit note
            that no reevaluation is necessary. This is never silent.
          </DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so its fields always start blank — no reset effect. */}
        {open && (
          <ResolveForm
            projectId={projectId}
            targetId={target.id}
            onCancel={() => onOpenChange(false)}
            onResolved={() => {
              onResolved();
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResolveForm({
  projectId,
  targetId,
  onCancel,
  onResolved,
}: {
  projectId: string;
  targetId: string;
  onCancel: () => void;
  onResolved: () => void;
}) {
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || note.trim() === "") return;
    setIsSubmitting(true);
    setError(null);
    try {
      await resolveSurveillance(projectId, targetId, note);
      onResolved();
    } catch (submitError) {
      setError(describeApiError(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-4">
        {error && <p className="text-destructive text-sm">{error}</p>}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground text-xs">Note</span>
          <Textarea value={note} onChange={(event) => setNote(event.target.value)} disabled={isSubmitting} rows={3} required />
        </label>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || note.trim() === ""}>
          {isSubmitting ? "Resolving…" : "Resolve"}
        </Button>
      </DialogFooter>
    </form>
  );
}

export { sourceUrl };
