"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

/** Opaque record ids (cuid) — long, unbroken, lowercase alphanumeric. */
const OPAQUE_ID_PATTERN = /^[a-z0-9]{16,}$/;

function labelForSegment(segment: string): string {
  const match = NAV_ITEMS.find((item) => item.href === `/${segment}`);
  if (match) return match.label;

  // A raw 25-character cuid in the trail is noise; show a short prefix so the
  // crumb stays identifiable without dominating the bar.
  if (OPAQUE_ID_PATTERN.test(segment)) {
    return `${segment.slice(0, 8)}…`;
  }

  return segment
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/** Responsive breadcrumb trail derived from the current URL path. */
function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center text-sm text-muted-foreground"
    >
      <Link
        href="/dashboard"
        className={cn(
          "flex items-center rounded-sm hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
        aria-label="Dashboard home"
      >
        <Home className="size-3.5" aria-hidden="true" />
      </Link>
      {segments.map((segment, index) => {
        const href = `/${segments.slice(0, index + 1).join("/")}`;
        const isLast = index === segments.length - 1;
        return (
          <span key={href} className="flex min-w-0 items-center">
            <ChevronRight className="mx-1 size-3.5 shrink-0" aria-hidden="true" />
            {isLast ? (
              <span className={cn("truncate font-medium text-foreground")} aria-current="page">
                {labelForSegment(segment)}
              </span>
            ) : (
              <Link
                href={href}
                className={cn(
                  "truncate rounded-sm hover:text-foreground",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                )}
              >
                {labelForSegment(segment)}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}

export { Breadcrumbs };
