import Link from "next/link";
import type { ReactNode } from "react";
import { Waypoints } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Shell } from "@/components/common/shell";

const FOOTER_LINKS = [
  { label: "Docs", href: "/docs" },
  { label: "Security", href: "/docs/security" },
  { label: "Known limitations", href: "/docs/known-limitations" },
  { label: "Release notes", href: "/docs/release-notes" },
  { label: "Download", href: "/download" },
  { label: "GitHub", href: "https://github.com/The-5-man-mission/pdlc" },
];

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh flex-col">
      <header className="sticky top-0 z-10 border-b border-border bg-card">
        <Shell className="flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground">
              <Waypoints className="size-4" aria-hidden="true" />
            </div>
            <span className="font-mono text-sm font-semibold tracking-tight text-foreground">PDLC</span>
          </Link>
          <nav className="flex items-center gap-4">
            <Link href="/docs" className="text-sm text-muted-foreground hover:text-foreground">
              Docs
            </Link>
            <Link href="/download" className="text-sm text-muted-foreground hover:text-foreground">
              Download
            </Link>
            <Button asChild variant="ghost" size="sm">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/sign-up">Create an organization</Link>
            </Button>
          </nav>
        </Shell>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border">
        <Shell className="flex flex-col gap-3 py-6 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-xs text-muted-foreground">© {new Date().getFullYear()} PDLC Platform</span>
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {FOOTER_LINKS.map((link) => (
              <Link key={link.href} href={link.href} className="text-xs text-muted-foreground hover:text-foreground">
                {link.label}
              </Link>
            ))}
          </nav>
        </Shell>
      </footer>
    </div>
  );
}
