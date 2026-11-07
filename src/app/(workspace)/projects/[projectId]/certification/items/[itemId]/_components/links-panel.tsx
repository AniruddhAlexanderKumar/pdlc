"use client";

import * as React from "react";
import { createComplianceLinkRequestSchema } from "@/domain";
import type { ComplianceLinkType } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import { addLink, removeLink, useLinkTargets, useLinks } from "@/lib/api/certification";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import { Link2, Plus, Trash2, Waypoints } from "lucide-react";

const LINK_TYPE_LABELS: Record<ComplianceLinkType, string> = {
  REQUIREMENT: "Requirement",
  VERIFICATION_ACTIVITY: "Verification activity",
  EVIDENCE: "Evidence",
  ENGINEERING_DECISION: "Engineering decision",
  DESIGN_ITEM: "Design item",
  RISK: "Risk",
  ISSUE: "Issue",
  SUPPLIER_QUALIFICATION: "Supplier qualification",
};

/**
 * The compliance item's traceability hub: every real engineering object it
 * links to, across the eight declared link types. Only these eight types
 * exist — there is no free-text "other" link.
 */
export function LinksPanel({ projectId, itemId }: { projectId: string; itemId: string }) {
  const links = useLinks(projectId, itemId);
  const [isAddOpen, setIsAddOpen] = React.useState(false);
  const [removingId, setRemovingId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function handleRemove(linkId: string) {
    setRemovingId(linkId);
    setError(null);
    try {
      await removeLink(projectId, itemId, linkId);
      links.reload();
    } catch (removeError) {
      setError(describeApiError(removeError));
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Waypoints aria-hidden="true" className="h-4 w-4" />
            Engineering links
          </CardTitle>
          <CardDescription>
            Requirement, verification, decision, design, evidence, risk, issue and supplier
            qualification links this obligation actually rests on.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setIsAddOpen(true)}>
          <Plus aria-hidden="true" />
          Add link
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {error && <p className="text-destructive text-sm">{error}</p>}
        {links.state.phase === "loading" && <LoadingState label="Loading links…" />}
        {links.state.phase === "ready" && links.state.data.length === 0 && (
          <EmptyState icon={<Link2 aria-hidden="true" />} title="No links yet" description="Link this item to the requirement, verification activity, decision, design item, evidence, risk, issue or supplier qualification it depends on." />
        )}
        {links.state.phase === "ready" && links.state.data.length > 0 && (
          <ul className="flex flex-col gap-2">
            {links.state.data.map((link) => (
              <li key={link.id} className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                <div>
                  <span className="text-muted-foreground text-xs">{LINK_TYPE_LABELS[link.linkType]}</span>
                  <p>
                    {link.targetIdentifier ? <span className="font-mono text-xs">{link.targetIdentifier} — </span> : null}
                    {link.targetLabel}
                  </p>
                  {link.note && <p className="text-muted-foreground text-xs">{link.note}</p>}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemove(link.id)}
                  disabled={removingId === link.id}
                  aria-label={`Remove link to ${link.targetLabel}`}
                >
                  <Trash2 aria-hidden="true" className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <AddLinkDialog
        projectId={projectId}
        itemId={itemId}
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        onSaved={() => links.reload()}
      />
    </Card>
  );
}

function AddLinkDialog({
  projectId,
  itemId,
  open,
  onOpenChange,
  onSaved,
}: {
  projectId: string;
  itemId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const targets = useLinkTargets(projectId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add engineering link</DialogTitle>
          <DialogDescription>The target is re-checked against this project — a link can never reach another project.</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so its fields always start blank — no reset effect. */}
        {open && (
          <AddLinkFormBody
            projectId={projectId}
            itemId={itemId}
            targets={targets.state.phase === "ready" ? targets.state.data : null}
            onCancel={() => onOpenChange(false)}
            onSaved={() => {
              onSaved();
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function AddLinkFormBody({
  projectId,
  itemId,
  targets,
  onCancel,
  onSaved,
}: {
  projectId: string;
  itemId: string;
  targets: Record<ComplianceLinkType, { id: string; identifier: string; title: string }[]> | null;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [linkType, setLinkType] = React.useState<ComplianceLinkType>("REQUIREMENT");
  const [targetId, setTargetId] = React.useState("");
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const options = targets ? targets[linkType] : [];

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    const parsed = createComplianceLinkRequestSchema.safeParse({
      linkType,
      targetId,
      note: note.trim() === "" ? null : note,
    });
    if (!parsed.success) {
      setError("Choose a target.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await addLink(projectId, itemId, parsed.data);
      onSaved();
    } catch (submitError) {
      setError(describeApiError(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-4">
        {error && <p className="text-destructive text-sm">{error}</p>}
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground text-xs">Link type</span>
          <Select
            value={linkType}
            onChange={(event) => {
              setLinkType(event.target.value as ComplianceLinkType);
              setTargetId("");
            }}
            disabled={isSubmitting}
          >
            {(Object.keys(LINK_TYPE_LABELS) as ComplianceLinkType[]).map((type) => (
              <option key={type} value={type}>
                {LINK_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground text-xs">Target</span>
          <Select value={targetId} onChange={(event) => setTargetId(event.target.value)} disabled={isSubmitting}>
            <option value="">Select…</option>
            {options?.map((option) => (
              <option key={option.id} value={option.id}>
                {option.identifier} — {option.title}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground text-xs">Note</span>
          <input
            className="flex h-9 w-full rounded-md border border-input bg-card px-2.5 py-1 text-sm shadow-sm"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={isSubmitting}
          />
        </label>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting || !targetId}>
          {isSubmitting ? "Linking…" : "Add link"}
        </Button>
      </DialogFooter>
    </form>
  );
}
