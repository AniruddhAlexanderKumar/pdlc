import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rewardOverrides, rewardValue } from './reward-rules.js';
test('bounded server reward overrides preserve unspecified and historical rules', () => {
  const r = rewardOverrides.parse('{"unit":60,"substantialLesson":22,"weekly":90}');
  assert.equal(rewardValue(r, 'unit_complete', 50), 60);
  assert.equal(rewardValue(r, 'answer', 20), 22);
  assert.equal(rewardValue(r, 'answer', 30), 30);
  assert.equal(rewardValue(r, 'answer', 5), 5);
  assert.equal(rewardValue(r, 'weekly_quest', 75), 90);
  assert.equal(rewardValue(r, 'task_done', 15), 15);
  assert.deepEqual(rewardOverrides.parse(''), {});
  for (const x of ['oops', '{"unit":0}', '{"level":10}', '{"weekly":1.1}', '{"world":1001}'])
    assert.equal(rewardOverrides.safeParse(x).success, false);
});
