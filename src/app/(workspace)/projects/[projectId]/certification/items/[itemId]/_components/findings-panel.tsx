"use client";

import * as React from "react";
import { AlertOctagon, CheckCircle2, Plus } from "lucide-react";
import { certificationFindingSeveritySchema, createCertificationFindingRequestSchema } from "@/domain";
import { describeApiError } from "@/lib/api/client";
import {
  acceptFinding,
  createFinding,
  resolveFinding,
  useFindings,
} from "@/lib/api/certification";
import {
  CertificationFindingSeverityBadge,
  CertificationFindingStatusBadge,
} from "@/components/common/certification-badges";
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
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * Certification findings against one compliance item.
 *
 * Severity is a human classification, never a score. Resolution and
 * acceptance both require a note and are preserved forever — there is no
 * delete anywhere in this panel.
 */
export function FindingsPanel({ projectId, itemId }: { projectId: string; itemId: string }) {
  const findings = useFindings(projectId, itemId);
  const [isCreateOpen, setIsCreateOpen] = React.useState(false);
  const [dispositioning, setDispositioning] = React.useState<{ findingId: string; action: "resolve" | "accept" } | null>(null);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <AlertOctagon aria-hidden="true" className="h-4 w-4" />
            Certification findings
          </CardTitle>
          <CardDescription>Unresolved certification/compliance concerns against this item.</CardDescription>
        </div>
        <Button size="sm" onClick={() => setIsCreateOpen(true)}>
          <Plus aria-hidden="true" />
          New finding
        </Button>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {findings.state.phase === "loading" && <LoadingState label="Loading findings…" />}
        {findings.state.phase === "ready" && findings.state.data.length === 0 && (
          <EmptyState icon={<CheckCircle2 aria-hidden="true" />} title="No findings recorded" description="Nothing has been raised against this item." />
        )}
        {findings.state.phase === "ready" &&
          findings.state.data.map((finding) => (
            <div key={finding.id} className="flex flex-col gap-2 rounded-md border border-border px-3 py-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-xs">{finding.identifier}</span>
                <div className="flex items-center gap-2">
                  <CertificationFindingSeverityBadge severity={finding.severity} />
                  <CertificationFindingStatusBadge status={finding.status} />
                </div>
              </div>
              <p>{finding.title}</p>
              {finding.description && <p className="text-muted-foreground text-xs">{finding.description}</p>}
              {finding.resolutionNote && (
                <p className="text-muted-foreground text-xs">
                  {finding.status} — {finding.resolutionNote}
                </p>
              )}
              {(finding.status === "OPEN" || finding.status === "IN_PROGRESS") && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => setDispositioning({ findingId: finding.id, action: "resolve" })}>
                    Resolve
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setDispositioning({ findingId: finding.id, action: "accept" })}>
                    Accept
                  </Button>
                </div>
              )}
            </div>
          ))}
      </CardContent>

      <CreateFindingDialog
        projectId={projectId}
        itemId={itemId}
        open={isCreateOpen}
        onOpenChange={setIsCreateOpen}
        onSaved={() => findings.reload()}
      />

      {dispositioning && (
        <DispositionDialog
          projectId={projectId}
          itemId={itemId}
          findingId={dispositioning.findingId}
          action={dispositioning.action}
          open={true}
          onOpenChange={(open) => {
            if (!open) setDispositioning(null);
          }}
          onSaved={() => findings.reload()}
        />
      )}
    </Card>
  );
}

function CreateFindingDialog({
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New certification finding</DialogTitle>
          <DialogDescription>Severity is an explicit classification — never a derived score.</DialogDescription>
        </DialogHeader>
        {/* Mounted only while open, so its fields always start blank — no reset effect. */}
        {open && (
          <CreateFindingFormBody
            projectId={projectId}
            itemId={itemId}
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

function CreateFindingFormBody({
  projectId,
  itemId,
  onCancel,
  onSaved,
}: {
  projectId: string;
  itemId: string;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [identifier, setIdentifier] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [severity, setSeverity] = React.useState<(typeof certificationFindingSeveritySchema.options)[number]>("MEDIUM");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting) return;
    const parsed = createCertificationFindingRequestSchema.safeParse({
      identifier,
      title,
      description: description.trim() === "" ? null : description,
      severity,
    });
    if (!parsed.success) {
      setError("Check the identifier and title.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await createFinding(projectId, itemId, parsed.data);
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
          <span className="text-muted-foreground text-xs">Identifier</span>
          <Input value={identifier} onChange={(event) => setIdentifier(event.target.value.toUpperCase())} disabled={isSubmitting} className="font-mono" placeholder="CF-001" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground text-xs">Title</span>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} disabled={isSubmitting} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground text-xs">Severity</span>
          <Select value={severity} onChange={(event) => setSeverity(event.target.value as typeof severity)} disabled={isSubmitting}>
            {certificationFindingSeveritySchema.options.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </Select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground text-xs">Description</span>
          <Textarea value={description} onChange={(event) => setDescription(event.target.value)} disabled={isSubmitting} rows={3} />
        </label>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={isSubmitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : "Create finding"}
        </Button>
      </DialogFooter>
    </form>
  );
}

function DispositionDialog({
  projectId,
  itemId,
  findingId,
  action,
  open,
  onOpenChange,
  onSaved,
}: {
  projectId: string;
  itemId: string;
  findingId: string;
  action: "resolve" | "accept";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [note, setNote] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isSubmitting || note.trim() === "") return;
    setIsSubmitting(true);
    setError(null);
    try {
      if (action === "resolve") {
        await resolveFinding(projectId, itemId, findingId, note);
      } else {
        await acceptFinding(projectId, itemId, findingId, note);
      }
      onSaved();
      onOpenChange(false);
    } catch (submitError) {
      setError(describeApiError(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{action === "resolve" ? "Resolve finding" : "Accept finding"}</DialogTitle>
          <DialogDescription>A note, an actor and a timestamp are all preserved — this finding is never deleted.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} noValidate>
          <div className="flex flex-col gap-4">
            {error && <p className="text-destructive text-sm">{error}</p>}
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted-foreground text-xs">Note</span>
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} disabled={isSubmitting} rows={3} required />
            </label>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || note.trim() === ""}>
              {isSubmitting ? "Saving…" : action === "resolve" ? "Resolve" : "Accept"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
