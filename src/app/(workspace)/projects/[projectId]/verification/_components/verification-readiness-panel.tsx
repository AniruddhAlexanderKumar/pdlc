"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ChevronRight,
  CircleSlash,
  Info,
  Play,
  RefreshCw,
  ScrollText,
} from "lucide-react";
import { readinessRule } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type VerificationReadinessAssessmentDto,
  type VerificationReadinessFindingDto,
  type VerificationReadinessReportDto,
  evaluateVerificationReadiness,
  fetchVerificationReadinessAssessment,
  hasReadinessAssessment,
  useLatestVerificationReadiness,
  useVerificationReadinessHistory,
} from "@/lib/api/verification-readiness";
import {
  ReadinessFindingBadge,
  ReadinessFreshnessBadge,
  ReadinessStatusBadge,
  readinessBasisMarkerLabel,
  readinessBasisRoleLabel,
  readinessCategoryLabel,
  readinessScopeLabel,
  readinessStatusLabel,
} from "@/components/common/readiness-badges";
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
 * The verification-readiness workspace.
 *
 * Everything shown here comes from a stored assessment. Nothing is derived in
 * the browser, nothing is estimated, and no number appears that the server did
 * not count. There is no percentage and no progress bar, because readiness has
 * three states and a list of reasons — a figure would be read as a measurement
 * of something nobody measured.
 *
 * When nothing has been evaluated the panel says so rather than rendering
 * zeroes: "we assessed this and found nothing wrong" is a far stronger claim
 * than "nobody has assessed it".
 */

/** Where a subject type lives in the workspace, when it has a page of its own. */
const SUBJECT_ROUTES: Record<string, string> = {
  REQUIREMENT: "requirements",
  DESIGN_ITEM: "design-items",
  VERIFICATION_ACTIVITY: "verification",
  ENGINEERING_DECISION: "decisions",
  STAKEHOLDER_NEED: "stakeholder-needs",
  CHANGE_REQUEST: "changes",
};

const SUBJECT_TYPE_LABELS: Record<string, string> = {
  REQUIREMENT: "Requirement",
  DESIGN_ITEM: "Design item",
  ENGINEERING_DECISION: "Decision",
  DECISION_ASSUMPTION: "Assumption",
  VERIFICATION_ACTIVITY: "Verification",
  CHANGE_REQUEST: "Change request",
  EVIDENCE: "Evidence",
};

function subjectTypeLabel(type: string): string {
  return SUBJECT_TYPE_LABELS[type] ?? type;
}

