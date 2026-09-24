"use client";

import * as React from "react";
import {
  FileText,
  HelpCircle,
  CheckCircle2,
  TestTube2,
  Building2,
  GitPullRequest,
  ShieldCheck,
  Zap,
  Play,
  Pause,
  RefreshCw,
  ArrowRight,
  Sparkles,
  Layers,
  Activity,
  Check,
  AlertCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

export interface NodeData {
  id: string;
  type: "Requirement" | "Question" | "Document" | "Test" | "Supplier" | "Decision" | "Approval";
  title: string;
  code: string;
  badge: string;
  status: "VALIDATED" | "PENDING" | "AFFECTED" | "PROPAGATING" | "APPROVED";
  owner: string;
  rev: string;
  dependencies: number;
  x: number; // percentage pos
  y: number; // percentage pos
  icon: React.ElementType;
}

const NODES: NodeData[] = [
  {
    id: "node-req",
    type: "Requirement",
    title: "Thermal Limit <= 850°C",
    code: "REQ-1042",
    badge: "Requirement",
    status: "VALIDATED",
    owner: "Propulsion Team",
    rev: "REV 03",
    dependencies: 4,
    x: 12,
    y: 28,
    icon: FileText,
  },
  {
    id: "node-qst",
    type: "Question",
    title: "Manifold Boundary Margin?",
    code: "QST-089",
    badge: "Question",
    status: "PENDING",
    owner: "Systems Eng",
    rev: "REV 01",
    dependencies: 2,
    x: 40,
    y: 18,
    icon: HelpCircle,
  },
  {
    id: "node-tst",
    type: "Test",
    title: "Hot Fire Test Protocol 4B",
    code: "TST-402",
    badge: "Test Evidence",
    status: "VALIDATED",
    owner: "HIL Test Lab",
    rev: "REV 05",
    dependencies: 3,
    x: 36,
    y: 72,
    icon: TestTube2,
  },
  {
    id: "node-doc",
    type: "Document",
    title: "Inconel 718 Stress ICD",
    code: "DOC-219",
    badge: "Document",
    status: "VALIDATED",
    owner: "Materials Science",
    rev: "REV 02",
    dependencies: 1,
    x: 65,
    y: 22,
    icon: Building2,
  },
  {
    id: "node-dec",
    type: "Decision",
    title: "Adopt Dual-Layer Heat Shield",
    code: "DEC-019",
    badge: "Decision",
    status: "APPROVED",
    owner: "Chief Engineer",
    rev: "REV 04",
    dependencies: 5,
    x: 68,
    y: 70,
    icon: GitPullRequest,
  },
  {
    id: "node-app",
    type: "Approval",
    title: "Systems Safety Sign-Off",
    code: "APP-005",
    badge: "Approval Gate",
    status: "APPROVED",
    owner: "Safety Lead",
    rev: "REV 01",
    dependencies: 2,
    x: 88,
    y: 46,
    icon: ShieldCheck,
  },
];

interface Edge {
  from: string;
  to: string;
  step: number; // Animation sequence step when this connection activates
  label: string;
}

const EDGES: Edge[] = [
  { from: "node-req", to: "node-qst", step: 1, label: "Generates Question" },
  { from: "node-qst", to: "node-doc", step: 2, label: "References Spec" },
  { from: "node-req", to: "node-tst", step: 2, label: "Verified By" },
  { from: "node-doc", to: "node-dec", step: 3, label: "Evidence Basis" },
  { from: "node-tst", to: "node-dec", step: 3, label: "Supports Decision" },
  { from: "node-dec", to: "node-app", step: 4, label: "Triggers Sign-off" },
];

export function HeroSystemAnimation() {
  const [currentStep, setCurrentStep] = React.useState<number>(0);
  const [isPlaying, setIsPlaying] = React.useState<boolean>(true);
  const [selectedNodeId, setSelectedNodeId] = React.useState<string>("node-req");
  const [isPropagatingChange, setIsPropagatingChange] = React.useState<boolean>(false);

  // Auto-play timeline step loop
  React.useEffect(() => {
    if (!isPlaying || isPropagatingChange) return;

    const timer = setInterval(() => {
      setCurrentStep((prev) => (prev >= 4 ? 0 : prev + 1));
    }, 2800);

    return () => clearInterval(timer);
  }, [isPlaying, isPropagatingChange]);

  const handleSimulateChange = () => {
    setIsPropagatingChange(true);
    setCurrentStep(0);

    // Sequence through change propagation
    let stepCounter = 0;
    const interval = setInterval(() => {
      stepCounter++;
      setCurrentStep(stepCounter);
      if (stepCounter >= 4) {
        clearInterval(interval);
        setTimeout(() => setIsPropagatingChange(false), 1200);
      }
    }, 800);
  };

  const selectedNode = NODES.find((n) => n.id === selectedNodeId) ?? NODES[0]!;

  return (
    <div className="relative w-full rounded-2xl border border-slate-200 bg-white/90 p-4 sm:p-7 shadow-2xl shadow-blue-900/10 backdrop-blur-xl transition-all duration-300">
      {/* Background Decorative Mesh & Glow */}
      <div className="pointer-events-none absolute -inset-1 rounded-2xl bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-blue-600/10 blur-xl opacity-70" />

      {/* Top Header Control Bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50/80 px-3 py-1 font-mono text-xs font-semibold text-blue-700 shadow-xs">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-blue-600" />
            </span>
            SYSTEM REASONING ENGINE // LIVE GRAPH
          </div>
          <span className="hidden font-mono text-xs text-slate-400 sm:inline">
            STEP {currentStep} / 4
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleSimulateChange}
            disabled={isPropagatingChange}
            className="inline-flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-blue-600 to-indigo-600 px-3.5 py-1.5 font-mono text-xs font-semibold text-white shadow-md shadow-blue-500/20 hover:from-blue-700 hover:to-indigo-700 transition-all disabled:opacity-50 active:scale-98"
          >
            <Zap className={cn("size-3.5 text-amber-300", isPropagatingChange && "animate-spin")} />
            {isPropagatingChange ? "Propagating Signal..." : "Simulate REQ Change"}
          </button>

          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            className="inline-flex size-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100 transition-colors"
            title={isPlaying ? "Pause Animation" : "Play Animation"}
          >
            {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5 text-blue-600" />}
          </button>
        </div>
      </div>

      {/* Main Canvas Area */}
      <div className="relative mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[440px] items-stretch">
        {/* Graph Display Area */}
        <div className="relative lg:col-span-8 flex flex-col justify-between rounded-xl border border-slate-100 bg-slate-50/70 p-4 sm:p-6 overflow-hidden min-h-[380px]">
          {/* Subtle Grid Lines */}
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:32px_32px] opacity-40" />

          {/* SVG Connection Lines */}
          <svg className="absolute inset-0 size-full overflow-visible pointer-events-none">
            <defs>
              <linearGradient id="blueGlowGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#2563eb" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0.8" />
              </linearGradient>
              <filter id="glowEffect" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {EDGES.map((edge) => {
              const fromNode = NODES.find((n) => n.id === edge.from);
              const toNode = NODES.find((n) => n.id === edge.to);
              if (!fromNode || !toNode) return null;

              const isEdgeActive = currentStep >= edge.step;
              const isPropagating = isPropagatingChange && currentStep === edge.step;

              // Calculate approximate pixel values based on percentage
              const x1 = `${fromNode.x}%`;
              const y1 = `${fromNode.y}%`;
              const x2 = `${toNode.x}%`;
              const y2 = `${toNode.y}%`;

              return (
                <g key={`${edge.from}-${edge.to}`}>
                  {/* Base static line */}
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={isEdgeActive ? "#3b82f6" : "#cbd5e1"}
                    strokeWidth={isEdgeActive ? 2.5 : 1.5}
                    strokeDasharray={isEdgeActive ? "none" : "4 4"}
                    className="transition-all duration-500"
                  />

                  {/* Active glowing animated signal pulse */}
                  {isEdgeActive && (
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="url(#blueGlowGrad)"
                      strokeWidth={isPropagating ? 4 : 3}
                      filter="url(#glowEffect)"
                      className={cn("transition-all duration-300", isPropagating && "animate-pulse")}
                    />
                  )}
                </g>
              );
            })}
          </svg>

          {/* Interactive Floating Nodes */}
          <div className="relative z-10 size-full min-h-[340px]">
            {NODES.map((node) => {
              const Icon = node.icon;
              const isSelected = selectedNodeId === node.id;

              // Determine if this node is active in the current animation step
              let isActiveInStep = false;
              if (currentStep === 0 && node.type === "Requirement") isActiveInStep = true;
              if (currentStep >= 1 && (node.type === "Requirement" || node.type === "Question")) isActiveInStep = true;
              if (currentStep >= 2 && (node.type === "Document" || node.type === "Test")) isActiveInStep = true;
              if (currentStep >= 3 && node.type === "Decision") isActiveInStep = true;
              if (currentStep >= 4 && node.type === "Approval") isActiveInStep = true;

              const isAffectedByChange = isPropagatingChange && isActiveInStep;

              return (
                <div
                  key={node.id}
                  style={{ left: `${node.x}%`, top: `${node.y}%` }}
                  className="absolute -translate-x-1/2 -translate-y-1/2 transition-all duration-500"
                >
                  <button
                    type="button"
                    onClick={() => setSelectedNodeId(node.id)}
                    className={cn(
                      "group relative flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition-all duration-300 shadow-md",
                      isSelected
                        ? "border-blue-600 bg-white ring-4 ring-blue-500/20 scale-105 shadow-xl shadow-blue-500/15"
                        : isActiveInStep
                        ? "border-blue-300 bg-white hover:border-blue-400 hover:shadow-lg"
                        : "border-slate-200 bg-white/90 text-slate-500 hover:border-slate-300",
                      isAffectedByChange && "ring-4 ring-amber-400/50 border-amber-500 animate-bounce"
                    )}
                  >
                    {/* Node Header Pill */}
                    <div className="flex w-full items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider text-blue-700">
                        <Icon className="size-3.5 text-blue-600" />
                        {node.code}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 font-mono text-[9px] font-extrabold tracking-wide uppercase",
                          node.status === "VALIDATED" && "bg-emerald-100 text-emerald-700 border border-emerald-200",
                          node.status === "APPROVED" && "bg-blue-100 text-blue-700 border border-blue-200",
                          node.status === "PENDING" && "bg-amber-100 text-amber-700 border border-amber-200"
                        )}
                      >
                        {node.status}
                      </span>
                    </div>

                    {/* Node Title */}
                    <span className="font-semibold text-xs text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-1 max-w-[160px]">
                      {node.title}
                    </span>

                    {/* Monospace Metadata Footer */}
                    <div className="flex items-center justify-between w-full pt-1.5 border-t border-slate-100 font-mono text-[10px] text-slate-400">
                      <span>{node.rev}</span>
                      <span className="text-blue-600 font-bold">{node.dependencies} DEPS</span>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Bottom Animation Timeline Bar */}
          <div className="relative z-10 flex items-center justify-between rounded-lg border border-slate-200 bg-white/80 p-3 shadow-xs font-mono text-xs">
            <span className="flex items-center gap-2 text-slate-600 font-semibold">
              <Activity className="size-4 text-blue-600" />
              SYSTEM PROPAGATION PIPELINE
            </span>

            <div className="flex items-center gap-2 text-[11px]">
              <span className={cn("px-2 py-0.5 rounded font-bold transition-all", currentStep === 1 ? "bg-blue-600 text-white shadow-xs" : "bg-slate-100 text-slate-500")}>
                1. REQ → QST
              </span>
              <ArrowRight className="size-3 text-slate-300" />
              <span className={cn("px-2 py-0.5 rounded font-bold transition-all", currentStep === 2 ? "bg-blue-600 text-white shadow-xs" : "bg-slate-100 text-slate-500")}>
                2. EVIDENCE
              </span>
              <ArrowRight className="size-3 text-slate-300" />
              <span className={cn("px-2 py-0.5 rounded font-bold transition-all", currentStep === 3 ? "bg-blue-600 text-white shadow-xs" : "bg-slate-100 text-slate-500")}>
                3. DECISION
              </span>
              <ArrowRight className="size-3 text-slate-300" />
              <span className={cn("px-2 py-0.5 rounded font-bold transition-all", currentStep === 4 ? "bg-indigo-600 text-white shadow-xs" : "bg-slate-100 text-slate-500")}>
                4. APPROVAL
              </span>
            </div>
          </div>
        </div>

        {/* Node Inspector Side Panel */}
        <div className="lg:col-span-4 flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-lg">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 font-mono text-xs font-bold text-slate-800 uppercase tracking-wider">
                <Layers className="size-4 text-blue-600" />
                NODE METADATA INSPECTOR
              </div>
              <span className="rounded bg-blue-50 px-2 py-0.5 font-mono text-xs font-bold text-blue-700 border border-blue-200">
                {selectedNode.code}
              </span>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">Object Type</span>
                <span className="font-bold text-sm text-slate-900">{selectedNode.type}</span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">Specification Title</span>
                <span className="font-medium text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                  {selectedNode.title}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1 font-mono text-xs">
                <div className="flex flex-col gap-0.5 p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-400 uppercase">Owner</span>
                  <span className="font-semibold text-slate-800">{selectedNode.owner}</span>
                </div>
                <div className="flex flex-col gap-0.5 p-2 rounded-lg bg-slate-50 border border-slate-100">
                  <span className="text-[10px] text-slate-400 uppercase">Revision</span>
                  <span className="font-semibold text-slate-800">{selectedNode.rev}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2 border-t border-slate-100">
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">Graph Relationships</span>
                <div className="flex flex-col gap-1.5 font-mono text-[11px]">
                  <div className="flex items-center justify-between rounded bg-blue-50/60 p-2 text-blue-800 border border-blue-100">
                    <span className="font-semibold">REQ-1042 → QST-089</span>
                    <span className="text-[9px] bg-blue-200/80 px-1.5 py-0.5 rounded text-blue-900">Direct</span>
                  </div>
                  <div className="flex items-center justify-between rounded bg-indigo-50/60 p-2 text-indigo-800 border border-indigo-100">
                    <span className="font-semibold">DOC-219 → DEC-019</span>
                    <span className="text-[9px] bg-indigo-200/80 px-1.5 py-0.5 rounded text-indigo-900">Evidence</span>
                  </div>
                  <div className="flex items-center justify-between rounded bg-slate-50 p-2 text-slate-700 border border-slate-100">
                    <span className="font-semibold">DEC-019 → APP-005</span>
                    <span className="text-[9px] bg-slate-200 px-1.5 py-0.5 rounded text-slate-800">Gate</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 p-3.5 text-white shadow-md">
            <div className="flex items-start gap-2.5">
              <Sparkles className="size-4 shrink-0 text-amber-300 mt-0.5" />
              <div className="flex flex-col gap-1 text-xs">
                <span className="font-bold">Real-time Graph Blast Radius</span>
                <span className="text-blue-100 text-[11px] leading-relaxed">
                  Modifying {selectedNode.code} automatically flags 2 downstream evidence items and requires dual-custody re-approval.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
