import {add3,coordinate,cross3,dot3,finiteNumber,magnitude3,scale3,sub3,type Vec3} from '../math.js';
import {validFrame,type Frame3} from './geometry.js';

/** The plane frame is orthonormal and right handed. Parameters are radians. */
export type Ellipse3={kind:'ellipse';frame:Frame3;majorRadius:number;minorRadius:number};
export type Arc3={kind:'elliptical-arc';ellipse:Ellipse3;startAngle:number;sweep:number};
export function validateEllipse(e:Ellipse3):void {
 if(!e||e.kind!=='ellipse'||!validFrame(e.frame))throw new RangeError('Invalid ellipse frame');
 coordinate(e.majorRadius);coordinate(e.minorRadius);if(e.majorRadius<=1e-10||e.minorRadius<=1e-10)throw new RangeError('Degenerate ellipse');
}
export function ellipsePoint(e:Ellipse3,t:number):Vec3 {
 validateEllipse(e);finiteNumber(t,'parameter');const p=add3(e.frame.origin,add3(scale3(e.frame.x,e.majorRadius*Math.cos(t)),scale3(e.frame.y,e.minorRadius*Math.sin(t))));p.forEach(coordinate);return p;
}
export function ellipseDerivative(e:Ellipse3,t:number):Vec3 {
 validateEllipse(e);finiteNumber(t,'parameter');return add3(scale3(e.frame.x,-e.majorRadius*Math.sin(t)),scale3(e.frame.y,e.minorRadius*Math.cos(t)));
}
export function ellipseTangent(e:Ellipse3,t:number):Vec3 {const d=ellipseDerivative(e,t),length=magnitude3(d);if(length<=1e-10)throw new RangeError('Degenerate tangent');return scale3(d,1/length);}
export function ellipseCurvature(e:Ellipse3,t:number):number {
 const d=ellipseDerivative(e,t),dd=add3(scale3(e.frame.x,-e.majorRadius*Math.cos(t)),scale3(e.frame.y,-e.minorRadius*Math.sin(t)));return magnitude3(cross3(d,dd))/magnitude3(d)**3;
}
export function arcPoint3(a:Arc3,t:number):Vec3 {
 finiteNumber(t,'parameter');finiteNumber(a.startAngle,'start angle');finiteNumber(a.sweep,'sweep');if(t<0||t>1||Math.abs(a.sweep)<=1e-12||Math.abs(a.sweep)>2*Math.PI)throw new RangeError('Invalid arc parameter or sweep');return ellipsePoint(a.ellipse,a.startAngle+t*a.sweep);
}
/** Exact circle projection when the point is off the circle axis; ambiguous on the axis. */
export function projectCircle(circle:Ellipse3,p:Vec3):{kind:'point';point:Vec3;parameter:number}|{kind:'ambiguous'} {
 validateEllipse(circle);if(circle.majorRadius!==circle.minorRadius)throw new RangeError('Projection currently supports circles only');const delta=sub3(p,circle.frame.origin),x=dot3(delta,circle.frame.x),y=dot3(delta,circle.frame.y);
 if(Math.hypot(x,y)<=Math.max(1e-10,circle.majorRadius*1e-9))return {kind:'ambiguous'};
 const parameter=Math.atan2(y,x);return {kind:'point',point:ellipsePoint(circle,parameter),parameter};
}
