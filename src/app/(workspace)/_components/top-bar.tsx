import type { AuthenticatedIdentity } from "@/domain";
import { Breadcrumbs } from "./breadcrumbs";
import { UserMenu } from "./user-menu";

/**
 * Top utility bar: the signed-in organization, the breadcrumb trail, and the
 * user menu. The organization is shown by name only — its id is an internal
 * identifier and never reaches the browser's UI.
 */
export function TopBar({ identity }: { identity: AuthenticatedIdentity }) {
  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-4 border-b border-border bg-card px-4">
      <span className="max-w-[14rem] truncate text-sm font-medium text-foreground">
        {identity.organization.name}
      </span>

      <div className="mx-1 h-5 w-px bg-border" aria-hidden="true" />

      <Breadcrumbs />

      <div className="ml-auto">
        <UserMenu identity={identity} />
      </div>
    </header>
  );
}
