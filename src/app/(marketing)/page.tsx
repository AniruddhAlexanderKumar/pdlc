import Link from "next/link";
import {
  ArrowRight,
  Cpu,
  FileText,
  GitPullRequest,
  HelpCircle,
  Layers,
  Lock,
  Server,
  ShieldCheck,
  Sparkles,
  Terminal,
  TestTube2,
  Waypoints,
  Zap,
  Building2,
  ShoppingCart,
  ChevronRight,
  Shield,
  Activity,
  Check,
  Compass,
  Globe
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { HeroInteractiveConcept } from "./_components/hero-interactive-concept";
import { InteractiveWorkflowStepper } from "./_components/interactive-workflow-stepper";

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden bg-black text-white selection:bg-cyan-500 selection:text-black font-sans">
      {/* SpaceX Deep Space Backdrop Mesh */}
      <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[1000px] w-full max-w-7xl -translate-x-1/2 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-cyan-900/20 via-blue-950/10 to-transparent blur-3xl opacity-60" />
      <div className="pointer-events-none absolute right-0 top-1/2 -z-10 size-[800px] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-900/15 via-black to-transparent blur-3xl opacity-50" />

      {/* SECTION 1: HERO (SPACEX FULL VIEWPORT SLIDE) */}
      <section className="relative min-h-[90vh] flex flex-col justify-center items-center py-24 sm:py-32 border-b border-white/10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl text-center">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-3 rounded-full border border-cyan-500/30 bg-cyan-950/30 px-5 py-1.5 font-mono text-xs font-bold tracking-[0.35em] text-cyan-400 uppercase backdrop-blur-md">
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-cyan-400" />
            </span>
            MISSION OBJECTIVE // PRODUCT DEVELOPMENT PLATFORM
          </div>

          {/* Main Headline */}
          <h1 className="mt-8 text-5xl sm:text-7xl lg:text-9xl font-black uppercase text-white tracking-tight leading-[0.92]">
            PRODUCT DEVELOPMENT, <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
              CONNECTED.
            </span>
          </h1>

          {/* Subheadline */}
          <p className="mt-8 text-base sm:text-xl text-slate-300 font-normal leading-relaxed max-w-3xl mx-auto uppercase tracking-wide font-mono">
            PDLC CONNECTS REQUIREMENTS, QUESTIONS, EVIDENCE, DECISIONS AND DEPENDENCIES INTO ONE INTELLIGENT PRODUCT DEVELOPMENT SYSTEM.
          </p>

          {/* CTAs */}
          <div className="mt-12 flex flex-wrap items-center justify-center gap-5 font-mono text-xs font-extrabold uppercase tracking-widest">
            <Button
              asChild
              size="lg"
              className="h-14 px-10 rounded-none bg-white text-black hover:bg-slate-200 font-mono text-xs font-black uppercase tracking-widest transition-all border border-white"
            >
              <Link href="/sign-up" className="flex items-center gap-3">
                EXPLORE PDLC
                <ArrowRight className="size-4" />
              </Link>
            </Button>

            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-14 px-10 rounded-none border border-white/40 bg-transparent hover:bg-white hover:text-black font-mono text-xs font-extrabold text-white uppercase tracking-widest transition-all"
            >
              <a href="#interactive-concept" className="flex items-center gap-3">
                SEE HOW IT WORKS
              </a>
            </Button>
          </div>

          {/* TELEMETRY BAR */}
          <div className="mt-20 pt-10 border-t border-white/10 grid grid-cols-2 md:grid-cols-4 gap-8 text-center font-mono uppercase tracking-wider">
            <div className="flex flex-col gap-1">
              <span className="text-3xl sm:text-4xl font-black text-white">1 GRAPH</span>
              <span className="text-[10px] text-slate-400 font-bold">SINGLE SYSTEM TRUTH</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-3xl sm:text-4xl font-black text-cyan-400">6 PRIMITIVES</span>
              <span className="text-[10px] text-slate-400 font-bold">CORE LIFECYCLE ONTOLOGY</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-3xl sm:text-4xl font-black text-white">0 MS</span>
              <span className="text-[10px] text-slate-400 font-bold">UNVERIFIED ASSUMPTIONS</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-3xl sm:text-4xl font-black text-indigo-400">100%</span>
              <span className="text-[10px] text-slate-400 font-bold">TRACEABLE LINEAGE</span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: INTERACTIVE SYSTEM GRAPH CANVAS */}
      <section id="interactive-concept" className="py-24 sm:py-36 border-b border-white/10 bg-zinc-950/60">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <span className="font-mono text-xs font-bold tracking-[0.35em] text-cyan-400 uppercase">
              REAL-TIME REASONING ENGINE
            </span>
            <h2 className="mt-4 text-4xl sm:text-6xl font-black uppercase text-white tracking-tight">
              LIVE SYSTEM ARCHITECTURE
            </h2>
            <p className="mt-4 font-mono text-sm text-slate-400 uppercase tracking-wide">
              INTERACT WITH THE LIVING PRODUCT GRAPH BELOW TO SIMULATE PARAMETER CHANGES AND OBSERVE SIGNAL PROPAGATION.
            </p>
          </div>

          <HeroInteractiveConcept />
        </div>
      </section>

      {/* SECTION 3: CATEGORY MANIFESTO */}
      <section className="py-28 sm:py-40 border-b border-white/10 bg-black text-center">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <span className="font-mono text-xs font-bold tracking-[0.35em] text-cyan-400 uppercase">
            CATEGORY MANIFESTO
          </span>
          <h2 className="mt-8 text-3xl sm:text-5xl lg:text-6xl font-black text-white uppercase tracking-tight leading-[1.08]">
            “ENGINEERING DECISIONS SHOULDN’T BE BURIED IN SPREADSHEETS OR SCATTERED ACROSS CHAT LOGS. THEY MUST BE A LIVING, DEFENSIBLE GRAPH.”
          </h2>
          <p className="mt-8 font-mono text-sm sm:text-base text-slate-400 max-w-3xl mx-auto leading-relaxed uppercase tracking-wider">
            PDLC REPLACES FRAGMENTED DOCUMENTATION WITH A DETERMINISTIC GRAPH ENGINE. EVERY PARAMETER CHANGE PROPAGATES DOWNSTREAM IN REAL-TIME, PREVENTING SCRAP AND GUARANTEEING AUDIT DEFENSIBILITY.
          </p>
        </div>
      </section>

      {/* SECTION 4: 5-STEP INTERACTIVE WORKFLOW STEPPER */}
      <section className="py-24 sm:py-36 border-b border-white/10 bg-zinc-950/60">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <InteractiveWorkflowStepper />
        </div>
      </section>

      {/* SECTION 5: THE 6 CORE PRIMITIVES */}
      <section className="py-24 sm:py-36 border-b border-white/10 bg-black">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="font-mono text-xs font-bold tracking-[0.35em] text-cyan-400 uppercase">
              THE PDLC GRAPH ONTOLOGY
            </span>
            <h2 className="mt-4 text-4xl sm:text-6xl font-black uppercase text-white tracking-tight">
              SIX PRIMITIVES. ONE SYSTEM.
            </h2>
            <p className="mt-4 font-mono text-xs sm:text-sm text-slate-400 uppercase tracking-wider">
              EVERY TECHNICAL ASSET ACROSS HARDWARE, SOFTWARE, AND SYSTEMS ENGINEERING IS MAPPED INTO 6 CONNECTED GRAPH PRIMITIVES.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 font-mono text-xs">
            <div className="group rounded-none border border-white/15 bg-zinc-950/80 p-8 hover:border-cyan-400 transition-all duration-300">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="font-bold text-cyan-400 uppercase tracking-widest">PRIMITIVE 01</span>
                <FileText className="size-5 text-white" />
              </div>
              <h3 className="mt-6 text-xl font-black text-white uppercase tracking-wider">REQUIREMENT</h3>
              <p className="mt-3 text-slate-400 leading-relaxed font-normal">
                Verifiable operational limits, interface boundaries, and engineering constraints across sub-systems.
              </p>
            </div>

            <div className="group rounded-none border border-white/15 bg-zinc-950/80 p-8 hover:border-amber-400 transition-all duration-300">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="font-bold text-amber-400 uppercase tracking-widest">PRIMITIVE 02</span>
                <HelpCircle className="size-5 text-white" />
              </div>
              <h3 className="mt-6 text-xl font-black text-white uppercase tracking-wider">QUESTION</h3>
              <p className="mt-3 text-slate-400 leading-relaxed font-normal">
                Unresolved ambiguity or parameter gaps explicitly tracked until backed by technical verification evidence.
              </p>
            </div>

            <div className="group rounded-none border border-white/15 bg-zinc-950/80 p-8 hover:border-emerald-400 transition-all duration-300">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="font-bold text-emerald-400 uppercase tracking-widest">PRIMITIVE 03</span>
                <TestTube2 className="size-5 text-white" />
              </div>
              <h3 className="mt-6 text-xl font-black text-white uppercase tracking-wider">EVIDENCE</h3>
              <p className="mt-3 text-slate-400 leading-relaxed font-normal">
                Hot fire test logs, CAD stress calculations, FEA runs, or supplier ICDs backing design safety margins.
              </p>
            </div>

            <div className="group rounded-none border border-white/15 bg-zinc-950/80 p-8 hover:border-indigo-400 transition-all duration-300">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="font-bold text-indigo-400 uppercase tracking-widest">PRIMITIVE 04</span>
                <GitPullRequest className="size-5 text-white" />
              </div>
              <h3 className="mt-6 text-xl font-black text-white uppercase tracking-wider">DECISION</h3>
              <p className="mt-3 text-slate-400 leading-relaxed font-normal">
                Architectural choices and baseline trade studies recorded with full evidence lineage and rationale.
              </p>
            </div>

            <div className="group rounded-none border border-white/15 bg-zinc-950/80 p-8 hover:border-purple-400 transition-all duration-300">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="font-bold text-purple-400 uppercase tracking-widest">PRIMITIVE 05</span>
                <ShieldCheck className="size-5 text-white" />
              </div>
              <h3 className="mt-6 text-xl font-black text-white uppercase tracking-wider">APPROVAL GATE</h3>
              <p className="mt-3 text-slate-400 leading-relaxed font-normal">
                Dual-custody verification sign-offs requiring multi-disciplinary approval before release to production.
              </p>
            </div>

            <div className="group rounded-none border border-white/15 bg-zinc-950/80 p-8 hover:border-cyan-400 transition-all duration-300">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="font-bold text-cyan-400 uppercase tracking-widest">PRIMITIVE 06</span>
                <Zap className="size-5 text-white" />
              </div>
              <h3 className="mt-6 text-xl font-black text-white uppercase tracking-wider">CHANGE DELTA</h3>
              <p className="mt-3 text-slate-400 leading-relaxed font-normal">
                Propagated modification recalculating blast radius across all connected hardware and software subcomponents.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 6: STORE & TOOLCHAIN CONNECTORS */}
      <section className="py-24 sm:py-36 border-b border-white/10 bg-zinc-950/60">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center font-mono">
            <div className="lg:col-span-5 flex flex-col gap-6">
              <span className="text-xs font-bold tracking-[0.35em] text-cyan-400 uppercase">
                INTEGRATIONS CONSTELLATION
              </span>
              <h2 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tight leading-tight font-sans">
                CONNECT YOUR SUPPLY CHAIN &amp; TOOLCHAIN.
              </h2>
              <p className="text-slate-400 leading-relaxed text-xs uppercase tracking-wider font-mono">
                1-CLICK STORE AND API CONNECTORS SYNC SUPPLIER INVENTORY, PART SPECIFICATIONS, CAD MODELS, AND ISSUE TRACKERS DIRECTLY INTO YOUR PDLC DECISION GRAPH.
              </p>
              <div className="pt-2">
                <Button
                  asChild
                  className="h-12 px-8 rounded-none bg-white text-black hover:bg-slate-200 font-mono text-xs font-extrabold uppercase tracking-widest transition-all border border-white"
                >
                  <Link href="/sign-up">EXPLORE STORE CONNECTORS</Link>
                </Button>
              </div>
            </div>

            <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-4 text-xs">
              <div className="flex flex-col items-start gap-2.5 rounded-none border border-white/15 bg-black p-5">
                <div className="font-bold text-white flex items-center gap-2">
                  <ShoppingCart className="size-4 text-amber-400" /> AMAZON STORE API
                </div>
                <span className="text-[10px] text-slate-400">ASIN &amp; PART SYNC</span>
                <span className="text-[9px] bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold px-2 py-0.5">LIVE CONNECTED</span>
              </div>

              <div className="flex flex-col items-start gap-2.5 rounded-none border border-white/15 bg-black p-5">
                <div className="font-bold text-white flex items-center gap-2">
                  <Cpu className="size-4 text-red-400" /> DIGIKEY API
                </div>
                <span className="text-[10px] text-slate-400">IC SPECS &amp; STOCK</span>
                <span className="text-[9px] bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold px-2 py-0.5">LIVE CONNECTED</span>
              </div>

              <div className="flex flex-col items-start gap-2.5 rounded-none border border-white/15 bg-black p-5">
                <div className="font-bold text-white flex items-center gap-2">
                  <Building2 className="size-4 text-cyan-400" /> MOUSER ELECTRONICS
                </div>
                <span className="text-[10px] text-slate-400">DATASHEET SYNC</span>
                <span className="text-[9px] bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold px-2 py-0.5">LIVE CONNECTED</span>
              </div>

              <div className="flex flex-col items-start gap-2.5 rounded-none border border-white/15 bg-black p-5">
                <div className="font-bold text-white flex items-center gap-2">
                  <Layers className="size-4 text-emerald-400" /> MCMASTER-CARR
                </div>
                <span className="text-[10px] text-slate-400">CAD MODEL GRAPH</span>
                <span className="text-[9px] bg-emerald-950 text-emerald-400 border border-emerald-800 font-bold px-2 py-0.5">LIVE CONNECTED</span>
              </div>

              <div className="flex flex-col items-start gap-2.5 rounded-none border border-white/15 bg-black p-5">
                <div className="font-bold text-white flex items-center gap-2">
                  <FileText className="size-4 text-indigo-400" /> DOORS / JIRA
                </div>
                <span className="text-[10px] text-slate-400">LEGACY REQ SYNC</span>
                <span className="text-[9px] bg-blue-950 text-blue-400 border border-blue-800 font-bold px-2 py-0.5">READY</span>
              </div>

              <div className="flex flex-col items-start gap-2.5 rounded-none border border-white/15 bg-black p-5">
                <div className="font-bold text-white flex items-center gap-2">
                  <Server className="size-4 text-purple-400" /> SIEMENS PLM
                </div>
                <span className="text-[10px] text-slate-400">ASSEMBLY TREE</span>
                <span className="text-[9px] bg-blue-950 text-blue-400 border border-blue-800 font-bold px-2 py-0.5">READY</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 7: ENTERPRISE SECURITY & INFRASTRUCTURE */}
      <section className="py-24 sm:py-36 border-b border-white/10 bg-black">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-xs">
            <div className="flex flex-col gap-4 rounded-none border border-white/15 bg-zinc-950/80 p-8">
              <Lock className="size-7 text-cyan-400" />
              <h3 className="font-extrabold text-white text-lg font-sans uppercase">SOC2 TYPE II &amp; ITAR READY</h3>
              <p className="text-slate-400 leading-relaxed font-normal">
                End-to-end encryption at rest and in transit with strict role-based access controls for aerospace engineering standards.
              </p>
            </div>

            <div className="flex flex-col gap-4 rounded-none border border-white/15 bg-zinc-950/80 p-8">
              <Server className="size-7 text-indigo-400" />
              <h3 className="font-extrabold text-white text-lg font-sans uppercase">ON-PREMISES &amp; AIR-GAPPED</h3>
              <p className="text-slate-400 leading-relaxed font-normal">
                Deploy inside your private AWS/Azure VPC or air-gapped infrastructure with zero external data telemetry.
              </p>
            </div>

            <div className="flex flex-col gap-4 rounded-none border border-white/15 bg-zinc-950/80 p-8">
              <ShieldCheck className="size-7 text-emerald-400" />
              <h3 className="font-extrabold text-white text-lg font-sans uppercase">ZERO LLM DATA RETENTION</h3>
              <p className="text-slate-400 leading-relaxed font-normal">
                Your proprietary CAD models, specifications, and trade studies are never used to train public language or reasoning models.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 8: SPACEX-STYLE FINAL CTA SLIDE */}
      <section className="py-28 sm:py-44 bg-black text-center border-t border-white/10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <span className="font-mono text-xs font-bold text-cyan-400 tracking-[0.35em] uppercase">
            PDLC PLATFORM // DECISION INTELLIGENCE
          </span>

          <h2 className="mt-8 text-4xl sm:text-7xl font-black text-white uppercase tracking-tight leading-[0.95]">
            BUILD DEFENSIBLE ENGINEERING DECISIONS.
          </h2>

          <p className="mt-8 font-mono text-sm sm:text-base text-slate-400 leading-relaxed max-w-2xl mx-auto uppercase tracking-wider">
            ELIMINATE UNVERIFIED REQUIREMENTS, SILENT CHANGE PROPAGATION, AND MISSING EVIDENCE GAPS ACROSS YOUR ENTIRE LIFECYCLE.
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
