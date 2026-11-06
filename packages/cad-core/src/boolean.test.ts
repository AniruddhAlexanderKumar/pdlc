import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rectangleGeometry} from './editor.js';
import {extrudeSketch} from './kernel/extrude.js';
import {booleanBoxes} from './kernel/boolean-box.js';
import {checkTopology,solidProperties} from './kernel/topology.js';
import type {Sketch} from './sketch.js';
function box(id:string,x0:number,y0:number,z0:number,x1:number,y1:number,z1:number){let i=0;const g=rectangleGeometry([x0,y0],[x1,y1],e=>({id:e,ownerId:'u',createdAt:'2026-01-01T00:00:00Z',construction:false,visible:true}),()=>`${id}-${i++}`);const sketch:Sketch={schemaVersion:1,id,revision:1,plane:'XY',units:'m',...g};const r=extrudeSketch({sketch,operationId:id,distanceMetres:z1-z0,mode:'blind'});assert(r.ok);const s=r.value.solid;if(z0!==0){for(const v of s.vertices)v.point=[v.point[0],v.point[1],v.point[2]+z0];for(const e of s.edges)e.curve={...e.curve,start:[e.curve.start[0],e.curve.start[1],e.curve.start[2]+z0],end:[e.curve.end[0],e.curve.end[1],e.curve.end[2]+z0]};for(const f of s.faces)f.surface={...f.surface,origin:[f.surface.origin[0],f.surface.origin[1],f.surface.origin[2]+z0]};}return s;}
// Inputs have zero bottom to keep the source model's tolerance context unchanged.
const vol=(s:ReturnType<typeof box>)=>solidProperties(s).volumeMetres3;
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-12,`${a} != ${b}`);
test('overlapping boxes with shared cross-section support union, intersection, subtraction and split',()=>{
 const a=box('a',0,0,0,.01,.02,.005),b=box('b',.005,0,0,.015,.02,.005),before=JSON.stringify([a,b]);
 for(const [op,expected] of [['union',.015*.02*.005],['intersection',.005*.02*.005],['subtraction',.005*.02*.005]] as const){const r=booleanBoxes(op,a,b,`op-${op}`);assert(r.ok,r.ok?'':JSON.stringify(r.diagnostics));assert.equal(r.value.solids.length,1);near(vol(r.value.solids[0]),expected);assert.deepEqual(checkTopology(r.value.solids[0]),[]);assert.equal(r.value.solids[0].provenance.operation,'boolean');assert.deepEqual(r.value.solids[0].provenance.inputSolidIds,[a.id,b.id]);}
 const split=booleanBoxes('split',a,b,'split');assert(split.ok);assert.equal(split.value.solids.length,2);near(split.value.solids.reduce((n,s)=>n+vol(s),0),vol(a));assert.equal(JSON.stringify([a,b]),before);
});
test('disjoint, touching, containment and unsupported cavity operations return honest results',()=>{
 const a=box('a',0,0,0,.01,.02,.005),disjoint=box('d',.02,0,0,.03,.02,.005),touch=box('t',.01,0,0,.02,.02,.005),contained=box('c',.002,.003,0,.008,.017,.003);
 const u=booleanBoxes('union',a,disjoint,'disjoint');assert(u.ok);assert.equal(u.value.solids.length,2);const inter=booleanBoxes('intersection',a,disjoint,'inter');assert(inter.ok);assert.deepEqual(inter.value.solids,[]);
 const touchU=booleanBoxes('union',a,touch,'touch');assert(touchU.ok,touchU.ok?'':JSON.stringify(touchU.diagnostics));assert.equal(touchU.value.solids.length,1);near(vol(touchU.value.solids[0]),.02*.02*.005);
 const ci=booleanBoxes('intersection',a,contained,'contain');assert(ci.ok,ci.ok?'':JSON.stringify(ci.diagnostics));near(vol(ci.value.solids[0]),.006*.014*.003);
 const sub=booleanBoxes('subtraction',a,contained,'cavity');assert(!sub.ok);assert.equal(sub.diagnostics[0].code,'UNSUPPORTED_GEOMETRY');const corrupt=structuredClone(a);corrupt.edges.pop();const invalid=booleanBoxes('union',corrupt,disjoint,'bad');assert(!invalid.ok);assert.equal(invalid.diagnostics[0].code,'UNSUPPORTED_INPUT');
});
test('Boolean case boundaries fail closed and unchanged results do not alias their input',()=>{
 const a=box('a',0,0,0,.01,.02,.005),nearContact=box('b',.01000000001,0,0,.02,.02,.005),before=JSON.stringify(a);const uncertain=booleanBoxes('union',a,nearContact,'near');assert(!uncertain.ok);assert.equal(uncertain.diagnostics[0].code,'NUMERICALLY_UNCERTAIN');
 const separate=box('c',.03,0,0,.04,.02,.005),out=booleanBoxes('union',a,separate,'independent');assert(out.ok);out.value.solids[0].vertices[0].point=[9,9,9];assert.equal(JSON.stringify(a),before);
 const corner=box('e',.01,.02,0,.02,.03,.005),bad=booleanBoxes('union',a,corner,'contact');assert(!bad.ok);assert.equal(bad.diagnostics[0].code,'UNSUPPORTED_GEOMETRY');
 const falseIdentity=structuredClone(separate);falseIdentity.id=a.id;const sameId=booleanBoxes('union',a,falseIdentity,'collision');assert(!sameId.ok);assert.equal(sameId.diagnostics[0].code,'IDENTITY_CONFLICT');
});
test('subtraction supports two disconnected box components and preserves independent volume',()=>{
 const a=box('whole',0,0,0,.01,.02,.005),b=box('cut',.003,0,0,.007,.02,.005),r=booleanBoxes('subtraction',a,b,'slot');assert(r.ok,r.ok?'':JSON.stringify(r.diagnostics));assert.equal(r.value.solids.length,2);near(r.value.solids.reduce((n,s)=>n+vol(s),0),.006*.02*.005);
 const split=booleanBoxes('split',a,b,'split-interior');assert(split.ok);assert.equal(split.value.solids.length,3);near(split.value.solids.reduce((n,s)=>n+vol(s),0),vol(a));
});
test('general 3-axis box intersection computes independent overlap volume',()=>{
 const a=box('a3',0,0,0,.01,.02,.005),b=box('b3',.004,.006,0,.012,.015,.004),r=booleanBoxes('intersection',a,b,'xyz');assert(r.ok,r.ok?'':JSON.stringify(r.diagnostics));near(vol(r.value.solids[0]),.006*.009*.004);assert(r.value.solids[0].faces.every(f=>f.provenance.sourceEntityIds.length>0));
 const union=booleanBoxes('union',a,b,'xyz-union');assert(!union.ok);assert.equal(union.diagnostics[0].code,'UNSUPPORTED_GEOMETRY');
});
test('coincident and negative-depth boxes remain valid for supported operations',()=>{
 const a=box('same',0,0,0,.01,.02,.005);for(const op of ['union','intersection','split'] as const){const r=booleanBoxes(op,a,a,`same-${op}`);assert(r.ok,r.ok?'':JSON.stringify(r.diagnostics));assert.equal(r.value.solids.length,1);near(vol(r.value.solids[0]),vol(a));}const sub=booleanBoxes('subtraction',a,a,'same-sub');assert(sub.ok);assert.deepEqual(sub.value.solids,[]);
 let i=0;const g=rectangleGeometry([.005,0],[.015,.02],id=>({id,ownerId:'u',createdAt:'2026-01-01T00:00:00Z',construction:false,visible:true}),()=>`neg-${i++}`);const sketch:Sketch={id:'negative',schemaVersion:1,revision:1,plane:'XY',units:'m',...g};const n=extrudeSketch({sketch,operationId:'negative',distanceMetres:-.005,mode:'blind'});assert(n.ok);const clipped=booleanBoxes('intersection',n.value.solid,n.value.solid,'negative-intersection');assert(clipped.ok,clipped.ok?'':JSON.stringify(clipped.diagnostics));near(vol(clipped.value.solids[0]),.01*.02*.005);assert.deepEqual(solidProperties(clipped.value.solids[0]).bounds.min,[.005,0,-.005]);
});
