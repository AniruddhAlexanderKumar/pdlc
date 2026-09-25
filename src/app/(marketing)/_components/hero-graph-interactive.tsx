"use client";

import * as React from "react";
import {
  ArrowRight,
  FileCheck,
  FileText,
  HelpCircle,
  Layers,
  RefreshCw,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface NodeData {
  id: string;
  tag: string;
  typeLabel: string;
  title: string;
  snippet: string;
  status: "Verified" | "Missing evidence" | "Conflict" | "Pending approval" | "Changed";
  statusColor: string;
  badgeBg: string;
  icon: typeof FileCheck;
  metadata: {
    owner: string;
    revision: string;
    timestamp: string;
    confidence: string;
  };
}

const GRAPH_NODES: NodeData[] = [
  {
    id: "REQ-042",
    tag: "REQUIREMENT",
    typeLabel: "01 REQUIRE",
    title: "Operating temperature bound",
    snippet: "Operating temperature: -40°C to 85°C",
    status: "Verified",
    statusColor: "text-emerald-500 border-emerald-500/30 bg-emerald-500/10",
    badgeBg: "bg-blue-500/10 text-blue-400 border-blue-500/30",
    icon: FileCheck,
    metadata: {
      owner: "J. Vance (Systems)",
      revision: "v2.4",
      timestamp: "2026-09-22 14:30:11 UTC",
      confidence: "High (Calculated)",
    },
  },
  {
    id: "QST-108",
    tag: "QUESTION",
    typeLabel: "02 QUESTION",
    title: "Thermal margin validation",
    snippet: "Has this requirement been validated at max duty cycle?",
    status: "Missing evidence",
    statusColor: "text-amber-400 border-amber-500/30 bg-amber-500/10",
    badgeBg: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    icon: HelpCircle,
    metadata: {
      owner: "M. Chen (Thermal)",
      revision: "v1.1",
      timestamp: "2026-09-23 09:15:44 UTC",
      confidence: "Pending Test Data",
    },
  },
  {
    id: "EVD-4821",
    tag: "EVIDENCE",
    typeLabel: "03 EVIDENCE",
    title: "Thermal Chamber Test Log",
    snippet: "Test Report #4821 — Thermal Chamber Sweep",
    status: "Verified",
    statusColor: "text-emerald-500 border-emerald-500/30 bg-emerald-500/10",
    badgeBg: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    icon: FileText,
    metadata: {
      owner: "HIL Test Rig #4",
      revision: "v1.0 (Sealed)",
      timestamp: "2026-09-23 16:22:00 UTC",
      confidence: "Verified (Pass)",
    },
  },
  {
    id: "DEC-019",
    tag: "DECISION",
    typeLabel: "04 DECIDE",
    title: "Thermal Architecture Trade",
    snippet: "Requirement accepted — Active cooling rejected",
    status: "Conflict",
    statusColor: "text-rose-400 border-rose-500/30 bg-rose-500/10",
    badgeBg: "bg-purple-500/10 text-purple-400 border-purple-500/30",
    icon: Scale,
    metadata: {
      owner: "Chief Engineer Office",
      revision: "v3.0",
      timestamp: "2026-09-24 08:11:02 UTC",
      confidence: "Resolved via SCN-04",
    },
  },
  {
    id: "APP-004",
    tag: "APPROVAL",
    typeLabel: "05 APPROVE",
    title: "Systems Engineering Sign-off",
    snippet: "Systems Engineering ✓ (Dual-custody verified)",
    status: "Pending approval",
    statusColor: "text-cyan-400 border-cyan-500/30 bg-cyan-500/10",
    badgeBg: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
    icon: ShieldCheck,
    metadata: {
      owner: "A. Patel (Lead Systems)",
      revision: "v1.0",
      timestamp: "2026-09-24 09:45:19 UTC",
      confidence: "Sign-off Pending",
    },
  },
  {
    id: "CR-089",
    tag: "CHANGE",
    typeLabel: "06 TRACE",
    title: "Subsystem Delta Walk",
    snippet: "Requirement revised — Upper bound extended",
    status: "Changed",
    statusColor: "text-indigo-400 border-indigo-500/30 bg-indigo-500/10",
    badgeBg: "bg-indigo-500/10 text-indigo-400 border-indigo-500/30",
    icon: RefreshCw,
    metadata: {
      owner: "Change Control Board",
      revision: "v4.2",
      timestamp: "2026-09-24 10:02:11 UTC",
      confidence: "Impact Computed",
    },
  },
];

export function HeroGraphInteractive() {
  const [selectedNodeId, setSelectedNodeId] = React.useState<string>("REQ-042");
  const [isSimulatingPropagation, setIsSimulatingPropagation] = React.useState(false);

  const selectedNode = GRAPH_NODES.find((n) => n.id === selectedNodeId) ?? GRAPH_NODES[0]!;

  const handleSimulatePropagation = () => {
    setIsSimulatingPropagation(true);
    let index = 0;
    const interval = setInterval(() => {
      index = (index + 1) % GRAPH_NODES.length;
      const targetNode = GRAPH_NODES[index];
      if (targetNode) {
        setSelectedNodeId(targetNode.id);
      }
      if (index === GRAPH_NODES.length - 1) {
        clearInterval(interval);
        setTimeout(() => setIsSimulatingPropagation(false), 500);
      }
    }, 600);
  };

  return (
    <div className="w-full rounded-xl border border-slate-800 bg-slate-950/90 p-4 sm:p-6 shadow-2xl backdrop-blur-md">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-mono text-xs font-semibold tracking-wider text-slate-300 uppercase">
            LIVE TRACEABILITY GRAPH ENGINE // DOMAIN REASONING MODEL
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSimulatePropagation}
            disabled={isSimulatingPropagation}
            className="inline-flex items-center gap-1.5 rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs font-mono font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors disabled:opacity-50"
          >
            <RefreshCw className={cn("size-3 text-cyan-400", isSimulatingPropagation && "animate-spin")} />
            {isSimulatingPropagation ? "Propagating Signal..." : "Simulate Change Trace"}
          </button>
        </div>
      </div>

      {/* Main Interactive Grid */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Connected Graph Nodes */}
        <div className="lg:col-span-8 flex flex-col gap-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {GRAPH_NODES.map((node) => {
              const Icon = node.icon;
              const isSelected = selectedNodeId === node.id;
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setSelectedNodeId(node.id)}
                  className={cn(
                    "group relative flex flex-col items-start gap-2.5 rounded-lg border p-4 text-left transition-all duration-200",
                    isSelected
                      ? "border-cyan-500/80 bg-slate-900/90 shadow-md ring-1 ring-cyan-500/30"
                      : "border-slate-800 bg-slate-900/40 hover:border-slate-700 hover:bg-slate-900/70"
                  )}
                >
                  {/* Top Pill Bar */}
                  <div className="flex w-full items-center justify-between">
                    <span className={cn("inline-flex items-center gap-1 rounded border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide", node.badgeBg)}>
                      <Icon className="size-3" aria-hidden="true" />
                      {node.tag} • {node.id}
                    </span>
                    <Badge variant="outline" className={cn("font-mono text-[10px] px-1.5 py-0 border", node.statusColor)}>
                      {node.status}
                    </Badge>
                  </div>

                  {/* Body Snippet */}
                  <div className="flex flex-col gap-1">
                    <span className="text-xs font-bold text-slate-200 group-hover:text-white transition-colors">
                      {node.title}
                    </span>
                    <p className="font-mono text-[11px] text-slate-400 line-clamp-2">
                      &ldquo;{node.snippet}&rdquo;
                    </p>
                  </div>

                  {/* Connection Indicator Line */}
                  <div className="flex w-full items-center justify-between pt-2 border-t border-slate-800/60 text-[10px] font-mono text-slate-500">
                    <span>{node.typeLabel}</span>
                    <span className="flex items-center gap-1 text-cyan-400 opacity-0 group-hover:opacity-100 transition-opacity">
                      Inspect Chain <ArrowRight className="size-3" />
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Column: Node Inspector & Evidence Chain */}
        <div className="lg:col-span-4 flex flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/70 p-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <span className="font-mono text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Layers className="size-3.5 text-cyan-400" />
              INSPECTED NODE METADATA
            </span>
            <span className="font-mono text-[10px] text-cyan-400 font-bold">
              {selectedNode.id}
            </span>
          </div>

          <div className="flex flex-col gap-3 py-1 text-xs">
            <div className="flex flex-col gap-1 rounded bg-slate-950/80 p-3 border border-slate-800 font-mono">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider">Statement / Snippet</span>
              <span className="text-slate-200 font-medium">{selectedNode.snippet}</span>
            </div>

            <div className="grid grid-cols-2 gap-2 font-mono text-[11px]">
              <div className="flex flex-col gap-0.5 rounded bg-slate-950/50 p-2 border border-slate-800/80">
                <span className="text-[10px] text-slate-500">Owner</span>
                <span className="text-slate-300 font-medium">{selectedNode.metadata.owner}</span>
              </div>
              <div className="flex flex-col gap-0.5 rounded bg-slate-950/50 p-2 border border-slate-800/80">
                <span className="text-[10px] text-slate-500">Revision</span>
                <span className="text-slate-300 font-medium">{selectedNode.metadata.revision}</span>
              </div>
              <div className="flex flex-col gap-0.5 rounded bg-slate-950/50 p-2 border border-slate-800/80">
                <span className="text-[10px] text-slate-500">Validation Basis</span>
                <span className="text-slate-300 font-medium">{selectedNode.metadata.confidence}</span>
              </div>
              <div className="flex flex-col gap-0.5 rounded bg-slate-950/50 p-2 border border-slate-800/80">
                <span className="text-[10px] text-slate-500">Status Signal</span>
                <span className={cn("font-medium", selectedNode.statusColor.split(" ")[0])}>
                  {selectedNode.status}
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-800">
              <span className="font-mono text-[10px] text-slate-400 uppercase tracking-wider">Traceability Links</span>
              <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
                <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-300">REQ-042 → QST-108</span>
                <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-300">QST-108 → EVD-4821</span>
                <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-300">EVD-4821 → DEC-019</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
