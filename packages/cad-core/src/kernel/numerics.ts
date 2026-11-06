import { coordinate, finiteNumber, LENGTH_EPSILON_METRES, type Vec2, type Vec3 } from '../math.js';
import type {ToleranceContext} from './types.js';
/** Adapted to model span and machine resolution; not an exact predicate. */
export function toleranceFor(points:readonly Vec3[]):ToleranceContext {
 if(points.length===0)throw new Error('No geometry');
 for(const p of points){if(p.length!==3)throw new Error('Invalid coordinate');p.forEach(coordinate);}
 const maxCoordinateMetres=Math.max(...points.flatMap(p=>p.map(Math.abs)));
 const scaleMetres=Math.max(...[0,1,2].map(i=>Math.max(...points.map(p=>p[i]))-Math.min(...points.map(p=>p[i]))));
 finiteNumber(scaleMetres);const lengthMetres=Math.max(LENGTH_EPSILON_METRES,scaleMetres*1e-9,maxCoordinateMetres*Number.EPSILON*32);
 return {scaleMetres,lengthMetres,areaMetres2:lengthMetres*Math.max(scaleMetres,lengthMetres),angularRadians:1e-10,maxCoordinateMetres};
}
export function orient2(a:Vec2,b:Vec2,c:Vec2):number {return (b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);}
export function signedArea2(p:readonly Vec2[]):number {const o=p[0];let sum=0;for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length];sum+=(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);}return sum/2;}
export function segmentConflict(a:Vec2,b:Vec2,c:Vec2,d:Vec2,tol:number):boolean {
 // Bounding-box separation is safe even for nearly collinear pairs. All other near-zero predicates fail closed.
 if(Math.max(a[0],b[0])+tol<Math.min(c[0],d[0])||Math.max(c[0],d[0])+tol<Math.min(a[0],b[0])||Math.max(a[1],b[1])+tol<Math.min(c[1],d[1])||Math.max(c[1],d[1])+tol<Math.min(a[1],b[1]))return false;
 const ab=Math.hypot(b[0]-a[0],b[1]-a[1]),cd=Math.hypot(d[0]-c[0],d[1]-c[1]);
 const x=orient2(a,b,c),y=orient2(a,b,d),z=orient2(c,d,a),w=orient2(c,d,b);
 if(Math.abs(x)<=tol*ab||Math.abs(y)<=tol*ab||Math.abs(z)<=tol*cd||Math.abs(w)<=tol*cd)return true;
 return (x>0)!==(y>0)&&(z>0)!==(w>0);
}
