import {add3,coordinate,finiteNumber,scale3,type Vec2,type Vec3} from '../math.js';
import {ellipsePoint} from './curves.js';
import type {PCurve,RevolveCurve,RevolveSurface} from './revolve-types.js';
/** All curve and pcurve parameters use the closed interval [0,1]. */
export function evaluateRevolveCurve(c:RevolveCurve,t:number):Vec3 {
 finiteNumber(t);if(t<0||t>1)throw new RangeError('Curve parameter out of range');
 if(c.kind==='segment'){const p=add3(c.start,scale3([c.end[0]-c.start[0],c.end[1]-c.start[1],c.end[2]-c.start[2]],t));p.forEach(coordinate);return p;}
 return ellipsePoint({kind:'ellipse',frame:c.frame,majorRadius:c.radius,minorRadius:c.radius},c.startAngle+c.sweep*t);
}
export function evaluatePCurve(c:PCurve,t:number):Vec2 {
 finiteNumber(t);if(t<0||t>1)throw new RangeError('pcurve parameter out of range');
 if(c.kind==='line')return [c.start[0]+t*(c.end[0]-c.start[0]),c.start[1]+t*(c.end[1]-c.start[1])];
 const a=c.startAngle+c.sweep*t;return [c.radius*Math.cos(a),c.radius*Math.sin(a)];
}
export function evaluateRevolveSurface(s:RevolveSurface,uv:Vec2):Vec3 {
 finiteNumber(uv[0]);finiteNumber(uv[1]);let p:Vec3;
 if(s.kind==='plane')p=add3(s.origin,add3(scale3(s.uAxis,uv[0]),scale3(s.vAxis,uv[1])));
 else {const a=s.startAngle+s.sweep*uv[0];p=add3(s.frame.origin,add3(scale3(s.frame.z,uv[1]),add3(scale3(s.frame.x,s.radius*Math.cos(a)),scale3(s.frame.y,s.radius*Math.sin(a)))));}
 p.forEach(coordinate);return p;
}
