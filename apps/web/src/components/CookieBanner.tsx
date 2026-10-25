import { useEffect, useState } from 'react';
import { Cookie, Shield, ShieldCheck, X } from 'lucide-react';
import {
  getCookieConsent,
  hasCookieConsent,
  onOpenCookiePreferences,
  setCookieConsent
} from '../lib/cookieConsent';
import { Button, Modal } from './ui';

export function CookieBanner() {
  const [showBanner, setShowBanner] = useState(false);
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(false);

  useEffect(() => {
    // Check if user has already made a choice
    const consent = getCookieConsent();
    if (!consent) {
      setShowBanner(true);
      setAnalyticsEnabled(true);
    } else {
      setShowBanner(false);
      setAnalyticsEnabled(consent.analytics);
    }

    // Allow opening preferences from anywhere (e.g. Settings page, Footer, Menu)
    const unsubscribe = onOpenCookiePreferences(() => {
      const current = getCookieConsent();
      setAnalyticsEnabled(current?.analytics ?? true);
      setPreferencesOpen(true);
    });

    return unsubscribe;
  }, []);

  const handleAcceptAll = () => {
    setCookieConsent(true);
    setShowBanner(false);
    setPreferencesOpen(false);
  };

  const handleDecline = () => {
    setCookieConsent(false);
    setShowBanner(false);
    setPreferencesOpen(false);
  };

  const handleSavePreferences = () => {
    setCookieConsent(analyticsEnabled);
    setShowBanner(false);
    setPreferencesOpen(false);
  };

  return (
    <>
      {/* ── Cookie Consent Banner ────────────────────────────────────────── */}
      {showBanner && (
        <aside
          role="region"
          aria-label="Cookie consent banner"
          className="fixed bottom-0 left-0 right-0 z-50 p-3 sm:p-5 pointer-events-none animate-rise"
        >
          <div className="mx-auto max-w-4xl rounded-2xl border border-zinc-200 bg-white/95 p-4 shadow-2xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-900/95 sm:p-5 pointer-events-auto">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-600 dark:bg-indigo-400/10 dark:text-indigo-400">
                  <Cookie className="h-5 w-5" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                    Your Privacy Choices
                  </h3>
                  <p className="text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                    We use essential cookies to keep you signed in and secure. We also use self-hosted, server-side
                    analytics to understand page views and actions so we can improve your experience. We never sell your
                    data or use third-party ads.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setPreferencesOpen(true)}
                  className="text-xs"
                >
                  Preferences
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleDecline}
                  className="text-xs"
                >
                  Essential only
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleAcceptAll}
                  className="text-xs"
                >
                  Accept all
                </Button>
              </div>
            </div>
          </div>
        </aside>
      )}

      {/* ── Cookie Preferences Modal ────────────────────────────────────── */}
      {preferencesOpen && (
        <Modal
          title="Cookie & Privacy Preferences"
          subtitle="Control which cookies and analytics features you wish to permit."
          onClose={() => setPreferencesOpen(false)}
          size="md"
          footer={
            <div className="flex w-full items-center justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={handleDecline}>
                Decline all non-essential
              </Button>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setPreferencesOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" size="sm" onClick={handleSavePreferences}>
                  Save preferences
                </Button>
              </div>
            </div>
          }
        >
          <div className="space-y-4">
            {/* Strictly Necessary Cookies */}
            <div className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/40">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      Strictly Necessary Cookies
                    </p>
                    <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      Always Active
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Essential for secure authentication, session management, CSRF prevention, and basic website
                    operations. These cannot be switched off.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked
                disabled
                className="mt-1 h-4 w-4 rounded border-zinc-300 text-indigo-600 opacity-60 cursor-not-allowed"
                aria-label="Strictly Necessary Cookies (Always Active)"
              />
            </div>

            {/* Analytics Cookies */}
            <div className="flex items-start justify-between gap-3 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-800/40">
              <div className="flex items-start gap-3">
                <Shield className="mt-0.5 h-5 w-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                      Server-Hosted Analytics
                    </p>
                    <span className="rounded-full bg-indigo-500/10 px-2 py-0.5 text-[10px] font-medium text-indigo-600 dark:text-indigo-400">
                      Optional
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                    Helps us understand how the product is used, which pages are visited, and what features are
                    popular. All analytics data is securely hosted on our own servers without any third-party data
                    sharing or ad profiling.
                  </p>
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer mt-1">
                <input
                  type="checkbox"
                  checked={analyticsEnabled}
                  onChange={(e) => setAnalyticsEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-10 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-zinc-600 peer-checked:bg-indigo-600"></div>
                <span className="sr-only">Toggle Server-Hosted Analytics</span>
              </label>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
