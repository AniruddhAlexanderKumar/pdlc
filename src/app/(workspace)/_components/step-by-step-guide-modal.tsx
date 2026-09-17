"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Compass,
  FileCheck,
  GitFork,
  Handshake,
  HelpCircle,
  Lightbulb,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  X,
  Zap,
} from "lucide-react";
import { GUIDE_CATEGORIES, GuideCategory, GuideStep } from "@/domain/step-by-step-guide-data";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

export function StepByStepGuideModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategoryId, setActiveCategoryId] = useState<string>("requirements");
  const [searchQuery, setSearchQuery] = useState("");
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});
  const [sandboxInput, setSandboxInput] = useState("");
  const [sandboxOutput, setSandboxOutput] = useState<string | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const handleOpen = (e: Event) => {
      setIsOpen(true);
      if ("detail" in e && typeof e.detail === "string" && e.detail) {
        setActiveCategoryId(e.detail);
      }
    };

    window.addEventListener("pdlc:open-step-by-step-guide", handleOpen);
    return () => {
      window.removeEventListener("pdlc:open-step-by-step-guide", handleOpen);
    };
  }, []);

  const activeCategory = GUIDE_CATEGORIES.find((cat) => cat.id === activeCategoryId) || GUIDE_CATEGORIES[0];

  const toggleStepCompleted = (stepKey: string) => {
    setCompletedSteps((prev) => ({
      ...prev,
      [stepKey]: !prev[stepKey],
    }));
  };

  const filteredCategories = GUIDE_CATEGORIES.filter((category) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    const matchCategory =
      category.title.toLowerCase().includes(q) ||
      category.shortDescription.toLowerCase().includes(q) ||
      category.badge.toLowerCase().includes(q);
    const matchSteps = category.steps.some(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        s.action.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q)
    );
    return matchCategory || matchSteps;
  });

  const handleRunPracticeSandbox = () => {
    setIsSimulating(true);
    setSandboxOutput(null);

    setTimeout(() => {
      setIsSimulating(false);
      if (activeCategory?.practiceScenario) {
        setSandboxOutput(activeCategory.practiceScenario.expectedOutcome);
      } else {
        setSandboxOutput("Simulation complete: Step parameters verified against PDLC knowledge graph rules.");
      }
    }, 700);
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto p-0 sm:max-w-5xl">
        <div className="flex flex-col bg-background">
          {/* Header */}
          <DialogHeader className="sticky top-0 z-20 border-b border-border bg-card p-6 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <BookOpen className="size-5" />
                </div>
                <div>
                  <DialogTitle className="text-xl font-bold">Step-by-Step Software Guide</DialogTitle>
                  <DialogDescription className="text-xs text-muted-foreground">
                    Interactive click-by-click walkthroughs for aerospace requirements, impact simulation, and compliance.
                  </DialogDescription>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  asChild
                  onClick={() => setIsOpen(false)}
                >
                  <Link href="/docs/step-by-step-guide">
                    <Compass className="mr-1.5 size-4" /> Full Documentation Page
                  </Link>
                </Button>
              </div>
            </div>

            {/* Search filter */}
            <div className="relative mt-4">
              <Search className="absolute left-3 top-2.5 size-4 text-muted-foreground" />
              <Input
                placeholder="Search workflows (e.g. 'quality inspection', 'blast radius', 'stakeholder conflict', 'verification')..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 text-sm"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-3 top-2.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
          </DialogHeader>

          {/* Main content grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 min-h-[500px]">
            {/* Left sidebar: Workflow Tabs */}
            <div className="border-b border-border bg-muted/30 p-3 md:col-span-4 md:border-b-0 md:border-r">
              <div className="mb-2 px-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Core Workflows ({filteredCategories.length})
              </div>
              <div className="flex flex-col gap-1">
                {filteredCategories.map((cat) => {
                  const IconComp = ICON_MAP[cat.iconName as keyof typeof ICON_MAP] || BookOpen;
                  const isActive = cat.id === activeCategoryId;
                  const stepsCompletedCount = cat.steps.filter((s) => completedSteps[`${cat.id}-${s.stepNumber}`]).length;

                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setActiveCategoryId(cat.id);
                        setSandboxOutput(null);
                        setSandboxInput("");
                      }}
                      className={`flex items-start gap-3 rounded-lg p-2.5 text-left transition-colors ${
                        isActive
                          ? "bg-card shadow-xs ring-1 ring-border text-foreground font-medium"
                          : "text-muted-foreground hover:bg-card/60 hover:text-foreground"
                      }`}
                    >
                      <div className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md ${
                        isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                      }`}>
                        <IconComp className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate text-xs font-semibold">{cat.title}</span>
                          {stepsCompletedCount > 0 && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                              <CheckCircle2 className="size-2.5" />
                              {stepsCompletedCount}/{cat.steps.length}
                            </span>
                          )}
                        </div>
                        <p className="line-clamp-1 text-[11px] text-muted-foreground">{cat.shortDescription}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Right content: Active Category Steps & Interactive Sandbox */}
            <div className="p-6 md:col-span-8 flex flex-col gap-6">
              {activeCategory && (
                <>
                  {/* Category Header */}
                  <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs font-semibold">
                          {activeCategory.badge}
                        </Badge>
                        <h3 className="text-lg font-bold">{activeCategory.title}</h3>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{activeCategory.shortDescription}</p>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => {
                        setIsOpen(false);
                        router.push(activeCategory.targetRoute);
                      }}
                      className="gap-1.5"
                    >
                      {activeCategory.routeLabel} <ArrowRight className="size-3.5" />
                    </Button>
                  </div>

                  {/* Steps List */}
                  <div className="flex flex-col gap-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Step-by-Step Instructions ({activeCategory.steps.length} Steps)
                    </h4>

                    {activeCategory.steps.map((step) => {
                      const stepKey = `${activeCategory.id}-${step.stepNumber}`;
                      const isDone = Boolean(completedSteps[stepKey]);

                      return (
                        <Card key={step.stepNumber} className={`transition-all ${isDone ? "border-emerald-500/30 bg-emerald-500/5" : ""}`}>
                          <CardHeader className="p-4 pb-2">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-center gap-2.5">
                                <span className={`flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                                  isDone ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground"
                                }`}>
                                  {step.stepNumber}
                                </span>
                                <CardTitle className="text-sm font-semibold">{step.title}</CardTitle>
                              </div>

                              <button
                                type="button"
                                onClick={() => toggleStepCompleted(stepKey)}
                                className={`flex items-center gap-1 rounded-sm px-2 py-1 text-xs transition-colors ${
                                  isDone
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    : "text-muted-foreground hover:bg-muted"
                                }`}
                              >
                                <CheckCircle2 className="size-3.5" />
                                {isDone ? "Completed" : "Mark Done"}
                              </button>
                            </div>
                          </CardHeader>
                          <CardContent className="p-4 pt-1 flex flex-col gap-2 text-xs">
                            <div className="rounded-md bg-muted/50 px-2.5 py-1.5 font-mono text-[11px] text-foreground">
                              <span className="font-semibold text-primary">UI Action:</span> {step.action}
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
                                <span><strong>Engineering Caution:</strong> {step.warning}</span>
                              </div>
                            )}
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>

                  {/* Interactive Practice Sandbox */}
                  {activeCategory.practiceScenario && (
                    <Card className="border-primary/40 bg-card">
                      <CardHeader className="p-4 pb-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Sparkles className="size-4 text-primary" />
                            <CardTitle className="text-xs font-bold uppercase tracking-wider text-primary">
                              Interactive Practice Sandbox
                            </CardTitle>
                          </div>
                          <Badge variant="secondary" className="text-[10px]">
                            Live Practice
                          </Badge>
                        </div>
                        <CardDescription className="text-xs">
                          {activeCategory.practiceScenario.headline}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="p-4 pt-2 flex flex-col gap-3">
                        <div className="text-xs text-muted-foreground">
                          <strong>Sample Input:</strong>
                          <div className="mt-1 rounded-md border border-border bg-muted/40 p-2 font-mono text-[11px] text-foreground">
                            {activeCategory.practiceScenario.sampleInput}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            onClick={handleRunPracticeSandbox}
                            disabled={isSimulating}
                            className="gap-1.5 text-xs"
                          >
                            <Play className="size-3.5" />
                            {isSimulating ? "Simulating Workflow..." : "Test Workflow Sandbox"}
                          </Button>
                        </div>

                        {sandboxOutput && (
                          <div className="mt-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs text-emerald-800 dark:text-emerald-300">
                            <div className="flex items-center gap-1.5 font-semibold">
                              <CheckCircle2 className="size-4 text-emerald-600" />
                              Sandbox Test Result:
                            </div>
                            <p className="mt-1 leading-relaxed font-mono text-[11px]">{sandboxOutput}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
