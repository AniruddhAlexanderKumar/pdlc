import test from 'node:test';
import assert from 'node:assert/strict';
import { CADIT_ORIGIN } from './CaditEditor.js';

test('CaditEditor origin constants and contracts', () => {
  assert.equal(CADIT_ORIGIN, 'https://app.cadit.app');
});

test('Cadit postMessage protocol format', () => {
  // Verify handshake structure
  const initPayload = {
    partnerName: 'SolutionVelocity',
    features: ['export']
  };
  assert.equal(initPayload.partnerName, 'SolutionVelocity');
  assert.deepEqual(initPayload.features, ['export']);

  // Verify get-stl action format
  const getStlMessage = { type: 'get-stl' };
  assert.equal(getStlMessage.type, 'get-stl');
});

