"use client";

import * as React from "react";
import { CheckSquare, AlertTriangle, FileText, HelpCircle, TestTube, Users, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { RevalidationChecklist } from "@/domain/requirement-change-simulator";

interface RevalidationPanelProps {
  checklist: RevalidationChecklist;
  onMarkTaskDone?: (taskId: string) => void;
}

export function RevalidationPanel({ checklist, onMarkTaskDone }: RevalidationPanelProps) {
  return (
    <Card className="border-amber-500/40 bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckSquare className="size-5 text-amber-500" />
            <CardTitle className="text-sm font-semibold">What Must Be Revalidated?</CardTitle>
          </div>
          <span className="rounded bg-amber-500/10 px-2.5 py-0.5 text-xs font-mono font-semibold text-amber-600 dark:text-amber-400">
            {checklist.totalTasksCount} Engineering Tasks Remaining
          </span>
        </div>
        <CardDescription className="text-xs">
          Minimum mandatory engineering work required before this proposed requirement change can be committed to the baseline.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-0">
        {/* Requirements Review */}
        <div className="rounded border border-border bg-muted/20 p-3 flex flex-col gap-2">
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <FileText className="size-4 text-primary" /> Requirements Requiring Review ({checklist.requirementsRequiringReview.length})
          </span>
          {checklist.requirementsRequiringReview.map((req) => (
            <div key={req.id} className="flex items-center justify-between rounded bg-background p-2 border border-border/60">
              <span className="font-mono text-primary font-semibold">{req.identifier}</span>
              <span className="truncate text-foreground max-w-[180px]">{req.title}</span>
            </div>
          ))}
        </div>

        {/* Questions Redefinition */}
        <div className="rounded border border-border bg-muted/20 p-3 flex flex-col gap-2">
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <HelpCircle className="size-4 text-primary" /> Questions Requiring Redefinition ({checklist.questionsRequiringRedefinition.length})
          </span>
          {checklist.questionsRequiringRedefinition.map((q) => (
            <div key={q.id} className="rounded bg-background p-2 border border-border/60 text-foreground italic">
              &quot;{q.question}&quot;
            </div>
          ))}
        </div>

        {/* Tests & Procedures */}
        <div className="rounded border border-border bg-muted/20 p-3 flex flex-col gap-2">
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <TestTube className="size-4 text-primary" /> Tests Requiring Modification ({checklist.testsRequiringModification.length})
          </span>
          {checklist.testsRequiringModification.map((t) => (
            <div key={t.id} className="flex items-center justify-between rounded bg-background p-2 border border-border/60">
              <span className="font-mono text-primary font-semibold">{t.identifier}</span>
              <span className="truncate text-foreground max-w-[180px]">{t.title}</span>
            </div>
          ))}
        </div>

        {/* Stakeholder Reapproval */}
        <div className="rounded border border-border bg-muted/20 p-3 flex flex-col gap-2">
          <span className="font-semibold text-foreground flex items-center gap-1.5">
            <Users className="size-4 text-primary" /> Stakeholders Requiring Reapproval ({checklist.stakeholdersRequiringReapproval.length})
          </span>
          {checklist.stakeholdersRequiringReapproval.map((stk) => (
            <div key={stk.id} className="flex items-center justify-between rounded bg-background p-2 border border-border/60">
              <span className="font-semibold text-foreground">{stk.name}</span>
              <span className="text-[10px] text-muted-foreground">{stk.role}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
