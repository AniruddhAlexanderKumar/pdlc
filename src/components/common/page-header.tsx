import * as React from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  /** Right-aligned actions row (buttons, filters, ...). */
  actions?: React.ReactNode;
}

/** Consistent title/description/actions header used at the top of every workspace page. */
function PageHeader({ title, description, actions, className, ...props }: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
      {...props}
    >
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold tracking-tight text-foreground">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {/*
        `flex-wrap`: found as a real horizontal page overflow — two or more
        action buttons (their own `whitespace-nowrap` base style) at a
        narrow viewport otherwise force this row wider than the screen
        instead of wrapping to a second line, on every page that passes
        more than one action here.
      */}
      {actions && <div className="flex flex-wrap shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export { PageHeader };
