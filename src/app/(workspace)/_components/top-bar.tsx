"use client";

import Link from "next/link";
import { type AuthenticatedIdentity, canViewPortfolio } from "@/domain";
import { Breadcrumbs } from "./breadcrumbs";
import { CommandPalette } from "./command-palette";
import { HelpMenu } from "./help-menu";
import { MobileNav } from "./sidebar";
import { UserMenu } from "./user-menu";

/**
 * Top utility bar: the signed-in organization, the breadcrumb trail, search,
 * help, and the account menu (which holds settings and sign-out). On a
 * phone it also opens the navigation drawer — see `MobileNav`.
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
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-card/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-card/80 sm:gap-4 sm:px-4">
      <MobileNav
        showPortfolio={canViewPortfolio(identity.user.organizationRole)}
        organizationName={identity.organization.name}
      />

      <Link
        href="/organization"
        className="hidden max-w-[12rem] truncate rounded-sm text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:inline"
      >
        {identity.organization.name}
      </Link>

      <div className="mx-1 hidden h-5 w-px shrink-0 bg-border lg:block" aria-hidden="true" />

      <Breadcrumbs />

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        <CommandPalette showPortfolio={canViewPortfolio(identity.user.organizationRole)} />
        <HelpMenu />

        <UserMenu identity={identity} />
      </div>
    </header>
  );
}
