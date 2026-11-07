"use client";

import * as React from "react";
import {
  Sparkles,
  CircleHelp,
  Compass,
  CheckCircle2,
  ChevronRight,
  ChevronLeft,
  Layers,
  ShieldCheck,
  Zap,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useStoredFlag } from "@/lib/use-stored-flag";

interface TourStep {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  content: React.ReactNode;
}

/**
 * Four short screens a first-time reader can act on: what this is for, the
 * order of the work, what the product does for you, and where help is.
 * (The first version opened with "a connected engineering graph" and a
 * "Deterministic Guarantee" — true, but nothing a newcomer could use on
 * their first day.)
 */
const TOUR_STEPS: TourStep[] = [
  {
    title: "Welcome",
    subtitle: "One place for everything about the product you are building",
    icon: <ShieldCheck className="size-8 text-primary" />,
    content: (
      <div className="flex flex-col gap-3 text-sm text-muted-foreground">
        <p>
          Keep track of a product as your team builds it: <strong className="text-foreground">what it must do</strong>,
          how it is designed, the choices you made and why, and{" "}
          <strong className="text-foreground">how you know it works</strong>.
        </p>
        <div className="rounded-md border border-border bg-secondary/50 p-3 text-xs leading-relaxed text-foreground">
          Nothing here is made up. Every warning points at a real record you can open, and nothing
          is marked done until someone actually does it.
        </div>
      </div>
    ),
  },
  {
    title: "Six steps, in order",
    subtitle: "The sidebar is your to-do list",
    icon: <Layers className="size-8 text-primary" />,
    content: (
      <div className="flex flex-col gap-3 text-sm text-muted-foreground">
        <p>
          Open a project and the sidebar shows six numbered steps:{" "}
          <strong className="text-foreground">Define</strong>, <strong className="text-foreground">Design</strong>,{" "}
          <strong className="text-foreground">Decide</strong>, <strong className="text-foreground">Verify</strong>,{" "}
          <strong className="text-foreground">Control change</strong> and{" "}
          <strong className="text-foreground">Review &amp; release</strong>. A tick means a step is done.
        </p>
        <p>
          Not sure what to do? Each project&apos;s page starts with{" "}
          <strong className="text-foreground">Your next step</strong>, and its button takes you straight there.
        </p>
      </div>
    ),
  },
  {
    title: "Let it do the busywork",
    subtitle: "Less typing, fewer clicks",
    icon: <Sparkles className="size-8 text-primary" />,
    content: (
      <div className="flex flex-col gap-3 text-sm text-muted-foreground">
        <ul className="flex flex-col gap-2">
          <li>
            <strong className="text-foreground">Numbers are automatic.</strong> Every record gets the next number
            (REQ-001, REQ-002…) — no need to invent one.
          </li>
          <li>
            <strong className="text-foreground">Paste a list.</strong> &ldquo;Add several&rdquo; on Requirements turns
            a list you already have into drafts, one per line.
          </li>
          <li>
            <strong className="text-foreground">Plan every check at once.</strong> On Verify, one button plans a check
            for each requirement that has none, already linked.
          </li>
          <li>
            <strong className="text-foreground">Simple view is on.</strong> Specialist tools stay out of the way until
            you choose <em>Show all tools</em> at the bottom of the sidebar.
          </li>
        </ul>
      </div>
    ),
  },
  {
    title: "Getting help",
    subtitle: "Guidance that follows the page you are on",
    icon: <Compass className="size-8 text-primary" />,
    content: (
      <div className="flex flex-col gap-3 text-sm text-muted-foreground">
        <p>
          Everything below is behind the <strong className="text-foreground">Help</strong> button (
          <CircleHelp className="inline size-3.5" aria-hidden="true" />) in the top bar. It opens
          knowing which page you are on.
        </p>
        <ul className="flex flex-col gap-1.5 text-xs">
          <li>
            <strong className="text-foreground">Explain this page</strong> — what it is for, and what you can do
            next from it.
          </li>
          <li>
            <strong className="text-foreground">Step-by-step guides</strong> — opens at the section covering
            wherever you are.
          </li>
          <li>
            <strong className="text-foreground">Replay the tour</strong> — this walkthrough, whenever you want it
            again.
          </li>
        </ul>
        <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-foreground">
          <Zap className="size-4 shrink-0 text-primary" />
          Press <kbd className="rounded-xs border border-border bg-background px-1.5 py-0.5 text-[11px]">Ctrl + K</kbd>{" "}
          to jump to any page by name.
        </div>
      </div>
    ),
  },
];

