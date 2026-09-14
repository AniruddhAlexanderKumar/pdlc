"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ChevronRight, Info, Play, RefreshCw } from "lucide-react";
import type { ImpactClassification } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type ImpactAnalysisReportDto,
  type ImpactFindingDto,
  hasAnalysis,
  runImpactAnalysis,
  useLatestImpactAnalysis,
} from "@/lib/api/changes";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIsoDate } from "@/lib/utils";

/**
 * The computed-impact workspace.
 *
 * Everything shown here comes from a stored analysis. Nothing is derived in the
 * browser, nothing is estimated, and no number appears that the server did not
 * count. When no analysis has been run the panel says so — it does not render
 * zeroes, because "we looked and found nothing" is a far stronger claim than
 * "nobody has looked".
 */

const CLASSIFICATION_LABELS: Record<ImpactClassification, string> = {
  DIRECT: "Direct",
  DOWNSTREAM: "Downstream",
  CROSS_DOMAIN: "Cross-domain",
  UPSTREAM_CONTEXT: "Context",
  UNKNOWN: "Unknown",
};

const CLASSIFICATION_VARIANTS: Record<
  ImpactClassification,
  "success" | "info" | "secondary" | "outline" | "destructive"
> = {
  DIRECT: "success",
  CROSS_DOMAIN: "info",
  DOWNSTREAM: "secondary",
  UPSTREAM_CONTEXT: "outline",
  UNKNOWN: "destructive",
};

const STATUS_LABELS: Record<string, string> = {
  POTENTIALLY_AFFECTED: "Potentially affected",
  NOT_EVALUATED: "Not evaluated",
  UNKNOWN: "Unknown",
};

/** Where a node type lives in the workspace, when it has a page of its own. */
const NODE_ROUTES: Record<string, string> = {
  REQUIREMENT: "requirements",
  DESIGN_ITEM: "design-items",
  VERIFICATION_ACTIVITY: "verification",
  ENGINEERING_DECISION: "decisions",
  STAKEHOLDER_NEED: "stakeholder-needs",
  CHANGE_REQUEST: "changes",
};

const NODE_TYPE_LABELS: Record<string, string> = {
  PROJECT: "Project",
  STAKEHOLDER_NEED: "Stakeholder need",
  REQUIREMENT: "Requirement",
  ENGINEERING_DECISION: "Decision",
  DECISION_ALTERNATIVE: "Alternative",
  DECISION_ASSUMPTION: "Assumption",
  DECISION_EXPECTATION: "Expectation",
  DESIGN_ITEM: "Design item",
  INTERFACE_DEFINITION: "Interface",
  VERIFICATION_ACTIVITY: "Verification",
  RISK: "Risk",
  ISSUE: "Issue",
  CHANGE_REQUEST: "Change request",
  EVIDENCE: "Evidence",
  APPROVAL: "Approval",
};

function nodeTypeLabel(type: string): string {
  return NODE_TYPE_LABELS[type] ?? type;
}

/** Human wording for a basis marker, without softening what it does not claim. */
function basisLabel(marker: string): string {
  return marker.toLowerCase().replaceAll("_", " ");
}

