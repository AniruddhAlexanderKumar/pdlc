import {add3,sub3,scale3,dot3,cross3,magnitude3,coordinate,finiteNumber,type Vec2,type Vec3} from '../math.js';
import type {Plane3,Segment3} from './types.js';
/** Plane is p = origin + u*x + v*y; axes are orthonormal and right-handed. */
export type Frame3={origin:Vec3;x:Vec3;y:Vec3;z:Vec3};
export const XY_FRAME:Frame3={origin:[0,0,0],x:[1,0,0],y:[0,1,0],z:[0,0,1]};
export function framePoint(frame:Frame3,p:Vec2,z=0):Vec3 {if(!validFrame(frame))throw new RangeError('Invalid frame');if(!Array.isArray(p)||p.length!==2)throw new RangeError('Invalid point');const result=add3(frame.origin,add3(scale3(frame.x,p[0]),add3(scale3(frame.y,p[1]),scale3(frame.z,z))));result.forEach(coordinate);return result;}
export function validFrame(f:Frame3,tolerance=1e-10):boolean {try{if(!Array.isArray(f.origin)||f.origin.length!==3)return false;f.origin.forEach(coordinate);for(const a of [f.x,f.y,f.z])if(Math.abs(magnitude3(a)-1)>tolerance)return false;return Math.abs(dot3(f.x,f.y))<=tolerance&&Math.abs(dot3(f.x,f.z))<=tolerance&&Math.abs(dot3(f.y,f.z))<=tolerance&&magnitude3(sub3(cross3(f.x,f.y),f.z))<=tolerance;}catch{return false}}
export function segmentPoint(segment:Segment3,t:number):Vec3 {finiteNumber(t);if(t<0||t>1)throw new RangeError('Segment parameter outside [0,1]');return add3(segment.start,scale3(sub3(segment.end,segment.start),t));}
export function projectOntoPlane(plane:Plane3,p:Vec3):Vec3 {const m=magnitude3(plane.normal);if(Math.abs(m-1)>1e-10)throw new RangeError('Plane normal must be unit length');return sub3(p,scale3(plane.normal,dot3(sub3(p,plane.origin),plane.normal)));}
