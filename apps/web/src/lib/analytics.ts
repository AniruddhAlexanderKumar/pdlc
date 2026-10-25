import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router';
import type { AnalyticsEventInput } from '@sv/shared';
import { getCookieConsent, onCookieConsentChange } from './cookieConsent';

const ANON_KEY = 'sv_aid';

function getOrCreateAnonymousId(): string {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id = 'anon_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return 'anon_fallback';
  }
}

// In-memory queue for events triggered while consent banner is undecided
let eventQueue: AnalyticsEventInput[] = [];

async function flushEvents(eventsToSend: AnalyticsEventInput[]) {
  if (eventsToSend.length === 0) return;
  try {
    const payload = {
      events: eventsToSend.map((e) => ({
        ...e,
        anonymousId: e.anonymousId ?? getOrCreateAnonymousId()
      }))
    };

    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      const ok = navigator.sendBeacon('/api/analytics/track', blob);
      if (!ok) {
        await fetch('/api/analytics/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true
        });
      }
    } else {
      await fetch('/api/analytics/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
  } catch {
    // Fail silently so user interactions are never blocked
  }
}

// Listen to consent changes
if (typeof window !== 'undefined') {
  onCookieConsentChange((consent) => {
    if (consent?.analytics) {
      if (eventQueue.length > 0) {
        const queued = [...eventQueue];
        eventQueue = [];
        flushEvents(queued);
      }
    } else {
      eventQueue = [];
    }
  });
}

export function trackClientEvent(name: string, metadata?: Record<string, unknown>) {
  const consent = getCookieConsent();

  const event: AnalyticsEventInput = {
    type: 'action',
    name,
    pagePath: window.location.pathname + window.location.search,
    pageTitle: document.title,
    referrer: document.referrer || undefined,
    anonymousId: getOrCreateAnonymousId(),
    metadata
  };

  // If user declined analytics, do not track
  if (consent && consent.analytics === false) {
    return;
  }

  // If consent not decided yet, queue up to 20 events
  if (!consent) {
    if (eventQueue.length < 20) {
      eventQueue.push(event);
    }
    return;
  }

  // Consent is granted
  flushEvents([event]);
}

export function trackPageView(path: string, title?: string) {
  const consent = getCookieConsent();

  const event: AnalyticsEventInput = {
    type: 'page_view',
    name: 'page_view',
    pagePath: path,
    pageTitle: title || document.title,
    referrer: document.referrer || undefined,
    anonymousId: getOrCreateAnonymousId()
  };

  if (consent && consent.analytics === false) {
    return;
  }

  if (!consent) {
    if (eventQueue.length < 20) {
      eventQueue.push(event);
    }
    return;
  }

  flushEvents([event]);
}

/**
 * Hook to automatically track page navigation on route changes
 */
export function useAnalyticsPageView() {
  const location = useLocation();
  const lastPathRef = useRef<string>('');

  useEffect(() => {
    const currentPath = location.pathname + location.search;
    if (lastPathRef.current !== currentPath) {
      lastPathRef.current = currentPath;
      // Slight delay to ensure document.title is updated if dynamic
      const timer = setTimeout(() => {
        trackPageView(currentPath, document.title);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [location.pathname, location.search]);
}
