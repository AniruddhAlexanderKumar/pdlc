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
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sliders,
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
  const [activeStep, setActiveStep] = React.useState<number>(2);

  const selectedNode = CONNECTED_NODES.find((n) => n.id === selectedId) ?? CONNECTED_NODES[0]!;

  const handleSimulate = () => {
    setIsSimulating(true);
    let step = 0;
    const interval = setInterval(() => {
      step = (step + 1) % CONNECTED_NODES.length;
      const target = CONNECTED_NODES[step];
      if (target) setSelectedId(target.id);
      setActiveStep(step);
      if (step === CONNECTED_NODES.length - 1) {
        clearInterval(interval);
        setTimeout(() => setIsSimulating(false), 600);
      }
    }, 700);
  };

  return (
    <div className="relative w-full rounded-3xl border border-zinc-200/80 bg-white p-5 sm:p-8 shadow-2xl shadow-zinc-950/5 backdrop-blur-2xl transition-all duration-300">
      {/* Glow aura */}
      <div className="pointer-events-none absolute -inset-1 rounded-3xl bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-blue-600/10 blur-2xl opacity-60" />

      {/* Top Controls Header */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 pb-5">
        {/* Mode Toggle Switcher */}
        <div className="flex items-center gap-1.5 rounded-2xl bg-zinc-100/90 p-1.5 border border-zinc-200/80">
          <button
            type="button"
            onClick={() => setMode("connected")}
            className={cn(
              "flex items-center gap-2 rounded-xl px-3.5 py-1.5 font-mono text-xs font-bold transition-all",
              mode === "connected"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-zinc-600 hover:text-zinc-900"
            )}
          >
            <span className="flex size-2 rounded-full bg-blue-600" />
            PDLC Connected Graph
          </button>
          <button
            type="button"
            onClick={() => setMode("disconnected")}
            className={cn(
              "flex items-center gap-2 rounded-xl px-3.5 py-1.5 font-mono text-xs font-bold transition-all",
              mode === "disconnected"
                ? "bg-white text-rose-600 shadow-sm"
                : "text-zinc-600 hover:text-zinc-900"
            )}
          >
            <span className="flex size-2 rounded-full bg-rose-500" />
            Fragmented Silos
          </button>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {mode === "connected" ? (
            <button
              type="button"
              onClick={handleSimulate}
              disabled={isSimulating}
              className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2 font-mono text-xs font-semibold text-white shadow-md shadow-blue-500/20 hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 active:scale-98"
            >
              <Zap className={cn("size-3.5 text-amber-300", isSimulating && "animate-spin")} />
              {isSimulating ? "Propagating Signal..." : "Simulate REQ Change"}
            </button>
          ) : (
            <div className="flex items-center gap-1.5 text-xs font-mono text-rose-600 font-bold bg-rose-50 px-3 py-1.5 rounded-xl border border-rose-200">
              <AlertTriangle className="size-3.5" />
              4 UNTRACEABLE GAPS DETECTED
            </div>
          )}
        </div>
      </div>

      {/* Main Interactive Concept View */}
      <div className="relative mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[440px]">
        {mode === "connected" ? (
          <>
            {/* Connected SVG Canvas View */}
            <div className="relative lg:col-span-8 flex flex-col justify-between rounded-2xl border border-zinc-100 bg-zinc-50/60 p-5 overflow-hidden min-h-[380px]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#d4d4d8_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />

              {/* Connected Lines SVG */}
              <svg className="absolute inset-0 size-full overflow-visible pointer-events-none">
                <defs>
                  <linearGradient id="heroBlueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#2563eb" stopOpacity="0.9" />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity="0.9" />
                  </linearGradient>
                </defs>
                <line x1="15%" y1="28%" x2="42%" y2="20%" stroke="#2563eb" strokeWidth="2.5" />
                <line x1="15%" y1="28%" x2="38%" y2="72%" stroke="#2563eb" strokeWidth="2.5" />
                <line x1="42%" y1="20%" x2="70%" y2="68%" stroke="#2563eb" strokeWidth="2.5" />
                <line x1="38%" y1="72%" x2="70%" y2="68%" stroke="#2563eb" strokeWidth="2.5" />
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
                          "group relative flex flex-col items-start gap-1 rounded-2xl border p-3.5 text-left transition-all duration-300 shadow-sm",
                          isSelected
                            ? "border-blue-600 bg-white ring-4 ring-blue-500/15 scale-105 shadow-lg shadow-blue-500/10"
                            : "border-zinc-200 bg-white/90 hover:border-blue-400 hover:shadow-md"
                        )}
                      >
                        <div className="flex w-full items-center justify-between gap-2.5">
                          <span className="font-mono text-[10px] font-extrabold text-blue-600 uppercase flex items-center gap-1">
                            <Icon className="size-3.5" /> {node.code}
                          </span>
                          <span className="rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.2 font-mono text-[9px] font-bold">
                            {node.status}
                          </span>
                        </div>
                        <span className="font-bold text-xs text-zinc-950 max-w-[140px] truncate">
                          {node.title}
                        </span>
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Bottom Pipeline Status */}
              <div className="relative z-10 flex items-center justify-between rounded-xl border border-zinc-200/80 bg-white/90 p-3 font-mono text-xs shadow-xs">
                <span className="flex items-center gap-2 font-bold text-zinc-800">
                  <Activity className="size-4 text-blue-600" /> LIVE TRACEABILITY ENGINE
                </span>
                <span className="text-[11px] text-blue-600 font-bold bg-blue-50 px-2.5 py-0.5 rounded-md border border-blue-100">
                  100% TRACEABLE LINEAGE
                </span>
              </div>
            </div>

            {/* Selected Node Telemetry Inspector */}
            <div className="lg:col-span-4 flex flex-col justify-between rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm">
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between border-b border-zinc-100 pb-3 font-mono text-xs font-bold text-zinc-900">
                  <span className="flex items-center gap-2">
                    <Layers className="size-4 text-blue-600" /> NODE TELEMETRY
                  </span>
                  <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded border border-blue-200 font-mono">
                    {selectedNode.code}
                  </span>
                </div>

                <div className="flex flex-col gap-3">
                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-[10px] uppercase text-zinc-400 font-bold">Primitive Type</span>
                    <span className="font-extrabold text-sm text-zinc-950">{selectedNode.type}</span>
                  </div>

                  <div className="flex flex-col gap-0.5">
                    <span className="font-mono text-[10px] uppercase text-zinc-400 font-bold">Specification Title</span>
                    <span className="font-semibold text-xs text-zinc-800 bg-zinc-50 p-2.5 rounded-xl border border-zinc-100">
                      {selectedNode.title}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5 pt-2 border-t border-zinc-100 font-mono text-[11px]">
                    <span className="text-[10px] uppercase text-zinc-400 font-bold">Linked Graph Relationships</span>
                    <div className="rounded-lg bg-blue-50/60 p-2 text-blue-900 font-bold border border-blue-100 flex items-center justify-between">
                      <span>REQ-1042 → QST-089</span>
                      <span className="text-[9px] bg-blue-200 text-blue-950 px-1 rounded">Verified</span>
                    </div>
                    <div className="rounded-lg bg-indigo-50/60 p-2 text-indigo-900 font-bold border border-indigo-100 flex items-center justify-between">
                      <span>EVD-402 → DEC-019</span>
                      <span className="text-[9px] bg-indigo-200 text-indigo-950 px-1 rounded">Evidence</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 rounded-xl bg-zinc-950 p-4 text-white font-mono text-xs shadow-md">
                <div className="flex items-start gap-2">
                  <Sparkles className="size-4 text-blue-400 shrink-0 mt-0.5" />
                  <span className="text-[11px] leading-relaxed text-zinc-300 font-sans">
                    Click any graph node to inspect its deterministic relation path and downstream blast radius.
                  </span>
                </div>
              </div>
            </div>
          </>
        ) : (
          /* Disconnected Fragmented View */
          <div className="lg:col-span-12 flex flex-col items-center justify-center rounded-2xl border border-rose-200/80 bg-rose-50/30 p-8 text-center min-h-[380px]">
            <div className="flex size-14 items-center justify-center rounded-2xl bg-rose-100 text-rose-600 mb-4">
              <AlertTriangle className="size-7" />
            </div>
            <h3 className="text-2xl font-black text-zinc-950">Traditional Unconnected Product Development</h3>
            <p className="mt-2 text-sm text-zinc-600 max-w-xl font-normal">
              Requirements, trade studies, test logs, and supplier specs live in isolated silos with zero automated dependency tracking.
            </p>

            <div className="mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full font-mono text-xs">
              {DISCONNECTED_ITEMS.map((item) => (
                <div key={item.id} className="flex flex-col items-start gap-2 rounded-xl border border-rose-200 bg-white p-4 text-left shadow-xs">
                  <span className="font-bold text-zinc-900">{item.id} • {item.title}</span>
                  <span className="rounded bg-rose-100 text-rose-700 font-extrabold px-2 py-0.5 text-[10px]">
                    {item.err}
                  </span>
                </div>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setMode("connected")}
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 font-mono text-xs font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-all"
            >
              Switch to Connected Graph View <ArrowRight className="size-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
