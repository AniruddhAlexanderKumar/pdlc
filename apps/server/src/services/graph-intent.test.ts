import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { parseGraphIntent } from './graph-intent.js';

test('accepts only approved operations, including fenced JSON', () => {
  assert.equal(parseGraphIntent('```json\n{"intent":"impact"}\n```', 'impact on GRAPH-12').intent, 'impact');
  assert.throws(() => parseGraphIntent('{"intent":"execute_sql","sql":"DROP TABLE issues"}', 'anything'));
  assert.throws(() => parseGraphIntent('not json', 'anything'));
});
test('a model cannot supply a person not present in the question', () => {
  assert.equal(parseGraphIntent('{"intent":"assigned","person":"Jane"}', 'Show work assigned to Jane').intent, 'assigned');
  assert.equal(parseGraphIntent('{"intent":"assigned","person":"Alice"}', 'Show work assigned to Jane').intent, 'unsupported');
});
