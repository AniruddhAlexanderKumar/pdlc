import {add3,coordinate,cross3,dot3,finiteNumber,magnitude3,scale3,sub3,type Vec3} from '../math.js';
import {validFrame,type Frame3} from './geometry.js';

/** P(u,v)=O + z*v + radius(v)*(x*cos(u)+y*sin(u)). u is periodic, v is axial metres. */
export type RevolvedSurface={kind:'revolved-line';frame:Frame3;radiusAtZero:number;radiusSlope:number;axialRange:readonly [number,number]};
export function validateRevolvedSurface(s:RevolvedSurface):void {
 if(!s||s.kind!=='revolved-line'||!validFrame(s.frame))throw new RangeError('Invalid revolution frame');coordinate(s.radiusAtZero);finiteNumber(s.radiusSlope,'slope');
 const [a,b]=s.axialRange??[];coordinate(a);coordinate(b);if(a>=b)throw new RangeError('Invalid axial range');
 const r0=s.radiusAtZero+s.radiusSlope*a,r1=s.radiusAtZero+s.radiusSlope*b;coordinate(r0);coordinate(r1);if(Math.min(r0,r1)<=1e-10)throw new RangeError('Surface touches or crosses its axis');
}
export function surfacePoint(s:RevolvedSurface,u:number,v:number):Vec3 {
 validateRevolvedSurface(s);finiteNumber(u,'angle');finiteNumber(v,'axial parameter');if(v<s.axialRange[0]||v>s.axialRange[1])throw new RangeError('Surface parameter out of range');
 const r=s.radiusAtZero+s.radiusSlope*v,radial=add3(scale3(s.frame.x,Math.cos(u)),scale3(s.frame.y,Math.sin(u)));const p=add3(s.frame.origin,add3(scale3(s.frame.z,v),scale3(radial,r)));p.forEach(coordinate);return p;
}
export function surfaceDerivatives(s:RevolvedSurface,u:number,v:number):{du:Vec3;dv:Vec3} {
 validateRevolvedSurface(s);finiteNumber(u);finiteNumber(v);if(v<s.axialRange[0]||v>s.axialRange[1])throw new RangeError('Surface parameter out of range');const r=s.radiusAtZero+s.radiusSlope*v;
 return {du:add3(scale3(s.frame.x,-r*Math.sin(u)),scale3(s.frame.y,r*Math.cos(u))),dv:add3(s.frame.z,add3(scale3(s.frame.x,s.radiusSlope*Math.cos(u)),scale3(s.frame.y,s.radiusSlope*Math.sin(u))))};
}
/** The right-handed derivative order du × dv points radially outward for a cylinder. */
export function surfaceNormal(s:RevolvedSurface,u:number,v:number):Vec3 {const {du,dv}=surfaceDerivatives(s,u,v),n=cross3(du,dv),len=magnitude3(n);if(len<=1e-10)throw new RangeError('Singular surface');return scale3(n,1/len);}
/** Exact orthogonal projection onto a finite cylinder, returning boundary-clamped axial parameter. */
export function projectCylinder(s:RevolvedSurface,p:Vec3):{kind:'point';point:Vec3;u:number;v:number}|{kind:'ambiguous'} {
 validateRevolvedSurface(s);if(s.radiusSlope!==0)throw new RangeError('Projection currently supports cylinders only');const d=sub3(p,s.frame.origin),x=dot3(d,s.frame.x),y=dot3(d,s.frame.y),v=Math.max(s.axialRange[0],Math.min(s.axialRange[1],dot3(d,s.frame.z)));
 if(Math.hypot(x,y)<=Math.max(1e-10,s.radiusAtZero*1e-9))return {kind:'ambiguous'};const u=Math.atan2(y,x);return {kind:'point',point:surfacePoint(s,u,v),u,v};
}
