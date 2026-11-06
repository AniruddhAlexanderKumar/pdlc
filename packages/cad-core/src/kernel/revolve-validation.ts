import {coordinate,cross3,distance3,dot3,magnitude3,type Vec2} from '../math.js';
import {validFrame} from './geometry.js';
import {toleranceFor} from './numerics.js';
import {evaluatePCurve,evaluateRevolveCurve,evaluateRevolveSurface} from './revolve-geometry.js';
import type {Diagnostic} from './types.js';
import type {RevolvedSolid} from './revolve-types.js';

/** Checks only the rectangular radial revolution class. Not a general 3D self-intersection validator. */
export function checkRevolution(s:RevolvedSolid):Diagnostic[] {
 const errors:Diagnostic[]=[],fail=(code:string,message:string)=>errors.push({code,message});
 try{
  if(s.kind!=='rectangular-revolution'||!s.shell.closed)throw Error('Unsupported solid');const p=s.parameters,tol=s.tolerance.lengthMetres;
  if(!Number.isFinite(tol)||tol<=0||!Number.isFinite(p.startAngle)||!Number.isFinite(p.sweep)||Math.abs(p.sweep)<=1e-9||Math.abs(p.sweep)>2*Math.PI+1e-12||!Number.isFinite(p.axisX)||!Number.isFinite(p.innerRadius)||!Number.isFinite(p.outerRadius)||!Number.isFinite(p.axialMin)||!Number.isFinite(p.axialMax)||p.innerRadius<=tol||p.outerRadius-p.innerRadius<=tol||p.axialMax-p.axialMin<=tol||p.full!==(Math.abs(Math.abs(p.sweep)-2*Math.PI)<=1e-12))throw Error('Invalid parameters or tolerance');
  const expectedTolerance=toleranceFor(s.vertices.map(v=>v.point).concat([[p.axisX+p.outerRadius,p.axialMin,0],[p.axisX-p.outerRadius,p.axialMax,0],[p.axisX,p.axialMax,p.outerRadius],[p.axisX,p.axialMin,-p.outerRadius]]));
  if(Object.keys(expectedTolerance).some(k=>s.tolerance[k as keyof typeof expectedTolerance]!==expectedTolerance[k as keyof typeof expectedTolerance]))throw Error('Tolerance does not match geometry');
  const close=(a:readonly number[],b:readonly number[],eps:number)=>a.length===b.length&&a.every((x,i)=>Number.isFinite(x)&&Math.abs(x-b[i])<=eps);
  const expectFaces=p.full?4:6,expectEdges=p.full?6:12,expectVertices=p.full?4:8;
  if(s.faces.length!==expectFaces||s.edges.length!==expectEdges||s.vertices.length!==expectVertices||s.loops.length!==(p.full?6:6))fail('TOPOLOGY_COUNT','Unexpected topology for supported revolution');
  const all=[...s.vertices,...s.edges,...s.coedges,...s.loops,...s.faces,s.shell,{id:s.id}],ids=all.map(x=>x.id);if(ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)fail('DUPLICATE_ID','IDs must be nonempty and unique');
  const vm=new Map(s.vertices.map(v=>[v.id,v])),em=new Map(s.edges.map(e=>[e.id,e])),cm=new Map(s.coedges.map(c=>[c.id,c])),lm=new Map(s.loops.map(l=>[l.id,l])),fm=new Map(s.faces.map(f=>[f.id,f]));
  if(s.shell.faceIds.length!==s.faces.length||new Set(s.shell.faceIds).size!==s.faces.length||s.shell.faceIds.some(id=>!fm.has(id)))fail('SHELL_FACES','Shell face set is inconsistent');
  for(const v of s.vertices){v.point.forEach(coordinate);const expected=s.edges.filter(e=>e.startVertexId===v.id||e.endVertexId===v.id).map(e=>e.id).sort();if(JSON.stringify(expected)!==JSON.stringify([...v.edgeIds].sort()))fail('VERTEX_CONNECTIVITY',`Bad adjacency: ${v.id}`);}
  for(const e of s.edges){const a=vm.get(e.startVertexId),b=vm.get(e.endVertexId);if(!a||!b){fail('EDGE_VERTEX',`Missing vertex: ${e.id}`);continue;}const curve=e.curve;
   if(curve.kind==='circular-arc'){if(!validFrame(curve.frame)||!Number.isFinite(curve.radius)||curve.radius<=tol||!Number.isFinite(curve.startAngle)||!Number.isFinite(curve.sweep)||Math.abs(curve.sweep)<=1e-9||Math.abs(curve.sweep)>2*Math.PI+1e-12)fail('CURVE','Invalid circle');if((a.id===b.id)!==p.full)fail('SEAM','Circle closedness does not match sweep');
    if(!close(curve.frame.x,[1,0,0],1e-10)||!close(curve.frame.y,[0,0,-1],1e-10)||!close(curve.frame.z,[0,1,0],1e-10)||Math.abs(curve.frame.origin[0]-p.axisX)>tol||Math.abs(curve.frame.origin[2])>tol||Math.min(Math.abs(curve.frame.origin[1]-p.axialMin),Math.abs(curve.frame.origin[1]-p.axialMax))>tol||Math.min(Math.abs(curve.radius-p.innerRadius),Math.abs(curve.radius-p.outerRadius))>tol||curve.startAngle!==p.startAngle||curve.sweep!==p.sweep)fail('CURVE','Circle disagrees with revolution parameters');}
   else if(a.id===b.id||distance3(a.point,b.point)<=tol)fail('DEGENERATE_EDGE',`Degenerate line: ${e.id}`);
   if(distance3(evaluateRevolveCurve(curve,0),a.point)>tol*4||distance3(evaluateRevolveCurve(curve,1),b.point)>tol*4)fail('CURVE_MISMATCH',`Curve endpoints disagree: ${e.id}`);
   const uses=s.coedges.filter(c=>c.edgeId===e.id);if(uses.length!==2||uses[0].orientation===uses[1].orientation||JSON.stringify(uses.map(x=>x.id).sort())!==JSON.stringify([...e.coedgeIds].sort()))fail('NON_MANIFOLD',`Edge must have two opposite uses: ${e.id}`);
  }
  const roles=s.faces.map(f=>f.provenance.role).sort(),expectedRoles=(p.full?['inner','outer','bottom','top']:['inner','outer','bottom','top','cut-start','cut-end']).sort();if(JSON.stringify(roles)!==JSON.stringify(expectedRoles))fail('FACE_ROLES','Face roles do not match supported surface class');
  const used=new Set<string>();
  for(const f of s.faces){const role=f.provenance.role,surf=f.surface;
   if(surf.kind==='cylinder'){
    if(!['inner','outer'].includes(role)||!validFrame(surf.frame)||surf.radius!==(role==='inner'?p.innerRadius:p.outerRadius)||surf.startAngle!==p.startAngle||surf.sweep!==p.sweep||surf.axialRange[0]!==p.axialMin||surf.axialRange[1]!==p.axialMax)fail('SURFACE','Cylinder does not match model parameters');
    if(!close(surf.frame.origin,[p.axisX,0,0],tol)||!close(surf.frame.x,[1,0,0],1e-10)||!close(surf.frame.y,[0,0,-1],1e-10)||!close(surf.frame.z,[0,1,0],1e-10))fail('SURFACE','Cylinder frame does not match revolution axis');
    const dir=Math.sign(p.sweep)*(role==='outer'?1:-1);if(f.orientation!==dir)fail('FACE_ORIENTATION','Cylinder orientation incorrect');
   }else{const u=surf.uAxis,v=surf.vAxis;if(Math.abs(magnitude3(u)-1)>1e-10||Math.abs(magnitude3(v)-1)>1e-10||Math.abs(dot3(u,v))>1e-10||magnitude3(cross3(u,v))<.999999999)fail('SURFACE','Invalid plane basis');if(!['bottom','top','cut-start','cut-end'].includes(role))fail('SURFACE','Unexpected planar face');
    const angle=p.startAngle+(role==='cut-end'?p.sweep:0),cap=role==='top'||role==='bottom';
    const expectedOrigin=cap?[p.axisX,role==='top'?p.axialMax:p.axialMin,0]:[p.axisX,0,0],expectedU=cap?[1,0,0]:[Math.cos(angle),0,-Math.sin(angle)],expectedV=cap?[0,0,-1]:[0,1,0];
    if(!close(surf.origin,expectedOrigin,tol)||!close(surf.uAxis,expectedU,1e-10)||!close(surf.vAxis,expectedV,1e-10))fail('SURFACE','Plane frame disagrees with revolution parameters');
    const expected=role==='top'?1:role==='bottom'?-1:role==='cut-start'?Math.sign(p.sweep):-Math.sign(p.sweep);if(f.orientation!==expected)fail('FACE_ORIENTATION','Plane orientation incorrect');
   }
   const lids=[f.outerLoopId,...f.innerLoopIds];if((p.full&&['top','bottom'].includes(role)?2:1)!==lids.length)fail('FACE_LOOPS','Unexpected number of loops');
   const neighbors=new Set<string>();
   for(let i=0;i<lids.length;i++){const loop=lm.get(lids[i]);if(!loop||loop.faceId!==f.id||loop.kind!==(i===0?'outer':'inner')||!loop.coedgeIds.length){fail('LOOP','Missing or invalid loop');continue;}
    const uvSamples:Vec2[]=[];
    for(let j=0;j<loop.coedgeIds.length;j++){const c=cm.get(loop.coedgeIds[j]),next=cm.get(loop.coedgeIds[(j+1)%loop.coedgeIds.length]),prev=cm.get(loop.coedgeIds[(j+loop.coedgeIds.length-1)%loop.coedgeIds.length]);if(!c||!next||!prev||used.has(c.id)||c.loopId!==loop.id||c.nextId!==next.id||c.previousId!==prev.id){fail('COEDGE_LINK','Invalid coedge links');continue;}used.add(c.id);const edge=em.get(c.edgeId),nedge=em.get(next.edgeId);if(!edge||!nedge||![1,-1].includes(c.orientation)){fail('COEDGE_EDGE','Invalid edge reference');continue;}
     const end=c.orientation===1?edge.endVertexId:edge.startVertexId,nstart=next.orientation===1?nedge.startVertexId:nedge.endVertexId;if(end!==nstart)fail('OPEN_LOOP','Topological boundary is open');
     for(let k=0;k<=8;k++){const t=k/8,uv=evaluatePCurve(c.pcurve,t),actual=evaluateRevolveSurface(surf,uv),onEdge=evaluateRevolveCurve(edge.curve,c.orientation===1?t:1-t);if(distance3(actual,onEdge)>tol*4)fail('CURVE_SURFACE_MISMATCH',`Curve does not lie on face: ${edge.id}`);if(k<8)uvSamples.push(uv);}
     for(const other of s.coedges.filter(o=>o.edgeId===c.edgeId&&o.id!==c.id)){const otherFace=lm.get(other.loopId)?.faceId;if(otherFace&&otherFace!==f.id)neighbors.add(otherFace);}
    }
    let area=0;for(let k=0;k<uvSamples.length;k++){const a=uvSamples[k],b=uvSamples[(k+1)%uvSamples.length];area+=a[0]*b[1]-a[1]*b[0];}if(!Number.isFinite(area)||area*f.orientation*(i===0?1:-1)<=0)fail('LOOP_ORIENTATION',`Invalid oriented trim: ${loop.id}`);
   }
   if(JSON.stringify([...neighbors].sort())!==JSON.stringify([...f.adjacentFaceIds].sort()))fail('FACE_ADJACENCY','Adjacency is inconsistent');
  }
  if(used.size!==s.coedges.length||s.loops.length!==s.faces.reduce((n,f)=>n+1+f.innerLoopIds.length,0))fail('ORPHAN_TOPOLOGY','Unused topology');
  const visited=new Set<string>(),stack=[s.faces[0]?.id];while(stack.length){const id=stack.pop();if(!id||visited.has(id))continue;visited.add(id);stack.push(...(fm.get(id)?.adjacentFaceIds??[]));}if(visited.size!==s.faces.length)fail('DISCONNECTED','Shell disconnected');
 }catch(e){fail('INVALID_TOPOLOGY',e instanceof Error?e.message:'Invalid topology');}
 return errors;
}

