"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/use-media-query";
import { PROJECT_MODULES } from "../projects/_components/project-modules";
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

/**
 * Collapsible primary navigation for the authenticated workspace shell.
 *
 * There is exactly one navigation list here, not two — it switches its own
 * contents by context rather than adding a second surface alongside it. A
 * first version of this paired the sidebar with a separate top-of-page tab
 * bar; showing the same set of destinations in two different places at once
 * read as more to navigate, not less, so this replaced that rather than
 * layering on top of it. Outside any project, the list is the 7 module
 * pickers (each an entry point to "choose a project, then open its X").
 * Once inside a project, the SAME list switches to every real module that
 * project has — reachable directly, with no trip back through the project's
 * own overview page to get from one to another.
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

  const contextEntries: Entry[] = currentProjectId
    ? [
        { key: "overview", label: "Overview", href: `/projects/${currentProjectId}`, icon: LayoutGrid },
        ...PROJECT_MODULES.map((module) => ({
          key: module.href,
          label: module.label,
          href: `/projects/${currentProjectId}${module.href}`,
          icon: module.icon,
        })),
      ]
    : PICKER_ITEMS.map((item) => ({ key: item.href, label: item.label, href: item.href, icon: item.icon }));

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
          const isActive =
            item.href === "/projects" && currentProjectId
              ? pathname === item.href
              : pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              title={collapsed ? item.label : undefined}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                "focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isActive
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}

        <div className="my-1 border-t border-border" role="separator" />

        {!collapsed && (
          <span className="px-2.5 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
            {currentProjectId ? "This project" : "Modules"}
          </span>
        )}

        {contextEntries.map((entry) => {
          // The project overview page's own href is a literal prefix of
          // every one of its module pages, so it needs an exact match —
          // the startsWith check below is what every module entry wants
          // (stay active on a detail sub-page too), but applied to
          // "Overview" it would make Overview permanently active alongside
          // whatever module the user is actually on.
          const isActive =
            entry.key === "overview"
              ? pathname === entry.href
              : pathname === entry.href || pathname.startsWith(`${entry.href}/`);
          const Icon = entry.icon;
          return (
            <Link
              key={entry.key}
              href={entry.href}
              title={collapsed ? entry.label : undefined}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
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
        })}
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
