"use client";

import * as React from "react";
import {
  FileText,
  HelpCircle,
  TestTube2,
  GitPullRequest,
  ShieldCheck,
  Zap,
  Activity,
  ArrowRight,
  Sparkles,
  AlertTriangle,
  Layers
} from "lucide-react";
import { cn } from "@/lib/utils";

interface ConceptNode {
  id: string;
  type: string;
  title: string;
  code: string;
  status: "VALIDATED" | "PENDING" | "ALERT";
  x: number;
  y: number;
  icon: React.ElementType;
}

const CONNECTED_NODES: ConceptNode[] = [
  { id: "1", type: "Requirement", title: "Thermal Bound <= 850°C", code: "REQ-1042", status: "VALIDATED", x: 15, y: 28, icon: FileText },
  { id: "2", type: "Question", title: "Manifold Margin Clearance?", code: "QST-089", status: "PENDING", x: 42, y: 20, icon: HelpCircle },
  { id: "3", type: "Evidence", title: "Hot Fire Test Protocol 4B", code: "EVD-402", status: "VALIDATED", x: 38, y: 72, icon: TestTube2 },
  { id: "4", type: "Decision", title: "Dual-Layer Shield Selection", code: "DEC-019", status: "VALIDATED", x: 70, y: 68, icon: GitPullRequest },
  { id: "5", type: "Approval Gate", title: "Systems Safety Sign-Off", code: "APP-005", status: "VALIDATED", x: 88, y: 45, icon: ShieldCheck },
];

const DISCONNECTED_ITEMS = [
  { title: "Doors Requirement Doc", err: "Stale Revision", id: "DOC-01" },
  { title: "Slack Thread (Propulsion)", err: "Unresolved Question", id: "SLK-88" },
  { title: "Hot Fire Lab Spreadsheet", err: "Missing Link", id: "XLS-402" },
  { title: "Email Approval Chain", err: "Unrecorded Rationale", id: "EML-19" },
];

