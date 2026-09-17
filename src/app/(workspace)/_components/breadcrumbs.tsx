"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, ChevronRight, Copy, Home } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav-items";

/** Opaque record ids (cuid) — long, unbroken, lowercase alphanumeric. */
const OPAQUE_ID_PATTERN = /^[a-z0-9]{16,}$/;

/** How long the "copied" checkmark replaces the copy icon, in ms. */
const COPIED_FEEDBACK_MS = 1500;

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

/**
 * Responsive breadcrumb trail derived from the current URL path.
 *
 * Ends in a copy action that puts the current path on the clipboard (e.g.
 * to paste into a doc, a bug report, or an audit note) with brief
 * checkmark feedback. Clipboard access is best-effort: a non-secure
 * context or a blocked permission leaves the button silently inert rather
 * than erroring the bar.
 *
 * The trail scrolls horizontally rather than pushing the top bar's
 * right-side actions: each crumb still truncates independently, but a long
 * run of segments (project → module → artifact → sub-tab) can always be
 * walked even when it exceeds the bar's width.
 */
function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(pathname);
      setCopied(true);
    } catch {
      // Clipboard unavailable (non-secure context or denied permission);
      // nothing useful to do — the bar just doesn't copy.
    }
  }

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center gap-0 text-sm text-muted-foreground"
    >
      <div className="flex min-w-0 items-center overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Link
          href="/dashboard"
          className={cn(
            "flex shrink-0 items-center rounded-sm hover:text-foreground",
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
      </div>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Path copied" : "Copy current path"}
        title="Copy current path"
        className={cn(
          "ml-1 flex size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors",
          "hover:bg-secondary hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {copied ? (
          <Check className="size-3.5 text-primary" aria-hidden="true" />
        ) : (
          <Copy className="size-3.5" aria-hidden="true" />
        )}
      </button>
    </nav>
  );
}

export { Breadcrumbs };