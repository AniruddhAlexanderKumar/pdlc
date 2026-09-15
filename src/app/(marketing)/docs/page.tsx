import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DOCS_NAV } from "./_components/docs-nav";

export const metadata: Metadata = {
  title: "Documentation",
  description: "PDLC Platform documentation: install, concepts, deployment, and security.",
};

const DESCRIPTIONS: Record<string, string> = {
  "Getting started": "Install, first sign-in, creating a project, the seeded demo.",
  Concepts: "The graph, determinism, why there are no scores — with two live, interactive explorers over real product data.",
  Deployment: "Docker, the self-hosted bundle, environment variables, backups.",
  Security: "Auth model, session handling, authorization, audit logging.",
  "Known limitations": "Stated plainly, sourced from the same document engineering reads.",
  "Release notes": "What changed, by version.",
};

export default function DocsIndexPage() {
  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Documentation</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Ships inside the application itself — an air-gapped, self-hosted install has this whole section with
          no internet connection required, because it is the same build.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {DOCS_NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className="group flex flex-col gap-1 rounded-md border border-border bg-card p-4 transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              {item.title}
              <ArrowRight className="size-3.5 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
            <span className="text-xs text-muted-foreground">{DESCRIPTIONS[item.title]}</span>
          </Link>
        ))}
      </div>

      <p className="max-w-2xl text-xs text-muted-foreground">
        Not yet written: a page per module and per engine, an administration guide, and a troubleshooting
        section. Concepts and Deployment cover the same ground at a summary level in the meantime — this line
        stays here until those pages exist, rather than linking to pages that are not there.
      </p>
    </div>
  );
}
