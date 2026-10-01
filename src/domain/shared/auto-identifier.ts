/**
 * Automatic record numbering: `REQ-001`, `REQ-002`, … per record type.
 *
 * Every create request accepts an `identifier`, and before this every form
 * required one — a hand-typed key that a newcomer had to invent, keep
 * unique, and get rejected for when it collided. Now it is optional: leave
 * it out and the service assigns the next number for that record type in
 * that scope. Supplying one still works exactly as before, for teams that
 * carry identifiers over from another system.
 *
 * The prefixes are the ones every create form already suggested as its
 * placeholder, so automatically numbered records look exactly like the
 * ones people were typing by hand.
 */

export const RECORD_IDENTIFIER_PREFIXES = {
  requirement: "REQ",
  stakeholderNeed: "SN",
  designItem: "DI",
  decision: "ED",
  verificationActivity: "VER",
  evidence: "EV",
  risk: "RSK",
  issue: "ISS",
  changeRequest: "CR",
  supplier: "SUP",
  suppliedItem: "SI",
  baseline: "BL",
  observation: "OBS",
  certificationProgram: "CERT",
  certificationBasis: "CB",
  complianceItem: "CI",
  certificationFinding: "CF",
} as const;

export type NumberedRecordKind = keyof typeof RECORD_IDENTIFIER_PREFIXES;

/** Digits a generated number is padded to: `REQ-007`, then `REQ-1000` once it outgrows them. */
const MIN_DIGITS = 3;

/** `REQ-` for `requirement` — the `startsWith` filter for finding existing numbers. */
export function identifierPrefix(kind: NumberedRecordKind): string {
  return `${RECORD_IDENTIFIER_PREFIXES[kind]}-`;
}

/**
 * The next free number after the highest one already used.
 *
 * Only identifiers of exactly the generated shape (`REQ-` then digits)
 * count: `REQ-12` and `REQ-012` both mean twelve, while a hand-chosen
 * `REQ-PROP-1` or an imported `SCN-42-REQ-001` is left alone — it neither
 * advances the counter nor can it collide with a generated number. The
 * highest, not the count: deleting `REQ-002` never makes `REQ-004` be
 * handed out twice.
 */
export function nextIdentifier(kind: NumberedRecordKind, existing: Iterable<string>): string {
  const prefix = identifierPrefix(kind);
  const pattern = new RegExp(`^${prefix}(\\d+)$`);
  let highest = 0;
  for (const identifier of existing) {
    const match = pattern.exec(identifier);
    if (match?.[1]) highest = Math.max(highest, Number(match[1]));
  }
  return `${prefix}${String(highest + 1).padStart(MIN_DIGITS, "0")}`;
}
