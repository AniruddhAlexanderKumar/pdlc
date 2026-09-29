"use client";

import * as React from "react";
import { Boxes, FileText, GitPullRequest, Layers, Scale, ShieldCheck, TestTube2 } from "lucide-react";
import { PROGRESS_STAGE_DEFINITIONS, type ProgressStage } from "@/domain/project-progress";
import { cn } from "@/lib/utils";

/**
 * The workflow this product actually has — the same six stages each project's
 * page and dashboard card use to say what to do next. Titles and questions
 * come from `PROGRESS_STAGE_DEFINITIONS`, so this page cannot describe a
 * different sequence from the one a customer meets after signing in.
 *
 * It once described five steps, most of them not real: importing from
 * DOORS, Jira, PDFs and ICDs with "100% ingest coverage", a "Question
 * primitive" opened automatically, "dual, cryptographic sign-offs", and
 * impact "recalculated instantly whenever any parameter changes". Each
 * statement below is checked against the product.
 */
const STAGE_COPY: Record<
  ProgressStage,
  { subtitle: string; code: string; stat: string; icon: typeof FileText; detail: string }
> = {
  DEFINE: {
    subtitle: "WRITE EACH THING THE PRODUCT MUST DO AS ITS OWN REQUIREMENT, SPECIFIC ENOUGH THAT SOMEONE COULD CHECK IT.",
    code: "REQUIREMENT",
    stat: "ONE RECORD PER REQUIREMENT",
    icon: FileText,
    detail:
      "Each requirement has its own lifecycle — draft, in review, approved, baselined — and every move between those states is checked on the server.",
  },
  DESIGN: {
    subtitle: "DESCRIBE THE PARTS OF THE PRODUCT, AND LINK EACH REQUIREMENT TO THE PART THAT WILL MEET IT.",
    code: "DESIGN ITEM",
    stat: "REQUIREMENTS MAPPED TO PARTS",
    icon: Boxes,
    detail:
      "Design items form the product structure, with the interfaces between them recorded as records of their own. A requirement is linked to the part that meets it by a real link, not a naming convention.",
  },
  DECIDE: {
    subtitle: "RECORD WHAT YOU CHOSE, WHAT ELSE YOU CONSIDERED, AND WHY.",
    code: "DECISION",
    stat: "THE WHY, KEPT",
    icon: Scale,
    detail:
      "A decision keeps the alternatives that were rejected, the assumptions it rests on and the outcome it expected. If an assumption later stops holding, the product can say so.",
  },
  VERIFY: {
    subtitle: "LINK EVERY REQUIREMENT TO THE TEST, ANALYSIS, INSPECTION OR DEMONSTRATION THAT WILL PROVE IT — THEN ATTACH THE RESULT.",
    code: "VERIFICATION",
    stat: "LOCKED ONCE VALIDATED",
    icon: TestTube2,
    detail:
      "The product can name every requirement with no way to prove it yet. Evidence moves from draft to validated; once validated it cannot be edited, and a correction is a new record that supersedes the old one.",
  },
  CONTROL: {
    subtitle: "RECORD A CHANGE BEFORE MAKING IT, AND SEE WHAT IT TOUCHES FIRST.",
    code: "CHANGE IMPACT",
    stat: "IMPACT SHOWN BEFORE THE EDIT",
    icon: GitPullRequest,
    detail:
      "Impact analysis follows the real links outward from what is changing and names every requirement, design item and check it reaches, with the path it took. It runs when someone asks — never on its own.",
  },
  RELEASE: {
    subtitle: "LOCK THE CURRENT VERSION OF THE DESIGN, THEN RUN THE RELEASE CHECK.",
    code: "READINESS",
    stat: "UNKNOWN IS NEVER READY",
    icon: ShieldCheck,
    detail:
      "The release check lists exactly what stands in the way. Where it cannot tell, it says unknown rather than ready — and a check the project has moved on from is reported as out of date.",
  },
};

const WORKFLOW_STEPS = PROGRESS_STAGE_DEFINITIONS.map((stage, index) => ({
  step: index + 1,
  id: stage.stage.toLowerCase(),
  title: stage.title.toUpperCase(),
  ...STAGE_COPY[stage.stage],
}));

export function InteractiveWorkflowStepper() {
  const [activeStepId, setActiveStepId] = React.useState<string>("define");
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
          CLICK THROUGH THE {WORKFLOW_STEPS.length}-STAGE LIFECYCLE — THE SAME ONE EVERY PROJECT
          FOLLOWS INSIDE THE PRODUCT, NOT A SIMPLIFICATION OF IT.
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
                STEP {activeStep.step} OF {WORKFLOW_STEPS.length}
              </span>
              <span className="text-slate-600">{"//"}</span>
              <span>{activeStep.code}</span>
            </div>

            <h4 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight font-sans">
              {activeStep.title}
            </h4>

            <p className="text-slate-300 text-xs sm:text-sm leading-relaxed uppercase tracking-wider">
              {activeStep.subtitle}
            </p>

            <div className="border border-white/10 bg-black p-4 text-xs text-slate-400 leading-relaxed uppercase tracking-wider">
              <span className="font-bold text-cyan-400 block mb-1">HOW IT WORKS:</span>
              {activeStep.detail}
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col justify-between border border-white/15 bg-black p-6 text-white min-h-[200px]">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <span className="text-cyan-400 font-bold flex items-center gap-2">
                <Layers className="size-4" /> WHAT YOU GET
              </span>
            </div>

            <div className="my-4 flex flex-col gap-1">
              <span className="text-slate-400 text-[10px] uppercase">RESULT</span>
              <span className="text-xl font-black text-emerald-400">{activeStep.stat}</span>
            </div>

            <div className="pt-3 border-t border-white/10 flex items-center justify-between text-[10px] text-slate-400 uppercase">
              <span>SAME RECORDS IN</span>
              <span className="text-cyan-400 font-bold">SAME ANSWER OUT</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
