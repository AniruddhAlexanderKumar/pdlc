"use client";

import * as React from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  FileCheck,
  GitBranch,
  Layers,
  Play,
  ShieldCheck,
  Sparkles,
  Terminal,
  Zap,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EdgeRegistryExplorer } from "@/components/domain-explorers/edge-registry-explorer";
import { TraversalLimitsSimulator } from "@/components/domain-explorers/traversal-limits-simulator";
import { LifecycleExplorer } from "@/components/domain-explorers/lifecycle-explorer";

/**
 * Enhanced interactive showcase component for the marketing landing page.
 * Houses live domain explorers and live feature test sandboxes.
 */
export function InteractiveShowcase() {
  const [qualityInput, setQualityInput] = React.useState(
    "The propulsion valve shall open fast enough to maintain adequate fuel pressure during engine startup."
  );
  const [qualityOutput, setQualityOutput] = React.useState<string | null>(null);
  const [isQualityRunning, setIsQualityRunning] = React.useState(false);

  const [impactInput, setImpactInput] = React.useState(
    "Increase REQ-PROP-001 (Chamber Pressure) baseline from 100 bar to 125 bar."
  );
  const [impactOutput, setImpactOutput] = React.useState<string | null>(null);
  const [isImpactRunning, setIsImpactRunning] = React.useState(false);

  const handleRunQualityCheck = () => {
    setIsQualityRunning(true);
    setQualityOutput(null);

    setTimeout(() => {
      setIsQualityRunning(false);
      setQualityOutput(
        "FLAGGED 3 QUALITY FLAWS:\n• Ambiguity / Subjective: 'fast enough'\n• Ambiguity / Subjective: 'adequate'\n• Missing Units: Response time limit (ms) & Pressure tolerance (bar/kPa)\n\nRECOMMENDED REWRITE:\n'The propulsion valve shall actuate from fully closed to 100% open in <= 45 ms to maintain fuel manifold pressure at 120 ± 0.5 bar during ignition sequence T-0.'"
      );
    }, 500);
  };

  const handleRunImpactSim = () => {
    setIsImpactRunning(true);
    setImpactOutput(null);

    setTimeout(() => {
      setIsImpactRunning(false);
      setImpactOutput(
        "BLAST RADIUS ANALYSIS RESULT:\n• 1st Order (Direct): 3 Downstream Requirements (REQ-042, REQ-089, REQ-104)\n• 2nd Order (Cross-Domain): 2 Design Decisions (DEC-012, DEC-018)\n• 3rd Order (Verification): 4 Test Plans & 3 Component Specifications\n• Status: 12 downstream items marked as APPROVAL_POTENTIALLY_INVALIDATED\n• Checklist: Revalidation Plan SCN-REVAL-902 generated."
      );
    }, 600);
  };

  return (
    <div className="flex flex-col gap-4 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* Component Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-3.5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Layers className="size-4" aria-hidden="true" />
          </div>
          <span className="text-sm font-bold text-foreground">
            Interactive Domain & Feature Bench
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            PostgreSQL 17 Engine Online
          </span>
          <span className="hidden sm:inline font-mono text-[11px]">Deterministic O(V+E)</span>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="p-4 sm:p-6">
        <Tabs defaultValue="quality" className="w-full">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">Interactive Feature Bench</h3>
              <p className="text-xs text-muted-foreground">
                Test live requirement quality analysis, change impact simulation, and graph rules in your browser.
              </p>
            </div>

            <TabsList className="bg-secondary/60 flex flex-wrap h-auto p-1">
              <TabsTrigger value="quality" className="gap-1.5 text-xs font-medium">
                <FileCheck className="size-3.5 text-primary" aria-hidden="true" />
                <span>Quality Inspector</span>
              </TabsTrigger>
              <TabsTrigger value="impact" className="gap-1.5 text-xs font-medium">
                <Zap className="size-3.5 text-primary" aria-hidden="true" />
                <span>Impact Simulator</span>
              </TabsTrigger>
              <TabsTrigger value="registry" className="gap-1.5 text-xs font-medium">
                <GitBranch className="size-3.5 text-primary" aria-hidden="true" />
                <span>Relationship Registry</span>
              </TabsTrigger>
              <TabsTrigger value="limits" className="gap-1.5 text-xs font-medium">
                <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
                <span>Safety Engine</span>
              </TabsTrigger>
              <TabsTrigger value="lifecycles" className="gap-1.5 text-xs font-medium">
                <Layers className="size-3.5 text-primary" aria-hidden="true" />
                <span>State Machines</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* 1. Quality Inspector Tab */}
          <TabsContent value="quality" className="pt-3">
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-secondary/20 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkles className="size-4 text-primary" />
                  <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Requirements Quality & Ambiguity Inspector
                  </span>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  12 Quality Criteria
                </Badge>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-muted-foreground">Sample Requirement Statement:</label>
                <input
                  type="text"
                  value={qualityInput}
                  onChange={(e) => setQualityInput(e.target.value)}
                  className="w-full rounded-md border border-input bg-background p-2.5 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  onClick={handleRunQualityCheck}
                  disabled={isQualityRunning}
                  className="gap-1.5 text-xs"
                >
                  <Play className="size-3.5" />
                  {isQualityRunning ? "Analyzing Criteria..." : "Run Quality Inspection"}
                </Button>
              </div>

              {qualityOutput && (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="size-4" /> Inspection Result:
                  </div>
                  <pre className="mt-1 font-mono text-[11px] text-foreground leading-relaxed whitespace-pre-wrap">
                    {qualityOutput}
                  </pre>
                </div>
              )}
            </div>
          </TabsContent>

          {/* 2. Impact Simulator Tab */}
          <TabsContent value="impact" className="pt-3">
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-secondary/20 p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Zap className="size-4 text-primary" />
                  <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                    Requirement Change Impact Simulator
                  </span>
                </div>
                <Badge variant="outline" className="text-[10px]">
                  Blast Radius Graph
                </Badge>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-muted-foreground">Proposed Change Statement:</label>
                <input
                  type="text"
                  value={impactInput}
                  onChange={(e) => setImpactInput(e.target.value)}
                  className="w-full rounded-md border border-input bg-background p-2.5 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              </div>

              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  onClick={handleRunImpactSim}
                  disabled={isImpactRunning}
                  className="gap-1.5 text-xs"
                >
                  <Play className="size-3.5" />
                  {isImpactRunning ? "Traversing Knowledge Graph..." : "Simulate Downstream Blast Radius"}
                </Button>
              </div>

              {impactOutput && (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="size-4" /> Graph Traversal Result:
                  </div>
                  <pre className="mt-1 font-mono text-[11px] text-foreground leading-relaxed whitespace-pre-wrap">
                    {impactOutput}
                  </pre>
                </div>
              )}
            </div>
          </TabsContent>

          {/* 3. Registry Tab */}
          <TabsContent value="registry" className="pt-2">
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2 rounded-md bg-secondary/30 p-3 text-xs text-muted-foreground">
                <Activity className="size-4 shrink-0 text-primary mt-0.5" aria-hidden="true" />
                <p>
                  Every relationship below is enforced by a PostgreSQL foreign key. Select any domain node type to view its authoritative incoming and outgoing edges, verified by the runtime traversal engine.
                </p>
              </div>
              <EdgeRegistryExplorer />
            </div>
          </TabsContent>

          {/* 4. Refusal Engine Tab */}
          <TabsContent value="limits" className="pt-2">
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2 rounded-md bg-secondary/30 p-3 text-xs text-muted-foreground">
                <ShieldCheck className="size-4 shrink-0 text-primary mt-0.5" aria-hidden="true" />
                <p>
                  Safety-critical systems require predictable computational boundaries. Move the sliders beyond the safety thresholds to observe deterministic refusal instead of silent truncation or memory exhaustion.
                </p>
              </div>
              <TraversalLimitsSimulator />
            </div>
          </TabsContent>

          {/* 5. Lifecycle FSM Tab */}
          <TabsContent value="lifecycles" className="pt-2">
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2 rounded-md bg-secondary/30 p-3 text-xs text-muted-foreground">
                <Layers className="size-4 shrink-0 text-primary mt-0.5" aria-hidden="true" />
                <p>
                  Artifact lifecycles follow mathematical finite state machines (FSM). Unauthorized transitions are strictly prevented by transactional domain rules, ensuring compliance with airworthiness review baselines.
                </p>
              </div>
              <LifecycleExplorer />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