export function HeroInteractiveConcept() {
  const [mode, setMode] = React.useState<"connected" | "disconnected">("connected");
  const [selectedId, setSelectedId] = React.useState<string>("1");
  const [isSimulating, setIsSimulating] = React.useState<boolean>(false);

  const selectedNode = CONNECTED_NODES.find((n) => n.id === selectedId) ?? CONNECTED_NODES[0]!;

  const handleSimulate = () => {
    setIsSimulating(true);
    let step = 0;
    const interval = setInterval(() => {
      step = (step + 1) % CONNECTED_NODES.length;
      const target = CONNECTED_NODES[step];
      if (target) setSelectedId(target.id);
      if (step === CONNECTED_NODES.length - 1) {
        clearInterval(interval);
        setTimeout(() => setIsSimulating(false), 600);
      }
    }, 700);
  };

  return (
    <div className="relative w-full rounded-none border border-white/15 bg-black p-5 sm:p-8 shadow-2xl backdrop-blur-2xl transition-all duration-300">
      {/* SpaceX Telemetry Glow */}
      <div className="pointer-events-none absolute -inset-1 rounded-none bg-gradient-to-r from-cyan-500/10 via-indigo-500/10 to-blue-600/10 blur-xl opacity-60" />

      {/* Top Controls Bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5 font-mono text-xs">
        {/* Mode Switcher */}
        <div className="flex items-center gap-2 rounded-none bg-zinc-950 p-1.5 border border-white/15">
          <button
            type="button"
            onClick={() => setMode("connected")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 font-bold uppercase transition-all",
              mode === "connected"
                ? "bg-white text-black"
                : "text-slate-400 hover:text-white"
            )}
          >
            <span className="flex size-2 rounded-full bg-cyan-400" />
            PDLC CONNECTED GRAPH
          </button>
          <button
            type="button"
            onClick={() => setMode("disconnected")}
            className={cn(
              "flex items-center gap-2 px-4 py-2 font-bold uppercase transition-all",
              mode === "disconnected"
                ? "bg-white text-black"
                : "text-slate-400 hover:text-white"
            )}
          >
            <span className="flex size-2 rounded-full bg-rose-500" />
            FRAGMENTED SILOS
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {mode === "connected" ? (
            <button
              type="button"
              onClick={handleSimulate}
              disabled={isSimulating}
              className="inline-flex items-center gap-2 rounded-none border border-cyan-400 bg-cyan-950/40 px-5 py-2 font-bold text-cyan-300 hover:bg-cyan-400 hover:text-black uppercase transition-all disabled:opacity-50"
            >
              <Zap className={cn("size-3.5 text-cyan-400", isSimulating && "animate-spin")} />
              {isSimulating ? "PROPAGATING..." : "SIMULATE REQ CHANGE"}
            </button>
          ) : (
            <div className="flex items-center gap-2 text-xs font-bold text-rose-400 bg-rose-950/40 px-4 py-2 border border-rose-800 uppercase">
              <AlertTriangle className="size-3.5" />
              4 SILO GAPS DETECTED
            </div>
          )}
        </div>
      </div>

      {/* Main Interactive View */}
      <div className="relative mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[440px]">
        {mode === "connected" ? (
          <>
            {/* SVG Canvas View */}
            <div className="relative lg:col-span-8 flex flex-col justify-between rounded-none border border-white/10 bg-zinc-950/80 p-5 overflow-hidden min-h-[380px]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#3f3f46_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />

              {/* Connected Lines SVG */}
              <svg className="absolute inset-0 size-full overflow-visible pointer-events-none">
                <defs>
                  <linearGradient id="spacexCyanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0.9" />
                  </linearGradient>
                </defs>
                <line x1="15%" y1="28%" x2="42%" y2="20%" stroke="#22d3ee" strokeWidth="2.5" />
                <line x1="15%" y1="28%" x2="38%" y2="72%" stroke="#22d3ee" strokeWidth="2.5" />
                <line x1="42%" y1="20%" x2="70%" y2="68%" stroke="#22d3ee" strokeWidth="2.5" />
                <line x1="38%" y1="72%" x2="70%" y2="68%" stroke="#22d3ee" strokeWidth="2.5" />
                <line x1="70%" y1="68%" x2="88%" y2="45%" stroke="#6366f1" strokeWidth="2.5" />
              </svg>

              {/* Floating Graph Nodes */}
              <div className="relative z-10 size-full min-h-[330px]">
                {CONNECTED_NODES.map((node) => {
                  const Icon = node.icon;
                  const isSelected = selectedId === node.id;
                  return (
                    <div
                      key={node.id}
                      style={{ left: `${node.x}%`, top: `${node.y}%` }}
                      className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-300"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedId(node.id)}
                        className={cn(
                          "group relative flex flex-col items-start gap-1 rounded-none border p-3.5 text-left transition-all duration-300 font-mono text-xs",
                          isSelected
                            ? "border-cyan-400 bg-black shadow-lg shadow-cyan-500/20"
                            : "border-white/20 bg-zinc-950/90 hover:border-white"
                        )}
                      >
                        <div className="flex w-full items-center justify-between gap-3">
                          <span className="font-extrabold text-cyan-400 uppercase flex items-center gap-1.5">
                            <Icon className="size-3.5" /> {node.code}
                          </span>
                          <span className="bg-emerald-950 text-emerald-400 border border-emerald-800 px-1.5 py-0.2 text-[9px] font-bold uppercase">
                            {node.status}
                          </span>
                        </div>
                        <span className="font-bold text-white max-w-[150px] truncate uppercase mt-1">
                          {node.title}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Telemetry Bar */}
              <div className="relative z-10 flex items-center justify-between border border-white/10 bg-black p-3 font-mono text-xs uppercase tracking-wider">
                <span className="flex items-center gap-2 font-bold text-white">
                  <Activity className="size-4 text-cyan-400" /> LIVE TELEMETRY ENGINE
                </span>
                <span className="text-[10px] text-cyan-400 font-bold bg-cyan-950/60 px-2.5 py-1 border border-cyan-800">
                  100% TRACEABLE LINEAGE
                </span>
              </div>
            </div>

            {/* Node Telemetry Inspector */}
            <div className="lg:col-span-4 flex flex-col justify-between rounded-none border border-white/10 bg-zinc-950 p-6 font-mono text-xs">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-white/10 pb-3 font-bold uppercase tracking-wider">
                  <span className="flex items-center gap-2 text-white">
                    <Layers className="size-4 text-cyan-400" /> TELEMETRY READOUT
                  </span>
                  <span className="bg-cyan-950 text-cyan-400 px-2.5 py-0.5 border border-cyan-800">
                    {selectedNode.code}
                  </span>
                </div>

                <div className="flex flex-col gap-3.5">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-slate-400 uppercase">PRIMITIVE TYPE</span>
                    <span className="font-black text-sm text-white uppercase">{selectedNode.type}</span>
                  </div>

                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-slate-400 uppercase">SPECIFICATION STATEMENT</span>
                    <span className="font-bold text-slate-200 bg-black p-3 border border-white/10 uppercase">
                      {selectedNode.title}
                    </span>
                  </div>

                  <div className="flex flex-col gap-2 pt-2 border-t border-white/10 text-[11px]">
                    <span className="text-[10px] text-slate-400 uppercase">GRAPH LINEAGE PATH</span>
                    <div className="bg-black p-2.5 text-cyan-300 font-bold border border-cyan-900/60 flex items-center justify-between">
                      <span>REQ-1042 → QST-089</span>
                      <span className="text-[9px] bg-cyan-950 text-cyan-400 border border-cyan-800 px-1">VERIFIED</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 border border-white/20 bg-black p-4 text-white uppercase tracking-wider">
                <div className="flex items-start gap-2.5">
                  <Sparkles className="size-4 text-cyan-400 shrink-0 mt-0.5" />
                  <span className="text-[10px] leading-relaxed text-slate-300">
                    CLICK ANY GRAPH NODE TO INSPECT DETERMINISTIC LINEAGE AND BLAST RADIUS.
                  </span>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Disconnected View */
          <div className="lg:col-span-12 flex flex-col items-center justify-center border border-rose-800/60 bg-rose-950/20 p-8 text-center min-h-[380px] font-mono">
            <div className="flex size-14 items-center justify-center bg-rose-950 border border-rose-700 text-rose-400 mb-4">
              <AlertTriangle className="size-7" />
            </div>
            <h3 className="text-2xl font-black text-white uppercase">TRADITIONAL UNCONNECTED SYSTEM</h3>
            <p className="mt-2 text-xs text-slate-400 max-w-xl font-normal uppercase tracking-wider">
              REQUIREMENTS, TRADE STUDIES, TEST LOGS, AND SUPPLIER SPECS LIVE IN ISOLATED SILOS WITH ZERO AUTOMATED DEPENDENCY TRACKING.
            </p>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full text-xs">
              {DISCONNECTED_ITEMS.map((item) => (
                <div key={item.id} className="flex flex-col items-start gap-2 border border-rose-800/80 bg-black p-4 text-left">
                  <span className="font-bold text-white">{item.id} • {item.title}</span>
                  <span className="bg-rose-950 text-rose-400 border border-rose-800 font-bold px-2 py-0.5 text-[10px]">
                    {item.err}
                  </span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setMode("connected")}
              className="mt-8 inline-flex items-center gap-2 border border-white bg-white px-6 py-3 font-black text-black hover:bg-slate-200 uppercase tracking-widest transition-all"
            >
              SWITCH TO CONNECTED GRAPH <ArrowRight className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
