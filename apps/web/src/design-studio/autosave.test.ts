import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { DiagramSource } from '@sv/shared';
import { diagramDraftProblem } from './autosave';
const draft: DiagramSource = {schemaVersion:1,nodes:[{id:'a',label:'Box',x:0,y:1120}],edges:[]};
test('autosave waits for valid editable values', () => {
  assert.equal(diagramDraftProblem(draft),null);
  assert.match(diagramDraftProblem({...draft,nodes:[{...draft.nodes[0],label:'  '}]})!,/label/);
  assert.match(diagramDraftProblem({...draft,nodes:[{...draft.nodes[0],x:1761}]})!,/coordinates/);
  assert.match(diagramDraftProblem({...draft,nodes:[{...draft.nodes[0],y:NaN}]})!,/coordinates/);
  assert.equal(draft.nodes[0].label,'Box');
});
