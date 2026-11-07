/**
 * Data typography — how numbers, identifiers, units and dates read across
 * the product (Master Prompt 4 §3). Pure formatting only: nothing here
 * parses a stored decimal into a float and back, because that is exactly
 * the silent-reformatting this file exists to prevent. A value already
 * carries the precision an engine decided to keep (drift's NUMERIC(38,12)
 * columns arrive over the wire as exact strings, e.g. "780.500000000000") —
 * this file's job is to display that string, not improve it.
 */

/**
 * A stored decimal string, shown exactly as stored, with its unit appended
 * only when one is actually recorded. Returns "—" for null (never "0" or
 * an empty string, which would misreport a real recorded value).
 *
 * Never call `Number()`/`parseFloat` on the result and re-render it — that
 * throws away the exact precision this function exists to preserve, and
 * silently converts "780.500000000000" into "780.5".
 */
export function formatExactValue(value: string | null | undefined, unit: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "—";
  return unit ? `${value} ${unit}` : value;
}

/**
 * Whether a value has no unit recorded — distinct from "no value at all."
 * Callers use this to render an explicit "no unit recorded" marker rather
 * than silently rendering a bare number that reads as dimensionless by
 * omission.
 */
export function hasNoUnit(value: string | null | undefined, unit: string | null | undefined): boolean {
  return value !== null && value !== undefined && value !== "" && (unit === null || unit === undefined || unit === "");
}

/**
 * Relative time, for use only as a secondary annotation next to an
 * absolute ISO date — never alone on an engineering record (§3: "Never
 * '3 days ago' alone"). Coarse on purpose: this is a glance-level hint,
 * not a precise duration.
 */
export function formatRelativeTime(iso: string | null | undefined, now: Date = new Date()): string | null {
  if (!iso) return null;
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return null;

  const diffMs = now.getTime() - then.getTime();
  const diffSec = Math.round(diffMs / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHour = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHour / 24);

  if (Math.abs(diffSec) < 60) return "just now";
  if (Math.abs(diffMin) < 60) return diffMin >= 0 ? `${diffMin}m ago` : `in ${-diffMin}m`;
  if (Math.abs(diffHour) < 24) return diffHour >= 0 ? `${diffHour}h ago` : `in ${-diffHour}h`;
  if (Math.abs(diffDay) < 30) return diffDay >= 0 ? `${diffDay}d ago` : `in ${-diffDay}d`;
  return null; // Beyond a month, the absolute ISO date carries the information better.
}

/**
 * Composite identity: a `(projectId, identifier)` pair reduced to what a
 * reader needs to disambiguate it. `showProject` is true only where the
 * surrounding view could plausibly show artifacts from more than one
 * project (a cross-project matrix, a search result) — inside a single
 * project's own workspace the project is already established by the page,
 * and repeating it on every row would be noise.
 */
export function formatIdentifier(identifier: string, projectName?: string | null, showProject = false): string {
  return showProject && projectName ? `${projectName} / ${identifier}` : identifier;
}

/** Tailwind class for any numeric column — digits align regardless of column width. */
export const TABULAR_NUMS = "tabular-nums";
