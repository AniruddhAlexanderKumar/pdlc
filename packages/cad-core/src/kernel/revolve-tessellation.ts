import {cross3,dot3,sub3,type Vec3} from '../math.js';
import {evaluateRevolveCurve} from './revolve-geometry.js';
import {checkRevolution} from './revolve-validation.js';
import type {KernelResult} from './types.js';
import type {RevolvedSolid} from './revolve-types.js';

export type CurvedTriangle={faceId:string;points:readonly [Vec3,Vec3,Vec3];normals:readonly [Vec3,Vec3,Vec3]};
export type CurvedDisplayMesh={triangles:CurvedTriangle[];edges:{edgeId:string;points:Vec3[]}[];angularSegments:number};
export type TessellationOptions={linearDeflectionMetres:number;angularDeflectionRadians:number;maxSegments:number;maxTriangles:number;shouldCancel?:()=>boolean};
/** Conforming angle grid for the supported annular revolution. Never changes the B-rep. */
export function tessellateRevolution(s:RevolvedSolid,o:TessellationOptions):KernelResult<CurvedDisplayMesh>{
 try{
  const diag=checkRevolution(s);if(diag.length)return {ok:false,diagnostics:diag};const p=s.parameters;
  if(!Number.isFinite(o.linearDeflectionMetres)||o.linearDeflectionMetres<=0||!Number.isFinite(o.angularDeflectionRadians)||o.angularDeflectionRadians<=0||o.angularDeflectionRadians>Math.PI/2||!Number.isInteger(o.maxSegments)||o.maxSegments<3||o.maxSegments>4096||!Number.isInteger(o.maxTriangles)||o.maxTriangles<1||o.maxTriangles>100000)return {ok:false,diagnostics:[{code:'INVALID_QUALITY',message:'Invalid tessellation quality or resource limits'}]};
  const ratio=o.linearDeflectionMetres/p.outerRadius;const maxLinearAngle=ratio>=1?Math.PI:2*Math.acos(1-ratio);if(!Number.isFinite(maxLinearAngle)||maxLinearAngle<=0)return {ok:false,diagnostics:[{code:'QUALITY_UNCERTAIN',message:'Deflection is below representable precision'}]};
  const segments=Math.max(p.full?3:1,Math.ceil(Math.abs(p.sweep)/Math.min(maxLinearAngle,o.angularDeflectionRadians))),triCount=segments*8+(p.full?0:4);
  if(segments>o.maxSegments||triCount>o.maxTriangles)return {ok:false,diagnostics:[{code:'RESOURCE_LIMIT',message:'Requested quality exceeds tessellation limits'}]};
  const point=(r:number,y:number,i:number):Vec3=>{const t=p.full&&i===segments?0:i/segments,angle=p.startAngle+p.sweep*t;return [p.axisX+r*Math.cos(angle),y,-r*Math.sin(angle)];};
  const radial=(i:number,sign:number):Vec3=>{const t=p.full&&i===segments?0:i/segments,a=p.startAngle+p.sweep*t;return [sign*Math.cos(a),0,-sign*Math.sin(a)];};
  const faces=new Map(s.faces.map(f=>[f.provenance.role,f]));const triangles:CurvedTriangle[]=[];
  const emit=(faceId:string,points:readonly [Vec3,Vec3,Vec3],normals:readonly [Vec3,Vec3,Vec3])=>{const c=cross3(sub3(points[1],points[0]),sub3(points[2],points[0]));const avg=[normals[0][0]+normals[1][0]+normals[2][0],normals[0][1]+normals[1][1]+normals[2][1],normals[0][2]+normals[1][2]+normals[2][2]] as Vec3;if(dot3(c,avg)<=0)throw new Error('Triangle orientation mismatch');triangles.push({faceId,points,normals});};
  const quad=(faceId:string,points:[Vec3,Vec3,Vec3,Vec3],normals:[Vec3,Vec3,Vec3,Vec3],reverse:boolean)=>{
   if(reverse){points=[points[0],points[3],points[2],points[1]];normals=[normals[0],normals[3],normals[2],normals[1]];}
   emit(faceId,[points[0],points[1],points[2]],[normals[0],normals[1],normals[2]]);emit(faceId,[points[0],points[2],points[3]],[normals[0],normals[2],normals[3]]);
  };
  for(let i=0;i<segments;i++){
   if(o.shouldCancel?.())return {ok:false,diagnostics:[{code:'CANCELLED',message:'Tessellation cancelled'}]};
   for(const side of ['inner','outer'] as const){const r=side==='outer'?p.outerRadius:p.innerRadius,k=side==='outer'?1:-1,n0=radial(i,k),n1=radial(i+1,k);quad(faces.get(side)!.id,[point(r,p.axialMin,i),point(r,p.axialMin,i+1),point(r,p.axialMax,i+1),point(r,p.axialMax,i)],[n0,n1,n1,n0],Math.sign(p.sweep)*k<0);}
   for(const level of ['bottom','top'] as const){const y=level==='top'?p.axialMax:p.axialMin,n:Vec3=[0,level==='top'?1:-1,0];quad(faces.get(level)!.id,[point(p.innerRadius,y,i),point(p.outerRadius,y,i),point(p.outerRadius,y,i+1),point(p.innerRadius,y,i+1)],[n,n,n,n],Math.sign(p.sweep)*(level==='top'?1:-1)<0);}
  }
  if(!p.full)for(const end of ['start','end'] as const){const i=end==='start'?0:segments,a=p.startAngle+p.sweep*(end==='start'?0:1),direction=(end==='start'?-1:1)*Math.sign(p.sweep);const n:Vec3=[direction*-Math.sin(a),0,direction*-Math.cos(a)];quad(faces.get(`cut-${end}`)!.id,[point(p.innerRadius,p.axialMin,i),point(p.outerRadius,p.axialMin,i),point(p.outerRadius,p.axialMax,i),point(p.innerRadius,p.axialMax,i)],[n,n,n,n],(end==='start'?1:-1)*Math.sign(p.sweep)<0);}
  const displayEdges=s.edges.map(e=>{if(e.curve.kind==='circular-arc'){const c=e.curve;const pts=Array.from({length:segments+1},(_,i)=>evaluateRevolveCurve(c,p.full&&i===segments?0:i/segments));return {edgeId:e.id,points:pts};}return {edgeId:e.id,points:[evaluateRevolveCurve(e.curve,0),evaluateRevolveCurve(e.curve,1)]};});
  return {ok:true,value:{triangles,edges:displayEdges,angularSegments:segments}};
 }catch(e){return {ok:false,diagnostics:[{code:'TESSELLATION_UNCERTAIN',message:e instanceof Error?e.message:'Tessellation failed'}]};}
}
