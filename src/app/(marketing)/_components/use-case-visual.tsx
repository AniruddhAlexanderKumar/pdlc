"use client";

import * as React from "react";
import { Shield, Zap } from "lucide-react";
import { cn } from "@/lib/utils";

export function UseCaseVisual() {
  const [activeStep, setActiveStep] = React.useState<number>(1);

  const steps = [
    {
      step: 1,
      title: "1. Requirement Modified",
      code: "REQ-042",
      desc: "Thermal upper bound increased from 650°C to 800°C by Thermal Lead.",
      status: "TRIGGER",
      bg: "bg-amber-50 text-amber-700 border-amber-200",
    },
    {
      step: 2,
      title: "2. Blast Radius Computed",
      code: "O(V+E) SEARCH",
      desc: "System identifies 3 downstream impacts: Structural spec, Manifold test plan, Parker Valve ICD.",
      status: "COMPUTED",
      bg: "bg-blue-50 text-blue-700 border-blue-200",
    },
    {
      step: 3,
      title: "3. Dual-Custody Approval",
      code: "DEC-019",
      desc: "Requires explicit sign-off from Systems Lead + Chief Engineer before proceeding to hardware.",
      status: "ACTION",
      bg: "bg-indigo-50 text-indigo-700 border-indigo-200",
    },
  ];

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-blue-900/5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-2.5 font-mono text-xs font-bold text-slate-800 uppercase tracking-wider">
          <Zap className="size-4 text-blue-600" />
          <span>SUBSYSTEM CHANGE BLAST RADIUS SCENARIO</span>
        </div>
        <span className="rounded bg-emerald-100 px-2.5 py-0.5 font-mono text-[10px] font-extrabold text-emerald-800 border border-emerald-200">
          PRE-IMPLEMENTATION DEFENSE
        </span>
      </div>

      <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        {steps.map((s) => (
          <button
            key={s.step}
            type="button"
            onClick={() => setActiveStep(s.step)}
            className={cn(
              "flex flex-col gap-3 rounded-xl border p-5 text-left transition-all duration-300",
              activeStep === s.step
                ? "border-blue-600 bg-white ring-4 ring-blue-500/10 shadow-lg scale-[1.02]"
                : "border-slate-200 bg-slate-50/70 hover:border-slate-300 hover:bg-white"
            )}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs text-slate-900">{s.title}</span>
              <span className={cn("rounded-full px-2 py-0.5 font-mono text-[9px] font-extrabold border", s.bg)}>
                {s.status}
              </span>
            </div>
            <span className="font-mono text-xs font-bold text-blue-600">{s.code}</span>
            <p className="text-xs text-slate-600 leading-relaxed font-medium">{s.desc}</p>
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 p-4 text-white shadow-md">
        <div className="flex items-center gap-3">
          <Shield className="size-5 text-amber-300 shrink-0" />
          <span className="text-xs font-semibold">
            Change impact identified and neutralized <span className="font-mono underline underline-offset-2">before</span> physical test or manufacturing release.
          </span>
        </div>
        <span className="font-mono text-xs font-bold bg-white/20 px-3 py-1 rounded-lg backdrop-blur-xs">
          RISK AVOIDED: $480,000 HARDWARE SCRAP
        </span>
      </div>
    </div>
  );
}
