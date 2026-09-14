"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, LayoutGrid, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/use-media-query";
import { MODULE_GROUPS, PROJECT_MODULES } from "../projects/_components/project-modules";
import { NAV_ITEMS } from "./nav-items";

/** Matches `/projects/{id}` at the start of a path and captures the id. */
const CURRENT_PROJECT_PATTERN = /^\/projects\/([^/]+)(?:\/|$)/;

/** Dashboard and Projects are global anchors — always shown, never rewritten. */
const GLOBAL_ITEMS = NAV_ITEMS.filter((item) => item.href === "/dashboard" || item.href === "/projects");
/** The rest (Requirements, Risks, ...) are project pickers outside a project. */
const PICKER_ITEMS = NAV_ITEMS.filter((item) => item.href !== "/dashboard" && item.href !== "/projects");

interface Entry {
  key: string;
  label: string;
  href: string;
  icon: (typeof NAV_ITEMS)[number]["icon"];
}

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
  return (
    <Link
      href={entry.href}
      title={collapsed ? entry.label : undefined}
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
      {!collapsed && <span className="truncate">{entry.label}</span>}
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
 * deliberately absent here: occasional, not daily/weekly work, reachable
 * from the project overview grid and Command Center's own sections instead
 * of permanent sidebar residency (see project-modules.ts's module ranking).
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
        <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary font-mono text-xs font-bold text-primary-foreground">
          P
        </div>
        {!collapsed && (
          <span className="truncate text-sm font-semibold tracking-tight text-foreground">
            PDLC Platform
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
              entry={{ key: item.href, label: item.label, href: item.href, icon: item.icon }}
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

            {MODULE_GROUPS.map((group) => {
              const members = PROJECT_MODULES.filter((module) => module.group === group.id);
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
                        entry={{ key: module.href, label: module.label, href, icon: module.icon }}
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
            {PICKER_ITEMS.map((item) => (
              <NavLink
                key={item.href}
                entry={{ key: item.href, label: item.label, href: item.href, icon: item.icon }}
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
