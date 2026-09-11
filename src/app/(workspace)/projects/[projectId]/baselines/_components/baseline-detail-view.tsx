"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { BASELINE_MEMBER_TYPES, type BaselineMemberType } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type BaselineMemberWithCurrentDto,
  activateBaseline,
  addBaselineMember,
  removeBaselineMember,
  supersedeBaseline,
  useBaseline,
  useBaselineMemberTargets,
} from "@/lib/api/drift";
import { ArtifactHistory, DetailField } from "@/components/common/artifact-panels";
import { BaselineStatusBadge, driftLabel } from "@/components/common/drift-badges";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import { formatIsoDate } from "@/lib/utils";
import { BaselineFormDialog } from "./baseline-form-dialog";

/**
 * One baseline: what it represents, and whether those objects have moved.
 *
 * The membership table shows both the snapshot and the current state, so an
 * engineer can see what a drift evaluation would find without running one. That
 * comparison is a read — it records nothing.
 */
export function BaselineDetailView({
  projectId,
  baselineId,
}: {
  projectId: string;
  baselineId: string;
}) {
  const { state, reload } = useBaseline(projectId, baselineId);
  const [isEditOpen, setIsEditOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  if (state.phase === "loading") return <LoadingState label="Loading baseline…" />;

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

  const baseline = state.data;
  const isDraft = baseline.status === "DRAFT";
  const changedCount = baseline.members.filter((member) => member.changed).length;

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      reload();
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={baseline.name}
        description={`Baseline ${baseline.identifier}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href={`/projects/${projectId}/baselines`}>
                <ArrowLeft aria-hidden="true" />
                All baselines
              </Link>
            </Button>
            {isDraft && (
              <>
                <Button variant="outline" onClick={() => setIsEditOpen(true)} disabled={busy}>
                  <Pencil aria-hidden="true" />
                  Edit
                </Button>
                <Button
                  disabled={busy || baseline.members.length === 0}
                  onClick={() => run(() => activateBaseline(projectId, baseline.id))}
                >
                  <CheckCircle2 aria-hidden="true" />
                  Activate
                </Button>
              </>
            )}
            {baseline.status === "ACTIVE" && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => run(() => supersedeBaseline(projectId, baseline.id))}
              >
                Supersede
              </Button>
            )}
          </div>
        }
      />

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}

      {!isDraft && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-lg border border-border bg-secondary p-3 text-sm text-secondary-foreground"
        >
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            <strong>This baseline is {baseline.status.toLowerCase()} and immutable.</strong> Its
            membership and snapshots are fixed because every drift assessment is computed against
            them — editing it would silently change what past results meant. Record a new baseline
            instead.
          </span>
        </p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Baseline record</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <DetailField term="Identifier">
              <span className="font-mono">{baseline.identifier}</span>
            </DetailField>
            <DetailField term="Status">
              <BaselineStatusBadge status={baseline.status} />
            </DetailField>
            <DetailField term="Created">
              <span className="font-mono" title={baseline.createdAt}>
                {formatIsoDate(baseline.createdAt)}
              </span>
            </DetailField>
            <DetailField term="Activated">
              {baseline.baselinedAt ? (
                <span className="font-mono" title={baseline.baselinedAt}>
                  {formatIsoDate(baseline.baselinedAt)}
                </span>
              ) : (
                <span className="text-muted-foreground">Not activated</span>
              )}
            </DetailField>
          </dl>

          {baseline.description && (
            <p className="mt-4 whitespace-pre-wrap text-sm text-foreground">
              {baseline.description}
            </p>
          )}
        </CardContent>
      </Card>

      <BaselineMembers
        projectId={projectId}
        baselineId={baseline.id}
        members={baseline.members}
        editable={isDraft}
        changedCount={changedCount}
        onChanged={reload}
      />

      <ArtifactHistory events={baseline.history} />

      <BaselineFormDialog
        mode="edit"
        projectId={projectId}
        baseline={baseline}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSaved={() => reload()}
      />
    </div>
  );
}

/** The objects this baseline represents, and whether each has moved since. */
function BaselineMembers({
  projectId,
  baselineId,
  members,
  editable,
  changedCount,
  onChanged,
}: {
  projectId: string;
  baselineId: string;
  members: BaselineMemberWithCurrentDto[];
  editable: boolean;
  changedCount: number;
  onChanged: () => void;
}) {
  const targets = useBaselineMemberTargets(projectId);
  const [nodeType, setNodeType] = React.useState<BaselineMemberType>("DESIGN_ITEM");
  const [nodeId, setNodeId] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const options = React.useMemo(
    () => (targets.state.phase === "ready" ? (targets.state.data[nodeType] ?? []) : []),
    [targets.state, nodeType],
  );

  async function handleAdd(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || nodeId === "") return;

    setBusy(true);
    setError(null);
    try {
      await addBaselineMember(projectId, baselineId, { nodeType, nodeId });
      setNodeId("");
      onChanged();
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleRemove(memberId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await removeBaselineMember(projectId, baselineId, memberId);
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
        <CardTitle>Baselined objects</CardTitle>
        <CardDescription>
          What this baseline records as the approved basis, with the state each object was in at
          the time. {changedCount > 0
            ? `${changedCount} of ${members.length} have changed since — that is what a drift evaluation would report, and it is not a judgement that anything is wrong.`
            : "Nothing has changed since activation."}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}

        {members.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No objects yet. A baseline with no members records no engineering basis, so there
            would be nothing to compare against.
          </p>
        ) : (
          <ul aria-label="Baselined objects" className="flex flex-col divide-y divide-border">
            {members.map((member) => (
              <li
                key={member.id}
                className="flex flex-wrap items-center justify-between gap-3 py-2.5"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm text-foreground">
                    {member.identifierSnapshot && (
                      <span className="font-mono">{member.identifierSnapshot} — </span>
                    )}
                    {member.labelSnapshot}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {driftLabel(member.nodeType)}
                    {member.stateSnapshot ? ` · baselined as ${member.stateSnapshot}` : ""}
                    {member.changed && member.currentState && member.currentState !== member.stateSnapshot
                      ? ` · now ${member.currentState}`
                      : ""}
                  </span>
                </div>
                <span className="flex shrink-0 items-center gap-2">
                  {member.currentFingerprint === null ? (
                    <Badge variant="secondary">Not resolvable</Badge>
                  ) : member.changed ? (
                    <Badge variant="warning">Changed since baseline</Badge>
                  ) : (
                    <Badge variant="outline">Unchanged</Badge>
                  )}
                  {editable && (
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={busy}
                      onClick={() => handleRemove(member.id)}
                      aria-label={`Remove ${member.labelSnapshot}`}
                    >
                      <Trash2 aria-hidden="true" />
                      Remove
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        )}

        {editable && (
          <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="member-type"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Object type
              </label>
              <Select
                id="member-type"
                value={nodeType}
                onChange={(event) => {
                  setNodeType(event.target.value as BaselineMemberType);
                  setNodeId("");
                }}
                disabled={busy}
                className="w-56"
              >
                {BASELINE_MEMBER_TYPES.map((value) => (
                  <option key={value} value={value}>
                    {driftLabel(value)}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor="member-object"
                className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
              >
                Object
              </label>
              <Select
                id="member-object"
                value={nodeId}
                onChange={(event) => setNodeId(event.target.value)}
                disabled={busy || options.length === 0}
                className="w-80"
              >
                <option value="">
                  {options.length === 0 ? "None recorded in this project" : "Select…"}
                </option>
                {options.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.identifier} — {option.title}
                  </option>
                ))}
              </Select>
            </div>

            <Button type="submit" disabled={busy || nodeId === ""}>
              <Plus aria-hidden="true" />
              {busy ? "Saving…" : "Add to baseline"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
