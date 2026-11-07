"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, ChevronDown, LogOut, Settings } from "lucide-react";
import type { AuthenticatedIdentity } from "@/domain";
import { signOut } from "@/lib/api/auth";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

/**
 * Initials for the avatar, e.g. "Ada Lovelace" → "AL".
 *
 * A parenthetical is a note about the name, not part of it, and only
 * letters and digits count: "Demo Program Owner (fictional)" used to come
 * out as "D(" — the last word's first character was a parenthesis.
 */
export function initials(name: string): string {
  const parts = name
    .replace(/\([^)]*\)/g, " ")
    .trim()
    .split(/\s+/)
    .map((part) => part.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

const itemClasses = cn(
  "flex w-full items-center gap-2.5 rounded-sm px-2 py-2 text-left text-sm text-foreground transition-colors",
  "hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
  "disabled:pointer-events-none disabled:opacity-50",
);

/**
 * Signed-in user, their settings, and the sign-out action — behind the
 * avatar, as one menu.
 *
 * It used to sit in the top bar in full: avatar, name, email and a "Sign
 * out" button side by side, next to a separate settings gear. That was
 * roughly a third of the bar at a desktop width, which is what squeezed
 * the breadcrumb trail down to "Pr… › Requir… › cmun…". Everything is
 * still one click away.
 *
 * Shows only name and email — no organization id or other internal
 * identifiers. Sign-out POSTs so the server can invalidate the session row;
 * clearing the cookie alone would leave a working token behind.
 */
export function UserMenu({ identity }: { identity: AuthenticatedIdentity }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [isSigningOut, setIsSigningOut] = React.useState(false);

  async function handleSignOut() {
    if (isSigningOut) return;
    setIsSigningOut(true);

    try {
      await signOut();
    } catch {
      // Sign-out is best-effort from the browser's point of view: even if the
      // request failed, send the user to /sign-in rather than stranding them
      // in a shell they may no longer have a session for.
    }

    router.replace("/sign-in");
    router.refresh();
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Account: ${identity.user.name}`}
          className={cn(
            "flex items-center gap-1.5 rounded-full p-0.5 pr-1.5 text-muted-foreground transition-colors",
            "hover:bg-secondary hover:text-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          )}
        >
          <span
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
            aria-hidden="true"
          >
            {initials(identity.user.name)}
          </span>
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-64 p-1.5">
        <div className="flex min-w-0 flex-col border-b border-border px-2 pb-2.5 pt-1.5 leading-tight">
          <span className="truncate text-sm font-medium text-foreground">{identity.user.name}</span>
          <span className="truncate text-xs text-muted-foreground">{identity.user.email}</span>
        </div>
        <div className="flex flex-col py-1">
          <Link href="/settings" onClick={() => setOpen(false)} className={itemClasses}>
            <Settings className="size-4 text-muted-foreground" aria-hidden="true" />
            Settings
          </Link>
          <Link href="/organization" onClick={() => setOpen(false)} className={itemClasses}>
            <Building2 className="size-4 text-muted-foreground" aria-hidden="true" />
            <span className="truncate">{identity.organization.name}</span>
          </Link>
        </div>
        <div className="border-t border-border pt-1">
          <button type="button" onClick={handleSignOut} disabled={isSigningOut} className={itemClasses}>
            <LogOut className="size-4 text-muted-foreground" aria-hidden="true" />
            {isSigningOut ? "Signing out…" : "Sign out"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
