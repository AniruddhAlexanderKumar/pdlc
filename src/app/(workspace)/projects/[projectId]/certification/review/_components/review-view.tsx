"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, History, ShieldCheck } from "lucide-react";
import { describeApiError } from "@/lib/api/client";
import {
  type CertificationReviewFindingDto,
  type CertificationReviewReportDto,
  evaluateCertificationReview,
  fetchReview,
  hasCertificationReviewDto,
  useLatestReview,
  useReviewHistory,
} from "@/lib/api/certification";
import {
  CertificationReviewFindingStatusBadge,
  CertificationReviewFreshnessBadge,
  CertificationReviewStatusBadge,
} from "@/components/common/certification-badges";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatIsoDate } from "@/lib/utils";

/**
 * Internal certification review.
 *
 * Nothing evaluates on page load — the verdict shown is whatever the most
 * recent evaluation produced, with its freshness against the present
 * computed alongside. Evaluating is always an explicit action. Nowhere on
 * this page does a percentage or a regulatory claim appear.
 */
export function ReviewView({ projectId }: { projectId: string }) {
  const latest = useLatestReview(projectId);
  const history = useReviewHistory(projectId);
  const [isEvaluating, setIsEvaluating] = React.useState(false);
  const [evaluateError, setEvaluateError] = React.useState<string | null>(null);
  const [openHistoricalId, setOpenHistoricalId] = React.useState<string | null>(null);
  const [historical, setHistorical] = React.useState<CertificationReviewReportDto | null>(null);
  const [historicalError, setHistoricalError] = React.useState<string | null>(null);

  async function handleEvaluate() {
    setIsEvaluating(true);
    setEvaluateError(null);
    try {
      const report = await evaluateCertificationReview(projectId);
      latest.set(report);
      history.reload();
    } catch (error) {
      setEvaluateError(describeApiError(error));
    } finally {
      setIsEvaluating(false);
    }
  }

  async function openHistorical(reviewId: string) {
    setOpenHistoricalId(reviewId);
    setHistorical(null);
    setHistoricalError(null);
    try {
      const report = await fetchReview(projectId, reviewId);
      setHistorical(report);
    } catch (error) {
      setHistoricalError(describeApiError(error));
    }
  }

  const report = openHistoricalId ? historical : latest.state.phase === "ready" && hasCertificationReviewDto(latest.state.data) ? latest.state.data : null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Certification review"
        description="Internal certification workspace readiness review — not a claim of regulatory approval."
        actions={
          <Button onClick={handleEvaluate} disabled={isEvaluating}>
            <ShieldCheck aria-hidden="true" />
            {isEvaluating ? "Evaluating…" : "Evaluate certification review"}
          </Button>
        }
      />

      {evaluateError && <p className="text-destructive text-sm">{evaluateError}</p>}
      {historicalError && <p className="text-destructive text-sm">{historicalError}</p>}

      {!openHistoricalId && latest.state.phase === "loading" && <LoadingState label="Loading latest review…" />}

      {!openHistoricalId && latest.state.phase === "ready" && !hasCertificationReviewDto(latest.state.data) && (
        <EmptyState
          icon={<ShieldCheck aria-hidden="true" />}
          title="No certification review has been evaluated yet"
          description="Evaluate the review to see the current internal readiness verdict. This will never claim readiness from silence — with no compliance items recorded, the result is Unknown."
          action={<Button onClick={handleEvaluate}>Evaluate now</Button>}
        />
      )}

      {openHistoricalId && !historical && !historicalError && <LoadingState label="Loading historical review…" />}

      {report && (
        <>
          {openHistoricalId && (
            <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
              <span>Viewing a historical review, read-only.</span>
              <Button size="sm" variant="outline" onClick={() => setOpenHistoricalId(null)}>
                Back to latest
              </Button>
            </div>
          )}

          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-4">
              <div>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  <CertificationReviewStatusBadge status={report.review.status} />
                  <CertificationReviewFreshnessBadge freshness={report.freshness} />
                </CardTitle>
                <CardDescription>{report.review.summary ?? "No summary."}</CardDescription>
              </div>
              <div className="text-muted-foreground text-right text-xs">
                <p>Evaluated {formatIsoDate(report.review.evaluatedAt)}</p>
                <p>Version {report.review.reviewVersion}</p>
              </div>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-6 text-sm">
              <Stat label="Findings" value={report.review.counts.findingCount} />
              <Stat label="Blocking" value={report.review.counts.blockingCount} />
              <Stat label="Warning" value={report.review.counts.warningCount} />
              <Stat label="Informational" value={report.review.counts.informationalCount} />
              <Stat label="Unknown" value={report.review.counts.unknownCount} />
            </CardContent>
          </Card>

          <FindingsTable findings={report.findings} />
        </>
      )}

      <div>
        <h2 className="mb-2 flex items-center gap-2 text-lg font-semibold">
          <History aria-hidden="true" className="h-4 w-4" />
          Review history
        </h2>
        {history.state.phase === "loading" && <LoadingState label="Loading history…" />}
        {history.state.phase === "ready" && history.state.data.length === 0 && (
          <p className="text-muted-foreground text-sm">No reviews have been evaluated yet.</p>
        )}
        {history.state.phase === "ready" && history.state.data.length > 0 && (
          <Card>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Evaluated</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Findings</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {history.state.data.map((review) => (
                    <TableRow key={review.id}>
                      <TableCell className="text-xs">{formatIsoDate(review.evaluatedAt)}</TableCell>
                      <TableCell>
                        <CertificationReviewStatusBadge status={review.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-xs">{review.counts.findingCount}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => openHistorical(review.id)}>
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
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="text-lg font-semibold">{value}</p>
    </div>
  );
}

function FindingsTable({ findings }: { findings: CertificationReviewFindingDto[] }) {
  if (findings.length === 0) {
    return (
      <EmptyState
        icon={<AlertTriangle aria-hidden="true" />}
        title="No findings"
        description="Either nothing has been evaluated against, or every condition checked came back clean."
      />
    );
  }
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Rule</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Subject</TableHead>
              <TableHead>Message</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {findings.map((finding) => (
              <TableRow key={finding.id}>
                <TableCell className="font-mono text-xs">{finding.ruleId}</TableCell>
                <TableCell className="text-xs">{finding.category}</TableCell>
                <TableCell>
                  <CertificationReviewFindingStatusBadge status={finding.status} />
                </TableCell>
                <TableCell className="text-xs">
                  {finding.subjectIdentifier ?? finding.subjectLabel}
                </TableCell>
                <TableCell className="text-xs">{finding.message}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

export function CertificationReviewLink({ projectId }: { projectId: string }) {
  return (
    <Link href={`/projects/${projectId}/certification/review`} className="underline-offset-2 hover:underline">
      Certification review
    </Link>
  );
}
