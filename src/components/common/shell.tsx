import * as React from "react";
import { cn } from "@/lib/utils";

/** Constrains and pads page content to a consistent max width across route groups. */
function Shell({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)} {...props} />;
}

export { Shell };
