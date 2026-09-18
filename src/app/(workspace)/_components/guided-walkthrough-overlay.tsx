"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { BookOpen, Compass, Sparkles, X, ChevronUp, ChevronDown, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";

export function GuidedWalkthroughOverlay() {
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const pathname = usePathname();

  if (isDismissed) return null;

  let tipText = "Master aerospace traceability with graph-first engineering.";
  let targetCategory = "requirements";

  if (pathname.includes("/requirements")) {
    tipText = "Author precise specs, check 12 AI quality criteria, or simulate change impact.";
    targetCategory = "requirements";
  } else if (pathname.includes("/changes")) {
    tipText = "Run change impact analysis to compute 1st/2nd/3rd order downstream blast radii.";
    targetCategory = "simulator";
  } else if (pathname.includes("/traceability")) {
    tipText = "Traverse multi-hop relationships across requirements, design items, and test plans.";
    targetCategory = "traceability";
  } else if (pathname.includes("/verification")) {
    tipText = "Assign verification methods and attach verifiable test evidence.";
    targetCategory = "verification";
  } else if (pathname.includes("/sentinel")) {
    tipText = "Monitor active surveillance alerts when upstream changes invalidate decisions.";
    targetCategory = "sentinel";
  }

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {!isMinimized ? (
        <div className="w-80 rounded-xl border border-primary/30 bg-card p-3.5 shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div className="flex items-center gap-1.5">
              <Sparkles className="size-4 text-primary" />
              <span className="text-xs font-bold text-foreground">Interactive Software Co-Pilot</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Minimize"
              >
                <ChevronDown className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setIsDismissed(true)}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                title="Close"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>

          <div className="mt-2.5 flex items-start gap-2 rounded-md bg-primary/5 p-2 text-xs text-muted-foreground border border-primary/10">
            <Lightbulb className="mt-0.5 size-3.5 shrink-0 text-primary" />
            <p className="leading-snug">{tipText}</p>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={() => {
                window.dispatchEvent(
                  new CustomEvent("pdlc:open-step-by-step-guide", { detail: targetCategory })
                );
              }}
              className="flex-1 gap-1.5 text-xs h-8"
            >
              <BookOpen className="size-3.5" /> Step Guide
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                window.dispatchEvent(new Event("pdlc:toggle-ai-assistant"));
              }}
              className="gap-1.5 text-xs h-8"
            >
              <Sparkles className="size-3.5 text-primary" /> AI Assistant
            </Button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setIsMinimized(false)}
          className="flex items-center gap-2 rounded-full border border-primary/30 bg-card px-3.5 py-1.5 text-xs font-semibold text-primary shadow-md hover:bg-primary/10 transition-colors"
        >
          <Sparkles className="size-3.5" />
          <span>Interactive Co-Pilot</span>
          <ChevronUp className="size-3.5" />
        </button>
      )}
    </div>
  );
}
