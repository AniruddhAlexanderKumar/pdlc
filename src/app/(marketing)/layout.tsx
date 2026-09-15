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
      <header className="sticky top-0 z-10 border-b border-border bg-card print:static">
        <Shell className="flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <div className="flex size-7 shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground">
              <Waypoints className="size-4" aria-hidden="true" />
            </div>
            <span className="font-mono text-sm font-semibold tracking-tight text-foreground">PDLC</span>
          </Link>
          {/*
            Docs/Download collapse below `sm` — both are also one tap away
            from the footer, and "Create an organization" shortens to "Sign
            up" there too. A header that doesn't fit a phone viewport
            (found as real horizontal overflow at 390px, not assumed) is a
            worse first impression than a header with fewer items on it.
            Hidden entirely on print — sign-in/sign-up buttons and nav links
            do nothing on paper; only the brand mark (identifying what
            document this is) stays.
          */}
          <nav className="flex items-center gap-2 print:hidden sm:gap-4">
            <Link href="/docs" className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline">
              Docs
            </Link>
            <Link href="/download" className="hidden text-sm text-muted-foreground hover:text-foreground sm:inline">
              Download
            </Link>
            <Button asChild variant="ghost" size="sm">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/sign-up">
                <span className="sm:hidden">Sign up</span>
                <span className="hidden sm:inline">Create an organization</span>
              </Link>
            </Button>
          </nav>
        </Shell>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-border print:hidden">
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
