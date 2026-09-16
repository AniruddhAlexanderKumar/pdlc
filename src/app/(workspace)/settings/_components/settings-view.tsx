"use client";

import Link from "next/link";
import { Eye, EyeOff, Laptop, ListTree, Moon, RotateCcw, Star, Sun } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { ALWAYS_VISIBLE_HREF, useNavCustomization } from "../../_components/nav-customization";
import { SIMPLIFY_STORAGE_KEY } from "../../_components/sidebar";
import { useModuleLabel } from "../../_components/terminology-context";
import {
  MODULE_GROUPS,
  PROJECT_MODULES,
  type ProjectModule,
} from "../../projects/_components/project-modules";
import { useStoredFlag } from "@/lib/use-stored-flag";
import { type ThemePreference, useTheme } from "@/lib/use-theme";

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: "system", label: "Match system", icon: Laptop },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

/** Every customizable module, grouped the same way the sidebar itself groups them, plus an "Other" bucket for the two that have no permanent sidebar residency by default (Suppliers, Members) — pinning from here is the only way either ever appears in the sidebar at all. Command Center is excluded everywhere: it can be neither hidden nor pinned. */
const CUSTOMIZABLE_MODULES = PROJECT_MODULES.filter((module) => module.href !== ALWAYS_VISIBLE_HREF);
const OTHER_MODULES = CUSTOMIZABLE_MODULES.filter((module) => module.group === null);

/**
 * Personal preferences — per-browser, not synced to the account (same
 * tradeoff `use-stored-flag.ts` and `use-theme.ts` each explain on their
 * own terms). Organization-wide settings (engineering industry, terminology)
 * live on the Organization page instead — a different owner-gated,
 * account-wide concern, not a personal one, so this page only links to it
 * rather than duplicating that form here.
 */
export function SettingsView({ isOwner }: { isOwner: boolean }) {
  const [theme, setTheme] = useTheme();
  const [simplified, setSimplified] = useStoredFlag(SIMPLIFY_STORAGE_KEY);
  const { hidden, pinned, setHidden, setPinned, reset: resetNavCustomization } = useNavCustomization();
  const hasCustomization = hidden.size > 0 || pinned.size > 0;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            Remembered in this browser only — sign in from another device and it starts back at
            &ldquo;Match system&rdquo; there.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="inline-flex overflow-hidden rounded-md border border-input" role="radiogroup" aria-label="Theme">
            {THEME_OPTIONS.map((option, index) => {
              const Icon = option.icon;
              const isActive = theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={isActive}
                  onClick={() => setTheme(option.value)}
                  className={cn(
                    "flex h-9 items-center gap-2 px-3 text-sm font-medium transition-colors",
                    index > 0 && "border-l border-input",
                    isActive
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/50",
                  )}
                >
                  <Icon className="size-4" aria-hidden="true" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ListTree className="size-4" aria-hidden="true" />
            Navigation
          </CardTitle>
          <CardDescription>
            The same &ldquo;Simplify&rdquo; control the sidebar itself has, surfaced here too —
            collapses project navigation down to daily-tier modules only.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <label className="flex w-fit items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={simplified}
              onChange={(event) => setSimplified(event.target.checked)}
              className="size-4 rounded border-input"
            />
            Simplify project navigation
          </label>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Modules</CardTitle>
            <CardDescription>
              Remove a module from every sidebar it would otherwise appear in, or pin one — even
              Suppliers or Members, which have no permanent sidebar spot by default — so it always
              shows there, immune to Simplify. A module is never both at once.
            </CardDescription>
          </div>
          {hasCustomization && (
            <Button variant="outline" size="sm" onClick={resetNavCustomization} className="shrink-0">
              <RotateCcw aria-hidden="true" />
              Reset
            </Button>
          )}
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {MODULE_GROUPS.map((group) => {
            const members = CUSTOMIZABLE_MODULES.filter((module) => module.group === group.id);
            if (members.length === 0) return null;
            return (
              <ModuleGroupList
                key={group.id}
                label={group.label}
                modules={members}
                hidden={hidden}
                pinned={pinned}
                setHidden={setHidden}
                setPinned={setPinned}
              />
            );
          })}
          <ModuleGroupList
            label="Other — not shown by default"
            modules={OTHER_MODULES}
            hidden={hidden}
            pinned={pinned}
            setHidden={setHidden}
            setPinned={setPinned}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Organization</CardTitle>
          <CardDescription>
            Engineering industry and terminology apply to everyone in your organization, so they
            live on a shared page rather than here.
            {!isOwner && " Only an organization owner can change them."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/organization" className="text-sm text-primary hover:underline">
            Go to organization settings →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

interface NavCustomizationControls {
  hidden: ReadonlySet<string>;
  pinned: ReadonlySet<string>;
  setHidden: (href: string, isHidden: boolean) => void;
  setPinned: (href: string, isPinned: boolean) => void;
}

function ModuleGroupList({
  label,
  modules,
  ...controls
}: { label: string; modules: readonly ProjectModule[] } & NavCustomizationControls) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{label}</span>
      <div className="flex flex-col divide-y divide-border rounded-md border border-border">
        {modules.map((module) => (
          <ModuleRow key={module.href} module={module} {...controls} />
        ))}
      </div>
    </div>
  );
}

function ModuleRow({
  module,
  hidden,
  pinned,
  setHidden,
  setPinned,
}: { module: ProjectModule } & NavCustomizationControls) {
  const Icon = module.icon;
  const label = useModuleLabel(module.labelKey, module.label);
  const isHidden = hidden.has(module.href);
  const isPinned = pinned.has(module.href);

  return (
    <div className="flex items-center gap-3 px-3 py-2">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className={cn("truncate text-sm font-medium", isHidden ? "text-muted-foreground line-through" : "text-foreground")}>
          {label}
        </span>
        <span className="truncate text-xs text-muted-foreground">{module.description}</span>
      </div>
      {isPinned && (
        <Badge variant="outline" className="shrink-0">
          Pinned
        </Badge>
      )}
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setPinned(module.href, !isPinned)}
          aria-pressed={isPinned}
          aria-label={isPinned ? `Unpin ${label}` : `Pin ${label}`}
          title={isPinned ? "Unpin" : "Pin to sidebar"}
          className={cn(
            "flex size-8 items-center justify-center rounded-md transition-colors hover:bg-secondary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isPinned ? "text-primary" : "text-muted-foreground",
          )}
        >
          <Star className={cn("size-4", isPinned && "fill-current")} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => setHidden(module.href, !isHidden)}
          aria-pressed={isHidden}
          aria-label={isHidden ? `Show ${label}` : `Remove ${label}`}
          title={isHidden ? "Show in sidebar" : "Remove from sidebar"}
          className={cn(
            "flex size-8 items-center justify-center rounded-md transition-colors hover:bg-secondary",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isHidden ? "text-destructive" : "text-muted-foreground",
          )}
        >
          {isHidden ? <EyeOff className="size-4" aria-hidden="true" /> : <Eye className="size-4" aria-hidden="true" />}
        </button>
      </div>
    </div>
  );
}
