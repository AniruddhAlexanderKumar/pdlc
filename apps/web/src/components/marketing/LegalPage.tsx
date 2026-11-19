import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowLeft } from 'lucide-react';
import { PublicBrand } from './PublicBrand';
import { openCookiePreferences } from '../../lib/cookieConsent';

/**
 * Shared shell for the public legal pages (Terms of Service, Privacy Policy).
 *
 * These pages exist because account registration asks people to accept them.
 * They describe what this deployment actually does, and they say so plainly
 * where something is an operator responsibility rather than a promise.
 */

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="min-h-full bg-[#f7fafb] text-[#17384e]">
      <header className="border-b border-[#dbe4e8] bg-white">
        <div className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <PublicBrand />
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-medium text-[#315d76] hover:text-blue-700">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to home
          </Link>
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-[820px] px-5 py-12 sm:px-8 sm:py-16">
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#287b9a]">Legal</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[#102f46] sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm text-slate-500">Last updated {updated}.</p>
        <div className="legal-prose mt-9 space-y-8">{children}</div>
      </main>
      <footer className="border-t border-[#dbe6ea] bg-white px-5 py-8 sm:px-8">
        <div className="mx-auto flex max-w-[960px] flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>Solution Velocity · Engineering work, connected.</span>
          <nav aria-label="Footer navigation" className="flex flex-wrap gap-5">
            <Link to="/terms" className="hover:text-blue-700">Terms of Service</Link>
            <Link to="/privacy" className="hover:text-blue-700">Privacy Policy</Link>
            <Link to="/signup" className="hover:text-blue-700">Get Started</Link>
            <Link to="/login" className="hover:text-blue-700">Log In</Link>
            <button type="button" onClick={openCookiePreferences} className="hover:text-blue-700">Cookie preferences</button>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export function LegalSection({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold text-[#12394f]">{heading}</h2>
      <div className="mt-3 space-y-3 text-sm leading-7 text-slate-600">{children}</div>
    </section>
  );
}
