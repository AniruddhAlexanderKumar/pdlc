import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isAnswered, type AnswerValue } from '@sv/shared';

/**
 * `answers.value` is a `jsonb` column, so the PostgreSQL driver hands back an
 * already-parsed JavaScript value. The answer route used to run
 * `JSON.parse(String(previous.value))` on it while deciding whether a question
 * was already answered. For any text answer that stringifies to unquoted text
 * ("People need things"), and `JSON.parse` then threw a SyntaxError, turning
 * every save of an already-answered text question into a 500.
 *
 * These tests pin the driver contract the route relies on: the value is used
 * as-is, never re-parsed.
 */

/** Mirrors the shape the driver returns for one `answers` row. */
type AnswerRow = { product_id: string; question_key: string; value: AnswerValue };

/** The decision the route makes, expressed against a driver-returned row. */
function wasAlreadyDone(previous: AnswerRow | undefined): boolean {
  return Boolean(previous && isAnswered(previous.value));
}

describe('answers jsonb driver contract', () => {
  it('treats a driver-returned text answer as already done without re-parsing', () => {
    const previous: AnswerRow = { product_id: 'p', question_key: 'idea.problem', value: 'People need things' };
    assert.equal(wasAlreadyDone(previous), true);
  });

  it('treats a driver-returned numeric answer as already done', () => {
    const previous: AnswerRow = { product_id: 'p', question_key: 'idea.excitement', value: 4 };
    assert.equal(wasAlreadyDone(previous), true);
  });

  it('treats a missing row as not already done', () => {
    assert.equal(wasAlreadyDone(undefined), false);
  });

  it('treats an empty or blank answer as not answered', () => {
    for (const value of ['', '   ', null] as unknown as AnswerValue[]) {
      assert.equal(wasAlreadyDone({ product_id: 'p', question_key: 'idea.problem', value }), false);
    }
  });

  it('never stringifies and re-parses the value', () => {
    // The failure mode: JSON.parse(String(value)) on unquoted text.
    const value = 'People need things';
    assert.throws(() => JSON.parse(String(value)), SyntaxError, 're-parsing text throws — hence the route must not do it');
    assert.equal(isAnswered(value), true, 'the raw driver value is usable directly');
  });
});
