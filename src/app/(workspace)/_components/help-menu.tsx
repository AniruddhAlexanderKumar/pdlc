"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpenCheck, CircleHelp, Compass, LibraryBig, Sparkles } from "lucide-react";
import { guideCategoryForRoute } from "@/domain/step-by-step-guide-data";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { extractSituationContext } from "@/lib/ai/situation-context";

/**
 * One door to every form of help in the workspace.
 *
 * The top bar previously carried four separate unlabelled icons — a
 * sparkle, a book, a compass, and a question mark — opening the
 * assistant, the step-by-step guides, the onboarding tour, and the help
 * centre. Four icons that all mean "help" is not four times the help: a
 * reader had to hover each one to learn the difference, and the
 * differences were not obvious even then. A fifth affordance, a floating
 * panel pinned to the bottom-right of every page, offered shortcuts to two
 * of the same four.
 *
 * All of it is still here. It is reached through one labelled button, and
 * each option says what it is for rather than what it is called, so the
 * choice can be made without opening anything first.
 *
 * The panel opens with *where you are* at the top, from the same
 * `extractSituationContext` route table the assistant uses. That is the
 * one genuinely useful thing the floating panel did, and it costs a line
 * here rather than a permanent overlay.
 */
export function HelpMenu() {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);

  const situation = React.useMemo(
    () => extractSituationContext(pathname ?? "/dashboard"),
    [pathname],
  );

  function run(event: string) {
    setOpen(false);
    window.dispatchEvent(new Event(event));
  }

  /**
   * Opens the guide already filtered to the section covering this page,
   * falling back to its own index when no section matches — which is what
   * the removed floating panel did, and the one thing worth keeping from it.
   */
  function openGuide() {
    setOpen(false);
    const category = guideCategoryForRoute(pathname ?? "");
    window.dispatchEvent(
      category
        ? new CustomEvent("pdlc:open-step-by-step-guide", { detail: category })
        : new Event("pdlc:open-step-by-step-guide"),
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Help"
          title="Help"
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <CircleHelp className="size-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80">
        <div className="border-b border-border pb-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            You are here
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">{situation.moduleName}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{situation.summary}</p>
        </div>

        <div className="mt-2 flex flex-col">
          <HelpChoice
            icon={<Sparkles className="size-4 text-primary" aria-hidden="true" />}
            title="Explain this page"
            description="What this module is for, and what you can do next from here."
            onClick={() => run("pdlc:open-ai-assistant")}
          />
          <HelpChoice
            icon={<BookOpenCheck className="size-4" aria-hidden="true" />}
            title="Step-by-step guides"
            description="Walkthroughs for a specific task, with the real screens named."
            onClick={openGuide}
          />
          <HelpChoice
            icon={<Compass className="size-4" aria-hidden="true" />}
            title="Replay the tour"
            description="The five-minute introduction shown on your first sign-in."
            onClick={() => run("pdlc:open-onboarding-tour")}
          />
          <HelpChoice
            icon={<LibraryBig className="size-4" aria-hidden="true" />}
            title="Help centre"
            description="Concepts, task guides, and what this product deliberately does not do."
            href="/help"
            onClick={() => setOpen(false)}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * One choice. Renders as a link when it navigates and a button when it
 * opens something in place — so the browser's own affordances (middle
 * click, open in new tab) work where they make sense and are absent where
 * they would not.
 */
function HelpChoice({
  icon,
  title,
  description,
  onClick,
  href,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  href?: string;
}) {
  const className =
    "flex items-start gap-2.5 rounded-sm px-2 py-2 text-left transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  const body = (
    <>
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <span className="flex min-w-0 flex-col">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="text-xs leading-relaxed text-muted-foreground">{description}</span>
      </span>
    </>
  );

  if (href) {
    return (
      <Link href={href} onClick={onClick} className={className}>
        {body}
      </Link>
    );
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}
