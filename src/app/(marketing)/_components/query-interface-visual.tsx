"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, Database, FileText, Search, Terminal, Waypoints } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface QueryResultItem {
  id: string;
  status: string;
  statusType: "missing" | "conflict" | "pending" | "valid";
  detail: string;
  owner: string;
  subsystem: string;
}

const QUERY_PRESETS = [
  {
    id: "query-1",
    label: "Query 1: Unsupported Requirements",
    queryText: "Which requirements for subsystem X are currently unsupported by evidence?",
    results: [
      {
        id: "REQ-042",
        status: "Evidence missing",
        statusType: "missing" as const,
        detail: "No verification test plan or calculation attached to thermal upper bound",
        owner: "Propulsion",
        subsystem: "Subsystem-X (Propulsion)",
      },
      {
        id: "REQ-058",
        status: "Conflicting specification",
        statusType: "conflict" as const,
        detail: "Source A (Thermal: 800°C) ≠ Source B (Structures: 650°C)",
        owner: "Thermal / Structures",
        subsystem: "Subsystem-X (Manifold)",
      },
      {
        id: "REQ-071",
        status: "Pending systems approval",
        statusType: "pending" as const,
        detail: "Dual-custody review outstanding for Systems Safety Lead",
        owner: "Systems Safety",
        subsystem: "Subsystem-X (Avionics)",
      },
    ],
  },
  {
    id: "query-2",
    label: "Query 2: Downstream Change Blast Radius",
    queryText: "What changes if REQ-042 is modified?",
    results: [
      {
        id: "TP-902",
        status: "Test Plan Affected",
        statusType: "pending" as const,
        detail: "Hot Fire Test Procedure SCN-TP-902 requires test point re-validation",
        owner: "HIL Test Lab",
        subsystem: "Test & Verification",
      },
      {
        id: "SUP-014",
        status: "Supplier Spec Erratum",
        statusType: "conflict" as const,
        detail: "Parker Valve Supplier Spec ICD-014 operating limit invalidated",
        owner: "Supplier Engineering",
        subsystem: "External Vendor",
      },
      {
        id: "ICD-401",
        status: "Subsystem Interface Impact",
        statusType: "missing" as const,
        detail: "Manifold Fluid Interface ICD-401 pressure boundary shifted",
        owner: "Mechanical Engineering",
        subsystem: "Propulsion Interface",
      },
      {
        id: "VP-088",
        status: "Validation Procedure Stale",
        statusType: "pending" as const,
        detail: "Environmental Qualification procedure step 4.2 pending update",
        owner: "Quality Assurance",
        subsystem: "Compliance",
      },
    ],
  },
];

export function QueryInterfaceVisual() {
  const [activeQueryIndex, setActiveQueryIndex] = React.useState(0);
  const activePreset = QUERY_PRESETS[activeQueryIndex] ?? QUERY_PRESETS[0]!;

  return (
    <div className="w-full rounded-xl border border-slate-800 bg-slate-950 p-5 shadow-2xl">
      {/* Query Bar Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2 font-mono text-xs text-slate-300">
          <Terminal className="size-4 text-cyan-400" />
          <span className="font-bold uppercase tracking-wide">ENGINEERING QUERY ENGINE</span>
          <span className="text-slate-600">|</span>
          <span className="text-slate-400">GRAPH DATABASE INTERACTION</span>
        </div>

        <div className="flex items-center gap-2">
          {QUERY_PRESETS.map((preset, idx) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setActiveQueryIndex(idx)}
              className={cn(
                "rounded px-2.5 py-1 font-mono text-xs transition-colors",
                activeQueryIndex === idx
                  ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40"
                  : "bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-200"
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Console Input Bar */}
      <div className="mt-4 flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/90 px-3.5 py-2.5 font-mono text-xs">
        <Search className="size-4 text-cyan-400 shrink-0" />
        <span className="text-slate-400 select-none">&gt;</span>
        <span className="text-slate-100 font-semibold tracking-wide flex-1">
          {activePreset.queryText}
        </span>
        <Badge variant="outline" className="font-mono text-[10px] text-cyan-400 border-cyan-500/30 shrink-0">
          EXECUTION TIME: 4ms
        </Badge>
      </div>

      {/* Main Execution Split View */}
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Query Results List */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs font-mono text-slate-400 px-1">
            <span>RESOLVED ENTITIES ({activePreset.results.length})</span>
            <span>SORT: SEVERITY</span>
          </div>

          <div className="flex flex-col gap-2.5">
            {activePreset.results.map((res) => (
              <div
                key={res.id}
                className="group flex items-start justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/50 p-3.5 transition-colors hover:border-slate-700 hover:bg-slate-900/80"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded font-mono text-xs font-bold",
                      res.statusType === "missing" && "bg-amber-500/10 text-amber-400 border border-amber-500/30",
                      res.statusType === "conflict" && "bg-rose-500/10 text-rose-400 border border-rose-500/30",
                      res.statusType === "pending" && "bg-cyan-500/10 text-cyan-400 border border-cyan-500/30"
                    )}
                  >
                    !
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-100">{res.id}</span>
                      <span className="text-xs font-medium text-slate-300">• {res.subsystem}</span>
                    </div>
                    <p className="text-xs text-slate-400">{res.detail}</p>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0 font-mono text-[10px]">
                  <Badge
                    variant="outline"
                    className={cn(
                      "border text-[10px]",
                      res.statusType === "missing" && "border-amber-500/40 text-amber-400",
                      res.statusType === "conflict" && "border-rose-500/40 text-rose-400",
                      res.statusType === "pending" && "border-cyan-500/40 text-cyan-400"
                    )}
                  >
                    {res.status}
                  </Badge>
                  <span className="text-slate-500">Owner: {res.owner}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Graph Visual Inspector */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-4 rounded-lg border border-slate-800 bg-slate-900/80 p-4 font-mono">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 text-xs">
            <span className="font-semibold text-slate-300 flex items-center gap-1.5">
              <Waypoints className="size-3.5 text-cyan-400" /> GRAPH RELATION PATH
            </span>
            <span className="text-[10px] text-slate-500">O(V+E) VALIDATED</span>
          </div>

          <div className="flex flex-col gap-3 py-2 text-xs">
            <div className="flex items-center justify-between rounded bg-slate-950 p-2.5 border border-slate-800">
              <span className="text-slate-400">Target Object</span>
              <span className="font-bold text-cyan-400">{activePreset.results[0]?.id ?? "REQ-042"}</span>
            </div>
            <div className="flex items-center justify-between rounded bg-slate-950 p-2.5 border border-slate-800">
              <span className="text-slate-400">Upstream Root</span>
              <span className="text-slate-200">StakeholderNeed #04</span>
            </div>
            <div className="flex items-center justify-between rounded bg-slate-950 p-2.5 border border-slate-800">
              <span className="text-slate-400">Downstream Leaf</span>
              <span className="text-slate-200">Verification #89</span>
            </div>
          </div>

          <div className="rounded bg-cyan-950/20 border border-cyan-500/30 p-3 text-[11px] text-cyan-300">
            <span className="font-bold block mb-1">Reasoning Graph State:</span>
            Graph walk completed with 0 unhandled cycles. All missing evidence links flagged for engineering review.
          </div>
        </div>
      </div>
    </div>
  );
}