export function VerificationReadinessPanel({
  projectId,
  activityId,
}: {
  projectId: string;
  activityId: string;
}) {
  const latest = useLatestVerificationReadiness(projectId, activityId);
  const history = useVerificationReadinessHistory(projectId, activityId);

  const [isEvaluating, setIsEvaluating] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [openFindingId, setOpenFindingId] = React.useState<string | null>(null);

  // A historical assessment being inspected, loaded on demand. Null means the
  // panel is showing the latest one.
  const [viewing, setViewing] = React.useState<VerificationReadinessReportDto | null>(null);
  const [viewingId, setViewingId] = React.useState<string | null>(null);
  const [viewError, setViewError] = React.useState<string | null>(null);

  const reloadLatest = latest.reload;
  const reloadHistory = history.reload;

  async function evaluate() {
    if (isEvaluating) return;
    setActionError(null);
    setIsEvaluating(true);

    try {
      await evaluateVerificationReadiness(projectId, activityId);
      // Re-read rather than trusting the response, so the panel shows what the
      // server will return next time — freshness included.
      setViewing(null);
      setViewingId(null);
      reloadLatest();
      reloadHistory();
    } catch (error) {
      setActionError(describeApiError(error));
    } finally {
      setIsEvaluating(false);
    }
  }

  async function openHistorical(assessmentId: string) {
    setViewError(null);
    setOpenFindingId(null);

    if (viewingId === assessmentId) {
      setViewing(null);
      setViewingId(null);
      return;
    }

    try {
      const report = await fetchVerificationReadinessAssessment(projectId, assessmentId);
      setViewing(report);
      setViewingId(assessmentId);
    } catch (error) {
      setViewError(describeApiError(error));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Verification readiness</CardTitle>
        <CardDescription>
          Whether this activity can be executed or concluded responsibly given the engineering
          state that is actually recorded. This is not a result — a ready activity has not
          passed, and a not-ready one has not failed.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <ReadinessVersusResult />

        {actionError && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{actionError}</span>
          </p>
        )}

        {latest.state.phase === "loading" && <LoadingState label="Loading readiness…" />}

        {latest.state.phase === "error" && (
          <div
            role="alert"
            className="flex flex-col items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
          >
            <p className="flex items-start gap-2 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{describeApiError(latest.state.error)}</span>
            </p>
            <Button variant="outline" size="sm" onClick={reloadLatest}>
              <RefreshCw aria-hidden="true" />
              Try again
            </Button>
          </div>
        )}

        {latest.state.phase === "ready" &&
          (hasReadinessAssessment(latest.state.data) ? (
            <AssessmentReport
              projectId={projectId}
              report={viewing ?? latest.state.data}
              historical={viewing !== null}
              busy={isEvaluating}
              onEvaluate={evaluate}
              openFindingId={openFindingId}
              onToggleFinding={(id) =>
                setOpenFindingId((current) => (current === id ? null : id))
              }
            />
          ) : (
            <div className="flex flex-col items-start gap-3">
              <p className="text-sm text-muted-foreground">
                No verification-readiness assessment has been run. Nothing has been evaluated for
                this activity, and no conclusion about whether it can be executed should be drawn
                from its lifecycle state alone.
              </p>
              <Button size="sm" disabled={isEvaluating} onClick={evaluate}>
                <Play aria-hidden="true" />
                {isEvaluating ? "Evaluating…" : "Evaluate readiness"}
              </Button>
            </div>
          ))}

        {viewError && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{viewError}</span>
          </p>
        )}

        <ReadinessHistory
          state={history.state}
          viewingId={viewingId}
          latestId={
            latest.state.phase === "ready" && hasReadinessAssessment(latest.state.data)
              ? latest.state.data.assessment.id
              : null
          }
          onOpen={openHistorical}
        />
      </CardContent>
    </Card>
  );
}

/**
 * The distinction the whole feature rests on, stated where it is read.
 *
 * Kept as prose on the page rather than as a tooltip, because a reader who does
 * not already know the difference is exactly the reader who will not hover.
 */
function ReadinessVersusResult() {
  return (
    <dl
      aria-label="Readiness compared with verification result"
      className="grid grid-cols-1 gap-3 rounded-lg border border-border bg-muted/30 p-3 text-sm sm:grid-cols-2"
    >
      <div className="flex flex-col gap-0.5">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Verification readiness
        </dt>
        <dd className="text-foreground">
          Can this activity be executed or closed responsibly, given the current engineering
          state?
        </dd>
      </div>
      <div className="flex flex-col gap-0.5">
        <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Verification result
        </dt>
        <dd className="text-foreground">
          What happened when the verification was performed — the activity&apos;s own lifecycle
          status. Readiness never sets it.
        </dd>
      </div>
    </dl>
  );
}

