import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeModelStl } from './model-stl.js';

test('each built-in shape exports a closed mesh with the requested dimensions', () => {
  for (const [profile, facets, depth] of [['rectangle', 12, 25], ['triangle', 8, 25], ['circle', 256, 40]] as const) {
    const mesh = new DataView(makeModelStl({ profile, width: 40, depth: 25, height: 12 }));
    assert.equal(mesh.getUint32(80, true), facets);
    assert.equal(mesh.byteLength, 84 + facets * 50);
    const vertices: number[][] = [];
    const edges = new Map<string, number>();
    for (let i = 0; i < facets; i++) {
      const points = [0, 1, 2].map(vertex => [0, 1, 2].map(axis =>
        mesh.getFloat32(96 + i * 50 + vertex * 12 + axis * 4, true)
      ));
      vertices.push(...points);
      for (let j = 0; j < 3; j++) {
        const key = [points[j].join(','), points[(j + 1) % 3].join(',')].sort().join('|');
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    }
    assert([...edges.values()].every(count => count === 2));
    [40, depth, 12].forEach((dimension, axis) => {
      const coordinates = vertices.map(point => point[axis]);
      assert.equal(Math.max(...coordinates) - Math.min(...coordinates), dimension);
    });
  }
});
