import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Binary,
  BookOpen,
  Database,
  Download,
  FileCheck,
  FileCheck2,
  GitCommit,
  Handshake,
  HelpCircle,
  Layers,
  Lock,
  Network,
  Server,
  Shield,
  ShieldCheck,
  Workflow,
  Zap,
} from "lucide-react";
import { GRAPH_EDGE_TYPES, GRAPH_LIMITS, GRAPH_NODE_TYPES } from "@/domain";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Shell } from "@/components/common/shell";
import { CodeBlock } from "@/components/common/code-block";
import { PRODUCT_VERSION } from "@/lib/product-version";
import { InteractiveShowcase } from "./_components/interactive-showcase";

export const metadata: Metadata = {
  title: "PDLC Platform — Deterministic Aerospace Lifecycle Management",
  description:
    "A self-hosted, graph-native product development lifecycle system for aerospace and mission-critical engineering. Change impact simulation, requirements quality control, and zero AI hallucinations.",
};

const STATS = [
  {
    value: GRAPH_NODE_TYPES.length,
    label: "Domain node types",
    sub: "Every artifact backed by a relational PostgreSQL 17 table",
  },
  {
    value: GRAPH_EDGE_TYPES.length,
    label: "Typed edge relations",
    sub: "Foreign keys enforcing rigorous bidirectional traceability",
  },
  {
    value: `${GRAPH_LIMITS.maxMaxDepth} hops`,
    label: "Max traversal bound",
    sub: "Guaranteed polynomial-time termination, no runaway queries",
  },
  {
    value: "0 calls",
    label: "Outbound telemetry",
    sub: "100% self-hosted, air-gapped, and sovereign",
  },
] as const;

const PREVENTION_MODULES = [
  {
    icon: FileCheck,
    tag: "QUALITY GATE 1",
    title: "Requirements Quality & Ambiguity Inspector",
    description:
      "Automated inspection of 12 strict criteria: ambiguity, missing measurable metrics, missing units, undefined terms, and subjective language ('adequate', 'fast', 'sufficient'). Includes non-destructive rewrites and starter wizards.",
    badge: "12 Criteria Checked",
  },
  {
    icon: Handshake,
    tag: "CONSENSUS GATE 2",
    title: "Stakeholder Agreement & Conflict Resolution",
    description:
      "Logs formal positions across engineering disciplines, detects subtle cross-team interpretation conflicts before baseline lock, and generates binding resolution records.",
    badge: "Conflict Detection",
  },
  {
    icon: HelpCircle,
    tag: "FRAMING GATE 3",
    title: "Engineering Question Gatekeeper",
    description:
      "Intercepts vague, broad queries (e.g. 'How to make turbopump more reliable?') and transforms them into structured engineering questions with exact success criteria.",
    badge: "Problem Framing",
  },
  {
    icon: Zap,
    tag: "BLAST RADIUS GATE 4",
    title: "Requirement Change Impact Simulator",
    description:
      "Propose requirement edits and instantly calculate 1st, 2nd, and 3rd order downstream ripple effects across requirements, design decisions, test plans, and evidence records.",
    badge: "Impact Analysis",
  },
] as const;

