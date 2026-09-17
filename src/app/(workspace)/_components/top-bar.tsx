"use client";

import Link from "next/link";
import { CircleHelp, Compass, Settings, Sparkles } from "lucide-react";
import { type AuthenticatedIdentity, canViewPortfolio } from "@/domain";
import { Breadcrumbs } from "./breadcrumbs";
import { CommandPalette } from "./command-palette";
import { UserMenu } from "./user-menu";

/**
 * Top utility bar: the signed-in organization, the breadcrumb trail, and the
 * user menu, plus launchers for the interactive onboarding tour & situation-aware AI.
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
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(new Event("pdlc:toggle-ai-assistant"));
          }}
          aria-label="Situation-Aware AI Assistant"
          title="Situation-Aware AI Assistant"
          className="flex size-8 items-center justify-center rounded-md text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Sparkles className="size-4" aria-hidden="true" />
        </button>

        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(new Event("pdlc:open-onboarding-tour"));
          }}
          aria-label="Interactive Onboarding Tour"
          title="Interactive Onboarding Tour"
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Compass className="size-4" aria-hidden="true" />
        </button>

        <CommandPalette showPortfolio={canViewPortfolio(identity.user.organizationRole)} />

        <Link
          href="/settings"
          aria-label="Settings"
          title="Settings"
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <Settings className="size-4" aria-hidden="true" />
        </Link>
        <Link
          href="/help"
          aria-label="Help"
          title="Help"
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <CircleHelp className="size-4" aria-hidden="true" />
        </Link>
        <UserMenu identity={identity} />
      </div>
    </header>
  );
}
