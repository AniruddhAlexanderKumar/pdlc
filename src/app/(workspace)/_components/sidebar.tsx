"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  SlidersHorizontal,
  Star,
  Waypoints,
} from "lucide-react";
import type { TerminologyLabelKey } from "@/domain";
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
 * One navigation destination, plus — for project modules only — a pin
 * toggle: a small star, revealed on hover or keyboard focus so it never
 * competes with the label at rest, that adds or removes this module from
 * the "Pinned" section without leaving the page. Removing a module
 * entirely (the other half of add/remove) is deliberately *not* here: that
 * lives on the Settings page instead, as a full checklist a reader can see
 * all of at once, rather than a click a reader could make by accident with
 * no immediately visible undo.
 */
function NavLink({
  entry,
  collapsed,
  isActive,
  emphasized = false,
  pinned,
  onTogglePin,
}: {
  entry: Entry;
  collapsed: boolean;
  isActive: boolean;
  emphasized?: boolean;
  pinned?: boolean;
  onTogglePin?: () => void;
}) {
  const Icon = entry.icon;
  const label = useModuleLabel(entry.labelKey, entry.label);
  const showPin = onTogglePin !== undefined && !collapsed;
  return (
    <div className="group/navitem relative flex items-center">
      <Link
        href={entry.href}
        title={collapsed ? label : undefined}
        aria-current={isActive ? "page" : undefined}
        className={cn(
          "flex flex-1 items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
          emphasized ? "font-semibold" : "font-medium",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          showPin && "pr-7",
          isActive
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground",
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden="true" />
        {!collapsed && <span className="truncate">{label}</span>}
      </Link>
      {showPin && (
        <button
          type="button"
          onClick={(event) => {
            // The button sits visually inside the link's row but is a real
            // sibling, not a descendant — this only guards against a click
            // also bubbling to whatever wraps both, not against navigating
            // the link itself.
            event.preventDefault();
            onTogglePin();
          }}
          aria-pressed={pinned}
          aria-label={pinned ? `Unpin ${label}` : `Pin ${label}`}
          title={pinned ? "Unpin" : "Pin to sidebar"}
          className={cn(
            "absolute right-1 flex size-6 shrink-0 items-center justify-center rounded-sm transition-opacity",
            "hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            pinned
              ? "text-primary opacity-100"
              : "text-muted-foreground opacity-0 group-hover/navitem:opacity-100 focus-visible:opacity-100",
          )}
        >
          <Star className={cn("size-3.5", pinned && "fill-current")} aria-hidden="true" />
        </button>
      )}
    </div>
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
 * The "Simplify" toggle applies that same ranking one step further: it
 * collapses every group down to its daily-tier members only (a handful of
 * links), for anyone who wants less to look at than the full six groups —
 * a real per-browser preference (localStorage), not a second navigation
 * mode with its own routes to keep in sync.
 *
 * `useNavCustomization` (see `nav-customization.ts`) layers two more
 * per-browser choices on top of that ranking, in both directions: a reader
 * can *remove* a module from every list here entirely (via the Settings
 * page's full checklist — a deliberately heavier, more visible action than
 * anything reachable from the sidebar itself), or *pin* one — including an
 * occasional-tier module like Suppliers that has no default sidebar
 * residency at all — into its own "Pinned" section, immune to what
 * Simplify would otherwise collapse. Hidden and pinned are mutually
 * exclusive by construction (see that hook), so a module rendered here is
 * never in more than one of: its normal group, Pinned, or nowhere.
 *
 * Collapses to the icon rail by default on a narrow viewport — a desktop
 * engineering tool does not need a full mobile drawer pattern, but it must
 * not permanently spend 240px of a ~375px phone viewport on navigation —
 * and stays reactive to the viewport until the user explicitly toggles it,
 * at which point their own choice wins regardless of width.
 */
function Sidebar() {
  const pathname = usePathname();
  const isNarrowViewport = useMediaQuery("(max-width: 767px)");
  const [manualCollapsed, setManualCollapsed] = React.useState<boolean | null>(null);
  const collapsed = manualCollapsed ?? isNarrowViewport;
  const currentProjectId = pathname.match(CURRENT_PROJECT_PATTERN)?.[1] ?? null;

  const [simplified, setSimplified] = useStoredFlag(SIMPLIFY_STORAGE_KEY);
  const { hidden, pinned, setPinned } = useNavCustomization();

  function toggleSimplified() {
    setSimplified(!simplified);
  }

  const pinnedModules = PROJECT_MODULES.filter(
    (module) => module.href !== ALWAYS_VISIBLE_HREF && pinned.has(module.href) && !hidden.has(module.href),
  );

  function isActiveEntry(href: string, exact: boolean): boolean {
    return exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  }

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

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-2" aria-label="Primary">
        {GLOBAL_ITEMS.map((item) => {
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

        <div className="my-1 border-t border-border" role="separator" />

        {currentProjectId ? (
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
                      pinned
                      onTogglePin={() => setPinned(module.href, false)}
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
                  (!simplified || module.tier === "daily"),
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
                        pinned={false}
                        onTogglePin={() => setPinned(module.href, true)}
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
