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
import { Badge } from "@/components/ui/badge";
import { HeroSystemAnimation } from "./_components/hero-system-animation";
import { QueryInterfaceVisual } from "./_components/query-interface-visual";
import { UseCaseVisual } from "./_components/use-case-visual";

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden bg-[#fafafa] text-zinc-950 selection:bg-blue-600 selection:text-white">
      {/* Background Subtle Radial Lighting */}
      <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[900px] w-full max-w-7xl -translate-x-1/2 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-100/50 via-zinc-50/20 to-transparent blur-3xl opacity-80" />

      {/* HERO SECTION */}
      <section className="relative pt-16 pb-24 md:pt-24 md:pb-36">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          {/* Eyebrow Pill */}
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-4 py-1.5 font-mono text-[11px] font-bold tracking-[0.25em] text-blue-600 uppercase shadow-xs">
              <Sparkles className="size-3.5 text-blue-600" />
              <span>THE ENGINEERING DECISION PLATFORM</span>
            </div>
          </div>

          {/* Majestic Hero Headline */}
          <div className="mt-8 text-center max-w-5xl mx-auto">
            <h1 className="text-5xl sm:text-7xl lg:text-8xl font-black tracking-tight text-zinc-950 leading-[1.02]">
              Product development, <br className="hidden sm:inline" />
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 bg-clip-text text-transparent">
                connected.
              </span>
            </h1>

            <p className="mt-8 text-lg sm:text-xl text-zinc-600 font-normal leading-relaxed max-w-2xl mx-auto">
              PDLC connects requirements, questions, evidence, decisions and dependencies into one intelligent product development system.
            </p>

            {/* CTAs */}
            <div className="mt-10 flex flex-wrap items-center justify-center gap-4 font-mono text-xs font-semibold">
              <Button
                asChild
                size="lg"
                className="h-13 px-8 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-mono text-xs font-bold shadow-lg shadow-zinc-950/15 transition-all border-none"
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
                className="h-13 px-8 rounded-xl border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-900 font-mono text-xs font-bold shadow-xs transition-all"
              >
                <a href="#core-graph" className="flex items-center gap-2">
                  See how it works
                </a>
              </Button>
            </div>
          </div>

          {/* LIVING HERO ANIMATION VISUAL */}
          <div className="mt-16 sm:mt-24">
            <HeroSystemAnimation />
          </div>
        </div>
      </section>

      {/* MANIFESTO / CATEGORY PHILOSOPHY */}
      <section className="py-24 md:py-32 border-t border-zinc-200/80 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl text-center">
          <span className="font-mono text-xs font-extrabold tracking-[0.3em] text-blue-600 uppercase">
            CATEGORY MANIFESTO
          </span>
          <h2 className="mt-6 text-3xl sm:text-5xl lg:text-6xl font-black text-zinc-950 tracking-tight leading-[1.1]">
            “Engineering decisions shouldn’t be buried in spreadsheets or scattered across chat logs. They must be a living, defensible graph.”
          </h2>
          <p className="mt-8 text-base sm:text-lg text-zinc-500 max-w-3xl mx-auto leading-relaxed font-normal">
            PDLC replaces fragmented documentation with a deterministic graph engine. Every parameter change propagates downstream in real-time, preventing hardware scrap and guaranteeing complete audit defensibility.
          </p>
        </div>
      </section>

      {/* CORE SYSTEM ARCHITECTURE (THE 6 PRIMITIVES) */}
      <section id="core-graph" className="py-24 md:py-32 border-t border-zinc-200/80 bg-[#fafafa]">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="font-mono text-xs font-extrabold tracking-[0.3em] text-blue-600 uppercase">
              THE PDLC GRAPH ONTOLOGY
            </span>
            <h2 className="mt-4 text-4xl sm:text-5xl font-black text-zinc-950 tracking-tight">
              Six primitives. One system of truth.
            </h2>
            <p className="mt-4 text-zinc-600 text-base leading-relaxed">
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
              <h3 className="mt-6 text-xl font-extrabold text-zinc-950">Requirement</h3>
              <p className="mt-2 text-xs text-zinc-600 leading-relaxed font-medium">
                Verifiable operational limits, interface boundaries, and engineering constraints across sub-systems.
              </p>
              <div className="mt-6 font-mono text-xs font-bold text-blue-600 bg-blue-50/60 p-3 rounded-xl border border-blue-100">
                REQ-1042 • Thermal Bound &lt;= 850°C
              </div>
            </div>

            <div className="group rounded-3xl border border-zinc-200/80 bg-white p-8 shadow-xs hover:shadow-xl hover:border-blue-300 transition-all duration-300">
              <div className="flex items-center justify-between">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600">
                  <HelpCircle className="size-6" />
                </div>
                <span className="font-mono text-xs font-bold text-zinc-400">PRIMITIVE 02</span>
              </div>
              <h3 className="mt-6 text-xl font-extrabold text-zinc-950">Question</h3>
              <p className="mt-2 text-xs text-zinc-600 leading-relaxed font-medium">
                Unresolved ambiguity or parameter gaps explicitly tracked until backed by technical verification evidence.
              </p>
              <div className="mt-6 font-mono text-xs font-bold text-amber-600 bg-amber-50/60 p-3 rounded-xl border border-amber-100">
                QST-089 • Manifold Margin Clearance?
              </div>
            </div>

            <div className="group rounded-3xl border border-zinc-200/80 bg-white p-8 shadow-xs hover:shadow-xl hover:border-blue-300 transition-all duration-300">
              <div className="flex items-center justify-between">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600">
                  <TestTube2 className="size-6" />
                </div>
                <span className="font-mono text-xs font-bold text-zinc-400">PRIMITIVE 03</span>
              </div>
              <h3 className="mt-6 text-xl font-extrabold text-zinc-950">Evidence</h3>
              <p className="mt-2 text-xs text-zinc-600 leading-relaxed font-medium">
                Hot fire test logs, CAD stress calculations, FEA runs, or supplier ICDs backing design safety margins.
              </p>
              <div className="mt-6 font-mono text-xs font-bold text-emerald-600 bg-emerald-50/60 p-3 rounded-xl border border-emerald-100">
                EVD-402 • HIL Test Protocol 4B
              </div>
            </div>

            <div className="group rounded-3xl border border-zinc-200/80 bg-white p-8 shadow-xs hover:shadow-xl hover:border-blue-300 transition-all duration-300">
              <div className="flex items-center justify-between">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
                  <GitPullRequest className="size-6" />
                </div>
                <span className="font-mono text-xs font-bold text-zinc-400">PRIMITIVE 04</span>
              </div>
              <h3 className="mt-6 text-xl font-extrabold text-zinc-950">Decision</h3>
              <p className="mt-2 text-xs text-zinc-600 leading-relaxed font-medium">
                Architectural choices and baseline trade studies recorded with full evidence lineage and rationale.
              </p>
              <div className="mt-6 font-mono text-xs font-bold text-indigo-600 bg-indigo-50/60 p-3 rounded-xl border border-indigo-100">
                DEC-019 • Dual-Layer Shield Baseline
              </div>
            </div>

            <div className="group rounded-3xl border border-zinc-200/80 bg-white p-8 shadow-xs hover:shadow-xl hover:border-blue-300 transition-all duration-300">
              <div className="flex items-center justify-between">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-purple-50 text-purple-600">
                  <ShieldCheck className="size-6" />
                </div>
                <span className="font-mono text-xs font-bold text-zinc-400">PRIMITIVE 05</span>
              </div>
              <h3 className="mt-6 text-xl font-extrabold text-zinc-950">Approval Gate</h3>
              <p className="mt-2 text-xs text-zinc-600 leading-relaxed font-medium">
                Dual-custody verification sign-offs requiring multi-disciplinary approval before release to production.
              </p>
              <div className="mt-6 font-mono text-xs font-bold text-purple-600 bg-purple-50/60 p-3 rounded-xl border border-purple-100">
                APP-005 • Systems Safety Gate
              </div>
            </div>

            <div className="group rounded-3xl border border-zinc-200/80 bg-white p-8 shadow-xs hover:shadow-xl hover:border-blue-300 transition-all duration-300">
              <div className="flex items-center justify-between">
                <div className="flex size-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <Zap className="size-6" />
                </div>
                <span className="font-mono text-xs font-bold text-zinc-400">PRIMITIVE 06</span>
              </div>
              <h3 className="mt-6 text-xl font-extrabold text-zinc-950">Change Delta</h3>
              <p className="mt-2 text-xs text-zinc-600 leading-relaxed font-medium">
                Propagated modification recalculating blast radius across all connected hardware and software subcomponents.
              </p>
              <div className="mt-6 font-mono text-xs font-bold text-blue-600 bg-blue-50/60 p-3 rounded-xl border border-blue-100">
                CR-112 • Thermal Bound Revision
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* GRAPH QUERY & REASONING ENGINE */}
      <section id="interactive-engine" className="py-24 md:py-32 border-t border-zinc-200/80 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="font-mono text-xs font-extrabold tracking-[0.3em] text-blue-600 uppercase">
              DETERMINISTIC GRAPH ENGINE
            </span>
            <h2 className="mt-4 text-4xl sm:text-5xl font-black text-zinc-950 tracking-tight">
              Query complex product graph relationships.
            </h2>
            <p className="mt-4 text-zinc-600 text-base leading-relaxed">
              Query unsupported requirements, missing evidence links, and blast radiuses in under 5 milliseconds.
            </p>
          </div>

          <QueryInterfaceVisual />
        </div>
      </section>

      {/* BLAST RADIUS PRE-IMPLEMENTATION DEFENSE */}
      <section id="blast-radius" className="py-24 md:py-32 border-t border-zinc-200/80 bg-[#fafafa]">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <span className="font-mono text-xs font-extrabold tracking-[0.3em] text-blue-600 uppercase">
              PRE-IMPLEMENTATION DEFENSE
            </span>
            <h2 className="mt-4 text-4xl sm:text-5xl font-black text-zinc-950 tracking-tight">
              Prevent hardware scrap before physical release.
            </h2>
            <p className="mt-4 text-zinc-600 text-base leading-relaxed">
              See how a single thermal requirement change is automatically evaluated across downstream test plans and supplier specs.
            </p>
          </div>

          <UseCaseVisual />
        </div>
      </section>

      {/* STORE & TOOLCHAIN INTEGRATIONS */}
      <section className="py-24 md:py-32 border-t border-zinc-200/80 bg-white">
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
              <div className="pt-2">
                <Button
                  asChild
                  className="h-12 px-6 rounded-xl bg-zinc-950 hover:bg-zinc-800 text-white font-mono text-xs font-bold shadow-md"
                >
                  <Link href="/sign-up">Explore 1-Click Connectors</Link>
                </Button>
              </div>
            </div>

            <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-5 font-mono text-xs">
              <div className="flex flex-col items-start gap-2.5 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 shadow-xs">
                <div className="font-bold text-zinc-950 flex items-center gap-2">
                  <ShoppingCart className="size-4 text-amber-600" /> Amazon Store API
                </div>
                <span className="text-[11px] text-zinc-500">ASIN &amp; Part Sync</span>
                <span className="text-[9px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full">LIVE CONNECTED</span>
              </div>

              <div className="flex flex-col items-start gap-2.5 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 shadow-xs">
                <div className="font-bold text-zinc-950 flex items-center gap-2">
                  <Cpu className="size-4 text-red-600" /> DigiKey API
                </div>
                <span className="text-[11px] text-zinc-500">IC Specs &amp; Stock</span>
                <span className="text-[9px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full">LIVE CONNECTED</span>
              </div>

              <div className="flex flex-col items-start gap-2.5 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 shadow-xs">
                <div className="font-bold text-zinc-950 flex items-center gap-2">
                  <Building2 className="size-4 text-blue-600" /> Mouser Electronics
                </div>
                <span className="text-[11px] text-zinc-500">Component Datasheets</span>
                <span className="text-[9px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full">LIVE CONNECTED</span>
              </div>

              <div className="flex flex-col items-start gap-2.5 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 shadow-xs">
                <div className="font-bold text-zinc-950 flex items-center gap-2">
                  <Layers className="size-4 text-emerald-600" /> McMaster-Carr
                </div>
                <span className="text-[11px] text-zinc-500">Hardware CAD Models</span>
                <span className="text-[9px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full">LIVE CONNECTED</span>
              </div>

              <div className="flex flex-col items-start gap-2.5 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 shadow-xs">
                <div className="font-bold text-zinc-950 flex items-center gap-2">
                  <FileText className="size-4 text-indigo-600" /> DOORS / Jira
                </div>
                <span className="text-[11px] text-zinc-500">Legacy Req Sync</span>
                <span className="text-[9px] bg-blue-100 text-blue-800 font-extrabold px-2 py-0.5 rounded-full">READY</span>
              </div>

              <div className="flex flex-col items-start gap-2.5 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-5 shadow-xs">
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

      {/* MAJESTIC CLOSING HERO CALL */}
      <section className="py-24 md:py-32 border-t border-zinc-200/80 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-6xl">
          <div className="relative overflow-hidden rounded-3xl bg-zinc-950 p-10 sm:p-20 text-white shadow-2xl">
            <div className="pointer-events-none absolute -right-20 -top-20 size-96 rounded-full bg-blue-600/20 blur-3xl" />

            <div className="relative z-10 flex flex-col items-center text-center max-w-3xl mx-auto">
              <span className="font-mono text-xs font-bold text-blue-400 tracking-[0.3em] uppercase">
                ENGINEERING DECISION PLATFORM
              </span>

              <h2 className="mt-6 text-4xl sm:text-6xl font-black tracking-tight leading-[1.05]">
                Build defensible engineering decisions today.
              </h2>

              <p className="mt-6 text-zinc-400 text-base sm:text-lg leading-relaxed max-w-xl font-normal">
                Eliminate unverified requirements, silent change propagation, and missing evidence gaps across your entire product lifecycle.
              </p>

              <div className="mt-10 flex flex-wrap items-center justify-center gap-4 font-mono text-xs font-bold">
                <Button
                  asChild
                  size="lg"
                  className="h-13 px-8 rounded-xl bg-blue-600 text-white hover:bg-blue-500 font-mono text-xs font-bold shadow-lg shadow-blue-500/25 transition-all border-none"
                >
                  <Link href="/sign-up">Get Started with PDLC</Link>
                </Button>

                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="h-13 px-8 rounded-xl border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-white font-mono text-xs font-bold transition-all"
                >
                  <Link href="/docs">Read Documentation</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
