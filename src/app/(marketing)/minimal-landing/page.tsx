import type { Metadata } from "next";
import Link from "next/link";
import { Minimal } from "lucide-react";

export const metadata: Metadata = {
  title: "PDLC Platform — Minimal",
  description: "A self-hosted, graph-native product development lifecycle system for aerospace engineering, distilled to its essential form.",
};

const CORE_VALUE_PROPOSITIONS = [
  {
    title: "Deterministic Traceability",
    description: "One real relational graph — every artifact backed by strict PostgreSQL foreign key constraints, eliminating spreadsheets and disconnected tools.",
  },
  {
    title: "Formal Certainty",
    description: "Identical input produces identical output across every execution. Traversals that hit safety limits halt and explicitly refuse — never silently returning partial answers.",
  },
  {
    title: "Airworthiness Rigor",
    description: "Zero AI by architectural mandate. In certified environments (DO-178C, DO-254), safety cases demand human accountability and mathematical proof — PDLC never infers, guesses, or hallucinates.",
  },
  {
    title: "Sovereign Security",
    description: "Self-hosted Argon2id password hashing at OWASP parameters, opaque server-side session hashes, and transactional audit logging. Your export-controlled engineering data never leaves your infrastructure.",
  },
] as const;

const AUDIENCES = [
  {
    role: "Systems Engineers",
    cares: "Maintain unbroken bidirectional traceability from high-level mission needs down to component verification, without manual spreadsheet maintenance.",
  },
  {
    role: "Airworthiness & Quality Leads",
    cares: "Produce compliance matrices for DO-178C, DO-254, and ARP4754A. Findings carry full relational audit paths rather than probabilistic approximations.",
  },
  {
    role: "Chief Engineers & Directors",
    cares: "Inspect program health, detect unlinked requirements, review change request blast radii, and track sign-off bottlenecks in real time.",
  },
] as const;

export default function MinimalLandingPage() {
  return (
    <div className="flex min-h-screen flex-col gap-8 py-12 md:py-20">
      {/* Hero Section */}      <div className="flex flex-col items-center text-center">
        <h1 className="max-w-2xl text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight text-gray-900 sm:text-7xl">
          The Deterministic Traceability Backbone for{Aerospace Engineering}
        </h1>
        <p className="mt-6 max-w-2xl text-base text-gray-500 sm:text-lg leading-relaxed">
          A self-hosted, graph-native lifecycle system that unifies requirements, decisions, verification, risks, and changes on one real relational graph. Zero AI hallucinations, zero document drift, and mathematically verified change impact analysis.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Link href="/sign-up" className="bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors">
            Create an organization
          </Link>
          <Link href="/download" className="border border-gray-300 text-gray-700 px-6 py-3 rounded-lg font-medium hover:border-primary transition-colors">
            Download self-hosted bundle
          </Link>
        </div>
      </div>

      {/* Core Value Propositions */}      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {CORE_VALUE_PROPOSITIONS.map((prop) => (
          <div
            key={prop.title}
            className="rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/40"
          >
            <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              {/* Placeholder icon - would use lucide-react icon in full implementation */}
              <svg
                className="size-5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
            </div>
            <h3 className="mt-4 text-xl font-semibold text-gray-900">{prop.title}</h3>
            <p className="mt-2 text-sm text-gray-500 leading-relaxed">{prop.description}</p>
          </div>
        ))}
      </div>

      {/* Target Audiences */}      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {AUDIENCES.map((audience) => (
          <Link
            key={audience.role}
            href="/docs/concepts"
            className="group flex flex-col justify-between gap-4 rounded-xl border border-border bg-card p-5 transition-all hover:border-primary/50 hover:shadow-xs"
          >
            <div className="flex size-8 items-center justify-center rounded-md bg-gray-100 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
              {/* Placeholder icon */}
              <svg
                className="size-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="3" y1="9" x2="21" y2="9" />
                <line x1="9" y1="21" x2="9" y2="9" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-gray-900 group-hover:text-primary transition-colors">{audience.role}</h3>
            <p className="text-xs text-gray-500 leading-relaxed">{audience.cares}</p>
            <div className="flex items-center gap-1 text-sm text-primary">
              <span>Explore concept</span>
              <svg
                className="size-3 transition-transform group-hover:translate-x-0.5"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </div>
          </Link>
        ))}
      </div>

      {/* Sovereignty Callout */}      <div
        className="rounded-2xl border border-border bg-secondary/30 px-8 py-12 text-center sm:px-12 sm:py-16"
      >
        <div className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm">
          {/* Shield placeholder */}
          <svg
            className="size-5"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="8" y1="12" x2="16" y2="12" />
            <line x1="12" y1="8" x2="12" y2="16" />
          </svg>
        </div>
        <div className="mt-4 flex flex-col items-center gap-2 max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
            Ground Your Engineering Lifecycle on a Real Graph
          </h2>
          <p className="text-sm text-gray-500 sm:text-base leading-relaxed">
            Eliminate compliance blindspots, spreadsheet divergence, and unverified change propagation. Run the deterministic PDLC system on your own infrastructure today.
          </p>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Link href="/sign-up" className="bg-primary text-primary-foreground px-6 py-3 rounded-lg font-medium hover:bg-primary/90 transition-colors">
            Create an organization
          </Link>
          <Link href="/download" className="border border-gray-300 text-gray-700 px-6 py-3 rounded-lg font-medium hover:border-primary transition-colors">
            Download self-hosted bundle
          </Link>
          <Link href="/docs" className="text-gray-500 underline hover:text-primary transition-colors">
            System documentation
          </Link>
        </div>
        <p className="mt-4 text-xs text-gray-400">No credit card required. Pure open architecture. Verified on PostgreSQL 17.</p>
      </div>
    </div>
  );
}