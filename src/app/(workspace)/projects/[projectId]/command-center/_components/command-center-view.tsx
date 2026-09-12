"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Eye,
  Factory,
  FileText,
  GitBranch,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Waypoints,
} from "lucide-react";
import { describeApiError } from "@/lib/api/client";
import {
  type AttentionItemDto,
  type CommandCenterDto,
  useCommandCenter,
} from "@/lib/api/command-center";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Label } from "@/components/ui/label";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import { formatIsoDate } from "@/lib/utils";

/**
 * The Engineering Command Center.
 *
 * A read model, composed entirely of what other workspaces already
 * computed and stored — nothing on this page is evaluated, scored, or
 * derived here. There is no overall health number and no percentage
 * anywhere on this page, because no engine in this product produces one.
 * Every item links to the real workspace that owns it; this page is a way
 * in, not a replacement for any of them.
 */
export function CommandCenterView({ projectId }: { projectId: string }) {
  const { state, reload } = useCommandCenter(projectId);

  if (state.phase === "loading") {
    return <LoadingState label="Loading command center…" />;
  }

  if (state.phase === "error") {
    return (
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
    );
  }

  const data = state.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Engineering Command Center"
        description={`${data.project.name} — real, current state composed from every engine this product already runs. Nothing here is a new verdict.`}
        actions={
          <Button asChild variant="outline">
            <Link href={data.traceabilityHref}>
              <Waypoints aria-hidden="true" />
              Open Traceability
            </Link>
          </Button>
        }
      />

      <ProjectHeaderCard project={data.project} />

      <AttentionSection items={data.attentionItems} />

      <ReadinessSection projectId={projectId} data={data} />

      <ConfigurationSection data={data} />

      <RisksIssuesSection data={data} />

      <SuppliersSection data={data} />

      <EvidenceSection projectId={projectId} data={data} />

      <SentinelSection data={data} />
    </div>
  );
}

