"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { CornerDownLeft, Search } from "lucide-react";
import { type TerminologyLabelOverrides, resolveTerminologyLabel } from "@/domain";
import {
  type SearchResult,
  searchEntityLabel,
  searchEntityTerminologyKey,
  searchResultHref,
} from "@/domain/search";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useSearch } from "@/lib/api/search";
import { cn } from "@/lib/utils";
import { ALWAYS_VISIBLE_HREF, useNavCustomization } from "./nav-customization";
import { NAV_ITEMS } from "./nav-items";
import { CURRENT_PROJECT_PATTERN } from "./sidebar";
import { useTerminologyOverrides } from "./terminology-context";
import { PROJECT_MODULES } from "../projects/_components/project-modules";

interface PaletteEntry {
  key: string;
  title: string;
  href: string;
  section: string;
  /** The identifying line under a record — identifier, project, status. Absent on navigation entries. */
  detail?: string;
}

/** Same fallback `useModuleLabel` applies, as a plain function instead of a hook — `overrides` is read once, here, rather than once per module, since this builds every entry in one pass rather than one component per row. */
function moduleTitle(
  entry: { label: string; labelKey?: Parameters<typeof resolveTerminologyLabel>[0] },
  overrides: TerminologyLabelOverrides,
): string {
  return entry.labelKey ? resolveTerminologyLabel(entry.labelKey, overrides) : entry.label;
}

/**
 * `Ctrl`/`Cmd`+`K` from anywhere in the authenticated workspace.
 *
 * This used to search navigation *destinations* only, and its comment said
 * so plainly — "faster clicking, not search" — because there was no search
 * endpoint to call. There is one now (`/api/search`), so the palette does
 * what a reader always assumed it did: it finds records, by identifier or
 * by their actual text, across every project the reader can reach.
 *
 * Deliberately one surface rather than two. A second search box would mean
 * guessing, every time, which one knows about the thing you are looking
 * for. Navigation entries stay instant and local; records arrive from the
 * server a moment later and slot in around them.
 *
 * **An exact identifier wins outright.** Typing `REQ-001` puts that record
 * above every navigation entry, because someone who types an identifier is
 * not looking for a module. Everything else keeps navigation first, since
 * those entries are certain and immediate while a text match is a guess.
 *
 * No relevance score is shown, here or anywhere: the order *is* the claim,
 * and a number next to it would be an invented one. Results say how they
 * matched instead — an exact identifier is labelled as one.
 *
 * Respects the same personalization the sidebar does: a module a reader has
 * removed (see `nav-customization.ts`) does not appear here either, and a
 * renamed module or artifact type (see `terminology-context.tsx`) appears
 * under its organization's own chosen word — including on search results,
 * so a reader who calls requirements "spec lines" sees that word on the row.
 */
