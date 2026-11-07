import * as React from "react";
import { cn } from "@/lib/utils";

export interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  /** Renders a required marker that is also announced to screen readers. */
  required?: boolean;
}

const Label = React.forwardRef<HTMLLabelElement, LabelProps>(
  ({ className, required = false, children, ...props }, ref) => (
    <label
      ref={ref}
      className={cn("text-sm font-medium leading-none text-foreground", className)}
      {...props}
    >
      {children}
      {required && (
        <span className="ml-0.5 text-destructive">
          <span aria-hidden="true">*</span>
          <span className="sr-only"> (required)</span>
        </span>
      )}
    </label>
  ),
);
Label.displayName = "Label";

export { Label };
