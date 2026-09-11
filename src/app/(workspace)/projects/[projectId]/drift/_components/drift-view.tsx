"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  CircleSlash,
  History,
  Play,
  ScrollText,
  TriangleAlert,
} from "lucide-react";
import type { DriftStatus } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type DriftFindingDto,
  type DriftReportDto,
  evaluateDrift,
  fetchDriftAssessment,
  hasDriftReport,
  useBaselines,
  useDriftHistory,
  useLatestDrift,
} from "@/lib/api/drift";
import {
  DriftCategoryBadge,
  DriftFindingStatusBadge,
  DriftFreshnessBadge,
  DriftStatusBadge,
  driftLabel,
} from "@/components/common/drift-badges";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatIsoDate } from "@/lib/utils";

/**
 * The drift workspace.
 *
 * **Nothing evaluates on load.** Choosing a baseline reads the latest recorded
 * assessment; it does not compute a new one. A drift result is a claim about a
 * moment, and quietly recomputing it would make "when did this diverge?"
 * unanswerable.
 *
 * There is no score anywhere on this page — no percentage, no "97% aligned", no
 * confidence. The verdict is one of three words and every finding names both
 * values it compared.
 */
export function DriftView({ projectId }: { projectId: string }) {
  const baselines = useBaselines(projectId);
  // `null` means the reader has not chosen; the active baseline is then used.
  // Derived rather than synced into state by an effect, so there is no render
  // in which the selector and the data it drives disagree.
  const [selected, setSelected] = React.useState<string | null>(null);
  const [historical, setHistorical] = React.useState<DriftReportDto | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const activeBaselineId =
    baselines.state.phase === "ready"
      ? (baselines.state.data.find((baseline) => baseline.status === "ACTIVE")?.id ?? "")
      : "";

  const baselineId = selected ?? activeBaselineId;
  const setBaselineId = setSelected;

  const latest = useLatestDrift(projectId, baselineId);
  const history = useDriftHistory(projectId, baselineId);

  async function handleEvaluate() {
    if (busy || baselineId === "") return;
    setBusy(true);
    setError(null);
    try {
      await evaluateDrift(projectId, baselineId);
      setHistorical(null);
      latest.reload();
      history.reload();
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function openHistorical(assessmentId: string) {
    setBusy(true);
    setError(null);
    try {
      setHistorical(await fetchDriftAssessment(projectId, assessmentId));
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  const shown =
    historical ??
    (latest.state.phase === "ready" && hasDriftReport(latest.state.data)
      ? latest.state.data
      : null);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Design / operations drift"
        description="Where the operational state that has since been recorded no longer matches the engineering basis that was approved."
      />

      <Card>
        <CardHeader>
          <CardTitle>Comparison</CardTitle>
          <CardDescription>
            Drift is measured against one baseline. Selecting one shows the last recorded
            assessment — it does not run a new one.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="drift-baseline"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Baseline
            </label>
            <Select
              id="drift-baseline"
              value={baselineId}
              onChange={(event) => {
                setBaselineId(event.target.value);
                setHistorical(null);
              }}
              disabled={busy || baselines.state.phase !== "ready"}
              className="w-80"
            >
              <option value="">
                {baselines.state.phase === "ready" && baselines.state.data.length === 0
                  ? "No baselines recorded"
                  : "Select a baseline…"}
              </option>
              {baselines.state.phase === "ready" &&
                baselines.state.data.map((baseline) => (
                  <option key={baseline.id} value={baseline.id}>
                    {baseline.identifier} — {baseline.name} ({driftLabel(baseline.status)})
                  </option>
                ))}
            </Select>
          </div>

          <Button onClick={handleEvaluate} disabled={busy || baselineId === ""}>
            <Play aria-hidden="true" />
            {busy ? "Evaluating…" : "Evaluate drift"}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      {baselines.state.phase === "ready" && baselines.state.data.length === 0 && (
        <EmptyState
          icon={<ScrollText aria-hidden="true" />}
          title="No baseline to compare against"
          description="Drift is the difference between an approved engineering basis and what has since been observed. Record and activate a baseline first."
          action={
            <Button asChild>
              <Link href={`/projects/${projectId}/baselines`}>Go to baselines</Link>
            </Button>
          }
        />
      )}

      {latest.state.phase === "loading" && baselineId !== "" && (
        <LoadingState label="Loading drift assessment…" />
      )}

      {latest.state.phase === "ready" &&
        !hasDriftReport(latest.state.data) &&
        historical === null &&
        baselineId !== "" && (
          <EmptyState
            icon={<CircleHelp aria-hidden="true" />}
            title="This baseline has not been evaluated for drift"
            description="Nothing has been compared yet. Evaluate to record what currently differs between the approved basis and what has been observed."
            action={
              <Button onClick={handleEvaluate} disabled={busy}>
                <Play aria-hidden="true" />
                Evaluate drift
              </Button>
            }
          />
        )}

      {shown && (
        <DriftReport
          projectId={projectId}
          report={shown}
          historical={historical !== null}
          busy={busy}
          onEvaluate={handleEvaluate}
        />
      )}

      {history.state.phase === "ready" && history.state.data.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="size-4" aria-hidden="true" />
              History
            </CardTitle>
            <CardDescription>
              Every evaluation is kept. Nothing is overwritten, so how the gap has moved over time
              stays readable.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Evaluated</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Review required</TableHead>
                  <TableHead>Version</TableHead>
                  <TableHead>Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {history.state.data.map((assessment) => (
                  <TableRow key={assessment.id}>
                    <TableCell
                      className="font-mono text-muted-foreground"
                      title={assessment.evaluatedAt}
                    >
                      {formatIsoDate(assessment.evaluatedAt)}
                    </TableCell>
                    <TableCell>
                      <DriftStatusBadge status={assessment.status} />
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      {assessment.summary.reviewRequired}
                    </TableCell>
                    <TableCell className="font-mono text-muted-foreground">
                      v{assessment.driftVersion}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => openHistorical(assessment.id)}
                      >
                        Open
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

const VERDICT_ICON: Record<DriftStatus, React.ComponentType<{ className?: string }>> = {
  NO_DRIFT: CheckCircle2,
  DRIFT_DETECTED: TriangleAlert,
  UNKNOWN: CircleHelp,
};

const VERDICT_TEXT: Record<DriftStatus, string> = {
  NO_DRIFT:
    "Every comparison this baseline supports was performed and none diverged. That is a statement about the records compared, not a guarantee about the product.",
  DRIFT_DETECTED:
    "At least one comparison diverged. The findings below name both values and what was read. This is not a finding that anything failed — whether a divergence matters is an engineering judgement.",
  UNKNOWN:
    "Nothing diverged, but at least one comparison could not be performed. Missing operators, absent values or mismatched units are reported rather than assumed away.",
};

function DriftReport({
  projectId,
  report,
  historical,
  busy,
  onEvaluate,
}: {
  projectId: string;
  report: DriftReportDto;
  historical: boolean;
  busy: boolean;
  onEvaluate: () => void;
}) {
  const { assessment, freshness, findings, basis } = report;
  const Icon = VERDICT_ICON[assessment.status];
  const isStale = freshness === "STALE";

  return (
    <div className="flex flex-col gap-5">
      {historical && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-border bg-secondary p-3 text-sm text-secondary-foreground"
        >
          <ScrollText className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>Viewing a historical assessment.</strong> It is shown exactly as it was
            recorded and cannot be edited.
          </span>
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <dt>Evaluated</dt>
            <dd className="font-mono text-foreground" title={assessment.evaluatedAt}>
              {formatIsoDate(assessment.evaluatedAt)}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt>Drift version</dt>
            <dd className="font-mono text-foreground">v{assessment.driftVersion}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt>State</dt>
            <dd>
              <DriftFreshnessBadge freshness={freshness} />
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt>Baseline</dt>
            <dd>
              <Link
                href={`/projects/${projectId}/baselines/${basis.baselineId}`}
                className="font-mono text-foreground underline-offset-4 hover:underline"
              >
                {basis.baselineIdentifier}
              </Link>
            </dd>
          </div>
        </dl>

        <Button size="sm" variant={isStale ? "default" : "outline"} disabled={busy} onClick={onEvaluate}>
          <Play aria-hidden="true" />
          {busy ? "Evaluating…" : isStale ? "Evaluate again" : "Evaluate drift"}
        </Button>
      </div>

      {isStale && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <CircleSlash className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>This drift assessment is stale.</strong> The baselined objects or the
            observations it compared have changed since. Nothing has been recomputed — evaluate
            again to see where things stand now.
          </span>
        </p>
      )}

      {freshness === "UNKNOWN" && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning"
        >
          <CircleHelp className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>Whether this assessment still holds could not be determined.</strong> It was
            produced by a different rule version, or its basis could not be resolved again. It is
            not being presented as current.
          </span>
        </p>
      )}

      <div
        role="group"
        aria-label="Drift verdict"
        className="flex flex-col gap-2 rounded-lg border border-border p-4"
      >
        <div className="flex flex-wrap items-center gap-3">
          <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <DriftStatusBadge status={assessment.status} />
          <span className="text-sm text-muted-foreground">
            {basis.baselineIdentifier} — {basis.baselineName}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{VERDICT_TEXT[assessment.status]}</p>
      </div>

      {/* Counts of comparison outcomes — not a score */}
      <dl aria-label="Drift finding counts" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CountTile label="Review required" value={assessment.summary.reviewRequired} />
        <CountTile label="Unknown" value={assessment.summary.unknown} />
        <CountTile label="Informational" value={assessment.summary.informational} />
        <CountTile label="Compared" value={basis.members.length} />
      </dl>

      {findings.length === 0 ? (
        <p className="text-sm text-muted-foreground">This assessment recorded no findings.</p>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Findings</CardTitle>
            <CardDescription>
              Each is a deterministic comparison. Both values are shown so a reader can repeat it
              by hand.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Rule</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead>Expected</TableHead>
                  <TableHead>Observed</TableHead>
                  <TableHead>Explanation</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {findings.map((finding) => (
                  <FindingRow key={finding.id} projectId={projectId} finding={finding} />
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FindingRow({
  projectId,
  finding,
}: {
  projectId: string;
  finding: DriftFindingDto;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <>
      <TableRow>
        <TableCell className="font-mono text-xs">{finding.ruleId}</TableCell>
        <TableCell>
          <DriftCategoryBadge category={finding.category} />
        </TableCell>
        <TableCell>
          <DriftFindingStatusBadge status={finding.status} />
        </TableCell>
        <TableCell className="max-w-xs whitespace-normal text-sm">
          {finding.baselineSubject ? (
            <span>
              {finding.baselineSubject.identifier && (
                <span className="font-mono">{finding.baselineSubject.identifier} — </span>
              )}
              {finding.baselineSubject.label}
            </span>
          ) : finding.observationSubject ? (
            <span>
              <span className="font-mono">{finding.observationSubject.identifier} — </span>
              {finding.observationSubject.label}
            </span>
          ) : (
            <span className="text-muted-foreground">Project</span>
          )}
        </TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">
          {finding.expectedValue ?? "—"}
        </TableCell>
        <TableCell className="font-mono text-xs text-muted-foreground">
          {finding.observedValue ?? "—"}
        </TableCell>
        <TableCell className="max-w-md whitespace-normal text-sm">
          <div className="flex flex-col items-start gap-1">
            <span>{finding.explanation}</span>
            <Button
              variant="ghost"
              size="sm"
              aria-expanded={open}
              aria-label={`Inspect basis for ${finding.ruleId}`}
              onClick={() => setOpen(!open)}
            >
              <ChevronRight aria-hidden="true" />
              {open ? "Hide basis" : "Inspect basis"}
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {open && (
        <TableRow>
          <TableCell colSpan={7} className="bg-secondary/40">
            <div className="flex flex-col gap-2 py-2 text-xs">
              <div>
                <span className="font-medium text-foreground">Read from: </span>
                <span className="text-muted-foreground">
                  {finding.basis.map((marker) => marker.replaceAll("_", " ").toLowerCase()).join(", ")}
                </span>
              </div>
              {finding.baselineSubject && (
                <div>
                  <span className="font-medium text-foreground">Baseline subject: </span>
                  <SubjectLink projectId={projectId} subject={finding.baselineSubject} />
                </div>
              )}
              {finding.observationSubject && (
                <div>
                  <span className="font-medium text-foreground">Observation: </span>
                  <SubjectLink projectId={projectId} subject={finding.observationSubject} />
                </div>
              )}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/**
 * Links a subject to its own page where one exists.
 *
 * Types with no detail route render as plain text rather than a dead link — a
 * fabricated link is worse than none.
 */
function SubjectLink({
  projectId,
  subject,
}: {
  projectId: string;
  subject: { type: string; id: string; identifier: string | null; label: string };
}) {
  const ROUTES: Record<string, string> = {
    REQUIREMENT: "requirements",
    DESIGN_ITEM: "design-items",
    ENGINEERING_DECISION: "decisions",
    VERIFICATION_ACTIVITY: "verification",
    SUPPLIED_ITEM: "supplied-items",
  };

  const segment = ROUTES[subject.type];
  const text = `${subject.identifier ? `${subject.identifier} — ` : ""}${subject.label}`;

  if (!segment) {
    return (
      <span className="text-muted-foreground">
        {text} ({driftLabel(subject.type)})
      </span>
    );
  }

  return (
    <Link
      href={`/projects/${projectId}/${segment}/${subject.id}`}
      className="text-foreground underline-offset-4 hover:underline"
    >
      {text}
    </Link>
  );
}

function CountTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="font-mono text-lg text-foreground">{value}</dd>
    </div>
  );
}
