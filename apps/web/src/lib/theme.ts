import { useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';
const KEY = 'sv-theme';

function initial(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // storage unavailable: fall through to system preference
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

let current: Theme = initial();
const listeners = new Set<() => void>();

function apply(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

function setTheme(theme: Theme) {
  current = theme;
  apply(theme);
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

export function useTheme() {
  const theme = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => current
  );
  return { theme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') };
}

// Apply before React renders to avoid a flash of the wrong theme.
apply(current);
