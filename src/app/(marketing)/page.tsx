import type { Metadata } from "next";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  Database,
  FileCheck,
  FileCheck2,
  FileText,
  GitBranch,
  GitCommit,
  GitPullRequest,
  Handshake,
  HelpCircle,
  Layers,
  Lock,
  Network,
  Scale,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Waypoints,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Shell } from "@/components/common/shell";
import { PRODUCT_VERSION } from "@/lib/product-version";
import { HeroGraphInteractive } from "./_components/hero-graph-interactive";
import { QueryInterfaceVisual } from "./_components/query-interface-visual";
import { UseCaseVisual } from "./_components/use-case-visual";

export const metadata: Metadata = {
  title: "PDLC Platform — Engineering Requirements & Decision Intelligence Platform",
  description:
    "PDLC connects requirements, questions, evidence, decisions, and approvals into one continuously traceable engineering system for complex hardware and deep-tech teams.",
};

const FAILURE_MODES = [
  {
    code: "FAIL-01",
    tag: "SPECIFICATION DEFECT",
    title: "Poor Requirements",
    description:
      "Requirements are vague, incomplete, contradictory, or never properly defined. Subjective phrasing like 'adequate thermal margin' or 'fast actuation' leaves crucial bounds unquantified.",
    snippetId: "REQ-PROP-012",
    snippetText: "The valve shall operate with adequate margin under extreme environmental conditions.",
    comment: "Reviewer: Unquantified term 'adequate margin'. What temperature and pressure bounds?",
    badge: "Ambiguity Flaw",
  },
  {
    code: "FAIL-02",
    tag: "UNRESOLVED TRADES",
    title: "Unanswered Questions",
    description:
      "Teams make design and architectural decisions before the underlying engineering questions are formally framed with clear acceptance criteria and variables.",
    snippetId: "QST-THERM-044",
    snippetText: "What is the steady-state thermal dissipation across the manifold during peak flight envelope?",
    comment: "Reviewer: Decision DEC-004 proceeded without resolving this trade study.",
    badge: "Unresolved Question",
  },
  {
    code: "FAIL-03",
    tag: "VERIFICATION GAP",
    title: "Evidence Gaps",
    description:
      "Critical performance and safety claims exist in isolation without a verifiable source document, test log, structural calculation, or explicit owner.",
    snippetId: "EVD-UNLINKED-90",
    snippetText: "Claimed burst pressure tolerance: 350 bar (Source: Internal email thread).",
    comment: "Reviewer: Missing sealed test report or finite element analysis document.",
    badge: "Missing Evidence",
  },
  {
    code: "FAIL-04",
    tag: "UNAUTHORIZED DELTA",
    title: "Approval Gaps",
    description:
      "Requirements, interface control documents (ICDs), and engineering changes are implemented in downstream subsystems without explicit dual-custody sign-offs.",
    snippetId: "APP-ICD-401",
    snippetText: "ICD-401 Fluid Interface Revision v3.2 applied in CAD model.",
    comment: "Reviewer: Propulsion Lead & Safety Officer approvals are still PENDING.",
    badge: "Approval Gap",
  },
] as const;

const LIFECYCLE_CHAIN = [
  {
    stage: "01",
    label: "REQUIRE",
    title: "Define what must be true.",
    body: "Author unambiguous, measurable requirements with explicit numerical bounds, units, and categories.",
    icon: FileCheck,
  },
  {
    stage: "02",
    label: "QUESTION",
    title: "Identify what must be resolved.",
    body: "Frame critical engineering queries, trade studies, and assumptions before locking design choices.",
    icon: HelpCircle,
  },
  {
    stage: "03",
    label: "EVIDENCE",
    title: "Attach verified sources.",
    body: "Bind calculations, test logs, simulation runs, datasheets, and inspection reports to claims.",
    icon: FileText,
  },
  {
    stage: "04",
    label: "DECIDE",
    title: "Record engineering rationale.",
    body: "Log formal engineering decisions, evaluated trade-off alternatives, and baseline choices.",
    icon: Scale,
  },
  {
    stage: "05",
    label: "APPROVE",
    title: "Capture stakeholder agreement.",
    body: "Enforce explicit dual-custody sign-offs across Systems, Thermal, Propulsion, and Safety leads.",
    icon: ShieldCheck,
  },
  {
    stage: "06",
    label: "TRACE",
    title: "Understand change impact.",
    body: "Automatically walk the relational graph when an assumption or requirement changes downstream.",
    icon: Waypoints,
  },
] as const;

