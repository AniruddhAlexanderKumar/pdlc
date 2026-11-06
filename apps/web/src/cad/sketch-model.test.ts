import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rectangleGeometry,startHistory,undoSketch,type Sketch,type SketchConstraint} from '@sv/cad-core';
import {contentFingerprint,rebaseHistory,transaction} from './sketch-model';
const empty:Sketch={schemaVersion:1,id:'sketch',plane:'XY',units:'m',revision:1,entities:[],constraints:[]};let i=0;const id=()=>`id${i++}`,meta=(id:string)=>({id,ownerId:'owner',createdAt:'2026-01-01T00:00:00Z',construction:false,visible:true});
test('editor rectangle and dimensional edit are atomic and survive revision rebasing',()=>{
 const g=rectangleGeometry([0,0],[.01,.02],meta,id);const [a,b]=g.entities;const constraints:SketchConstraint[]=[...g.constraints,{id:id(),enabled:true,type:'fixed-point',point:{entityId:a.id,point:'start'},target:[0,0]},{id:'width',enabled:true,type:'line-length',lineId:a.id,metres:.01},{id:'height',enabled:true,type:'line-length',lineId:b.id,metres:.02}];
 const created=transaction(startHistory(empty),{...empty,...g,constraints});assert.equal(created.result.dof,0);const edited=transaction(created.history,{...created.history.current,constraints:created.history.current.constraints.map(c=>c.id==='width'?{...c,metres:.012} as SketchConstraint:c)});assert.equal(edited.result.dof,0);const width=edited.history.current.entities.find(e=>e.id===a.id);assert(width?.type==='line');assert(Math.abs(Math.hypot(width.end[0]-width.start[0],width.end[1]-width.start[1])-.012)<1e-9);
 const rebased=rebaseHistory(edited.history,{...edited.history.current,revision:2});assert.equal(undoSketch(rebased).current.revision,2);
 const conflicting=transaction(rebased,{...rebased.current,constraints:[...rebased.current.constraints,{id:id(),enabled:true,type:'line-length',lineId:a.id,metres:.015}]});assert.equal(conflicting.result.status,'inconsistent');assert.strictEqual(conflicting.history,rebased);
});
test('acknowledgement comparison ignores server attribution but not geometry or name',()=>{
 const a:Sketch={...empty,entities:[{...meta('p'),type:'point',position:[0,0]}]},b:Sketch={...a,revision:2,entities:a.entities.map(e=>({...e,ownerId:'server',createdAt:'2026-02-01T00:00:00Z'}))};assert.equal(contentFingerprint('A',a),contentFingerprint('A',b));assert.notEqual(contentFingerprint('A',a),contentFingerprint('B',b));
 assert.throws(()=>transaction(startHistory(empty),{...empty,entities:Array.from({length:17},(_,n)=>({...meta(`${n}`),type:'point' as const,position:[n,0] as const}))}));
});
