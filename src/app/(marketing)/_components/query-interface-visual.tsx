"use client";

import * as React from "react";
import { Search, Terminal, Waypoints } from "lucide-react";
import { cn } from "@/lib/utils";

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
    <div className="w-full rounded-2xl border border-slate-200 bg-white p-5 sm:p-7 shadow-xl shadow-blue-900/5 backdrop-blur-md">
      {/* Query Bar Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2 font-mono text-xs font-bold text-slate-800 uppercase tracking-wider">
          <Terminal className="size-4 text-blue-600" />
          <span>ENGINEERING GRAPH QUERY ENGINE</span>
          <span className="text-slate-300">|</span>
          <span className="text-slate-500 font-normal">REAL-TIME REASONING</span>
        </div>

        <div className="flex items-center gap-2">
          {QUERY_PRESETS.map((preset, idx) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setActiveQueryIndex(idx)}
              className={cn(
                "rounded-lg px-3 py-1 font-mono text-xs font-semibold transition-all",
                activeQueryIndex === idx
                  ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20"
                  : "bg-slate-100 text-slate-600 border border-slate-200 hover:bg-slate-200 hover:text-slate-900"
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Console Input Bar */}
      <div className="mt-4 flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 font-mono text-xs shadow-xs">
        <Search className="size-4 text-blue-600 shrink-0" />
        <span className="text-slate-400 select-none">&gt;</span>
        <span className="text-slate-900 font-bold tracking-wide flex-1">
          {activePreset.queryText}
        </span>
        <span className="rounded bg-blue-100 px-2 py-0.5 font-mono text-[10px] font-extrabold text-blue-700 border border-blue-200 shrink-0">
          EXECUTION TIME: 4ms
        </span>
      </div>

      {/* Main Execution Split View */}
      <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Query Results List */}
        <div className="lg:col-span-7 flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs font-mono text-slate-500 px-1 font-semibold">
            <span>RESOLVED ENTITIES ({activePreset.results.length})</span>
            <span>SORT: SEVERITY</span>
          </div>

          <div className="flex flex-col gap-2.5">
            {activePreset.results.map((res) => (
              <div
                key={res.id}
                className="group flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-all duration-200 hover:border-blue-300 hover:shadow-md"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs font-extrabold shadow-xs",
                      res.statusType === "missing" && "bg-amber-50 text-amber-600 border border-amber-200",
                      res.statusType === "conflict" && "bg-rose-50 text-rose-600 border border-rose-200",
                      res.statusType === "pending" && "bg-blue-50 text-blue-600 border border-blue-200"
                    )}
                  >
                    !
                  </div>

                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-900">{res.id}</span>
                      <span className="text-xs font-medium text-slate-500">• {res.subsystem}</span>
                    </div>
                    <p className="text-xs text-slate-600 font-medium">{res.detail}</p>
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0 font-mono text-[10px]">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 font-bold uppercase tracking-wider",
                      res.statusType === "missing" && "bg-amber-100 text-amber-800 border border-amber-200",
                      res.statusType === "conflict" && "bg-rose-100 text-rose-800 border border-rose-200",
                      res.statusType === "pending" && "bg-blue-100 text-blue-800 border border-blue-200"
                    )}
                  >
                    {res.status}
                  </span>
                  <span className="text-slate-400">Owner: {res.owner}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Graph Visual Inspector */}
        <div className="lg:col-span-5 flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50/80 p-5 font-mono">
          <div className="flex items-center justify-between border-b border-slate-200 pb-3 text-xs">
            <span className="font-bold text-slate-800 flex items-center gap-1.5 uppercase tracking-wider">
              <Waypoints className="size-4 text-blue-600" /> GRAPH RELATION PATH
            </span>
            <span className="text-[10px] text-slate-500 font-bold bg-slate-200/80 px-2 py-0.5 rounded">
              O(V+E) VALIDATED
            </span>
          </div>

          <div className="flex flex-col gap-3 py-2 text-xs">
            <div className="flex items-center justify-between rounded-lg bg-white p-3 border border-slate-200 shadow-xs">
              <span className="text-slate-500">Target Object</span>
              <span className="font-bold text-blue-600">{activePreset.results[0]?.id ?? "REQ-042"}</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-white p-3 border border-slate-200 shadow-xs">
              <span className="text-slate-500">Upstream Root</span>
              <span className="text-slate-800 font-medium">StakeholderNeed #04</span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-white p-3 border border-slate-200 shadow-xs">
              <span className="text-slate-500">Downstream Leaf</span>
              <span className="text-slate-800 font-medium">Verification #89</span>
            </div>
          </div>

          <div className="rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-[11px] text-white shadow-md">
            <span className="font-bold block mb-1">Graph Reasoning Engine State:</span>
            Graph walk completed with 0 unhandled cycles. All missing evidence links flagged for engineering review.
          </div>
        </div>
      </div>
    </div>
  );
}