export function CommandPalette({ showPortfolio = false }: { showPortfolio?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const overrides = useTerminologyOverrides();
  const { hidden } = useNavCustomization();
  const currentProjectId = pathname.match(CURRENT_PROJECT_PATTERN)?.[1] ?? null;

  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [activeIndex, setActiveIndex] = React.useState(0);

  // Only query the server while the palette is open — the hook debounces
  // and aborts, but a closed dialog should not be searching at all.
  const searchState = useSearch(open ? query : "");

  const allEntries = React.useMemo<PaletteEntry[]>(() => {
    const entries: PaletteEntry[] = [
      { key: "nav:/dashboard", title: "Dashboard", href: "/dashboard", section: "Go to" },
      { key: "nav:/projects", title: "Projects", href: "/projects", section: "Go to" },
      { key: "nav:/settings", title: "Settings", href: "/settings", section: "Go to" },
      { key: "nav:/docs/step-by-step-guide", title: "Step-by-Step Software Guide", href: "/docs/step-by-step-guide", section: "Documentation" },
      { key: "nav:/docs/beginner-guide", title: "Beginner Guide", href: "/docs/beginner-guide", section: "Documentation" },
      ...(showPortfolio
        ? [{ key: "nav:/executive", title: "Executive", href: "/executive", section: "Go to" }]
        : []),
      { key: "nav:/organization", title: "Organization", href: "/organization", section: "Go to" },
      { key: "nav:/help", title: "Help", href: "/help", section: "Go to" },
    ];

    if (currentProjectId) {
      entries.push({
        key: "nav:command-center",
        title: "Command Center",
        href: `/projects/${currentProjectId}/command-center`,
        section: "This project",
      });
      entries.push({
        key: "nav:overview",
        title: "Overview",
        href: `/projects/${currentProjectId}`,
        section: "This project",
      });
      for (const projectModule of PROJECT_MODULES) {
        if (projectModule.href === ALWAYS_VISIBLE_HREF || hidden.has(projectModule.href)) continue;
        entries.push({
          key: `nav:${projectModule.href}`,
          title: moduleTitle(projectModule, overrides),
          href: `/projects/${currentProjectId}${projectModule.href}`,
          section: "This project",
        });
      }
    } else {
      for (const item of NAV_ITEMS) {
        if (item.href === "/dashboard" || item.href === "/projects" || hidden.has(item.href)) continue;
        entries.push({
          key: `nav:${item.href}`,
          title: moduleTitle(item, overrides),
          href: item.href,
          section: "Modules",
        });
      }
    }

    return entries;
  }, [currentProjectId, overrides, hidden, showPortfolio]);

  /** A found record, described in the organization's own words. */
  const toEntry = React.useCallback(
    (result: SearchResult): PaletteEntry => {
      const terminologyKey = searchEntityTerminologyKey(result.type);
      const typeLabel = terminologyKey
        ? resolveTerminologyLabel(terminologyKey, overrides)
        : searchEntityLabel(result.type);

      return {
        key: `result:${result.type}:${result.id}`,
        title: result.title,
        href: searchResultHref(result),
        section: result.matchKind === "IDENTIFIER_EXACT" ? "Exact match" : typeLabel,
        detail: [result.identifier, result.projectName, result.status].join(" · "),
      };
    },
    [overrides],
  );

  const results = React.useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    const navMatches = trimmed
      ? allEntries.filter(
          (entry) =>
            entry.title.toLowerCase().includes(trimmed) ||
            entry.section.toLowerCase().includes(trimmed),
        )
      : allEntries;

    if (searchState.phase !== "ready") return navMatches;

    // An exact identifier is not a guess — it goes above navigation.
    // Everything else sits below it, because a module you asked for by name
    // is a certainty and a text match is not.
    const found = searchState.data.results;
    const exact = found.filter((result) => result.matchKind === "IDENTIFIER_EXACT").map(toEntry);
    const rest = found.filter((result) => result.matchKind !== "IDENTIFIER_EXACT").map(toEntry);

    return [...exact, ...navMatches, ...rest];
  }, [allEntries, query, searchState, toEntry]);

  // Results arrive asynchronously and can shrink the list under a selection
  // made against the previous one, leaving Enter pointing at nothing.
  // Clamped here rather than corrected from an effect, which would cascade a
  // render to fix something already knowable at this point.
  const selectedIndex = activeIndex < results.length ? activeIndex : 0;

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
      setActiveIndex(Math.min(results.length - 1, selectedIndex + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex(Math.max(0, selectedIndex - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = results[selectedIndex];
      if (target) go(target.href);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => handleOpenChange(true)}
        aria-label="Jump to…"
        title="Jump to… (Ctrl K)"
        className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
      >
        <Search className="size-4" aria-hidden="true" />
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="top-[20%] max-w-lg -translate-y-0 gap-0 p-0"
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            document.getElementById("workspace-command-palette-input")?.focus();
          }}
        >
          <div className="flex items-center gap-2 border-b border-border px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <input
              id="workspace-command-palette-input"
              value={query}
              onChange={(event) => handleQueryChange(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search records, or jump to a page…"
              aria-label="Search records, or jump to a page"
              autoComplete="off"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {searchState.phase === "searching" && (
              <span className="shrink-0 text-xs text-muted-foreground" role="status">
                Searching…
              </span>
            )}
          </div>
          <ul role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto p-1.5">
            {results.length === 0 ? (
              <li className="px-2.5 py-6 text-center text-sm text-muted-foreground">
                Nothing matches &quot;{query}&quot;.
              </li>
            ) : (
              results.map((result, i) => (
                <li key={result.key}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === selectedIndex}
                    onMouseEnter={() => setActiveIndex(i)}
                    onClick={() => go(result.href)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-sm px-2.5 py-2 text-left text-sm",
                      i === selectedIndex ? "bg-accent text-accent-foreground" : "text-foreground",
                    )}
                  >
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate font-medium">{result.title}</span>
                      <span className="truncate text-xs text-muted-foreground">
                        {result.detail ? `${result.section} · ${result.detail}` : result.section}
                      </span>
                    </span>
                    {i === selectedIndex && (
                      <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    )}
                  </button>
                </li>
              ))
            )}
          </ul>
          {searchState.phase === "error" && (
            <p role="alert" className="border-t border-border px-3 py-2 text-xs text-destructive">
              {searchState.message}
            </p>
          )}
          {searchState.phase === "ready" && searchState.data.truncated && (
            <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
              More records match than are shown. Narrow the search to see the rest.
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
