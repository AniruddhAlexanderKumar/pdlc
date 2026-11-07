"use client";

import * as React from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatIdentifier } from "@/lib/format";

/**
 * An artifact identifier ("REQ-001") in the one consistent treatment used
 * everywhere it appears — table cell, matrix header, diagram node label,
 * detail panel title (§3). Mono, selectable as a single unit
 * (`select-all` rather than letting a click land mid-string), and
 * one-click copy.
 *
 * `projectName` + `showProject` disambiguate the composite
 * `(projectId, identifier)` key wherever a view could plausibly mix
 * artifacts from more than one project — the identifier alone is only
 * unique within its own project.
 *
 * `href`, when given, makes the identifier text itself a real link (so
 * ctrl/middle-click opens the full record in a new tab, and Tab+Enter
 * reaches it) — deliberately a sibling of the copy button, not a wrapper
 * around it: a `<button>` nested inside an `<a>` is invalid HTML, and would
 * also fold the copy button's own label into the link's accessible name.
 */
export function Identifier({
  value,
  projectName,
  showProject = false,
  href,
  onNavigate,
  className,
}: {
  value: string;
  projectName?: string | null;
  showProject?: boolean;
  href?: string;
  /** Fires when the link is activated — e.g. to stop it also triggering a containing row's click handler. */
  onNavigate?: (event: React.MouseEvent) => void;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const text = formatIdentifier(value, projectName, showProject);
  const copyTimeout = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => () => clearTimeout(copyTimeout.current), []);

  async function handleCopy(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      clearTimeout(copyTimeout.current);
      copyTimeout.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // No clipboard permission or API (older browser, insecure context) —
      // the text is still selectable by hand, so nothing else to fall back to.
    }
  }

  return (
    <span className={cn("group inline-flex items-center gap-1 font-mono text-sm", className)}>
      {href ? (
        <Link
          href={href}
          onClick={onNavigate}
          className="select-all rounded-xs underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {text}
        </Link>
      ) : (
        <span className="select-all">{text}</span>
      )}
      <button
        type="button"
        onClick={handleCopy}
        title={copied ? "Copied" : `Copy ${value}`}
        aria-label={copied ? "Copied" : `Copy ${value}`}
        className={cn(
          "inline-flex size-4 shrink-0 items-center justify-center rounded-xs text-muted-foreground opacity-0",
          "transition-opacity group-hover:opacity-100 focus-visible:opacity-100",
          "hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        {copied ? (
          <Check className="size-3 text-success" aria-hidden="true" />
        ) : (
          <Copy className="size-3" aria-hidden="true" />
        )}
      </button>
    </span>
  );
}
