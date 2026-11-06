import {coordinate,distance2,type Vec2,type Vec3} from '../math.js';
import type {LineEntity} from '../geometry.js';
import {validateSketch,type Sketch} from '../sketch.js';
import {solveSketch} from '../solver.js';
import {XY_FRAME,framePoint} from './geometry.js';
import {orient2,segmentConflict,signedArea2,toleranceFor} from './numerics.js';
import {checkTopology,solidProperties} from './topology.js';
import type {Coedge,Diagnostic,Edge,Face,KernelResult,Loop,Provenance,Solid,Vertex} from './types.js';

type Segment={sourceId:string;start:Vec2;end:Vec2};
export type ExtrudeInput={sketch:Sketch;operationId:string;distanceMetres:number;mode:'blind'|'symmetric'};
export type ExtrudeOutput={solid:Solid;solvedSketch:Sketch};
const fail=(code:string,message:string):KernelResult<never>=>({ok:false,diagnostics:[{code,message}]});
/** XY sketch, one simple closed line loop, straight extrusion along ±Z. Never mutates input. */
export function extrudeSketch(input:ExtrudeInput):KernelResult<ExtrudeOutput> {
 try {
  if(typeof input.operationId!=='string'||!input.operationId.trim()||input.operationId.length>200)return fail('INVALID_OPERATION','Operation ID must be a nonempty bounded string');
  if(input.mode!=='blind'&&input.mode!=='symmetric')return fail('UNSUPPORTED_MODE','Unsupported extrusion mode');
  coordinate(input.distanceMetres);validateSketch(input.sketch);
  if(input.sketch.id.length>200||input.sketch.entities.some(e=>e.id.length>200))return fail('RESOURCE_LIMIT','Sketch and entity IDs must be at most 200 characters');
  const result=solveSketch(input.sketch);if(!result.sketch)return fail('SKETCH_SOLVER',`Sketch cannot be solved safely: ${result.diagnostics.join(' ')}`);
  const sketch=result.sketch,raw=sketch.entities.filter(e=>!e.construction);
  if(raw.some(e=>e.type!=='line'))return fail('UNSUPPORTED_PROFILE','Only line-segment profiles are supported');
  const lines=raw as LineEntity[];if(lines.length<3||lines.length>16)return fail('PROFILE_SIZE','One loop of 3 to 16 lines is required');
  const end=input.mode==='symmetric'?Math.abs(input.distanceMetres)/2:input.distanceMetres,start=input.mode==='symmetric'?-Math.abs(input.distanceMetres)/2:0;
  const z0=Math.min(start,end),z1=Math.max(start,end);
  const tolerance=toleranceFor(lines.flatMap(l=>[framePoint(XY_FRAME,l.start,z0),framePoint(XY_FRAME,l.end,z1)]));const tol=tolerance.lengthMetres;
  if(z1-z0<=tol)return fail('ZERO_EXTRUSION','Extrusion depth is zero or below numerical tolerance');
  const remaining=[...lines].sort((a,b)=>a.id.localeCompare(b.id));const first=remaining.shift()!;const chain:Segment[]=[{sourceId:first.id,start:first.start,end:first.end}];
  while(remaining.length){const end=chain[chain.length-1].end;const matches=remaining.flatMap((l,i)=>[{i,reverse:false,d:distance2(end,l.start)},{i,reverse:true,d:distance2(end,l.end)}].filter(m=>m.d<=tol));if(matches.length!==1)return fail(matches.length?'AMBIGUOUS_PROFILE':'OPEN_PROFILE',matches.length?'Profile branches or has ambiguous endpoints':'Profile is not closed');const m=matches[0],line=remaining.splice(m.i,1)[0];chain.push({sourceId:line.id,start:m.reverse?line.end:line.start,end:m.reverse?line.start:line.end});}
  if(distance2(chain.at(-1)!.end,chain[0].start)>tol)return fail('OPEN_PROFILE','Last profile edge does not close');
  // Canonicalize each junction only within documented tolerance.
  let points:Vec2[]=chain.map((edge,i)=>{const prev=chain[(i+chain.length-1)%chain.length].end;return [(edge.start[0]+prev[0])/2,(edge.start[1]+prev[1])/2];});
  let segments=chain;
  for(let i=0;i<points.length;i++){
   const a=points[i],b=points[(i+1)%points.length],c=points[(i+2)%points.length];if(distance2(a,b)<=tol)return fail('DEGENERATE_PROFILE','Edge is shorter than the model tolerance');
   if(Math.abs(orient2(a,b,c))<=tol*Math.max(distance2(a,b),distance2(b,c)))return fail('UNCERTAIN_PROFILE','Consecutive edges are collinear or numerically ambiguous');
   for(let j=i+1;j<points.length;j++){if(j===i+1||(i===0&&j===points.length-1))continue;if(segmentConflict(a,b,points[j],points[(j+1)%points.length],tol))return fail('SELF_INTERSECTION','Profile crosses, touches, or is numerically ambiguous');}
  }
  const area=signedArea2(points);if(Math.abs(area)<=tolerance.areaMetres2)return fail('DEGENERATE_PROFILE','Profile area is too small or uncertain');
  if(area<0){segments=[...segments].reverse().map(e=>({sourceId:e.sourceId,start:e.end,end:e.start}));points=segments.map((e,i)=>{const prev=segments[(i+segments.length-1)%segments.length].end;return [(e.start[0]+prev[0])/2,(e.start[1]+prev[1])/2]});}
  const finalTolerance=toleranceFor(points.flatMap(p=>[framePoint(XY_FRAME,p,z0),framePoint(XY_FRAME,p,z1)]));
  const capRoles:readonly [string,string]=input.mode==='symmetric'?['symmetric-negative-cap','symmetric-positive-cap']:input.distanceMetres>0?['start-cap','end-cap']:['end-cap','start-cap'];
  const solid=buildSolid(sketch,input.operationId,segments,points,z0,z1,finalTolerance,capRoles);
  const errors=checkTopology(solid);if(errors.length)return {ok:false,diagnostics:errors};
  try{solidProperties(solid)}catch(e){return fail('INVALID_SOLID',e instanceof Error?e.message:'Could not compute solid properties');}
  return {ok:true,value:{solid,solvedSketch:sketch}};
 }catch(e){return fail('INVALID_INPUT',e instanceof Error?e.message:'Invalid extrusion input');}
}
function buildSolid(sketch:Sketch,operationId:string,segments:Segment[],points:Vec2[],z0:number,z1:number,tolerance:Solid['tolerance'],capRoles:readonly [string,string]):Solid {
 const enc=encodeURIComponent,root=`extrude/${enc(operationId)}`;const sources=segments.map(s=>s.sourceId);const prov=(role:string,sourceEntityIds:string[]):Provenance=>({operation:'extrude',operationId,sourceSketchId:sketch.id,sourceRevision:sketch.revision,sourceEntityIds:[...sourceEntityIds].sort(),role});
 const vertices:Vertex[]=[],edges:Edge[]=[],coedges:Coedge[]=[],loops:Loop[]=[],faces:Face[]=[];const vm=new Map<string,Vertex>(),edgeByPair=new Map<string,Edge>();
 const vertex=(i:number,layer:'bottom'|'top')=>{const prev=segments[(i+segments.length-1)%segments.length].sourceId,current=segments[i].sourceId,key=[prev,current].sort().map(enc).join('/');const id=`${root}/vertex/${layer}/${key}`;const point=framePoint(XY_FRAME,points[i],layer==='bottom'?z0:z1);const v={id,point,tolerance:tolerance.lengthMetres,edgeIds:[],provenance:prov(`${layer}-vertex`,[prev,current])};vertices.push(v);vm.set(id,v);return id;};
 const bottom=points.map((_,i)=>vertex(i,'bottom')),top=points.map((_,i)=>vertex(i,'top'));
 const pair=(a:string,b:string)=>JSON.stringify([a,b].sort());
 const edge=(a:string,b:string)=>{const key=pair(a,b);const existing=edgeByPair.get(key);if(existing)return existing;
  const va=vm.get(a)!,vb=vm.get(b)!;const id=`${root}/edge/${enc(key)}`,sourceEntityIds=[...new Set([...va.provenance.sourceEntityIds,...vb.provenance.sourceEntityIds])];const e:Edge={id,curve:{kind:'segment',start:va.point,end:vb.point},startVertexId:a,endVertexId:b,parameterRange:[0,1],coedgeIds:[],provenance:prov('boundary-edge',sourceEntityIds)};edges.push(e);edgeByPair.set(key,e);va.edgeIds.push(id);vb.edgeIds.push(id);return e;};
 const addFace=(id:string,vs:string[],normal:Vec3,sourceIds:string[],role:string)=>{
  const faceId=`${root}/face/${id}`,loopId=`${faceId}/loop`,uses=vs.map((a,i)=>{const b=vs[(i+1)%vs.length],e=edge(a,b);return {id:`${faceId}/coedge/${enc(e.id)}`,edgeId:e.id,orientation:(e.startVertexId===a?1:-1) as 1|-1,loopId,previousId:'',nextId:''};});
  uses.forEach((c,i)=>{c.previousId=uses[(i+uses.length-1)%uses.length].id;c.nextId=uses[(i+1)%uses.length].id;edges.find(e=>e.id===c.edgeId)!.coedgeIds.push(c.id);coedges.push(c);});
  loops.push({id:loopId,coedgeIds:uses.map(u=>u.id),kind:'outer',faceId});faces.push({id:faceId,surface:{kind:'plane',origin:vm.get(vs[0])!.point,normal},outerLoopId:loopId,innerLoopIds:[],orientation:1,adjacentFaceIds:[],provenance:prov(role,sourceIds)});
 };
 addFace('bottom',[...bottom].reverse(),[0,0,-1],sources,capRoles[0]);addFace('top',top,[0,0,1],sources,capRoles[1]);
 for(let i=0;i<points.length;i++){const j=(i+1)%points.length,dx=points[j][0]-points[i][0],dy=points[j][1]-points[i][1],len=Math.hypot(dx,dy);addFace(`side/${enc(segments[i].sourceId)}`,[bottom[i],bottom[j],top[j],top[i]],[dy/len,-dx/len,0],[segments[i].sourceId],'side-face');}
 const loopMap=new Map(loops.map(l=>[l.id,l]));for(const f of faces){const adj=new Set<string>();const l=loopMap.get(f.outerLoopId)!;for(const cid of l.coedgeIds){const c=coedges.find(x=>x.id===cid)!;for(const other of coedges.filter(x=>x.edgeId===c.edgeId&&x.id!==cid)){const otherFace=loopMap.get(other.loopId)?.faceId;if(otherFace)adj.add(otherFace);}}f.adjacentFaceIds=[...adj].sort();}
 return {id:`${root}/solid`,kind:'linear-extrusion',vertices,edges,coedges,loops,faces,shell:{id:`${root}/shell`,faceIds:faces.map(f=>f.id),closed:true,provenance:prov('shell',sources)},tolerance,provenance:prov('solid',sources)};
}
