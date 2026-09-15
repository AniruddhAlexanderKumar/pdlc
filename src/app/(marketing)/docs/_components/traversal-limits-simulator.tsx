"use client";

import * as React from "react";
import { Check, X } from "lucide-react";
import { GRAPH_LIMITS } from "@/domain";
import { cn } from "@/lib/utils";

/**
 * A real accept/refuse decision, not a mocked one — mirrors exactly the
 * bound `graphTraversalRequestSchema` (`src/domain/graph.ts`) enforces on
 * every traversal request. Move a slider past a cap and the request is
 * refused, precisely the way the real API refuses it: outright, with a
 * named reason, never silently clamped to the nearest legal value.
 */
export function TraversalLimitsSimulator() {
  const [depth, setDepth] = React.useState<number>(GRAPH_LIMITS.defaultMaxDepth);
  const [nodes, setNodes] = React.useState<number>(GRAPH_LIMITS.defaultMaxNodes);
  const [edges, setEdges] = React.useState<number>(GRAPH_LIMITS.defaultMaxEdges);

  const violations: string[] = [];
  if (depth > GRAPH_LIMITS.maxMaxDepth) violations.push(`depth ${depth} exceeds the cap of ${GRAPH_LIMITS.maxMaxDepth}`);
  if (nodes > GRAPH_LIMITS.maxMaxNodes) violations.push(`node cap ${nodes} exceeds the cap of ${GRAPH_LIMITS.maxMaxNodes}`);
  if (edges > GRAPH_LIMITS.maxMaxEdges) violations.push(`edge cap ${edges} exceeds the cap of ${GRAPH_LIMITS.maxMaxEdges}`);
  const accepted = violations.length === 0;

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4">
      <p className="text-sm text-muted-foreground">
        Ask for a traversal at these bounds. The verdict below is the same check{" "}
        <code className="font-mono text-xs">graphTraversalRequestSchema</code> runs on every real request —
        move past a cap and see it refused, not clamped.
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <LimitSlider label="Max depth (hops)" value={depth} onChange={setDepth} max={GRAPH_LIMITS.maxMaxDepth + 2} hardCap={GRAPH_LIMITS.maxMaxDepth} />
        <LimitSlider label="Max nodes" value={nodes} onChange={setNodes} max={GRAPH_LIMITS.maxMaxNodes + 100} hardCap={GRAPH_LIMITS.maxMaxNodes} step={10} />
        <LimitSlider label="Max edges" value={edges} onChange={setEdges} max={GRAPH_LIMITS.maxMaxEdges + 400} hardCap={GRAPH_LIMITS.maxMaxEdges} step={50} />
      </div>

      <div
        className={cn(
          "flex items-start gap-2 rounded-md border p-3 text-sm",
          accepted ? "border-success/40 bg-success/5 text-success" : "border-destructive/40 bg-destructive/5 text-destructive",
        )}
        role="status"
      >
        {accepted ? <Check className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> : <X className="mt-0.5 size-4 shrink-0" aria-hidden="true" />}
        <div className="flex flex-col gap-1">
          <span className="font-medium">{accepted ? "Request accepted" : "Request refused"}</span>
          {!accepted && (
            <ul className="flex flex-col gap-0.5 text-xs text-destructive/90">
              {violations.map((v) => (
                <li key={v}>— {v}</li>
              ))}
            </ul>
          )}
          {accepted && (
            <span className="text-xs text-success/90">
              Within every hard cap ({GRAPH_LIMITS.maxMaxDepth} hops · {GRAPH_LIMITS.maxMaxNodes} nodes ·{" "}
              {GRAPH_LIMITS.maxMaxEdges} edges) — the traversal runs.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function LimitSlider({
  label,
  value,
  onChange,
  max,
  hardCap,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  max: number;
  hardCap: number;
  step?: number;
}) {
  const id = React.useId();
  const overCap = value > hardCap;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
        <span className={cn("font-mono normal-case tracking-normal", overCap ? "text-destructive" : "text-foreground")}>{value}</span>
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="accent-primary"
        aria-valuetext={`${value}${overCap ? `, over the hard cap of ${hardCap}` : ""}`}
      />
      <span className="text-[11px] text-muted-foreground">hard cap: {hardCap}</span>
    </div>
  );
}
