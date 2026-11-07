"use client";

import * as React from "react";
import { ShieldAlert, Check } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { AffectedArtifactImpact } from "@/domain/requirement-change-simulator";

interface BlastRadiusGraphProps {
  centerRequirementIdentifier: string;
  impacts: AffectedArtifactImpact[];
  onConfirmInferred?: (impactId: string) => void;
}

export function BlastRadiusGraph({
  centerRequirementIdentifier,
  impacts,
  onConfirmInferred,
}: BlastRadiusGraphProps) {
  const [selectedImpact, setSelectedImpact] = React.useState<AffectedArtifactImpact | null>(
    impacts[0] ?? null
  );

  const firstOrder = impacts.filter((i) => i.rippleOrder === "FIRST_ORDER");
  const secondOrder = impacts.filter((i) => i.rippleOrder === "SECOND_ORDER");
  const thirdOrder = impacts.filter((i) => i.rippleOrder === "THIRD_ORDER");

  function getSeverityColor(sev: string) {
    switch (sev) {
      case "CRITICAL":
        return "#ef4444";
      case "HIGH":
        return "#f97316";
      case "MEDIUM":
        return "#f59e0b";
      default:
        return "#3b82f6";
    }
  }

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="size-5 text-primary" />
            <CardTitle className="text-sm font-semibold">Interactive Blast Radius Visualizer</CardTitle>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-red-500 inline-block" /> Critical
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-orange-500 inline-block" /> High
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-amber-500 inline-block" /> Medium
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-full bg-blue-500 inline-block" /> Low
            </span>
          </div>
        </div>
        <CardDescription className="text-xs">
          Centering {centerRequirementIdentifier} with 1st, 2nd, and 3rd order downstream ripple rings. Click any node to inspect impact details.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-0">
        {/* SVG Blast Radius Diagram */}
        <div className="lg:col-span-2 relative flex items-center justify-center rounded-lg border border-border/80 bg-muted/20 p-4 min-h-[380px]">
          <svg viewBox="0 0 600 400" className="w-full h-auto max-h-[400px]">
            {/* Concentric Ripple Rings */}
            <circle cx="300" cy="200" r="160" fill="none" stroke="currentColor" strokeDasharray="3 3" className="text-border/50" />
            <circle cx="300" cy="200" r="110" fill="none" stroke="currentColor" strokeDasharray="3 3" className="text-border/70" />
            <circle cx="300" cy="200" r="60" fill="none" stroke="currentColor" className="text-primary/30" />

            {/* Ring Labels */}
            <text x="300" y="35" textAnchor="middle" className="text-[10px] fill-muted-foreground font-mono">3rd Order Ripple</text>
            <text x="300" y="85" textAnchor="middle" className="text-[10px] fill-muted-foreground font-mono">2nd Order Ripple</text>
            <text x="300" y="135" textAnchor="middle" className="text-[10px] fill-muted-foreground font-mono">1st Order Direct</text>

            {/* Connecting Rays & Nodes for 1st Order */}
            {firstOrder.map((imp, idx) => {
              const angle = (idx / firstOrder.length) * 2 * Math.PI - Math.PI / 2;
              const x = 300 + 60 * Math.cos(angle);
              const y = 200 + 60 * Math.sin(angle);
              const isSel = selectedImpact?.id === imp.id;

              return (
                <g key={imp.id} onClick={() => setSelectedImpact(imp)} className="cursor-pointer">
                  <line x1="300" y1="200" x2={x} y2={y} stroke={getSeverityColor(imp.severity)} strokeWidth={isSel ? "2.5" : "1.5"} opacity={0.7} />
                  <circle cx={x} cy={y} r={isSel ? "16" : "12"} fill={getSeverityColor(imp.severity)} className="transition-all hover:scale-125" />
                  <text x={x} y={y + 4} textAnchor="middle" fill="#ffffff" className="text-[9px] font-bold font-mono pointer-events-none">
                    {imp.artifactIdentifier.slice(0, 6)}
                  </text>
                </g>
              );
            })}

            {/* 2nd Order Nodes */}
            {secondOrder.map((imp, idx) => {
              const angle = (idx / secondOrder.length) * 2 * Math.PI - Math.PI / 4;
              const x = 300 + 110 * Math.cos(angle);
              const y = 200 + 110 * Math.sin(angle);
              const isSel = selectedImpact?.id === imp.id;

              return (
                <g key={imp.id} onClick={() => setSelectedImpact(imp)} className="cursor-pointer">
                  <line x1="300" y1="200" x2={x} y2={y} stroke={getSeverityColor(imp.severity)} strokeWidth={isSel ? "2" : "1"} strokeDasharray="4 2" opacity={0.5} />
                  <circle cx={x} cy={y} r={isSel ? "14" : "10"} fill={getSeverityColor(imp.severity)} className="transition-all hover:scale-125" />
                  <text x={x} y={y + 3} textAnchor="middle" fill="#ffffff" className="text-[8px] font-bold font-mono pointer-events-none">
                    {imp.artifactIdentifier.slice(0, 6)}
                  </text>
                </g>
              );
            })}

            {/* 3rd Order Nodes */}
            {thirdOrder.map((imp, idx) => {
              const angle = (idx / thirdOrder.length) * 2 * Math.PI + Math.PI / 6;
              const x = 300 + 160 * Math.cos(angle);
              const y = 200 + 160 * Math.sin(angle);
              const isSel = selectedImpact?.id === imp.id;

              return (
                <g key={imp.id} onClick={() => setSelectedImpact(imp)} className="cursor-pointer">
                  <line x1="300" y1="200" x2={x} y2={y} stroke={getSeverityColor(imp.severity)} strokeWidth={isSel ? "2" : "1"} strokeDasharray="2 2" opacity={0.4} />
                  <circle cx={x} cy={y} r={isSel ? "12" : "9"} fill={getSeverityColor(imp.severity)} className="transition-all hover:scale-125" />
                  <text x={x} y={y + 3} textAnchor="middle" fill="#ffffff" className="text-[7px] font-bold font-mono pointer-events-none">
                    {imp.artifactIdentifier.slice(0, 5)}
                  </text>
                </g>
              );
            })}

            {/* Center Requirement Node */}
            <circle cx="300" cy="200" r="24" className="fill-primary stroke-background" strokeWidth="4" />
            <text x="300" y="204" textAnchor="middle" fill="#ffffff" className="text-[10px] font-bold font-mono pointer-events-none">
              {centerRequirementIdentifier}
            </text>
          </svg>
        </div>

        {/* Node Inspection Drawer Side Panel */}
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-4 text-xs">
          {selectedImpact ? (
            <>
              <div className="flex items-center justify-between border-b border-border pb-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-primary">{selectedImpact.artifactIdentifier}</span>
                  <span className="rounded bg-secondary px-2 py-0.5 text-[10px] font-semibold text-foreground">
                    {selectedImpact.artifactType}
                  </span>
                </div>
                <span
                  className="rounded px-2 py-0.5 text-[10px] font-bold text-white"
                  style={{ backgroundColor: getSeverityColor(selectedImpact.severity) }}
                >
                  {selectedImpact.severity}
                </span>
              </div>

              <h4 className="font-semibold text-foreground text-sm leading-snug">{selectedImpact.title}</h4>

              <div className="flex flex-col gap-1 text-[11px] text-muted-foreground mt-1">
                <div>
                  <strong className="text-foreground">Ripple Order:</strong> {selectedImpact.rippleOrder.replace("_", " ")}
                </div>
                <div>
                  <strong className="text-foreground">Relationship:</strong> {selectedImpact.relationshipToRequirement}
                </div>
                <div>
                  <strong className="text-foreground">Confidence Layer:</strong>{" "}
                  <span className="font-mono font-semibold text-primary">{selectedImpact.confidence}</span>
                </div>
              </div>

              <div className="rounded bg-muted/50 p-2.5 text-xs text-foreground leading-relaxed border border-border/60 my-1">
                <strong>Why Affected:</strong> {selectedImpact.whyAffected}
              </div>

              {selectedImpact.regatingStatus === "APPROVAL_POTENTIALLY_INVALIDATED" && (
                <div className="rounded border border-red-500/40 bg-red-500/10 p-2 text-red-600 dark:text-red-400 font-semibold flex items-center gap-1.5">
                  <ShieldAlert className="size-4 shrink-0" /> Approval Potentially Invalidated
                </div>
              )}

              <div className="rounded bg-primary/5 p-2 text-[11px] text-foreground border border-primary/20">
                <strong>Recommended Action:</strong> {selectedImpact.recommendedAction}
              </div>

              {selectedImpact.confidence === "INFERRED" && !selectedImpact.isInferredConfirmed && (
                <div className="mt-2 border-t border-border pt-2 flex flex-col gap-2">
                  <p className="text-[11px] text-amber-600 dark:text-amber-400">
                    This relationship was inferred by semantic analysis. Human confirmation is required before adding it to the project graph.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (onConfirmInferred) onConfirmInferred(selectedImpact.id);
                    }}
                    className="gap-1.5 text-xs"
                  >
                    <Check className="size-3.5 text-emerald-500" /> Confirm Inferred Dependency
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground text-center py-8">
              Click any node in the Blast Radius diagram to inspect affected artifact details.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
