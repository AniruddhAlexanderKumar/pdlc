import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FilterChip } from "./data-grid-types";

/**
 * "Filter chips above the grid showing exactly what is applied, each
 * individually removable" (§2). The grid never invents what a filter
 * means — the caller hands in the chip list, already describing its own
 * active filters in plain language ("Status: Open", not a raw enum value).
 */
export function FilterChips({ chips, className }: { chips: FilterChip[]; className?: string }) {
  if (chips.length === 0) return null;

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)} role="list" aria-label="Active filters">
      {chips.map((chip) => (
        <span
          key={chip.key}
          role="listitem"
          className="inline-flex items-center gap-1 rounded-sm border border-border bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground"
        >
          {chip.label}
          <button
            type="button"
            onClick={chip.onRemove}
            aria-label={`Remove filter: ${chip.label}`}
            className="rounded-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </span>
      ))}
    </div>
  );
}
