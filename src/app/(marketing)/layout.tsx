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
    <div className="marketing-theme relative flex min-h-svh flex-col bg-[#f5f3ec] font-sans text-[#334139] selection:bg-[#dfe5d8] selection:text-[#29382f]">
      <UINatureBackground />

      <header className="sticky top-0 z-50 border-b border-[#e1ddd2]/90 bg-[#f7f5ef]/90 backdrop-blur-xl print:static">
        <Shell className="flex h-16 items-center justify-between gap-3">
          <Link
            href="/"
            className="group flex min-w-0 shrink items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#71816d]"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-[#d4d7ca] bg-[#ecefe6] text-[#536b58] transition-all group-hover:border-[#9ca994]">
              <Waypoints className="size-4" aria-hidden="true" />
            </div>
            <div className="flex min-w-0 flex-col font-mono">
              <span className="truncate text-xs font-bold tracking-[0.18em] text-[#334139] uppercase">
                <span className="sm:hidden">MORNINGSTAR</span>
                <span className="hidden sm:inline">THE MORNINGSTAR SOLUTION</span>
              </span>
              <span className="mt-0.5 hidden text-[9px] font-semibold tracking-[0.22em] text-[#8a795f] uppercase sm:block">
                5 MAN MISSION
              </span>
            </div>
          </Link>

          <nav className="flex shrink-0 items-center gap-2 font-mono text-xs font-semibold tracking-wide uppercase print:hidden sm:gap-6">
            <Link
              href="/docs"
              className="hidden text-[#68736a] transition-colors hover:text-[#334139] sm:inline"
            >
              DOCS
            </Link>
            <Link
              href="/download"
              className="hidden text-[#68736a] transition-colors hover:text-[#334139] sm:inline"
            >
              DOWNLOAD
            </Link>
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="hidden font-mono text-xs font-semibold uppercase text-[#68736a] hover:bg-[#eceae1] hover:text-[#334139] sm:inline-flex"
            >
              <Link href="/sign-in">SIGN IN</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="rounded-full border border-[#465b4d] bg-[#465b4d] px-4 py-2 font-mono text-xs font-semibold tracking-wide text-[#fffdf8] uppercase transition-all hover:border-[#34473b] hover:bg-[#34473b] sm:px-5"
            >
              <Link href="/sign-up">
                <span className="sm:hidden">SIGN UP</span>
                <span className="hidden sm:inline">CREATE ORGANIZATION</span>
              </Link>
            </Button>
          </nav>
        </Shell>
      </header>

      <main className="relative z-10 flex-1">{children}</main>

      <footer className="relative z-10 border-t border-[#e1ddd2] bg-[#f0eee7]/90 backdrop-blur-md print:hidden">
        <Shell className="flex flex-col gap-6 py-10 font-mono text-xs tracking-wide uppercase sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1 text-[#7b8177]">
            <span className="font-semibold text-[#334139]">THE MORNINGSTAR SOLUTION</span>
            <span className="text-[10px] font-semibold text-[#8a795f]">5 MAN MISSION</span>
            <span className="text-[10px] text-[#8b9086]">
              © {new Date().getFullYear()} ALL RIGHTS RESERVED.
            </span>
          </div>

          <nav className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-[#737b70] transition-colors hover:text-[#334139]"
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
