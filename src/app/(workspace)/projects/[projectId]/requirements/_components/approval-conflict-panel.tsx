"use client";

import * as React from "react";
import { ShieldAlert, CheckCircle2, XCircle, AlertTriangle, Users, FileText, Scale } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { RequirementsConflictRecord } from "@/domain/requirements-conflict";

interface ApprovalConflictPanelProps {
  conflicts: RequirementsConflictRecord[];
  onResolveConflict?: (conflictId: string) => void;
}

export function ApprovalConflictPanel({ conflicts, onResolveConflict }: ApprovalConflictPanelProps) {
  if (conflicts.length === 0) {
    return (
      <Card className="border-border bg-card">
        <CardHeader className="py-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 text-emerald-500" />
            <CardTitle className="text-sm">Stakeholder Agreement Status</CardTitle>
          </div>
          <CardDescription className="text-xs">
            No active stakeholder interpretation conflicts detected. All requirements are aligned or pending initial review.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-amber-500" />
            <CardTitle className="text-sm font-semibold text-foreground">
              Stakeholder Agreement & Interpretation Conflicts ({conflicts.length})
            </CardTitle>
          </div>
          <span className="rounded bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono font-semibold text-amber-600 dark:text-amber-400">
            Action Required
          </span>
        </div>
        <CardDescription className="text-xs">
          The engine surfaced differing stakeholder positions and interpretations. Review evidence below to reach human resolution.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 pt-0">
        {conflicts.map((conflict) => (
          <div key={conflict.id} className="rounded-md border border-border bg-background p-3 text-xs flex flex-col gap-2">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-primary">{conflict.requirementIdentifier}</span>
                <span className="font-medium text-foreground">{conflict.requirementTitle}</span>
              </div>
              <span className="rounded bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                {conflict.currentDecisionStatus}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 my-1">
              {conflict.positions.map((pos, idx) => (
                <div key={idx} className="rounded border border-border/60 bg-muted/30 p-2 text-xs flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-foreground flex items-center gap-1">
                      <Users className="size-3 text-muted-foreground" /> {pos.stakeholderName}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-1.5 py-0.2 rounded ${
                        pos.position === "AGREE"
                          ? "bg-emerald-500/10 text-emerald-600"
                          : "bg-red-500/10 text-red-600"
                      }`}
                    >
                      {pos.position}
                    </span>
                  </div>
                  <p className="text-muted-foreground italic">&quot;{pos.interpretation}&quot;</p>
                  {pos.supportingEvidence && (
                    <span className="text-[10px] text-primary flex items-center gap-1 mt-1">
                      <FileText className="size-3" /> Evidence: {pos.supportingEvidence}
                    </span>
                  )}
                </div>
              ))}
            </div>

            <div className="rounded bg-amber-500/10 p-2 text-[11px] text-amber-800 dark:text-amber-200 flex flex-col gap-1">
              <strong>Potential Engineering Impact:</strong> {conflict.potentialEngineeringImpact}
              <strong>Required Info to Resolve:</strong> {conflict.requiredInformationToResolve}
            </div>

            {onResolveConflict && (
              <div className="flex justify-end pt-1">
                <Button variant="outline" size="sm" onClick={() => onResolveConflict(conflict.id)} className="gap-1 text-xs">
                  <Scale className="size-3.5" /> Resolve Disagreement Record
                </Button>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
