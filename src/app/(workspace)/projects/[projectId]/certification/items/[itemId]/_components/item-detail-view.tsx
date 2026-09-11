"use client";

import { AlertTriangle } from "lucide-react";
import { describeApiError } from "@/lib/api/client";
import { useItem } from "@/lib/api/certification";
import {
  ApplicabilityBadge,
  ComplianceItemStatusBadge,
  DispositionBadge,
} from "@/components/common/certification-badges";
import { PageHeader } from "@/components/common/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { updateComplianceItemRequestSchema } from "@/domain";
import * as React from "react";
import { updateItem } from "@/lib/api/certification";
import { Select } from "@/components/ui/select";
import { complianceItemStatusSchema, complianceDispositionSchema } from "@/domain";
import { ApplicabilityMethodPanel } from "./applicability-method-panel";
import { FindingsPanel } from "./findings-panel";
import { LinksPanel } from "./links-panel";

/**
 * The compliance item detail — the certification traceability hub.
 *
 * Everything a certification reviewer needs to answer "what applies, what
 * proves it, and what remains incomplete?" for one obligation, in one place.
 */
export function ItemDetailView({ projectId, itemId }: { projectId: string; itemId: string }) {
  const item = useItem(projectId, itemId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={item.state.phase === "ready" ? item.state.data.title : "Compliance item"}
        description={item.state.phase === "ready" ? item.state.data.description ?? undefined : undefined}
      />

      {item.state.phase === "loading" && <LoadingState label="Loading compliance item…" />}
      {item.state.phase === "error" && (
        <EmptyState
          icon={<AlertTriangle aria-hidden="true" />}
          title="Could not load this compliance item"
          description={describeApiError(item.state.error)}
          action={<Button onClick={item.reload}>Retry</Button>}
        />
      )}

      {item.state.phase === "ready" && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm">{item.state.data.identifier}</span>
                <ApplicabilityBadge applicability={item.state.data.applicability} />
                <ComplianceItemStatusBadge status={item.state.data.status} />
                <DispositionBadge disposition={item.state.data.disposition} />
              </CardTitle>
              <CardDescription>
                Status and disposition are always explicit — nothing here is derived from a
                linked artifact&apos;s own state.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <StatusDispositionForm
                projectId={projectId}
                item={item.state.data}
                onSaved={(saved) => item.set(saved)}
              />
            </CardContent>
          </Card>

          <ApplicabilityMethodPanel projectId={projectId} item={item.state.data} onSaved={(saved) => item.set(saved)} />
          <LinksPanel projectId={projectId} itemId={itemId} />
          <FindingsPanel projectId={projectId} itemId={itemId} />
        </>
      )}
    </div>
  );
}

function StatusDispositionForm({
  projectId,
  item,
  onSaved,
}: {
  projectId: string;
  item: { id: string; status: string; disposition: string };
  onSaved: (item: Awaited<ReturnType<typeof updateItem>>) => void;
}) {
  const [status, setStatus] = React.useState(item.status);
  const [disposition, setDisposition] = React.useState(item.disposition);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function save(next: { status?: string; disposition?: string }) {
    setIsSubmitting(true);
    setError(null);
    try {
      const parsed = updateComplianceItemRequestSchema.parse(next);
      const saved = await updateItem(projectId, item.id, parsed);
      onSaved(saved);
    } catch (submitError) {
      setError(describeApiError(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-wrap items-end gap-4">
      {error && <p className="text-destructive text-sm">{error}</p>}
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground text-xs">Status</span>
        <Select
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            save({ status: event.target.value as never });
          }}
          disabled={isSubmitting}
        >
          {complianceItemStatusSchema.options.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="text-muted-foreground text-xs">Disposition</span>
        <Select
          value={disposition}
          onChange={(event) => {
            setDisposition(event.target.value);
            save({ disposition: event.target.value as never });
          }}
          disabled={isSubmitting}
        >
          {complianceDispositionSchema.options.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </Select>
      </label>
    </div>
  );
}