function AssessmentReport({
  projectId,
  report,
  historical,
  busy,
  onEvaluate,
  openFindingId,
  onToggleFinding,
}: {
  projectId: string;
  report: VerificationReadinessReportDto;
  historical: boolean;
  busy: boolean;
  onEvaluate: () => void;
  openFindingId: string | null;
  onToggleFinding: (id: string) => void;
}) {
  const { assessment, freshness, findings, basis } = report;
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
            recorded and cannot be edited. Select it again in the history below to return to the
            most recent one.
          </span>
        </p>
      )}

      {/* Controls and provenance of the assessment itself */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <dl className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <dt>Last evaluated</dt>
            <dd className="font-mono text-foreground" title={assessment.evaluatedAt}>
              {formatIsoDate(assessment.evaluatedAt)}
            </dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt>Readiness version</dt>
            <dd className="font-mono text-foreground">v{assessment.readinessVersion}</dd>
          </div>
          <div className="flex items-center gap-1.5">
            <dt>State</dt>
            <dd>
              <ReadinessFreshnessBadge freshness={freshness} />
            </dd>
          </div>
        </dl>

        <Button
          size="sm"
          variant={isStale ? "default" : "outline"}
          disabled={busy}
          onClick={onEvaluate}
        >
          <Play aria-hidden="true" />
          {busy ? "Evaluating…" : isStale ? "Evaluate again" : "Evaluate readiness"}
        </Button>
      </div>

      {isStale && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <CircleSlash className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>Readiness assessment is stale.</strong> The engineering basis changed after
            this assessment was created, so its findings may no longer describe the current
            state. Nothing has been recomputed — evaluate again to see where readiness stands
            now.
          </span>
        </p>
      )}

      {freshness === "UNKNOWN" && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>Whether this assessment still holds could not be determined.</strong> It was
            produced by a different rule version, or its basis could not be read back. It is not
            being presented as current.
          </span>
        </p>
      )}

      {/* The verdict */}
      <div
        role="group"
        aria-label="Readiness verdict"
        className="flex flex-col gap-2 rounded-lg border border-border p-4"
      >
        <div className="flex flex-wrap items-center gap-3">
          <ReadinessStatusBadge status={assessment.status} />
          <span className="text-sm text-muted-foreground">
            {readinessScopeLabel(assessment.scope)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {assessment.status === "READY"
            ? "Every blocking condition in the rule registry was evaluated and none applies. This says the activity can proceed — not that it has passed."
            : assessment.status === "NOT_READY"
              ? "At least one blocking condition applies. The findings below name each one, the record it was read from, and the object it concerns."
              : "No blocking condition applies, but at least one condition could not be determined from the record. Readiness is not being claimed on information that is missing."}
        </p>
      </div>

      {/* Counts of rule outcomes — not a score */}
      <dl
        aria-label="Readiness finding counts"
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
      >
        <CountTile label="Blocking" value={assessment.summary.blocking} />
        <CountTile label="Warnings" value={assessment.summary.warning} />
        <CountTile label="Unknown" value={assessment.summary.unknown} />
        <CountTile label="Information" value={assessment.summary.informational} />
      </dl>

      {findings.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          This assessment recorded no findings.
        </p>
      ) : (
        <Table>
          <TableCaption className="sr-only">
            Conditions this assessment evaluated, blocking first.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>Rule</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Explanation</TableHead>
              <TableHead>Basis</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {findings.map((finding) => (
              <React.Fragment key={finding.id}>
                <TableRow>
                  <TableCell className="font-mono whitespace-nowrap">{finding.ruleId}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {readinessCategoryLabel(finding.category)}
                  </TableCell>
                  <TableCell>
                    <ReadinessFindingBadge status={finding.status} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <SubjectLink projectId={projectId} finding={finding} />
                  </TableCell>
                  <TableCell className="max-w-lg whitespace-normal text-sm">
                    {finding.message}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-expanded={openFindingId === finding.id}
                      onClick={() => onToggleFinding(finding.id)}
                    >
                      <ChevronRight aria-hidden="true" />
                      Why
                    </Button>
                  </TableCell>
                </TableRow>

                {openFindingId === finding.id && (
                  <TableRow>
                    <TableCell colSpan={6} className="bg-muted/30">
                      <FindingRationale finding={finding} />
                    </TableCell>
                  </TableRow>
                )}
              </React.Fragment>
            ))}
          </TableBody>
        </Table>
      )}

      <ReadinessBasis projectId={projectId} basis={basis} />
    </div>
  );
}

