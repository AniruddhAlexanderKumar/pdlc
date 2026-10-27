import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowRight, CheckCircle2, ClipboardCheck, Layers, LineChart, Lock, Shield, Users } from 'lucide-react';
import { Logo } from './auth/Auth';

const CORE_VALUE_PROPOSITIONS = [
  {
    icon: Layers,
    title: 'Deterministic Traceability',
    description:
      'One real relational graph — every artifact backed by strict PostgreSQL foreign key constraints, eliminating spreadsheets and disconnected tools.'
  },
  {
    icon: CheckCircle2,
    title: 'Formal Certainty',
    description:
      'Identical input produces identical output across every execution. Traversals that hit safety limits halt and explicitly refuse — never silently returning partial answers.'
  },
  {
    icon: Shield,
    title: 'Airworthiness Rigor',
    description:
      'Zero AI by architectural mandate. In certified environments (DO-178C, DO-254), safety cases demand human accountability and mathematical proof — PDLC never infers, guesses, or hallucinates.'
  },
  {
    icon: Lock,
    title: 'Sovereign Security',
    description:
      'Self-hosted Argon2id password hashing at OWASP parameters, opaque server-side session hashes, and transactional audit logging. Your export-controlled engineering data never leaves your infrastructure.'
  }
] as const;

const AUDIENCES = [
  {
    icon: Users,
    role: 'Systems Engineers',
    cares:
      'Maintain unbroken bidirectional traceability from high-level mission needs down to component verification, without manual spreadsheet maintenance.'
  },
  {
    icon: ClipboardCheck,
    role: 'Airworthiness & Quality Leads',
    cares:
      'Produce compliance matrices for DO-178C, DO-254, and ARP4754A. Findings carry full relational audit paths rather than probabilistic approximations.'
  },
  {
    icon: LineChart,
    role: 'Chief Engineers & Directors',
    cares:
      'Inspect program health, detect unlinked requirements, review change request blast radii, and track sign-off bottlenecks in real time.'
  }
] as const;

function PrimaryCta({ children }: { children: ReactNode }) {
  return (
    <Link
      to="/signup"
      className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-6 py-3 text-sm font-medium text-white shadow-sm shadow-indigo-500/30 transition-colors hover:bg-indigo-500"
    >
      {children}
      <ArrowRight className="h-4 w-4" />
    </Link>
  );
}

function SecondaryCta({ children }: { children: ReactNode }) {
  return (
    <Link
      to="/login"
      className="inline-flex items-center rounded-lg border border-zinc-300 px-6 py-3 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-white dark:border-zinc-700 dark:text-zinc-200 dark:hover:border-zinc-600 dark:hover:bg-zinc-900"
    >
      {children}
    </Link>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-full overflow-y-auto">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-5 sm:px-8">
        <Logo />
        <nav className="flex items-center gap-2" aria-label="Account">
          <Link
            to="/login"
            className="rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Sign in
          </Link>
          <Link
            to="/signup"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            Get started
          </Link>
        </nav>
      </header>

      <main className="mx-auto flex max-w-6xl flex-col gap-20 px-4 pb-24 pt-10 sm:px-8 sm:pt-16">
        {/* Hero */}
        <section className="flex flex-col items-center text-center">
          <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight text-zinc-900 sm:text-5xl lg:text-6xl dark:text-zinc-50">
            The Deterministic Traceability Backbone for Aerospace Engineering
          </h1>
          <p className="mt-6 max-w-2xl text-base leading-relaxed text-zinc-600 sm:text-lg dark:text-zinc-400">
            A self-hosted, graph-native lifecycle system that unifies requirements, decisions, verification, risks, and
            changes on one real relational graph. Zero AI hallucinations, zero document drift, and mathematically
            verified change impact analysis.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <PrimaryCta>Create an organization</PrimaryCta>
            <SecondaryCta>Sign in to your workspace</SecondaryCta>
          </div>
        </section>

        {/* Core value propositions */}
        <section className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {CORE_VALUE_PROPOSITIONS.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-xl border border-zinc-200 bg-white p-6 transition-colors hover:border-indigo-300 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-500/40"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{description}</p>
            </div>
          ))}
        </section>

        {/* Target audiences */}
        <section>
          <h2 className="text-center text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
            Built for the people accountable for the airframe
          </h2>
          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {AUDIENCES.map(({ icon: Icon, role, cares }) => (
              <div
                key={role}
                className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                  <Icon className="h-4 w-4" />
                </div>
                <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{role}</h3>
                <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{cares}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Sovereignty callout */}
        <section className="flex flex-col items-center rounded-2xl border border-zinc-200 bg-white px-6 py-12 text-center sm:px-12 sm:py-16 dark:border-zinc-800 dark:bg-zinc-900/60">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 shadow-sm dark:bg-indigo-500/10 dark:text-indigo-400">
            <Shield className="h-5 w-5" />
          </div>
          <h2 className="mt-5 max-w-2xl text-2xl font-bold tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
            Ground Your Engineering Lifecycle on a Real Graph
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-zinc-600 sm:text-base dark:text-zinc-400">
            Eliminate compliance blindspots, spreadsheet divergence, and unverified change propagation. Run the
            deterministic PDLC system on your own infrastructure today.
          </p>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <PrimaryCta>Create an organization</PrimaryCta>
            <SecondaryCta>Sign in</SecondaryCta>
          </div>
          <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-500">
            No credit card required. Pure open architecture. Verified on PostgreSQL 17.
          </p>
        </section>
      </main>

      <footer className="border-t border-zinc-200 px-4 py-8 sm:px-8 dark:border-zinc-800">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-xs text-zinc-500 sm:flex-row">
          <span>Solution Velocity — self-hosted product development lifecycle.</span>
          <Link to="/login" className="transition-colors hover:text-zinc-900 dark:hover:text-zinc-200">
            Sign in
          </Link>
        </div>
      </footer>
    </div>
  );
}
