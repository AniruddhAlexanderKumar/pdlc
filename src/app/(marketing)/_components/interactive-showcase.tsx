"use client";

import * as React from "react";
import { Activity, GitBranch, Layers, ShieldCheck, Terminal } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EdgeRegistryExplorer } from "@/components/domain-explorers/edge-registry-explorer";
import { TraversalLimitsSimulator } from "@/components/domain-explorers/traversal-limits-simulator";
import { LifecycleExplorer } from "@/components/domain-explorers/lifecycle-explorer";

/**
 * Interactive showcase component for the marketing landing page.
 * Houses live domain explorers in a mission-control command center container.
 */
export function InteractiveShowcase() {
  return (
    <div className="flex flex-col gap-4 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      {/* Console Titlebar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-secondary/40 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <div className="size-2.5 rounded-full bg-destructive/60" />
            <div className="size-2.5 rounded-full bg-warning/60" />
            <div className="size-2.5 rounded-full bg-success/60" />
          </div>
          <div className="flex items-center gap-2 font-mono text-xs text-muted-foreground">
            <Terminal className="size-3.5 text-primary" aria-hidden="true" />
            <span className="font-semibold text-foreground">pdlc-kernel</span>
            <span>{"//"}</span>
            <span>live-domain-bench</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-[11px] font-mono">
          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-emerald-600 dark:text-emerald-400 font-medium">
            <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
            KERNEL ONLINE
          </span>
          <span className="hidden sm:inline text-muted-foreground">POSTGRESQL 17</span>
          <span className="hidden sm:inline text-muted-foreground">·</span>
          <span className="hidden sm:inline text-muted-foreground">DETERMINISTIC O(V+E)</span>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="p-4 sm:p-6">
        <Tabs defaultValue="registry" className="w-full">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-4">
            <div>
              <h3 className="text-base font-semibold text-foreground">Interactive Engine Inspection</h3>
              <p className="text-xs text-muted-foreground">
                Live verification tools reading the same schemas and transition engines running in production.
              </p>
            </div>

            <TabsList className="bg-secondary/60">
              <TabsTrigger value="registry" className="gap-1.5 text-xs font-medium">
                <GitBranch className="size-3.5 text-primary" aria-hidden="true" />
                <span>Relationship Registry</span>
              </TabsTrigger>
              <TabsTrigger value="limits" className="gap-1.5 text-xs font-medium">
                <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
                <span>Refusal Engine</span>
              </TabsTrigger>
              <TabsTrigger value="lifecycles" className="gap-1.5 text-xs font-medium">
                <Layers className="size-3.5 text-primary" aria-hidden="true" />
                <span>State Machines</span>
              </TabsTrigger>
            </TabsList>
          </div>

          {/* Registry Tab */}
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

          {/* Refusal Engine Tab */}
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

          {/* Lifecycle FSM Tab */}
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
