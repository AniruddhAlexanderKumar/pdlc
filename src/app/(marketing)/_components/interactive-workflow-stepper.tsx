"use client";

import * as React from "react";
import {
  FileText,
  HelpCircle,
  TestTube2,
  GitPullRequest,
  ShieldCheck,
  Zap,
  Layers
} from "lucide-react";
import { cn } from "@/lib/utils";

const WORKFLOW_STEPS = [
  {
    step: 1,
    id: "ingest",
    title: "1. INGEST REQUIREMENTS",
    subtitle: "IMPORT MESSY SPECS FROM DOORS, JIRA, PDFS, OR SUPPLIER ICDS INTO SINGLE GRAPH NODES.",
    code: "INGEST_NODE",
    stat: "100% INGEST COVERAGE",
    icon: FileText,
    detail: "System parses raw requirement text, extracts numerical constraints (e.g. <= 850°C), and maps upstream origin.",
  },
  {
    step: 2,
    id: "detect",
    title: "2. DETECT AMBIGUITY",
    subtitle: "FLAG UNVERIFIED ASSUMPTIONS AND MISSING PARAMETER VALUES AUTOMATICALLY.",
    code: "AMBIGUITY_GATE",
    stat: "0 UNANSWERED GAPS",
    icon: HelpCircle,
    detail: "When a requirement lacks attached calculation or evidence, PDLC automatically opens a linked Question primitive (QST-089).",
  },
  {
    step: 3,
    id: "evidence",
    title: "3. ATTACH EVIDENCE",
    subtitle: "LINK HOT FIRE TEST LOGS, CAD FEA RUNS, OR DIGIKEY COMPONENT SPECS.",
    code: "EVIDENCE_LINK",
    stat: "O(V+E) VALIDATED",
    icon: TestTube2,
    detail: "Test procedures are mapped directly to parent requirements. Any failed test point instantly marks connected specs as UNVERIFIED.",
  },
  {
    step: 4,
    id: "decision",
    title: "4. MULTI-CUSTODY GATE",
    subtitle: "REQUIRE DUAL SIGN-OFFS FROM SYSTEMS LEAD AND SAFETY OFFICERS BEFORE RELEASE.",
    code: "DUAL_CUSTODY",
    stat: "IMMUTABLE RATIONALE",
    icon: GitPullRequest,
    detail: "Architectural choices are stored with explicit evidence lineage and cryptographic sign-offs, creating audit-proof defensibility.",
  },
  {
    step: 5,
    id: "blast",
    title: "5. BLAST RADIUS DEFENSE",
    subtitle: "RECALCULATE DOWNSTREAM IMPACT INSTANTLY WHENEVER ANY PARAMETER CHANGES.",
    code: "BLAST_RADIUS",
    stat: "PRE-HARDWARE DEFENSE",
    icon: Zap,
    detail: "If REQ-1042's thermal limit changes from 650°C to 800°C, the graph automatically flags affected test procedures and supplier specs before hardware scrap.",
  },
];

export function InteractiveWorkflowStepper() {
  const [activeStepId, setActiveStepId] = React.useState<string>("ingest");
  const activeStep = WORKFLOW_STEPS.find((s) => s.id === activeStepId) ?? WORKFLOW_STEPS[0]!;

  return (
    <div className="w-full rounded-none border border-white/15 bg-black p-6 sm:p-10 shadow-2xl font-mono">
      {/* Header */}
      <div className="text-center max-w-3xl mx-auto mb-10">
        <span className="text-xs font-bold tracking-[0.35em] text-cyan-400 uppercase">
          INTERACTIVE LIFECYCLE PIPELINE
        </span>
        <h3 className="mt-3 text-3xl sm:text-4xl font-black text-white uppercase tracking-tight font-sans">
          HOW PRODUCT TEAMS WORK WITH PDLC
        </h3>
        <p className="mt-3 text-xs text-slate-400 uppercase tracking-wider">
          CLICK THROUGH THE 5-STEP LIFECYCLE TO SEE HOW PARAMETERS TURN INTO DEFENSIBLE DECISIONS.
        </p>
      </div>

      {/* Stepper Buttons */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
        {WORKFLOW_STEPS.map((s) => {
          const Icon = s.icon;
          const isActive = activeStepId === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveStepId(s.id)}
              className={cn(
                "flex flex-col items-start gap-2 border p-4 text-left uppercase transition-all duration-200",
                isActive
                  ? "border-cyan-400 bg-zinc-950 text-white font-black shadow-lg shadow-cyan-500/10"
                  : "border-white/15 bg-black text-slate-400 hover:border-white hover:text-white"
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span className="font-bold text-[10px] text-cyan-400 tracking-wider">{s.code}</span>
                <Icon className={cn("size-4", isActive ? "text-cyan-400" : "text-slate-500")} />
              </div>
              <span className="font-bold text-xs line-clamp-1">{s.title}</span>
            </button>
          );
        })}
      </div>

      {/* Active Step Telemetry Display */}
      <div className="mt-8 border border-white/15 bg-zinc-950 p-6 sm:p-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 flex flex-col gap-4">
            <div className="flex items-center gap-3 text-xs font-bold text-cyan-400">
              <span className="bg-cyan-950 text-cyan-400 border border-cyan-800 px-3 py-1 font-mono">
                STEP {activeStep.step} OF 5
              </span>
              <span className="text-slate-600">//</span>
              <span>{activeStep.code}</span>
            </div>

            <h4 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight font-sans">
              {activeStep.title}
            </h4>

            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed uppercase tracking-wider">
              {activeStep.subtitle}
            </p>

            <div className="border border-white/10 bg-black p-4 text-xs text-slate-400 leading-relaxed uppercase tracking-wider">
              <span className="font-bold text-cyan-400 block mb-1">ENGINE MECHANISM:</span>
              {activeStep.detail}
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col justify-between border border-white/15 bg-black p-6 text-white min-h-[200px]">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-cyan-400 font-bold flex items-center gap-2">
                <Layers className="size-4" /> TELEMETRY STATUS
              </span>
              <span className="text-[10px] text-slate-400">STATE: ACTIVE</span>
            </div>

            <div className="my-4 flex flex-col gap-1">
              <span className="text-slate-400 text-[10px] uppercase">PERFORMANCE METRIC</span>
              <span className="text-xl font-black text-emerald-400">{activeStep.stat}</span>
            </div>

            <div className="pt-3 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400 uppercase">
              <span>DETERMINISTIC GRAPH EDGE</span>
              <span className="text-cyan-400 font-bold">O(V+E) VALIDATED</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
