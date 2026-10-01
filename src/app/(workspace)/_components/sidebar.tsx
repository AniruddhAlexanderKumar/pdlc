"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Check,
  FolderGit2,
  Gauge,
  Home,
  LayoutGrid,
  type LucideIcon,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  Sparkles,
  Waypoints,
} from "lucide-react";
import { progressStateLabel, type ProgressStage, type ProgressState } from "@/domain/project-progress";
import { fetchProjectProgress, type ProjectProgressDto } from "@/lib/api/project-progress";
import { cn } from "@/lib/utils";
import { useStoredFlag } from "@/lib/use-stored-flag";
import { useWorkflowExperience } from "@/lib/use-workflow-experience";
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  moduleForPath,
  PROJECT_SECTIONS,
  type ProjectSection,
} from "../projects/_components/project-modules";
import { useHiddenModules } from "./nav-customization";

/** Matches `/projects/{id}` at the start of a path and captures the id. Exported so the command palette can resolve the same "which project am I in" question without a second, possibly-drifting regex. */
export const CURRENT_PROJECT_PATTERN = /^\/projects\/([^/]+)(?:\/|$)/;

/** Where the desktop rail remembers being collapsed, across reloads. */
export const SIDEBAR_COLLAPSED_KEY = "pdlc:sidebar-collapsed";

/**
 * The first page of a section this reader has not hidden, or null when
 * they have hidden all of them — then the section has nowhere to go.
 */
export function sectionHref(
  projectId: string,
  section: ProjectSection,
  hidden: ReadonlySet<string>,
): string | null {
  const first = section.modules.find((module) => !hidden.has(module));
  return first === undefined ? null : `/projects/${projectId}${first}`;
}

/**
 * Each step's state from the project's real progress, refetched on every
 * navigation inside the project — creating or approving a record happens on
 * some page, and the step it belongs to should say so by the next one.
 *
 * The previous answer stays on screen while the next one loads, so the
 * markers never blink off between pages. A failed load leaves the steps
 * unmarked rather than guessed: the markers are a hint, and the sidebar
 * works without them.
 */
function useStepProgress(projectId: string | null): ProjectProgressDto | null {
  const pathname = usePathname();
  const [snapshot, setSnapshot] = React.useState<{ projectId: string; progress: ProjectProgressDto } | null>(
    null,
  );

  React.useEffect(() => {
    if (!projectId) return;
    const controller = new AbortController();
    fetchProjectProgress(projectId, controller.signal)
      .then((progress) => setSnapshot({ projectId, progress }))
      .catch(() => {
        // Unmarked steps are the honest fallback; see above.
      });
    return () => controller.abort();
  }, [projectId, pathname]);

  return snapshot !== null && snapshot.projectId === projectId ? snapshot.progress : null;
}

const linkClasses = (isActive: boolean) =>
  cn(
    "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    isActive ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
  );

function IconLink({
  href,
  label,
  icon: Icon,
  isActive,
  collapsed,
}: {
  href: string;
  label: string;
  icon: LucideIcon;
  isActive: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      aria-current={isActive ? "page" : undefined}
      className={linkClasses(isActive)}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

/**
 * The step's marker: its number, coloured by how far along it is — a
 * check once it is ready, amber while something waits on a reviewer,
 * blue while it is being worked on. The state is also in the link's name,
 * so nothing here depends on telling the colours apart.
 */
function StepMarker({ step, state, isActive }: { step: number; state: ProgressState | null; isActive: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "mt-px flex size-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums",
        isActive
          ? "border-primary bg-primary text-primary-foreground"
          : state === "READY"
            ? "border-success bg-success text-success-foreground"
            : state === "NEEDS_REVIEW"
              ? "border-warning text-warning"
              : state === "IN_PROGRESS"
                ? "border-primary text-primary"
                : "border-current",
      )}
    >
      {state === "READY" && !isActive ? <Check className="size-2.5" strokeWidth={3} /> : step}
    </span>
  );
}

/**
 * One of the six steps: its number in a circle where other links have an
 * icon, and — with room to show it — the plain question it answers, so a
 * newcomer can read the sidebar top to bottom as the order of the work.
 * The step the project's progress says to do next is tagged "Next", which
 * is the same answer the project page's "Start here" panel gives.
 */
function StepLink({
  href,
  section,
  isActive,
  collapsed,
  state,
  isNext,
}: {
  href: string;
  section: ProjectSection;
  isActive: boolean;
  collapsed: boolean;
  state: ProgressState | null;
  isNext: boolean;
}) {
  const status = state === null ? "" : ` (${progressStateLabel(state)}${isNext ? ", next step" : ""})`;
  const name = `Step ${section.step}: ${section.label} — ${section.question}${status}`;
  return (
    <Link
      href={href}
      aria-label={name}
      title={collapsed ? name : state === null ? undefined : progressStateLabel(state)}
      aria-current={isActive ? "page" : undefined}
      className={cn(linkClasses(isActive), "items-start")}
    >
      <StepMarker step={section.step!} state={state} isActive={isActive} />
      {!collapsed && (
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-center gap-1.5">
            <span className="truncate">{section.label}</span>
            {isNext && (
              <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-primary">
                Next
              </span>
            )}
          </span>
          <span className="truncate text-xs font-normal text-muted-foreground">{section.question}</span>
        </span>
      )}
    </Link>
  );
}

