"use client";

import * as React from "react";
import {
  FileText,
  HelpCircle,
  TestTube2,
  Building2,
  GitPullRequest,
  ShieldCheck,
  Zap,
  Play,
  Pause,
  ArrowRight,
  Sparkles,
  Activity,
  Layers,
  ChevronRight
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
  x: number;
  y: number;
  icon: React.ElementType;
}

const NODES: NodeData[] = [
  {
    id: "node-req",
    type: "Requirement",
    title: "Thermal Boundary <= 850°C",
    code: "REQ-1042",
    badge: "Requirement",
    status: "VALIDATED",
    owner: "Propulsion Team",
    rev: "REV 03",
    dependencies: 4,
    x: 15,
    y: 30,
    icon: FileText,
  },
  {
    id: "node-qst",
    type: "Question",
    title: "Manifold Clearance Margin?",
    code: "QST-089",
    badge: "Question",
    status: "PENDING",
    owner: "Systems Engineering",
    rev: "REV 01",
    dependencies: 2,
    x: 42,
    y: 20,
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
    x: 38,
    y: 72,
    icon: TestTube2,
  },
  {
    id: "node-doc",
    type: "Document",
    title: "Inconel 718 Material Spec",
    code: "DOC-219",
    badge: "Document",
    status: "VALIDATED",
    owner: "Materials Science",
    rev: "REV 02",
    dependencies: 1,
    x: 68,
    y: 24,
    icon: Building2,
  },
  {
    id: "node-dec",
    type: "Decision",
    title: "Dual-Layer Shield Selection",
    code: "DEC-019",
    badge: "Decision",
    status: "APPROVED",
    owner: "Chief Engineer",
    rev: "REV 04",
    dependencies: 5,
    x: 70,
    y: 70,
    icon: GitPullRequest,
  },
  {
    id: "node-app",
    type: "Approval",
    title: "Systems Safety Sign-Off Gate",
    code: "APP-005",
    badge: "Approval Gate",
    status: "APPROVED",
    owner: "Safety Lead",
    rev: "REV 01",
    dependencies: 2,
    x: 90,
    y: 48,
    icon: ShieldCheck,
  },
];

interface Edge {
  from: string;
  to: string;
  step: number;
  label: string;
}

const EDGES: Edge[] = [
  { from: "node-req", to: "node-qst", step: 1, label: "Generates Question" },
  { from: "node-qst", to: "node-doc", step: 2, label: "References Spec" },
  { from: "node-req", to: "node-tst", step: 2, label: "Verified By" },
  { from: "node-doc", to: "node-dec", step: 3, label: "Evidence Basis" },
  { from: "node-tst", to: "node-dec", step: 3, label: "Supports Decision" },
  { from: "node-dec", to: "node-app", step: 4, label: "Triggers Gate" },
];

