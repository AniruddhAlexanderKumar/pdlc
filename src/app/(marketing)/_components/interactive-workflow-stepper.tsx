"use client";

import * as React from "react";
import { FileText, GitPullRequest, Layers, TestTube2 } from "lucide-react";
import { progressSteps } from "@/domain/project-progress";
import { cn } from "@/lib/utils";

/**
 * The workflow this product actually has — the same four stages the
 * dashboard and each project's page use to say what to do next. Titles come
 * from `progressSteps`, so this page cannot describe a different sequence
 * from the one a customer meets after signing in.
 *
 * It previously described five steps, and most were not real: importing
 * from DOORS, Jira, PDFs and ICDs with "100% ingest coverage" (no import
 * exists), a "Question primitive" opened automatically (there is no such
 * record), "dual, cryptographic sign-offs" (the Approval model is unused
 * and nothing is signed), and impact "recalculated instantly whenever any
 * parameter changes" (it runs when someone asks, never on its own). Each
 * statement below is checked against the product.
 */
const STAGE_TITLES = progressSteps({
  stakeholderNeeds: 0,
  requirements: 0,
  requirementsWithoutCheck: 0,
  verificationActivities: 0,
  checksWithoutProof: 0,
  openChanges: 0,
}).map((stage) => stage.title.toUpperCase());

const WORKFLOW_STEPS = [
  {
    step: 1,
    id: "define",
    title: STAGE_TITLES[0]!,
    subtitle: "WRITE EACH THING THE PRODUCT MUST DO AS ITS OWN REQUIREMENT, SPECIFIC ENOUGH THAT SOMEONE COULD CHECK IT.",
    code: "REQUIREMENT",
    stat: "ONE RECORD PER REQUIREMENT",
    icon: FileText,
    detail:
      "Each requirement has its own lifecycle — draft, in review, approved, baselined — and every move between those states is checked on the server.",
  },
  {
    step: 2,
    id: "plan",
    title: STAGE_TITLES[1]!,
    subtitle: "LINK EVERY REQUIREMENT TO THE TEST, ANALYSIS, INSPECTION OR DEMONSTRATION THAT WILL PROVE IT.",
    code: "VERIFICATION",
    stat: "UNCHECKED ONES NAMED",
    icon: TestTube2,
    detail:
      "The link is a real record between two records, so the product can say exactly which requirements have no way to prove them yet — by name, not as a percentage.",
  },
  {
    step: 3,
    id: "proof",
    title: STAGE_TITLES[2]!,
    subtitle: "ATTACH THE REPORT, CALCULATION OR INSPECTION RECORD EACH CHECK PRODUCED.",
    code: "EVIDENCE",
    stat: "LOCKED ONCE VALIDATED",
    icon: Layers,
    detail:
      "Evidence moves from draft to validated. Once validated its content cannot be edited; a correction is a new record that supersedes the old one, and both are kept.",
  },
  {
    step: 4,
    id: "change",
    title: STAGE_TITLES[3]!,
    subtitle: "RECORD A CHANGE REQUEST BEFORE CHANGING ANYTHING, AND SEE WHAT IT TOUCHES FIRST.",
    code: "CHANGE IMPACT",
    stat: "IMPACT SHOWN BEFORE THE EDIT",
    icon: GitPullRequest,
    detail:
      "Impact analysis follows the real links outward from what is changing and names every requirement, design item and check it reaches, with the path it took. It runs when someone asks — never on its own.",
  },
];

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
