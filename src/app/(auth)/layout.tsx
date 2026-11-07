import type { ReactNode } from "react";
import { Waypoints } from "lucide-react";

/**
 * Boundary for unauthenticated auth flows (sign-in, sign-up, password
 * reset). Real auth (Argon2id, sessions) is wired up per AGENTS.md — the
 * form components handle it; this layout only frames them.
 *
 * Carries the same mark and mono wordmark as the authenticated shell's
 * sidebar (see sidebar.tsx) — the first screen anyone sees should not be a
 * bare, unbranded card indistinguishable from any other app's sign-in page.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-secondary/40 p-6">
      <div className="flex w-full max-w-sm flex-col gap-6">
        <div className="flex items-center justify-center gap-2.5">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground">
            <Waypoints className="size-4" aria-hidden="true" />
          </div>
          <span className="font-mono text-base font-semibold tracking-tight text-foreground">PDLC</span>
        </div>
        {children}
      </div>
    </div>
  );
}
