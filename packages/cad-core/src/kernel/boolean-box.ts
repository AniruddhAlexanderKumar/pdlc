import {rectangleGeometry} from '../editor.js';
import type {Sketch} from '../sketch.js';
import {extrudeSketch} from './extrude.js';
import {checkTopology,faceVertices,solidProperties} from './topology.js';
import type {KernelResult,Solid} from './types.js';

type Box={min:[number,number,number];max:[number,number,number]};
export type BoxBooleanOperation='union'|'intersection'|'subtraction'|'split';
export type BoxBooleanResult={solids:Solid[];operation:BoxBooleanOperation;inputSolidIds:[string,string];classification:'disjoint'|'touching'|'overlapping'|'contained'};
const fail=(code:string,message:string):KernelResult<never>=>({ok:false,diagnostics:[{code,message}]});
/** Accept only exact axis-aligned rectangular prism boundaries. No nearest-face matching. */
function readBox(s:Solid):Box {
 const errs=checkTopology(s);if(errs.length)throw Error('Input B-rep topology is invalid');if(s.vertices.length!==8||s.faces.length!==6||s.edges.length!==12)throw Error('Only rectangular prisms are supported');
 const prop=solidProperties(s),min=[...prop.bounds.min] as Box['min'],max=[...prop.bounds.max] as Box['max'],corners=new Set<string>();
 for(const v of s.vertices){if(v.point.some((x,i)=>x!==min[i]&&x!==max[i]))throw Error('Box vertices must be exactly axis aligned');corners.add(JSON.stringify(v.point));}if(corners.size!==8)throw Error('Box corners are invalid');
 const faceKeys=new Set<string>();for(const f of s.faces){const n=f.surface.normal,axis=n.findIndex(x=>Math.abs(x)===1);if(axis<0||n.some((x,i)=>i!==axis&&x!==0))throw Error('Box faces must be axis aligned');const val=f.surface.origin[axis];if(val!==(n[axis]>0?max[axis]:min[axis]))throw Error('Box face orientation or location is invalid');const points=faceVertices(s,f);if(points.length!==4||new Set(points.map(p=>JSON.stringify(p))).size!==4||points.some(p=>p[axis]!==val))throw Error('Each box face must have four distinct bounding-plane corners');faceKeys.add(`${axis}:${n[axis]}`);}if(faceKeys.size!==6)throw Error('Box faces are incomplete');for(const e of s.edges){const changed=e.curve.start.filter((v,i)=>v!==e.curve.end[i]);if(changed.length!==1)throw Error('Box edges must be parallel to coordinate axes');}
 const volume=(max[0]-min[0])*(max[1]-min[1])*(max[2]-min[2]);if(Math.abs(prop.volumeMetres3-volume)>Math.max(volume*1e-9,s.tolerance.lengthMetres*s.tolerance.scaleMetres**2))throw Error('Box volume mismatch');return {min,max};
}
function makeBox(box:Box,label:string,operationId:string,operation:BoxBooleanOperation,a:Solid,b:Solid):KernelResult<Solid>{
 // The adapter describes the analytically reconstructed planar boundary, never a display mesh.
 const seed=`bool-${operationId}-${label}`;let index=0;const g=rectangleGeometry([box.min[0],box.min[1]],[box.max[0],box.max[1]],id=>({id,ownerId:'kernel-boolean',createdAt:'2000-01-01T00:00:00Z',construction:false,visible:true}),()=>`${seed}-${index++}`);
 const sketch:Sketch={id:seed,schemaVersion:1,plane:'XY',units:'m',revision:0,...g};
 // Translate XY-produced solid along Z afterward would change B-rep coordinates; instead require zero-based extrusion and use a verified source-derived translation.
 const built=extrudeSketch({sketch,operationId:seed,distanceMetres:box.max[2]-box.min[2],mode:'blind'});if(!built.ok)return built;
 const out=built.value.solid;const dz=box.min[2];for(const v of out.vertices)v.point=[v.point[0],v.point[1],v.point[2]+dz];for(const e of out.edges){e.curve={...e.curve,start:[e.curve.start[0],e.curve.start[1],e.curve.start[2]+dz],end:[e.curve.end[0],e.curve.end[1],e.curve.end[2]+dz]};}for(const f of out.faces)f.surface={...f.surface,origin:[f.surface.origin[0],f.surface.origin[1],f.surface.origin[2]+dz]};
 // Recompute numerical context after translation; preserve orientation and actual geometry.
 const {toleranceFor}=numerics;out.tolerance=toleranceFor(out.vertices.map(v=>v.point));for(const v of out.vertices)v.tolerance=out.tolerance.lengthMetres;
 const sourceFaces=[...a.faces,...b.faces],sourceSketchIds=[...new Set([...(a.provenance.sourceSketchIds??[a.provenance.sourceSketchId]),...(b.provenance.sourceSketchIds??[b.provenance.sourceSketchId])])].sort();
 for(const f of out.faces){const n=f.surface.normal,axis=n.findIndex(x=>Math.abs(x)===1);const pos=f.surface.origin[axis];const parents=sourceFaces.filter(other=>Math.abs(other.surface.normal[axis])===1&&other.surface.origin[axis]===pos).map(other=>other.id).sort();if(!parents.length)return fail('PROVENANCE_UNCERTAIN','Could not establish exact parent boundary faces');f.provenance={...f.provenance,operation:'boolean',operationId,inputSolidIds:[a.id,b.id],sourceSketchIds,sourceSketchId:a.provenance.sourceSketchId,sourceRevision:a.provenance.sourceRevision,sourceEntityIds:parents,role:`${operation}-${f.provenance.role}`};}
 const faceByEdge=new Map<string,string[]>();for(const f of out.faces){const loop=out.loops.find(l=>l.id===f.outerLoopId)!;for(const id of loop.coedgeIds){const c=out.coedges.find(c=>c.id===id)!;faceByEdge.set(c.edgeId,[...(faceByEdge.get(c.edgeId)??[]),...f.provenance.sourceEntityIds]);}}
 for(const e of out.edges)e.provenance={...e.provenance,operation:'boolean',operationId,inputSolidIds:[a.id,b.id],sourceSketchIds,sourceSketchId:a.provenance.sourceSketchId,sourceRevision:a.provenance.sourceRevision,sourceEntityIds:[...new Set(faceByEdge.get(e.id)??[])].sort(),role:`${operation}-edge`};
 for(const v of out.vertices)v.provenance={...v.provenance,operation:'boolean',operationId,inputSolidIds:[a.id,b.id],sourceSketchIds,sourceSketchId:a.provenance.sourceSketchId,sourceRevision:a.provenance.sourceRevision,sourceEntityIds:[...new Set(v.edgeIds.flatMap(id=>out.edges.find(e=>e.id===id)?.provenance.sourceEntityIds??[]))].sort(),role:`${operation}-vertex`};
 for(const t of [out.provenance,out.shell.provenance]){t.operation='boolean';t.operationId=operationId;t.inputSolidIds=[a.id,b.id];t.sourceSketchIds=sourceSketchIds;t.sourceSketchId=a.provenance.sourceSketchId;t.sourceRevision=a.provenance.sourceRevision;t.sourceEntityIds=[a.id,b.id];t.role=`${operation}-result`;}
 const errors=checkTopology(out);if(errors.length)return {ok:false,diagnostics:errors};try{solidProperties(out)}catch(e){return fail('INVALID_RESULT',e instanceof Error?e.message:'Invalid result');}return {ok:true,value:out};
}
import * as numerics from './numerics.js';
/** Exact supported axis-aligned box cases. Other configurations return diagnostics without modifying inputs. */
export function booleanBoxes(operation:BoxBooleanOperation,a:Solid,b:Solid,operationId:string):KernelResult<BoxBooleanResult>{
 try{
  if(!['union','intersection','subtraction','split'].includes(operation)||typeof operationId!=='string'||!operationId.trim()||operationId.length>60)return fail('INVALID_OPERATION','Invalid operation or operation ID');
  if(a.id===b.id&&JSON.stringify(a)!==JSON.stringify(b))return fail('IDENTITY_CONFLICT','Distinct inputs cannot share the same solid ID');
  let A:Box,B:Box;try{A=readBox(a);B=readBox(b)}catch(e){return fail('UNSUPPORTED_INPUT',e instanceof Error?e.message:'Invalid input');}
  const tol=Math.max(a.tolerance.lengthMetres,b.tolerance.lengthMetres),mins=A.min.map((x,i)=>Math.max(x,B.min[i])) as Box['min'],maxs=A.max.map((x,i)=>Math.min(x,B.max[i])) as Box['max'];
  for(let i=0;i<3;i++)for(const av of [A.min[i],A.max[i]])for(const bv of [B.min[i],B.max[i]]){const gap=av-bv;if(gap!==0&&Math.abs(gap)<=tol)return fail('NUMERICALLY_UNCERTAIN','Near-coincident boundaries are within tolerance');}
  const separated=mins.some((x,i)=>x>maxs[i]),touch=!separated&&mins.some((x,i)=>x===maxs[i]);const contains=(x:Box,y:Box)=>x.min.every((v,i)=>v<=y.min[i]&&x.max[i]>=y.max[i]);const contained=contains(A,B)||contains(B,A);
  const classification=separated?'disjoint':touch?'touching':contained?'contained':'overlapping';
  const done=(solids:Solid[]):KernelResult<BoxBooleanResult>=>({ok:true,value:{solids:solids.map(s=>structuredClone(s)),operation,inputSolidIds:[a.id,b.id],classification}});
  if(separated||touch){if(operation==='intersection')return done([]);if(operation==='subtraction'||operation==='split')return done([a]);if(separated)return done([a,b]);}
  if(operation==='union'&&contains(A,B))return done([a]);if(operation==='union'&&contains(B,A))return done([b]);if(operation==='subtraction'&&contains(B,A))return done([]);if(operation==='split'&&contains(B,A))return done([a]);
  if(operation==='intersection'){const out=makeBox({min:mins,max:maxs},'intersection',operationId,operation,a,b);return out.ok?done([out.value]):out;}
  if(operation==='union'){
   const different=[0,1,2].filter(i=>A.min[i]!==B.min[i]||A.max[i]!==B.max[i]);if(different.length!==1)return fail('UNSUPPORTED_GEOMETRY','Union is supported only when the union is one box, or the inputs are strictly disjoint');
   const box:Box={min:A.min.map((x,i)=>Math.min(x,B.min[i])) as Box['min'],max:A.max.map((x,i)=>Math.max(x,B.max[i])) as Box['max']};const out=makeBox(box,'union',operationId,operation,a,b);return out.ok?done([out.value]):out;
  }
  // Subtraction and split require the intersection to span A along two axes, so every output component is a box.
  const cuts=[0,1,2].filter(i=>mins[i]!==A.min[i]||maxs[i]!==A.max[i]);if(cuts.length!==1)return fail('UNSUPPORTED_GEOMETRY','Subtraction/split would require non-box or cavity topology');
  const axis=cuts[0],pieces:{label:string;box:Box}[]=[];if(mins[axis]>A.min[axis]){const x:Box={min:[...A.min],max:[...A.max]};x.max[axis]=mins[axis];pieces.push({label:'lower',box:x});}if(maxs[axis]<A.max[axis]){const x:Box={min:[...A.min],max:[...A.max]};x.min[axis]=maxs[axis];pieces.push({label:'upper',box:x});}
  if(operation==='split')pieces.push({label:'intersection',box:{min:mins,max:maxs}});const output:Solid[]=[];for(const part of pieces){if(part.box.max.some((v,i)=>v-part.box.min[i]<=tol))return fail('NUMERICALLY_UNCERTAIN','Result component is below tolerance');const result=makeBox(part.box,part.label,operationId,operation,a,b);if(!result.ok)return result;output.push(result.value);}return done(output);
 }catch(e){return fail('INVALID_INPUT',e instanceof Error?e.message:'Invalid Boolean input');}
}
