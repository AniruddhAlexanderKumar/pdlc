import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatIssueKey } from './projects.js';

describe('formatIssueKey', () => {
  it('combines a project key and positive issue number', () => {
    assert.equal(formatIssueKey('SV', 42), 'SV-42');
  });

  it('rejects invalid issue numbers', () => {
    for (const value of [0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN]) {
      assert.throws(() => formatIssueKey('SV', value), RangeError);
    }
  });
});
