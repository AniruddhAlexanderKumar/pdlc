import Link from "next/link";
import { ArrowRight, CircleHelp, ListChecks, Waypoints } from "lucide-react";

/**
 * The shortest honest description of how this product is meant to be used,
 * in the order you actually use it.
 *
 * This exists because the product presents nineteen modules of equal
 * visual weight and no sense of sequence — which reads as "nineteen
 * separate things to learn" rather than three moves that happen to have
 * depth behind them. Three steps, always visible, each a real link: not an
 * onboarding wizard with its own state to dismiss and re-show, and not a
 * checklist that pretends to track progress it cannot actually observe.
 */
const STEPS = [
  {
    icon: ListChecks,
    title: "Define what's required",
    body: "Requirements, the needs behind them, and the design they're allocated to.",
    href: "/projects",
    linkText: "Open a project",
  },
  {
    icon: Waypoints,
    title: "Trace it",
    body: "Every relationship is a real link, so you can follow any object to what it affects.",
    href: "/help",
    linkText: "How tracing works",
  },
  {
    icon: CircleHelp,
    title: "See what a change touches",
    body: "Change impact walks the real graph and names each object it reaches, and why.",
    href: "/help",
    linkText: "Reading an impact analysis",
  },
] as const;

export function OrientationStrip() {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold tracking-tight text-foreground">How this works</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {STEPS.map((step, index) => {
          const Icon = step.icon;
          return (
            <div key={step.title} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-secondary font-mono text-xs font-semibold text-muted-foreground">
                  {index + 1}
                </span>
                <Icon className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <span className="text-sm font-medium text-foreground">{step.title}</span>
              </div>
              <p className="text-sm text-muted-foreground">{step.body}</p>
              <Link
                href={step.href}
                className="mt-auto inline-flex w-fit items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
              >
                {step.linkText}
                <ArrowRight className="size-3" aria-hidden="true" />
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
