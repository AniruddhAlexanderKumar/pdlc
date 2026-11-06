import { test } from 'node:test';
import assert from 'node:assert/strict';
import { add2, angle2, angle3, cross3, determinant, invert, multiply, mmToMetres, metresToMm, normalize2, project2, rotation2, rotation3, transformPoint2, transformPoint3, transform2, translation3 } from './math.js';
import { arcPoint, circleArea, cubicBezierPoint, lineIntersection, type EntityMetadata } from './geometry.js';
import { validateSketch, type PointRef, type Sketch, type SketchConstraint } from './sketch.js';
import { solveSketch, tryConstraintChange } from './solver.js';
const near=(a:number,b:number,tol=1e-8)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);
const meta=(id:string):EntityMetadata=>({id,ownerId:'test-user',createdAt:'2026-01-01T00:00:00Z',construction:false,visible:true});
const p=(entityId:string,point:PointRef['point']):PointRef=>({entityId,point});
const enabled=<T extends object>(id:string,c:T)=>({id,enabled:true,...c});
const base=():Sketch=>({schemaVersion:1,id:'sketch',plane:'XY',units:'m',revision:0,entities:[],constraints:[]});
function rectangle():Sketch {
 const s=base();s.entities=[
  {...meta('a'),type:'line',start:[0.001,0.001],end:[0.012,0.002]},
  {...meta('b'),type:'line',start:[0.011,0.002],end:[0.011,0.021]},
  {...meta('c'),type:'line',start:[0.011,0.021],end:[0.001,0.021]},
  {...meta('d'),type:'line',start:[0.001,0.021],end:[0.001,0.001]},
 ];
 s.constraints=[
  enabled('ab',{type:'coincident',a:p('a','end'),b:p('b','start')}),enabled('bc',{type:'coincident',a:p('b','end'),b:p('c','start')}),enabled('cd',{type:'coincident',a:p('c','end'),b:p('d','start')}),enabled('da',{type:'coincident',a:p('d','end'),b:p('a','start')}),
  enabled('h1',{type:'horizontal',lineId:'a'}),enabled('v1',{type:'vertical',lineId:'b'}),enabled('h2',{type:'horizontal',lineId:'c'}),enabled('v2',{type:'vertical',lineId:'d'}),
  enabled('origin',{type:'fixed-point',point:p('a','start'),target:[0,0]}),enabled('width',{type:'line-length',lineId:'a',metres:0.01}),enabled('height',{type:'line-length',lineId:'b',metres:0.02}),
 ] as SketchConstraint[];return s;
}
test('vector, matrix, transform, conversion, invalid and singular cases',()=>{
 assert.deepEqual(add2([1,2],[3,4]),[4,6]);assert.deepEqual(cross3([1,0,0],[0,1,0]),[0,0,1]);near(angle2([1,0],[0,1]),Math.PI/2);near(angle3([1,0,0],[0,1,0]),Math.PI/2);assert.deepEqual(project2([3,4],[1,0]),[3,0]);
 near(mmToMetres(10),0.01);near(metresToMm(0.02),20);assert.throws(()=>normalize2([0,0]));assert.throws(()=>add2([Infinity,0],[1,1]));assert.throws(()=>invert([[1,2],[2,4]]));
 const M=[[1,2,3],[0,1,4],[5,6,0]];near(determinant(M),1);const I=multiply(M,invert(M));I.forEach((r,i)=>r.forEach((n,j)=>near(n,i===j?1:0)));
 const q=transformPoint2(transform2(Math.PI/2,[2,3]),[1,0]);near(q[0],2);near(q[1],4);
 const r=transformPoint3(multiply(translation3([1,2,3]),rotation3('z',Math.PI/2)),[1,0,0]);near(r[0],1);near(r[1],3);near(r[2],3);
});
test('primitive intersections, arcs, cubic Bezier and degeneracy',()=>{
 assert.deepEqual(lineIntersection({start:[0,0],end:[1,0]},{start:[0.5,-1],end:[0.5,1]}),{kind:'point',point:[0.5,0]});
 assert.equal(lineIntersection({start:[0,0],end:[1,0]},{start:[0,1],end:[1,1]}).kind,'parallel');assert.equal(lineIntersection({start:[0,0],end:[1,0]},{start:[2,0],end:[3,0]}).kind,'coincident');
 assert.throws(()=>lineIntersection({start:[0,0],end:[0,0]},{start:[0,0],end:[1,1]}));near(circleArea(1),Math.PI);const a=arcPoint({center:[0,0],radius:1,startAngle:0,sweep:Math.PI},0.5);near(a[0],0);near(a[1],1);assert.deepEqual(cubicBezierPoint([[0,0],[1,0],[1,1],[2,1]],0.5),[1,0.5]);assert.throws(()=>arcPoint({center:[0,0],radius:-1,startAngle:0,sweep:1},0));
});
test('rectangle solve, dimensional edits and in-memory JSON round-trip',()=>{
 const s=rectangle(),before=JSON.stringify(s),r=solveSketch(s);assert.equal(r.status,'fully-constrained',r.diagnostics.join());assert.equal(r.dof,0);assert.equal(r.rank,16);assert.equal(JSON.stringify(s),before);assert.ok(r.sketch);
 const width=r.sketch.constraints.map(c=>c.id==='width'?{...c,metres:0.012} as SketchConstraint:c);const update=tryConstraintChange(r.sketch,width);assert.equal(update.accepted,true);assert.equal(update.result.dof,0);
 const reopened=JSON.parse(JSON.stringify(update.sketch)) as Sketch;validateSketch(reopened);const h=reopened.constraints.map(c=>c.id==='height'?{...c,metres:0.025} as SketchConstraint:c);const update2=tryConstraintChange(reopened,h);assert.equal(update2.accepted,true);assert.equal(update2.result.dof,0);const e=update2.sketch.entities[0];assert.equal(e.type,'line');if(e.type==='line'){near(Math.hypot(e.end[0]-e.start[0],e.end[1]-e.start[1]),0.012,1e-9);near(e.start[0],0,1e-9);near(e.start[1],0,1e-9)}
});
test('rank-based degrees of freedom, redundancy and conflicting dimensions preserve original',()=>{
 const s=rectangle();const under=solveSketch({...s,constraints:s.constraints.filter(c=>c.id!=='height')});assert.equal(under.status,'underconstrained',under.diagnostics.join());assert.equal(under.dof,1);
 const good=solveSketch(s);assert.ok(good.sketch);const redundant=solveSketch({...good.sketch,constraints:[...good.sketch.constraints,enabled('dup',{type:'horizontal',lineId:'a'})] as SketchConstraint[]});assert.equal(redundant.status,'redundant',redundant.diagnostics.join());assert.equal(redundant.dof,0);
 const update=tryConstraintChange(good.sketch,[...good.sketch.constraints,enabled('conflict',{type:'line-length',lineId:'a',metres:0.015})] as SketchConstraint[]);assert.equal(update.accepted,false);assert.equal(update.result.status,'inconsistent');assert.deepEqual(update.result.conflictingConstraintIds,['width','conflict']);assert.strictEqual(update.sketch,good.sketch);
});
test('circle and line constraint families',()=>{
 const s=base();s.entities=[{...meta('a'),type:'line',start:[0,0],end:[0.01,0.001]},{...meta('b'),type:'line',start:[0,0],end:[0.001,0.015]},{...meta('circle'),type:'circle',center:[0.004,0.005],radius:0.003}];
 s.constraints=[enabled('fixed',{type:'fixed-line',lineId:'a',start:[0,0],end:[0.01,0]}),enabled('perp',{type:'perpendicular',lineA:'a',lineB:'b'}),enabled('equal',{type:'equal-length',lineA:'a',lineB:'b'}),enabled('join',{type:'coincident',a:p('a','start'),b:p('b','start')}),enabled('radius',{type:'diameter',circleId:'circle',metres:0.008}),enabled('center',{type:'fixed-point',point:p('circle','center'),target:[0.004,0.005]})] as SketchConstraint[];
 const r=solveSketch(s);assert.equal(r.status,'fully-constrained',r.diagnostics.join());assert.equal(r.dof,0);const c=r.sketch!.entities[2];assert.equal(c.type,'circle');if(c.type==='circle')near(c.radius,0.004,1e-9);
});
test('angle, parallel, horizontal and vertical distances, and linear distance',()=>{
 const s=base();s.entities=[{...meta('a'),type:'line',start:[0,0],end:[0.01,0]},{...meta('b'),type:'line',start:[0.002,0.003],end:[0.012,0.004]},{...meta('pt'),type:'point',position:[0.004,0.005]}];
 s.constraints=[enabled('fixed',{type:'fixed-line',lineId:'a',start:[0,0],end:[0.01,0]}),enabled('parallel',{type:'parallel',lineA:'a',lineB:'b'}),enabled('x',{type:'horizontal-distance',a:p('a','start'),b:p('b','start'),metres:0.002}),enabled('y',{type:'vertical-distance',a:p('a','start'),b:p('b','start'),metres:0.003}),enabled('length',{type:'line-length',lineId:'b',metres:0.01}),enabled('pointfix',{type:'fixed-point',point:p('pt','position'),target:[0.004,0.005]})] as SketchConstraint[];
 const r=solveSketch(s);assert.equal(r.status,'fully-constrained',r.diagnostics.join());
 const angle=solveSketch({...s,constraints:s.constraints.map(c=>c.id==='parallel'?enabled('angle',{type:'angle',lineA:'a',lineB:'b',radians:Math.PI/4}) as SketchConstraint:c)});assert.equal(angle.status,'fully-constrained',angle.diagnostics.join());
 const dist=solveSketch({...s,constraints:s.constraints.map(c=>c.id==='length'?enabled('dist',{type:'distance',a:p('b','start'),b:p('b','end'),metres:0.02}) as SketchConstraint:c)});assert.equal(dist.status,'fully-constrained',dist.diagnostics.join());
});
test('validation rejects invalid source and failures do not fabricate status',()=>{
 const s=rectangle();assert.throws(()=>validateSketch({...s,entities:[...s.entities,s.entities[0]]}));assert.throws(()=>validateSketch({...s,entities:[{...meta('bad'),type:'circle',center:[NaN,0],radius:1}]}));
 const invalid=solveSketch({...s,constraints:[enabled('bad',{type:'horizontal',lineId:'missing'})] as SketchConstraint[]});assert.equal(invalid.status,'uncertain');assert.equal(invalid.sketch,null);
 const impossible=solveSketch({...s,constraints:[...s.constraints,enabled('wrong-origin',{type:'fixed-point',point:p('a','start'),target:[1,0]})] as SketchConstraint[]});assert.equal(impossible.status,'inconsistent');
});
test('disabled constraints, singular equations, numerical conflict, and resource limits fail safely',()=>{
 const empty=base();assert.equal(solveSketch(empty).dof,0);
 const free=base();free.entities=[{...meta('p'),type:'point',position:[0,0]}];assert.equal(solveSketch(free).dof,2);
 const singular={...free,constraints:[enabled('self',{type:'coincident',a:p('p','position'),b:p('p','position')})] as SketchConstraint[]};assert.equal(solveSketch(singular).status,'uncertain');
 const s=rectangle();const inactive={...s,constraints:[...s.constraints,{...enabled('disabled',{type:'line-length',lineId:'a',metres:2}),enabled:false}] as SketchConstraint[]};assert.equal(solveSketch(inactive).status,'fully-constrained');
 // Geometrically inconsistent, but not a directly identical pair: we do not claim a proof.
 const indirect={...s,constraints:[...s.constraints,enabled('fixedB',{type:'fixed-point',point:p('a','end'),target:[0.015,0]})] as SketchConstraint[]};assert.equal(solveSketch(indirect).status,'uncertain');
 const large=base();large.entities=Array.from({length:33},(_,i)=>({...meta(`p${i}`),type:'point' as const,position:[i/1000,0] as const}));assert.equal(solveSketch(large).status,'uncertain');
});
test('fixed radius and independent signed dimensions',()=>{
 const s=base();s.entities=[{...meta('p'),type:'point',position:[0,0]},{...meta('q'),type:'point',position:[0.01,-0.02]},{...meta('circle'),type:'circle',center:[0,0],radius:0.002}];
 s.constraints=[enabled('pfix',{type:'fixed-point',point:p('p','position'),target:[0,0]}),enabled('x',{type:'horizontal-distance',a:p('p','position'),b:p('q','position'),metres:0.015}),enabled('y',{type:'vertical-distance',a:p('p','position'),b:p('q','position'),metres:-0.025}),enabled('center',{type:'coincident',a:p('circle','center'),b:p('p','position')}),enabled('r',{type:'radius',circleId:'circle',metres:0.004})] as SketchConstraint[];
 const r=solveSketch(s);assert.equal(r.status,'fully-constrained',r.diagnostics.join());const q=r.sketch!.entities[1];if(q.type!=='point')assert.fail();near(q.position[0],0.015,1e-9);near(q.position[1],-0.025,1e-9);
});
test('translated sketch is solvable; large relative feature scale fails closed',()=>{
 const s=rectangle();const shift=100000;const moved:Sketch={...s,entities:s.entities.map(e=>e.type==='line'?{...e,start:[e.start[0]+shift,e.start[1]+shift],end:[e.end[0]+shift,e.end[1]+shift]}:e),constraints:s.constraints.map(c=>c.type==='fixed-point'?{...c,target:[shift,shift]}:c)};
 const r=solveSketch(moved);assert.equal(r.status,'fully-constrained',r.diagnostics.join());assert.equal(r.dof,0);
 const mismatch=base();mismatch.entities=[{...meta('l'),type:'line',start:[0,0],end:[1e-8,0]},{...meta('p'),type:'point',position:[1000,1000]}];assert.equal(solveSketch(mismatch).status,'uncertain');
 assert.throws(()=>invert([[1e-320,0],[0,1e-320]]));
});
test('arc has five solver variables; center and radius constraints preserve angular freedom',()=>{
 const s=base();s.entities=[{...meta('arc'),type:'arc',center:[.001,.002],radius:.003,startAngle:0.2,sweep:Math.PI/2}];
 let r=solveSketch(s);assert.equal(r.status,'underconstrained',r.diagnostics.join());assert.equal(r.dof,5);
 s.constraints=[enabled('center',{type:'fixed-point',point:p('arc','center'),target:[0,0]}),enabled('radius',{type:'radius',circleId:'arc',metres:.004})] as SketchConstraint[];
 r=solveSketch(s);assert.equal(r.status,'underconstrained',r.diagnostics.join());assert.equal(r.dof,2);const e=r.sketch!.entities[0];if(e.type!=='arc')assert.fail();near(e.radius,.004,1e-9);near(e.startAngle,.2);near(e.sweep,Math.PI/2);
 assert.equal(solveSketch({...s,entities:[{...e,sweep:0}]}).status,'uncertain');
});
