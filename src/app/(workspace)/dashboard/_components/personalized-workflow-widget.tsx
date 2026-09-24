"use client";

import Link from "next/link";
import {
  BookOpen,
  FileCheck,
  GitPullRequest,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useUserPersonalization, LANDING_MODULE_OPTIONS } from "@/lib/use-user-personalization";
import { useWorkflowExperience } from "@/lib/use-workflow-experience";

export function PersonalizedWorkflowWidget() {
  const { landingModule } = useUserPersonalization();
  const { isSimpleMode } = useWorkflowExperience();

  const fallbackLanding = LANDING_MODULE_OPTIONS[0] ?? { label: "Command Center", value: "/command-center", description: "" };
  const selectedLanding = LANDING_MODULE_OPTIONS.find((opt) => opt.value === landingModule) ?? fallbackLanding;

  return (
    <Card className="border-primary/20 bg-gradient-to-r from-primary/5 via-card to-card">
      <CardContent className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" aria-hidden="true" />
            <span className="text-sm font-semibold text-foreground">Personalized Workflow Mode</span>
            <Badge variant="outline" className="text-[10px] uppercase font-mono tracking-wider">
              {isSimpleMode ? "Simplified (3-Bullet)" : "Detailed Guided"}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            Landing preference: <strong className="text-foreground">{selectedLanding.label}</strong>. Straightforward shortcuts pre-configured for your browser.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.dispatchEvent(new Event("pdlc:open-step-by-step-guide"))}
            className="gap-1.5 text-xs h-8"
          >
            <BookOpen className="size-3.5 text-primary" /> Guide Drawer
          </Button>
          <Button asChild variant="ghost" size="sm" className="text-xs h-8">
            <Link href="/settings">
              Customize Layout →
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
