import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rectangleGeometry} from './editor.js';
import type {Sketch} from './sketch.js';
import {extrudeSketch} from './kernel/extrude.js';
import {checkTopology,solidProperties} from './kernel/topology.js';
const near=(a:number,b:number,t=1e-12)=>assert.ok(Math.abs(a-b)<=t,`${a} != ${b}`);
function rect(w=.01,h=.02):Sketch {let n=0;const r=rectangleGeometry([0,0],[w,h],id=>({id,ownerId:'owner',createdAt:'2026-01-01T00:00:00Z',construction:false,visible:true}),()=>`id${n++}`);return {id:'sketch',schemaVersion:1,plane:'XY',units:'m',revision:7,...r};}
function solid(sketch:Sketch,d=.005,mode:'blind'|'symmetric'='blind'){const r=extrudeSketch({sketch,operationId:'operation-1',distanceMetres:d,mode});assert.equal(r.ok,true,r.ok?'':JSON.stringify(r.diagnostics));if(!r.ok)throw Error();return r.value.solid;}
test('real four-line sketch extrusion yields oriented planar B-rep and analytical properties',()=>{
 const s=rect(),before=JSON.stringify(s),b=solid(s),p=solidProperties(b);assert.equal(JSON.stringify(s),before);assert.deepEqual([b.vertices.length,b.edges.length,b.coedges.length,b.loops.length,b.faces.length],[8,12,24,6,6]);assert.deepEqual(checkTopology(b),[]);near(p.volumeMetres3*1e9,1000,1e-6);near(p.surfaceAreaMetres2*1e6,700,1e-6);p.centroid.forEach((x,i)=>near(x,[.005,.01,.0025][i]));assert.deepEqual(p.bounds,{min:[0,0,0],max:[.01,.02,.005]});assert.equal(b.faces.filter(f=>f.provenance.role==='side-face').length,4);assert(b.faces.every(f=>f.provenance.sourceSketchId==='sketch'&&f.provenance.sourceRevision===7));assert(b.edges.every(e=>e.coedgeIds.length===2));
});
test('regeneration reflects changed sketch, negative and symmetric extrusion',()=>{
 const b=solid(rect(.012)),p=solidProperties(b);near(p.volumeMetres3*1e9,1200,1e-6);near(p.surfaceAreaMetres2*1e6,800,1e-6);near(solidProperties(solid(rect(),-.005)).volumeMetres3*1e9,1000,1e-6);assert.deepEqual(solidProperties(solid(rect(),-.005)).bounds,{min:[0,0,-.005],max:[.01,.02,0]});assert.deepEqual(solidProperties(solid(rect(),.005,'symmetric')).bounds,{min:[0,0,-.0025],max:[.01,.02,.0025]});
});
test('open, degenerate, unsupported and self-intersecting profiles fail without mutating input',()=>{
 const s=rect(),before=JSON.stringify(s),zero=extrudeSketch({sketch:s,operationId:'x',distanceMetres:0,mode:'blind'});assert(!zero.ok);assert.equal(JSON.stringify(s),before);
 const open={...s,entities:s.entities.slice(0,3),constraints:[]};const r=extrudeSketch({sketch:open,operationId:'x',distanceMetres:.005,mode:'blind'});assert(!r.ok);assert.equal(r.diagnostics[0].code,'OPEN_PROFILE');
 const bow=rect();bow.constraints=[];const coords=[[[0,0],[.01,.02]],[[.01,.02],[0,.02]],[[0,.02],[.01,0]],[[.01,0],[0,0]]] as const;bow.entities=bow.entities.map((e,i)=>({...e,type:'line',start:coords[i][0],end:coords[i][1]}));const cross=extrudeSketch({sketch:bow,operationId:'x',distanceMetres:.005,mode:'blind'});assert(!cross.ok);assert.equal(cross.diagnostics[0].code,'SELF_INTERSECTION');
});
test('topology validator detects damaged coedge orientation and boundary links',()=>{
 const b=solid(rect());const bad=structuredClone(b);bad.coedges[0].orientation=bad.coedges.find(x=>x.edgeId===bad.coedges[0].edgeId&&x.id!==bad.coedges[0].id)!.orientation;assert(checkTopology(bad).some(x=>x.code==='NON_MANIFOLD'));assert.throws(()=>solidProperties(bad));
});

