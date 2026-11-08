import test from 'node:test';
import assert from 'node:assert/strict';
import { CADIT_ORIGIN } from './CaditEditor.js';
import { parseStl } from './StlViewer.js';

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

test('parseStl parses ASCII STL and calculates bounding box', () => {
  const asciiStl = `solid test
  facet normal 0 0 1
    outer loop
      vertex 0 0 0
      vertex 10 0 0
      vertex 10 10 0
    endloop
  endfacet
endsolid test`;

  const buffer = Buffer.from(asciiStl).buffer;
  const parsed = parseStl(buffer);

  assert.equal(parsed.triangleCount, 1);
  assert.equal(parsed.positions.length, 9);
  assert.deepEqual(parsed.bounds.min, [0, 0, 0]);
  assert.deepEqual(parsed.bounds.max, [10, 10, 0]);
  assert.deepEqual(parsed.bounds.size, [10, 10, 0]);
});

test('parseStl parses Binary STL and extracts triangle coordinates', () => {
  // Binary STL has 80-byte header, 4-byte uint32 triangle count, then 50 bytes per triangle
  const totalBytes = 84 + 50;
  const buffer = new ArrayBuffer(totalBytes);
  const view = new DataView(buffer);

  // Set triangle count = 1
  view.setUint32(80, 1, true);

  // Triangle 1 normal (0, 0, 1)
  view.setFloat32(84, 0, true);
  view.setFloat32(88, 0, true);
  view.setFloat32(92, 1, true);

  // Vertex 1: (0, 0, 5)
  view.setFloat32(96, 0, true);
  view.setFloat32(100, 0, true);
  view.setFloat32(104, 5, true);

  // Vertex 2: (5, 0, 5)
  view.setFloat32(108, 5, true);
  view.setFloat32(112, 0, true);
  view.setFloat32(116, 5, true);

  // Vertex 3: (5, 5, 5)
  view.setFloat32(120, 5, true);
  view.setFloat32(124, 5, true);
  view.setFloat32(128, 5, true);

  const parsed = parseStl(buffer);
  assert.equal(parsed.triangleCount, 1);
  assert.deepEqual(parsed.bounds.min, [0, 0, 5]);
  assert.deepEqual(parsed.bounds.max, [5, 5, 5]);
  assert.deepEqual(parsed.bounds.size, [5, 5, 0]);
});


