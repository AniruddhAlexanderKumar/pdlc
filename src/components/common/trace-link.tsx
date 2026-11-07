import Link from "next/link";
import { Waypoints } from "lucide-react";
import type { GraphNodeType } from "@/domain";
import { Button } from "@/components/ui/button";

/**
 * "Open in Traceability" — one interaction from any object's detail page to
 * its place in the full engineering graph, not just the handful of relation
 * types a module's own curated traceability panel shows. Deep-links straight
 * to the object as the graph root (see `traceability-view.tsx`'s
 * `readLinkedRoot`), passing identifier/label along so the destination never
 * has to re-fetch what this page already has in hand.
 */
export function TraceLink({
  projectId,
  type,
  id,
  identifier,
  label,
}: {
  projectId: string;
  type: GraphNodeType;
  id: string;
  identifier: string | null;
  label: string;
}) {
  const query = new URLSearchParams({ type, id, label });
  if (identifier) query.set("identifier", identifier);

  return (
    <Button asChild variant="outline">
      <Link href={`/projects/${projectId}/traceability?${query.toString()}`}>
        <Waypoints aria-hidden="true" />
        Trace
      </Link>
    </Button>
  );
}
