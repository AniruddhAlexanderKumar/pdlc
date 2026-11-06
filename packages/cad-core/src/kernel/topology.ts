import {cross3,distance3,dot3,magnitude3,sub3,coordinate,type Vec3} from '../math.js';
import {toleranceFor} from './numerics.js';
import type {Diagnostic,Face,Properties,Solid} from './types.js';

export function faceVertices(s:Solid,face:Face):Vec3[] {
 const loop=s.loops.find(l=>l.id===face.outerLoopId);if(!loop)throw new Error('Missing face loop');
 return loop.coedgeIds.map(id=>{const c=s.coedges.find(x=>x.id===id);const e=s.edges.find(x=>x.id===c?.edgeId);const v=s.vertices.find(x=>x.id===(c?.orientation===1?e?.startVertexId:e?.endVertexId));if(!v)throw new Error('Broken edge use');return v.point;});
}
/** Validates the bounded planar manifold subset; does not prove general surface non-intersection. */
export function checkTopology(s:Solid):Diagnostic[] {
 const errors:Diagnostic[]=[];const fail=(code:string,message:string)=>errors.push({code,message});
 try {
  if(s.kind!=='linear-extrusion'||!s.shell.closed)throw new Error('Unsupported shell kind');
  const expected=toleranceFor(s.vertices.map(v=>v.point));
  if(Object.keys(expected).some(k=>expected[k as keyof typeof expected]!==s.tolerance[k as keyof typeof expected]))throw new Error('Tolerance context does not match model geometry');
  const tol=s.tolerance.lengthMetres,areaTol=s.tolerance.areaMetres2;
  if(!Number.isFinite(tol)||tol<=0||!Number.isFinite(areaTol)||areaTol<=0)throw new Error('Invalid tolerance context');
  const all=[...s.vertices,...s.edges,...s.coedges,...s.loops,...s.faces,s.shell,{id:s.id}],ids=all.map(x=>x.id);if(ids.some(x=>!x)||new Set(ids).size!==ids.length)fail('DUPLICATE_ID','Topology IDs must be nonempty and unique');
  const vm=new Map(s.vertices.map(v=>[v.id,v])),em=new Map(s.edges.map(e=>[e.id,e])),cm=new Map(s.coedges.map(c=>[c.id,c])),lm=new Map(s.loops.map(l=>[l.id,l])),fm=new Map(s.faces.map(f=>[f.id,f]));
  if(s.shell.faceIds.length!==s.faces.length||new Set(s.shell.faceIds).size!==s.faces.length||s.shell.faceIds.some(id=>!fm.has(id)))fail('SHELL_FACES','Shell must contain every face exactly once');
  for(const v of s.vertices){v.point.forEach(coordinate);const incident=s.edges.filter(e=>e.startVertexId===v.id||e.endVertexId===v.id).map(e=>e.id).sort();if(incident.length<3||JSON.stringify([...v.edgeIds].sort())!==JSON.stringify(incident))fail('VERTEX_CONNECTIVITY',`Invalid incident edges at ${v.id}`);}
  for(const e of s.edges){const a=vm.get(e.startVertexId),b=vm.get(e.endVertexId);if(!a||!b||a.id===b.id||distance3(a.point,b.point)<=tol){fail('DEGENERATE_EDGE',`Invalid edge ${e.id}`);continue;}if(distance3(a.point,e.curve.start)>tol||distance3(b.point,e.curve.end)>tol||e.curve.kind!=='segment'||e.parameterRange[0]!==0||e.parameterRange[1]!==1)fail('CURVE_MISMATCH',`Edge curve does not match vertices: ${e.id}`);
   const uses=s.coedges.filter(c=>c.edgeId===e.id);if(uses.length!==2||uses[0]?.orientation===uses[1]?.orientation||JSON.stringify(uses.map(c=>c.id).sort())!==JSON.stringify([...e.coedgeIds].sort()))fail('NON_MANIFOLD',`Edge ${e.id} must have two opposite uses`);
  }
  const used=new Set<string>();
  for(const f of s.faces){const loop=lm.get(f.outerLoopId);if(!loop||loop.faceId!==f.id||f.innerLoopIds.length){fail('FACE_LOOPS',`Unsupported or missing loop on ${f.id}`);continue;}
   if(loop.kind!=='outer'||loop.coedgeIds.length<3){fail('OPEN_LOOP',`Invalid loop ${loop.id}`);continue;}
   if(f.orientation!==1||f.surface.kind!=='plane'||Math.abs(magnitude3(f.surface.normal)-1)>s.tolerance.angularRadians){fail('SURFACE',`Invalid plane on ${f.id}`);continue;}
   const pts:Vec3[]=[];
   for(let i=0;i<loop.coedgeIds.length;i++){const c=cm.get(loop.coedgeIds[i]),next=cm.get(loop.coedgeIds[(i+1)%loop.coedgeIds.length]),prev=cm.get(loop.coedgeIds[(i+loop.coedgeIds.length-1)%loop.coedgeIds.length]);if(!c||!next||!prev||used.has(c.id)||c.loopId!==loop.id||c.nextId!==next.id||c.previousId!==prev.id){fail('COEDGE_LINK',`Invalid links in ${loop.id}`);continue;}used.add(c.id);
    const e=em.get(c.edgeId),n=em.get(next.edgeId);if(!e||!n||![1,-1].includes(c.orientation)){fail('COEDGE_EDGE','Missing edge');continue;}const start=c.orientation===1?e.startVertexId:e.endVertexId,end=c.orientation===1?e.endVertexId:e.startVertexId,nstart=next.orientation===1?n.startVertexId:n.endVertexId;if(end!==nstart)fail('OPEN_LOOP',`Loop ${loop.id} is not closed`);const v=vm.get(start);if(v)pts.push(v.point);
   }
   if(pts.length>=3){let av:Vec3=[0,0,0];for(let i=1;i<pts.length-1;i++){const c=cross3(sub3(pts[i],pts[0]),sub3(pts[i+1],pts[0]));av=[av[0]+c[0],av[1]+c[1],av[2]+c[2]];}if(dot3(av,f.surface.normal)<=2*areaTol)fail('FACE_ORIENTATION',`Face ${f.id} is degenerate or incorrectly oriented`);if(pts.some(p=>Math.abs(dot3(sub3(p,f.surface.origin),f.surface.normal))>tol))fail('NON_PLANAR',`Face ${f.id} is not planar`);}
   const neighbors=new Set<string>();for(const id of loop.coedgeIds){const c=cm.get(id);if(!c)continue;for(const other of s.coedges.filter(x=>x.edgeId===c.edgeId&&x.id!==c.id)){const otherLoop=lm.get(other.loopId);if(otherLoop)neighbors.add(otherLoop.faceId);}}
   if(JSON.stringify([...neighbors].sort())!==JSON.stringify([...f.adjacentFaceIds].sort()))fail('FACE_ADJACENCY',`Invalid adjacency for ${f.id}`);
  }
  if(used.size!==s.coedges.length||s.loops.length!==s.faces.length)fail('ORPHAN_TOPOLOGY','Orphan coedge or loop');
  if(s.vertices.length-s.edges.length+s.faces.length!==2)fail('EULER','Unsupported genus or invalid topology');
  const visited=new Set<string>(),todo=[s.faces[0]?.id];while(todo.length){const id=todo.pop();if(!id||visited.has(id))continue;visited.add(id);for(const n of fm.get(id)?.adjacentFaceIds??[])todo.push(n);}if(visited.size!==s.faces.length)fail('DISCONNECTED','Shell is not connected');
 }catch(e){fail('INVALID_TOPOLOGY',e instanceof Error?e.message:'Invalid topology');}
 return errors;
}
/** Analytic planar boundary integrals, independent of display tessellation. */
export function solidProperties(s:Solid):Properties {
 const errors=checkTopology(s);if(errors.length)throw new Error(`Invalid B-rep: ${errors[0].message}`);
 const origin=s.vertices[0].point;let volume=0,cx=0,cy=0,cz=0,surface=0;const faceAreas:Record<string,number>={},edgeLengths:Record<string,number>={};
 for(const e of s.edges)edgeLengths[e.id]=distance3(e.curve.start,e.curve.end);
 for(const f of s.faces){const p=faceVertices(s,f);let area=0;for(let i=1;i<p.length-1;i++){
  const cross=cross3(sub3(p[i],p[0]),sub3(p[i+1],p[0]));area+=dot3(cross,f.surface.normal)/2;
  const a=sub3(p[0],origin),b=sub3(p[i],origin),c=sub3(p[i+1],origin);const v=dot3(a,cross3(b,c))/6;volume+=v;cx+=v*(origin[0]+p[0][0]+p[i][0]+p[i+1][0])/4;cy+=v*(origin[1]+p[0][1]+p[i][1]+p[i+1][1])/4;cz+=v*(origin[2]+p[0][2]+p[i][2]+p[i+1][2])/4;
 }faceAreas[f.id]=area;surface+=area;}
 if(!Number.isFinite(volume)||volume<=s.tolerance.areaMetres2*s.tolerance.lengthMetres)throw new Error('Non-positive or numerically uncertain oriented volume');
 const axes=[0,1,2] as const;const min=axes.map(i=>Math.min(...s.vertices.map(v=>v.point[i]))) as unknown as Vec3;const max=axes.map(i=>Math.max(...s.vertices.map(v=>v.point[i]))) as unknown as Vec3;
 return {volumeMetres3:volume,surfaceAreaMetres2:surface,centroid:[cx/volume,cy/volume,cz/volume],bounds:{min,max},faceAreas,edgeLengths};
}
