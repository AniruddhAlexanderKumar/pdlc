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
  TestTube2,
  Zap,
  Building2,
  ShoppingCart
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { TelemetryTicker } from "./_components/telemetry-ticker";
import { IntegrationsInteractiveGrid } from "./_components/integrations-interactive-grid";

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden bg-transparent text-white selection:bg-cyan-500 selection:text-black font-sans">
      {/* SECTION 1: HERO */}
      <section className="relative min-h-[85vh] flex flex-col justify-center items-center py-24 sm:py-36 border-b border-white/10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl text-center">
          {/* Main Headline: THE MORNINGSTAR SOLUTION */}
          <h1 className="text-5xl sm:text-7xl lg:text-9xl font-black uppercase text-white tracking-tight leading-[0.92]">
            THE MORNINGSTAR <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-cyan-400 via-blue-400 to-indigo-400 bg-clip-text text-transparent">
              SOLUTION.
            </span>
          </h1>

          {/* Smaller Words Subheadline: 5 Man Mission */}
          <div className="mt-4 font-mono text-sm sm:text-base text-cyan-400 font-extrabold tracking-[0.35em] uppercase">
            5 MAN MISSION
          </div>

          {/* Core Description */}
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
                EXPLORE MORNINGSTAR
                <ArrowRight className="size-4" />
              </Link>
            </Button>

            <Button
              asChild
              variant="outline"
              size="lg"
              className="h-14 px-10 rounded-none border border-white/40 bg-black/60 hover:bg-white hover:text-black font-mono text-xs font-extrabold text-white uppercase tracking-widest transition-all backdrop-blur-xs"
            >
              <a href="#manifesto" className="flex items-center gap-3">
                READ MANIFESTO
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

      {/* SPACEX-STYLE LIVE TELEMETRY TICKER BAR */}
      <TelemetryTicker />

      {/* SECTION 2: CATEGORY MANIFESTO */}
      <section id="manifesto" className="py-28 sm:py-40 border-b border-white/10 bg-black/80 backdrop-blur-sm text-center">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <span className="font-mono text-xs font-bold tracking-[0.35em] text-cyan-400 uppercase">
            THE MORNINGSTAR MANIFESTO
          </span>
          <h2 className="mt-8 text-3xl sm:text-5xl lg:text-6xl font-black text-white uppercase tracking-tight leading-[1.08]">
            “ENGINEERING DECISIONS SHOULDN’T BE BURIED IN SPREADSHEETS OR SCATTERED ACROSS CHAT LOGS. THEY MUST BE A LIVING, DEFENSIBLE GRAPH.”
          </h2>
          <p className="mt-8 font-mono text-sm sm:text-base text-slate-400 max-w-3xl mx-auto leading-relaxed uppercase tracking-wider">
            THE MORNINGSTAR SOLUTION REPLACES FRAGMENTED DOCUMENTATION WITH A DETERMINISTIC GRAPH ENGINE. EVERY PARAMETER CHANGE PROPAGATES DOWNSTREAM IN REAL-TIME, PREVENTING SCRAP AND GUARANTEEING AUDIT DEFENSIBILITY.
          </p>
        </div>
      </section>

      {/* SECTION 3: THE 6 CORE PRIMITIVES */}
      <section className="py-24 sm:py-36 border-b border-white/10 bg-black/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="font-mono text-xs font-bold tracking-[0.35em] text-cyan-400 uppercase">
              THE MORNINGSTAR ONTOLOGY
            </span>
            <h2 className="mt-4 text-4xl sm:text-6xl font-black uppercase text-white tracking-tight">
              SIX PRIMITIVES. ONE SYSTEM.
            </h2>
            <p className="mt-4 font-mono text-xs sm:text-sm text-slate-400 uppercase tracking-wider">
              EVERY TECHNICAL ASSET ACROSS HARDWARE, SOFTWARE, AND SYSTEMS ENGINEERING IS MAPPED INTO 6 CONNECTED GRAPH PRIMITIVES.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 font-mono text-xs">
            <div className="group rounded-none border border-white/15 bg-black/90 p-8 hover:border-cyan-400 transition-all duration-300 shadow-lg hover:shadow-cyan-500/10">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="font-bold text-cyan-400 uppercase tracking-widest">PRIMITIVE 01</span>
                <FileText className="size-5 text-white" />
              </div>
              <h3 className="mt-6 text-xl font-black text-white uppercase tracking-wider">REQUIREMENT</h3>
              <p className="mt-3 text-slate-400 leading-relaxed font-normal">
                Verifiable operational limits, interface boundaries, and engineering constraints across sub-systems.
              </p>
            </div>

            <div className="group rounded-none border border-white/15 bg-black/90 p-8 hover:border-amber-400 transition-all duration-300 shadow-lg hover:shadow-amber-500/10">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="font-bold text-amber-400 uppercase tracking-widest">PRIMITIVE 02</span>
                <HelpCircle className="size-5 text-white" />
              </div>
              <h3 className="mt-6 text-xl font-black text-white uppercase tracking-wider">QUESTION</h3>
              <p className="mt-3 text-slate-400 leading-relaxed font-normal">
                Unresolved ambiguity or parameter gaps explicitly tracked until backed by technical verification evidence.
              </p>
            </div>

            <div className="group rounded-none border border-white/15 bg-black/90 p-8 hover:border-emerald-400 transition-all duration-300 shadow-lg hover:shadow-emerald-500/10">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="font-bold text-emerald-400 uppercase tracking-widest">PRIMITIVE 03</span>
                <TestTube2 className="size-5 text-white" />
              </div>
              <h3 className="mt-6 text-xl font-black text-white uppercase tracking-wider">EVIDENCE</h3>
              <p className="mt-3 text-slate-400 leading-relaxed font-normal">
                Hot fire test logs, CAD stress calculations, FEA runs, or supplier ICDs backing design safety margins.
              </p>
            </div>

            <div className="group rounded-none border border-white/15 bg-black/90 p-8 hover:border-indigo-400 transition-all duration-300 shadow-lg hover:shadow-indigo-500/10">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="font-bold text-indigo-400 uppercase tracking-widest">PRIMITIVE 04</span>
                <GitPullRequest className="size-5 text-white" />
              </div>
              <h3 className="mt-6 text-xl font-black text-white uppercase tracking-wider">DECISION</h3>
              <p className="mt-3 text-slate-400 leading-relaxed font-normal">
                Architectural choices and baseline trade studies recorded with full evidence lineage and rationale.
              </p>
            </div>

            <div className="group rounded-none border border-white/15 bg-black/90 p-8 hover:border-purple-400 transition-all duration-300 shadow-lg hover:shadow-purple-500/10">
              <div className="flex items-center justify-between border-b border-white/10 pb-4">
                <span className="font-bold text-purple-400 uppercase tracking-widest">PRIMITIVE 05</span>
                <ShieldCheck className="size-5 text-white" />
              </div>
              <h3 className="mt-6 text-xl font-black text-white uppercase tracking-wider">APPROVAL GATE</h3>
              <p className="mt-3 text-slate-400 leading-relaxed font-normal">
                Dual-custody verification sign-offs requiring multi-disciplinary approval before release to production.
              </p>
            </div>

            <div className="group rounded-none border border-white/15 bg-black/90 p-8 hover:border-cyan-400 transition-all duration-300 shadow-lg hover:shadow-cyan-500/10">
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

      {/* SECTION 4: THE DETERMINISTIC GRAPH ENGINE ADVANTAGE */}
      <section className="py-24 sm:py-36 border-b border-white/10 bg-black/70 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl font-mono">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-5 flex flex-col gap-6 font-sans">
              <span className="text-xs font-bold tracking-[0.35em] text-cyan-400 uppercase font-mono">
                DETERMINISTIC GRAPH ENGINE
              </span>
              <h2 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tight leading-tight">
                ENGINEERING TRUTH IN SUB-5MS GRAPH QUERIES.
              </h2>
              <p className="text-slate-400 leading-relaxed text-xs uppercase tracking-wider font-mono">
                MORNINGSTAR MAINTAINS AN IN-MEMORY DIRECTED GRAPH OF EVERY REQUIREMENT, QUESTION, EVIDENCE FILE, AND SIGN-OFF DECISION ACROSS YOUR ENTIRE ENGINEERING ORGANIZATION.
              </p>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div className="flex flex-col gap-3 rounded-none border border-white/15 bg-black/90 p-6">
                <span className="text-cyan-400 font-bold text-base">01</span>
                <h3 className="font-black text-white text-sm uppercase font-sans">SUB-5MS GRAPH WALK</h3>
                <p className="text-slate-400 leading-relaxed font-normal">
                  Traverse thousands of complex dependency edges to find unverified requirements and stale test reports instantly.
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-none border border-white/15 bg-black/90 p-6">
                <span className="text-indigo-400 font-bold text-base">02</span>
                <h3 className="font-black text-white text-sm uppercase font-sans">PRE-RELEASE BLAST RADIUS</h3>
                <p className="text-slate-400 leading-relaxed font-normal">
                  Know exactly which test plans, CAD models, and supplier contracts break before releasing hardware changes.
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-none border border-white/15 bg-black/90 p-6">
                <span className="text-emerald-400 font-bold text-base">03</span>
                <h3 className="font-black text-white text-sm uppercase font-sans">DUAL-CUSTODY APPROVALS</h3>
                <p className="text-slate-400 leading-relaxed font-normal">
                  Enforce multi-disciplinary review gates that guarantee Systems Safety and Chief Engineers sign off before milestone gates.
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-none border border-white/15 bg-black/90 p-6">
                <span className="text-purple-400 font-bold text-base">04</span>
                <h3 className="font-black text-white text-sm uppercase font-sans">CRYPTOGRAPHIC AUDIT LEDGER</h3>
                <p className="text-slate-400 leading-relaxed font-normal">
                  Immutable historical recording of every parameter update, rationale note, and evidence attachment.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5: INTERACTIVE STORE & TOOLCHAIN CONNECTORS */}
      <section className="py-24 sm:py-36 border-b border-white/10 bg-black/70 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl font-mono">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-4 font-sans max-w-3xl">
              <span className="text-xs font-bold tracking-[0.35em] text-cyan-400 uppercase font-mono">
                INTEGRATIONS CONSTELLATION
              </span>
              <h2 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tight leading-tight">
                CONNECT YOUR SUPPLY CHAIN &amp; TOOLCHAIN.
              </h2>
              <p className="text-slate-400 leading-relaxed text-xs uppercase tracking-wider font-mono">
                1-CLICK STORE AND API CONNECTORS SYNC SUPPLIER INVENTORY, PART SPECIFICATIONS, CAD MODELS, AND ISSUE TRACKERS DIRECTLY INTO MORNINGSTAR.
              </p>
            </div>

            {/* Interactive Connectors Grid */}
            <IntegrationsInteractiveGrid />
          </div>
        </div>
      </section>

      {/* SECTION 6: ENTERPRISE SECURITY & INFRASTRUCTURE */}
      <section className="py-24 sm:py-36 border-b border-white/10 bg-black/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-xs">
            <div className="flex flex-col gap-4 rounded-none border border-white/15 bg-black/90 p-8">
              <Lock className="size-7 text-cyan-400" />
              <h3 className="font-extrabold text-white text-lg font-sans uppercase">SOC2 TYPE II &amp; ITAR READY</h3>
              <p className="text-slate-400 leading-relaxed font-normal">
                End-to-end encryption at rest and in transit with strict role-based access controls for aerospace engineering standards.
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
              <h3 className="font-extrabold text-white text-lg font-sans uppercase">ZERO LLM DATA RETENTION</h3>
              <p className="text-slate-400 leading-relaxed font-normal">
                Your proprietary CAD models, specifications, and trade studies are never used to train public language or reasoning models.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 7: FINAL CTA SLIDE */}
      <section className="py-28 sm:py-44 bg-black/90 text-center border-t border-white/10 backdrop-blur-sm">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <span className="font-mono text-xs font-bold text-cyan-400 tracking-[0.35em] uppercase">
            5 MAN MISSION // THE MORNINGSTAR SOLUTION
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
