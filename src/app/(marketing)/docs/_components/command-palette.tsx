"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CornerDownLeft, Search } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { DOCS_NAV } from "./docs-nav";
import { searchDocs } from "./docs-search";

/**
 * `Ctrl`/`Cmd`+`K` from anywhere in the docs — the same real search index
 * `docs-sidebar.tsx`'s inline box uses (`docs-search.ts`), in a proper
 * overlay with keyboard navigation, matching what anyone coming from
 * another product's docs already expects.
 */
export function CommandPalette() {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);
  const router = useRouter();

  const results = React.useMemo(() => (query.trim() ? searchDocs(query) : DOCS_NAV.map((item) => ({ title: item.title, href: item.href, section: "Browse", keywords: "" }))), [query]);

  // Global keyboard listener — a genuine subscription to an external
  // system (the window), not a state-sync effect, so it stays as the one
  // effect here.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Query and active-index resets happen at the actual point of change
  // (typing, closing) rather than reactively via an effect watching that
  // same state — the effect version cascades an extra render for no
  // benefit and is exactly what React's own set-state-in-effect lint rule
  // flags.
  function handleQueryChange(next: string) {
    setQuery(next);
    setActiveIndex(0);
  }

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setActiveIndex(0);
    }
  }

  function go(href: string) {
    handleOpenChange(false);
    router.push(href);
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => Math.min(results.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = results[activeIndex];
      if (target) go(target.href);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-md border border-input bg-card px-3 text-sm text-muted-foreground shadow-sm",
          "hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        )}
      >
        <Search className="size-3.5" aria-hidden="true" />
        Search docs…
        <kbd className="ml-auto rounded-xs border border-border bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          Ctrl K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="top-[20%] max-w-lg -translate-y-0 gap-0 p-0"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById("command-palette-input")?.focus();
          }}
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              id="command-palette-input"
              value={query}
              onChange={(event) => handleQueryChange(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search docs…"
              aria-label="Search documentation"
              autoComplete="off"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul role="listbox" aria-label="Search results" className="max-h-80 overflow-y-auto p-1.5">
            {results.length === 0 ? (
              <li className="px-2.5 py-6 text-center text-sm text-muted-foreground">No pages match &quot;{query}&quot;.</li>
            ) : (
              results.map((result, i) => (
                <li key={result.href}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === activeIndex}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => go(result.href)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-sm px-2.5 py-2 text-left text-sm",
                      i === activeIndex ? "bg-accent text-accent-foreground" : "text-foreground",
                    )}
                  >
                    <span className="flex flex-col">
                      <span className="font-medium">{result.title}</span>
                      <span className="text-xs text-muted-foreground">{result.section}</span>
                    </span>
                    {i === activeIndex && <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
                  </button>
                </li>
              ))
            )}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  );
}
