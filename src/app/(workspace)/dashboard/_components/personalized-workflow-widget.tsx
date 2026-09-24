"use client";

import Link from "next/link";
import {
  BookOpen,
  FileCheck,
  GitPullRequest,
  Scale,
  ShieldCheck,
  Sparkles,
  Zap,
  ArrowRight,
  ShoppingCart
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useUserPersonalization, LANDING_MODULE_OPTIONS } from "@/lib/use-user-personalization";
import { useWorkflowExperience } from "@/lib/use-workflow-experience";

export function PersonalizedWorkflowWidget() {
  const { landingModule } = useUserPersonalization();
  const { isSimpleMode, setSimpleMode } = useWorkflowExperience();

  const fallbackLanding = LANDING_MODULE_OPTIONS[0] ?? { label: "Command Center", value: "/command-center", description: "" };
  const selectedLanding = LANDING_MODULE_OPTIONS.find((opt) => opt.value === landingModule) ?? fallbackLanding;

  return (
    <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-card to-card shadow-sm">
      <CardContent className="flex flex-col gap-4 p-5">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" aria-hidden="true" />
              <span className="text-sm font-bold text-foreground">Straightforward 3-Step Workflow</span>
              <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">
                {isSimpleMode ? "Simple Mode Active" : "Detailed Mode"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              Landing preference: <strong className="text-foreground">{selectedLanding.label}</strong>. Follow 3 simple steps to complete product decisions.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSimpleMode(!isSimpleMode)}
              className="text-xs h-8 font-mono"
            >
              {isSimpleMode ? "Switch to Detailed" : "Switch to Simple (3-Step)"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.dispatchEvent(new Event("pdlc:open-step-by-step-guide"))}
              className="gap-1.5 text-xs h-8 font-mono"
            >
              <BookOpen className="size-3.5 text-primary" /> Guide Drawer
            </Button>
          </div>
        </div>

        {/* 3-Step Straightforward Action Bar */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-border">
          <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-background border border-border">
            <div className="flex items-center justify-between font-mono text-xs font-bold text-primary">
              <span className="flex items-center gap-1.5">
                <FileCheck className="size-4 text-emerald-500" /> STEP 1: DEFINE
              </span>
              <span className="text-[10px] text-muted-foreground">REQUIREMENT</span>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-1">
              Draft technical specs and run automated quality checks.
            </p>
            <Button asChild variant="ghost" size="sm" className="justify-between h-7 p-0 text-xs font-semibold text-primary hover:bg-transparent">
              <Link href="/projects">Start Requirement →</Link>
            </Button>
          </div>

          <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-background border border-border">
            <div className="flex items-center justify-between font-mono text-xs font-bold text-primary">
              <span className="flex items-center gap-1.5">
                <ShoppingCart className="size-4 text-amber-500" /> STEP 2: LINK
              </span>
              <span className="text-[10px] text-muted-foreground">EVIDENCE / STORE</span>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-1">
              Connect test logs or sync DigiKey / Amazon Store parts.
            </p>
            <Button asChild variant="ghost" size="sm" className="justify-between h-7 p-0 text-xs font-semibold text-primary hover:bg-transparent">
              <Link href="/integrations">Connect Store Part →</Link>
            </Button>
          </div>

          <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-background border border-border">
            <div className="flex items-center justify-between font-mono text-xs font-bold text-primary">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="size-4 text-purple-500" /> STEP 3: APPROVE
              </span>
              <span className="text-[10px] text-muted-foreground">TRACE IMPACT</span>
            </div>
            <p className="text-xs text-muted-foreground line-clamp-1">
              Sign off baseline decisions &amp; walk blast radius graph.
            </p>
            <Button asChild variant="ghost" size="sm" className="justify-between h-7 p-0 text-xs font-semibold text-primary hover:bg-transparent">
              <Link href="/decisions">Sign-Off &amp; Trace →</Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
