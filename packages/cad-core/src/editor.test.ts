import {test} from 'node:test';
import assert from 'node:assert/strict';
import {commitSketch,moveEntities,redoSketch,rectangleGeometry,removeEntities,snapPoint,startHistory,undoSketch} from './editor.js';
import type {Sketch,SketchConstraint} from './sketch.js';
const empty:Sketch={schemaVersion:1,id:'s',plane:'XY',units:'m',revision:1,entities:[],constraints:[]};
const metadata=(id:string)=>({id,ownerId:'u',createdAt:'2026-01-01T00:00:00Z',construction:false,visible:true});let counter=0;const id=()=>`${++counter}`;
test('rectangle uses four editable lines, connectivity and history captures geometry and constraints',()=>{
 const geometry=rectangleGeometry([0,0],[.01,.02],metadata,id);let history=startHistory(empty);
 history=commitSketch(history,{...history.current,...geometry}).history;assert.equal(history.current.entities.length,4);assert.equal(history.current.constraints.length,8);
 const saved=JSON.stringify(history.current);history=undoSketch(history);assert.equal(history.current.entities.length,0);assert.equal(history.current.constraints.length,0);history=redoSketch(history);assert.equal(JSON.stringify(history.current),saved);
 const line=geometry.entities[0].id;const candidate=removeEntities(history.current,[line]);history=commitSketch(history,candidate).history;assert.equal(history.current.entities.length,3);assert.equal(history.current.constraints.length,5);history=undoSketch(history);assert.equal(JSON.stringify(history.current),saved);
 assert.throws(()=>rectangleGeometry([0,0],[0,1],metadata,id));
});
test('constrained dimensional edit and conflict are atomic and undoable',()=>{
 const g=rectangleGeometry([0,0],[.01,.02],metadata,id);const first=g.entities[0].id,second=g.entities[1].id;
 const constraints:SketchConstraint[]=[...g.constraints,{id:id(),enabled:true,type:'fixed-point',point:{entityId:first,point:'start'},target:[0,0]},{id:'width',enabled:true,type:'line-length',lineId:first,metres:.01},{id:'height',enabled:true,type:'line-length',lineId:second,metres:.02}];
 let h=commitSketch(startHistory(empty),{...empty,entities:g.entities,constraints}).history;
 const edited={...h.current,constraints:h.current.constraints.map(c=>c.id==='width'?{...c,metres:.012} as SketchConstraint:c)};const changed=commitSketch(h,edited);assert.equal(changed.result.dof,0);h=changed.history;const old=h.undo.at(-1)!;
 assert.equal((h.current.constraints.find(c=>c.id==='height') as {metres:number}).metres,.02);h=undoSketch(h);assert.deepEqual(h.current,old);h=redoSketch(h);assert.equal((h.current.constraints.find(c=>c.id==='width') as {metres:number}).metres,.012);
 const failed=commitSketch(h,{...h.current,constraints:[...h.current.constraints,{id:id(),enabled:true,type:'line-length',lineId:first,metres:.015}]});assert.equal(failed.result.status,'inconsistent');assert.strictEqual(failed.history,h);
});
test('movement and snap results derive from actual sketch geometry',()=>{
 const p={...metadata('p'),type:'point' as const,position:[.01,.02] as const};let h=commitSketch(startHistory(empty),{...empty,entities:[p]}).history;
 h=commitSketch(h,moveEntities(h.current,['p'],[.002,0])).history;assert.deepEqual((h.current.entities[0] as typeof p).position,[.012,.02]);assert.equal(snapPoint(h.current,[.0121,.02],.001,.005).entityId,'p');assert.equal(snapPoint(h.current,[.0001,0],.001,.005).kind,'origin');assert.equal(snapPoint(h.current,[.0051,.005],.001,.005).kind,'grid');assert.equal(snapPoint(h.current,[.008,.009],.0001,.005).kind,'none');h=undoSketch(h);assert.deepEqual((h.current.entities[0] as typeof p).position,[.01,.02]);
});
