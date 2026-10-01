"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import { progressDestinationHref } from "@/domain/project-progress";
import { cn } from "@/lib/utils";
import { useNavCustomization } from "../../_components/nav-customization";
import { CURRENT_PROJECT_PATTERN, sectionHref } from "../../_components/sidebar";
import { useModuleLabel } from "../../_components/terminology-context";
import {
  findProjectModule,
  moduleForPath,
  PROJECT_SECTIONS,
  type ProjectModule,
  type ProjectSection,
  sectionForModule,
  STEP_COUNT,
} from "./project-modules";

/**
 * The pages of the sidebar section you are in, as tabs above the content —
 * the other half of the sidebar-plus-tabs layout (see `Sidebar`).
 *
 * On one of the six steps it also says where you are in the work ("Step 2
 * of 6") and links straight to the next step, so the order of the work is
 * on every page, not only on the project's "Start here" panel. The last
 * step points at the release check instead, since that is where the work
 * is judged complete.
 *
 * Renders nothing where there is nothing to add: the project's own page and
 * Command Center have one page each and no step, and each is its own tab
 * set already.
 */
export function ProjectSectionTabs() {
  const pathname = usePathname();
  const { hidden } = useNavCustomization();
  const projectId = pathname.match(CURRENT_PROJECT_PATTERN)?.[1] ?? null;
  const currentModule = moduleForPath(pathname);
  const section = currentModule === null ? undefined : sectionForModule(currentModule);

  if (!projectId || currentModule === null || !section) return null;

  // A hidden page still gets its tab while you are on it — otherwise the
  // page you are looking at would have no tab to show as current.
  const tabs = section.modules
    .filter((href) => href === currentModule || !hidden.has(href))
    .map(findProjectModule)
    .filter((module): module is ProjectModule => module !== undefined);

  const isStep = section.step !== undefined;
  if (!isStep && tabs.length < 2) return null;

  return (
    <div className="-mt-2 mb-6 flex flex-col gap-2 border-b border-border">
      {isStep && <StepContext projectId={projectId} section={section} hidden={hidden} />}
      {tabs.length > 1 && (
        /*
          Scrolls sideways rather than wrapping: wrapped tabs on a phone
          stacked into a column of links, each on its own line, with the
          active underline no longer reading as "one row, this one".
        */
        <nav
          aria-label={`${section.label} pages`}
          className="-mb-px flex gap-x-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {tabs.map((module) => (
            <SectionTab
              key={module.href}
              module={module}
              href={`/projects/${projectId}${module.href}`}
              isActive={module.href === currentModule}
            />
          ))}
        </nav>
      )}
      {tabs.length <= 1 && <div className="pb-1" />}
    </div>
  );
}

function StepContext({
  projectId,
  section,
  hidden,
}: {
  projectId: string;
  section: ProjectSection;
  hidden: ReadonlySet<string>;
}) {
  const next = PROJECT_SECTIONS.filter((candidate) => candidate.step !== undefined && candidate.step > section.step!)
    .map((candidate) => ({ candidate, href: sectionHref(projectId, candidate, hidden) }))
    .find((entry) => entry.href !== null);

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-sm">
      <p className="text-muted-foreground">
        <span className="font-medium text-foreground">
          Step {section.step} of {STEP_COUNT}
        </span>{" "}
        · {section.question}
      </p>
      {next ? (
        <Link
          href={next.href!}
          className="inline-flex items-center gap-1 rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Next step: {next.candidate.label}
          <ArrowRight className="size-3.5" aria-hidden="true" />
        </Link>
      ) : (
        <Link
          href={progressDestinationHref(projectId, "release-check")}
          className="inline-flex items-center gap-1 rounded-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <CheckCircle2 className="size-3.5" aria-hidden="true" />
          Last step: run the release check
        </Link>
      )}
    </div>
  );
}

/** Its own component so `useModuleLabel` is called once per tab, never inside a `.map()` callback. */
function SectionTab({ module, href, isActive }: { module: ProjectModule; href: string; isActive: boolean }) {
  const label = useModuleLabel(module.labelKey, module.label);
  const Icon = module.icon;
  return (
    <Link
      href={href}
      aria-current={isActive ? "page" : undefined}
      title={module.description}
      className={cn(
        "flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        isActive
          ? "border-primary text-foreground"
          : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {label}
    </Link>
  );
}
