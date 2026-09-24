"use client";

import * as React from "react";
import { AlertOctagon, CheckCircle2, FileCheck, FileText, GitPullRequest, HelpCircle, Layers, ShieldAlert, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export function UseCaseVisual() {
  return (
    <div className="w-full rounded-xl border border-slate-800 bg-slate-950 p-6 shadow-2xl">
      {/* Top Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-2">
          <GitPullRequest className="size-4 text-purple-400" />
          <span className="font-mono text-xs font-bold text-slate-200 uppercase tracking-wider">
            REAL ENGINEERING SCENARIO: SUBSYSTEM REQUIREMENT CHANGE
          </span>
        </div>
        <Badge variant="outline" className="font-mono text-xs border-purple-500/40 text-purple-300 bg-purple-500/10">
          REQ-PROP-104: Main Valve Actuation Speed
        </Badge>
      </div>

      {/* Grid of Identified Impact Cascades */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="flex flex-col gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 p-3.5 font-mono">
          <span className="text-2xl font-extrabold text-slate-100">12</span>
          <span className="text-xs font-semibold text-slate-300 flex items-center gap-1">
            <FileCheck className="size-3 text-blue-400" /> Dependent Reqs
          </span>
          <span className="text-[10px] text-slate-500">Cross-domain link</span>
        </div>

        <div className="flex flex-col gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 p-3.5 font-mono">
          <span className="text-2xl font-extrabold text-slate-100">3</span>
          <span className="text-xs font-semibold text-slate-300 flex items-center gap-1">
            <FileText className="size-3 text-purple-400" /> Affected Docs
          </span>
          <span className="text-[10px] text-slate-500">ICDs & Specifications</span>
        </div>

        <div className="flex flex-col gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 p-3.5 font-mono">
          <span className="text-2xl font-extrabold text-slate-100">2</span>
          <span className="text-xs font-semibold text-slate-300 flex items-center gap-1">
            <HelpCircle className="size-3 text-amber-400" /> Open Questions
          </span>
          <span className="text-[10px] text-slate-500">Unresolved trades</span>
        </div>

        <div className="flex flex-col gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 p-3.5 font-mono">
          <span className="text-2xl font-extrabold text-slate-100">1</span>
          <span className="text-xs font-semibold text-slate-300 flex items-center gap-1">
            <ShieldAlert className="size-3 text-rose-400" /> Missing Artifact
          </span>
          <span className="text-[10px] text-slate-500">Verification gap</span>
        </div>

        <div className="flex flex-col gap-1.5 rounded-lg border border-slate-800 bg-slate-900/60 p-3.5 font-mono col-span-2 sm:col-span-1">
          <span className="text-2xl font-extrabold text-slate-100">4</span>
          <span className="text-xs font-semibold text-slate-300 flex items-center gap-1">
            <ShieldCheck className="size-3 text-cyan-400" /> Stakeholder Sign-offs
          </span>
          <span className="text-[10px] text-slate-500">Approval gates</span>
        </div>
      </div>

      {/* Hero Highlight Box */}
      <div className="mt-6 rounded-lg border border-emerald-500/40 bg-emerald-950/20 p-4 sm:p-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
        <div className="flex items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="size-5" />
          </div>
          <div className="flex flex-col">
            <span className="text-base font-extrabold tracking-tight text-emerald-300">
              Change impact identified before implementation.
            </span>
            <span className="text-xs font-mono text-emerald-400/80">
              Zero silent failures. Downstream impact cascaded and locked prior to hardware release.
            </span>
          </div>
        </div>

        <Badge variant="outline" className="font-mono text-xs border-emerald-500/40 text-emerald-400 bg-emerald-500/10 shrink-0">
          PROVEN DEFENSIVE GRAPH
        </Badge>
      </div>
    </div>
  );
}
