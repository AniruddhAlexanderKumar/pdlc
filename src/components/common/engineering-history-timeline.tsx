import Link from "next/link";
import { History } from "lucide-react";
import type { HistoryEventDto } from "@/lib/api/engineering-history";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatIsoDate } from "@/lib/utils";

/**
 * The one reusable presentation for a chronological engineering-event
 * stream — used by both the project-level Engineering History workspace and
 * every object-level history page, so a reader sees the same shape either
 * way. Display only: nothing here fetches, filters, or paginates: the
 * caller decides what events to pass in.
 *
 * Every event already carries its own deterministic label and detail
 * string (`engineering-history.service.ts`) — there is no summarization or
 * generated prose here, only formatting.
 */
export function EngineeringHistoryTimeline({
  title = "Timeline",
  description,
  events,
  emptyTitle = "No history recorded yet",
  emptyDescription = "Nothing has been recorded against this scope.",
}: {
  title?: string;
  description?: string;
  events: HistoryEventDto[];
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4" aria-hidden="true" />
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <EmptyState icon={<History aria-hidden="true" />} title={emptyTitle} description={emptyDescription} />
        ) : (
          <ol className="flex flex-col divide-y divide-border">
            {events.map((event) => (
              <li key={event.key} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{event.sourceModule.replaceAll("_", " ")}</Badge>
                    <span className="text-sm font-medium text-foreground">{event.label}</span>
                    {event.sourceIdentifier && (
                      <span className="font-mono text-xs text-muted-foreground">{event.sourceIdentifier}</span>
                    )}
                  </div>
                  <span className="min-w-0 truncate text-xs text-muted-foreground">
                    {event.sourceLabel}
                    {event.detail ? ` · ${event.detail}` : ""}
                    {" · "}
                    {event.actorName ?? "System"}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="whitespace-nowrap font-mono text-xs text-muted-foreground" title={event.timestamp}>
                    {formatIsoDate(event.timestamp)}
                  </span>
                  {event.href && (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={event.href}>Open</Link>
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
