import type { CookieConsent } from '@sv/shared';

const STORAGE_KEY = 'sv_cookie_consent';
const EVENT_NAME = 'sv:cookie-consent-changed';
const OPEN_MODAL_EVENT = 'sv:open-cookie-modal';

export function getCookieConsent(): CookieConsent | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.analytics === 'boolean') {
      return {
        essential: true,
        analytics: parsed.analytics,
        decidedAt: parsed.decidedAt || new Date().toISOString()
      };
    }
  } catch {
    // Ignore JSON parse errors or access exceptions
  }
  return null;
}

export function hasCookieConsent(): boolean {
  return getCookieConsent() !== null;
}

export function setCookieConsent(analytics: boolean): CookieConsent {
  const consent: CookieConsent = {
    essential: true,
    analytics,
    decidedAt: new Date().toISOString()
  };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
    // Also save in a lax cookie for server-side hints if needed (1 year expiry)
    const maxAge = 365 * 24 * 60 * 60;
    document.cookie = `sv_cookie_consent=${analytics ? '1' : '0'}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } catch {
    // Ignore storage errors
  }

  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: consent }));
  return consent;
}

export function openCookiePreferences(): void {
  window.dispatchEvent(new CustomEvent(OPEN_MODAL_EVENT));
}

export function onCookieConsentChange(callback: (consent: CookieConsent | null) => void): () => void {
  const handler = (e: Event) => {
    const custom = e as CustomEvent<CookieConsent>;
    callback(custom.detail);
  };
  window.addEventListener(EVENT_NAME, handler);
  return () => window.removeEventListener(EVENT_NAME, handler);
}

export function onOpenCookiePreferences(callback: () => void): () => void {
  window.addEventListener(OPEN_MODAL_EVENT, callback);
  return () => window.removeEventListener(OPEN_MODAL_EVENT, callback);
}
