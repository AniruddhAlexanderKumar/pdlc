import Link from "next/link";
import type { ReactNode } from "react";
import { Waypoints, ArrowRight, ShieldCheck } from "lucide-react";
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
    <div className="flex min-h-svh flex-col bg-slate-50/50 text-slate-900 selection:bg-blue-600 selection:text-white">
      <header className="sticky top-0 z-50 border-b border-slate-200/80 bg-white/80 backdrop-blur-md print:static">
        <Shell className="flex h-16 items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2.5 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md shadow-blue-500/20">
              <Waypoints className="size-4" aria-hidden="true" />
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-base font-extrabold tracking-tight text-slate-900">
                PDLC
              </span>
              <span className="font-mono text-[9px] font-bold text-blue-600 tracking-widest uppercase -mt-1">
                PLATFORM
              </span>
            </div>
          </Link>

          <nav className="flex items-center gap-2 print:hidden sm:gap-4 font-mono text-xs">
            <Link
              href="/docs"
              className="hidden font-semibold text-slate-600 hover:text-blue-600 transition-colors sm:inline"
            >
              Docs
            </Link>
            <Link
              href="/download"
              className="hidden font-semibold text-slate-600 hover:text-blue-600 transition-colors sm:inline"
            >
              Download
            </Link>
            <Button asChild variant="ghost" size="sm" className="font-mono text-xs text-slate-700 hover:bg-slate-100">
              <Link href="/sign-in">Sign in</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-mono text-xs font-semibold shadow-md shadow-blue-500/20 transition-all border-none"
            >
              <Link href="/sign-up">
                <span className="sm:hidden">Sign up</span>
                <span className="hidden sm:inline">Create Organization</span>
              </Link>
            </Button>
          </nav>
        </Shell>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-slate-200 bg-white print:hidden">
        <Shell className="flex flex-col gap-4 py-8 sm:flex-row sm:items-center sm:justify-between font-mono text-xs">
          <div className="flex flex-col gap-1">
            <span className="font-bold text-slate-900">PDLC Platform</span>
            <span className="text-slate-500 text-[11px]">
              © {new Date().getFullYear()} PDLC Inc. The Product Development Decision Platform.
            </span>
          </div>

          <nav className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {FOOTER_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-slate-600 hover:text-blue-600 font-medium transition-colors"
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
