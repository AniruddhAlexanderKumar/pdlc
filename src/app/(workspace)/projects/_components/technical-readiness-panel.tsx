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
import {
  TECHNICAL_READINESS_GATES,
  type TechnicalReadinessGate,
  technicalReadinessGateLabel,
  technicalReadinessGateQuestion,
  technicalReadinessRule,
} from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type TechnicalReadinessAssessmentDto,
  type TechnicalReadinessFindingDto,
  type TechnicalReadinessReportDto,
  evaluateTechnicalReadiness,
  fetchTechnicalReadinessAssessment,
  hasTechnicalAssessment,
  useLatestTechnicalReadiness,
  useTechnicalReadinessHistory,
} from "@/lib/api/technical-readiness";
import {
  TechnicalFindingBadge,
  TechnicalFreshnessBadge,
  TechnicalReadinessStatusBadge,
  readinessBasisMarkerLabel,
  scopeRoleLabel,
  technicalCategoryLabel,
  technicalReadinessStatusLabel,
} from "@/components/common/readiness-badges";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
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
 * The technical-readiness workspace.
 *
 * Everything shown here comes from a stored gate assessment. Nothing is derived
 * in the browser, nothing is estimated, and no number appears that the server
 * did not count. There is no percentage and no progress bar, because a gate has
 * three states and a list of reasons — a figure would be read as a measurement
 * of something nobody measured.
 *
 * The gate selector chooses *which question to ask*. It does not choose rules:
 * the backend owns rule selection entirely, and the request carries a gate and
 * nothing else.
 *
 * Selecting a gate never evaluates it. Reading a page must not record an
 * engineering judgement.
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
  PROJECT: "Project",
  REQUIREMENT: "Requirement",
  DESIGN_ITEM: "Design item",
  ENGINEERING_DECISION: "Decision",
  DECISION_ASSUMPTION: "Assumption",
  VERIFICATION_ACTIVITY: "Verification",
  CHANGE_REQUEST: "Change request",
  EVIDENCE: "Evidence",
  RISK: "Risk",
  ISSUE: "Issue",
  STAKEHOLDER_NEED: "Stakeholder need",
};

function subjectTypeLabel(type: string): string {
  return SUBJECT_TYPE_LABELS[type] ?? type;
}

