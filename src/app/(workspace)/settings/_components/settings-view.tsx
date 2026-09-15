"use client";

import Link from "next/link";
import { Laptop, ListTree, Moon, Sun } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { SIMPLIFY_STORAGE_KEY } from "../../_components/sidebar";
import { useStoredFlag } from "@/lib/use-stored-flag";
import { type ThemePreference, useTheme } from "@/lib/use-theme";

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePreference; label: string; icon: typeof Sun }> = [
  { value: "system", label: "Match system", icon: Laptop },
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
];

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