export type RevolutionAssessment={status:'valid'|'invalid'|'incomplete'|'numerically-uncertain'|'unsupported';scope:'rectangular-revolution-only';diagnostics:Diagnostic[]};
/** Classification is scoped to this supported model; it is never a general solid-validity claim. */
export function assessRevolution(input:unknown):RevolutionAssessment {
 const result=(status:RevolutionAssessment['status'],diagnostics:Diagnostic[]):RevolutionAssessment=>({status,scope:'rectangular-revolution-only',diagnostics});
 if(!input||typeof input!=='object')return result('incomplete',[{code:'INCOMPLETE',message:'Solid is missing'}]);
 const candidate=input as Partial<RevolvedSolid>;if(candidate.kind!=='rectangular-revolution')return result('unsupported',[{code:'UNSUPPORTED_GEOMETRY',message:'This validator only checks rectangular revolutions'}]);
 if(!candidate.parameters||!candidate.tolerance||!candidate.shell||!Array.isArray(candidate.vertices)||!Array.isArray(candidate.edges)||!Array.isArray(candidate.coedges)||!Array.isArray(candidate.loops)||!Array.isArray(candidate.faces))return result('incomplete',[{code:'INCOMPLETE',message:'Required topology is missing'}]);
 const diagnostics=checkRevolution(candidate as RevolvedSolid);return result(diagnostics.length?'invalid':'valid',diagnostics);
}
