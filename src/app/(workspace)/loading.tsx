import { LoadingState } from "@/components/ui/loading-state";

/**
 * Next.js's route-segment loading UI: shown in place of `children` — the
 * sidebar, top bar and everything else in `WorkspaceLayout` stay put — for
 * as long as the next page's server work takes. Without this, a slow
 * `force-dynamic` route (every project page reads the database per request)
 * left the content area blank with no sign anything was happening.
 */
export default function WorkspaceLoading() {
  return <LoadingState label="Loading…" className="py-24" />;
}
