import Link from "next/link";
import {
  ArrowRight,
  Boxes,
  FileText,
  GitPullRequest,
  Lightbulb,
  Lock,
  Scale,
  Server,
  ShieldCheck,
  TestTube2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { InteractiveShowcase } from "./_components/interactive-showcase";
import { InteractiveWorkflowStepper } from "./_components/interactive-workflow-stepper";

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden bg-transparent text-white selection:bg-cyan-500 selection:text-black font-sans">
      {/* SECTION 1: HERO */}
      <section className="relative min-h-[85vh] flex flex-col justify-center items-center py-28 sm:py-36 border-b border-white/10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl text-center">
          {/* Company identity: who built it. What it does comes next, explicitly. */}
          <div className="font-mono text-sm sm:text-base text-cyan-400 font-extrabold tracking-[0.4em] uppercase">
            5 MAN MISSION
          </div>

          <h1 className="mt-5 text-4xl sm:text-6xl lg:text-8xl font-black uppercase text-white tracking-tight leading-[0.95]">
            THE MORNINGSTAR <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
              SOLUTION.
            </span>
          </h1>

          {/*
            The explicit statement the previous hero never made: what kind of
            software this is. "Product Development Life Cycle" is spelled
            out once, here, before the PDLC abbreviation is used anywhere
            else on the page — a visitor who has never heard the term should
            not have to guess what it stands for.
          */}
          <p className="mt-8 text-base sm:text-xl text-white font-semibold leading-relaxed max-w-3xl mx-auto">
            A Product Development Life Cycle (PDLC) platform for hardware and software teams:
            requirements, design, decisions, verification, evidence and change, connected by real
            links instead of tribal knowledge.
          </p>

          <p className="mt-4 text-xs sm:text-sm text-slate-400 font-normal leading-relaxed max-w-2xl mx-auto uppercase tracking-wide font-mono">
            SELF-HOSTED. YOUR POSTGRESQL. NO THIRD PARTY EVER SEES YOUR RECORDS.
          </p>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-5 font-mono text-xs font-extrabold uppercase tracking-widest">
            <Button
              asChild
              size="lg"
              className="h-14 px-10 rounded-none bg-white text-black hover:bg-slate-200 font-mono text-xs font-black uppercase tracking-widest transition-all border border-white"
            >
              <Link href="/sign-up" className="flex items-center gap-3">
                START A PROJECT
                <ArrowRight className="size-4" />
              </Link>
            </Button>

            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-14 px-10 rounded-none border border-white/30 bg-black/60 hover:bg-white hover:text-black font-mono text-xs font-extrabold text-white uppercase tracking-widest transition-all backdrop-blur-xs"
            >
              <a href="#how-it-works" className="flex items-center gap-3">
                SEE HOW IT WORKS
              </a>
            </Button>
          </div>

          {/*
            A four-tile stat strip stood here reading "0 MS / UNVERIFIED
            GAPS" and "100% TRACEABLE LINEAGE" — an invented metric paired
            with a nonsensical unit, and a percentage this product's own
            tests explicitly forbid anywhere in its output
            (no-fabricated-metrics.test.ts). What replaces it states real,
            checkable properties instead of manufactured statistics — none
            of these can go stale the way a specific number could.
          */}
          <div className="mt-20 pt-10 border-t border-white/10 grid grid-cols-2 md:grid-cols-4 gap-8 text-center font-mono uppercase tracking-wider">
            <div className="flex flex-col gap-1">
              <span className="text-base sm:text-lg font-black text-white">SELF-HOSTED</span>
              <span className="text-[10px] text-slate-400 font-bold">YOUR DATABASE, YOUR CONTROL</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-base sm:text-lg font-black text-cyan-400">NO INVENTED SCORES</span>
              <span className="text-[10px] text-slate-400 font-bold">REAL LINKS OR AN HONEST GAP</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-base sm:text-lg font-black text-white">APPEND-ONLY AUDIT</span>
              <span className="text-[10px] text-slate-400 font-bold">NOTHING IS EVER EDITED OUT</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-base sm:text-lg font-black text-indigo-400">NO AI JUDGMENT</span>
              <span className="text-[10px] text-slate-400 font-bold">RULES YOU CAN READ, NOT A MODEL</span>
            </div>
          </div>
        </div>
      </section>

      {/*
        A pulsing "live telemetry" strip ran here: "100% OPERATIONAL",
        "DECISION ENGINE LATENCY < 5MS", "IMMUTABLE SIGNATURES", "AMAZON /
        DIGIKEY / MOUSER", "AES-256 GCM / ITAR COMPLIANT". All hardcoded, and
        five of six untrue — latency has never been measured, the audit log
        carries no signatures, the store integrations do not exist, and no
        compliance is held. Styled as a live readout, it was the most
        official-looking claim on the page and the least supported.
      */}

      {/* SECTION 2: MANIFESTO */}
      <section id="manifesto" className="py-28 sm:py-40 border-b border-white/10 bg-black/70 backdrop-blur-sm text-center">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <span className="font-mono text-xs font-bold tracking-[0.4em] text-cyan-400 uppercase">
            THE MORNINGSTAR MANIFESTO
          </span>
          <h2 className="mt-8 text-3xl sm:text-5xl lg:text-6xl font-black text-white uppercase tracking-tight leading-[1.08]">
            “ENGINEERING DECISIONS SHOULDN’T BE BURIED IN SPREADSHEETS OR SCATTERED ACROSS CHAT LOGS. THEY BELONG IN ONE CONNECTED RECORD.”
          </h2>
          <p className="mt-8 font-mono text-xs sm:text-sm text-slate-400 max-w-2xl mx-auto leading-relaxed uppercase tracking-wider">
            MORNINGSTAR REPLACES FRAGMENTED DOCUMENTATION WITH REAL RELATIONSHIPS BETWEEN REQUIREMENTS,
            DESIGN, DECISIONS, VERIFICATION AND EVIDENCE. WHEN SOMETHING CHANGES, IT SHOWS YOU WHAT THAT
            CHANGE TOUCHES — WHEN YOU ASK, NEVER AUTOMATICALLY, AND NEVER BY GUESSING.
          </p>
        </div>
      </section>

      {/* SECTION 3: CORE CONCEPTS */}
      <section className="py-24 sm:py-36 border-b border-white/10 bg-black/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="font-mono text-xs font-bold tracking-[0.4em] text-cyan-400 uppercase">
              THE MORNINGSTAR RECORD
            </span>
            <h2 className="mt-4 text-4xl sm:text-6xl font-black uppercase text-white tracking-tight">
              SIX RECORD TYPES. ONE LIFECYCLE.
            </h2>
            <p className="mt-4 font-mono text-xs text-slate-400 uppercase tracking-wider">
              EVERY PROJECT IS BUILT FROM THE SAME SIX KINDS OF RECORD — THE ONES YOU WILL ACTUALLY
              OPEN INSIDE THE PRODUCT, NOT A MARKETING SIMPLIFICATION OF IT.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 font-mono text-xs">
            <div className="group rounded-none border border-white/15 bg-black/90 p-8 hover:border-cyan-400 transition-all duration-300">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="font-bold text-cyan-400 uppercase tracking-widest">RECORD 01</span>
                <Lightbulb className="size-5 text-white" />
              </div>
              <h3 className="mt-6 text-xl font-black text-white uppercase tracking-wider">STAKEHOLDER NEED</h3>
              <p className="mt-3 text-slate-400 leading-relaxed font-normal">
                What someone actually asked for, in their own words, before it becomes a formal
                requirement.
              </p>
            </div>

            <div className="group rounded-none border border-white/15 bg-black/90 p-8 hover:border-amber-400 transition-all duration-300">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="font-bold text-amber-400 uppercase tracking-widest">RECORD 02</span>
                <FileText className="size-5 text-white" />
              </div>
              <h3 className="mt-6 text-xl font-black text-white uppercase tracking-wider">REQUIREMENT</h3>
              <p className="mt-3 text-slate-400 leading-relaxed font-normal">
                One thing the product must do, specific enough that someone could check whether it
                was met.
              </p>
            </div>

            <div className="group rounded-none border border-white/15 bg-black/90 p-8 hover:border-emerald-400 transition-all duration-300">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="font-bold text-emerald-400 uppercase tracking-widest">RECORD 03</span>
                <Boxes className="size-5 text-white" />
              </div>
              <h3 className="mt-6 text-xl font-black text-white uppercase tracking-wider">DESIGN ITEM</h3>
              <p className="mt-3 text-slate-400 leading-relaxed font-normal">
                A part of the product — system, assembly, component or software — that a
                requirement is allocated to by a real link.
              </p>
            </div>

            <div className="group rounded-none border border-white/15 bg-black/90 p-8 hover:border-indigo-400 transition-all duration-300">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="font-bold text-indigo-400 uppercase tracking-widest">RECORD 04</span>
                <Scale className="size-5 text-white" />
              </div>
              <h3 className="mt-6 text-xl font-black text-white uppercase tracking-wider">DECISION</h3>
              <p className="mt-3 text-slate-400 leading-relaxed font-normal">
                What was chosen, what alternatives were considered, and why — kept so the next
                engineer does not have to guess.
              </p>
            </div>

            <div className="group rounded-none border border-white/15 bg-black/90 p-8 hover:border-purple-400 transition-all duration-300">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="font-bold text-purple-400 uppercase tracking-widest">RECORD 05</span>
                <TestTube2 className="size-5 text-white" />
              </div>
              <h3 className="mt-6 text-xl font-black text-white uppercase tracking-wider">EVIDENCE</h3>
              <p className="mt-3 text-slate-400 leading-relaxed font-normal">
                The test report, calculation or inspection record that proves a check was carried
                out. Locked once validated — a correction supersedes it, never overwrites it.
              </p>
            </div>

            <div className="group rounded-none border border-white/15 bg-black/90 p-8 hover:border-cyan-400 transition-all duration-300">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="font-bold text-cyan-400 uppercase tracking-widest">RECORD 06</span>
                <GitPullRequest className="size-5 text-white" />
              </div>
              <h3 className="mt-6 text-xl font-black text-white uppercase tracking-wider">CHANGE REQUEST</h3>
              <p className="mt-3 text-slate-400 leading-relaxed font-normal">
                A change, recorded before it is made. What it would affect is shown by following
                real links outward — before anyone edits anything.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: HOW IT WORKS — the real six-stage lifecycle, interactive */}
      <section id="how-it-works" className="py-24 sm:py-36 border-b border-white/10 bg-black/70 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <InteractiveWorkflowStepper />
        </div>
      </section>

      {/* SECTION 5: TRY IT LIVE */}
      <section className="py-24 sm:py-36 border-b border-white/10 bg-black/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <div className="text-center max-w-3xl mx-auto mb-12 font-sans">
            <span className="font-mono text-xs font-bold tracking-[0.4em] text-cyan-400 uppercase">
              NO ACCOUNT REQUIRED
            </span>
            <h2 className="mt-4 text-3xl sm:text-5xl font-black uppercase text-white tracking-tight">
              TRY THE REAL RULES.
            </h2>
            <p className="mt-4 text-slate-400 leading-relaxed">
              Not a video, not a script. This runs the same functions the signed-in product does.
            </p>
          </div>
          <InteractiveShowcase />
        </div>
      </section>

      {/* SECTION 6: SECURITY */}
      <section className="py-24 sm:py-36 border-b border-white/10 bg-black/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-xs">
            <div className="flex flex-col gap-4 rounded-none border border-white/15 bg-black/90 p-8">
              <Lock className="size-7 text-cyan-400" />
              {/*
                This card claimed "SOC2 TYPE II & ITAR READY" and "end-to-end
                encryption at rest and in transit". No SOC 2 audit exists, the
                product holds no compliance certification (see SECURITY.md),
                and the server reads every record — it is not end-to-end
                encrypted. Encryption at rest is the operator's database
                setting and TLS is terminated by their proxy (DEPLOYMENT.md).
                Replaced with properties the code actually has and tests.
              */}
              <h3 className="font-extrabold text-white text-lg font-sans uppercase">EVERY CHANGE ON RECORD</h3>
              <p className="text-slate-400 leading-relaxed font-normal">
                Each change is written to an append-only audit log in the same transaction as the change itself. Access is checked on the server for every read and write, project by project.
              </p>
            </div>

            <div className="flex flex-col gap-4 rounded-none border border-white/15 bg-black/90 p-8">
              <Server className="size-7 text-indigo-400" />
              <h3 className="font-extrabold text-white text-lg font-sans uppercase">ON-PREMISES &amp; AIR-GAPPED</h3>
              <p className="text-slate-400 leading-relaxed font-normal">
                Deploy inside your private AWS/Azure VPC or air-gapped infrastructure with zero external data telemetry.
              </p>
            </div>

            <div className="flex flex-col gap-4 rounded-none border border-white/15 bg-black/90 p-8">
              <ShieldCheck className="size-7 text-emerald-400" />
              <h3 className="font-extrabold text-white text-lg font-sans uppercase">NO AI READS YOUR DATA</h3>
              <p className="text-slate-400 leading-relaxed font-normal">
                The product uses no language model at all. Every finding it shows is computed from your own records by rules you can inspect, and the same records always give the same answer.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 7: FINAL CTA */}
      <section className="py-28 sm:py-44 bg-black/90 text-center border-t border-white/10 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <span className="font-mono text-xs font-bold text-cyan-400 tracking-[0.4em] uppercase">
            5 MAN MISSION // THE MORNINGSTAR SOLUTION
          </span>

          <h2 className="mt-8 text-4xl sm:text-7xl font-black text-white uppercase tracking-tight leading-[0.95]">
            RUN YOUR PDLC ON RECORDS, NOT MEMORY.
          </h2>

          <p className="mt-8 font-mono text-xs sm:text-sm text-slate-400 leading-relaxed max-w-2xl mx-auto uppercase tracking-wider">
            UNVERIFIED REQUIREMENTS, SILENT CHANGE IMPACT, AND MISSING EVIDENCE — NAMED, NOT GUESSED AT,
            ACROSS YOUR ENTIRE PRODUCT DEVELOPMENT LIFE CYCLE.
          </p>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-5 font-mono text-xs font-extrabold uppercase tracking-widest">
            <Button
              asChild
              size="lg"
              className="h-14 px-10 rounded-none bg-white text-black hover:bg-slate-200 font-mono text-xs font-black uppercase tracking-widest transition-all border border-white"
            >
              <Link href="/sign-up">CREATE ORGANIZATION</Link>
            </Button>

            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-14 px-10 rounded-none border border-white/40 bg-transparent hover:bg-white hover:text-black font-mono text-xs font-extrabold text-white uppercase tracking-widest transition-all"
            >
              <Link href="/docs">READ ARCHITECTURE DOCS</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
