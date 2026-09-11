"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import type { AuthenticatedIdentity } from "@/domain";
import { signOut } from "@/lib/api/auth";
import { Button } from "@/components/ui/button";

/** Initials for the avatar, e.g. "Ada Lovelace" → "AL". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

/**
 * Signed-in user and the sign-out action.
 *
 * Shows only name and email — no organization id or other internal
 * identifiers. Sign-out POSTs so the server can invalidate the session row;
 * clearing the cookie alone would leave a working token behind.
 */
export function UserMenu({ identity }: { identity: AuthenticatedIdentity }) {
  const router = useRouter();
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
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2">
        <span
          className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
          aria-hidden="true"
        >
          {initials(identity.user.name)}
        </span>
        <span className="hidden min-w-0 flex-col leading-tight sm:flex">
          <span className="truncate text-sm font-medium text-foreground">
            {identity.user.name}
          </span>
          <span className="truncate text-xs text-muted-foreground">{identity.user.email}</span>
        </span>
      </div>
      <Button variant="ghost" size="sm" onClick={handleSignOut} disabled={isSigningOut}>
        <LogOut aria-hidden="true" />
        <span className="hidden sm:inline">{isSigningOut ? "Signing out…" : "Sign out"}</span>
        <span className="sr-only sm:hidden">Sign out</span>
      </Button>
    </div>
  );
}
