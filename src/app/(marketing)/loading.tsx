import { LoadingState } from "@/components/ui/loading-state";

/** Route-segment loading UI — see the `(workspace)` group's own for why this exists. */
export default function MarketingLoading() {
  return <LoadingState label="Loading…" className="py-24 text-white" />;
}
