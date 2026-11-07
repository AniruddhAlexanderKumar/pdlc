"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { CHANGE_IMPACT_TARGET_TYPES, type ChangeImpactTargetType } from "@/domain";
import { type DeclaredImpactDto, useChangeImpactTargets } from "@/lib/api/changes";
import { ImpactTargetBadge, impactTargetLabel } from "@/components/common/change-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { formatIsoDate } from "@/lib/utils";

/**
 * What a change *declares* it affects.
 *
 * Every label on this panel says "declared". These rows are assertions made by
 * an engineer: nobody has confirmed that any of them are actually affected, nor
 * that the list is complete.
 *
 * The impact engine reads these as its roots but never writes back here. That
 * separation is the point — a reader must be able to tell what a person claimed
 * from what the graph implied.
 */
export function DeclaredImpactsSection({
  projectId,
  impacts,
  editable,
  busy,
  onAdd,
  onRemove,
}: {
  projectId: string;
  impacts: DeclaredImpactDto[];
  editable: boolean;
  busy: boolean;
  onAdd: (input: { type: ChangeImpactTargetType; targetId: string; note: string | null }) => void;
  onRemove: (impactId: string) => void;
}) {
  const targets = useChangeImpactTargets(projectId);
  const [type, setType] = React.useState<ChangeImpactTargetType>("REQUIREMENT");
  const [targetId, setTargetId] = React.useState("");
  const [note, setNote] = React.useState("");

  const options = targets.state.phase === "ready" ? targets.state.data[type] : [];

  // Anything already declared is not offered again: the table is unique per
  // (change, target), so re-picking it could only produce a conflict.
  const declaredIds = new Set(
    impacts.filter((impact) => impact.target.type === type).map((impact) => impact.target.id),
  );
  const available = options.filter((option) => !declaredIds.has(option.id));

  function handleAdd() {
    if (!targetId) return;
    onAdd({ type, targetId, note: note.trim() === "" ? null : note.trim() });
    setTargetId("");
    setNote("");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Declared impacts</CardTitle>
        <CardDescription>
          Artifacts the requester states this change affects. These are assertions. What the
          engine derived from them is shown separately, under computed impact.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {impacts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing declared yet. Nothing has been inferred either.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {impacts.map((impact) => (
              <li
                key={impact.id}
                className="flex items-start justify-between gap-4 rounded-lg border border-border p-3"
              >
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <ImpactTargetBadge type={impact.target.type} />
                    {impact.targetIdentifier && (
                      <span className="font-mono text-sm font-medium">
                        {impact.targetIdentifier}
                      </span>
                    )}
                    <span className="text-sm">{impact.targetTitle}</span>
                  </div>
                  {impact.note && <p className="text-sm text-muted-foreground">{impact.note}</p>}
                  <p className="text-xs text-muted-foreground">
                    Declared by {impact.createdBy?.name ?? "an unknown user"} on{" "}
                    {formatIsoDate(impact.createdAt)}
                  </p>
                </div>
                {editable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => onRemove(impact.id)}
                    aria-label={`Withdraw declared impact on ${
                      impact.targetIdentifier ?? impact.targetTitle
                    }`}
                  >
                    <Trash2 aria-hidden="true" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {editable ? (
          <div className="flex flex-col gap-3 border-t border-border pt-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="impact-type">Artifact type</Label>
                <Select
                  id="impact-type"
                  value={type}
                  disabled={busy}
                  onChange={(event) => {
                    setType(event.target.value as ChangeImpactTargetType);
                    setTargetId("");
                  }}
                >
                  {CHANGE_IMPACT_TARGET_TYPES.map((value) => (
                    <option key={value} value={value}>
                      {impactTargetLabel(value)}
                    </option>
                  ))}
                </Select>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="impact-target">Artifact</Label>
                <Select
                  id="impact-target"
                  value={targetId}
                  disabled={busy || targets.state.phase !== "ready" || available.length === 0}
                  onChange={(event) => setTargetId(event.target.value)}
                >
                  <option value="">
                    {available.length === 0
                      ? `No ${impactTargetLabel(type).toLowerCase()} available`
                      : "Select an artifact"}
                  </option>
                  {available.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.identifier} — {option.title}
                    </option>
                  ))}
                </Select>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="impact-note">Why is it affected?</Label>
              <Input
                id="impact-note"
                value={note}
                disabled={busy}
                placeholder="Optional rationale"
                onChange={(event) => setNote(event.target.value)}
              />
            </div>

            <Button
              size="sm"
              className="self-start"
              disabled={busy || !targetId}
              onClick={handleAdd}
            >
              <Plus aria-hidden="true" />
              Declare impact
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            The declared scope of this change is fixed at its current status.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
