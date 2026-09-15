import * as React from "react";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

export interface CheckboxProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** Tri-state: neither checked nor unchecked — "some but not all rows selected." */
  indeterminate?: boolean;
}

/**
 * A native `<input type="checkbox">` underneath a styled box — no Radix
 * primitive for this one. A checkbox's own accessibility (focus, `Space` to
 * toggle, `aria-checked`, label association via `id`/`htmlFor`) is free from
 * the platform; wrapping it only for a `indeterminate` visual would trade a
 * dependency for something three lines of `useEffect` already do.
 */
const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, indeterminate = false, checked, ...props }, forwardedRef) => {
    const innerRef = React.useRef<HTMLInputElement>(null);
    React.useImperativeHandle(forwardedRef, () => innerRef.current as HTMLInputElement);

    React.useEffect(() => {
      if (innerRef.current) innerRef.current.indeterminate = indeterminate;
    }, [indeterminate]);

    return (
      <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
        <input
          ref={innerRef}
          type="checkbox"
          checked={checked}
          className={cn(
            "peer size-4 shrink-0 cursor-pointer appearance-none rounded-xs border border-input bg-card",
            "checked:border-primary checked:bg-primary indeterminate:border-primary indeterminate:bg-primary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
            "disabled:cursor-not-allowed disabled:opacity-50",
            className,
          )}
          {...props}
        />
        {indeterminate ? (
          <Minus
            className="pointer-events-none absolute size-3 text-primary-foreground opacity-0 peer-indeterminate:opacity-100"
            aria-hidden="true"
          />
        ) : (
          <Check
            className="pointer-events-none absolute size-3 text-primary-foreground opacity-0 peer-checked:opacity-100"
            aria-hidden="true"
          />
        )}
      </span>
    );
  },
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
