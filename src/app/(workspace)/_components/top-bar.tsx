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
 * Help is one button. It used to be four unlabelled icons in a row — the
 * assistant, the step-by-step guides, the onboarding tour and the help
 * centre — which asked the reader to distinguish four kinds of help by
 * pictogram before knowing what any of them contained. They now live behind
 * `HelpMenu`, which names each one by what it answers.
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

      <div className="ml-auto flex shrink-0 items-center gap-1">
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