test('planar tessellation preserves face mapping, normals and topological edge correspondence',async()=>{
 const {tessellatePlanar}=await import('./kernel/tessellation.js');const b=solid(rect()),m=tessellatePlanar(b);assert(m.ok);assert.equal(m.value.triangles.length,12);assert.equal(m.value.edges.length,12);assert.deepEqual(new Set(m.value.edges.map(e=>e.edgeId)),new Set(b.edges.map(e=>e.id)));
 for(const face of b.faces)assert.equal(m.value.triangles.filter(t=>t.faceId===face.id).length,2);
 for(const t of m.value.triangles){const [a,b,c]=t.points;const x=(b[1]-a[1])*(c[2]-a[2])-(b[2]-a[2])*(c[1]-a[1]),y=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]),z=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);assert(x*t.normal[0]+y*t.normal[1]+z*t.normal[2]>0)}
 const damaged=structuredClone(b);damaged.coedges[0].nextId='missing';assert.equal(tessellatePlanar(damaged).ok,false);
});
test('non-rectangular, concave, clockwise and reordered line profiles remain actual geometry',async()=>{
 const {tessellatePlanar}=await import('./kernel/tessellation.js');const coords=[[0,0],[.03,0],[.03,.01],[.01,.01],[.01,.02],[0,.02]] as const;
 const s:Sketch={id:'concave',schemaVersion:1,plane:'XY',units:'m',revision:1,entities:coords.map((p,i)=>({id:`l${i}`,type:'line' as const,start:p,end:coords[(i+1)%coords.length],ownerId:'u',createdAt:'2026-01-01T00:00:00Z',construction:false,visible:true})).reverse(),constraints:[]};
 const b=solid(s,.005);near(solidProperties(b).volumeMetres3, .0004*.005,1e-16);assert.equal(b.faces.length,8);const m=tessellatePlanar(b);assert(m.ok);assert.equal(m.value.triangles.length,20);
 const rev={...s,entities:s.entities.map(e=>e.type==='line'?{...e,start:e.end,end:e.start}:e)};near(solidProperties(solid(rev,.005)).volumeMetres3,.0004*.005,1e-16);
});
test('scaled profiles and large translation retain expected analytical properties',()=>{
 for(const scale of [.01,1,100]){const s=rect(.01*scale,.02*scale);const p=solidProperties(solid(s,.005*scale));near(p.volumeMetres3,1e-6*scale**3,Math.max(1e-20,1e-6*scale**3*1e-9));}
 const s=rect();s.entities=s.entities.map(e=>e.type==='line'?{...e,start:[e.start[0]+1000,e.start[1]+1000],end:[e.end[0]+1000,e.end[1]+1000]}:e);const p=solidProperties(solid(s));near(p.volumeMetres3,1e-6,1e-14);near(p.centroid[0],1000.005,1e-9);
});
test('source-derived side identities resolve across dimensional regeneration without index matching',async()=>{
 const {resolveFaceReference}=await import('./kernel/provenance.js');const a=solid(rect()),b=solid(rect(.012));const side=a.faces.find(f=>f.provenance.role==='side-face')!;const resolved=resolveFaceReference(side,b);assert.equal(resolved.status,'resolved');if(resolved.status==='resolved')assert.deepEqual(resolved.face.provenance.sourceEntityIds,side.provenance.sourceEntityIds);
 const removed=structuredClone(b);removed.faces=removed.faces.filter(f=>f.id!==side.id);assert.equal(resolveFaceReference(side,removed).status,'missing');
 const ambiguous=structuredClone(b);ambiguous.faces.push({...structuredClone(ambiguous.faces.find(f=>f.id===side.id)!),id:'other'});assert.equal(resolveFaceReference(side,ambiguous).status,'ambiguous');
});
test('untrusted topology changes and tolerance tampering are not silently accepted',()=>{
 const b=solid(rect()),bad=structuredClone(b);bad.tolerance.lengthMetres=1;assert(checkTopology(bad).length>0);
 const broken=structuredClone(b);broken.vertices[0].edgeIds.pop();assert(checkTopology(broken).some(e=>e.code==='VERTEX_CONNECTIVITY'));
 const flipped=structuredClone(b);flipped.faces[0].surface.normal=[0,0,1];assert(checkTopology(flipped).some(e=>e.code==='FACE_ORIENTATION'));
});
test('junctions within tolerance are canonicalized without mutating the sketch',()=>{
 const s=rect();s.constraints=[];const e=s.entities[0];assert.equal(e.type,'line');if(e.type!=='line')throw Error();s.entities[0]={...e,end:[e.end[0]+1e-11,e.end[1]]};const before=JSON.stringify(s);const b=solid(s);assert.deepEqual(checkTopology(b),[]);assert.equal(JSON.stringify(s),before);
});
test('mesh has no unintended cracks: each undirected triangle edge occurs twice',async()=>{
 const {tessellatePlanar}=await import('./kernel/tessellation.js');const m=tessellatePlanar(solid(rect()));assert(m.ok);const counts=new Map<string,number>();for(const t of m.value.triangles)for(let i=0;i<3;i++){const key=JSON.stringify([t.points[i],t.points[(i+1)%3]].map(p=>JSON.stringify(p)).sort());counts.set(key,(counts.get(key)??0)+1);}assert([...counts.values()].every(n=>n===2));
});
test('multiple loops, degenerate edges and unsupported curved profile fail closed',()=>{
 const s=rect();s.constraints=[];const other=rect(.001,.001);other.entities=other.entities.map((e,i)=>e.type==='line'?{...e,id:`extra${i}`,start:[e.start[0]+.004,e.start[1]+.004],end:[e.end[0]+.004,e.end[1]+.004]}:e);const disconnected={...s,entities:[...s.entities,...other.entities]};assert.equal(extrudeSketch({sketch:disconnected,operationId:'x',distanceMetres:.005,mode:'blind'}).ok,false);
 const degenerate=structuredClone(s);const e=degenerate.entities[0];if(e.type!=='line')throw Error();degenerate.entities[0]={...e,end:e.start};assert.equal(extrudeSketch({sketch:degenerate,operationId:'x',distanceMetres:.005,mode:'blind'}).ok,false);
 const circle:Sketch={...s,entities:[{id:'c',type:'circle',center:[0,0],radius:.01,ownerId:'u',createdAt:'2026-01-01T00:00:00Z',construction:false,visible:true}]};const result=extrudeSketch({sketch:circle,operationId:'x',distanceMetres:.005,mode:'blind'});assert(!result.ok);assert.equal(result.diagnostics[0].code,'UNSUPPORTED_PROFILE');
});
test('Part 1 dimensional constraint edit regenerates the corresponding source-derived B-rep',async()=>{
 const {solveSketch,tryConstraintChange}=await import('./solver.js');const s=rect(),a=s.entities[0],b=s.entities[1];if(a.type!=='line'||b.type!=='line')throw Error();
 s.constraints.push({id:'anchor',enabled:true,type:'fixed-point',point:{entityId:a.id,point:'start'},target:[0,0]},{id:'width',enabled:true,type:'line-length',lineId:a.id,metres:.01},{id:'height',enabled:true,type:'line-length',lineId:b.id,metres:.02});
 const first=solveSketch(s);assert(first.sketch);assert.equal(first.dof,0);const initial=solidProperties(solid(first.sketch));near(initial.volumeMetres3*1e9,1000,1e-6);
 const updated=tryConstraintChange(first.sketch,first.sketch.constraints.map(c=>c.id==='width'?{...c,metres:.012} as typeof c:c));assert(updated.accepted);assert.equal(updated.result.dof,0);const changed=solidProperties(solid(updated.sketch));near(changed.volumeMetres3*1e9,1200,1e-4);near(changed.surfaceAreaMetres2*1e6,800,1e-4);
});
test('cap provenance reflects extrusion direction and symmetric mode',()=>{
 const neg=solid(rect(),-.005),start=neg.faces.find(f=>f.provenance.role==='start-cap'),end=neg.faces.find(f=>f.provenance.role==='end-cap');assert.equal(start?.surface.origin[2],0);assert.equal(end?.surface.origin[2],-.005);
 const sym=solid(rect(),.005,'symmetric');assert.equal(sym.faces.find(f=>f.provenance.role==='symmetric-negative-cap')?.surface.origin[2],-.0025);assert.equal(sym.faces.find(f=>f.provenance.role==='symmetric-positive-cap')?.surface.origin[2],.0025);
});
test('frame, line and plane functions use the Part 1 3D coordinate convention',async()=>{
 const {framePoint,validFrame,segmentPoint,projectOntoPlane,XY_FRAME}=await import('./kernel/geometry.js');assert.deepEqual(framePoint(XY_FRAME,[.01,.02],.005),[.01,.02,.005]);assert.deepEqual(segmentPoint({kind:'segment',start:[0,0,0],end:[1,2,3]},.5),[.5,1,1.5]);assert.deepEqual(projectOntoPlane({kind:'plane',origin:[0,0,0],normal:[0,0,1]},[1,2,3]),[1,2,0]);assert(!validFrame({...XY_FRAME,z:[0,0,-1]}));assert.throws(()=>framePoint({...XY_FRAME,z:[0,0,-1]},[0,0]));
});
