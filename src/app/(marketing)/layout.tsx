import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Shell } from "@/components/common/shell";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b border-border bg-card">
        <Shell className="flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex size-7 items-center justify-center rounded-md bg-primary font-mono text-xs font-bold text-primary-foreground">
              P
            </div>
            <span className="text-sm font-semibold tracking-tight text-foreground">PDLC Platform</span>
          </Link>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/dashboard">Enter workspace</Link>
            </Button>
          </nav>
        </Shell>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border">
        <Shell className="flex h-14 items-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} PDLC Platform — internal engineering foundation.
        </Shell>
      </footer>
    </div>
  );
}
