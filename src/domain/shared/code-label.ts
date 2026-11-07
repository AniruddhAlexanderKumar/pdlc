/**
 * Stored codes as words.
 *
 * Statuses, states and object types are stored and sent as constants —
 * `NOT_READY`, `DRIFT_DETECTED`, `SUPPLIED_ITEM` — which is right for the
 * API and wrong for a person. Where a module has its own label table
 * (`readinessStatusLabel` and friends) that table wins, because it can
 * say more than the constant does. This is for everywhere else: a
 * mechanical, lossless reading of the constant, so nothing reaches the
 * screen in capitals and underscores.
 */

/** Anything already in words — including mixed case — is left alone. */
const CODE_PATTERN = /^[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*$/;

/** "NOT_READY" → "Not ready", for a label or badge. */
export function codeLabel(code: string): string {
  if (!CODE_PATTERN.test(code)) return code;
  const words = code.toLowerCase().replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** "NOT_READY" → "not ready", for the middle of a sentence. */
export function codeWords(code: string): string {
  return CODE_PATTERN.test(code) ? code.toLowerCase().replaceAll("_", " ") : code;
}