export function InteractiveOnboardingTour() {
  const [completed, setCompleted] = useStoredFlag("pdlc:onboarding-completed");
  const [currentStep, setCurrentStep] = React.useState(0);

  /**
   * Whether the tour shows is derived, not stored: "this reader has never
   * closed it", plus "something asked for it" (the Help menu's "Replay the
   * tour").
   *
   * **Every way of closing it counts.** An earlier version treated only
   * Finish and Skip as durable, and remembered ✕ / Escape / clicking outside
   * in component memory alone — described as "returns next sign-in". In
   * practice a reload remounts the component, so a reader who closed the
   * tour met it again on every refresh and every new tab, and could not tell
   * which of the four ways of closing it would make it stay closed. Found by
   * walking the product as a newcomer: closed on the dashboard, reopened on
   * the next page. Replaying is one click away in Help, and the tour's last
   * step says so, so closing need not be a decision anyone has to get right.
   */
  const [requested, setRequested] = React.useState(false);

  const isOpen = requested || !completed;

  const setIsOpen = React.useCallback(
    (next: boolean) => {
      setRequested(next);
      if (!next) setCompleted(true);
    },
    [setCompleted],
  );

  // Listen for manual trigger events from TopBar or Help page
  React.useEffect(() => {
    const handleOpen = () => {
      setCurrentStep(0);
      setIsOpen(true);
    };
    window.addEventListener("pdlc:open-onboarding-tour", handleOpen);
    return () => window.removeEventListener("pdlc:open-onboarding-tour", handleOpen);
  }, [setIsOpen]);

  const step = TOUR_STEPS[currentStep];
  const isFirst = currentStep === 0;
  const isLast = currentStep === TOUR_STEPS.length - 1;

  function handleComplete() {
    setCompleted(true);
    setIsOpen(false);
  }

  function handleNext() {
    if (isLast) {
      handleComplete();
    } else {
      setCurrentStep((prev) => prev + 1);
    }
  }

  function handlePrev() {
    if (!isFirst) {
      setCurrentStep((prev) => prev - 1);
    }
  }

  if (!step) return null;

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="max-w-md gap-0 p-0 overflow-hidden border-primary/30">
        {/* Header decoration */}
        <div className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-background border border-border shadow-xs">
                {step.icon}
              </div>
              <div>
                <DialogTitle className="text-base font-semibold">{step.title}</DialogTitle>
                <DialogDescription className="text-xs">{step.subtitle}</DialogDescription>
              </div>
            </div>
          </div>
        </div>

        {/* Step Body */}
        <div className="p-6">
          {step.content}

          {/* Progress Indicator */}
          <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
            <div className="flex items-center gap-1.5">
              {TOUR_STEPS.map((_, index) => (
                <button
                  key={index}
                  type="button"
                  onClick={() => setCurrentStep(index)}
                  className={`h-1.5 rounded-full transition-all ${
                    index === currentStep ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                  }`}
                  aria-label={`Go to step ${index + 1}`}
                />
              ))}
            </div>

            <span className="text-xs font-mono text-muted-foreground">
              {currentStep + 1} of {TOUR_STEPS.length}
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between bg-muted/30 px-6 py-3 border-t border-border">
          <Button
            variant="ghost"
            size="sm"
            onClick={handleComplete}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Skip tour
          </Button>

          <div className="flex items-center gap-2">
            {!isFirst && (
              <Button variant="outline" size="sm" onClick={handlePrev} className="gap-1 text-xs">
                <ChevronLeft className="size-3.5" /> Back
              </Button>
            )}
            <Button size="sm" onClick={handleNext} className="gap-1 text-xs">
              {isLast ? (
                <>
                  <CheckCircle2 className="size-3.5" /> Finish Tour
                </>
              ) : (
                <>
                  Next <ChevronRight className="size-3.5" />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
