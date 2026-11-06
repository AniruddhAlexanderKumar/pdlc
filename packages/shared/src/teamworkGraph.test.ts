import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { connectedIds, impactIds, type GraphEdge } from './teamworkGraph.js';
const edge = (id: string, source: string, target: string, type: GraphEdge['type'] = 'depends_on'): GraphEdge => ({ id, source, target, type, editable: true });
const edges = [edge('1', 'B', 'A'), edge('2', 'C', 'B'), edge('3', 'D', 'C'), edge('4', 'A', 'D', 'relates_to'), edge('5', 'B', 'C')];
test('impact follows dependents, never unrelated links, and respects depth', () => {
  assert.deepEqual([...impactIds('A', edges, 1)].sort(), ['A', 'B']);
  assert.deepEqual([...impactIds('A', edges, 2)].sort(), ['A', 'B', 'C']);
  assert.deepEqual([...impactIds('A', edges, 5)].sort(), ['A', 'B', 'C', 'D']);
});
test('connected traversal is bidirectional, bounded and cycle safe', () => {
  assert.deepEqual([...connectedIds('A', edges, 1)].sort(), ['A', 'B', 'D']);
  assert.deepEqual([...connectedIds('A', edges, 2)].sort(), ['A', 'B', 'C', 'D']);
  assert.deepEqual([...connectedIds('isolated', edges, 3)], ['isolated']);
});