const DIFFERENTIATOR_MATRIX = [
  {
    category: "Core Concept",
    traditional: "Task lists & issue tickets",
    pdlc: "Requirements & decision intelligence graph",
  },
  {
    category: "Primary Unit",
    traditional: "Tasks, Documents, Tickets, Comments",
    pdlc: "Requirements, Questions, Evidence, Decisions",
  },
  {
    category: "Decision Rationale",
    traditional: "Lost in slack messages & email threads",
    pdlc: "Immutable decision records with evidence links",
  },
  {
    category: "Conflict Handling",
    traditional: "Discovered during late physical integration",
    pdlc: "Automated cross-discipline conflict detection",
  },
  {
    category: "Change Impact",
    traditional: "Manual meetings & spreadsheet memory",
    pdlc: "Deterministic relational graph traversal",
  },
  {
    category: "Governance & Audit",
    traditional: "Post-hoc documentation scrambles",
    pdlc: "Continuously defensible evidence chain",
  },
] as const;

const TECHNICAL_ROLES = [
  {
    role: "Systems Engineering",
    icon: Network,
    useCase: "Maintain unbroken bidirectional traceability from high-level mission needs down to component verification.",
  },
  {
    role: "Requirements Engineering",
    icon: FileCheck2,
    useCase: "Inspect requirement quality across 12 criteria and eliminate vague, unquantified specifications.",
  },
  {
    role: "Certification & Compliance",
    icon: ShieldCheck,
    useCase: "Produce deterministic audit trails for DO-178C, DO-254, ARP4754A, and ISO 26262 compliance.",
  },
  {
    role: "Product Engineering",
    icon: Layers,
    useCase: "Verify subsystem design choices and interface control documents against upstream stakeholder intents.",
  },
  {
    role: "R&D & Advanced Programs",
    icon: Scale,
    useCase: "Capture trade studies, engineering assumptions, and experimental evidence in a structured system.",
  },
  {
    role: "Quality Engineering",
    icon: FileText,
    useCase: "Ensure no requirement is closed or baseline locked without verified test evidence.",
  },
  {
    role: "Supplier Engineering",
    icon: Server,
    useCase: "Assess downstream impact when supplier specifications or hardware component ASINs/SKUs change.",
  },
  {
    role: "Technical Program Leadership",
    icon: GitCommit,
    useCase: "Track real structural sign-off bottlenecks and change blast radii without status meeting overhead.",
  },
] as const;

