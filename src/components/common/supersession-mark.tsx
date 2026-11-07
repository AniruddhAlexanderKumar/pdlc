import { History } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The one visual grammar for "superseded" across the product (§3): a table
 * cell, a matrix cell, a diagram node, and a document chain link all use
 * this same mark, so an engineer recognizes supersession instantly
 * regardless of which view they are reading it in.
 *
 * Deliberately not opacity-faded (§2: "get a designed historical treatment,
 * not opacity 0.5" — this product is about history, and a dimmed row reads
 * as disabled or de-emphasized, not as "this is the historical record").
 * The mark stays full-strength legible; only the icon + label say what
 * happened.
 */
export function SupersessionMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-sm border border-border bg-secondary px-1.5 py-0.5 text-xs font-medium text-muted-foreground",
        className,
      )}
    >
      <History className="size-3" aria-hidden="true" />
      Superseded
    </span>
  );
}

/** Row-level treatment: a left rule and slightly muted text, never opacity. */
export const SUPERSEDED_ROW_CLASS = "border-l-2 border-l-border bg-secondary/30";
