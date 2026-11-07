"use client";

import * as React from "react";
import { Activity, AlertTriangle, CheckCircle2, FileCheck, GitBranch, Layers, Play, ShieldCheck } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { requirementFlawTypeSchema } from "@/domain/requirement-quality";
import { inspectRequirementQuality } from "@/lib/ai/requirement-quality-inspector";
import { EdgeRegistryExplorer } from "@/components/domain-explorers/edge-registry-explorer";
import { TraversalLimitsSimulator } from "@/components/domain-explorers/traversal-limits-simulator";
import { LifecycleExplorer } from "@/components/domain-explorers/lifecycle-explorer";

const QUALITY_FLAW_COUNT = requirementFlawTypeSchema.options.length;

/**
 * Four things a visitor can actually run, in the browser, before signing up
 * — not a demo reel. Three of the four import the same pure functions and
 * constants the product itself reads (see each explorer's own doc comment);
 * there is nothing here to fall out of sync with the real thing because it
 * is the real thing.
 *
 * This used to be five tabs, and the first two ran on a `setTimeout` that
 * returned the same hardcoded paragraph regardless of what was typed —
 * exactly the "looks live, is not" pattern this product refuses everywhere
 * else. The quality check below now calls `inspectRequirementQuality`
 * directly; a change-impact simulator that would need real project data was
 * removed rather than faked.
 */
export function InteractiveShowcase() {
  const [statement, setStatement] = React.useState(
    "The propulsion valve shall open fast enough to maintain adequate fuel pressure during engine startup.",
  );

  /**
   * `inspectRequirementQuality` also flags a missing owner, verification
   * method and rationale — real checks, but not ones this demo lets a
   * visitor edit. Left unset, those three would flag on every statement
   * regardless of what was typed, so no text could ever show "no flaws
   * found" and the live-ness of the demo would be impossible to see. Fixed
   * stand-in values keep every remaining flaw tied to the one field a
   * visitor actually controls.
   */
  const result = React.useMemo(
    () =>
      inspectRequirementQuality({
        title: "Sample requirement",
        statement,
        rationale: "Demonstrates the live quality check on this page.",
        ownerId: "demo",
        verificationMethod: "TEST",
      }),
    [statement],
  );

  return (
    <div className="flex flex-col gap-4 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-muted/40 px-5 py-3.5 sm:px-6">
        <div className="flex items-center gap-2.5">
          <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Layers className="size-4" aria-hidden="true" />
          </div>
          <span className="text-sm font-bold text-foreground">Try it without an account</span>
        </div>
        <span className="text-xs text-muted-foreground">
          Each tab runs the same logic the signed-in product uses.
        </span>
      </div>

      <div className="p-4 sm:p-6">
        <Tabs defaultValue="quality" className="w-full">
          <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">Interactive bench</h3>
              <p className="text-xs text-muted-foreground">
                Requirement quality checking, the real relationship registry, traversal limits, and
                lifecycle rules — all in your browser.
              </p>
            </div>

            <TabsList className="flex h-auto flex-wrap bg-secondary/60 p-1">
              <TabsTrigger value="quality" className="gap-1.5 text-xs font-medium">
                <FileCheck className="size-3.5 text-primary" aria-hidden="true" />
                <span>Quality check</span>
              </TabsTrigger>
              <TabsTrigger value="registry" className="gap-1.5 text-xs font-medium">
                <GitBranch className="size-3.5 text-primary" aria-hidden="true" />
                <span>Relationships</span>
              </TabsTrigger>
              <TabsTrigger value="limits" className="gap-1.5 text-xs font-medium">
                <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
                <span>Traversal limits</span>
              </TabsTrigger>
              <TabsTrigger value="lifecycles" className="gap-1.5 text-xs font-medium">
                <Layers className="size-3.5 text-primary" aria-hidden="true" />
                <span>Lifecycle rules</span>
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="quality" className="pt-3">
            <div className="flex flex-col gap-4 rounded-lg border border-border bg-secondary/20 p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                  Requirement quality check
                </span>
                <Badge variant="outline" className="text-[10px]">
                  {QUALITY_FLAW_COUNT} checks, run live
                </Badge>
              </div>

              <div className="flex flex-col gap-2">
                <label htmlFor="showcase-quality-input" className="text-xs font-medium text-muted-foreground">
                  Type or edit a requirement statement:
                </label>
                <input
                  id="showcase-quality-input"
                  type="text"
                  value={statement}
                  onChange={(event) => setStatement(event.target.value)}
                  className="w-full rounded-md border border-input bg-background p-2.5 font-mono text-xs text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Play className="size-3 shrink-0" aria-hidden="true" />
                  Updates as you type — this is the real check, not a scripted example.
                </p>
              </div>

              {result.flaws.length === 0 ? (
                <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="size-4" aria-hidden="true" /> No flaws found
                  </div>
                  <p className="mt-1 text-foreground">
                    Status: <span className="font-mono">{result.qualityStatus}</span>
                  </p>
                </div>
              ) : (
                <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-amber-700 dark:text-amber-400">
                    <AlertTriangle className="size-4" aria-hidden="true" />
                    {result.flaws.length} flaw{result.flaws.length === 1 ? "" : "s"} found
                  </div>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {result.flaws.map((flaw) => (
                      <li key={flaw.flawType} className="text-foreground">
                        <span className="font-mono text-[10px] text-muted-foreground">{flaw.flawType}</span>
                        <br />
                        {flaw.description}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="registry" className="pt-2">
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2 rounded-md bg-secondary/30 p-3 text-xs text-muted-foreground">
                <Activity className="size-4 shrink-0 text-primary mt-0.5" aria-hidden="true" />
                <p>
                  Pick any object type to see every relationship it can have — read live from the
                  same registry the real traversal engine reads, so this page changes automatically
                  if a relationship is ever added or removed.
                </p>
              </div>
              <EdgeRegistryExplorer />
            </div>
          </TabsContent>

          <TabsContent value="limits" className="pt-2">
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2 rounded-md bg-secondary/30 p-3 text-xs text-muted-foreground">
                <ShieldCheck className="size-4 shrink-0 text-primary mt-0.5" aria-hidden="true" />
                <p>
                  Every graph traversal has a real, enforced cap on depth, nodes and edges. Move a
                  slider past one to see the exact refusal the real API gives — never a silent
                  truncation.
                </p>
              </div>
              <TraversalLimitsSimulator />
            </div>
          </TabsContent>

          <TabsContent value="lifecycles" className="pt-2">
            <div className="flex flex-col gap-3">
              <div className="flex items-start gap-2 rounded-md bg-secondary/30 p-3 text-xs text-muted-foreground">
                <Layers className="size-4 shrink-0 text-primary mt-0.5" aria-hidden="true" />
                <p>
                  Every status a requirement, decision, risk, issue, baseline or piece of evidence
                  can hold, and every move between them the server actually allows — the same
                  transition tables each service checks against before writing anything.
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
