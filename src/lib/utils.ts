import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges class names, resolving conflicting Tailwind utility classes in
 * favor of the last one specified. Standard shadcn/ui-style helper used by
 * every component in `src/components/ui`.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/**
 * Formats an ISO timestamp as a plain ISO date (2026-01-15).
 *
 * Locale-independent on purpose: engineering records are read across sites,
 * and an unambiguous date beats a familiar one. Returns "—" for missing or
 * unparseable input rather than "Invalid Date".
 */
export function formatIsoDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toISOString().slice(0, 10);
}
