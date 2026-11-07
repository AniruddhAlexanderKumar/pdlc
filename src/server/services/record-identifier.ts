import { identifierPrefix, nextIdentifier, type NumberedRecordKind } from "@/domain/shared/auto-identifier";
import { ConflictError } from "@/server/errors";
import * as recordIdentifierRepository from "@/server/repositories/record-identifier.repository";

/** How many numbers are tried before giving up on a heavily contended scope. */
const MAX_ATTEMPTS = 3;

/**
 * Runs `create` with the identifier the caller asked for, or — when they
 * left it out — with the next automatic number for `kind` in `scopeId`.
 *
 * Two people saving the same record type at the same moment can both be
 * handed the same next number; the database's unique constraint lets one
 * win, and the loser's repository rethrows it as a `ConflictError`. For a
 * generated number that is not the caller's mistake, so the number is
 * re-picked (now past the winner's) and the whole `create` — normally a
 * `prisma.$transaction`, which has already rolled back — runs again.
 *
 * Retried only when the conflict really was over the number: after a
 * `ConflictError`, the number must now be taken. Any other conflict the
 * create raises (a certification program that already exists for the
 * project, say) is rethrown untouched, as is a conflict on an identifier
 * the caller chose themselves — they would otherwise get a different
 * number than the one they typed without being told.
 */
export async function withRecordIdentifier<T>(
  requested: string | null | undefined,
  kind: NumberedRecordKind,
  scopeId: string,
  create: (identifier: string) => Promise<T>,
): Promise<T> {
  if (requested) return create(requested);

  const prefix = identifierPrefix(kind);
  let existing = await recordIdentifierRepository.listIdentifiersWithPrefix(kind, scopeId, prefix);

  for (let attempt = 1; ; attempt += 1) {
    const identifier = nextIdentifier(kind, existing);
    try {
      return await create(identifier);
    } catch (error) {
      if (!(error instanceof ConflictError) || attempt >= MAX_ATTEMPTS) throw error;
      existing = await recordIdentifierRepository.listIdentifiersWithPrefix(kind, scopeId, prefix);
      if (!existing.includes(identifier)) throw error;
    }
  }
}
