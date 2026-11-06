import {cross3,dot3,sub3,type Vec2,type Vec3} from '../math.js';
import {orient2} from './numerics.js';
import {checkTopology,faceVertices} from './topology.js';
import type {KernelResult,Solid} from './types.js';

export type DisplayTriangle={faceId:string;points:readonly [Vec3,Vec3,Vec3];normal:Vec3};
export type DisplayEdge={edgeId:string;points:readonly [Vec3,Vec3]};
export type DisplayMesh={triangles:DisplayTriangle[];edges:DisplayEdge[]};
/** Planar polygon ear clipping, with each triangle and display edge mapped to its source topology. */
export function tessellatePlanar(s:Solid):KernelResult<DisplayMesh> {
 const diagnostics=checkTopology(s);if(diagnostics.length)return {ok:false,diagnostics};
 try{
  const triangles:DisplayTriangle[]=[];const edges=s.edges.map(e=>({edgeId:e.id,points:[e.curve.start,e.curve.end] as const}));
  for(const face of s.faces){const points=faceVertices(s,face),n=face.surface.normal;let axis=0;for(let i=1;i<3;i++)if(Math.abs(n[i])>Math.abs(n[axis]))axis=i;const sign=n[axis]>0?1:-1;
   const project=(p:Vec3):Vec2=>axis===0?[p[1],p[2]]:axis===1?[p[2],p[0]]:[p[0],p[1]];const p=points.map(project),remaining=p.map((_,i)=>i),areaTol=s.tolerance.areaMetres2;
   const emit=(a:number,b:number,c:number)=>{const pts=[points[a],points[b],points[c]] as const;const normalCheck=dot3(cross3(sub3(pts[1],pts[0]),sub3(pts[2],pts[0])),n);if(normalCheck<=areaTol)throw new Error(`Degenerate triangle on ${face.id}`);triangles.push({faceId:face.id,points:pts,normal:n});};
   while(remaining.length>3){let found=false;
    for(let j=0;j<remaining.length;j++){const a=remaining[(j+remaining.length-1)%remaining.length],b=remaining[j],c=remaining[(j+1)%remaining.length];if(sign*orient2(p[a],p[b],p[c])<=areaTol)continue;
     const blocked=remaining.some(k=>k!==a&&k!==b&&k!==c&&sign*orient2(p[a],p[b],p[k])>=-areaTol&&sign*orient2(p[b],p[c],p[k])>=-areaTol&&sign*orient2(p[c],p[a],p[k])>=-areaTol);if(blocked)continue;
     emit(a,b,c);remaining.splice(j,1);found=true;break;
    }if(!found)throw new Error(`Polygon is degenerate or numerically ambiguous on ${face.id}`);
   }emit(remaining[0],remaining[1],remaining[2]);
  }
  return {ok:true,value:{triangles,edges}};
 }catch(e){return {ok:false,diagnostics:[{code:'TESSELLATION_UNCERTAIN',message:e instanceof Error?e.message:'Tessellation failed'}]};}
}
