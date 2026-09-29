"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Gauge,
  SlidersHorizontal,
  Search,
  Waypoints,
  X,
} from "lucide-react";
import type { TerminologyLabelKey } from "@/domain";
import { PROGRESS_MODULES } from "@/domain/project-progress";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/use-media-query";
import { useStoredFlag } from "@/lib/use-stored-flag";
import { MODULE_GROUPS, PROJECT_MODULES } from "../projects/_components/project-modules";
import { ALWAYS_VISIBLE_HREF, useNavCustomization } from "./nav-customization";
import { NAV_ITEMS } from "./nav-items";
import { useModuleLabel } from "./terminology-context";

/** Matches `/projects/{id}` at the start of a path and captures the id. Exported so the command palette can resolve the same "which project am I in" question without a second, possibly-drifting regex. */
export const CURRENT_PROJECT_PATTERN = /^\/projects\/([^/]+)(?:\/|$)/;

/** Exported so the Settings page (`/settings`) can surface and control the same preference — one key, one source of truth, two places to reach it. */
export const SIMPLIFY_STORAGE_KEY = "pdlc:nav-simplified";

const STAGE_HREFS: ReadonlySet<string> = new Set(PROGRESS_MODULES.map((module) => `/${module}`));

/**
 * What Simplify keeps: the modules an engineer touches daily, plus every
 * module the project page's "next step" can send you to.
 *
 * Simplify used to keep the daily tier alone — Command Center,
 * Requirements, Decisions, Risks, Issues. That left out Verification,
 * Evidence and Changes, which are exactly where stages two to four of the
 * next-step panel point. So a newcomer who simplified their sidebar, then
 * clicked "Plan checks", landed on a page their sidebar did not list. The
 * stage modules come from `PROGRESS_MODULES`, so this cannot fall out of
 * step with the panel again.
 */
export function isEssentialModule(module: { href: string; tier: string }): boolean {
  return module.tier === "daily" || STAGE_HREFS.has(module.href);
}

/** Dashboard and Projects are global anchors — always shown, never rewritten. */
const GLOBAL_ITEMS = NAV_ITEMS.filter((item) => item.href === "/dashboard" || item.href === "/projects");
/** The rest (Requirements, Risks, ...) are project pickers outside a project. */
const PICKER_ITEMS = NAV_ITEMS.filter((item) => item.href !== "/dashboard" && item.href !== "/projects");

interface Entry {
  key: string;
  label: string;
  href: string;
  icon: (typeof NAV_ITEMS)[number]["icon"];
  labelKey?: TerminologyLabelKey;
}

/**
 * One navigation destination. Pin/unpin and remove both moved here from an
 * inline hover-star on every row — a deliberately heavier action on the
 * Settings page's full checklist, alongside remove, rather than one more
 * always-present control per row. A sidebar with nineteen modules used to
 * carry nineteen near-invisible extra buttons; this is pure navigation.
 */
