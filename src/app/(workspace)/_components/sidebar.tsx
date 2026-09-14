"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useMediaQuery } from "@/lib/use-media-query";
import { NAV_ITEMS } from "./nav-items";

/** Matches `/projects/{id}` at the start of a path and captures the id. */
const CURRENT_PROJECT_PATTERN = /^\/projects\/([^/]+)(?:\/|$)/;

/**
 * A module nav item (Requirements, Risks, ...) always points at the global
 * project picker (`/requirements`) by default, because outside a project
 * there is nowhere else for it to go. But while the user is already inside
 * a project, following that same link re-prompts them to pick a project
 * they are already in — a real, measured navigation defect. While inside a
 * project, rewrite it straight to that project's module instead.
 */
function resolveHref(href: string, currentProjectId: string | null): string {
  if (!currentProjectId || href === "/dashboard" || href === "/projects") return href;
  return `/projects/${currentProjectId}${href}`;
}

/**
 * Collapsible primary navigation for the authenticated workspace shell.
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
        {NAV_ITEMS.map((item) => {
          const href = resolveHref(item.href, currentProjectId);
          const isActive = pathname === href || pathname.startsWith(`${href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={href}
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
