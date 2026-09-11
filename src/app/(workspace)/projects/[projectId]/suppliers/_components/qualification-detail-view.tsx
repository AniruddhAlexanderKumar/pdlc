"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, FileCheck2, Pencil, RefreshCw } from "lucide-react";
import { describeApiError } from "@/lib/api/client";
import { linkQualificationEvidence, useQualification } from "@/lib/api/suppliers";
import { useDecisionLinkTargets } from "@/lib/api/decisions";
import { ArtifactHistory, DetailField } from "@/components/common/artifact-panels";
import { PageHeader } from "@/components/common/page-header";
import {
  QualificationStatusBadge,
  QualificationTypeBadge,
} from "@/components/common/supplier-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import { formatIsoDate } from "@/lib/utils";
import { QualificationFormDialog } from "./qualification-form-dialog";

/**
 * One supplier qualification.
 *
 * The dates are presented as recorded facts, not as a verdict. An expiry date in
 * the past is shown plainly — and labelled as being in the past — without the
 * status changing, because whether a lapsed date means the qualification no
 * longer holds is an engineering judgement a person makes, not one this page is
 * entitled to make for them.
 */
export function QualificationDetailView({
  projectId,
  qualificationId,
}: {
  projectId: string;
  qualificationId: string;
}) {
  const { state, reload } = useQualification(projectId, qualificationId);
  const [isEditOpen, setIsEditOpen] = React.useState(false);

  if (state.phase === "loading") return <LoadingState label="Loading qualification…" />;

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

  const qualification = state.data;
  const expired =
    qualification.expiryDate !== null && new Date(qualification.expiryDate) < new Date();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={qualification.title}
        description={`Qualification for ${qualification.supplier.identifier}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href={`/projects/${projectId}/suppliers/${qualification.supplier.id}`}>
                <ArrowLeft aria-hidden="true" />
                {qualification.supplier.identifier}
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setIsEditOpen(true)}>
              <Pencil aria-hidden="true" />
              Edit
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Qualification record</CardTitle>
          <CardDescription>
            Engineering context. This is not a certification record: no standard is named and no
            authority is modelled.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            <DetailField term="Type">
              <QualificationTypeBadge qualificationType={qualification.qualificationType} />
            </DetailField>
            <DetailField term="Status">
              <QualificationStatusBadge status={qualification.status} />
            </DetailField>
            <DetailField term="Supplier">
              <Link
                href={`/projects/${projectId}/suppliers/${qualification.supplier.id}`}
                className="text-foreground underline-offset-4 hover:underline"
              >
                <span className="font-mono">{qualification.supplier.identifier}</span> —{" "}
                {qualification.supplier.name}
              </Link>
            </DetailField>
            <DetailField term="Supplied item">
              {qualification.suppliedItem ? (
                <Link
                  href={`/projects/${projectId}/supplied-items/${qualification.suppliedItem.id}`}
                  className="text-foreground underline-offset-4 hover:underline"
                >
                  <span className="font-mono">{qualification.suppliedItem.identifier}</span> —{" "}
                  {qualification.suppliedItem.name}
                </Link>
              ) : (
                <span className="text-muted-foreground">
                  None — qualifies the supplier as a source
                </span>
              )}
            </DetailField>
            <DetailField term="Effective from">
              {qualification.effectiveDate ? (
                <span className="font-mono" title={qualification.effectiveDate}>
                  {formatIsoDate(qualification.effectiveDate)}
                </span>
              ) : (
                <span className="text-muted-foreground">Not recorded</span>
              )}
            </DetailField>
            <DetailField term="Expires">
              {qualification.expiryDate ? (
                <span className="font-mono" title={qualification.expiryDate}>
                  {formatIsoDate(qualification.expiryDate)}
                </span>
              ) : (
                <span className="text-muted-foreground">Not recorded</span>
              )}
            </DetailField>
          </dl>

          <DetailField term="Evidence reference">
            {qualification.evidenceReference ? (
              <span className="font-mono">{qualification.evidenceReference}</span>
            ) : (
              <span className="text-muted-foreground">Not recorded</span>
            )}
          </DetailField>

          {expired && qualification.status !== "EXPIRED" && (
            <p
              role="status"
              className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm text-warning"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>
                <strong>The recorded expiry date has passed</strong>, and the status is still{" "}
                {qualification.status.toLowerCase()}. Nothing has been changed — whether a lapsed
                date means this qualification no longer holds is a judgement for an engineer, not
                one this system will make.
              </span>
            </p>
          )}
        </CardContent>
      </Card>

      <QualificationEvidence
        projectId={projectId}
        qualificationId={qualification.id}
        evidence={qualification.evidence}
        onChanged={reload}
      />

      <ArtifactHistory events={qualification.history} />

      <QualificationFormDialog
        mode="edit"
        projectId={projectId}
        qualification={qualification}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSaved={() => reload()}
      />
    </div>
  );
}

/** Evidence records attached to this qualification. */
function QualificationEvidence({
  projectId,
  qualificationId,
  evidence,
  onChanged,
}: {
  projectId: string;
  qualificationId: string;
  evidence: Array<{
    evidenceId: string;
    title: string;
    evidenceType: string;
    sourceReference: string;
    note: string | null;
  }>;
  onChanged: () => void;
}) {
  // Reuses the decision link-target lookup, which already returns this
  // project's evidence — no new endpoint for a list that already exists.
  const targets = useDecisionLinkTargets(projectId);
  const [evidenceId, setEvidenceId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const options = targets.state.phase === "ready" ? targets.state.data.EVIDENCE : [];

  async function handleLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || evidenceId === "") return;

    setBusy(true);
    setError(null);
    try {
      await linkQualificationEvidence(projectId, qualificationId, { evidenceId, note: null });
      setEvidenceId("");
      onChanged();
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileCheck2 className="size-4" aria-hidden="true" />
          Attached evidence
        </CardTitle>
        <CardDescription>
          Existing Evidence records from this project. Nothing is uploaded here — this system stores
          no files.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}

        {evidence.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No evidence attached. The qualification&rsquo;s own reference may still name an external
            document.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {evidence.map((record) => (
              <li
                key={record.evidenceId}
                className="flex flex-wrap items-center justify-between gap-3 py-2.5"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm text-foreground">{record.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {record.evidenceType.replaceAll("_", " ").toLowerCase()} ·{" "}
                    <span className="font-mono">{record.sourceReference}</span>
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleLink} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="qual-evidence"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Evidence
            </label>
            <Select
              id="qual-evidence"
              value={evidenceId}
              onChange={(event) => setEvidenceId(event.target.value)}
              disabled={busy || options.length === 0}
              className="w-72"
            >
              <option value="">
                {options.length === 0 ? "None recorded in this project" : "Select…"}
              </option>
              {options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.title}
                </option>
              ))}
            </Select>
          </div>
          <Button type="submit" disabled={busy || evidenceId === ""}>
            {busy ? "Saving…" : "Attach evidence"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
