"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROJECT_MODULES } from "../../_components/project-modules";

/**
 * Persistent, project-scoped tab bar shown above every module page for one
 * project — the "always reachable without a round trip through the project
 * hub" navigation the workspace was missing. Every module a project has
 * (`PROJECT_MODULES`, the same list the project overview grid renders from)
 * gets a tab here, so nothing is only reachable via the hub anymore.
 *
 * A tab stays active on its module's detail pages too (e.g.
 * `/requirements/[requirementId]`), not just its list page — "context never
 * disappears" means the user should always see which module they are in,
 * one level down or not.
 *
 * Deliberately a scrollable strip, not a dropdown or an overflow menu: this
 * codebase has no dropdown/popover primitive at all (only Dialog exists),
 * and `overflow-x-auto` on wide content is already the established pattern
 * here (see the shared `Table` component) rather than introducing a new one.
 */
export function ProjectTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/projects/${projectId}`;

  const tabs = [
    { label: "Overview", href: "", icon: LayoutGrid },
    ...PROJECT_MODULES.map(({ label, href, icon }) => ({ label, href, icon })),
  ];

  return (
    <nav
      aria-label="Project modules"
      className="-mx-4 overflow-x-auto border-b border-border px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
    >
      <div className="flex w-max min-w-full gap-1">
        {tabs.map((tab) => {
          const href = `${base}${tab.href}`;
          const isActive = tab.href === "" ? pathname === base : pathname.startsWith(href);
          const Icon = tab.icon;
          return (
            <Link
              key={href}
              href={href}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "flex shrink-0 items-center gap-1.5 border-b-2 px-2.5 py-2.5 text-sm font-medium whitespace-nowrap transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                isActive
                  ? "border-primary text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