function GroupLabel({ children, collapsed }: { children: React.ReactNode; collapsed: boolean }) {
  if (collapsed) return <div className="my-1 border-t border-border" role="separator" />;
  return (
    <span className="px-2.5 pb-1 pt-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
      {children}
    </span>
  );
}

/**
 * Inside a project: the places in it, not its twenty pages. Each place's
 * pages are tabs above the content (`ProjectSectionTabs`), so the sidebar
 * stays short enough to read at a glance — Overview, Command Center, the
 * six numbered steps of the work, and the tools and team behind them.
 */
function ProjectNav({
  projectId,
  currentModule,
  collapsed,
}: {
  projectId: string;
  currentModule: string | null;
  collapsed: boolean;
}) {
  const hidden = useHiddenModules();
  const progress = useStepProgress(projectId);

  const stateByStage = new Map<ProgressStage, ProgressState>(
    (progress?.steps ?? []).map((step) => [step.stage, step.state]),
  );
  // Nothing to point at once every step is ready — the release check is
  // then the last word, and it has its own link on the last step's page.
  const nextStage = progress && progress.next.state !== "READY" ? progress.next.stage : null;

  const entries = PROJECT_SECTIONS.map((section) => ({
    section,
    href: sectionHref(projectId, section, hidden),
    isActive: currentModule !== null && section.modules.includes(currentModule),
  })).filter((entry): entry is typeof entry & { href: string } => entry.href !== null);

  const places = entries.filter(({ section }) => section.id === "overview" || section.id === "command-center");
  const steps = entries.filter(({ section }) => section.step !== undefined);
  const more = entries.filter(({ section }) => section.id === "tools" || section.id === "team");

  return (
    <>
      <GroupLabel collapsed={collapsed}>This project</GroupLabel>
      {places.map(({ section, href, isActive }) => (
        <IconLink
          key={section.id}
          href={href}
          label={section.label}
          icon={section.icon!}
          isActive={isActive}
          collapsed={collapsed}
        />
      ))}

      <GroupLabel collapsed={collapsed}>Step by step</GroupLabel>
      {steps.map(({ section, href, isActive }) => (
        <StepLink
          key={section.id}
          href={href}
          section={section}
          isActive={isActive}
          collapsed={collapsed}
          state={section.stage ? (stateByStage.get(section.stage) ?? null) : null}
          isNext={section.stage !== undefined && section.stage === nextStage}
        />
      ))}

      {more.length > 0 && <GroupLabel collapsed={collapsed}>More</GroupLabel>}
      {more.map(({ section, href, isActive }) => (
        <IconLink
          key={section.id}
          href={href}
          label={section.label}
          icon={section.icon!}
          isActive={isActive}
          collapsed={collapsed}
        />
      ))}
    </>
  );
}

/** The links themselves — shared by the desktop rail and the phone drawer, so the two cannot drift apart. */
function SidebarNav({ collapsed, showPortfolio }: { collapsed: boolean; showPortfolio: boolean }) {
  const pathname = usePathname();
  const projectId = pathname.match(CURRENT_PROJECT_PATTERN)?.[1] ?? null;
  const currentModule = moduleForPath(pathname);

  return (
    <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2" aria-label="Primary">
      <IconLink
        href="/dashboard"
        label="Dashboard"
        icon={Home}
        isActive={pathname === "/dashboard" || pathname.startsWith("/dashboard/")}
        collapsed={collapsed}
      />
      <IconLink
        href="/projects"
        label="Projects"
        icon={FolderGit2}
        // Every project's own pages start with "/projects/" too — once
        // inside one, the project's places below say where you are.
        isActive={pathname === "/projects"}
        collapsed={collapsed}
      />
      {/*
        Only for a reader who can actually reach it — a member seeing an
        "Executive" link that 404s would be worse than not knowing the
        page exists, which is the same reason the page itself answers 404.
      */}
      {showPortfolio && (
        <IconLink
          href="/executive"
          label="Executive"
          icon={Gauge}
          isActive={pathname === "/executive" || pathname.startsWith("/executive/")}
          collapsed={collapsed}
        />
      )}

      {projectId ? (
        <ProjectNav projectId={projectId} currentModule={currentModule} collapsed={collapsed} />
      ) : (
        !collapsed && (
          <p className="px-2.5 pt-3 text-xs text-muted-foreground">Open a project to see its steps here.</p>
        )
      )}
    </nav>
  );
}

