"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, Circle, CircleDot, Eye, RefreshCw } from "lucide-react";
import {
  type ProgressState,
  type ProgressStep,
  progressDestinationHref,
  progressStateLabel,
} from "@/domain/project-progress";
import { describeApiError } from "@/lib/api/client";
import { useProjectProgress } from "@/lib/api/project-progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "Start here" — the first thing on a project's page.
 *
 * Six stages, each with a state computed server-side from the project's real
 * records by the rules in `project-progress.ts`. The panel puts the one
 * suggested step in front of the reader with a single button, then shows
 * all six so the whole path is visible without becoming a checklist to fear.
 *
 * No "4 of 6" and no progress bar — see `project-progress.ts` for why a
 * ratio of stages would be a score.
 */
export function NextStepPanel({ projectId }: { projectId: string }) {
  const { state, reload } = useProjectProgress(projectId);

  if (state.phase === "loading") {
    return (
      <section
        aria-label="Start here"
        aria-busy="true"
        className="h-56 animate-pulse rounded-lg border border-border bg-card"
      />
    );
  }

  if (state.phase === "error") {
    return (
      <section
        aria-label="Start here"
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
      >
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t work out where this project stands: {describeApiError(state.error)}
        </p>
        <Button variant="outline" size="sm" onClick={reload}>
          <RefreshCw aria-hidden="true" />
          Try again
        </Button>
      </section>
    );
  }

  const { next, steps } = state.data;

  return (
    <section aria-labelledby="next-step-heading" className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex flex-col gap-4 border-b border-border bg-accent/40 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Your next step</p>
          <h2 id="next-step-heading" className="text-lg font-semibold text-foreground">
            {next.title}
            <span className="font-normal text-muted-foreground"> — {next.question}</span>
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">{next.explanation}</p>
          <ul className="flex flex-col gap-0.5 text-sm font-medium text-foreground">
            {next.facts.map((fact) => (
              <li key={fact}>{fact}</li>
            ))}
          </ul>
        </div>
        <Button asChild className="shrink-0 self-start">
          <Link href={progressDestinationHref(projectId, next.destination, next.opensForm)}>
            {next.actionLabel}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>

      <ol aria-label="All stages" className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
        {steps.map((step) => (
          <StageItem key={step.stage} step={step} projectId={projectId} isNext={step.stage === next.stage} />
        ))}
      </ol>
    </section>
  );
}

const STATE_STYLE: Readonly<Record<ProgressState, { icon: typeof Circle; className: string }>> = {
  NOT_STARTED: { icon: Circle, className: "text-muted-foreground" },
  IN_PROGRESS: { icon: CircleDot, className: "text-primary" },
  NEEDS_REVIEW: { icon: Eye, className: "text-warning" },
  READY: { icon: CheckCircle2, className: "text-success" },
};

/** A state as icon *and* words, so it never depends on colour alone. */
export function ProgressStateChip({ state }: { state: ProgressState }) {
  const { icon: Icon, className } = STATE_STYLE[state];
  return (
    <span className={cn("inline-flex items-center gap-1 text-xs font-medium", className)}>
      <Icon className="size-3.5 shrink-0" aria-hidden="true" />
      {progressStateLabel(state)}
    </span>
  );
}

function StageItem({ step, projectId, isNext }: { step: ProgressStep; projectId: string; isNext: boolean }) {
  return (
    <li
      aria-current={isNext ? "step" : undefined}
      className={cn("flex flex-col gap-1.5 bg-card p-4", isNext && "bg-accent/30")}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{step.title}</span>
        <ProgressStateChip state={step.state} />
      </div>
      <p className="text-xs text-muted-foreground">{step.question}</p>
      <p className="text-xs leading-relaxed text-foreground">{step.facts[0]}</p>
      <Link
        href={progressDestinationHref(projectId, step.destination, step.opensForm)}
        className="mt-auto self-start pt-1 text-xs font-medium text-primary underline-offset-4 hover:underline"
      >
        {step.actionLabel}
      </Link>
    </li>
  );
}