export function TechnicalReadinessPanel({ projectId }: { projectId: string }) {
  const [gate, setGate] = React.useState<TechnicalReadinessGate>("SYSTEM_DEFINITION");

  const latest = useLatestTechnicalReadiness(projectId, gate);
  const history = useTechnicalReadinessHistory(projectId, gate);

  const [isEvaluating, setIsEvaluating] = React.useState(false);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [openFindingId, setOpenFindingId] = React.useState<string | null>(null);

  // A historical assessment being inspected, loaded on demand. Null means the
  // panel is showing the latest one for the selected gate.
  const [viewing, setViewing] = React.useState<TechnicalReadinessReportDto | null>(null);
  const [viewingId, setViewingId] = React.useState<string | null>(null);
  const [viewError, setViewError] = React.useState<string | null>(null);

  const reloadLatest = latest.reload;
  const reloadHistory = history.reload;

  function selectGate(next: TechnicalReadinessGate) {
    // Changing the question must not answer it.
    setGate(next);
    setViewing(null);
    setViewingId(null);
    setOpenFindingId(null);
    setActionError(null);
    setViewError(null);
  }

  async function evaluate() {
    if (isEvaluating) return;
    setActionError(null);
    setIsEvaluating(true);

    try {
      await evaluateTechnicalReadiness(projectId, gate);
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
      const report = await fetchTechnicalReadinessAssessment(projectId, assessmentId);
      setViewing(report);
      setViewingId(assessmentId);
    } catch (error) {
      setViewError(describeApiError(error));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Technical readiness</CardTitle>
        <CardDescription>
          Whether the engineering state recorded for this project supports entering a named
          internal development gate. These are internal engineering gates — they are not
          certification, and readiness is a statement about the record, not a decision to hold
          the gate.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="technical-readiness-gate">Gate</Label>
          <Select
            id="technical-readiness-gate"
            value={gate}
            onChange={(event) => selectGate(event.target.value as TechnicalReadinessGate)}
          >
            {TECHNICAL_READINESS_GATES.map((option) => (
              <option key={option} value={option}>
                {technicalReadinessGateLabel(option)}
              </option>
            ))}
          </Select>
          <p className="text-xs text-muted-foreground">
            {technicalReadinessGateQuestion(gate)}
          </p>
        </div>

        {actionError && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{actionError}</span>
          </p>
        )}

        {latest.state.phase === "loading" && <LoadingState label="Loading gate assessment…" />}

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
          (hasTechnicalAssessment(latest.state.data) ? (
            <GateReport
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
                The {technicalReadinessGateLabel(gate).toLowerCase()} gate has not been assessed.
                Nothing has been evaluated for it, and no conclusion about this project&apos;s
                readiness should be drawn from the absence of an assessment.
              </p>
              <Button size="sm" disabled={isEvaluating} onClick={evaluate}>
                <Play aria-hidden="true" />
                {isEvaluating ? "Evaluating…" : "Evaluate gate"}
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

        <GateHistory
          state={history.state}
          viewingId={viewingId}
          latestId={
            latest.state.phase === "ready" && hasTechnicalAssessment(latest.state.data)
              ? latest.state.data.assessment.id
              : null
          }
          onOpen={openHistorical}
        />
      </CardContent>
    </Card>
  );
}

function GateReport({
  projectId,
  report,
  historical,
  busy,
  onEvaluate,
  openFindingId,
  onToggleFinding,
}: {
  projectId: string;
  report: TechnicalReadinessReportDto;
  historical: boolean;
  busy: boolean;
  onEvaluate: () => void;
  openFindingId: string | null;
  onToggleFinding: (id: string) => void;
}) {
  const { assessment, freshness, findings, scope } = report;
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
              <TechnicalFreshnessBadge freshness={freshness} />
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
          {busy ? "Evaluating…" : isStale ? "Evaluate again" : "Evaluate gate"}
        </Button>
      </div>

      {isStale && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <CircleSlash className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>Gate assessment is stale.</strong> The engineering state this gate was
            assessed against has changed, so its findings may no longer describe the project.
            Nothing has been recomputed — evaluate again to see where the gate stands now.
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
            produced by a different rule version, or its scope could not be resolved again. It is
            not being presented as current.
          </span>
        </p>
      )}

      <div
        role="group"
        aria-label="Gate verdict"
        className="flex flex-col gap-2 rounded-lg border border-border p-4"
      >
        <div className="flex flex-wrap items-center gap-3">
          <TechnicalReadinessStatusBadge status={assessment.status} />
          <span className="text-sm text-muted-foreground">
            {technicalReadinessGateLabel(assessment.gate)}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          {assessment.status === "READY"
            ? "Every blocking condition this gate declares was evaluated and none applies. This says the record supports the gate — it is not a decision to hold it, and it is not certification."
            : assessment.status === "NOT_READY"
              ? "At least one blocking condition applies. The findings below name each one, the record it was read from, and the object it concerns."
              : "No blocking condition applies, but at least one condition could not be determined from the record. Readiness is not being claimed on information that is missing."}
        </p>
      </div>

      {/* Counts of rule outcomes — not a score */}
      <dl aria-label="Gate finding counts" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CountTile label="Blocking" value={assessment.summary.blocking} />
        <CountTile label="Warnings" value={assessment.summary.warning} />
        <CountTile label="Unknown" value={assessment.summary.unknown} />
        <CountTile label="Information" value={assessment.summary.informational} />
      </dl>

      {findings.length === 0 ? (
        <p className="text-sm text-muted-foreground">This assessment recorded no findings.</p>
      ) : (
        <Table>
          <TableCaption className="sr-only">
            Conditions this gate assessment evaluated, blocking first.
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
                  <TableCell className="whitespace-nowrap font-mono">{finding.ruleId}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {technicalCategoryLabel(finding.category)}
                  </TableCell>
                  <TableCell>
                    <TechnicalFindingBadge status={finding.status} />
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

      <GateScope projectId={projectId} scope={scope} />
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

function SubjectLink({
  projectId,
  finding,
}: {
  projectId: string;
  finding: TechnicalReadinessFindingDto;
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
 * exists still shows its recorded message — the authoritative explanation — and
 * says the definition is unavailable rather than inventing one.
 */
function FindingRationale({ finding }: { finding: TechnicalReadinessFindingDto }) {
  const rule = technicalReadinessRule(finding.ruleId);

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
            <p className="text-xs text-muted-foreground">
              Evaluated at:{" "}
              {rule.gates.map((gate) => technicalReadinessGateLabel(gate)).join(", ")}
            </p>
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
 * What the gate was evaluated against.
 *
 * Every count comes from the scope the engine actually resolved — none is an
 * estimate of what the project ought to contain — and the consumed sections
 * link out to the engines that produced those verdicts rather than restating
 * their findings here.
 */
function GateScope({
  projectId,
  scope,
}: {
  projectId: string;
  scope: TechnicalReadinessReportDto["scope"];
}) {
  const [open, setOpen] = React.useState(false);

  const roles = React.useMemo(
    () =>
      (Object.entries(scope.counts) as Array<[keyof typeof scope.counts, number]>).filter(
        ([, count]) => count > 0,
      ),
    [scope],
  );

  const staleVerification = scope.consumed.verificationReadiness.filter(
    (entry) => entry.assessmentId !== null && entry.freshness !== "CURRENT",
  );
  const reviewRequired = scope.consumed.assumptionMonitoring.filter(
    (entry) => entry.monitoringStatus === "REVIEW_REQUIRED",
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-medium text-foreground">Evaluated scope</h3>
          <p className="text-xs text-muted-foreground">
            {scope.label} — {scope.objects.length} object(s) and {scope.relationships.length}{" "}
            relationship row(s) considered for this gate.
          </p>
        </div>
        <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setOpen(!open)}>
          <ChevronRight aria-hidden="true" />
          {open ? "Hide scope" : "Inspect scope"}
        </Button>
      </div>

      {open && (
        <div className="flex flex-col gap-4">
          <dl aria-label="Scope counts" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {roles.map(([role, count]) => (
              <div key={role} className="flex items-baseline justify-between gap-2 text-sm">
                <dt className="text-muted-foreground">{scopeRoleLabel(role)}</dt>
                <dd className="font-mono text-foreground">{count}</dd>
              </div>
            ))}
          </dl>

          {scope.consumed.verificationReadiness.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Verification readiness consumed
              </h4>
              <ul className="flex flex-col divide-y divide-border">
                {scope.consumed.verificationReadiness.map((entry) => (
                  <li
                    key={entry.verificationActivityId}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                  >
                    <Link
                      href={`/projects/${projectId}/verification/${entry.verificationActivityId}`}
                      className="text-foreground underline-offset-4 hover:underline"
                    >
                      Verification activity
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {entry.assessmentId === null
                        ? "never assessed"
                        : `${entry.status} · ${entry.freshness?.toLowerCase()}`}
                    </span>
                  </li>
                ))}
              </ul>
              {staleVerification.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {staleVerification.length} assessment(s) are not current. Their verdicts were
                  not read as current — open each activity to re-evaluate it.
                </p>
              )}
            </div>
          )}

          {scope.consumed.changeImpact.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Change impact consumed
              </h4>
              <ul className="flex flex-col divide-y divide-border">
                {scope.consumed.changeImpact.map((entry) => (
                  <li
                    key={entry.changeRequestId}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                  >
                    <Link
                      href={`/projects/${projectId}/changes/${entry.changeRequestId}`}
                      className="text-foreground underline-offset-4 hover:underline"
                    >
                      <span className="font-mono">{entry.identifier ?? "Change"}</span>
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      impact analysis: {entry.analysisFreshness.replaceAll("_", " ").toLowerCase()}
                      {entry.reachedScopeKeys.length > 0
                        ? ` · reaches ${entry.reachedScopeKeys.length} object(s) in scope`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {scope.consumed.assumptionMonitoring.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <h4 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Assumption monitoring consumed
              </h4>
              <ul className="flex flex-col divide-y divide-border">
                {scope.consumed.assumptionMonitoring.map((entry) => (
                  <li
                    key={entry.assumptionId}
                    className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"
                  >
                    <Link
                      href={`/projects/${projectId}/decisions/${entry.decisionId}`}
                      className="text-foreground underline-offset-4 hover:underline"
                    >
                      Assumption on decision
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {entry.monitoringStatus.replaceAll("_", " ").toLowerCase()} · recorded{" "}
                      {entry.assumptionStatus.toLowerCase()}
                    </span>
                  </li>
                ))}
              </ul>
              {reviewRequired.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {reviewRequired.length} assumption(s) require review. Their status is unchanged —
                  reviewing one is an explicit act on the decision that owns it.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Prior assessments of the selected gate.
 *
 * Read-only by construction: there is no edit affordance because the API has no
 * operation that would rewrite one. Re-evaluating appends.
 */
function GateHistory({
  state,
  viewingId,
  latestId,
  onOpen,
}: {
  state: ReturnType<typeof useTechnicalReadinessHistory>["state"];
  viewingId: string | null;
  latestId: string | null;
  onOpen: (assessmentId: string) => void;
}) {
  if (state.phase === "loading") return <LoadingState label="Loading gate history…" />;
  if (state.phase === "error") return null;
  if (state.data.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-foreground">History</h3>
      <p className="text-xs text-muted-foreground">
        Every evaluation of this gate, newest first. Assessments are immutable — a new evaluation
        adds a record rather than replacing one, so a gate decision can still be explained later.
      </p>
      <ul className="flex flex-col divide-y divide-border">
        {state.data.map((assessment: TechnicalReadinessAssessmentDto) => (
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
              <Badge variant="outline">{technicalReadinessGateLabel(assessment.gate)}</Badge>
              <TechnicalReadinessStatusBadge status={assessment.status} />
              <span className="text-xs text-muted-foreground">
                v{assessment.readinessVersion}
              </span>
              {assessment.id === latestId && <Badge variant="outline">Latest</Badge>}
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
                {technicalReadinessStatusLabel(assessment.status)}
              </span>
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