function ProjectHeaderCard({ project }: { project: CommandCenterDto["project"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{project.name}</CardTitle>
        {project.description && <CardDescription>{project.description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-4">
          <Detail term="Status">
            <Badge variant="outline">{project.status}</Badge>
          </Detail>
          <Detail term="Identifier">
            <span className="font-mono">{project.identifier ?? "—"}</span>
          </Detail>
          <Detail term="Created">
            <span className="font-mono" title={project.createdAt}>
              {formatIsoDate(project.createdAt)}
            </span>
          </Detail>
          <Detail term="Updated">
            <span className="font-mono" title={project.updatedAt}>
              {formatIsoDate(project.updatedAt)}
            </span>
          </Detail>
        </dl>
      </CardContent>
    </Card>
  );
}

const SOURCE_MODULE_LABELS: Record<string, string> = {
  SENTINEL: "Decision Sentinel",
  TECHNICAL_READINESS: "Technical Readiness",
  VERIFICATION_READINESS: "Verification Readiness",
  CERTIFICATION: "Certification",
  CHANGE_IMPACT: "Change Impact",
  ASSUMPTION_MONITORING: "Assumptions",
  DRIFT: "Drift",
  RISK: "Risks",
  ISSUE: "Issues",
  SUPPLIER: "Suppliers",
};

function AttentionSection({ items }: { items: AttentionItemDto[] }) {
  const [moduleFilter, setModuleFilter] = React.useState("");

  const modulesPresent = React.useMemo(
    () => [...new Set(items.map((item) => item.sourceModule))].sort(),
    [items],
  );
  const filtered = moduleFilter ? items.filter((item) => item.sourceModule === moduleFilter) : items;

  return (
    <Card className="border-warning/30">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-col gap-1.5">
            <CardTitle>Attention required</CardTitle>
            <CardDescription>
              Every item below names a real, already-recorded state from the workspace that owns
              it — nothing is generated and nothing is ranked against anything else.
            </CardDescription>
          </div>
          {items.length > 0 && (
            <div className="flex items-center gap-2">
              <Label htmlFor="attention-module-filter" className="text-xs uppercase tracking-wide text-muted-foreground">
                Source
              </Label>
              <Select
                id="attention-module-filter"
                className="h-8 w-52"
                value={moduleFilter}
                onChange={(event) => setModuleFilter(event.target.value)}
              >
                <option value="">All sources ({items.length})</option>
                {modulesPresent.map((module) => (
                  <option key={module} value={module}>
                    {SOURCE_MODULE_LABELS[module] ?? module}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <EmptyState
            icon={<ShieldCheck aria-hidden="true" />}
            title="Nothing requires attention right now"
            description="No open surveillance target, blocking readiness finding, stale impact analysis, review-required assumption, detected drift, open risk, high/critical issue, or supplier under review was found. This reflects what has been recorded, not a guarantee that everything is fine."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {filtered.map((item) => (
              <li key={item.key} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{SOURCE_MODULE_LABELS[item.sourceModule] ?? item.sourceModule}</Badge>
                    <StateBadge state={item.state} />
                    <span className="min-w-0 truncate text-sm font-medium text-foreground">
                      {item.identifier ? <span className="font-mono">{item.identifier}</span> : null}{" "}
                      {item.identifier ? "— " : ""}
                      {item.title}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground">{item.reason}</span>
                </div>
                <Button asChild variant="ghost" size="sm">
                  <Link href={item.href}>Open</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const BAD_STATES = new Set([
  "NOT_READY",
  "CRITICAL",
  "HIGH",
  "STALE",
  "DRIFT_DETECTED",
  "FAILED",
  "EXPIRED",
  "WITHDRAWN",
  "OPEN",
]);
const NEUTRAL_STATES = new Set(["UNKNOWN", "UNDER_REVIEW", "REVIEW_REQUIRED", "BASIS_CHANGED", "IN_PROGRESS"]);

function StateBadge({ state }: { state: string }) {
  const variant = BAD_STATES.has(state) ? "destructive" : NEUTRAL_STATES.has(state) ? "warning" : "outline";
  return <Badge variant={variant}>{state}</Badge>;
}

function Detail({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{term}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

function ReadinessSection({ projectId, data }: { projectId: string; data: CommandCenterDto }) {
  const { technical, verification, certification, changeImpact, assumptions, drift } = data.readiness;

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Readiness</h2>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Technical readiness</CardTitle>
            <CardDescription>Every internal gate&apos;s last recorded verdict.</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col divide-y divide-border">
              {technical.map((gate) => (
                <li key={gate.gate} className="flex items-center justify-between gap-3 py-2">
                  <div className="flex min-w-0 flex-col">
                    <span className="text-sm text-foreground">{gate.gate.replaceAll("_", " ")}</span>
                    {gate.evaluatedAt && (
                      <span className="text-xs text-muted-foreground" title={gate.evaluatedAt}>
                        Evaluated {formatIsoDate(gate.evaluatedAt)}
                        {gate.freshness ? ` · ${gate.freshness}` : ""}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StateBadge state={gate.status} />
                    <Button asChild variant="ghost" size="sm">
                      <Link href={gate.href}>Open</Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Verification readiness</CardTitle>
            <CardDescription>
              {verification.activitiesTotal} activity(ies) · {verification.activitiesFailed} failed ·{" "}
              {verification.activitiesNeverEvaluated} never evaluated.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {verification.attentionActivities.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No verification activity is failed, blocking, or unknown.
              </p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {verification.attentionActivities.map((activity) => (
                  <li key={activity.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate text-sm text-foreground">
                      <span className="font-mono">{activity.identifier}</span> — {activity.title}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <StateBadge
                        state={activity.activityStatus === "FAILED" ? "FAILED" : activity.readinessStatus}
                      />
                      <Button asChild variant="ghost" size="sm">
                        <Link href={activity.href}>Open</Link>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Certification</CardTitle>
            <CardDescription>
              {certification.hasProgram
                ? `Basis ${certification.activeBasisIdentifier ?? "—"}`
                : "No certification program exists yet for this project."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {certification.hasProgram && certification.review ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-col">
                  <span className="text-sm text-foreground">Review</span>
                  {certification.review.evaluatedAt && (
                    <span className="text-xs text-muted-foreground" title={certification.review.evaluatedAt}>
                      Evaluated {formatIsoDate(certification.review.evaluatedAt)}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <StateBadge state={certification.review.status} />
                  <Button asChild variant="ghost" size="sm">
                    <Link href={certification.review.href}>Open</Link>
                  </Button>
                </div>
              </div>
            ) : null}

            {certification.hasProgram && (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Open findings
                </span>
                {certification.openFindings.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No open certification findings.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-border">
                    {certification.openFindings.map((finding) => (
                      <li key={finding.id} className="flex items-center justify-between gap-3 py-1.5">
                        <span className="min-w-0 truncate text-sm text-foreground">
                          <span className="font-mono">{finding.identifier}</span> — {finding.title}
                        </span>
                        <div className="flex shrink-0 items-center gap-2">
                          <StateBadge state={finding.status} />
                          <Button asChild variant="ghost" size="sm">
                            <Link href={finding.href}>Open</Link>
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {!certification.hasProgram && (
              <Button asChild variant="outline" size="sm" className="self-start">
                <Link href={`/projects/${projectId}/certification`}>Open certification workspace</Link>
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Change impact</CardTitle>
            <CardDescription>Open or in-review changes and their latest impact analysis.</CardDescription>
          </CardHeader>
          <CardContent>
            {changeImpact.activeChanges.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open or in-review changes.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {changeImpact.activeChanges.map((change) => (
                  <li key={change.id} className="flex flex-col gap-1 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm text-foreground">
                        <span className="font-mono">{change.identifier}</span> — {change.title}
                      </span>
                      <div className="flex shrink-0 items-center gap-2">
                        <Badge variant="outline">{change.status}</Badge>
                        <Button asChild variant="ghost" size="sm">
                          <Link href={change.href}>Open</Link>
                        </Button>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      Impact analysis: {change.latestAnalysis.status}
                      {change.latestAnalysis.freshness ? ` · ${change.latestAnalysis.freshness}` : ""}
                      {change.latestAnalysis.status !== "NOT_RUN"
                        ? ` · ${change.latestAnalysis.direct} direct, ${change.latestAnalysis.downstream} downstream, ${change.latestAnalysis.crossDomain} cross-domain, ${change.latestAnalysis.unknown} unknown`
                        : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Assumptions</CardTitle>
            <CardDescription>
              {assumptions.total} total · {assumptions.reviewRequired} require review ·{" "}
              {assumptions.basisChanged} basis changed · {assumptions.neverEvaluated} never evaluated.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {assumptions.attentionAssumptions.length === 0 ? (
              <p className="text-sm text-muted-foreground">No assumption currently requires review.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border">
                {assumptions.attentionAssumptions.map((assumption) => (
                  <li key={assumption.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="min-w-0 truncate text-sm text-foreground">
                      <span className="font-mono">{assumption.decisionIdentifier}</span> —{" "}
                      {assumption.statement}
                    </span>
                    <div className="flex shrink-0 items-center gap-2">
                      <StateBadge state={assumption.monitoringStatus} />
                      <Button asChild variant="ghost" size="sm">
                        <Link href={assumption.href}>Open</Link>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Drift</CardTitle>
            <CardDescription>
              {drift.evaluatedAt ? `Last evaluated ${formatIsoDate(drift.evaluatedAt)}` : "Never evaluated."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              {drift.findings} finding(s) · {drift.reviewRequired} review required · {drift.unknown} unknown
            </span>
            <div className="flex shrink-0 items-center gap-2">
              <StateBadge state={drift.status} />
              <Button asChild variant="ghost" size="sm">
                <Link href={drift.href}>Open</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/**
 * The active engineering baseline, and a live comparison against it —
 * independent of the Drift card above, which reflects only the latest
 * *persisted* drift assessment. Nothing here is a configuration score: a
 * literal stored member count, a live changed/missing count, and a
 * confidence flag on whether that count is complete.
 */
function ConfigurationSection({ data }: { data: CommandCenterDto }) {
  const { configuration } = data;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <GitBranch className="size-4 text-muted-foreground" aria-hidden="true" />
          <CardTitle>Configuration baseline</CardTitle>
        </div>
        <CardDescription>
          {configuration.hasActiveBaseline
            ? `Baseline ${configuration.baselineIdentifier ?? "—"}`
            : "No active baseline exists yet for this project."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {configuration.hasActiveBaseline ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-foreground">{configuration.baselineName}</span>
              <div className="flex shrink-0 items-center gap-2">
                <StateBadge state={configuration.status ?? "DRAFT"} />
                <Button asChild variant="ghost" size="sm">
                  <Link href={configuration.href}>Open</Link>
                </Button>
              </div>
            </div>
            <span className="text-sm text-muted-foreground">
              {configuration.memberCount} member(s) · {configuration.changedCount} changed ·{" "}
              {configuration.missingCount} no longer resolvable
              {configuration.comparisonStatus === "UNKNOWN"
                ? " · comparison incomplete for at least one member"
                : ""}
            </span>
          </>
        ) : (
          <Button asChild variant="outline" size="sm" className="self-start">
            <Link href={configuration.href}>Open baseline workspace</Link>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

function RisksIssuesSection({ data }: { data: CommandCenterDto }) {
  const { risks, issues } = data;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-4 text-muted-foreground" aria-hidden="true" />
            <CardTitle>Risks</CardTitle>
          </div>
          <CardDescription>{risks.open} open. No score or matrix — status only.</CardDescription>
        </CardHeader>
        <CardContent>
          {risks.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open risks.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {risks.items.map((risk) => (
                <li key={risk.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate text-sm text-foreground">
                    <span className="font-mono">{risk.identifier}</span> — {risk.title}
                  </span>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={risk.href}>Open</Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-muted-foreground" aria-hidden="true" />
            <CardTitle>Issues</CardTitle>
          </div>
          <CardDescription>
            {issues.open} open ({issues.attentionCount} high/critical).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {issues.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No open issues.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {issues.items.map((issue) => (
                <li key={issue.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="min-w-0 truncate text-sm text-foreground">
                    <span className="font-mono">{issue.identifier}</span> — {issue.title}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <StateBadge state={issue.severity} />
                    <Button asChild variant="ghost" size="sm">
                      <Link href={issue.href}>Open</Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SuppliersSection({ data }: { data: CommandCenterDto }) {
  const { suppliers } = data;
  const total =
    suppliers.suppliersUnderReview.length +
    suppliers.suppliedItemsUnderReview.length +
    suppliers.qualificationsAttention.length;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Factory className="size-4 text-muted-foreground" aria-hidden="true" />
          <CardTitle>Suppliers</CardTitle>
        </div>
        <CardDescription>Suppliers, supplied items and qualifications requiring attention.</CardDescription>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <p className="text-sm text-muted-foreground">
            No supplier, supplied item or qualification currently needs attention.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {suppliers.suppliersUnderReview.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-sm text-foreground">
                  <Badge variant="outline" className="mr-2">
                    Supplier
                  </Badge>
                  <span className="font-mono">{row.identifier}</span> — {row.title}
                </span>
                <Button asChild variant="ghost" size="sm">
                  <Link href={row.href}>Open</Link>
                </Button>
              </li>
            ))}
            {suppliers.suppliedItemsUnderReview.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-sm text-foreground">
                  <Badge variant="outline" className="mr-2">
                    Supplied item
                  </Badge>
                  <span className="font-mono">{row.identifier}</span> — {row.title}
                </span>
                <Button asChild variant="ghost" size="sm">
                  <Link href={row.href}>Open</Link>
                </Button>
              </li>
            ))}
            {suppliers.qualificationsAttention.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-sm text-foreground">
                  <Badge variant="outline" className="mr-2">
                    Qualification
                  </Badge>
                  {row.title}
                </span>
                <div className="flex shrink-0 items-center gap-2">
                  <StateBadge state={row.status} />
                  <Button asChild variant="ghost" size="sm">
                    <Link href={row.href}>Open</Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function EvidenceSection({ projectId, data }: { projectId: string; data: CommandCenterDto }) {
  const { evidence } = data;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
          <CardTitle>Evidence</CardTitle>
        </div>
        <CardDescription>
          {evidence.draftCount} draft · {evidence.validatedCount} validated · {evidence.supersededCount}{" "}
          superseded. Quantity is not a quality signal — this is a count, not a score.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {evidence.draftItems.length === 0 ? (
          <p className="text-sm text-muted-foreground">No draft evidence awaiting validation.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {evidence.draftItems.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate text-sm text-foreground">
                  <span className="font-mono">{row.identifier}</span> — {row.title}
                </span>
                <Button asChild variant="ghost" size="sm">
                  <Link href={row.href}>Open</Link>
                </Button>
              </li>
            ))}
          </ul>
        )}
        <Button asChild variant="outline" size="sm" className="self-start">
          <Link href={`/projects/${projectId}/evidence`}>Open evidence workspace</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function SentinelSection({ data }: { data: CommandCenterDto }) {
  const { sentinel } = data;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Eye className="size-4 text-muted-foreground" aria-hidden="true" />
          <CardTitle>Decision Sentinel</CardTitle>
        </div>
        <CardDescription>
          {sentinel.openCount} open · {sentinel.acknowledgedCount} acknowledged. Detection is explicit —
          opening this page never runs it.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {sentinel.targets.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open surveillance targets.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {sentinel.targets.map((target) => (
              <li key={target.id} className="flex flex-col gap-1 py-2">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm text-foreground">
                    <Badge variant="outline" className="mr-2">
                      {target.targetType.replaceAll("_", " ")}
                    </Badge>
                    {target.targetIdentifier ? (
                      <span className="font-mono">{target.targetIdentifier}</span>
                    ) : null}{" "}
                    {target.targetIdentifier ? "— " : ""}
                    {target.targetLabel}
                  </span>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={target.status === "OPEN" ? "warning" : "outline"}>{target.status}</Badge>
                    <Button asChild variant="ghost" size="sm">
                      <Link href={target.href}>Open</Link>
                    </Button>
                  </div>
                </div>
                <span className="text-xs text-muted-foreground">{target.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
