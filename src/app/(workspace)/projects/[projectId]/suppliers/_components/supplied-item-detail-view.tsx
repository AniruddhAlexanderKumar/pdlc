"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, History, Link2, Pencil, RefreshCw, Trash2 } from "lucide-react";
import {
  SUPPLIED_ITEM_RELATIONS,
  type SuppliedItemRelation,
  suppliedItemRelationLabel,
} from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  type SuppliedItemLinkDto,
  linkSuppliedItem,
  unlinkSuppliedItem,
  useSuppliedItem,
  useSuppliedItemLinkTargets,
} from "@/lib/api/suppliers";
import { ArtifactHistory, DetailField } from "@/components/common/artifact-panels";
import { PageHeader } from "@/components/common/page-header";
import {
  QualificationStatusBadge,
  SuppliedItemStatusBadge,
  SuppliedItemTypeBadge,
} from "@/components/common/supplier-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import { SuppliedItemFormDialog } from "./supplied-item-form-dialog";

/**
 * One supplied item, with the engineering relationships that make a supplier
 * change answerable.
 *
 * This page is where supplier records stop being an inventory and become part of
 * the product: every link recorded here is an edge the existing change-impact
 * engine will walk.
 */
export function SuppliedItemDetailView({
  projectId,
  suppliedItemId,
}: {
  projectId: string;
  suppliedItemId: string;
}) {
  const { state, reload } = useSuppliedItem(projectId, suppliedItemId);
  const [isEditOpen, setIsEditOpen] = React.useState(false);

  if (state.phase === "loading") return <LoadingState label="Loading supplied item…" />;

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

  const item = state.data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={item.name}
        description={`Supplied item ${item.identifier}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href={`/projects/${projectId}/suppliers/${item.supplier.id}`}>
                <ArrowLeft aria-hidden="true" />
                {item.supplier.identifier}
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setIsEditOpen(true)}>
              <Pencil aria-hidden="true" />
              Edit
            </Button>
            <Button variant="outline" asChild>
              <Link href={`/projects/${projectId}/history/SUPPLIED_ITEM/${item.id}`}>
                <History aria-hidden="true" />
                History
              </Link>
            </Button>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Supplied item record</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
            <DetailField term="Identifier">
              <span className="font-mono">{item.identifier}</span>
            </DetailField>
            <DetailField term="Type">
              <SuppliedItemTypeBadge itemType={item.itemType} />
            </DetailField>
            <DetailField term="Status">
              <SuppliedItemStatusBadge status={item.status} />
            </DetailField>
            <DetailField term="Supplier">
              <Link
                href={`/projects/${projectId}/suppliers/${item.supplier.id}`}
                className="text-foreground underline-offset-4 hover:underline"
              >
                <span className="font-mono">{item.supplier.identifier}</span> — {item.supplier.name}
              </Link>
            </DetailField>
          </dl>

          {item.description && (
            <p className="mt-4 whitespace-pre-wrap text-sm text-foreground">{item.description}</p>
          )}
        </CardContent>
      </Card>

      <SuppliedItemLinks
        projectId={projectId}
        suppliedItemId={item.id}
        links={item.links}
        onChanged={reload}
      />

      <Card>
        <CardHeader>
          <CardTitle>Qualifications</CardTitle>
          <CardDescription>
            Qualifications recorded specifically for this item. Source qualifications sit on the
            supplier instead.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {item.qualifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No item-specific qualification recorded.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {item.qualifications.map((qualification) => (
                <li
                  key={qualification.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-2.5"
                >
                  <Link
                    href={`/projects/${projectId}/supplier-qualifications/${qualification.id}`}
                    className="min-w-0 truncate text-sm text-foreground underline-offset-4 hover:underline"
                  >
                    {qualification.title}
                  </Link>
                  <QualificationStatusBadge status={qualification.status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ArtifactHistory events={item.history} />

      <SuppliedItemFormDialog
        mode="edit"
        projectId={projectId}
        suppliedItem={item}
        open={isEditOpen}
        onOpenChange={setIsEditOpen}
        onSaved={() => reload()}
      />
    </div>
  );
}

/** Where this supplied item participates in the product. */
function SuppliedItemLinks({
  projectId,
  suppliedItemId,
  links,
  onChanged,
}: {
  projectId: string;
  suppliedItemId: string;
  links: SuppliedItemLinkDto[];
  onChanged: () => void;
}) {
  const targets = useSuppliedItemLinkTargets(projectId);
  const [relation, setRelation] = React.useState<SuppliedItemRelation>("DESIGN_ITEM");
  const [targetId, setTargetId] = React.useState("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Project-scoped and keyed by relation, so the picker offers exactly what the
  // server would accept for the selected relationship — never more.
  const options = React.useMemo(
    () => (targets.state.phase === "ready" ? (targets.state.data[relation] ?? []) : []),
    [targets.state, relation],
  );

  async function handleLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || targetId === "") return;

    setBusy(true);
    setError(null);
    try {
      await linkSuppliedItem(projectId, suppliedItemId, {
        relation,
        targetId,
        note: note.trim() === "" ? null : note.trim(),
      });
      setTargetId("");
      setNote("");
      onChanged();
    } catch (caught) {
      setError(describeApiError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function handleUnlink(link: SuppliedItemLinkDto) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await unlinkSuppliedItem(projectId, suppliedItemId, {
        relation: link.relation,
        targetId: link.targetId,
      });
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
          <Link2 className="size-4" aria-hidden="true" />
          Engineering dependencies
        </CardTitle>
        <CardDescription>
          Where this item participates in the product. These relationships are what a change-impact
          analysis walks — without them, a change declared against this item reaches nothing.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error && (
          <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </p>
        )}

        {links.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing linked yet. A supplied item with no engineering relationships is inert: a change
            declared against it will produce no downstream findings.
          </p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {links.map((link) => (
              <li
                key={`${link.relation}:${link.targetId}`}
                className="flex flex-wrap items-center justify-between gap-3 py-2.5"
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm text-foreground">
                    {link.identifier && <span className="font-mono">{link.identifier}</span>}
                    {link.identifier ? " — " : ""}
                    {link.title}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {suppliedItemRelationLabel(link.relation)}
                    {link.note ? ` · ${link.note}` : ""}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={busy}
                  onClick={() => handleUnlink(link)}
                  aria-label={`Remove link to ${link.title}`}
                >
                  <Trash2 aria-hidden="true" />
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={handleLink} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="supplied-relation"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Relationship
            </label>
            <Select
              id="supplied-relation"
              value={relation}
              onChange={(event) => {
                setRelation(event.target.value as SuppliedItemRelation);
                setTargetId("");
              }}
              disabled={busy}
              className="w-56"
            >
              {SUPPLIED_ITEM_RELATIONS.map((value) => (
                <option key={value} value={value}>
                  {suppliedItemRelationLabel(value)}
                </option>
              ))}
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="supplied-target"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Artifact
            </label>
            <Select
              id="supplied-target"
              value={targetId}
              onChange={(event) => setTargetId(event.target.value)}
              disabled={busy || options.length === 0}
              className="w-full sm:w-72"
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

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="supplied-note"
              className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            >
              Note
            </label>
            <Input
              id="supplied-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              disabled={busy}
              className="w-full sm:w-64"
              placeholder="Optional"
            />
          </div>

          <Button type="submit" disabled={busy || targetId === ""}>
            {busy ? "Saving…" : "Add link"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
