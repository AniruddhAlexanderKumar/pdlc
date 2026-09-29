import Link from "next/link";
import type { ReactNode } from "react";
import { Waypoints } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Shell } from "@/components/common/shell";
import { UINatureBackground } from "./_components/ui-nature-background";

const FOOTER_LINKS = [
  { label: "DOCS", href: "/docs" },
  { label: "SECURITY", href: "/docs/security" },
  { label: "KNOWN LIMITATIONS", href: "/docs/known-limitations" },
  { label: "RELEASE NOTES", href: "/docs/release-notes" },
  { label: "DOWNLOAD", href: "/download" },
  { label: "GITHUB", href: "https://github.com/The-5-man-mission/pdlc" },
];

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-svh flex-col bg-black text-white selection:bg-cyan-500 selection:text-black font-sans">
      {/* Living UI/UX Nature Background Canvas */}
      <UINatureBackground />

      {/* SpaceX-Inspired Top Navbar */}
      {/*
        `min-w-0` on both children, a shortened brand mark below `sm:`, and
        a shortened CTA label below `sm:` — found as a real 390px horizontal
        page overflow: the two-line brand text and "CREATE ORGANIZATION"
        both refused to shrink or wrap, so together with "SIGN IN" they
        pushed this row wider than the viewport on every marketing page.
      */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-black/80 backdrop-blur-xl print:static">
        <Shell className="flex h-16 items-center justify-between gap-3">
          <Link
            href="/"
            className="group flex min-w-0 shrink items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded border border-white/20 bg-white/5 text-white group-hover:border-white transition-all">
              <Waypoints className="size-4 text-cyan-400" aria-hidden="true" />
            </div>
            <div className="flex min-w-0 flex-col font-mono">
              <span className="truncate text-xs font-extrabold tracking-[0.25em] text-white uppercase">
                <span className="sm:hidden">MORNINGSTAR</span>
                <span className="hidden sm:inline">THE MORNINGSTAR SOLUTION</span>
              </span>
              <span className="hidden text-[9px] font-bold text-cyan-400 tracking-[0.3em] uppercase -mt-0.5 sm:block">
                5 MAN MISSION
              </span>
            </div>
          </Link>

          <nav className="flex shrink-0 items-center gap-2 print:hidden sm:gap-6 font-mono text-xs font-bold uppercase tracking-wider">
            <Link
              href="/docs"
              className="hidden text-slate-300 hover:text-white transition-colors sm:inline"
            >
              DOCS
            </Link>
            <Link
              href="/download"
              className="hidden text-slate-300 hover:text-white transition-colors sm:inline"
            >
              DOWNLOAD
            </Link>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="hidden font-mono text-xs font-bold uppercase text-slate-300 hover:bg-white/10 hover:text-white sm:inline-flex"
            >
              <Link href="/sign-in">SIGN IN</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="bg-white text-black hover:bg-slate-200 font-mono text-xs font-extrabold uppercase tracking-wider transition-all border border-white px-4 py-2 sm:px-5 rounded-none"
            >
              <Link href="/sign-up">
                <span className="sm:hidden">SIGN UP</span>
                <span className="hidden sm:inline">CREATE ORGANIZATION</span>
              </Link>
            </Button>
          </nav>
        </Shell>
      </header>

      <main className="flex-1 relative z-10">{children}</main>

      {/* SpaceX-Inspired Minimalist Dark Footer */}
      <footer className="relative z-10 border-t border-white/10 bg-black/90 backdrop-blur-md print:hidden">
        <Shell className="flex flex-col gap-6 py-10 sm:flex-row sm:items-center sm:justify-between font-mono text-xs uppercase tracking-wider">
          <div className="flex flex-col gap-1 text-slate-400">
            <span className="font-extrabold text-white">THE MORNINGSTAR SOLUTION</span>
            <span className="text-[10px] text-cyan-400 font-bold">5 MAN MISSION</span>
            <span className="text-[10px] text-slate-500">
              © {new Date().getFullYear()} ALL RIGHTS RESERVED.
            </span>
          </div>

          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-slate-400 hover:text-white transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </Shell>
      </footer>
    </div>
  );
}
