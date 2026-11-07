import { z } from "zod";
import { entityIdSchema } from "./shared/identifier";
import {
  requirementPrioritySchema,
  verificationMethodSchema,
  type VerificationMethod,
} from "./shared/enums";

/**
 * Two automations for the work a newcomer finds most repetitive:
 *
 * 1. **Adding several requirements at once.** Requirements usually already
 *    exist somewhere — a spec, an email, a spreadsheet column. Paste them,
 *    one per line, and each becomes a draft requirement: numbered
 *    automatically, titled from its own first words.
 * 2. **Planning a check for each requirement.** Every requirement needs a
 *    way to show it is met. Instead of creating each verification activity
 *    by hand and then linking it back, one action plans a check for every
 *    requirement that has none (or for one chosen requirement) and links it.
 *
 * Both only *create drafts and plans*: nothing is approved, passed or
 * verified by automation. A planned check is exactly what someone would
 * have created by hand — PLANNED, with a title that says what it checks.
 */

// --- Adding several requirements at once ---------------------------------------

/** Per paste — enough for a real specification section, small enough for one transaction. */
export const MAX_REQUIREMENTS_PER_PASTE = 200;

/** Longest automatic title; the full text always stays in the statement. */
export const DERIVED_TITLE_MAX = 80;

/**
 * Splits pasted text into one statement per non-empty line, removing the
 * list markers people paste along with the words: `-`, `*`, `•`, `1.`,
 * `1)`, `a)`, and a leading checkbox `[ ]`. The words themselves are never
 * rewritten.
 */
export function parseRequirementLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*(?:[-*•‣◦▪]|\d{1,3}[.)]|[a-zA-Z][.)](?=\s))\s+/, "")
        .replace(/^\s*\[[ xX]?\]\s+/, "")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((line) => line.length > 0);
}

/**
 * A short title from a statement's own first words: the first sentence,
 * without its closing full stop, cut at a word boundary to
 * {@link DERIVED_TITLE_MAX} characters with an ellipsis when it had to be
 * cut. Nothing is invented — every word comes from the statement.
 */
export function deriveRequirementTitle(statement: string): string {
  const flat = statement.replace(/\s+/g, " ").trim();
  const firstSentence = flat.split(/(?<=[.!?])\s/)[0] ?? flat;
  const withoutStop = firstSentence.replace(/[.!?]+$/, "");
  if (withoutStop.length <= DERIVED_TITLE_MAX) return withoutStop;
  const cut = withoutStop.slice(0, DERIVED_TITLE_MAX - 1);
  const atWord = cut.slice(0, Math.max(cut.lastIndexOf(" "), Math.floor(DERIVED_TITLE_MAX / 2)));
  return `${atWord.trimEnd()}…`;
}

export const createRequirementsInBulkRequestSchema = z.strictObject({
  statements: z
    .array(z.string().trim().min(1, "A requirement cannot be empty").max(10_000))
    .min(1, "Add at least one requirement")
    .max(MAX_REQUIREMENTS_PER_PASTE, `Add at most ${MAX_REQUIREMENTS_PER_PASTE} at a time`),
  priority: requirementPrioritySchema.optional(),
});

export type CreateRequirementsInBulkRequest = z.infer<typeof createRequirementsInBulkRequestSchema>;

// --- Planning checks --------------------------------------------------------------

/** What each way of checking means, in words a newcomer can choose between. */
export const VERIFICATION_METHOD_CHOICES: readonly {
  method: VerificationMethod;
  label: string;
  explanation: string;
}[] = [
  { method: "TEST", label: "Test it", explanation: "Run it and measure the result." },
  { method: "ANALYSIS", label: "Analyse it", explanation: "Calculate or simulate that it will work." },
  {
    method: "INSPECTION",
    label: "Inspect it",
    explanation: "Look at it, or review its drawings and documents.",
  },
  { method: "DEMONSTRATION", label: "Demonstrate it", explanation: "Show it working, without measuring." },
];

/** Verification activity titles are limited to 300 characters. */
const CHECK_TITLE_MAX = 300;

/** The planned check's title: says which requirement it checks, in the requirement's own words. */
export function checkTitleFor(requirementIdentifier: string, requirementTitle: string): string {
  const title = `Check ${requirementIdentifier}: ${requirementTitle}`;
  return title.length <= CHECK_TITLE_MAX ? title : `${title.slice(0, CHECK_TITLE_MAX - 1)}…`;
}

export const planChecksRequestSchema = z.strictObject({
  method: verificationMethodSchema,
  /**
   * Plan for exactly these requirements. Left out: every requirement in the
   * project that has no check yet and is not obsolete.
   */
  requirementIds: z.array(entityIdSchema).min(1).max(500).optional(),
});

export type PlanChecksRequest = z.infer<typeof planChecksRequestSchema>;
