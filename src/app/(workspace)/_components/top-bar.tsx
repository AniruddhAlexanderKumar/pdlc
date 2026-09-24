"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { type AuthenticatedIdentity, canViewPortfolio } from "@/domain";
import { Breadcrumbs } from "./breadcrumbs";
import { CommandPalette } from "./command-palette";
import { ExpressActionBar } from "./express-action-bar";
import { HelpMenu } from "./help-menu";
import { UserMenu } from "./user-menu";

/**
 * Top utility bar: the signed-in organization, the breadcrumb trail, search,
 * express workflows, settings, help, and the user menu.
 */
export function TopBar({ identity }: { identity: AuthenticatedIdentity }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card px-4">
      <Link
        href="/organization"
        className="hidden max-w-[12rem] truncate rounded-sm text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:inline"
      >
        {identity.organization.name}
      </Link>

      <div className="mx-1 hidden h-5 w-px shrink-0 bg-border md:block" aria-hidden="true" />

      <Breadcrumbs />

      <div className="hidden xl:flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/5 px-2.5 py-0.5 text-[11px] font-mono font-medium text-emerald-600 dark:text-emerald-400">
        <span className="relative flex size-2">
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
        </span>
        <span>SYSTEM: NOMINAL</span>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <ExpressActionBar />
        <CommandPalette showPortfolio={canViewPortfolio(identity.user.organizationRole)} />

        <Link
          href="/settings"
          aria-label="Settings"
          title="Settings"
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Settings className="size-4" aria-hidden="true" />
        </Link>

        <HelpMenu />

        <UserMenu identity={identity} />
      </div>
    </header>
  );
}
