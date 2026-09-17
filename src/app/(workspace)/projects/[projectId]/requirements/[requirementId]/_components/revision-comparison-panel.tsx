"use client";

import * as React from "react";
import { History, ArrowRight, CheckCircle2, FileDiff } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

interface RevisionComparisonPanelProps {
  currentStatement: string;
  previousStatement?: string;
  proposedStatement: string;
}

export function RevisionComparisonPanel({
  currentStatement,
  previousStatement = "The system shall maintain payload bay thermal dissipation within 500 W under max operating condition.",
  proposedStatement,
}: RevisionComparisonPanelProps) {
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <FileDiff className="size-5 text-primary" />
          <CardTitle className="text-sm font-semibold">Requirement Revision & Impact Diff Comparison</CardTitle>
        </div>
        <CardDescription className="text-xs">
          Compare the statement diff across Previous, Current Baseline, and Proposed Revisions.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs pt-0">
        {/* Previous Version */}
        <div className="rounded border border-border bg-muted/20 p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-border pb-1">
            <span className="font-semibold text-muted-foreground">Revision 1 (Previous)</span>
            <span className="text-[10px] text-muted-foreground font-mono">Archived</span>
          </div>
          <p className="text-muted-foreground font-mono text-[11px] leading-relaxed line-through">
            {previousStatement}
          </p>
          <span className="text-[10px] text-muted-foreground mt-auto">Impacted 2 items in Rev 1</span>
        </div>

        {/* Current Version */}
        <div className="rounded border border-primary/30 bg-primary/5 p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-primary/20 pb-1">
            <span className="font-semibold text-primary">Revision 2 (Current Baseline)</span>
            <span className="text-[10px] bg-primary/10 text-primary font-mono px-1.5 py-0.5 rounded font-semibold">Active</span>
          </div>
          <p className="text-foreground font-mono text-[11px] leading-relaxed">
            {currentStatement}
          </p>
          <span className="text-[10px] text-primary font-medium mt-auto">Active baseline reference</span>
        </div>

        {/* Proposed Version */}
        <div className="rounded border border-amber-500/40 bg-amber-500/5 p-3 flex flex-col gap-2">
          <div className="flex items-center justify-between border-b border-amber-500/20 pb-1">
            <span className="font-semibold text-amber-600 dark:text-amber-400">Revision 3 (Proposed Simulation)</span>
            <span className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 font-mono px-1.5 py-0.5 rounded font-semibold">Draft</span>
          </div>
          <p className="text-foreground font-mono text-[11px] leading-relaxed bg-amber-500/10 p-2 rounded">
            {proposedStatement}
          </p>
          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium mt-auto">
            Simulated Blast Radius: 7 Downstream Impacts
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
