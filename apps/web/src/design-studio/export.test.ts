import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { diagramSvg, exportFilename } from './export';
import type { DiagramSource } from '@sv/shared';

test('SVG export escapes user text and includes nodes and connectors', () => {
  const source: DiagramSource = {schemaVersion:1, nodes:[
    {id:'a',label:'<script>&\u0000',x:0,y:0},{id:'b',label:'Second',x:200,y:100}
  ], edges:[{id:'e',from:'a',to:'b',label:'A & B'}]};
  const svg = diagramSvg(source);
  assert.match(svg, /&lt;script&gt;&amp;/); assert.doesNotMatch(svg, /<script>/);
  assert.doesNotMatch(svg, /\u0000/); assert.match(svg, /A &amp; B/); assert.match(svg, /<line /); assert.match(svg, /Second/);
});
test('export filenames do not contain path separators', () => {
  assert.equal(exportFilename('../my/design', 'png'), 'mydesign.png');
  assert.equal(exportFilename('...', 'svg'), 'diagram.svg');
});
