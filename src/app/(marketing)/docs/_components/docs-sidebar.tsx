"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { DOCS_NAV } from "./docs-nav";
import { searchDocs } from "./docs-search";

export function DocsSidebar() {
  const pathname = usePathname();
  const [query, setQuery] = React.useState("");
  const results = React.useMemo(() => searchDocs(query), [query]);

  return (
    <nav aria-label="Documentation" className="flex w-full flex-col gap-4 lg:w-56 lg:shrink-0">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search docs…"
          aria-label="Search documentation"
          className={cn(
            "h-9 w-full rounded-md border border-input bg-card pl-8 pr-3 text-sm shadow-sm",
            "placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          )}
        />
        {query.trim() && (
          <div className="absolute left-0 top-full z-20 mt-1 w-full rounded-md border border-border bg-card p-1 shadow-lg">
            {results.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">No pages match &quot;{query}&quot;.</p>
            ) : (
              results.map((result) => (
                <Link
                  key={result.href}
                  href={result.href}
                  onClick={() => setQuery("")}
                  className="block rounded-sm px-2 py-1.5 text-sm text-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {result.title}
                  <span className="ml-1.5 text-xs text-muted-foreground">{result.section}</span>
                </Link>
              ))
            )}
          </div>
        )}
      </div>

      <ul className="flex flex-col gap-0.5">
        {DOCS_NAV.map((item) => {
          const isActive = pathname === item.href;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "block rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  isActive
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                )}
              >
                {item.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
