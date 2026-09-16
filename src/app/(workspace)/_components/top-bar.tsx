import Link from "next/link";
import { CircleHelp, Settings } from "lucide-react";
import { type AuthenticatedIdentity, canViewPortfolio } from "@/domain";
import { Breadcrumbs } from "./breadcrumbs";
import { CommandPalette } from "./command-palette";
import { UserMenu } from "./user-menu";

/**
 * Top utility bar: the signed-in organization, the breadcrumb trail, and the
 * user menu. The organization is shown by name only — its id is an internal
 * identifier and never reaches the browser's UI. The name doubles as a link
 * to the organization's own profile page (currently just its industry
 * selection) rather than adding a second place to find it.
 */
export function TopBar({ identity }: { identity: AuthenticatedIdentity }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card px-4">
      <Link
        href="/organization"
        className="max-w-[14rem] truncate rounded-sm text-sm font-medium text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {identity.organization.name}
      </Link>

      <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

      <Breadcrumbs />

      <div className="ml-auto flex items-center gap-1">
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
