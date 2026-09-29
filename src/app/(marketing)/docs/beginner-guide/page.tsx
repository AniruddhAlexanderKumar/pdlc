import type { Metadata } from "next";
import Link from "next/link";
import { BookOpen, Sparkles, Compass, ShieldCheck, GitFork, CheckCircle2 } from "lucide-react";
import { DocsPage } from "../_components/docs-page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Beginner Guide",
  description: "Comprehensive introduction to PDLC Platform concepts, graph traceability, and situation-aware tools.",
};

export default function BeginnerGuidePage() {
  return (
    <DocsPage
      title="Beginner Guide"
      description="An interactive introduction to the Product Development Life Cycle Platform."
      lastUpdated="2026-09-17"
      sourcePath="src/app/(marketing)/docs/beginner-guide/page.tsx"
    >
      <section className="flex flex-col gap-4">
        <h2>Core Engineering Principles</h2>
        <p>
          PDLC Platform is engineered for mission-critical product development in any regulated or
          complex engineering discipline — aerospace, automotive, medical devices, energy, and more.
          Instead of treating requirements, decisions, and tests as isolated text documents, PDLC connects
          them on a deterministic graph.
        </p>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center gap-3">
              <GitFork className="size-5 text-primary" />
              <div>
                <CardTitle className="text-base">Connected Graph Traceability</CardTitle>
                <CardDescription className="text-xs">Explicit relational links</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Relationships between stakeholder needs, requirements, engineering decisions, and verifications are explicit graph edges, never inferred by string matching.
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center gap-3">
              <ShieldCheck className="size-5 text-primary" />
              <div>
                <CardTitle className="text-base">Zero Invented Metrics</CardTitle>
                <CardDescription className="text-xs">No fake severity scores</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Findings report real graph hop paths and status classifications. The engine never generates arbitrary risk scores or percentages.
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="flex flex-col gap-4">
        <h2>Workspace Structure</h2>
        <p>Inside any project, your navigation is grouped by engineering lifecycle activity:</p>
        
        <ul className="flex flex-col gap-2 text-sm text-muted-foreground">
          <li>
            <strong className="text-foreground">Understand:</strong> Command Center, Traceability Matrix, Decision Sentinel, and Engineering History.
          </li>
          <li>
            <strong className="text-foreground">Define:</strong> Stakeholder Needs and Requirements specifications.
          </li>
          <li>
            <strong className="text-foreground">Decide:</strong> Engineering Decisions (trade studies, assumptions, alternatives), Design Items, and Interfaces.
          </li>
          <li>
            <strong className="text-foreground">Prove:</strong> Verification Activities, Evidence artifacts, and Execution Readiness.
          </li>
          <li>
            <strong className="text-foreground">Change:</strong> Change Requests, Baselines, and Operational Drift Assessment.
          </li>
          <li>
            <strong className="text-foreground">Certify:</strong> Certification Programs, Compliance Items, and Finding resolutions.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-4">
        <h2>Built-in Interactive & Situation-Aware Tools</h2>
        
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="flex flex-row items-center gap-3">
            <Sparkles className="size-5 text-primary" />
            <div>
              <CardTitle className="text-base">Situation-Aware AI Assistant</CardTitle>
              <CardDescription className="text-xs font-medium text-foreground">
                Context-conscious engineering co-pilot inside your workspace
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-xs text-muted-foreground">
            <p>
              The AI Assistant automatically senses your active route, active project context, current object selection, and system alerts.
              Click the <Sparkles className="inline size-3.5 text-primary" /> icon in the top utility bar anytime to ask questions, perform page analysis, or check requirement traceability gaps.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center gap-3">
            <Compass className="size-5 text-primary" />
            <div>
              <CardTitle className="text-base">Interactive First Sign-In Tour</CardTitle>
              <CardDescription className="text-xs">Guided tour built directly into the app</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-xs text-muted-foreground">
            <p>
              The interactive onboarding modal opens automatically when you sign in for the first time. You can also re-trigger the tour at any time from the <strong className="text-foreground">Help</strong> page or Top Bar.
            </p>
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Next Steps</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <CheckCircle2 className="size-4" />
            Sign in to Workspace
          </Link>
          <Link
            href="/docs/getting-started"
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3.5 py-2 text-xs font-medium text-foreground hover:bg-secondary/80"
          >
            <BookOpen className="size-4" />
            Installation & Deployment Guide
          </Link>
        </div>
      </section>
    </DocsPage>
  );
}
