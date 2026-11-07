"use client";

import * as React from "react";
import {
  Boxes,
  FileText,
  GitPullRequest,
  Layers,
  Scale,
  ShieldCheck,
  TestTube2,
} from "lucide-react";
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
    subtitle:
      "Write each thing the product must do as its own requirement, specific enough that someone can check it.",
    code: "REQUIREMENT",
    stat: "One record per requirement",
    icon: FileText,
    detail:
      "Each requirement has its own lifecycle — draft, in review, approved, baselined — and every move between those states is checked on the server.",
  },
  DESIGN: {
    subtitle:
      "Describe the parts of the product, and link each requirement to the part that will meet it.",
    code: "DESIGN ITEM",
    stat: "Requirements mapped to parts",
    icon: Boxes,
    detail:
      "Design items form the product structure, with the interfaces between them recorded as records of their own. A requirement is linked to the part that meets it by a real link, not a naming convention.",
  },
  DECIDE: {
    subtitle: "Record what you chose, what else you considered, and why.",
    code: "DECISION",
    stat: "The why, kept",
    icon: Scale,
    detail:
      "A decision keeps the alternatives that were rejected, the assumptions it rests on and the outcome it expected. If an assumption later stops holding, the product can say so.",
  },
  VERIFY: {
    subtitle:
      "Link every requirement to the test, analysis, inspection, or demonstration that will prove it.",
    code: "VERIFICATION",
    stat: "Locked once validated",
    icon: TestTube2,
    detail:
      "The product can name every requirement with no way to prove it yet. Evidence moves from draft to validated; once validated it cannot be edited, and a correction is a new record that supersedes the old one.",
  },
  CONTROL: {
    subtitle: "Record a change before making it, and see what it touches first.",
    code: "CHANGE IMPACT",
    stat: "Impact shown before the edit",
    icon: GitPullRequest,
    detail:
      "Impact analysis follows the real links outward from what is changing and names every requirement, design item and check it reaches, with the path it took. It runs when someone asks — never on its own.",
  },
  RELEASE: {
    subtitle: "Lock the current version of the design, then run the release check.",
    code: "READINESS",
    stat: "Unknown is never ready",
    icon: ShieldCheck,
    detail:
      "The release check lists exactly what stands in the way. Where it cannot tell, it says unknown rather than ready — and a check the project has moved on from is reported as out of date.",
  },
};

const WORKFLOW_STEPS = PROGRESS_STAGE_DEFINITIONS.map((stage, index) => ({
  step: index + 1,
  id: stage.stage.toLowerCase(),
  title: stage.title,
  ...STAGE_COPY[stage.stage],
}));

export function InteractiveWorkflowStepper() {
  const [activeStepId, setActiveStepId] = React.useState<string>("define");
  const activeStep = WORKFLOW_STEPS.find((s) => s.id === activeStepId) ?? WORKFLOW_STEPS[0]!;

  return (
    <div className="w-full rounded-3xl border border-[#d9d5c9] bg-[#fbfaf6] p-5 shadow-[0_20px_60px_-45px_rgba(47,60,49,0.5)] sm:p-8">
      {/* Header */}
      <div className="mx-auto mb-8 max-w-3xl text-center">
        <span className="text-xs font-semibold tracking-[0.18em] text-[#a06f55] uppercase">
          Interactive lifecycle
        </span>
        <h3 className="mt-3 font-serif text-3xl font-normal tracking-tight text-[#334139] sm:text-4xl">
          How product teams work with PDLC
        </h3>
        <p className="mt-3 text-sm leading-6 text-[#747d72]">
          Move through the {WORKFLOW_STEPS.length}-stage lifecycle that every project follows.
        </p>
      </div>

      {/* Stepper Buttons */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {WORKFLOW_STEPS.map((s) => {
          const Icon = s.icon;
          const isActive = activeStepId === s.id;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => setActiveStepId(s.id)}
              aria-pressed={isActive}
              className={cn(
                "flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-all duration-200",
                isActive
                  ? "border-[#9da994] bg-[#edf0e7] font-semibold text-[#354238]"
                  : "border-[#e1ddd2] bg-[#fffefa] text-[#737b70] hover:border-[#bac2b4] hover:text-[#354238]",
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span className="text-[10px] font-semibold tracking-wide text-[#8a795f]">
                  {s.code}
                </span>
                <Icon className={cn("size-4", isActive ? "text-[#61745f]" : "text-[#a1a398]")} />
              </div>
              <span className="line-clamp-1 text-xs font-medium">{s.title}</span>
            </button>
          );
        })}
      </div>

      {/* Active Step Telemetry Display */}
      <div className="mt-5 rounded-2xl border border-[#e1ddd2] bg-[#f7f5ef] p-5 sm:p-7">
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12">
          <div className="flex flex-col gap-4 lg:col-span-7">
            <div className="flex items-center gap-3 text-xs font-medium text-[#61745f]">
              <span className="rounded-full border border-[#d8d9cb] bg-[#e9ede3] px-3 py-1 text-[#536b58]">
                STEP {activeStep.step} OF {WORKFLOW_STEPS.length}
              </span>
              <span className="text-[#aaa99d]">·</span>
              <span>{activeStep.code}</span>
            </div>

            <h4 className="font-serif text-2xl font-normal tracking-tight text-[#334139] sm:text-3xl">
              {activeStep.title}
            </h4>

            <p className="text-sm leading-6 text-[#5f6b61]">{activeStep.subtitle}</p>

            <div className="rounded-xl border border-[#e3dfd4] bg-[#fffefa] p-4 text-sm leading-6 text-[#737b70]">
              <span className="mb-1 block text-xs font-semibold tracking-wide text-[#8a795f]">
                How it works
              </span>
              {activeStep.detail}
            </div>
          </div>

          <div className="flex min-h-[200px] flex-col justify-between rounded-2xl border border-[#e1ddd2] bg-[#fffefa] p-6 text-[#334139] lg:col-span-5">
            <div className="flex items-center justify-between border-b border-[#e8e4da] pb-3">
              <span className="flex items-center gap-2 text-sm font-medium text-[#61745f]">
                <Layers className="size-4" /> WHAT YOU GET
              </span>
            </div>

            <div className="my-4 flex flex-col gap-1">
              <span className="text-[10px] tracking-wide text-[#858b80] uppercase">Result</span>
              <span className="font-serif text-xl text-[#536b58]">{activeStep.stat}</span>
            </div>

            <div className="flex items-center justify-between border-t border-[#e8e4da] pt-3 text-[10px] tracking-wide text-[#858b80] uppercase">
              <span>Same records in</span>
              <span className="font-semibold text-[#61745f]">Same answer out</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
