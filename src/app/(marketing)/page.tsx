import type { Metadata } from "next";
import Link from "next/link";
import { GRAPH_EDGE_TYPES, GRAPH_NODE_TYPES } from "@/domain";
import { Button } from "@/components/ui/button";
import { Shell } from "@/components/common/shell";
import { EdgeRegistryExplorer } from "./docs/_components/edge-registry-explorer";

export const metadata: Metadata = {
  title: "PDLC Platform",
  description:
    "A self-hosted product development lifecycle system for aerospace engineering — one real graph, deterministic engines, no AI.",
};

const DIFFERENTIATORS = [
  {
    title: "One real graph",
    body: `${GRAPH_NODE_TYPES.length} node types, ${GRAPH_EDGE_TYPES.length} edge types, every relationship backed by a real foreign key — not a spreadsheet with links between tabs. Browse the actual registry below.`,
  },
  {
    title: "Deterministic engines",
    body: "Same input, same output, always — and tested for it. A traversal that hits a real limit says so and stops; it never silently returns a partial answer as if it were complete.",
  },
  {
    title: "No scores, ever",
    body: "No severity number, no confidence percentage, no color standing in for either. Every finding carries its real path back to the root and its reasoning in plain language — nothing invented to fill a gap the graph doesn't answer.",
  },
  {
    title: "No AI anywhere in the product",
    body: "Not a feature we're proud to have avoided by accident. In a regulated engineering context, a system that never infers, guesses, or generates on your behalf is the point.",
  },
  {
    title: "Self-hosted, first-party auth",
    body: "No third-party identity provider, no managed database, no external API this system calls to function. Your engineering data never leaves the PostgreSQL instance you control.",
  },
] as const;

const DEPLOYMENT_MODES = [
  {
    name: "Self-hosted",
    body: "Your infrastructure, your PostgreSQL, no outbound calls. The verified production path today — Docker Compose, documented in full.",
  },
  {
    name: "Dedicated instance",
    body: "A single-tenant instance for teams that want us to run it without sharing infrastructure with anyone else. Not yet built — stated as a direction, not a shipping product.",
  },
  {
    name: "Cloud",
    body: "Shared multi-tenant hosting for evaluation and non-controlled programs. Not yet built.",
  },
] as const;

const AUDIENCES = [
  { role: "Engineer", cares: "A real trace from a requirement to what verifies it, and what a change actually touches.", href: "/docs/concepts" },
  { role: "Engineering manager", cares: "Who was asked to review, what's outstanding, what's blocking a baseline.", href: "/docs/concepts" },
  { role: "Quality & certification lead", cares: "Compliance items mapped to real evidence, findings that carry a path, not a guess.", href: "/docs/concepts" },
  { role: "IT & security reviewer", cares: "Argon2id, opaque sessions, an audit log written in the same transaction as every mutation.", href: "/docs/security" },
] as const;

export default function MarketingHomePage() {
  return (
    <Shell className="flex flex-col gap-20 py-16">
      {/* Hero */}
      <section className="flex flex-col items-start gap-5">
        <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          A self-hosted PDLC system that keeps requirements, decisions, verification, risk, supplier,
          change, and certification data on one real graph — and tells you what a change actually affects.
        </h1>
        <p className="max-w-2xl text-base text-muted-foreground">
          When new information arrives — an errata, a supplier limitation, a field observation — most
          engineering teams have no reliable way to know which of their requirements it touches. This
          system answers that from a real, queryable graph, not a search across documents.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild size="lg">
            <Link href="/sign-up">Create an organization</Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/docs">Read the docs</Link>
          </Button>
        </div>
      </section>

      {/* What makes it different */}
      <section className="flex flex-col gap-6">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">What makes it different</h2>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {DIFFERENTIATORS.map((item) => (
            <div key={item.title} className="flex flex-col gap-1.5 border-l-2 border-border pl-4">
              <h3 className="text-sm font-semibold text-foreground">{item.title}</h3>
              <p className="text-sm text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Show the product — the real, live registry, not a screenshot */}
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">This is the actual graph</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Not a diagram drawn to illustrate a claim — this reads the same relationship registry the
            traversal engine reads. Pick a node type and see its real edges.
          </p>
        </div>
        <EdgeRegistryExplorer />
      </section>

      {/* Deployment modes */}
      <section className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Deployment</h2>
          <p className="max-w-2xl text-sm text-muted-foreground">
            A large share of the data this market holds is export-controlled. We understand that data
            legally cannot sit in a generic multi-tenant cloud with unspecified residency — self-hosted is
            not a fallback tier here, it is the verified path.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {DEPLOYMENT_MODES.map((mode) => (
            <div key={mode.name} className="flex flex-col gap-1.5 rounded-md border border-border bg-card p-4">
              <h3 className="text-sm font-semibold text-foreground">{mode.name}</h3>
              <p className="text-sm text-muted-foreground">{mode.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Security posture */}
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-card p-6">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Security posture</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Argon2id at OWASP parameters. Opaque session tokens — only a hash is ever stored. Every mutation
          writes its audit row in the same database transaction as the change itself. Two-axis authorization
          resolved server-side on every request. No compliance certification is held or implied.
        </p>
        <Button asChild variant="outline" size="sm" className="self-start">
          <Link href="/docs/security">Full security overview</Link>
        </Button>
      </section>

      {/* Who it's for */}
      <section className="flex flex-col gap-6">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Who it&apos;s for</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCES.map((audience) => (
            <Link
              key={audience.role}
              href={audience.href}
              className="flex flex-col gap-1.5 rounded-md border border-border p-4 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <h3 className="text-sm font-semibold text-foreground">{audience.role}</h3>
              <p className="text-sm text-muted-foreground">{audience.cares}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* Getting it */}
      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Getting it</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Pricing is not decided yet. Today, the honest way to get started is to run it yourself: create an
          organization, or read the deployment guide first if you want to see the whole path before signing
          up for anything.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild>
            <Link href="/sign-up">Create an organization</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/download">Download self-hosted bundle</Link>
          </Button>
        </div>
      </section>
    </Shell>
  );
}
