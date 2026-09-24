"use client";

import * as React from "react";
import {
  FileText,
  HelpCircle,
  TestTube2,
  GitPullRequest,
  ShieldCheck,
  Zap,
  Check,
  ArrowRight,
  ChevronRight,
  Layers,
  Database
} from "lucide-react";
import { cn } from "@/lib/utils";

const WORKFLOW_STEPS = [
  {
    step: 1,
    id: "ingest",
    title: "1. Ingest Requirements",
    subtitle: "Import messy specs from DOORS, Jira, PDFs, or supplier ICDs into single graph nodes.",
    code: "INGEST_NODE",
    stat: "100% Ingest Coverage",
    icon: FileText,
    detail: "System parses raw requirement text, extracts numerical constraints (e.g. <= 850°C), and maps upstream stakeholder origin.",
  },
  {
    step: 2,
    id: "detect",
    title: "2. Detect Ambiguity",
    subtitle: "Flag unverified assumptions and missing parameter values automatically.",
    code: "AMBIGUITY_GATE",
    stat: "0 Unanswered Gaps",
    icon: HelpCircle,
    detail: "When a requirement lacks attached calculation or evidence, PDLC automatically opens a linked Question primitive (QST-089).",
  },
  {
    step: 3,
    id: "evidence",
    title: "3. Attach Evidence",
    subtitle: "Link hot fire test logs, CAD FEA runs, or DigiKey component specs.",
    code: "EVIDENCE_LINK",
    stat: "O(V+E) Validated",
    icon: TestTube2,
    detail: "Test procedures are mapped directly to parent requirements. Any failed test point instantly marks connected specs as UNVERIFIED.",
  },
  {
    step: 4,
    id: "decision",
    title: "4. Multi-Custody Gate",
    subtitle: "Require dual sign-offs from Systems Lead and Safety Officers before release.",
    code: "DUAL_CUSTODY",
    stat: "Immutable Rationale",
    icon: GitPullRequest,
    detail: "Architectural choices are stored with explicit evidence lineage and cryptographic sign-offs, creating audit-proof defensibility.",
  },
  {
    step: 5,
    id: "blast",
    title: "5. Blast Radius Defense",
    subtitle: "Recalculate downstream impact instantly whenever any parameter changes.",
    code: "BLAST_RADIUS",
    stat: "Pre-Hardware Defense",
    icon: Zap,
    detail: "If REQ-1042's thermal limit changes from 650°C to 800°C, the graph automatically flags affected test procedures and supplier specs before hardware scrap.",
  },
];

export function InteractiveWorkflowStepper() {
  const [activeStepId, setActiveStepId] = React.useState<string>("ingest");
  const activeStep = WORKFLOW_STEPS.find((s) => s.id === activeStepId) ?? WORKFLOW_STEPS[0]!;

  return (
    <div className="w-full rounded-3xl border border-zinc-200/80 bg-white p-6 sm:p-10 shadow-xl shadow-zinc-950/5">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mb-10">
        <span className="font-mono text-xs font-extrabold tracking-[0.3em] text-blue-600 uppercase">
          INTERACTIVE LIFECYCLE WORKFLOW
        </span>
        <h3 className="mt-3 text-3xl sm:text-4xl font-black text-zinc-950 tracking-tight">
          How engineering teams work with PDLC
        </h3>
        <p className="mt-3 text-sm text-zinc-600 font-normal">
          Click through the 5-step lifecycle to see how messy parameters turn into defensible decisions.
        </p>
      </div>

      {/* Stepper Nav Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 font-mono text-xs">
        {WORKFLOW_STEPS.map((s) => {
          const Icon = s.icon;
          const isActive = activeStepId === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveStepId(s.id)}
              className={cn(
                "flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all duration-200",
                isActive
                  ? "border-blue-600 bg-blue-50/50 text-blue-950 ring-2 ring-blue-500/20 shadow-md"
                  : "border-zinc-200 bg-zinc-50/50 text-zinc-600 hover:border-zinc-300 hover:bg-white"
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span className="font-bold text-[10px] text-blue-600 uppercase tracking-wider">{s.code}</span>
                <Icon className={cn("size-4", isActive ? "text-blue-600" : "text-zinc-400")} />
              </div>
              <span className="font-bold text-xs line-clamp-1">{s.title}</span>
            </button>
          );
        })}
      </div>

      {/* Active Step Visual Details */}
      <div className="mt-8 rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-6 sm:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="flex items-center gap-2 font-mono text-xs font-bold text-blue-600">
              <span className="rounded bg-blue-100 px-2.5 py-1 text-blue-800 border border-blue-200">
                STEP {activeStep.step} OF 5
              </span>
              <span className="text-zinc-400">//</span>
              <span>{activeStep.code}</span>
            </div>

            <h4 className="text-2xl sm:text-3xl font-extrabold text-zinc-950 tracking-tight">
              {activeStep.title}
            </h4>

            <p className="text-zinc-700 text-sm sm:text-base leading-relaxed font-medium">
              {activeStep.subtitle}
            </p>

            <div className="rounded-xl bg-white p-4 border border-zinc-200 text-xs text-zinc-600 leading-relaxed font-normal shadow-xs">
              <span className="font-mono font-bold text-zinc-900 block mb-1">Engine Mechanism:</span>
              {activeStep.detail}
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col justify-between rounded-2xl bg-zinc-950 p-6 text-white font-mono text-xs shadow-xl min-h-[200px]">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <span className="text-blue-400 font-bold flex items-center gap-2">
                <Layers className="size-4" /> ENGINE TELEMETRY
              </span>
              <span className="text-[10px] text-zinc-400">STATE: ACTIVE</span>
            </div>

            <div className="my-4 flex flex-col gap-2">
              <span className="text-zinc-400 text-[10px] uppercase tracking-wider">Step Performance Metric</span>
              <span className="text-xl font-extrabold text-emerald-400">{activeStep.stat}</span>
            </div>

            <div className="pt-3 border-t border-zinc-800 flex items-center justify-between text-[11px] text-zinc-400">
              <span>Deterministic Graph Edge</span>
              <span className="text-blue-400 font-bold">O(V+E) Verified</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
