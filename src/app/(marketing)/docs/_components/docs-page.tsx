import Link from "next/link";
import type { ReactNode } from "react";
import { PRODUCT_VERSION } from "@/lib/product-version";

const REPO_URL = "https://github.com/The-5-man-mission/pdlc";

/**
 * Consistent chrome for every docs content page: title, description, and —
 * per Master Prompt 6 §5 — the product version this page describes,
 * when it was last checked against the code, and a link to its own
 * source file so a reader can see exactly what generated the words in
 * front of them.
 */
export function DocsPage({
  title,
  description,
  lastUpdated,
  sourcePath,
  children,
}: {
  title: string;
  description: string;
  /** ISO date this page's content was last checked against the running code. */
  lastUpdated: string;
  /** Path from the repo root to this page's own source file. */
  sourcePath: string;
  children: ReactNode;
}) {
  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2 border-b border-border pb-4">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
        <p className="max-w-2xl text-sm text-muted-foreground">{description}</p>
      </header>

      <div className="flex flex-col gap-8 text-sm leading-relaxed text-foreground [&_h2]:mt-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:tracking-tight [&_h3]:text-base [&_h3]:font-semibold [&_p]:text-muted-foreground [&_li]:text-muted-foreground">
        {children}
      </div>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border pt-4 text-xs text-muted-foreground">
        <span>
          Describes v<span className="font-mono">{PRODUCT_VERSION}</span>
        </span>
        <span>
          Last checked <span className="font-mono">{lastUpdated}</span>
        </span>
        <Link
          href={`${REPO_URL}/blob/main/${sourcePath}`}
          className="underline-offset-4 hover:underline"
          target="_blank"
          rel="noreferrer"
        >
          View source
        </Link>
      </footer>
    </article>
  );
}
