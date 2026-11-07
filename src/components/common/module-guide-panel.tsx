"use client";

import * as React from "react";
import { CircleHelp, X } from "lucide-react";
import { type GuidedModule, moduleGuide } from "@/domain/module-guide";
import { useStoredFlag } from "@/lib/use-stored-flag";

/** Set from Settings: every page's guide starts hidden. */
export const PAGE_GUIDES_HIDDEN_KEY = "pdlc:page-guides-hidden";

function hiddenKey(module: GuidedModule): string {
  return `pdlc:page-guide-hidden:${module}`;
}

/**
 * "What is this? Why does it matter? What should I do first?" — at the top
 * of every module, for someone who has never used a tool like this.
 *
 * Open by default, because the person who needs it most is the one who has
 * not yet learned where to switch it on. One click hides it for that page,
 * and the choice is remembered; a switch in Settings hides every page's
 * guide at once for anyone who knows their way around. Hidden, it leaves a
 * single small "What is this page?" link, so help is never more than one
 * click away and never in the way.
 *
 * The text comes from `MODULE_GUIDES`, so every page explains itself in the
 * same voice.
 */
export function ModuleGuidePanel({ module }: { module: GuidedModule }) {
  const guide = moduleGuide(module);
  const [hiddenHere, setHiddenHere] = useStoredFlag(hiddenKey(module));
  const [hiddenEverywhere] = useStoredFlag(PAGE_GUIDES_HIDDEN_KEY);
  // Reopening a page's guide while every guide is switched off in Settings
  // shows it for this visit, without overriding the reader's global choice.
  const [openedNow, setOpenedNow] = React.useState(false);

  const visible = openedNow || (!hiddenHere && !hiddenEverywhere);
  const headingId = `module-guide-${module.replace(/\W/g, "")}`;

  if (!visible) {
    return (
      <button
        type="button"
        onClick={() => {
          setOpenedNow(true);
          setHiddenHere(false);
        }}
        className="inline-flex items-center gap-1.5 self-start text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CircleHelp className="size-3.5" aria-hidden="true" />
        What is this page?
      </button>
    );
  }

  return (
    <section aria-labelledby={headingId} className="rounded-md border border-border bg-muted/30 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <h2 id={headingId} className="sr-only">
          About this page
        </h2>
        <dl className="grid flex-1 grid-cols-1 gap-3 text-sm md:grid-cols-3">
          <GuideItem label="What is this?" text={guide.what} />
          <GuideItem label="Why it matters" text={guide.why} />
          <GuideItem label="Start here" text={guide.first} />
        </dl>
        <button
          type="button"
          onClick={() => {
            setOpenedNow(false);
            setHiddenHere(true);
          }}
          aria-label="Hide this guide"
          title="Hide this guide (you can bring it back from “What is this page?”)"
          className="-mr-1 -mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden="true" />
        </button>
      </div>
      {guide.technicalName && (
        <p className="mt-2 text-xs text-muted-foreground">
          Also known as <span className="font-medium text-foreground">{guide.technicalName}</span>.
        </p>
      )}
    </section>
  );
}

function GuideItem({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="leading-relaxed text-foreground">{text}</dd>
    </div>
  );
}
