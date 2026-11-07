import * as React from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LoadingStateProps extends React.HTMLAttributes<HTMLDivElement> {
  label?: string;
  /** Renders inline (e.g. inside a button-height container) instead of as a full block panel. */
  inline?: boolean;
}

/** Standard loading indicator for async panels, tables, and route segments. */
function LoadingState({ label = "Loading…", inline = false, className, ...props }: LoadingStateProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-center justify-center gap-2 text-sm text-muted-foreground",
        inline ? "py-1" : "py-16",
        className,
      )}
      {...props}
    >
      <Loader2 className="size-4 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export { LoadingState };