export function HeroSystemAnimation() {
  const [currentStep, setCurrentStep] = React.useState<number>(0);
  const [isPlaying, setIsPlaying] = React.useState<boolean>(true);
  const [selectedNodeId, setSelectedNodeId] = React.useState<string>("node-req");
  const [isPropagatingChange, setIsPropagatingChange] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (!isPlaying || isPropagatingChange) return;

    const timer = setInterval(() => {
      setCurrentStep((prev) => (prev >= 4 ? 0 : prev + 1));
    }, 3000);

    return () => clearInterval(timer);
  }, [isPlaying, isPropagatingChange]);

  const handleSimulateChange = () => {
    setIsPropagatingChange(true);
    setCurrentStep(0);

    let stepCounter = 0;
    const interval = setInterval(() => {
      stepCounter++;
      setCurrentStep(stepCounter);
      if (stepCounter >= 4) {
        clearInterval(interval);
        setTimeout(() => setIsPropagatingChange(false), 1200);
      }
    }, 850);
  };

  const selectedNode = NODES.find((n) => n.id === selectedNodeId) ?? NODES[0]!;

  return (
    <div className="relative w-full rounded-3xl border border-zinc-200/80 bg-white/90 p-5 sm:p-8 shadow-2xl shadow-zinc-950/5 backdrop-blur-2xl transition-all duration-300">
      {/* Background Subtle Gradient Glow */}
      <div className="pointer-events-none absolute -inset-1 rounded-3xl bg-gradient-to-b from-blue-500/5 via-indigo-500/5 to-transparent blur-2xl opacity-60" />

      {/* Header Bar */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-4 border-b border-zinc-100 pb-5">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-blue-200/80 bg-blue-50/80 px-3.5 py-1 font-mono text-[11px] font-bold tracking-wider text-blue-600 uppercase shadow-xs">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-blue-600" />
            </span>
            SYSTEM GRAPH ENGINE
          </div>
          <span className="hidden font-mono text-xs text-zinc-400 tracking-wider sm:inline">
            // STEP {currentStep} OF 4
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleSimulateChange}
            disabled={isPropagatingChange}
            className="inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-4 py-2 font-mono text-xs font-semibold text-white shadow-md hover:bg-zinc-800 transition-all disabled:opacity-50 active:scale-98"
          >
            <Zap className={cn("size-3.5 text-blue-400", isPropagatingChange && "animate-spin")} />
            {isPropagatingChange ? "Propagating Signal..." : "Simulate REQ Change"}
          </button>

          <button
            type="button"
            onClick={() => setIsPlaying((p) => !p)}
            className="inline-flex size-9 items-center justify-center rounded-xl border border-zinc-200 bg-zinc-50 text-zinc-600 hover:bg-zinc-100 transition-colors"
            title={isPlaying ? "Pause Timeline" : "Play Timeline"}
          >
            {isPlaying ? <Pause className="size-3.5" /> : <Play className="size-3.5 text-blue-600" />}
          </button>
        </div>
      </div>

      {/* Canvas Area */}
      <div className="relative mt-6 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-[460px] items-stretch">
        {/* Visual Graph View */}
        <div className="relative lg:col-span-8 flex flex-col justify-between rounded-2xl border border-zinc-100 bg-zinc-50/60 p-4 sm:p-6 overflow-hidden min-h-[400px]">
          {/* Minimal 1px Grid Background */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(#d4d4d8_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />

          {/* SVG Connection Lines */}
          <svg className="absolute inset-0 size-full overflow-visible pointer-events-none">
            <defs>
              <linearGradient id="majesticBlueGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#2563eb" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#6366f1" stopOpacity="0.9" />
              </linearGradient>
            </defs>

            {EDGES.map((edge) => {
              const fromNode = NODES.find((n) => n.id === edge.from);
              const toNode = NODES.find((n) => n.id === edge.to);
              if (!fromNode || !toNode) return null;

              const isEdgeActive = currentStep >= edge.step;
              const isPropagating = isPropagatingChange && currentStep === edge.step;

              const x1 = `${fromNode.x}%`;
              const y1 = `${fromNode.y}%`;
              const x2 = `${toNode.x}%`;
              const y2 = `${toNode.y}%`;

              return (
                <g key={`${edge.from}-${edge.to}`}>
                  <line
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={isEdgeActive ? "#2563eb" : "#e4e4e7"}
                    strokeWidth={isEdgeActive ? 2.5 : 1}
                    strokeDasharray={isEdgeActive ? "none" : "3 3"}
                    className="transition-all duration-500"
                  />

                  {isEdgeActive && (
                    <line
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="url(#majesticBlueGrad)"
                      strokeWidth={isPropagating ? 4 : 3}
                      className={cn("transition-all duration-300", isPropagating && "animate-pulse")}
                    />
                  )}
                </g>
              );
            })}
          </svg>

          {/* Floating Graph Nodes */}
          <div className="relative z-10 size-full min-h-[350px]">
            {NODES.map((node) => {
              const Icon = node.icon;
              const isSelected = selectedNodeId === node.id;

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
                      "group relative flex flex-col items-start gap-1.5 rounded-2xl border p-3.5 text-left transition-all duration-300 shadow-sm",
                      isSelected
                        ? "border-blue-600 bg-white ring-4 ring-blue-500/15 scale-105 shadow-xl shadow-blue-500/10"
                        : isActiveInStep
                        ? "border-zinc-300 bg-white hover:border-blue-400 hover:shadow-md"
                        : "border-zinc-200 bg-white/80 text-zinc-500 hover:border-zinc-300",
                      isAffectedByChange && "ring-4 ring-amber-400/50 border-amber-500 animate-bounce"
                    )}
                  >
                    <div className="flex w-full items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-extrabold uppercase tracking-widest text-blue-600">
                        <Icon className="size-3.5" />
                        {node.code}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 font-mono text-[9px] font-extrabold tracking-wider uppercase border",
                          node.status === "VALIDATED" && "bg-emerald-50 text-emerald-700 border-emerald-200",
                          node.status === "APPROVED" && "bg-blue-50 text-blue-700 border-blue-200",
                          node.status === "PENDING" && "bg-amber-50 text-amber-700 border-amber-200"
                        )}
                      >
                        {node.status}
                      </span>
                    </div>

                    <span className="font-semibold text-xs text-zinc-950 group-hover:text-blue-600 transition-colors line-clamp-1 max-w-[150px]">
                      {node.title}
                    </span>

                    <div className="flex items-center justify-between w-full pt-1.5 border-t border-zinc-100 font-mono text-[10px] text-zinc-400">
                      <span>{node.rev}</span>
                      <span className="text-blue-600 font-bold">{node.dependencies} DEPS</span>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Timeline Controller Bar */}
          <div className="relative z-10 flex items-center justify-between rounded-xl border border-zinc-200/80 bg-white/90 p-3 shadow-xs font-mono text-xs">
            <span className="flex items-center gap-2 text-zinc-700 font-bold tracking-wider">
              <Activity className="size-4 text-blue-600" />
              LIFECYCLE PIPELINE
            </span>

            <div className="flex items-center gap-2 text-[11px]">
              <span className={cn("px-2.5 py-0.5 rounded-md font-bold transition-all", currentStep === 1 ? "bg-blue-600 text-white shadow-xs" : "bg-zinc-100 text-zinc-500")}>
                1. REQ → QST
              </span>
              <ChevronRight className="size-3 text-zinc-300" />
              <span className={cn("px-2.5 py-0.5 rounded-md font-bold transition-all", currentStep === 2 ? "bg-blue-600 text-white shadow-xs" : "bg-zinc-100 text-zinc-500")}>
                2. EVIDENCE
              </span>
              <ChevronRight className="size-3 text-zinc-300" />
              <span className={cn("px-2.5 py-0.5 rounded-md font-bold transition-all", currentStep === 3 ? "bg-blue-600 text-white shadow-xs" : "bg-zinc-100 text-zinc-500")}>
                3. DECISION
              </span>
              <ChevronRight className="size-3 text-zinc-300" />
              <span className={cn("px-2.5 py-0.5 rounded-md font-bold transition-all", currentStep === 4 ? "bg-indigo-600 text-white shadow-xs" : "bg-zinc-100 text-zinc-500")}>
                4. APPROVAL
              </span>
            </div>
          </div>
        </div>

        {/* Node Telemetry Inspector */}
        <div className="lg:col-span-4 flex flex-col justify-between rounded-2xl border border-zinc-200/80 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div className="flex items-center gap-2 font-mono text-xs font-bold text-zinc-900 uppercase tracking-widest">
                <Layers className="size-4 text-blue-600" />
                TELEMETRY INSPECTOR
              </div>
              <span className="rounded-md bg-blue-50 px-2 py-0.5 font-mono text-xs font-bold text-blue-600 border border-blue-200">
                {selectedNode.code}
              </span>
            </div>

            <div className="flex flex-col gap-3.5">
              <div className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">Primitive Type</span>
                <span className="font-extrabold text-sm text-zinc-950">{selectedNode.type}</span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">Statement / Title</span>
                <span className="font-semibold text-xs text-zinc-800 bg-zinc-50/80 p-3 rounded-xl border border-zinc-100">
                  {selectedNode.title}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 font-mono text-xs">
                <div className="flex flex-col gap-0.5 p-2.5 rounded-xl bg-zinc-50 border border-zinc-100">
                  <span className="text-[9px] text-zinc-400 uppercase tracking-wider">Owner</span>
                  <span className="font-bold text-zinc-900">{selectedNode.owner}</span>
                </div>
                <div className="flex flex-col gap-0.5 p-2.5 rounded-xl bg-zinc-50 border border-zinc-100">
                  <span className="text-[9px] text-zinc-400 uppercase tracking-wider">Revision</span>
                  <span className="font-bold text-zinc-900">{selectedNode.rev}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2 border-t border-zinc-100">
                <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400">Graph Lineage</span>
                <div className="flex flex-col gap-1.5 font-mono text-[11px]">
                  <div className="flex items-center justify-between rounded-lg bg-blue-50/50 p-2.5 text-blue-900 border border-blue-100">
                    <span className="font-bold">REQ-1042 → QST-089</span>
                    <span className="text-[9px] bg-blue-200/80 px-1.5 py-0.5 rounded font-extrabold text-blue-950">Direct Edge</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-indigo-50/50 p-2.5 text-indigo-900 border border-indigo-100">
                    <span className="font-bold">DOC-219 → DEC-019</span>
                    <span className="text-[9px] bg-indigo-200/80 px-1.5 py-0.5 rounded font-extrabold text-indigo-950">Evidence</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 rounded-xl bg-zinc-950 p-4 text-white shadow-md font-mono text-xs">
            <div className="flex items-start gap-2.5">
              <Sparkles className="size-4 shrink-0 text-blue-400 mt-0.5" />
              <div className="flex flex-col gap-1 text-xs">
                <span className="font-bold text-blue-400">Deterministic Blast Radius</span>
                <span className="text-zinc-300 text-[11px] leading-relaxed font-sans">
                  Modifying {selectedNode.code} propagates down 3 dependency paths, requiring re-validation of thermal margins.
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