export function ImpactAnalysisPanel({
  projectId,
  changeId,
}: {
  projectId: string;
  changeId: string;
}) {
  const { state, reload } = useLatestImpactAnalysis(projectId, changeId);
  const [isRunning, setIsRunning] = React.useState(false);
  const [runError, setRunError] = React.useState<string | null>(null);
  const [openFindingId, setOpenFindingId] = React.useState<string | null>(null);

  async function run() {
    if (isRunning) return;
    setRunError(null);
    setIsRunning(true);

    try {
      await runImpactAnalysis(projectId, changeId);
      // Re-read rather than trusting the response: the panel should show what
      // the server will return next time, including freshness.
      reload();
    } catch (error) {
      setRunError(describeApiError(error));
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Computed impact</CardTitle>
        <CardDescription>
          What the engine reached by walking the engineering graph from this change&apos;s declared
          scope. Reachable is not the same as broken.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {runError && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{runError}</span>
          </div>
        )}

        {state.phase === "loading" && <LoadingState label="Loading impact analysis…" />}

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

        {state.phase === "ready" &&
          (hasAnalysis(state.data) ? (
            <AnalysisResult
              projectId={projectId}
              report={state.data}
              busy={isRunning}
              onRun={run}
              openFindingId={openFindingId}
              onToggleFinding={(id) => setOpenFindingId((current) => (current === id ? null : id))}
            />
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-muted-foreground">
                No impact analysis has been run. Nothing has been computed for this change, and no
                downstream effect should be inferred from its declared scope alone.
              </p>
              <Button size="sm" disabled={isRunning} onClick={run}>
                <Play aria-hidden="true" />
                {isRunning ? "Running…" : "Run impact analysis"}
              </Button>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}

function AnalysisResult({
  projectId,
  report,
  busy,
  onRun,
  openFindingId,
  onToggleFinding,
}: {
  projectId: string;
  report: ImpactAnalysisReportDto;
  busy: boolean;
  onRun: () => void;
  openFindingId: string | null;
  onToggleFinding: (id: string) => void;
}) {
  const { analysis, freshness, findings } = report;
  const isStale = freshness === "STALE";

  return (
    <div className="flex flex-col gap-5">
      {/* Controls and provenance of the run itself */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <dt>Run</dt>
            <dd className="font-mono text-foreground" title={analysis.startedAt}>
              {formatIsoDate(analysis.startedAt)}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt>Engine</dt>
            <dd className="font-mono text-foreground">v{analysis.engineVersion}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt>State</dt>
            <dd>
              <Badge variant={isStale ? "destructive" : "success"}>
                {isStale ? "Stale" : "Current"}
              </Badge>
            </dd>
          </div>
        </dl>

        <Button size="sm" variant={isStale ? "default" : "outline"} disabled={busy} onClick={onRun}>
          <Play aria-hidden="true" />
          {busy ? "Running…" : "Run new analysis"}
        </Button>
      </div>

      {isStale && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>Analysis is stale.</strong> The engineering graph changed after this analysis
            was run, so these findings may no longer describe the current state. Nothing has been
            recomputed — run a new analysis to see where the change reaches now.
          </span>
        </p>
      )}

      {analysis.status === "FAILED" && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{analysis.failureReason ?? "This analysis did not complete."}</span>
        </p>
      )}

      {analysis.limits.truncated && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            This analysis stopped at its{" "}
            {analysis.limits.truncatedBy === "MAX_DEPTH"
              ? `depth limit of ${analysis.limits.maxDepth}`
              : "size limit"}
            , so the result is partial. Objects beyond that point were not examined.
          </span>
        </p>
      )}

      {/* Counts, every one of them from the server */}
      <dl
        aria-label="Impact summary"
        className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
      >
        <SummaryTile label="Declared" value={analysis.summary.declaredImpacts} />
        <SummaryTile label="Direct" value={analysis.summary.direct} />
        <SummaryTile label="Downstream" value={analysis.summary.downstream} />
        <SummaryTile label="Cross-domain" value={analysis.summary.crossDomain} />
        <SummaryTile label="Not evaluated" value={analysis.summary.notEvaluated} />
        <SummaryTile label="Unknown" value={analysis.summary.unknown} />
      </dl>

      {findings.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This analysis reached nothing beyond the change&apos;s declared scope.
        </p>
      ) : (
        <>
          <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>
              No fabricated number appears anywhere on this page — no score, no 1–10 rating, no
              percentage. Classification and the real path below are what the engine actually
              knows; anything more precise than that would be invented.
            </span>
          </p>
          <Table>
            <TableCaption className="sr-only">
              Objects this analysis reached, strongest classification first.
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>Object</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Classification</TableHead>
                <TableHead>Depth</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Why</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {findings.map((finding) => (
                <React.Fragment key={finding.id}>
                  <TableRow>
                    <TableCell className="font-mono">
                      <FindingLink projectId={projectId} finding={finding} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {nodeTypeLabel(finding.node.type)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={CLASSIFICATION_VARIANTS[finding.classification]}>
                        {CLASSIFICATION_LABELS[finding.classification]}
                      </Badge>
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {finding.depth}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {STATUS_LABELS[finding.status] ?? finding.status}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-expanded={openFindingId === finding.id}
                        onClick={() => onToggleFinding(finding.id)}
                      >
                        <ChevronRight aria-hidden="true" />
                        {finding.depth === 0 ? "Declared" : `${finding.path.length} hop path`}
                      </Button>
                    </TableCell>
                  </TableRow>

                  {openFindingId === finding.id && (
                    <TableRow>
                      <TableCell colSpan={6} className="bg-muted/30">
                        <FindingProvenance finding={finding} />
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </>
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border p-3">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-mono text-lg text-foreground">{value}</dd>
    </div>
  );
}

/** Links to the affected object where the workspace has a page for its type. */
function FindingLink({ projectId, finding }: { projectId: string; finding: ImpactFindingDto }) {
  const segment = NODE_ROUTES[finding.node.type];
  const text = finding.identifier ?? finding.label;

  if (!segment) {
    return <span title={finding.label}>{text}</span>;
  }

  return (
    <Link
      href={`/projects/${projectId}/${segment}/${finding.node.id}`}
      title={finding.label}
      className="font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {text}
    </Link>
  );
}

/**
 * Why this object is in the report: the actual path walked, and what the engine
 * deliberately did not decide about it.
 */
function FindingProvenance({ finding }: { finding: ImpactFindingDto }) {
  return (
    <div className="flex flex-col gap-3 py-2">
      <div className="flex flex-col gap-1.5">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Path</h4>
        {finding.path.length === 0 ? (
          <p className="text-sm">Declared directly on this change. No traversal was involved.</p>
        ) : (
          <ol className="flex flex-col gap-1 text-sm">
            {finding.path.map((step, index) => (
              <li
                key={`${step.relationshipId}-${index}`}
                className="flex flex-wrap items-center gap-2"
              >
                <span className="text-muted-foreground">{index + 1}.</span>
                <span>{nodeTypeLabel(step.from.type)}</span>
                <ChevronRight className="size-3 text-muted-foreground" aria-hidden="true" />
                <span>{nodeTypeLabel(step.to.type)}</span>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {step.edgeType}
                  {step.traversed === "REVERSE" ? " (reverse)" : ""}
                </code>
              </li>
            ))}
          </ol>
        )}
      </div>

      {finding.alternatePathCount > 0 && (
        <p className="text-xs text-muted-foreground">
          Reached by {finding.alternatePathCount} other path
          {finding.alternatePathCount === 1 ? "" : "s"}; the shortest is shown.
        </p>
      )}

      <div className="flex flex-col gap-1.5">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Basis</h4>
        <ul className="flex flex-wrap gap-1.5">
          {finding.basis.map((marker) => (
            <li key={marker}>
              <Badge variant="outline">{basisLabel(marker)}</Badge>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
