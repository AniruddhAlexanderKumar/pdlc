"use client";

import Link from "next/link";
import { ArrowRight, Check, Circle, RefreshCw } from "lucide-react";
import type { ProgressStep } from "@/domain/project-progress";
import { describeApiError } from "@/lib/api/client";
import { useProjectProgress } from "@/lib/api/project-progress";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * "What do I do next?" — the first thing on a project's page.
 *
 * Every stage below is a fact about real rows, computed server-side by
 * `project-progress.service.ts`: whether requirements exist, how many have
 * no check, how many checks have no proof. The panel's only job is to put
 * the first unfinished stage in front of the reader with one button, and to
 * show the rest so the path is visible without being a checklist to fear.
 *
 * Deliberately shows no "2 of 4" and no progress bar. See
 * `project-progress.ts` for why a ratio of stages would be a score.
 */
export function NextStepPanel({ projectId }: { projectId: string }) {
  const { state, reload } = useProjectProgress(projectId);

  if (state.phase === "loading") {
    return (
      <section
        aria-label="What to do next"
        className="h-40 animate-pulse rounded-lg border border-border bg-card"
      />
    );
  }

  if (state.phase === "error") {
    return (
      <section
        aria-label="What to do next"
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
      >
        <p className="text-sm text-muted-foreground">
          Couldn&apos;t work out the next step: {describeApiError(state.error)}
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
    <section
      aria-labelledby="next-step-heading"
      className="overflow-hidden rounded-lg border border-border bg-card"
    >
      <div className="flex flex-col gap-4 border-b border-border bg-accent/40 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Your next step
          </p>
          <h2 id="next-step-heading" className="text-lg font-semibold text-foreground">
            {next.title}
          </h2>
          <p className="max-w-2xl text-sm text-muted-foreground">{next.explanation}</p>
          <p className="text-sm font-medium text-foreground">{next.status}</p>
        </div>
        <Button asChild className="shrink-0 self-start sm:self-center">
          <Link href={`/projects/${projectId}/${next.module}`}>
            {next.actionLabel}
            <ArrowRight aria-hidden="true" />
          </Link>
        </Button>
      </div>

      <ol className="grid grid-cols-1 divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-4 lg:divide-x">
        {steps.map((step) => (
          <StageItem
            key={step.stage}
            step={step}
            projectId={projectId}
            isNext={step.stage === next.stage}
          />
        ))}
      </ol>
    </section>
  );
}

function StageItem({
  step,
  projectId,
  isNext,
}: {
  step: ProgressStep;
  projectId: string;
  isNext: boolean;
}) {
  return (
    <li className={cn("flex flex-col gap-1.5 p-4", isNext && "bg-accent/20")}>
      <div className="flex items-center gap-2">
        {step.done ? (
          <Check className="size-4 shrink-0 text-success" aria-hidden="true" />
        ) : (
          <Circle
            className={cn("size-4 shrink-0", isNext ? "text-primary" : "text-muted-foreground/50")}
            aria-hidden="true"
          />
        )}
        <span className="text-sm font-medium text-foreground">{step.title}</span>
        <span className="sr-only">{step.done ? "(done)" : isNext ? "(next)" : "(not yet)"}</span>
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">{step.status}</p>
      <Link
        href={`/projects/${projectId}/${step.module}`}
        className="mt-auto self-start text-xs font-medium text-primary underline-offset-4 hover:underline"
      >
        {step.actionLabel}
      </Link>
    </li>
  );
}
