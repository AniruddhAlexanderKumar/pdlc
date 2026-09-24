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
  Globe,
  Database,
  Search,
  CheckCircle2,
  AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden bg-[#fafafa] text-zinc-950 selection:bg-blue-600 selection:text-white">
      {/* Background Subtle Ambient Gradient */}
      <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[800px] w-full max-w-7xl -translate-x-1/2 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-100/40 via-zinc-50/20 to-transparent blur-3xl opacity-70" />

      {/* SECTION 1: HERO (PURE TYPOGRAPHY & MAJESTIC METRICS) */}
      <section className="relative pt-20 pb-28 md:pt-32 md:pb-40">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
          {/* Category Pill */}
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-2.5 rounded-full border border-zinc-200 bg-white px-4 py-1.5 font-mono text-[11px] font-bold tracking-[0.25em] text-blue-600 uppercase shadow-xs">
              <Sparkles className="size-3.5 text-blue-600" />
              <span>THE PRODUCT DEVELOPMENT DECISION PLATFORM</span>
            </div>
          </div>

          {/* Majestic Hero Headline */}
          <div className="mt-10 text-center max-w-5xl mx-auto">
            <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight text-zinc-950 leading-[1.02]">
              Product development, <br className="hidden sm:inline" />
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 bg-clip-text text-transparent">
                connected.
              </span>
            </h1>

            <p className="mt-8 text-lg sm:text-2xl text-zinc-600 font-normal leading-relaxed max-w-3xl mx-auto">
              PDLC connects requirements, questions, evidence, decisions and dependencies into one intelligent product development system.
            </p>

            {/* Action CTAs */}
            <div className="mt-12 flex flex-wrap items-center justify-center gap-4 font-mono text-xs font-semibold">
              <Button
                asChild
                size="lg"
                className="h-14 px-9 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-mono text-xs font-bold shadow-xl shadow-zinc-950/15 transition-all border-none"
              >
                <Link href="/sign-up" className="flex items-center gap-2.5">
                  Explore PDLC
                  <ArrowRight className="size-4 text-blue-400" />
                </Link>
              </Button>

              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-14 px-9 rounded-xl border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-900 font-mono text-xs font-bold shadow-xs transition-all"
              >
                <a href="#manifesto" className="flex items-center gap-2">
                  Read Category Manifesto
                </a>
              </Button>
            </div>
          </div>

          {/* PURE CONCEPTUAL METRICS BAR (NO SOFTWARE VISUALS) */}
          <div className="mt-20 pt-12 border-t border-zinc-200/80 grid grid-cols-2 md:grid-cols-4 gap-8 text-center font-mono">
            <div className="flex flex-col gap-1">
              <span className="text-3xl sm:text-4xl font-black text-zinc-950">1 Graph</span>
              <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Unified System Truth</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-3xl sm:text-4xl font-black text-blue-600">6 Primitives</span>
              <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Core Ontology</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-3xl sm:text-4xl font-black text-zinc-950">0 ms</span>
              <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Unverified Assumptions</span>
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-3xl sm:text-4xl font-black text-indigo-600">100%</span>
              <span className="text-xs text-zinc-500 font-bold uppercase tracking-wider">Traceable Decisions</span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: THE MANIFESTO */}
      <section id="manifesto" className="py-24 md:py-36 border-t border-zinc-200/80 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl text-center">
          <span className="font-mono text-xs font-extrabold tracking-[0.3em] text-blue-600 uppercase">
            CATEGORY MANIFESTO
          </span>
          <h2 className="mt-6 text-3xl sm:text-5xl lg:text-6xl font-black text-zinc-950 tracking-tight leading-[1.08]">
            “Engineering decisions shouldn’t be buried in spreadsheets or scattered across chat logs. They must be a living, defensible graph.”
          </h2>
          <p className="mt-8 text-base sm:text-xl text-zinc-500 max-w-3xl mx-auto leading-relaxed font-normal">
            PDLC replaces fragmented documentation with a deterministic graph engine. Every parameter change propagates downstream in real-time, preventing hardware scrap and guaranteeing complete audit defensibility.
          </p>
        </div>
      </section>

      {/* SECTION 3: THE 6 PRIMITIVES (CLEAN ARCHITECTURAL ONTOLOGY) */}
      <section id="primitives" className="py-24 md:py-36 border-t border-zinc-200/80 bg-[#fafafa]">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-18">
            <span className="font-mono text-xs font-extrabold tracking-[0.3em] text-blue-600 uppercase">
              THE PDLC GRAPH ONTOLOGY
            </span>
            <h2 className="mt-4 text-4xl sm:text-6xl font-black text-zinc-950 tracking-tight">
              Six primitives. One system of truth.
            </h2>
            <p className="mt-4 text-zinc-600 text-base sm:text-lg leading-relaxed">
              Every technical asset across hardware, software, and systems engineering is mapped into 6 connected graph primitives.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            <div className="group rounded-3xl border border-zinc-200/80 bg-white p-8 shadow-xs hover:shadow-xl hover:border-blue-300 transition-all duration-300">
              <div className="flex items-center justify-between">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <FileText className="size-6" />
                </div>
                <span className="font-mono text-xs font-bold text-zinc-400">PRIMITIVE 01</span>
              </div>
              <h3 className="mt-6 text-2xl font-extrabold text-zinc-950">Requirement</h3>
              <p className="mt-3 text-sm text-zinc-600 leading-relaxed font-normal">
                Verifiable operational limits, interface boundaries, and engineering constraints across sub-systems.
              </p>
            </div>

            <div className="group rounded-3xl border border-zinc-200/80 bg-white p-8 shadow-xs hover:shadow-xl hover:border-blue-300 transition-all duration-300">
              <div className="flex items-center justify-between">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                  <HelpCircle className="size-6" />
                </div>
                <span className="font-mono text-xs font-bold text-zinc-400">PRIMITIVE 02</span>
              </div>
              <h3 className="mt-6 text-2xl font-extrabold text-zinc-950">Question</h3>
              <p className="mt-3 text-sm text-zinc-600 leading-relaxed font-normal">
                Unresolved ambiguity or parameter gaps explicitly tracked until backed by technical verification evidence.
              </p>
            </div>

            <div className="group rounded-3xl border border-zinc-200/80 bg-white p-8 shadow-xs hover:shadow-xl hover:border-blue-300 transition-all duration-300">
              <div className="flex items-center justify-between">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <TestTube2 className="size-6" />
                </div>
                <span className="font-mono text-xs font-bold text-zinc-400">PRIMITIVE 03</span>
              </div>
              <h3 className="mt-6 text-2xl font-extrabold text-zinc-950">Evidence</h3>
              <p className="mt-3 text-sm text-zinc-600 leading-relaxed font-normal">
                Hot fire test logs, CAD stress calculations, FEA runs, or supplier ICDs backing design safety margins.
              </p>
            </div>

            <div className="group rounded-3xl border border-zinc-200/80 bg-white p-8 shadow-xs hover:shadow-xl hover:border-blue-300 transition-all duration-300">
              <div className="flex items-center justify-between">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <GitPullRequest className="size-6" />
                </div>
                <span className="font-mono text-xs font-bold text-zinc-400">PRIMITIVE 04</span>
              </div>
              <h3 className="mt-6 text-2xl font-extrabold text-zinc-950">Decision</h3>
              <p className="mt-3 text-sm text-zinc-600 leading-relaxed font-normal">
                Architectural choices and baseline trade studies recorded with full evidence lineage and rationale.
              </p>
            </div>

            <div className="group rounded-3xl border border-zinc-200/80 bg-white p-8 shadow-xs hover:shadow-xl hover:border-blue-300 transition-all duration-300">
              <div className="flex items-center justify-between">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-purple-50 text-purple-600">
                  <ShieldCheck className="size-6" />
                </div>
                <span className="font-mono text-xs font-bold text-zinc-400">PRIMITIVE 05</span>
              </div>
              <h3 className="mt-6 text-2xl font-extrabold text-zinc-950">Approval Gate</h3>
              <p className="mt-3 text-sm text-zinc-600 leading-relaxed font-normal">
                Dual-custody verification sign-offs requiring multi-disciplinary approval before release to production.
              </p>
            </div>

            <div className="group rounded-3xl border border-zinc-200/80 bg-white p-8 shadow-xs hover:shadow-xl hover:border-blue-300 transition-all duration-300">
              <div className="flex items-center justify-between">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <Zap className="size-6" />
                </div>
                <span className="font-mono text-xs font-bold text-zinc-400">PRIMITIVE 06</span>
              </div>
              <h3 className="mt-6 text-2xl font-extrabold text-zinc-950">Change Delta</h3>
              <p className="mt-3 text-sm text-zinc-600 leading-relaxed font-normal">
                Propagated modification recalculating blast radius across all connected hardware and software subcomponents.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: THE DETERMINISTIC ENGINE ADVANTAGE */}
      <section className="py-24 md:py-36 border-t border-zinc-200/80 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-5 flex flex-col gap-6">
              <span className="font-mono text-xs font-extrabold tracking-[0.3em] text-blue-600 uppercase">
                DETERMINISTIC GRAPH ENGINE
              </span>
              <h2 className="text-4xl sm:text-5xl font-black text-zinc-950 tracking-tight leading-tight">
                Engineering truth in sub-5 millisecond graph queries.
              </h2>
              <p className="text-zinc-600 text-base leading-relaxed">
                PDLC maintains an in-memory directed graph of every requirement, question, evidence file, and sign-off decision across your entire engineering organization.
              </p>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-6 font-mono text-xs">
              <div className="flex flex-col gap-3 rounded-3xl border border-zinc-200/80 bg-zinc-50/70 p-7 shadow-xs">
                <div className="flex size-10 items-center justify-center rounded-xl bg-blue-100 text-blue-700 font-bold">
                  01
                </div>
                <h3 className="font-extrabold text-zinc-950 text-base font-sans">Sub-5ms Graph Walk</h3>
                <p className="text-zinc-600 leading-relaxed font-sans text-xs">
                  Traverse thousands of complex dependency edges to find unverified requirements and stale test reports instantly.
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-3xl border border-zinc-200/80 bg-zinc-50/70 p-7 shadow-xs">
                <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 font-bold">
                  02
                </div>
                <h3 className="font-extrabold text-zinc-950 text-base font-sans">Pre-Release Blast Radius</h3>
                <p className="text-zinc-600 leading-relaxed font-sans text-xs">
                  Know exactly which test plans, CAD models, and supplier contracts break before releasing hardware changes.
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-3xl border border-zinc-200/80 bg-zinc-50/70 p-7 shadow-xs">
                <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 font-bold">
                  03
                </div>
                <h3 className="font-extrabold text-zinc-950 text-base font-sans">Dual-Custody Approvals</h3>
                <p className="text-zinc-600 leading-relaxed font-sans text-xs">
                  Enforce multi-disciplinary review gates that guarantee Systems Safety and Chief Engineers sign off before milestone gates.
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-3xl border border-zinc-200/80 bg-zinc-50/70 p-7 shadow-xs">
                <div className="flex size-10 items-center justify-center rounded-xl bg-purple-100 text-purple-700 font-bold">
                  04
                </div>
                <h3 className="font-extrabold text-zinc-950 text-base font-sans">Cryptographic Audit Ledger</h3>
                <p className="text-zinc-600 leading-relaxed font-sans text-xs">
                  Immutable historical recording of every parameter update, rationale note, and evidence attachment.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 5: OFFICIAL STORE & TOOLCHAIN CONNECTORS */}
      <section className="py-24 md:py-36 border-t border-zinc-200/80 bg-[#fafafa]">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-5 flex flex-col gap-5">
              <span className="font-mono text-xs font-extrabold tracking-[0.3em] text-blue-600 uppercase">
                INTEGRATIONS CONSTELLATION
              </span>
              <h2 className="text-3xl sm:text-5xl font-black text-zinc-950 tracking-tight leading-tight">
                Connect your supply chain &amp; engineering toolchain.
              </h2>
              <p className="text-zinc-600 leading-relaxed text-sm sm:text-base">
                1-click store and API connectors sync supplier inventory, part specifications, CAD models, and issue trackers straight into your PDLC decision graph.
              </p>
              <div className="pt-2 font-mono text-xs">
                <Button
                  asChild
                  className="h-12 px-7 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-mono text-xs font-bold shadow-md"
                >
                  <Link href="/sign-up">Explore 1-Click Connectors</Link>
                </Button>
              </div>
            </div>

            <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-5 font-mono text-xs">
              <div className="flex flex-col items-start gap-2.5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs">
                <div className="font-bold text-zinc-950 flex items-center gap-2">
                  <ShoppingCart className="size-4 text-amber-600" /> Amazon Store API
                </div>
                <span className="text-[11px] text-zinc-500">ASIN &amp; Part Sync</span>
                <span className="text-[9px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full">LIVE CONNECTED</span>
              </div>

              <div className="flex flex-col items-start gap-2.5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs">
                <div className="font-bold text-zinc-950 flex items-center gap-2">
                  <Cpu className="size-4 text-red-600" /> DigiKey API
                </div>
                <span className="text-[11px] text-zinc-500">IC Specs &amp; Stock</span>
                <span className="text-[9px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full">LIVE CONNECTED</span>
              </div>

              <div className="flex flex-col items-start gap-2.5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs">
                <div className="font-bold text-zinc-950 flex items-center gap-2">
                  <Building2 className="size-4 text-blue-600" /> Mouser Electronics
                </div>
                <span className="text-[11px] text-zinc-500">Component Datasheets</span>
                <span className="text-[9px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full">LIVE CONNECTED</span>
              </div>

              <div className="flex flex-col items-start gap-2.5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs">
                <div className="font-bold text-zinc-950 flex items-center gap-2">
                  <Layers className="size-4 text-emerald-600" /> McMaster-Carr
                </div>
                <span className="text-[11px] text-zinc-500">Hardware CAD Models</span>
                <span className="text-[9px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full">LIVE CONNECTED</span>
              </div>

              <div className="flex flex-col items-start gap-2.5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs">
                <div className="font-bold text-zinc-950 flex items-center gap-2">
                  <FileText className="size-4 text-indigo-600" /> DOORS / Jira
                </div>
                <span className="text-[11px] text-zinc-500">Legacy Req Sync</span>
                <span className="text-[9px] bg-blue-100 text-blue-800 font-extrabold px-2 py-0.5 rounded-full">READY</span>
              </div>

              <div className="flex flex-col items-start gap-2.5 rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs">
                <div className="font-bold text-zinc-950 flex items-center gap-2">
                  <Server className="size-4 text-purple-600" /> Siemens PLM
                </div>
                <span className="text-[11px] text-zinc-500">Assembly Tree Graph</span>
                <span className="text-[9px] bg-blue-100 text-blue-800 font-extrabold px-2 py-0.5 rounded-full">READY</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 6: ENTERPRISE INFRASTRUCTURE & SECURITY */}
      <section className="py-24 md:py-36 border-t border-zinc-200/80 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex flex-col gap-4 rounded-3xl border border-zinc-200/80 bg-zinc-50/70 p-8 shadow-xs">
              <Lock className="size-7 text-blue-600" />
              <h3 className="font-extrabold text-zinc-950 text-xl">SOC2 Type II &amp; ITAR Ready</h3>
              <p className="text-xs text-zinc-600 leading-relaxed font-normal">
                End-to-end encryption at rest and in transit with strict role-based access controls for aerospace and defense engineering standards.
              </p>
            </div>

            <div className="flex flex-col gap-4 rounded-3xl border border-zinc-200/80 bg-zinc-50/70 p-8 shadow-xs">
              <Server className="size-7 text-indigo-600" />
              <h3 className="font-extrabold text-zinc-950 text-xl">On-Premises &amp; Air-Gapped</h3>
              <p className="text-xs text-zinc-600 leading-relaxed font-normal">
                Deploy inside your private AWS/Azure VPC or air-gapped infrastructure with zero external data telemetry.
              </p>
            </div>

            <div className="flex flex-col gap-4 rounded-3xl border border-zinc-200/80 bg-zinc-50/70 p-8 shadow-xs">
              <ShieldCheck className="size-7 text-emerald-600" />
              <h3 className="font-extrabold text-zinc-950 text-xl">Zero LLM Data Retention</h3>
              <p className="text-xs text-zinc-600 leading-relaxed font-normal">
                Your proprietary CAD models, specifications, and trade studies are never used to train public language or reasoning models.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 7: MAJESTIC CLOSING CALL TO ACTION */}
      <section className="py-24 md:py-36 border-t border-zinc-200/80 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
          <div className="relative overflow-hidden rounded-3xl bg-zinc-950 p-12 sm:p-24 text-white shadow-2xl">
            <div className="pointer-events-none absolute -right-20 -top-20 size-96 rounded-full bg-blue-600/20 blur-3xl" />

            <div className="relative z-10 flex flex-col items-center text-center max-w-3xl mx-auto">
              <span className="font-mono text-xs font-bold text-blue-400 tracking-[0.3em] uppercase">
                ENGINEERING DECISION PLATFORM
              </span>

              <h2 className="mt-6 text-4xl sm:text-6xl font-black tracking-tight leading-[1.05]">
                Build defensible engineering decisions today.
              </h2>

              <p className="mt-6 text-zinc-400 text-base sm:text-xl leading-relaxed max-w-2xl font-normal">
                Eliminate unverified requirements, silent change propagation, and missing evidence gaps across your entire product lifecycle.
              </p>

              <div className="mt-12 flex flex-wrap items-center justify-center gap-4 font-mono text-xs font-bold">
                <Button
                  asChild
                  size="lg"
                  className="h-14 px-9 rounded-xl bg-blue-600 text-white hover:bg-blue-500 font-mono text-xs font-bold shadow-lg shadow-blue-500/25 transition-all border-none"
                >
                  <Link href="/sign-up">Get Started with PDLC</Link>
                </Button>

                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="h-14 px-9 rounded-xl border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-white font-mono text-xs font-bold transition-all"
                >
                  <Link href="/docs">Read Architecture Docs</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
