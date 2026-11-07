import type { Metadata } from "next";
import Link from "next/link";
import {
  Activity,
  BookOpen,
  CheckCircle2,
  Compass,
  FileCheck,
  GitFork,
  Handshake,
  HelpCircle,
  Lightbulb,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";
import { GUIDE_CATEGORIES } from "@/domain/step-by-step-guide-data";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocsPage } from "../_components/docs-page";

export const metadata: Metadata = {
  title: "Step-by-Step Guide",
  description: "Complete step-by-step walkthrough guide for authoring requirements, change impact simulation, stakeholder conflict resolution, and verification.",
};

const ICON_MAP = {
  Users,
  FileCheck,
  Handshake,
  HelpCircle,
  GitFork,
  Zap,
  ShieldCheck,
  Activity,
} as const;

export default function StepByStepGuidePage() {
  return (
    <DocsPage
      title="Step-by-Step Guide"
      description="Simple and straightforward click-by-click operational instructions for every core PDLC platform workflow."
      lastUpdated="2026-09-17"
      sourcePath="src/app/(marketing)/docs/step-by-step-guide/page.tsx"
    >
      <section className="flex flex-col gap-4">
        <h2>Overview & Quick Access</h2>
        <p>
          This step-by-step guide details the exact click sequences and engineering rules for all 8 core modules in the PDLC Platform.
          You can also launch the interactive in-app guide drawer anytime while signed in by clicking the <BookOpen className="inline size-4 text-primary" /> icon in the top bar.
        </p>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          {GUIDE_CATEGORIES.map((category) => {
            const IconComp = ICON_MAP[category.iconName as keyof typeof ICON_MAP] || BookOpen;
            return (
              <Card key={category.id} className="transition-all hover:border-primary/50">
                <CardHeader className="p-4 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <IconComp className="size-4" />
                    </div>
                    <Badge variant="outline" className="text-[10px]">
                      {category.badge}
                    </Badge>
                  </div>
                  <CardTitle className="mt-2 text-sm font-bold">{category.title}</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <p className="line-clamp-2 text-xs text-muted-foreground">{category.shortDescription}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      {/* Accordion list of all 8 workflows */}
      <section className="flex flex-col gap-6">
        <h2>Detailed Step-by-Step Workflows</h2>

        <Accordion type="multiple" defaultValue={["requirements", "simulator"]} className="w-full">
          {GUIDE_CATEGORIES.map((category) => {
            const IconComp = ICON_MAP[category.iconName as keyof typeof ICON_MAP] || BookOpen;

            return (
              <AccordionItem key={category.id} value={category.id} className="border border-border rounded-lg mb-4 px-4">
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3 text-left">
                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <IconComp className="size-4" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-foreground">{category.title}</span>
                        <Badge variant="secondary" className="text-[10px]">
                          {category.steps.length} Steps
                        </Badge>
                      </div>
                      <p className="text-xs font-normal text-muted-foreground">{category.shortDescription}</p>
                    </div>
                  </div>
                </AccordionTrigger>

                <AccordionContent className="pt-2 pb-4">
                  <div className="flex flex-col gap-4">
                    {/* Simple 3-step summary box */}
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-xs">
                      <div className="flex items-center gap-1.5 font-bold text-primary mb-2">
                        <Sparkles className="size-3.5" />
                        Quick Summary:
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <div className="rounded-md bg-background p-2 border border-border">
                          <strong className="text-foreground">1. What it does:</strong>
                          <p className="text-muted-foreground text-[11px] mt-0.5">{category.simpleSummary.whatItDoes}</p>
                        </div>
                        <div className="rounded-md bg-background p-2 border border-border">
                          <strong className="text-foreground">2. Where to click:</strong>
                          <p className="text-primary font-mono text-[11px] mt-0.5">{category.simpleSummary.whereToClick}</p>
                        </div>
                        <div className="rounded-md bg-background p-2 border border-border">
                          <strong className="text-foreground">3. What you get:</strong>
                          <p className="text-muted-foreground text-[11px] mt-0.5">{category.simpleSummary.whatYouGet}</p>
                        </div>
                      </div>
                    </div>

                    {category.steps.map((step) => (
                      <Card key={step.stepNumber} className="border-border/60">
                        <CardHeader className="p-4 pb-2">
                          <div className="flex items-center gap-2.5">
                            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                              {step.stepNumber}
                            </span>
                            <CardTitle className="text-sm font-semibold">{step.title}</CardTitle>
                          </div>
                        </CardHeader>
                        <CardContent className="p-4 pt-1 flex flex-col gap-2 text-xs">
                          <div className="rounded-md bg-muted/60 px-2.5 py-1.5 font-mono text-[11px] text-foreground">
                            <span className="font-semibold text-primary">Target UI Action:</span> {step.action}
                          </div>
                          <p className="text-muted-foreground leading-relaxed">{step.description}</p>

                          {step.tip && (
                            <div className="flex items-start gap-2 rounded-md border border-amber-500/20 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-400">
                              <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
                              <span><strong>Tip:</strong> {step.tip}</span>
                            </div>
                          )}

                          {step.warning && (
                            <div className="flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/10 p-2 text-[11px] text-red-700 dark:text-red-400">
                              <X className="mt-0.5 size-3.5 shrink-0 text-red-600" />
                              <span><strong>Caution:</strong> {step.warning}</span>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    ))}

                    {category.practiceScenario && (
                      <div className="mt-2 rounded-lg border border-primary/30 bg-primary/5 p-4 text-xs">
                        <div className="flex items-center gap-2 font-bold text-primary">
                          <Sparkles className="size-4" />
                          Practice Scenario: {category.practiceScenario.headline}
                        </div>
                        <p className="mt-1 text-muted-foreground font-mono text-[11px]">
                          Input: &quot;{category.practiceScenario.sampleInput}&quot;
                        </p>
                        <div className="mt-2 rounded-md bg-background p-2.5 font-mono text-[11px] text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          Expected Outcome: {category.practiceScenario.expectedOutcome}
                        </div>
                      </div>
                    )}
                  </div>
                </AccordionContent>
              </AccordionItem>
            );
          })}
        </Accordion>
      </section>

      <section className="flex flex-col gap-3">
        <h2>Launch Interactive In-App Guide</h2>
        <p className="text-sm text-muted-foreground">
          Ready to try these steps in your project workspace? Sign in and open the interactive guide from the top navigation bar.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="sm">
            <Link href="/sign-in" className="gap-1.5">
              <CheckCircle2 className="size-4" />
              Open Workspace & Sign In
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/docs/beginner-guide" className="gap-1.5">
              <Compass className="size-4" />
              View General Beginner Guide
            </Link>
          </Button>
        </div>
      </section>
    </DocsPage>
  );
}