const DIFFERENTIATORS = [
  {
    icon: Database,
    tag: "RELATIONAL INTEGRITY",
    title: "One real relational graph",
    body: `${GRAPH_NODE_TYPES.length} node types and ${GRAPH_EDGE_TYPES.length} edge types. Every relationship is backed by a strict PostgreSQL foreign key constraint — not loose spreadsheets, floating JSON documents, or untyped hyperlinks.`,
  },
  {
    icon: Binary,
    tag: "FORMAL CERTAINTY",
    title: "Deterministic traversal engines",
    body: "Identical input produces identical output across every execution. A traversal that hits a safety limit halts and explicitly reports refusal; it never silently returns a partial answer as if it were complete.",
  },
  {
    icon: ShieldCheck,
    tag: "AIRWORTHINESS RIGOR",
    title: "Zero AI by architectural mandate",
    body: "In FAA, EASA, and defense certification contexts (DO-178C, DO-254), safety cases demand certified human accountability and mathematical proof. PDLC never infers, guesses, or hallucinates.",
  },
  {
    icon: Workflow,
    tag: "BLAST RADIUS ANALYSIS",
    title: "Deterministic change propagation",
    body: "When an engineering change request or supplier erratum arises, our traversal engine computes the exact downstream cascade across requirements, verification plans, interfaces, and safety risks in milliseconds.",
  },
  {
    icon: GitCommit,
    tag: "CRYPTOGRAPHIC AUDIT",
    title: "Immutable, sealed baselines",
    body: "Freeze your complete lifecycle state at major program milestones (SRR, PDR, CDR). Baselines are SHA-256 fingerprinted and protected by dual-custody approval workflows with tamper-evident audit logs.",
  },
  {
    icon: Lock,
    tag: "SOVEREIGN SECURITY",
    title: "First-party, air-gapped security",
    body: "Self-hosted Argon2id password hashing at OWASP parameters, opaque server-side session hashes, and transactional audit logging. Your export-controlled engineering data never leaves your infrastructure.",
  },
] as const;

const LIFECYCLE_STAGES = [
  {
    step: "01",
    title: "Stakeholder Needs",
    desc: "Operational intents, mission requirements, and flight envelopes.",
    node: "StakeholderNeed",
  },
  {
    step: "02",
    title: "System Requirements",
    desc: "Decomposed functional, physical, and environmental specifications.",
    node: "Requirement",
  },
  {
    step: "03",
    title: "Decisions & Architecture",
    desc: "Trade studies, architectural choices, and frozen baselines.",
    node: "EngineeringDecision",
  },
  {
    step: "04",
    title: "Design & Interfaces",
    desc: "Subsystem interfaces (ICDs), physical items, and failure modes.",
    node: "DesignItem",
  },
  {
    step: "05",
    title: "Verification Activities",
    desc: "HIL tests, inspections, flight tests, and analysis procedures.",
    node: "VerificationActivity",
  },
  {
    step: "06",
    title: "Airworthiness Evidence",
    desc: "Cryptographically bound logs, test telemetry, and compliance sign-offs.",
    node: "Evidence",
  },
] as const;

const AUDIENCES = [
  {
    role: "Systems Engineers",
    icon: Network,
    cares:
      "Maintain unbroken bidirectional traceability from high-level mission needs down to component verification, without manual spreadsheet maintenance.",
    href: "/docs/concepts",
  },
  {
    role: "Airworthiness & Quality Leads",
    icon: FileCheck2,
    cares:
      "Produce compliance matrices for DO-178C, DO-254, and ARP4754A. Findings carry full relational audit paths rather than probabilistic approximations.",
    href: "/docs/concepts",
  },
  {
    role: "Chief Engineers & Directors",
    icon: Layers,
    cares:
      "Inspect program health, detect unlinked requirements, review change request blast radii, and track sign-off bottlenecks in real time.",
    href: "/docs/concepts",
  },
  {
    role: "IT & Infrastructure Teams",
    icon: Server,
    cares:
      "Deploy completely air-gapped via Docker Compose. Self-hosted PostgreSQL 17, zero third-party cloud dependencies, and zero outbound network calls.",
    href: "/docs/security",
  },
] as const;

const DEPLOYMENT_MODES = [
  {
    name: "Self-Hosted (Recommended)",
    badge: "PRODUCTION READY",
    variant: "success" as const,
    body: "Your private cloud or on-premises bare metal, your PostgreSQL 17 database, zero outbound telemetry. The verified production deployment path today via Docker Compose.",
  },
  {
    name: "Air-Gapped Dedicated Instance",
    badge: "ROADMAP",
    variant: "secondary" as const,
    body: "Isolated single-tenant instance for defense and enterprise programs requiring managed infrastructure with strict data sovereignty.",
  },
  {
    name: "Multi-Tenant Sovereign Cloud",
    badge: "FUTURE",
    variant: "outline" as const,
    body: "Managed cloud environment for evaluation and non-export-controlled commercial programs. Stated honestly as an architectural roadmap direction.",
  },
] as const;

