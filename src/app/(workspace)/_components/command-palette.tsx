"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { CornerDownLeft, Search } from "lucide-react";
import { type TerminologyLabelOverrides, resolveTerminologyLabel } from "@/domain";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { ALWAYS_VISIBLE_HREF, useNavCustomization } from "./nav-customization";
import { NAV_ITEMS } from "./nav-items";
import { CURRENT_PROJECT_PATTERN } from "./sidebar";
import { useTerminologyOverrides } from "./terminology-context";
import { PROJECT_MODULES } from "../projects/_components/project-modules";

interface PaletteEntry {
  title: string;
  href: string;
  section: string;
}

/** Same fallback `useModuleLabel` applies, as a plain function instead of a hook — `overrides` is read once, here, rather than once per module, since this builds every entry in one pass rather than one component per row. */
function moduleTitle(
  entry: { label: string; labelKey?: Parameters<typeof resolveTerminologyLabel>[0] },
  overrides: TerminologyLabelOverrides,
): string {
  return entry.labelKey ? resolveTerminologyLabel(entry.labelKey, overrides) : entry.label;
}

/**
 * `Ctrl`/`Cmd`+`K` from anywhere in the authenticated workspace — jump
 * straight to any module or project-scoped page without clicking through
 * the sidebar. Adapts the exact pattern the public docs' own command
 * palette already established (`(marketing)/docs/_components/command-palette.tsx`):
 * same keyboard shortcut, same overlay, same arrow-key/Enter behavior —
 * deliberately not a second, differently-behaving search UI in the same
 * product.
 *
 * This searches navigation *destinations* only — modules, projects-list,
 * settings — not a full-text index of engineering data (a requirement's
 * own text, a risk's description). Building that would need a real search
 * endpoint this product does not have; this stays honest about being
 * "faster clicking," not "search."
 *
 * Respects the same personalization the sidebar itself does: a module a
 * reader has removed (see `nav-customization.ts`) does not appear here
 * either — "removed" means removed, not just removed from one list — and
 * a renamed module (see `terminology-context.tsx`) appears under its
 * organization's own chosen word, so a reader searching for the word they
 * actually see in their sidebar still finds it.
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

  const allEntries = React.useMemo<PaletteEntry[]>(() => {
    const entries: PaletteEntry[] = [
      { title: "Dashboard", href: "/dashboard", section: "Go to" },
      { title: "Projects", href: "/projects", section: "Go to" },
      { title: "Settings", href: "/settings", section: "Go to" },
      ...(showPortfolio ? [{ title: "Executive", href: "/executive", section: "Go to" }] : []),
      { title: "Organization", href: "/organization", section: "Go to" },
      { title: "Help", href: "/help", section: "Go to" },
    ];

    if (currentProjectId) {
      entries.push({
        title: "Command Center",
        href: `/projects/${currentProjectId}/command-center`,
        section: "This project",
      });
      entries.push({ title: "Overview", href: `/projects/${currentProjectId}`, section: "This project" });
      for (const projectModule of PROJECT_MODULES) {
        if (projectModule.href === ALWAYS_VISIBLE_HREF || hidden.has(projectModule.href)) continue;
        entries.push({
          title: moduleTitle(projectModule, overrides),
          href: `/projects/${currentProjectId}${projectModule.href}`,
          section: "This project",
        });
      }
    } else {
      for (const item of NAV_ITEMS) {
        if (item.href === "/dashboard" || item.href === "/projects" || hidden.has(item.href)) continue;
        entries.push({ title: moduleTitle(item, overrides), href: item.href, section: "Modules" });
      }
    }

    return entries;
  }, [currentProjectId, overrides, hidden, showPortfolio]);

  const results = React.useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return allEntries;
    return allEntries.filter(
      (entry) => entry.title.toLowerCase().includes(trimmed) || entry.section.toLowerCase().includes(trimmed),
    );
  }, [allEntries, query]);

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
              placeholder="Jump to a module or page…"
              aria-label="Jump to a module or page"
              autoComplete="off"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>
          <ul role="listbox" aria-label="Navigation results" className="max-h-80 overflow-y-auto p-1.5">
            {results.length === 0 ? (
              <li className="px-2.5 py-6 text-center text-sm text-muted-foreground">
                Nothing matches &quot;{query}&quot;.
              </li>
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
                    {i === activeIndex && (
                      <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                    )}
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
