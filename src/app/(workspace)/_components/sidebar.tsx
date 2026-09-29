"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  FolderGit2,
  Gauge,
  Home,
  type LucideIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Waypoints,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/use-media-query";
import {
  moduleForPath,
  PROJECT_SECTIONS,
  type ProjectSection,
} from "../projects/_components/project-modules";
import { useNavCustomization } from "./nav-customization";

/** Matches `/projects/{id}` at the start of a path and captures the id. Exported so the command palette can resolve the same "which project am I in" question without a second, possibly-drifting regex. */
export const CURRENT_PROJECT_PATTERN = /^\/projects\/([^/]+)(?:\/|$)/;

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
 * One of the six steps: its number in a circle where other links have an
 * icon, and — with room to show it — the plain question it answers, so a
 * newcomer can read the sidebar top to bottom as the order of the work.
 */
function StepLink({
  href,
  section,
  isActive,
  collapsed,
}: {
  href: string;
  section: ProjectSection;
  isActive: boolean;
  collapsed: boolean;
}) {
  const name = `Step ${section.step}: ${section.label} — ${section.question}`;
  return (
    <Link
      href={href}
      aria-label={name}
      title={collapsed ? name : undefined}
      aria-current={isActive ? "page" : undefined}
      className={cn(linkClasses(isActive), "items-start")}
    >
      <span
        aria-hidden="true"
        className={cn(
          "mt-px flex size-4 shrink-0 items-center justify-center rounded-full border text-[10px] font-semibold tabular-nums",
          isActive ? "border-primary bg-primary text-primary-foreground" : "border-current",
        )}
      >
        {section.step}
      </span>
      {!collapsed && (
        <span className="flex min-w-0 flex-col">
          <span className="truncate">{section.label}</span>
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
  const { hidden } = useNavCustomization();

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
        <StepLink key={section.id} href={href} section={section} isActive={isActive} collapsed={collapsed} />
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
 * Collapses to an icon rail by default on a narrow viewport — it must not
 * spend 240px of a ~375px phone screen on navigation — and stays reactive
 * to the viewport until the reader toggles it themselves.
 */
function Sidebar({ showPortfolio = false }: { showPortfolio?: boolean }) {
  const pathname = usePathname();
  const isNarrowViewport = useMediaQuery("(max-width: 767px)");
  const [manualCollapsed, setManualCollapsed] = React.useState<boolean | null>(null);
  const collapsed = manualCollapsed ?? isNarrowViewport;
  const projectId = pathname.match(CURRENT_PROJECT_PATTERN)?.[1] ?? null;
  const currentModule = moduleForPath(pathname);

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-svh shrink-0 flex-col border-r border-border bg-card transition-[width]",
        collapsed ? "w-16" : "w-60",
      )}
    >
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
            <p className="px-2.5 pt-3 text-xs text-muted-foreground">
              Open a project to see its steps here.
            </p>
          )
        )}
      </nav>

      <div className="border-t border-border p-2">
        <button
          type="button"
          onClick={() => setManualCollapsed(!collapsed)}
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

export { Sidebar };