export default function MarketingHomePage() {
  return (
    <div className="flex flex-col gap-24 py-12 md:py-16">
      {/* 1. HERO SECTION */}
      <Shell className="flex flex-col items-center text-center">
        {/* Status Pill */}
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-mono text-muted-foreground shadow-xs">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
          </span>
          <span className="font-semibold text-foreground">PDLC PLATFORM v{PRODUCT_VERSION}</span>
          <span className="text-border">/</span>
          <span className="hidden sm:inline">DETERMINISTIC AEROSPACE LIFECYCLE ENGINE</span>
          <span className="sm:hidden">MISSION-CRITICAL</span>
        </div>

        {/* Hero Title */}
        <h1 className="mt-6 max-w-4xl text-3xl font-extrabold tracking-tight text-foreground sm:text-5xl lg:text-6xl leading-[1.1]">
          Prevent Aerospace Engineering Failures Before They Happen with{" "}
          <span className="text-primary underline decoration-primary/30 decoration-wavy underline-offset-8">
            Deterministic Traceability
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mt-6 max-w-3xl text-base text-muted-foreground sm:text-lg leading-relaxed">
          Actively eliminates poor requirements, stakeholder disagreements, and ill-framed engineering questions. Unified on one real relational graph with instant Change Impact Simulation and zero AI hallucinations.
        </p>

        {/* CTAs */}
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg" className="gap-2 px-6 shadow-md">
            <Link href="/sign-up">
              <span>Create an Organization</span>
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>

          <Button asChild variant="outline" size="lg" className="gap-2">
            <Link href="/docs/step-by-step-guide">
              <BookOpen className="size-4 text-primary" aria-hidden="true" />
              <span>Step-by-Step Software Guide</span>
            </Link>
          </Button>

          <Button asChild variant="ghost" size="lg" className="gap-2">
            <Link href="/download">
              <Download className="size-4 text-muted-foreground" aria-hidden="true" />
              <span>Download self-hosted bundle</span>
            </Link>
          </Button>
        </div>

        {/* 2. HERO MOCKUP: MISSION TRACE & IMPACT CONSOLE */}
        <div className="mt-14 w-full max-w-4xl overflow-hidden rounded-xl border border-border bg-card text-left shadow-lg">
          <div className="flex items-center justify-between border-b border-border bg-secondary/50 px-4 py-2.5">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5" aria-hidden="true">
                <div className="size-2.5 rounded-full bg-destructive/60" />
                <div className="size-2.5 rounded-full bg-warning/60" />
                <div className="size-2.5 rounded-full bg-success/60" />
              </div>
              <span className="font-mono text-xs font-semibold text-foreground">
                {"MISSION-TRACE-CONSOLE // CHANGE-IMPACT-SIMULATOR"}
              </span>
            </div>
            <div className="hidden sm:flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              <span>GRAPH SYNC: 100% RELATIONAL</span>
            </div>
          </div>

          <div className="p-5 font-mono text-xs leading-relaxed sm:p-6">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              {/* Left Column: Trace Chain */}
              <div className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/30 p-3.5 lg:col-span-2">
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span className="font-semibold uppercase tracking-wider text-foreground">
                    Active Traceability Thread
                  </span>
                  <span className="rounded bg-primary/10 px-1.5 py-0.5 text-primary font-medium">
                    DO-178C / DO-254
                  </span>
                </div>

                <div className="flex flex-col gap-2 pt-1">
                  <div className="flex items-start gap-2">
                    <span className="font-semibold text-primary">SN-042</span>
                    <span className="text-muted-foreground">
                      Triple-redundant Environmental Control System cabin pressure envelope
                    </span>
                  </div>
                  <div className="flex items-start gap-2 pl-4 border-l border-border">
                    <ArrowRight className="size-3 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
                    <div>
                      <span className="font-semibold text-foreground">REQ-108:</span>{" "}
                      <span className="text-muted-foreground">
                        Dual independent valve actuators with isolated power rails
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 pl-8 border-l border-border">
                    <ArrowRight className="size-3 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
                    <div>
                      <span className="font-semibold text-foreground">DEC-019:</span>{" "}
                      <span className="text-muted-foreground">
                        Adopt CAN-FD with galvanic isolation for inter-module bus
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 pl-12 border-l border-border">
                    <ArrowRight className="size-3 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-foreground">VER-082:</span>
                      <span className="text-muted-foreground">HIL Fault Injection Matrix</span>
                      <span className="rounded bg-success/15 px-1.5 py-0.2 text-[10px] text-success font-medium">
                        VERIFIED (100%)
                      </span>
                    </div>
                  </div>
                  <div className="flex items-start gap-2 pl-16 border-l border-border">
                    <ArrowRight className="size-3 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <span className="font-semibold text-foreground">EVI-204:</span>
                      <span>Telemetry Run #88219 (SHA: 0x9f8c4e...)</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right Column: Engine Blast Radius Telemetry */}
              <div className="flex flex-col justify-between gap-3 rounded-lg border border-border bg-secondary/30 p-3.5">
                <div className="flex flex-col gap-1">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
                    Deterministic Impact Engine
                  </span>
                  <p className="text-[11px] text-muted-foreground">
                    Change Request <span className="font-bold text-foreground">CR-005</span> submitted against REQ-108.
                  </p>
                </div>

                <div className="space-y-1.5 rounded-md border border-border bg-card p-2.5 text-[11px]">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Blast radius hops:</span>
                    <span className="font-semibold text-foreground">3 levels</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Downstream tests:</span>
                    <span className="font-semibold text-warning">2 affected</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Safety risks:</span>
                    <span className="font-semibold text-foreground">RSK-014 (Mitigated)</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Approval Status:</span>
                    <span className="font-semibold text-amber-500">APPROVAL_POTENTIALLY_INVALIDATED</span>
                  </div>
                </div>

                <div className="text-[11px] text-muted-foreground">
                  <span className="text-primary font-semibold">Deterministic result:</span> No guessing, no probabilistic ranking. Exactly what the graph foreign keys dictate.
                </div>
              </div>
            </div>
          </div>
        </div>
      </Shell>

      {/* 3. CORE PREVENTION MODULES SHOWCASE */}
      <Shell className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Badge variant="outline" className="self-start text-xs font-mono">
            PROBLEM PREVENTION ENGINES
          </Badge>
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            4 Core Failure Mode Prevention Features
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
            PDLC actively intervenes before poor specifications or uncoordinated changes cause flight failures.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {PREVENTION_MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <div
                key={mod.title}
                className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-5 shadow-xs transition-all hover:border-primary/50"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-5" aria-hidden="true" />
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      {mod.badge}
                    </Badge>
                  </div>
                  <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
                    {mod.tag}
                  </span>
                  <h3 className="text-base font-semibold text-foreground">{mod.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{mod.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Shell>

      {/* 4. LIVE DOMAIN METRICS STRIP */}
      <Shell>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {STATS.map((stat) => (
            <div
              key={stat.label}
              className="flex flex-col justify-between gap-2 rounded-xl border border-border bg-card p-5 shadow-xs transition-colors hover:border-primary/40"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-mono text-3xl sm:text-4xl font-bold tabular-nums tracking-tight text-foreground">
                  {stat.value}
                </span>
                <span className="size-2 rounded-full bg-primary/60" aria-hidden="true" />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-semibold text-foreground">{stat.label}</span>
                <span className="text-xs text-muted-foreground leading-snug">{stat.sub}</span>
              </div>
            </div>
          ))}
        </div>
      </Shell>

      {/* 5. LIFECYCLE PIPELINE (THE V-MODEL ON A GRAPH) */}
      <Shell className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Badge variant="outline" className="self-start text-xs font-mono">
            END-TO-END TRACEABILITY
          </Badge>
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            The Aerospace Lifecycle Pipeline
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
            From initial mission intents through system architecture, risk management, and formal airworthiness sign-off — unified on a single relational schema without disconnected tools.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {LIFECYCLE_STAGES.map((stage) => (
            <div
              key={stage.step}
              className="group relative flex flex-col justify-between gap-3 rounded-xl border border-border bg-card p-5 shadow-xs transition-all hover:border-primary/50"
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-bold text-primary">{stage.step}</span>
                <span className="rounded-md border border-border bg-secondary/50 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                  {stage.node}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <h3 className="text-base font-semibold text-foreground group-hover:text-primary transition-colors">
                  {stage.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{stage.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </Shell>

      {/* 6. INTERACTIVE LIVE BENCH / ENGINE SHOWCASE */}
      <Shell className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Badge variant="outline" className="self-start text-xs font-mono">
            LIVE ENGINE VERIFICATION
          </Badge>
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Inspect the Actual Graph Engine
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
            Not marketing mockups. Below are live, browser-rendered components interacting directly with the same domain schemas, transition tables, and safety-limit boundaries executing in the production application.
          </p>
        </div>

        <InteractiveShowcase />
      </Shell>

      {/* 7. CORE ARCHITECTURAL DIFFERENTIATORS */}
      <Shell className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Badge variant="outline" className="self-start text-xs font-mono">
            ARCHITECTURAL ADVANTAGES
          </Badge>
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Engineered for Airworthiness, Not Demos
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
            Every architectural decision inside PDLC is tailored for regulated environments where software failure is unacceptable and auditability is a legal requirement.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {DIFFERENTIATORS.map((diff) => {
            const Icon = diff.icon;
            return (
              <div
                key={diff.title}
                className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-6 shadow-xs transition-colors hover:border-primary/40"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex items-center justify-between">
                    <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Icon className="size-5" aria-hidden="true" />
                    </div>
                    <span className="font-mono text-[10px] tracking-wider text-muted-foreground">
                      {diff.tag}
                    </span>
                  </div>
                  <h3 className="text-base font-semibold text-foreground">{diff.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{diff.body}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Shell>

      {/* 8. AIRWORTHINESS COMPLIANCE STANDARDS */}
      <Shell className="flex flex-col gap-6">
        <div className="rounded-xl border border-border bg-gradient-to-br from-card via-card to-secondary/30 p-6 sm:p-8">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="flex flex-col gap-3 lg:col-span-1">
              <Badge variant="outline" className="self-start text-xs font-mono">
                REGULATORY RIGOR
              </Badge>
              <h3 className="text-xl font-bold text-foreground">
                Airworthiness & High-Reliability Standards
              </h3>
              <p className="text-sm text-muted-foreground leading-relaxed">
                PDLC provides the deterministic data modeling required to satisfy certification authorities, eliminating audit discrepancies and missing verification links.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:col-span-2">
              <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
                <span className="font-mono text-xs font-bold text-primary">DO-178C / ED-12C</span>
                <span className="text-sm font-semibold text-foreground">Airborne Systems Software</span>
                <p className="text-xs text-muted-foreground">
                  Bi-directional requirement-to-test traceability matrices and objective verification evidence.
                </p>
              </div>
              <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
                <span className="font-mono text-xs font-bold text-primary">DO-254 / ED-80</span>
                <span className="text-sm font-semibold text-foreground">Complex Airborne Electronic Hardware</span>
                <p className="text-xs text-muted-foreground">
                  Interface definitions (ICDs), subsystem boundaries, and hierarchical requirement decomposition.
                </p>
              </div>
              <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
                <span className="font-mono text-xs font-bold text-primary">ARP4754A / ARP4761</span>
                <span className="text-sm font-semibold text-foreground">Systems Engineering & Safety</span>
                <p className="text-xs text-muted-foreground">
                  FMEA, hazards, safety objectives, and mitigating design decisions tracked in one cohesive graph.
                </p>
              </div>
              <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
                <span className="font-mono text-xs font-bold text-primary">ISO 26262 & MIL-STD-882E</span>
                <span className="text-sm font-semibold text-foreground">Functional Safety & Defense</span>
                <p className="text-xs text-muted-foreground">
                  Strict hazard tracking, risk mitigation verification, and tamper-evident configuration baselines.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Shell>

      {/* 9. WHO IT'S FOR */}
      <Shell className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Badge variant="outline" className="self-start text-xs font-mono">
            ORGANIZATIONAL LENSES
          </Badge>
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Tailored for Mission-Critical Engineering Roles
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
            Every engineering discipline accesses the same underlying graph through specialized, role-tailored workflows.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCES.map((audience) => {
            const Icon = audience.icon;
            return (
              <Link
                key={audience.role}
                href={audience.href}
                className="group flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/50 hover:shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex flex-col gap-3">
                  <div className="flex size-8 items-center justify-center rounded-md bg-secondary text-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                    <Icon className="size-4" aria-hidden="true" />
                  </div>
                  <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
                    {audience.role}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{audience.cares}</p>
                </div>
                <div className="flex items-center gap-1 text-xs font-medium text-primary">
                  <span>Explore concept</span>
                  <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                </div>
              </Link>
            );
          })}
        </div>
      </Shell>

      {/* 10. DEPLOYMENT & SOVEREIGNTY */}
      <Shell className="flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <Badge variant="outline" className="self-start text-xs font-mono">
            DATA SOVEREIGNTY
          </Badge>
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Deploy Anywhere. Zero Telemetry.
          </h2>
          <p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
            Aerospace engineering and ITAR data cannot be entrusted to multi-tenant black boxes. PDLC is architected for sovereign self-hosting from day one.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {DEPLOYMENT_MODES.map((mode) => (
            <div
              key={mode.name}
              className="flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-6 shadow-xs"
            >
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <Badge variant={mode.variant} className="text-[10px] font-mono">
                    {mode.badge}
                  </Badge>
                  <Server className="size-4 text-muted-foreground" aria-hidden="true" />
                </div>
                <h3 className="text-base font-semibold text-foreground">{mode.name}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{mode.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Quick Launch Terminal */}
        <div className="rounded-xl border border-border bg-card p-6 shadow-xs">
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">Launch Self-Hosted Stack</span>
              <span className="font-mono text-xs text-muted-foreground">Docker Compose</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Unpack the production bundle and boot your local PostgreSQL 17 and PDLC platform instance:
            </p>
            <CodeBlock>{`unzip pdlc-self-hosted-bundle-v${PRODUCT_VERSION}.zip
cd pdlc-self-hosted-bundle-v${PRODUCT_VERSION}
chmod +x setup.sh && ./setup.sh`}</CodeBlock>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 text-xs text-muted-foreground">
              <span>Includes Docker Compose, automated migrations, and environment templates.</span>
              <Link href="/docs/deployment" className="font-medium text-primary hover:underline">
                View complete deployment guide →
              </Link>
            </div>
          </div>
        </div>
      </Shell>

      {/* 11. CALL TO ACTION (BOTTOM) */}
      <Shell>
        <div className="flex flex-col items-center gap-6 rounded-2xl border border-border bg-secondary/30 px-6 py-12 text-center sm:px-12 sm:py-16">
          <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Shield className="size-6" aria-hidden="true" />
          </div>

          <div className="flex flex-col gap-2 max-w-2xl">
            <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Ground Your Engineering Lifecycle on a Real Graph
            </h2>
            <p className="text-sm text-muted-foreground sm:text-base leading-relaxed">
              Eliminate compliance blindspots, spreadsheet divergence, and unverified change propagation. Run the deterministic PDLC system on your own infrastructure today.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="gap-2 px-6">
              <Link href="/sign-up">
                <span>Create an Organization</span>
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="gap-2">
              <Link href="/docs/step-by-step-guide">
                <BookOpen className="size-4 text-primary" aria-hidden="true" />
                <span>Step-by-Step Software Guide</span>
              </Link>
            </Button>
            <Button asChild variant="ghost" size="lg">
              <Link href="/docs">System documentation</Link>
            </Button>
          </div>

          <p className="text-xs text-muted-foreground">
            No credit card required. Pure open architecture. Verified on PostgreSQL 17.
          </p>
        </div>
      </Shell>
    </div>
  );
}
