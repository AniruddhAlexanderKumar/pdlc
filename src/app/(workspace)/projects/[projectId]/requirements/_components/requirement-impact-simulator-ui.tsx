"use client";

import * as React from "react";
import {
  CheckCircle2,
  RefreshCw,
  ShieldCheck,
  Edit3,
  Zap,
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { simulateRequirementChange } from "@/lib/ai/requirement-impact-simulator";
import { BlastRadiusGraph } from "./blast-radius-graph";
import { RevalidationPanel } from "./revalidation-panel";
import { RevisionComparisonPanel } from "./revision-comparison-panel";

interface RequirementImpactSimulatorUIProps {
  requirement: {
    id: string;
    identifier: string;
    title: string;
    statement: string;
    priority: string;
    rationale?: string | null;
  };
}

export function RequirementImpactSimulatorUI({ requirement }: RequirementImpactSimulatorUIProps) {
  const [activeStep, setActiveStep] = React.useState<number>(1);
  const [proposedStatement, setProposedStatement] = React.useState<string>(
    `${requirement.statement.replace(/\d+/, "420")} (Simulated modification to reduce mass envelope ceiling).`
  );

  const simulation = React.useMemo(() => {
    return simulateRequirementChange(requirement, {
      statement: proposedStatement,
    });
  }, [requirement, proposedStatement]);

  const steps = [
    "1. Change Requirement",
    "2. Simulate Impact",
    "3. Review Blast Radius",
    "4. Resolve Dependencies",
    "5. Revalidate",
    "6. Reapprove",
    "7. Commit Change",
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* 7-Step Interaction Bar Header */}
      <Card className="border-primary/40 bg-card">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="size-5 text-primary" />
              <CardTitle className="text-base font-semibold">Requirement Change Impact Simulator</CardTitle>
            </div>
            <span className="rounded bg-primary/10 px-2.5 py-0.5 text-xs font-mono font-semibold text-primary">
              What Will This Change Break?
            </span>
          </div>
          <CardDescription>
            Simulate downstream multi-order ripple effects across the knowledge graph before committing a requirement revision.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            {steps.map((stepText, idx) => {
              const stepNum = idx + 1;
              const isActive = activeStep === stepNum;
              const isPast = activeStep > stepNum;
              return (
                <button
                  key={stepNum}
                  type="button"
                  onClick={() => setActiveStep(stepNum)}
                  className={`flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-primary text-primary-foreground shadow-xs"
                      : isPast
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isPast && <CheckCircle2 className="size-3.5" />}
                  <span>{stepText}</span>
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Step 1 & Step 2: Change & Propose */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Edit3 className="size-4 text-primary" /> Proposed Requirement Change Input
          </CardTitle>
          <CardDescription className="text-xs">
            Edit the proposed requirement text or quantitative limits to calculate multi-order downstream impact.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 pt-0 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="font-semibold text-muted-foreground uppercase text-[10px] tracking-wide">
                Current Requirement Statement ({requirement.identifier})
              </label>
              <div className="rounded border border-border bg-muted/30 p-3 font-mono text-xs text-foreground min-h-[80px]">
                {requirement.statement}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="font-semibold text-primary uppercase text-[10px] tracking-wide">
                Proposed Requirement Statement (Simulation Draft)
              </label>
              <textarea
                value={proposedStatement}
                onChange={(e) => setProposedStatement(e.target.value)}
                rows={3}
                className="w-full rounded border border-primary/40 bg-background p-3 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              size="sm"
              onClick={() => {
                setActiveStep(3);
              }}
              className="gap-1.5"
            >
              <RefreshCw className="size-3.5" /> Re-Run Downstream Simulation
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Revision Comparison Diff */}
      <RevisionComparisonPanel
        currentStatement={requirement.statement}
        proposedStatement={proposedStatement}
      />

      {/* Step 3: Interactive Blast Radius Visualizer */}
      <BlastRadiusGraph
        centerRequirementIdentifier={requirement.identifier}
        impacts={simulation.impacts}
      />

      {/* Step 4 & Step 5: Revalidation Checklist */}
      <RevalidationPanel checklist={simulation.revalidationChecklist} />

      {/* Step 6 & Step 7: Commit & Re-Gating Governance */}
      <Card className="border-emerald-500/40 bg-emerald-500/5">
        <CardHeader className="py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-5 text-emerald-500" />
              <CardTitle className="text-sm font-semibold">Commit & Approval Re-Gating Gatekeeper</CardTitle>
            </div>
            <span className="text-xs text-muted-foreground font-mono">
              7 Affected Artifacts Marked as &quot;Approval Potentially Invalidated&quot;
            </span>
          </div>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-0 text-xs">
          <p className="text-muted-foreground max-w-xl">
            Committing this revision will update the requirement baseline, flag 7 downstream approved artifacts as requiring re-review, and log the audit event.
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                alert("Simulated change draft reset.");
                setProposedStatement(requirement.statement);
              }}
            >
              Discard Simulation
            </Button>
            <Button
              size="sm"
              onClick={() => {
                alert(`Proposed requirement revision committed cleanly! Revalidation tasks assigned.`);
                setActiveStep(7);
              }}
              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <CheckCircle2 className="size-4" /> Commit Requirement Revision
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
