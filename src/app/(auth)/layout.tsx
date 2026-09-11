import type { ReactNode } from "react";

/**
 * Boundary for unauthenticated auth flows (sign-in, sign-up, password
 * reset). Deliberately placeholder-only — no auth provider, session, or
 * credential storage is wired up here. See ARCHITECTURE.md.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center bg-secondary/40 p-6">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  );
}