export default function DeepTechLandingPage() {
  return (
    <div className="flex flex-col gap-24 bg-slate-950 text-slate-100 py-12 md:py-16 selection:bg-cyan-500/30 selection:text-cyan-200">
      
      {/* ==================================================================== */}
      {/* HERO SECTION */}
      {/* ==================================================================== */}
      <Shell className="flex flex-col items-center text-center">
        {/* Version Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/80 px-3.5 py-1 text-xs font-mono text-slate-300">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          <span className="font-semibold text-slate-100">PDLC PLATFORM v{PRODUCT_VERSION}</span>
          <span className="text-slate-600">/</span>
          <span className="text-slate-400 font-mono">DETERMINISTIC DECISION SYSTEM</span>
        </div>

        {/* Main Headline */}
        <h1 className="mt-8 max-w-4xl font-mono text-3xl font-black tracking-tight text-white sm:text-5xl lg:text-6xl leading-[1.15]">
          Engineering decisions should be <span className="text-cyan-400 underline decoration-cyan-500/40 underline-offset-8">traceable.</span>
        </h1>

        {/* Subheadline */}
        <p className="mt-6 max-w-2xl font-sans text-base text-slate-300 sm:text-lg leading-relaxed">
          PDLC connects requirements, questions, evidence, decisions, and approvals into one continuously traceable engineering system.
        </p>

        {/* Call to Action Buttons */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4 font-mono text-xs">
          <Button asChild size="lg" className="gap-2 bg-cyan-500 font-semibold text-slate-950 hover:bg-cyan-400 transition-colors">
            <Link href="/sign-up">
              Explore the Platform <ArrowRight className="size-4" />
            </Link>
          </Button>

          <Button asChild variant="outline" size="lg" className="gap-2 border-slate-800 bg-slate-900 text-slate-300 hover:border-slate-700 hover:bg-slate-800 hover:text-white transition-colors">
            <Link href="#problem">
              See How It Works
            </Link>
          </Button>
        </div>

        {/* Hero Visual: Interactive Graph */}
        <div className="mt-12 w-full max-w-5xl">
          <HeroGraphInteractive />
        </div>
      </Shell>

      {/* ==================================================================== */}
      {/* SECTION 2 — THE PROBLEM */}
      {/* ==================================================================== */}
      <Shell id="problem" className="flex flex-col gap-10">
        <div className="flex flex-col gap-3 max-w-3xl">
          <Badge variant="outline" className="w-fit font-mono text-xs border-amber-500/40 text-amber-400 bg-amber-500/10">
            ENGINEERING FAILURE MODES
          </Badge>
          <h2 className="font-mono text-2xl font-black tracking-tight text-white sm:text-4xl">
            Product development breaks long before the product does.
          </h2>
          <p className="text-sm text-slate-300">
            Complex hardware programs rarely fail from a single component defect. They break when unclear requirements, floating assumptions, unverified claims, and silent approvals compound over time.
          </p>
        </div>

        {/* 4 Technical Failure Modes Review Environment */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {FAILURE_MODES.map((mode) => (
            <div
              key={mode.code}
              className="flex flex-col justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/60 p-5 font-mono transition-colors hover:border-slate-700 hover:bg-slate-900/90"
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-amber-400 tracking-wider">
                    [{mode.code}] {mode.tag}
                  </span>
                  <Badge variant="outline" className="border-rose-500/30 text-rose-400 bg-rose-500/10 text-[10px]">
                    {mode.badge}
                  </Badge>
                </div>

                <h3 className="text-base font-bold font-sans text-white">{mode.title}</h3>
                <p className="text-xs font-sans text-slate-300 leading-relaxed">{mode.description}</p>
              </div>

              {/* Review Snippet Box */}
              <div className="flex flex-col gap-2 rounded-lg border border-slate-800/80 bg-slate-950 p-3.5 text-xs">
                <div className="flex items-center justify-between text-[10px] text-slate-500 border-b border-slate-800/60 pb-1.5">
                  <span>Artifact: {mode.snippetId}</span>
                  <span className="text-rose-400 font-semibold">Unresolved</span>
                </div>
                <p className="text-slate-300 italic">&ldquo;{mode.snippetText}&rdquo;</p>
                <div className="flex items-center gap-1.5 text-[11px] text-amber-400/90 font-sans pt-1 border-t border-slate-800/60">
                  <AlertTriangle className="size-3.5 shrink-0" />
                  <span>{mode.comment}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Shell>

      {/* ==================================================================== */}
      {/* SECTION 3 — THE CORE SYSTEM */}
      {/* ==================================================================== */}
      <Shell className="flex flex-col gap-10">
        <div className="flex flex-col gap-3 max-w-3xl">
          <Badge variant="outline" className="w-fit font-mono text-xs border-cyan-500/40 text-cyan-400 bg-cyan-500/10">
            THE LIFECYCLE CHAIN
          </Badge>
          <h2 className="font-mono text-2xl font-black tracking-tight text-white sm:text-4xl">
            Build a chain of evidence around every engineering decision.
          </h2>
          <p className="text-sm text-slate-300">
            PDLC connects the entire product lifecycle into a continuous horizontal architecture, ensuring every decision is backed by mathematical proof, explicit sign-offs, and graph traceability.
          </p>
        </div>

        {/* Horizontal Technical Architecture Flow */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          {LIFECYCLE_CHAIN.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.stage}
                className="relative flex flex-col justify-between gap-4 rounded-xl border border-slate-800 bg-slate-900/50 p-4 transition-colors hover:border-cyan-500/50 hover:bg-slate-900/90"
              >
                <div className="flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-cyan-400">{step.stage}</span>
                    <Icon className="size-4 text-slate-400" />
                  </div>
                  <span className="font-mono text-xs font-bold tracking-wider text-slate-200 uppercase">
                    {step.label}
                  </span>
                  <h3 className="font-sans text-xs font-bold text-white mt-1">{step.title}</h3>
                  <p className="font-sans text-[11px] text-slate-400 leading-normal">{step.body}</p>
                </div>

                <div className="flex items-center gap-1 font-mono text-[10px] text-slate-500 pt-2 border-t border-slate-800">
                  <span>Linked Node</span>
                  <ChevronRight className="size-3 text-cyan-400 ml-auto" />
                </div>
              </div>
            );
          })}
        </div>
      </Shell>

      {/* ==================================================================== */}
      {/* SECTION 4 — PRODUCT DIFFERENTIATION */}
      {/* ==================================================================== */}
      <Shell className="flex flex-col gap-10">
        <div className="flex flex-col gap-3 max-w-3xl">
          <Badge variant="outline" className="w-fit font-mono text-xs border-purple-500/40 text-purple-400 bg-purple-500/10">
            ARCHITECTURAL COMPARISON
          </Badge>
          <h2 className="font-mono text-2xl font-black tracking-tight text-white sm:text-4xl">
            Not another project management layer.
          </h2>
          <p className="text-sm text-slate-300">
            Conventional development tools store disconnected files and tickets. PDLC structures the reasoning, evidence, and dependencies behind engineering decisions.
          </p>
        </div>

        {/* Comparison Matrix Table */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 overflow-hidden font-mono text-xs">
          <div className="grid grid-cols-12 border-b border-slate-800 bg-slate-950 p-4 font-bold text-slate-300">
            <div className="col-span-3">DIMENSION</div>
            <div className="col-span-4 text-slate-400">TRADITIONAL DEVELOPMENT TOOLS</div>
            <div className="col-span-5 text-cyan-400 flex items-center gap-1">
              <ShieldCheck className="size-4" /> PDLC DECISION INTELLIGENCE
            </div>
          </div>

          <div className="divide-y divide-slate-800/70">
            {DIFFERENTIATOR_MATRIX.map((item) => (
              <div key={item.category} className="grid grid-cols-12 p-4 items-center gap-2 hover:bg-slate-900/90 transition-colors">
                <div className="col-span-3 font-semibold text-slate-200">{item.category}</div>
                <div className="col-span-4 text-slate-400 flex items-center gap-1.5">
                  <span className="text-rose-400/80">✕</span> {item.traditional}
                </div>
                <div className="col-span-5 font-semibold text-cyan-300 flex items-center gap-1.5">
                  <span className="text-emerald-400">✓</span> {item.pdlc}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Shell>

      {/* ==================================================================== */}
      {/* SECTION 5 — LIVE PRODUCT VISUAL */}
      {/* ==================================================================== */}
      <Shell className="flex flex-col gap-10">
        <div className="flex flex-col gap-3 max-w-3xl">
          <Badge variant="outline" className="w-fit font-mono text-xs border-cyan-500/40 text-cyan-400 bg-cyan-500/10">
            GRAPH QUERY INTERFACE
          </Badge>
          <h2 className="font-mono text-2xl font-black tracking-tight text-white sm:text-4xl">
            Ask what the engineering data already knows.
          </h2>
          <p className="text-sm text-slate-300">
            Query your product graph for unsupported claims, conflicting specifications, unverified calculations, and downstream blast radii in milliseconds.
          </p>
        </div>

        {/* Section 5 Query Visual Component */}
        <QueryInterfaceVisual />
      </Shell>

      {/* ==================================================================== */}
      {/* SECTION 6 — TECHNICAL ARCHITECTURE */}
      {/* ==================================================================== */}
      <Shell className="flex flex-col gap-10">
        <div className="flex flex-col gap-3 max-w-3xl">
          <Badge variant="outline" className="w-fit font-mono text-xs border-emerald-500/40 text-emerald-400 bg-emerald-500/10">
            TECHNICAL ARCHITECTURE
          </Badge>
          <h2 className="font-mono text-2xl font-black tracking-tight text-white sm:text-4xl">
            A structured memory for product development.
          </h2>
          <p className="text-sm text-slate-300">
            A deterministic relational graph model backed by strict PostgreSQL 17 constraints, capturing exact metadata attributes across every object.
          </p>
        </div>

        {/* Technical Architecture Flow Diagram */}
        <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-6 font-mono">
          <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-xs border-b border-slate-800 pb-4">
            <span className="font-bold text-slate-200">SCHEMA FLOW // POSTGRESQL 17 RELATIONAL MODEL</span>
            <span className="text-cyan-400">100% SELF-HOSTED & AIR-GAPPED</span>
          </div>

          {/* Architecture Pipeline */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2 text-center text-xs font-bold">
            {["Requirements", "Questions", "Docs / Data / Tests", "Evidence Graph", "Decisions", "Approvals", "Change Impact"].map((block, idx) => (
              <div key={block} className="flex flex-col items-center gap-2">
                <div className="w-full rounded border border-slate-700 bg-slate-950 py-3 px-2 text-slate-200 hover:border-cyan-400 transition-colors">
                  {block}
                </div>
                {idx < 6 && <span className="text-slate-600 lg:hidden">↓</span>}
              </div>
            ))}
          </div>

          {/* Metadata Badges Bar */}
          <div className="mt-8 flex flex-wrap items-center justify-center gap-2 pt-6 border-t border-slate-800/80">
            <span className="text-xs text-slate-400 font-sans mr-2">Tracked Metadata:</span>
            {["Source", "Owner", "Revision", "Timestamp", "Confidence", "Status", "Dependency", "Validation state"].map((meta) => (
              <Badge key={meta} variant="outline" className="font-mono text-[11px] border-slate-700 text-slate-300 bg-slate-950">
                {meta}
              </Badge>
            ))}
          </div>
        </div>
      </Shell>

      {/* ==================================================================== */}
      {/* SECTION 7 — WHO IT IS FOR */}
      {/* ==================================================================== */}
      <Shell className="flex flex-col gap-10">
        <div className="flex flex-col gap-3 max-w-3xl">
          <Badge variant="outline" className="w-fit font-mono text-xs border-blue-500/40 text-blue-400 bg-blue-500/10">
            TARGET ENGINEERING DISCIPLINES
          </Badge>
          <h2 className="font-mono text-2xl font-black tracking-tight text-white sm:text-4xl">
            Built for teams where ambiguity is expensive.
          </h2>
          <p className="text-sm text-slate-300">
            Designed specifically for technical engineering organizations building mission-critical hardware, aerospace, automotive, defense, and complex systems.
          </p>
        </div>

        {/* Roles Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {TECHNICAL_ROLES.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.role}
                className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-5 transition-colors hover:border-slate-700 hover:bg-slate-900/80"
              >
                <div className="flex items-center gap-2.5">
                  <div className="flex size-8 items-center justify-center rounded bg-slate-800 text-cyan-400">
                    <Icon className="size-4" />
                  </div>
                  <h3 className="font-sans text-sm font-bold text-white">{item.role}</h3>
                </div>
                <p className="font-sans text-xs text-slate-300 leading-relaxed">{item.useCase}</p>
              </div>
            );
          })}
        </div>
      </Shell>

      {/* ==================================================================== */}
      {/* SECTION 8 — USE CASE */}
      {/* ==================================================================== */}
      <Shell className="flex flex-col gap-10">
        <div className="flex flex-col gap-3 max-w-3xl">
          <Badge variant="outline" className="w-fit font-mono text-xs border-purple-500/40 text-purple-400 bg-purple-500/10">
            REAL-WORLD SCENARIO
          </Badge>
          <h2 className="font-mono text-2xl font-black tracking-tight text-white sm:text-4xl">
            Prevent late-stage physical rework before code or CAD is frozen.
          </h2>
        </div>

        {/* Section 8 Use Case Visual Component */}
        <UseCaseVisual />
      </Shell>

      {/* ==================================================================== */}
      {/* SECTION 9 — COMPANY POSITIONING */}
      {/* ==================================================================== */}
      <Shell className="flex flex-col gap-6 max-w-4xl text-left font-sans">
        <div className="border-l-2 border-cyan-500 pl-6 py-2">
          <h2 className="font-mono text-xl font-bold tracking-tight text-white">
            Engineering memory for organizations that build complex things.
          </h2>
          <p className="mt-3 text-sm text-slate-300 leading-relaxed">
            Modern engineering teams generate enormous amounts of requirements, specifications, decisions, tests, reviews, and technical knowledge. PDLC connects that information into a system that preserves why decisions were made, what supports them, and what changes when assumptions change.
          </p>
        </div>
      </Shell>

      {/* ==================================================================== */}
      {/* SECTION 10 — FINAL CTA */}
      {/* ==================================================================== */}
      <Shell>
        <div className="w-full rounded-2xl border border-slate-800 bg-gradient-to-b from-slate-900 to-slate-950 p-8 sm:p-12 text-center flex flex-col items-center gap-6 shadow-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3.5 py-1 font-mono text-xs text-cyan-300">
            <ShieldCheck className="size-3.5 text-cyan-400" />
            <span>SELF-HOSTED & AIR-GAPPED READY</span>
          </div>

          <h2 className="font-mono text-3xl font-black tracking-tight text-white sm:text-5xl max-w-3xl leading-tight">
            Make every engineering decision defensible.
          </h2>

          <p className="max-w-xl font-sans text-sm text-slate-300 leading-relaxed">
            Connect requirements, evidence, decisions, and approvals across the product development lifecycle.
          </p>

          <div className="flex flex-col items-center gap-3">
            <Button asChild size="lg" className="gap-2 bg-cyan-500 font-mono text-xs font-semibold text-slate-950 hover:bg-cyan-400 transition-colors">
              <Link href="/sign-up">
                Explore PDLC <ArrowRight className="size-4" />
              </Link>
            </Button>
            <span className="font-mono text-[11px] text-slate-500">
              Designed for technical teams building complex products.
            </span>
          </div>
        </div>
      </Shell>

    </div>
  );
}
