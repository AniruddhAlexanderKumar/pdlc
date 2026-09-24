import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Cpu,
  Database,
  FileText,
  GitPullRequest,
  HelpCircle,
  Layers,
  Lock,
  RefreshCw,
  Search,
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
  Check
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { HeroSystemAnimation } from "./_components/hero-system-animation";
import { QueryInterfaceVisual } from "./_components/query-interface-visual";
import { UseCaseVisual } from "./_components/use-case-visual";

export default function LandingPage() {
  return (
    <div className="relative overflow-hidden bg-slate-50/50 text-slate-900 selection:bg-blue-600 selection:text-white">
      {/* Background Decorative Mesh Gradients */}
      <div className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[800px] w-full max-w-7xl -translate-x-1/2 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-100/60 via-slate-50/40 to-transparent blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-1/3 -z-10 size-[600px] bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-indigo-100/40 via-blue-50/20 to-transparent blur-3xl" />

      {/* SECTION 1: HERO */}
      <section className="relative pt-12 pb-20 md:pt-20 md:pb-28">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          {/* Top Pill */}
          <div className="flex justify-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-white px-4 py-1.5 font-mono text-xs font-semibold text-blue-700 shadow-sm shadow-blue-900/5 backdrop-blur-md">
              <Sparkles className="size-3.5 text-amber-500" />
              <span>THE ENGINEERING DECISION &amp; REQUIREMENTS INTELLIGENCE PLATFORM</span>
              <ChevronRight className="size-3.5 text-blue-400" />
            </div>
          </div>

          {/* Main Headline & Subheadline */}
          <div className="mt-8 text-center max-w-4xl mx-auto">
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extrabold tracking-tight text-slate-900 leading-[1.1]">
              Product development, <br className="hidden sm:inline" />
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 bg-clip-text text-transparent">
                connected.
              </span>
            </h1>

            <p className="mt-6 text-lg sm:text-xl text-slate-600 font-normal leading-relaxed max-w-2xl mx-auto">
              PDLC connects requirements, questions, evidence, decisions and dependencies into one intelligent product development system.
            </p>

            {/* CTA Buttons */}
            <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
              <Button
                asChild
                size="lg"
                className="h-12 px-7 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-mono text-sm font-semibold shadow-lg shadow-blue-500/25 transition-all border-none"
              >
                <Link href="/sign-up" className="flex items-center gap-2">
                  Explore PDLC
                  <ArrowRight className="size-4" />
                </Link>
              </Button>

              <Button
                asChild
                variant="outline"
                size="lg"
                className="h-12 px-7 rounded-xl border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-mono text-sm font-semibold shadow-sm transition-all"
              >
                <a href="#core-graph" className="flex items-center gap-2">
                  See how it works
                </a>
              </Button>
            </div>
          </div>

          {/* LIVING HERO ANIMATION VISUAL */}
          <div className="mt-14 sm:mt-18">
            <HeroSystemAnimation />
          </div>
        </div>
      </section>

      {/* SECTION 2: CATEGORY DEFINITION & THE CORE PROBLEM */}
      <section className="py-20 border-t border-slate-200/80 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
            <div className="lg:col-span-5 flex flex-col gap-4">
              <div className="inline-flex items-center gap-2 font-mono text-xs font-bold text-blue-600 uppercase tracking-wider">
                <Activity className="size-4 text-blue-600" />
                <span>THE ENGINEERING DISCONNECT</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight leading-tight">
                Complex engineering breaks in the gaps between tools.
              </h2>
              <p className="text-slate-600 leading-relaxed text-sm sm:text-base">
                Requirements live in legacy databases, questions in unrecorded chat threads, test evidence in lab reports, and decisions in email chains. When a single parameter changes, nobody knows what breaks until hardware fails during testing.
              </p>
            </div>

            <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-6 shadow-sm hover:shadow-md transition-all">
                <div className="flex size-10 items-center justify-center rounded-xl bg-rose-100 text-rose-600 font-mono font-bold text-sm">
                  01
                </div>
                <h3 className="font-extrabold text-slate-900 text-base">Unanswered Questions</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Engineers spot ambiguity in requirements, but questions stall in review queues without direct trace links to active design decisions.
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-6 shadow-sm hover:shadow-md transition-all">
                <div className="flex size-10 items-center justify-center rounded-xl bg-amber-100 text-amber-600 font-mono font-bold text-sm">
                  02
                </div>
                <h3 className="font-extrabold text-slate-900 text-base">Missing Evidence Links</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Design reviews pass without verifying if test data or CAD calculations support safety margins, leading to costly late-stage redesigns.
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-6 shadow-sm hover:shadow-md transition-all">
                <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 font-mono font-bold text-sm">
                  03
                </div>
                <h3 className="font-extrabold text-slate-900 text-base">Invisible Blast Radius</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Modifying a single thermal or mechanical constraint silently invalidates supplier specifications across downstream teams.
                </p>
              </div>

              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-6 shadow-sm hover:shadow-md transition-all">
                <div className="flex size-10 items-center justify-center rounded-xl bg-blue-100 text-blue-600 font-mono font-bold text-sm">
                  04
                </div>
                <h3 className="font-extrabold text-slate-900 text-base">Zero Defensibility</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  When audits occur, teams spend weeks manually assembling compliance matrices from fragmented spreadsheets and legacy documents.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: CORE SYSTEM ARCHITECTURE (THE PRODUCT DEVELOPMENT GRAPH) */}
      <section id="core-graph" className="py-20 border-t border-slate-200/80 bg-slate-50/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-14">
            <div className="inline-flex items-center gap-2 font-mono text-xs font-bold text-blue-600 uppercase tracking-wider mb-3">
              <Waypoints className="size-4 text-blue-600" />
              <span>THE PDLC ONTOLOGY</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
              One connected graph for the entire lifecycle.
            </h2>
            <p className="mt-4 text-slate-600 text-sm sm:text-base leading-relaxed">
              PDLC structures product development around 6 fundamental engineering primitives connected by deterministic dependency edges.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-xl hover:border-blue-300 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <FileText className="size-5" />
                </div>
                <span className="font-mono text-xs font-bold text-slate-400">PRIMITIVE 01</span>
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">Requirement</h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Verifiable technical boundaries, operational limits, and interface constraints across hardware and software systems.
              </p>
              <div className="mt-4 font-mono text-[11px] text-blue-600 font-semibold bg-blue-50/60 p-2 rounded-lg border border-blue-100">
                REQ-1042 • Thermal Limit &lt;= 850°C
              </div>
            </div>

            <div className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-xl hover:border-blue-300 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex size-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                  <HelpCircle className="size-5" />
                </div>
                <span className="font-mono text-xs font-bold text-slate-400">PRIMITIVE 02</span>
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">Question</h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Engineering ambiguity or missing parameters explicitly raised and tracked until resolved with technical evidence.
              </p>
              <div className="mt-4 font-mono text-[11px] text-amber-600 font-semibold bg-amber-50/60 p-2 rounded-lg border border-amber-100">
                QST-089 • Manifold Margin Clearance?
              </div>
            </div>

            <div className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-xl hover:border-blue-300 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                  <TestTube2 className="size-5" />
                </div>
                <span className="font-mono text-xs font-bold text-slate-400">PRIMITIVE 03</span>
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">Evidence</h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Hot fire test logs, CAD stress analyses, FEA simulations, or supplier ICD specifications supporting design safety.
              </p>
              <div className="mt-4 font-mono text-[11px] text-emerald-600 font-semibold bg-emerald-50/60 p-2 rounded-lg border border-emerald-100">
                EVD-402 • HIL Test Protocol 4B
              </div>
            </div>

            <div className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-xl hover:border-blue-300 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex size-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <GitPullRequest className="size-5" />
                </div>
                <span className="font-mono text-xs font-bold text-slate-400">PRIMITIVE 04</span>
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">Decision</h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Architectural choices and trade study baselines explicitly recorded with complete rationale and evidence lineage.
              </p>
              <div className="mt-4 font-mono text-[11px] text-indigo-600 font-semibold bg-indigo-50/60 p-2 rounded-lg border border-indigo-100">
                DEC-019 • Dual-Layer Shield Selection
              </div>
            </div>

            <div className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-xl hover:border-blue-300 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex size-10 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                  <ShieldCheck className="size-5" />
                </div>
                <span className="font-mono text-xs font-bold text-slate-400">PRIMITIVE 05</span>
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">Approval</h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Dual-custody verification sign-offs requiring multi-disciplinary approval before release to manufacturing.
              </p>
              <div className="mt-4 font-mono text-[11px] text-purple-600 font-semibold bg-purple-50/60 p-2 rounded-lg border border-purple-100">
                APP-005 • Systems Safety Gate
              </div>
            </div>

            <div className="group rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-xl hover:border-blue-300 transition-all">
              <div className="flex items-center justify-between">
                <div className="flex size-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <Zap className="size-5" />
                </div>
                <span className="font-mono text-xs font-bold text-slate-400">PRIMITIVE 06</span>
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">Change</h3>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Propagated modification delta dynamically calculating blast radius across all connected hardware/software subcomponents.
              </p>
              <div className="mt-4 font-mono text-[11px] text-blue-600 font-semibold bg-blue-50/60 p-2 rounded-lg border border-blue-100">
                CR-112 • Thermal Bound Revision
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 4: INTERACTIVE GRAPH QUERY ENGINE */}
      <section id="interactive-engine" className="py-20 border-t border-slate-200/80 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <div className="inline-flex items-center gap-2 font-mono text-xs font-bold text-blue-600 uppercase tracking-wider mb-3">
              <Terminal className="size-4 text-blue-600" />
              <span>DETERMINISTIC GRAPH REASONING</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
              Query your engineering truth in milliseconds.
            </h2>
            <p className="mt-4 text-slate-600 text-sm sm:text-base leading-relaxed">
              Ask natural language or graph queries to surface unsupported requirements, missing evidence, and downstream change blast radiuses instantly.
            </p>
          </div>

          <QueryInterfaceVisual />
        </div>
      </section>

      {/* SECTION 5: REAL-WORLD SUBSYSTEM SCENARIO */}
      <section id="blast-radius" className="py-20 border-t border-slate-200/80 bg-slate-50/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="text-center max-w-3xl mx-auto mb-12">
            <div className="inline-flex items-center gap-2 font-mono text-xs font-bold text-blue-600 uppercase tracking-wider mb-3">
              <Zap className="size-4 text-blue-600" />
              <span>PRE-IMPLEMENTATION DEFENSE</span>
            </div>
            <h2 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight">
              Catch engineering errors before hardware scrap.
            </h2>
            <p className="mt-4 text-slate-600 text-sm sm:text-base leading-relaxed">
              See how a single thermal requirement change is analyzed by PDLC to prevent costly physical test failures.
            </p>
          </div>

          <UseCaseVisual />
        </div>
      </section>

      {/* SECTION 6: ENTERPRISE STORE & CAD INTEGRATIONS */}
      <section className="py-20 border-t border-slate-200/80 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-5 flex flex-col gap-4">
              <div className="inline-flex items-center gap-2 font-mono text-xs font-bold text-blue-600 uppercase tracking-wider">
                <ShoppingCart className="size-4 text-blue-600" />
                <span>OFFICIAL INTEGRATIONS HUB</span>
              </div>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                Connect your engineering supply chain &amp; toolchain.
              </h2>
              <p className="text-slate-600 leading-relaxed text-sm sm:text-base">
                1-click official connectors sync real-time supplier part availability, electrical parameters, CAD specs, and issue trackers directly into your PDLC decision graph.
              </p>
              <div className="mt-2 flex items-center gap-3">
                <Button
                  asChild
                  className="bg-blue-600 hover:bg-blue-700 text-white font-mono text-xs font-semibold shadow-md shadow-blue-500/20"
                >
                  <Link href="/sign-up">Connect Store API</Link>
                </Button>
              </div>
            </div>

            <div className="lg:col-span-7 grid grid-cols-2 sm:grid-cols-3 gap-4 font-mono text-xs">
              <div className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-4 shadow-xs">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <ShoppingCart className="size-4 text-amber-600" /> Amazon Store API
                </div>
                <span className="text-[11px] text-slate-500">ASIN &amp; Part Sync</span>
                <span className="text-[9px] bg-emerald-100 text-emerald-800 font-extrabold px-1.5 py-0.5 rounded">CONNECTED</span>
              </div>

              <div className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-4 shadow-xs">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Cpu className="size-4 text-red-600" /> DigiKey API
                </div>
                <span className="text-[11px] text-slate-500">IC Specs &amp; Stock</span>
                <span className="text-[9px] bg-emerald-100 text-emerald-800 font-extrabold px-1.5 py-0.5 rounded">CONNECTED</span>
              </div>

              <div className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-4 shadow-xs">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Building2 className="size-4 text-blue-600" /> Mouser Electronics
                </div>
                <span className="text-[11px] text-slate-500">Component Datasheets</span>
                <span className="text-[9px] bg-emerald-100 text-emerald-800 font-extrabold px-1.5 py-0.5 rounded">CONNECTED</span>
              </div>

              <div className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-4 shadow-xs">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Layers className="size-4 text-emerald-600" /> McMaster-Carr
                </div>
                <span className="text-[11px] text-slate-500">Hardware CAD Models</span>
                <span className="text-[9px] bg-emerald-100 text-emerald-800 font-extrabold px-1.5 py-0.5 rounded">CONNECTED</span>
              </div>

              <div className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-4 shadow-xs">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <FileText className="size-4 text-indigo-600" /> IBM DOORS / Jira
                </div>
                <span className="text-[11px] text-slate-500">Legacy Req Sync</span>
                <span className="text-[9px] bg-blue-100 text-blue-800 font-extrabold px-1.5 py-0.5 rounded">READY</span>
              </div>

              <div className="flex flex-col items-start gap-2 rounded-xl border border-slate-200 bg-slate-50/80 p-4 shadow-xs">
                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                  <Server className="size-4 text-purple-600" /> Siemens PLM / CAD
                </div>
                <span className="text-[11px] text-slate-500">Assembly Tree Graph</span>
                <span className="text-[9px] bg-blue-100 text-blue-800 font-extrabold px-1.5 py-0.5 rounded">READY</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 7: SECURITY & ENTERPRISE INFRASTRUCTURE */}
      <section className="py-20 border-t border-slate-200/80 bg-slate-50/50">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-7xl">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <Lock className="size-6 text-blue-600" />
              <h3 className="font-bold text-slate-900 text-lg">SOC2 Type II &amp; ITAR Ready</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                End-to-end encryption at rest and in transit with strict role-based access controls for aerospace and defense engineering standards.
              </p>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <Server className="size-6 text-indigo-600" />
              <h3 className="font-bold text-slate-900 text-lg">On-Premises &amp; Air-Gapped</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Deploy inside your private AWS/Azure VPC or air-gapped infrastructure with zero external data telemetry.
              </p>
            </div>

            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <ShieldCheck className="size-6 text-emerald-600" />
              <h3 className="font-bold text-slate-900 text-lg">Immutable Audit Ledger</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Every requirement edit, evidence attachment, and approval decision is cryptographically signed and stored with full history tracking.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 8: FINAL CTA */}
      <section className="py-20 border-t border-slate-200/80 bg-white">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 max-w-5xl">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-700 p-8 sm:p-14 text-white shadow-2xl shadow-blue-500/25">
            <div className="pointer-events-none absolute -right-10 -top-10 size-80 rounded-full bg-white/10 blur-2xl" />

            <div className="relative z-10 flex flex-col items-center text-center max-w-2xl mx-auto">
              <Badge variant="outline" className="font-mono text-xs text-blue-100 border-white/30 uppercase tracking-widest px-3 py-1">
                ENGINEERING DECISION PLATFORM
              </Badge>

              <h2 className="mt-6 text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">
                Build defensible engineering decisions today.
              </h2>

              <p className="mt-4 text-blue-100 text-sm sm:text-base leading-relaxed font-normal">
                Eliminate unverified requirements, blind change propagation, and missing test evidence across your engineering lifecycle.
              </p>

              <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
                <Button
                  asChild
                  size="lg"
                  className="h-12 px-8 rounded-xl bg-white text-blue-700 hover:bg-blue-50 font-mono text-sm font-bold shadow-lg transition-all border-none"
                >
                  <Link href="/sign-up">Get Started with PDLC</Link>
                </Button>

                <Button
                  asChild
                  variant="outline"
                  size="lg"
                  className="h-12 px-8 rounded-xl border-white/40 bg-white/10 hover:bg-white/20 text-white font-mono text-sm font-semibold transition-all backdrop-blur-xs"
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