function CountTile({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-lg border border-border p-3">
      <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="font-mono text-lg text-foreground">{value}</dd>
    </div>
  );
}

/** Links to the affected object where the workspace has a page for its type. */
function SubjectLink({
  projectId,
  finding,
}: {
  projectId: string;
  finding: VerificationReadinessFindingDto;
}) {
  const segment = SUBJECT_ROUTES[finding.subjectType];
  const text = finding.subjectIdentifier ?? subjectTypeLabel(finding.subjectType);

  if (!segment) {
    return (
      <span title={finding.subjectLabel} className="text-muted-foreground">
        {text}
      </span>
    );
  }

  return (
    <Link
      href={`/projects/${projectId}/${segment}/${finding.subjectId}`}
      title={finding.subjectLabel}
      className="font-mono font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {text}
    </Link>
  );
}

/**
 * The rule behind a finding, as the registry defines it.
 *
 * The rule text comes from the shared domain registry rather than being sent
 * with each row. A finding written under an older version whose rule no longer
 * exists still shows its recorded message — which is the authoritative
 * explanation — and says the definition is unavailable rather than inventing
 * one.
 */
function FindingRationale({ finding }: { finding: VerificationReadinessFindingDto }) {
  const rule = readinessRule(finding.ruleId);

  return (
    <div className="flex flex-col gap-3 py-2">
      <div className="flex flex-col gap-1">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Rule {finding.ruleId}
        </h4>
        {rule ? (
          <>
            <p className="text-sm text-foreground">{rule.description}</p>
            <p className="text-sm text-muted-foreground">
              <span className="font-medium">Condition:</span> {rule.condition}
            </p>
            <p className="text-sm text-muted-foreground">{rule.rationale}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            This finding was recorded under a rule version this build no longer defines. Its
            recorded explanation above is the authoritative statement of what was concluded.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Read from
        </h4>
        <ul className="flex flex-wrap gap-1.5">
          {finding.basis.map((marker) => (
            <li key={marker}>
              <Badge variant="outline">{readinessBasisMarkerLabel(marker)}</Badge>
            </li>
          ))}
        </ul>
      </div>

      <p className="text-xs text-muted-foreground">
        Affected object: {subjectTypeLabel(finding.subjectType)}{" "}
        {finding.subjectIdentifier ? `${finding.subjectIdentifier} — ` : ""}
        {finding.subjectLabel}
      </p>
    </div>
  );
}

/**
 * What the evaluation actually looked at.
 *
 * Every entry is a real record reached through a real relationship row; the
 * chain is the one the graph walked, not an illustration of one. Objects the
 * walk never reached do not appear, which is the point — a basis a reader
 * cannot check is not a basis.
 */
function ReadinessBasis({
  projectId,
  basis,
}: {
  projectId: string;
  basis: VerificationReadinessReportDto["basis"];
}) {
  const [open, setOpen] = React.useState(false);

  const grouped = React.useMemo(() => {
    const byRole = new Map<string, typeof basis.objects>();
    for (const object of basis.objects) {
      const list = byRole.get(object.role) ?? [];
      list.push(object);
      byRole.set(object.role, list);
    }
    return [...byRole.entries()];
  }, [basis]);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-medium text-foreground">Engineering basis</h3>
          <p className="text-xs text-muted-foreground">
            The records this assessment read, and the relationship rows it reached them through.
          </p>
        </div>
        <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
          <ChevronRight aria-hidden="true" />
          {open ? "Hide basis" : `Inspect basis (${basis.objects.length})`}
        </Button>
      </div>

      {open && (
        <div className="flex flex-col gap-4">
          {grouped.map(([role, objects]) => (
            <div key={role} className="flex flex-col gap-1.5">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {readinessBasisRoleLabel(role as never)}
              </h4>
              <ul className="flex flex-col divide-y divide-border">
                {objects.map((object) => {
                  const segment = SUBJECT_ROUTES[object.type];
                  return (
                    <li
                      key={`${object.type}:${object.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        {segment ? (
                          <Link
                            href={`/projects/${projectId}/${segment}/${object.id}`}
                            className="text-foreground underline-offset-4 hover:underline"
                          >
                            <span className="font-mono">
                              {object.identifier ?? subjectTypeLabel(object.type)}
                            </span>{" "}
                            — {object.label}
                          </Link>
                        ) : (
                          <span className="text-foreground">{object.label}</span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {object.state ? object.state.replaceAll("_", " ").toLowerCase() : "—"}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {basis.changes.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Change impact considered
              </h4>
              <ul className="flex flex-col divide-y divide-border">
                {basis.changes.map((change) => (
                  <li
                    key={change.changeRequestId}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                  >
                    <Link
                      href={`/projects/${projectId}/changes/${change.changeRequestId}`}
                      className="min-w-0 truncate text-foreground underline-offset-4 hover:underline"
                    >
                      <span className="font-mono">{change.identifier ?? "Change"}</span> —{" "}
                      {change.title}
                    </Link>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      impact analysis: {change.analysisFreshness.replaceAll("_", " ").toLowerCase()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Relationships walked ({basis.relationships.length})
            </h4>
            {basis.relationships.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No relationship rows were traversed — this activity is not linked to anything.
              </p>
            ) : (
              <ol className="flex flex-col gap-1 text-sm">
                {basis.relationships.map((relationship) => (
                  <li
                    key={`${relationship.edgeType}:${relationship.relationshipId}`}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <span>{subjectTypeLabel(relationship.fromType)}</span>
                    <ChevronRight className="size-3 text-muted-foreground" aria-hidden="true" />
                    <span>{subjectTypeLabel(relationship.toType)}</span>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                      {relationship.edgeType}
                      {relationship.linkType ? ` (${relationship.linkType})` : ""}
                    </code>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Prior assessments.
 *
 * Read-only by construction: there is no edit affordance because the API has no
 * operation that would rewrite one. Re-evaluating appends.
 */
function ReadinessHistory({
  state,
  viewingId,
  latestId,
  onOpen,
}: {
  state: ReturnType<typeof useVerificationReadinessHistory>["state"];
  viewingId: string | null;
  latestId: string | null;
  onOpen: (assessmentId: string) => void;
}) {
  if (state.phase === "loading") return <LoadingState label="Loading readiness history…" />;
  if (state.phase === "error") return null;
  if (state.data.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-foreground">History</h3>
      <p className="text-xs text-muted-foreground">
        Every evaluation ever run, newest first. Assessments are immutable — a new evaluation
        adds a record rather than replacing one.
      </p>
      <ul className="flex flex-col divide-y divide-border">
        {state.data.map((assessment: VerificationReadinessAssessmentDto) => (
          <li
            key={assessment.id}
            className="flex flex-wrap items-center justify-between gap-3 py-2.5"
          >
            <div className="flex flex-wrap items-center gap-3">
              <span
                className="font-mono text-xs text-muted-foreground"
                title={assessment.evaluatedAt}
              >
                {formatIsoDate(assessment.evaluatedAt)}
              </span>
              <ReadinessStatusBadge status={assessment.status} />
              <span className="text-xs text-muted-foreground">
                v{assessment.readinessVersion}
              </span>
              {assessment.id === latestId && (
                <Badge variant="outline">Latest</Badge>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-pressed={viewingId === assessment.id}
              onClick={() => onOpen(assessment.id)}
            >
              {viewingId === assessment.id ? "Close" : "Open"}
              <span className="sr-only">
                {" "}
                assessment from {formatIsoDate(assessment.evaluatedAt)},{" "}
                {readinessStatusLabel(assessment.status)}
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