/**
 * The one switch between Simple view (the core of the six steps) and all
 * tools. The same preference keeps the step-by-step guide short; see
 * `useHiddenModules`. Says what it will do, not what it is, so "Show all
 * tools" reads as an action a newcomer can take without knowing the term.
 */
function SimpleViewToggle({ collapsed }: { collapsed: boolean }) {
  const { isSimpleMode, setSimpleMode } = useWorkflowExperience();
  const label = isSimpleMode ? "Show all tools" : "Simple view";
  const Icon = isSimpleMode ? LayoutGrid : Sparkles;

  return (
    <button
      type="button"
      onClick={() => setSimpleMode(!isSimpleMode)}
      title={
        collapsed
          ? label
          : isSimpleMode
            ? "Also show specialist tools: suppliers, certification, drift, Command Center…"
            : "Show only the core of each step"
      }
      aria-label={label}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors",
        "hover:bg-secondary hover:text-foreground",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {!collapsed && <span>{label}</span>}
    </button>
  );
}

function Brand({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
      {/*
        The mark is the same Waypoints glyph Traceability uses elsewhere
        in this shell — traceability across the lifecycle is this
        product's central claim, so its mark is the thing it draws.
      */}
      <div className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground">
        <Waypoints className="size-4" aria-hidden="true" />
      </div>
      {!collapsed && (
        <span className="truncate font-mono text-sm font-semibold tracking-tight text-foreground">PDLC</span>
      )}
    </div>
  );
}

/**
 * The workspace's left-hand navigation: a short list of places.
 *
 * It used to list every module at once — up to nineteen links in six
 * groups, a search box to find one of them, a "Simplify" switch to hide
 * most of them, and a pin star on each to bring one back. Every one of
 * those controls existed to cope with the length of the list. Now the
 * sidebar holds places (a project's steps, its tools, its team) and the
 * pages within the current place are tabs above the content, so there is
 * nothing to search, simplify or pin. The command palette (`Ctrl`/`Cmd`+`K`)
 * still jumps straight to any page by name.
 *
 * Outside a project there is nothing project-specific to show, so it is
 * just Dashboard and Projects (and Executive, for someone who may open it).
 *
 * From the `md` breakpoint up only. A phone used to get this as a
 * permanent 64px icon rail — a sixth of a 390px screen, on every page, for
 * icons without their names or the steps' questions. It gets the same
 * links in a drawer instead (`MobileNav`, opened from the top bar), and
 * the page gets the whole width. Collapsing the rail is remembered.
 */
function Sidebar({ showPortfolio = false }: { showPortfolio?: boolean }) {
  const [collapsed, setCollapsed] = useStoredFlag(SIDEBAR_COLLAPSED_KEY);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-svh shrink-0 flex-col border-r border-border bg-card transition-[width] md:flex",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <Brand collapsed={collapsed} />

      <SidebarNav collapsed={collapsed} showPortfolio={showPortfolio} />

      <div className="flex flex-col gap-0.5 border-t border-border p-2">
        <SimpleViewToggle collapsed={collapsed} />
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium text-muted-foreground transition-colors",
            "hover:bg-secondary hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4 shrink-0" aria-hidden="true" />
          ) : (
            <>
              <PanelLeftClose className="size-4 shrink-0" aria-hidden="true" />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}

/**
 * The sidebar on a phone: a menu button in the top bar that opens the same
 * links in a drawer from the left.
 *
 * It closes itself on navigation without an effect: "open" is stored as
 * the path it was opened on, so the moment the path changes it reads as
 * closed — tapping a link is enough, and there is no stale open drawer
 * waiting on the next page.
 */
function MobileNav({ showPortfolio = false, organizationName }: { showPortfolio?: boolean; organizationName: string }) {
  const pathname = usePathname();
  const [openedOn, setOpenedOn] = React.useState<string | null>(null);
  const open = openedOn === pathname;

  return (
    <Sheet open={open} onOpenChange={(next) => setOpenedOn(next ? pathname : null)}>
      <button
        type="button"
        onClick={() => setOpenedOn(pathname)}
        aria-label="Open navigation"
        aria-expanded={open}
        className={cn(
          "-ml-1 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors md:hidden",
          "hover:bg-secondary hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <Menu className="size-5" aria-hidden="true" />
      </button>
      <SheetContent side="left" className="max-w-[18rem] gap-0 p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">Pages in {organizationName}</SheetDescription>
        <Brand collapsed={false} />
        <Link
          href="/organization"
          className="truncate border-b border-border px-5 py-2.5 text-sm font-medium text-foreground hover:bg-secondary"
        >
          {organizationName}
        </Link>
        <SheetBody className="flex flex-col">
          <SidebarNav collapsed={false} showPortfolio={showPortfolio} />
          <div className="border-t border-border p-2">
            <SimpleViewToggle collapsed={false} />
          </div>
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}

export { MobileNav, Sidebar };
