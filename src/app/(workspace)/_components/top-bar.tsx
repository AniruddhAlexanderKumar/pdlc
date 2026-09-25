"use client";

import Link from "next/link";
import { Settings } from "lucide-react";
import { type AuthenticatedIdentity, canViewPortfolio } from "@/domain";
import { Breadcrumbs } from "./breadcrumbs";
import { CommandPalette } from "./command-palette";
import { HelpMenu } from "./help-menu";
import { UserMenu } from "./user-menu";

/**
 * Top utility bar: the signed-in organization, the breadcrumb trail, search,
 * settings, help, and the user menu.
 *
 * Two things were removed from here. An "Express Workflows" menu listed
 * five numbered steps, the second of which linked to a simulated store
 * integration, and all five of which went to the same page when no project
 * was open. And a pulsing green "SYSTEM: NOMINAL" light that was static
 * markup: it checked nothing, and would have said "nominal" with the
 * database down. A status light that cannot turn red is not a status.
 * The project page's next-step panel now does what the menu was reaching
 * for, from real data; `/api/health` is where real system status lives.
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

      <div className="ml-auto flex shrink-0 items-center gap-2">
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
