import type * as React from "react";
import Link from "next/link";
import { History } from "lucide-react";
import type { AuditEventDto } from "@/lib/api/requirements";
import type { LinkedRequirementDto } from "@/lib/api/artifacts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatIsoDate } from "@/lib/utils";

/**
 * Presentation shared by the artifact detail pages.
 *
 * Display only — each module keeps its own data loading, mutations and rules.
 * These exist so a linked-requirement list or a history entry looks the same
 * wherever it appears.
 */

export function DetailField({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{term}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
}

/**
 * Requirements linked to this artifact.
 *
 * Read-only: the edges are created and removed from a requirement's own
 * traceability panel, so this shows the reverse view rather than duplicating
 * the editing surface.
 */
export function LinkedRequirements({
  projectId,
  requirements,
  emptyMessage,
}: {
  projectId: string;
  requirements: Array<LinkedRequirementDto & { linkType?: string }>;
  emptyMessage: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Linked requirements</CardTitle>
        <CardDescription>
          Managed from each requirement&apos;s traceability panel.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {requirements.length === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyMessage}</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {requirements.map((requirement) => (
              <li
                key={`${requirement.id}-${requirement.linkType ?? ""}`}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <Link
                  href={`/projects/${projectId}/requirements/${requirement.id}`}
                  className="min-w-0 truncate text-sm text-foreground underline-offset-4 hover:underline"
                >
                  <span className="font-mono">{requirement.identifier}</span> — {requirement.title}
                </Link>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {requirement.linkType
                    ? requirement.linkType.replaceAll("_", " ").toLowerCase()
                    : requirement.status.replaceAll("_", " ").toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

const HISTORY_LABELS: Record<string, string> = {
  created: "Created",
  updated: "Updated",
  status_transitioned: "Status changed",
  owner_assigned: "Owner assigned",
  owner_cleared: "Owner cleared",
  link_added: "Traceability link added",
  link_removed: "Traceability link removed",
  // Decision memory
  alternative_added: "Alternative recorded",
  alternative_updated: "Alternative revised",
  alternative_removed: "Alternative removed",
  assumption_added: "Assumption recorded",
  assumption_updated: "Assumption revised",
  assumption_removed: "Assumption removed",
  expectation_set: "Expected outcome recorded",
  expectation_cleared: "Expected outcome cleared",
  // Verification readiness. The completed event is recorded against the
  // assessment itself, so only the start of an evaluation appears in an
  // activity's own history; the assessments are listed in the readiness panel.
  evaluation_started: "Readiness evaluation started",
  evaluated: "Readiness evaluated",
  // Supplier engineering
  linked: "Engineering link added",
  unlinked: "Engineering link removed",
  status_changed: "Status changed",
  evidence_linked: "Evidence attached",
  evidence_unlinked: "Evidence detached",
};

/**
 * A short, safe summary of the structured audit metadata.
 *
 * Only known keys are read and only scalars are rendered, so nothing
 * unexpected in the metadata reaches the page — and raw JSON never does.
 */
function historyDetail(metadata: unknown): string | null {
  if (typeof metadata !== "object" || metadata === null) return null;
  const data = metadata as Record<string, unknown>;

  if (typeof data["from"] === "string" && typeof data["to"] === "string") {
    return `${data["from"]} → ${data["to"]}`;
  }
  if (Array.isArray(data["changedFields"])) {
    const fields = data["changedFields"].filter((f): f is string => typeof f === "string");
    return fields.length > 0 ? `Changed ${fields.join(", ")}` : null;
  }
  if (typeof data["relation"] === "string") {
    return data["relation"].replaceAll("_", " ").toLowerCase();
  }
  if (typeof data["title"] === "string") return data["title"];
  if (typeof data["status"] === "string") return data["status"];
  return null;
}

/** Turns "design_item.owner_assigned" into "Owner assigned". */
function historyLabel(action: string): string {
  const suffix = action.split(".").slice(1).join(".");
  return HISTORY_LABELS[suffix] ?? action;
}

export function ArtifactHistory({ events }: { events: AuditEventDto[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4" aria-hidden="true" />
          History
        </CardTitle>
        <CardDescription>Audit events recorded against this record.</CardDescription>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-muted-foreground">No history recorded yet.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {events.map((event) => (
              <li key={event.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="flex min-w-0 flex-col">
                  <span className="text-sm text-foreground">{historyLabel(event.action)}</span>
                  <span className="text-xs text-muted-foreground">
                    {event.actor ? event.actor.name : "System"}
                    {(() => {
                      const detail = historyDetail(event.metadata);
                      return detail ? ` · ${detail}` : "";
                    })()}
                  </span>
                </div>
                <span
                  className="shrink-0 whitespace-nowrap font-mono text-xs text-muted-foreground"
                  title={event.createdAt}
                >
                  {formatIsoDate(event.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

/** Owner selector shared by the design item and verification detail pages. */
export function OwnerPanel({
  ownerName,
  ownerEmail,
  ownerId,
  members,
  disabled,
  onAssign,
}: {
  ownerName: string | null;
  ownerEmail: string | null;
  ownerId: string | null;
  members: Array<{ id: string; name: string; email: string }>;
  disabled: boolean;
  onAssign: (ownerId: string | null) => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Owner</CardTitle>
        <CardDescription>
          {ownerName ? `${ownerName} (${ownerEmail})` : "No owner assigned."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="artifact-owner-select"
            className="text-sm font-medium leading-none text-foreground"
          >
            Assign owner
          </label>
          <select
            id="artifact-owner-select"
            value={ownerId ?? ""}
            disabled={disabled}
            onChange={(event) => onAssign(event.target.value === "" ? null : event.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-card px-2.5 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
          >
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.id} value={member.id}>
                {member.name} ({member.email})
              </option>
            ))}
          </select>
        </div>
      </CardContent>
    </Card>
  );
}
