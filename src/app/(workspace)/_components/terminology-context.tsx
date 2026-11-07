"use client";

import * as React from "react";
import {
  type TerminologyLabelKey,
  type TerminologyLabelOverrides,
  resolveTerminologyLabel,
} from "@/domain";

const TerminologyContext = React.createContext<TerminologyLabelOverrides>({});

/**
 * Makes the signed-in organization's terminology overrides available to
 * every workspace page without each one fetching its own copy.
 *
 * Seeded server-side, in `WorkspaceLayout`, from the same query that
 * resolves the session — not fetched client-side on mount. A client fetch
 * would render this product's default labels first and only swap in the
 * organization's own choice a moment later, which is exactly the kind of
 * flash `use-theme.ts`'s bootstrap script exists to avoid for the theme;
 * doing this server-side avoids it here for free instead of solving it
 * twice. `router.refresh()` after a successful save on the Organization
 * page re-runs the layout and hands this provider fresh values — see
 * `organization-profile-view.tsx`.
 */
export function TerminologyProvider({
  overrides,
  children,
}: {
  overrides: TerminologyLabelOverrides;
  children: React.ReactNode;
}) {
  return <TerminologyContext.Provider value={overrides}>{children}</TerminologyContext.Provider>;
}

export function useTerminologyOverrides(): TerminologyLabelOverrides {
  return React.useContext(TerminologyContext);
}

/**
 * The label to actually render for one overridable noun. `key` is optional
 * because callers most often have it as an optional field on a shared
 * config object (`ProjectModule.labelKey`, `NavItem.labelKey`) for entries
 * that are not overridable at all (Command Center, Members, ...) —
 * `fallback` renders unchanged for those, same as if this hook were never
 * called.
 */
export function useModuleLabel(key: TerminologyLabelKey | undefined, fallback: string): string {
  const overrides = useTerminologyOverrides();
  return key ? resolveTerminologyLabel(key, overrides) : fallback;
}
