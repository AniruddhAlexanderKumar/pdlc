import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SCENARIO, SCENARIO_BY_ID, STEPS } from './scenario';

describe('fictional engineering walkthrough', () => {
  it('uses unique identifiers and resolves every relationship and stage reference', () => {
    assert.equal(new Set(SCENARIO.map(r => r.id)).size, SCENARIO.length);
    for (const record of SCENARIO) for (const linked of record.links) assert.ok(SCENARIO_BY_ID[linked], `${record.id} has missing link ${linked}`);
    for (const step of STEPS) for (const id of step.records) assert.ok(SCENARIO_BY_ID[id], `${step.title} has missing record ${id}`);
  });
  it('keeps test outcomes, supporting evidence and readiness consistent', () => {
    assert.equal(SCENARIO_BY_ID['VRF-006'].status, 'Passed');
    assert.deepEqual(SCENARIO_BY_ID['VRF-006'].links, ['REQ-014', 'EVD-009']);
    assert.equal(SCENARIO_BY_ID['VRF-011'].status, 'Failed');
    assert.ok(SCENARIO_BY_ID['VRF-011'].links.includes('REQ-021'));
    assert.ok(SCENARIO_BY_ID['VRF-011'].links.includes('EVD-012'));
    assert.equal(SCENARIO_BY_ID['REL-002'].status, 'Blocked');
    assert.ok(SCENARIO_BY_ID['REL-002'].links.includes('VRF-011'));
    assert.ok(SCENARIO_BY_ID['EVD-012'].detail.includes('failed'));
  });
});
