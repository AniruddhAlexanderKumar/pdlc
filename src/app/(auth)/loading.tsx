import { LoadingState } from "@/components/ui/loading-state";

/** Route-segment loading UI — see the `(workspace)` group's own for why this exists. */
export default function AuthLoading() {
  return <LoadingState label="Loading…" className="py-10" />;
}