function NavLink({
  entry,
  collapsed,
  isActive,
  emphasized = false,
}: {
  entry: Entry;
  collapsed: boolean;
  isActive: boolean;
  emphasized?: boolean;
}) {
  const Icon = entry.icon;
  const label = useModuleLabel(entry.labelKey, entry.label);
  return (
    <Link
      href={entry.href}
      title={collapsed ? label : undefined}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
        emphasized ? "font-semibold" : "font-medium",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        isActive
          ? "bg-accent text-accent-foreground"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}

/**
 * Collapsible primary navigation for the authenticated workspace shell.
 *
 * There is exactly one navigation list here, not two — it switches its own
 * contents by context rather than adding a second surface alongside it. A
 * first version of this paired the sidebar with a separate top-of-page tab
 * bar; showing the same set of destinations in two different places at once
 * read as more to navigate, not less, so this replaced that rather than
 * layering on top of it.
 *
 * Outside any project, the list is the 7 module pickers (each an entry
 * point to "choose a project, then open its X"). Once inside a project, the
 * SAME list switches to that project's real navigation — but not a flat
 * A–Z list of all 19 modules. A flat list describes the database schema,
 * not the product: it says "nineteen separate places" when the actual claim
 * is that this system connects them and remembers why. So inside a project
 * the list is Command Center (the front door — composes ten modules'
 * attention items, computes nothing itself, and is where a signed-in
 * engineer actually lands) and Overview, followed by modules grouped by
 * what an engineer is trying to do — Understand what changed, Define what's
 * required, Decide and record why, Prove it, manage Change, Certify — never
 * by which table a record lives in. Two modules (Suppliers, Members) are
 * deliberately absent here by default: occasional, not daily/weekly work,
 * reachable from the project overview grid and Command Center's own
 * sections instead of permanent sidebar residency (see project-modules.ts's
 * module ranking) — unless a reader pins one, below.
 *
 * A live search box caps the list while the sidebar is expanded. Typing
 * queries every destination the current context could land on — the global
 * anchors, every project module including occasional-tier ones that have no
 * permanent residency, Command Center, and Overview — and flattens the
 * matches into one unambiguous Results list, so a reader who knows roughly
 * what they want ("the thing that watches decisions") never has to know
 * which group it sits in. Search is intentionally local and synchronous:
 * matching a handful of labels needs no debounce and no network — Reach for
 * the command palette when the goal is a *record*, not a module.
 *
 * The "Simplify" toggle applies the module ranking one step further: it
 * collapses every group down to its daily-tier members only (a handful of
 * links), for anyone who wants less to look at than the full six groups —
 * a real per-browser preference (localStorage), not a second navigation
 * mode with its own routes to keep in sync.
 *
 * `useNavCustomization` (see `nav-customization.ts`) layers two more
 * per-browser choices on top of that ranking, in both directions — a reader
 * can *remove* a module from every list here entirely, or *pin* one
 * (including an occasional-tier module like Suppliers that has no default
 * sidebar residency at all) into its own "Pinned" section, immune to what
 * Simplify would otherwise collapse. Both live only on the Settings page's
 * full checklist, never as a per-row control here — this sidebar renders
 * the *result* of either choice (a module missing, or a Pinned section
 * present) but never lets a reader make either choice from here, on
 * purpose: the fewer always-present controls per row, the less a project
 * with nineteen modules looks like nineteen buttons. Hidden and pinned are
 * mutually exclusive by construction (see that hook), so a module rendered
 * here is never in more than one of: its normal group, Pinned, or nowhere.
 *
 * Collapses to the icon rail by default on a narrow viewport — a desktop
 * engineering tool does not need a full mobile drawer pattern, but it must
 * not permanently spend 240px of a ~375px phone viewport on navigation —
 * and stays reactive to the viewport until the user explicitly toggles it,
 * at which point their own choice wins regardless of width.
 */
function Sidebar({ showPortfolio = false }: { showPortfolio?: boolean }) {
  const pathname = usePathname();
  const isNarrowViewport = useMediaQuery("(max-width: 767px)");
  const [manualCollapsed, setManualCollapsed] = React.useState<boolean | null>(null);
  const collapsed = manualCollapsed ?? isNarrowViewport;
  const currentProjectId = pathname.match(CURRENT_PROJECT_PATTERN)?.[1] ?? null;

  const [simplified, setSimplified] = useStoredFlag(SIMPLIFY_STORAGE_KEY);
  const { hidden, pinned } = useNavCustomization();
  const [searchQuery, setSearchQuery] = React.useState("");
  const searchInputRef = React.useRef<HTMLInputElement>(null);

  function toggleSimplified() {
    setSimplified(!simplified);
  }

  const query = searchQuery.trim().toLowerCase();

  function matchesQuery(label: string, href: string): boolean {
    return !query || label.toLowerCase().includes(query) || href.toLowerCase().includes(query);
  }

  function clearSearch() {
    setSearchQuery("");
    searchInputRef.current?.focus();
  }

  const pinnedModules = PROJECT_MODULES.filter(
    (module) => module.href !== ALWAYS_VISIBLE_HREF && pinned.has(module.href) && !hidden.has(module.href),
  );

  function isActiveEntry(href: string, exact: boolean): boolean {
    return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  }

  const globalResults = GLOBAL_ITEMS.filter((item) => matchesQuery(item.label, item.href));

  const pickerResults = PICKER_ITEMS.filter(
    (item) => !hidden.has(item.href) && matchesQuery(item.label, item.href),
  );

  const projectSearchEntries: Entry[] = React.useMemo(() => {
    if (!currentProjectId) return [];
    const pinnedEntries: Entry[] = pinnedModules.map((module) => ({
      key: `pinned:${module.href}`,
      label: module.label,
      href: `/projects/${currentProjectId}${module.href}`,
      icon: module.icon,
      labelKey: module.labelKey,
    }));
    const moduleEntries: Entry[] = PROJECT_MODULES.filter(
      (module) =>
        module.href !== ALWAYS_VISIBLE_HREF && !hidden.has(module.href) && !pinned.has(module.href),
    ).map((module) => ({
      key: module.href,
      label: module.label,
      href: `/projects/${currentProjectId}${module.href}`,
      icon: module.icon,
      labelKey: module.labelKey,
    }));
    return [
      {
        key: "command-center",
        label: "Command Center",
        href: `/projects/${currentProjectId}/command-center`,
        icon: LayoutDashboard,
      },
      { key: "overview", label: "Overview", href: `/projects/${currentProjectId}`, icon: LayoutGrid },
      ...pinnedEntries,
      ...moduleEntries,
    ];
  }, [currentProjectId, pinnedModules, hidden, pinned]);

  const projectResults =
    currentProjectId !== null
      ? projectSearchEntries.filter((entry) => matchesQuery(entry.label, entry.href))
      : [];

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-svh shrink-0 flex-col border-r border-border bg-card transition-[width]",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-3">
        {/*
          The mark is the same Waypoints glyph "Open Traceability" uses
          elsewhere in this shell, not an invented logo — traceability
          across the lifecycle is this product's one central claim, so its
          mark is the thing it actually draws, not a monogram in a box.
        */}
        <div className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground">
          <Waypoints className="size-4" aria-hidden="true" />
        </div>
        {!collapsed && (
          <span className="truncate font-mono text-sm font-semibold tracking-tight text-foreground">
            PDLC
          </span>
        )}
      </div>

      {/*
        The search box exists only in the expanded sidebar: it has no room
        in the 4rem icon rail, where every entry already carries its label
        as a tooltip and the whole point is minimal chrome.
      */}
      {!collapsed && (
        <div className="px-2 pt-2">
          <div className="flex items-center gap-2 rounded-md border border-border bg-secondary px-2.5">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              ref={searchInputRef}
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") clearSearch();
              }}
              placeholder="Search modules"
              aria-label="Search modules"
              className="h-8 w-full min-w-0 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground [&::-webkit-search-cancel-button]:hidden"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={clearSearch}
                aria-label="Clear search"
                title="Clear search"
                className="flex size-5 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </div>
        </div>
      )}

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2" aria-label="Primary">
        {globalResults.map((item) => {
          // "/projects" is a literal prefix of every project's own pages —
          // once inside one, "Overview" (below) is the specific indicator
          // for that, so "Projects" here only lights up on its own list
          // page, the same exact-match reasoning "Overview" itself needs.
          const exact = item.href === "/projects" && currentProjectId !== null;
          return (
            <NavLink
              key={item.href}
              entry={{ key: item.href, label: item.label, href: item.href, icon: item.icon, labelKey: item.labelKey }}
              collapsed={collapsed}
              isActive={isActiveEntry(item.href, exact)}
            />
          );
        })}

        {/*
          Only rendered for a reader who can actually reach it — a member
          seeing an "Executive" link that 404s would be worse than not
          knowing the page exists, which is the same reason the page
          itself answers 404 rather than 403.
        */}
        {showPortfolio && matchesQuery("Executive", "/executive") && (
          <NavLink
            entry={{ key: "/executive", label: "Executive", href: "/executive", icon: Gauge }}
            collapsed={collapsed}
            isActive={isActiveEntry("/executive", false)}
          />
        )}

        <div className="my-1 border-t border-border" role="separator" />

        {query !== "" ? (
          // Search mode: flatten every destination — global anchors above,
          // then (inside a project) every module that matches, including
          // occasional-tier ones with no permanent residency. Group headers,
          // pin toggles and Simplify all step aside so the matches read as
          // one list, not a filtered version of six sections.
          currentProjectId ? (
            <>
              {!collapsed && (
                <span className="px-2.5 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Results
                </span>
              )}
              {projectResults.length === 0 && (
                <p className="px-2.5 py-2 text-sm text-muted-foreground">
                  No modules match “{searchQuery.trim()}”.
                </p>
              )}
              {projectResults.map((entry) => (
                <NavLink
                  key={entry.key}
                  entry={entry}
                  collapsed={collapsed}
                  isActive={isActiveEntry(entry.href, entry.key === "overview")}
                />
              ))}
            </>
          ) : pickerResults.length === 0 ? (
            <p className="px-2.5 py-2 text-sm text-muted-foreground">
              No modules match “{searchQuery.trim()}”.
            </p>
          ) : (
            pickerResults.map((item) => (
              <NavLink
                key={item.href}
                entry={{ key: item.href, label: item.label, href: item.href, icon: item.icon, labelKey: item.labelKey }}
                collapsed={collapsed}
                isActive={isActiveEntry(item.href, false)}
              />
            ))
          )
        ) : currentProjectId ? (
          <>
            <NavLink
              entry={{
                key: "command-center",
                label: "Command Center",
                href: `/projects/${currentProjectId}/command-center`,
                icon: LayoutDashboard,
              }}
              collapsed={collapsed}
              isActive={isActiveEntry(`/projects/${currentProjectId}/command-center`, false)}
              emphasized
            />
            <NavLink
              entry={{
                key: "overview",
                label: "Overview",
                href: `/projects/${currentProjectId}`,
                icon: LayoutGrid,
              }}
              collapsed={collapsed}
              // The project's own href is a literal prefix of every module
              // under it — needs an exact match, or Overview would stay lit
              // alongside whatever module the user is actually on.
              isActive={isActiveEntry(`/projects/${currentProjectId}`, true)}
            />

            {pinnedModules.length > 0 && (
              <>
                <div className="my-1 border-t border-border" role="separator" />
                {!collapsed && (
                  <span className="px-2.5 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    Pinned
                  </span>
                )}
                {pinnedModules.map((module) => {
                  const href = `/projects/${currentProjectId}${module.href}`;
                  return (
                    <NavLink
                      key={module.href}
                      entry={{
                        key: module.href,
                        label: module.label,
                        href,
                        icon: module.icon,
                        labelKey: module.labelKey,
                      }}
                      collapsed={collapsed}
                      isActive={isActiveEntry(href, false)}
                    />
                  );
                })}
              </>
            )}

            <button
              type="button"
              onClick={toggleSimplified}
              title={collapsed ? (simplified ? "Show all modules" : "Simplify") : undefined}
              aria-pressed={simplified}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm font-medium text-muted-foreground transition-colors",
                "hover:bg-secondary hover:text-foreground",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
              )}
            >
              <SlidersHorizontal className="size-4 shrink-0" aria-hidden="true" />
              {!collapsed && <span className="truncate">{simplified ? "Show all modules" : "Simplify"}</span>}
            </button>

            {MODULE_GROUPS.map((group) => {
              const members = PROJECT_MODULES.filter(
                (module) =>
                  module.group === group.id &&
                  !hidden.has(module.href) &&
                  !pinned.has(module.href) &&
                  (!simplified || isEssentialModule(module)),
              );
              if (members.length === 0) return null;
              return (
                <React.Fragment key={group.id}>
                  <div className="my-1 border-t border-border" role="separator" />
                  {!collapsed && (
                    <span className="px-2.5 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                      {group.label}
                    </span>
                  )}
                  {members.map((module) => {
                    const href = `/projects/${currentProjectId}${module.href}`;
                    return (
                      <NavLink
                        key={module.href}
                        entry={{ key: module.href, label: module.label, href, icon: module.icon, labelKey: module.labelKey }}
                        collapsed={collapsed}
                        isActive={isActiveEntry(href, false)}
                      />
                    );
                  })}
                </React.Fragment>
              );
            })}
          </>
        ) : (
          <>
            {!collapsed && (
              <span className="px-2.5 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Modules
              </span>
            )}
            {PICKER_ITEMS.filter((item) => !hidden.has(item.href)).map((item) => (
              <NavLink
                key={item.href}
                entry={{ key: item.href, label: item.label, href: item.href, icon: item.icon, labelKey: item.labelKey }}
                collapsed={collapsed}
                isActive={isActiveEntry(item.href, false)}
              />
            ))}
          </>
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